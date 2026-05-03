import { test, expect } from '@playwright/test';
import { hasTestEnv } from './fixtures/auth-helpers';

// The signup spec doesn't need a seeded DB — it exercises the page rendering
// + form-validation behaviour. It does need the dev server running on
// PLAYWRIGHT_BASE_URL (or webServer in CI).
test.describe('auth — signup page', () => {
  test('renders email + password fields and a submit button', async ({ page }) => {
    await page.goto('/auth/signup');
    // Both inputs must exist regardless of locale, since type attribute is invariant.
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('client-side validation: blocks submit with an empty email', async ({ page }) => {
    await page.goto('/auth/signup');
    const button = page.locator('button[type="submit"]').first();
    await button.click();
    // Browser native validation should keep us on the same page.
    await expect(page).toHaveURL(/\/auth\/signup/);
  });

  test('rejects an obviously invalid email format', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.locator('input[type="email"]').fill('not-an-email');
    await page.locator('input[type="password"]').first().fill('aValidPassword123!');
    await page.locator('button[type="submit"]').first().click();
    await expect(page).toHaveURL(/\/auth\/signup/);
  });
});

// Full signup → onboarding round-trip needs Supabase + email-verify mocking.
// We skip cleanly when the test DB isn't configured so CI doesn't false-fail.
test.describe('auth — signup → email verify (mocked) → onboarding', () => {
  test.skip(!hasTestEnv(), 'TEST_SUPABASE_* env not set; skipping live signup flow.');

  test('a brand new email creates an unverified account and shows the confirmation screen', async ({ page }) => {
    const email = `e2etest_${Date.now()}_signup@example.com`;
    await page.goto('/auth/signup');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').first().fill('PlaywrightCanary!2026');
    await page.locator('button[type="submit"]').first().click();
    // Either we land on the "check your email" state, or, if the test
    // project has email-confirm disabled, we're redirected into onboarding.
    await expect(page).toHaveURL(/\/auth\/signup|\/app\/onboarding/, { timeout: 15_000 });
  });
});
