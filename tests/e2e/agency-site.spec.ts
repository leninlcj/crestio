import { test, expect } from '@playwright/test';

// The public agency site. No database needed: the API calls the forms make
// are intercepted so the client flow is tested deterministically.

test.describe('agency site: pages', () => {
  test('home renders the hero, rate card and enquiry CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/right tutor/i);
    await expect(page.locator('main')).toContainText('$80');
    await expect(page.locator('main')).toContainText('$125');
    await expect(page.locator('a[href="/enquire"]').first()).toBeVisible();
    // No fabricated social proof.
    await expect(page.locator('main')).not.toContainText(/\d+\+ (tutors|families|students)/);
  });

  test('every nav destination renders a heading', async ({ page }) => {
    for (const path of ['/how-it-works', '/maths-tutoring', '/physics-tutoring', '/pricing', '/tutors', '/faq', '/about', '/contact', '/tutors/apply', '/enquire']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible();
    }
  });

  test('old SaaS URLs redirect permanently', async ({ request }) => {
    for (const [from, to] of [['/for/solo', '/tutors'], ['/roadmap', '/about'], ['/compare/teachworks', '/'], ['/acceptable-use', '/terms']]) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(res.headers()['location'], from).toBe(to);
    }
  });

  test('rendered pages carry no em dashes, badges or emoji', async ({ request }) => {
    for (const path of ['/', '/how-it-works', '/maths-tutoring', '/physics-tutoring', '/pricing', '/tutors', '/tutors/apply', '/tutors/agreement', '/faq', '/about', '/contact', '/enquire', '/privacy', '/terms', '/cookies', '/child-safe', '/report', '/auth/signin', '/auth/signup']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      const html = await res.text();
      expect(html, `${path} contains an em dash`).not.toContain('\u2014');
      expect(html, `${path} contains a badge`).not.toMatch(/made with|built with|powered by/i);
      expect(html, `${path} contains emoji`).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  test('favicon, manifest and PNG Open Graph image are served', async ({ request }) => {
    const ico = await request.get('/favicon.ico');
    expect(ico.status()).toBe(200);
    expect(ico.headers()['content-type']).toMatch(/icon/);
    const svg = await request.get('/favicon.svg');
    expect(svg.status()).toBe(200);
    const manifest = await request.get('/manifest.json');
    expect(manifest.status()).toBe(200);
    expect(await manifest.text()).toContain('Crestio Tutoring');
    const og = await request.get('/api/og?type=marketing&title=Test');
    expect(og.status()).toBe(200);
    expect(og.headers()['content-type']).toContain('image/png');
    const bad = await request.get('/api/og?type=nope');
    expect(bad.status()).toBe(400);
  });

  test('every public page sets a description, canonical URL and absolute og:image', async ({ request }) => {
    for (const path of ['/', '/pricing', '/privacy', '/terms', '/cookies']) {
      const html = await (await request.get(path)).text();
      expect(html, path).toMatch(/<meta name="description" content="[^"]{40,}"/);
      expect(html, path).toContain(`<link rel="canonical" href="https://crestio.ai${path === '/' ? '' : path}"`);
      expect(html, path).toMatch(/<meta property="og:image" content="https:\/\/crestio\.ai\/api\/og\?/);
      expect(html, path).toContain('<link rel="icon" href="/favicon.ico"');
    }
  });

  test('sitemap lists the agency pages only', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<loc>https://crestio.ai/maths-tutoring</loc>');
    expect(xml).toContain('<loc>https://crestio.ai/enquire</loc>');
    expect(xml).not.toContain('/for/');
    expect(xml).not.toContain('/compare/');
  });
});

test.describe('agency site: enquiry form', () => {
  test('walks all six steps, validates, and shows the success state', async ({ page }) => {
    await page.route('**/api/enquiries', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'test' }) }));
    await page.goto('/enquire');
    const next = () => page.getByRole('button', { name: 'Continue →' }).click();

    await next();
    await expect(page.getByText('Choose one.')).toBeVisible();
    await page.getByRole('button', { name: 'My child' }).click();
    await next();

    await page.getByRole('button', { name: 'Year 11' }).click();
    await next();

    await expect(page.getByRole('button', { name: /Physics/ })).toBeVisible();
    await page.getByRole('button', { name: /Physics/ }).click();
    await next();

    await page.getByRole('button', { name: 'In-home' }).click();
    await next();
    await expect(page.getByText(/Tell us the suburb/)).toBeVisible();
    await page.fill('#enq-suburb', 'Hurstville');
    await next();

    await next(); // focus is optional

    await page.getByRole('button', { name: 'Send enquiry →' }).click();
    await expect(page.getByText('Enter your name.')).toBeVisible();
    await page.fill('#enq-name', 'Priya Nair');
    await page.fill('#enq-email', 'priya@example.com');
    await page.getByRole('button', { name: 'Send enquiry →' }).click();
    await expect(page.getByRole('status')).toContainText(/Thanks, Priya/);
  });

  test('surfaces server-side field errors on the right step', async ({ page }) => {
    await page.route('**/api/enquiries', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Check the highlighted fields.', fields: { phone: 'Enter a valid phone number.' } }) }));
    await page.goto('/enquire?year=Year%209&subject=maths_7_10');
    const next = () => page.getByRole('button', { name: 'Continue →' }).click();
    await page.getByRole('button', { name: 'Me', exact: true }).click();
    await next(); await next(); await next();
    await page.getByRole('button', { name: 'Online' }).click();
    await next(); await next();
    await page.fill('#enq-name', 'Sam');
    await page.fill('#enq-email', 'sam@example.com');
    await page.fill('#enq-phone', '12');
    await page.getByRole('button', { name: 'Send enquiry →' }).click();
    await expect(page.getByText('Enter a valid phone number.')).toBeVisible();
    await expect(page.getByText('Check the highlighted fields.')).toBeVisible();
  });
});

