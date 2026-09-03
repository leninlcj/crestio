import { test, expect } from '@playwright/test';

// Public signup is closed since the agency pivot: the page must explain that,
// and point to the three real doors (enquire, apply, sign in).
test.describe('auth — signup is invitation-only', () => {
  test('renders the closed notice with the three doors', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.getByRole('heading', { name: /no public sign-up/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('a[href="/enquire"]')).toBeVisible();
    await expect(page.locator('a[href="/tutors/apply"]')).toBeVisible();
    await expect(page.locator('a[href="/auth/signin"]').first()).toBeVisible();
  });

  test('is marked noindex', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('auth — signin page', () => {
  test('renders email + password fields and a submit button', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });
});
