import { test, expect } from '@playwright/test';
import path from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { hasTestEnv, signInAsSeededUser } from './fixtures/auth-helpers';
import { seed, cleanup } from './fixtures/seed';

test.describe('csv import — students', () => {
  test.skip(!hasTestEnv(), 'TEST_SUPABASE_* env not set; skipping csv-import e2e.');

  test.afterAll(async () => {
    await cleanup();
  });

  test('upload → preview screen renders auto-mapped columns', async ({ page }) => {
    const handle = await seed();
    await signInAsSeededUser(page, handle.ownerUser.email, 'PlaywrightCanary!2026');

    // Tiny CSV with a header row that should auto-map to name + year_level.
    const dir = mkdtempSync(path.join(tmpdir(), 'crestio-e2e-'));
    const csvPath = path.join(dir, 'students.csv');
    writeFileSync(
      csvPath,
      'Student Name,Year,Subjects\n' +
        `${handle.prefix}imported_one,9,Maths/English\n` +
        `${handle.prefix}imported_two,11,Physics\n`,
    );

    await page.goto('/app/students/import');
    await page.locator('input[type="file"]').setInputFiles(csvPath);

    // After upload, the preview should show the imported student names.
    await expect(page.getByText(`${handle.prefix}imported_one`).first()).toBeVisible({ timeout: 15_000 });
  });

  test('soft-deleted students are hidden from the default list view', async ({ page }) => {
    const handle = await seed();
    await signInAsSeededUser(page, handle.ownerUser.email, 'PlaywrightCanary!2026');

    // Soft-delete one of the seeded students directly.
    const studentId = handle.studentIds[0];
    await handle.admin
      .from('students')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', studentId);

    await page.goto('/app/students');
    // The remaining seeded student must still be visible.
    await expect(page.getByText(`${handle.prefix}alex`).first()).toBeVisible({ timeout: 15_000 });
    // The soft-deleted one must NOT be on the page.
    await expect(page.getByText(`${handle.prefix}sam`)).toHaveCount(0);
  });
});
