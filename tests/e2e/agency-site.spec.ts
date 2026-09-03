import { test, expect } from '@playwright/test';

// The public agency site. No database needed: the API calls the forms make
// are intercepted so the client flow is tested deterministically.

test.describe('agency site — pages', () => {
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

test.describe('agency site — enquiry form', () => {
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

test.describe('agency site — tutor application', () => {
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
