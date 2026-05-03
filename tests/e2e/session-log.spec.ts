import { test, expect } from '@playwright/test';
import { hasTestEnv, signInAsSeededUser } from './fixtures/auth-helpers';
import { seed, cleanup } from './fixtures/seed';

test.describe('session log + polish', () => {
  test.skip(!hasTestEnv(), 'TEST_SUPABASE_* env not set; skipping session-log e2e.');

  test.afterAll(async () => {
    await cleanup();
  });

  test('a tutor can land on the sessions page and see seeded students in the picker', async ({ page }) => {
    const handle = await seed();
    await signInAsSeededUser(page, handle.tutorUser.email, 'PlaywrightCanary!2026');

    // Insert a session row directly so we don't depend on a brittle multi-step
    // form interaction. The polish flow itself is unit-tested in
    // tests/unit/lib/polish-prompt.test.ts; this e2e test only confirms the
    // session appears in the tutor's list view.
    const studentId = handle.studentIds[0];
    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: inserted, error } = await handle.admin
      .from('sessions')
      .insert({
        organization_id: handle.organizationId,
        owner_id: handle.tutorUser.id,
        student_id: studentId,
        tutor_user_id: handle.tutorUser.id,
        subject: 'Maths',
        scheduled_at: scheduledAt,
        duration_minutes: 60,
        status: 'scheduled',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    expect(inserted?.id).toBeTruthy();

    await page.goto('/app/sessions');
    // The page is heavy — give it a generous timeout. Assertion is the
    // student name from seed (e2etest_...sam) appearing somewhere on screen.
    await expect(page.getByText(`${handle.prefix}sam`).first()).toBeVisible({ timeout: 15_000 });
  });
});