test.describe('agency site: tutor application', () => {
  test('validates required fields then submits', async ({ page }) => {
    await page.route('**/api/tutor-applications', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'test' }) }));
    await page.goto('/tutors/apply');
    await page.getByRole('button', { name: 'Send application →' }).click();
    await expect(page.getByText('Enter your full name.')).toBeVisible();
    await expect(page.getByText(/Working With Children Check\./)).toBeVisible();

    await page.fill('#ta-name', 'Sam Lee');
    await page.fill('#ta-email', 'sam@example.com');
    await page.fill('#ta-phone', '0400 000 000');
    await page.fill('#ta-suburb', 'Kogarah');
    await page.getByRole('button', { name: /Mathematics Extension 1/ }).click();
    await page.fill('#ta-quals', 'ATAR 97. Ext 1 94.');
    await page.getByRole('button', { name: 'Yes, current' }).click();
    await page.getByRole('button', { name: 'Both' }).click();
    await page.getByRole('button', { name: 'Send application →' }).click();
    await expect(page.getByRole('status')).toContainText(/Thanks, Sam/);
  });
});

test.describe('agency site: chunk 2 pages', () => {
  test('tutor agreement, child safe policy and report pages render', async ({ page }) => {
    for (const [path, heading] of [['/tutors/agreement', /agree to when you tutor/i], ['/child-safe', /child safe policy/i], ['/report', /report a concern/i]] as Array<[string, RegExp]>) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1 }), path).toContainText(heading);
    }
    await page.goto('/tutors/agreement');
    await expect(page.locator('main')).toContainText('appoint Crestio as your non-exclusive agent');
  });

  test('report form validates then submits', async ({ page }) => {
    await page.route('**/api/incidents', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'test', stored: true }) }));
    await page.goto('/report');
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText('Choose what this is about.')).toBeVisible();
    await page.getByRole('button', { name: /A tutor's conduct/ }).click();
    await page.fill('#rp-desc', 'The tutor was 40 minutes late to two lessons in a row.');
    await page.fill('#rp-name', 'Priya Nair');
    await page.fill('#rp-email', 'priya@example.com');
    await page.getByRole('button', { name: 'A parent' }).click();
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('status')).toContainText(/Thank you for telling us/);
  });
});
