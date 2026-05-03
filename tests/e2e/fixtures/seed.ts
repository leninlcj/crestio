// E2E test seed. Idempotent. Creates an organization, owner profile, tutor
// profile, two students, one household, one parent. All rows are tagged with
// a `e2etest_<unix-ms>_` name prefix so cleanup() can wipe them by LIKE.
//
// HARD GUARD: refuses to run unless TEST_SUPABASE_URL is set, distinct from
// NEXT_PUBLIC_SUPABASE_URL, and not pointing at the Crestio prod project ref.
// Wiping production data would be catastrophic — there is no undo button.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Update this list whenever a new prod Supabase project ref is introduced.
// `ckpvuabqumphcunlytbq` is the ref used in the repo's vercel envs as of the
// extraction date — check `.env.vercel` if you suspect drift.
const KNOWN_PROD_REFS = [
  'ckpvuabqumphcunlytbq',
];

export type SeedHandle = {
  admin: SupabaseClient;
  prefix: string;
  organizationId: string;
  ownerUser: { id: string; email: string };
  tutorUser: { id: string; email: string };
  studentIds: string[];
  householdId: string;
  parentId: string;
  paymentToken: string;
};

function assertSafeEnv() {
  const url = process.env.TEST_SUPABASE_URL;
  const anon = process.env.TEST_SUPABASE_ANON_KEY;
  const service = process.env.TEST_SUPABASE_SERVICE_ROLE;
  if (!url) throw new Error('TEST_SUPABASE_URL is required to run e2e seed.');
  if (!anon) throw new Error('TEST_SUPABASE_ANON_KEY is required to run e2e seed.');
  if (!service) throw new Error('TEST_SUPABASE_SERVICE_ROLE is required to run e2e seed.');

  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (prodUrl && url === prodUrl) {
    throw new Error(
      'TEST_SUPABASE_URL equals NEXT_PUBLIC_SUPABASE_URL. Refusing to seed/cleanup against the same project as production.',
    );
  }

  for (const ref of KNOWN_PROD_REFS) {
    if (url.includes(ref)) {
      throw new Error(
        `TEST_SUPABASE_URL contains the known prod project ref "${ref}". Refusing to run.`,
      );
    }
  }
}

function adminClient(): SupabaseClient {
  return createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SERVICE_ROLE!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function seed(): Promise<SeedHandle> {
  assertSafeEnv();
  const admin = adminClient();
  const prefix = `e2etest_${Date.now()}_`;

  const ownerEmail = `${prefix}owner@example.com`;
  const tutorEmail = `${prefix}tutor@example.com`;
  const password = 'PlaywrightCanary!2026';

  // Owner auth user.
  const { data: ownerSignup, error: ownerErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
  });
  if (ownerErr || !ownerSignup.user) throw new Error(`owner signup failed: ${ownerErr?.message}`);

  // Tutor auth user.
  const { data: tutorSignup, error: tutorErr } = await admin.auth.admin.createUser({
    email: tutorEmail,
    password,
    email_confirm: true,
  });
  if (tutorErr || !tutorSignup.user) throw new Error(`tutor signup failed: ${tutorErr?.message}`);

  // Organization.
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name: `${prefix}org`,
      owner_user_id: ownerSignup.user.id,
      currency: 'AUD',
      onboarded: true,
    })
    .select('id')
    .single();
  if (orgErr || !org) throw new Error(`org insert failed: ${orgErr?.message}`);

  // Owner profile + membership.
  await admin.from('profiles').insert({
    id: ownerSignup.user.id,
    email: ownerEmail,
    organization_id: org.id,
    locale: 'en',
  });
  await admin.from('memberships').insert({
    user_id: ownerSignup.user.id,
    organization_id: org.id,
    role: 'owner',
  });

  // Tutor profile + membership.
  await admin.from('profiles').insert({
    id: tutorSignup.user.id,
    email: tutorEmail,
    organization_id: org.id,
    locale: 'en',
  });
  await admin.from('memberships').insert({
    user_id: tutorSignup.user.id,
    organization_id: org.id,
    role: 'tutor',
  });

  // Household.
  const { data: hh, error: hhErr } = await admin
    .from('households')
    .insert({
      name: `${prefix}household`,
      organization_id: org.id,
      preferred_currency: 'AUD',
    })
    .select('id')
    .single();
  if (hhErr || !hh) throw new Error(`household insert failed: ${hhErr?.message}`);

  // Parent.
  const { data: parent, error: parentErr } = await admin
    .from('parents')
    .insert({
      name: `${prefix}parent`,
      email: `${prefix}parent@example.com`,
      household_id: hh.id,
      organization_id: org.id,
    })
    .select('id')
    .single();
  if (parentErr || !parent) throw new Error(`parent insert failed: ${parentErr?.message}`);

  // Two students.
  const { data: students, error: stuErr } = await admin
    .from('students')
    .insert([
      { name: `${prefix}sam`, organization_id: org.id, household_id: hh.id, year_level: '10' },
      { name: `${prefix}alex`, organization_id: org.id, household_id: hh.id, year_level: '8' },
    ])
    .select('id');
  if (stuErr || !students) throw new Error(`students insert failed: ${stuErr?.message}`);

  // Pay-page token (random; the real flow generates one when an invoice
  // is sent — for fixture purposes we use a stable random token).
  const paymentToken = `${prefix}pay_${Math.random().toString(36).slice(2, 12)}`;

  return {
    admin,
    prefix,
    organizationId: org.id,
    ownerUser: { id: ownerSignup.user.id, email: ownerEmail },
    tutorUser: { id: tutorSignup.user.id, email: tutorEmail },
    studentIds: students.map((s: any) => s.id),
    householdId: hh.id,
    parentId: parent.id,
    paymentToken,
  };
}

// Wipe every row whose name/email starts with "e2etest_". Runs the deletes
// in dependency order: leaf-rows first, then parents/orgs, then auth users.
export async function cleanup(args?: { admin?: SupabaseClient; olderThanMs?: number }): Promise<void> {
  assertSafeEnv();
  const admin = args?.admin ?? adminClient();

  // sessions, charges, invoices reference org/student — delete by org name.
  const { data: orgs } = await admin
    .from('organizations')
    .select('id')
    .like('name', 'e2etest_%');
  const orgIds = ((orgs ?? []) as { id: string }[]).map((o) => o.id);

  if (orgIds.length > 0) {
    await admin.from('sessions').delete().in('organization_id', orgIds);
    await admin.from('charges').delete().in('organization_id', orgIds);
    await admin.from('invoices').delete().in('organization_id', orgIds);
    await admin.from('students').delete().in('organization_id', orgIds);
    await admin.from('parents').delete().in('organization_id', orgIds);
    await admin.from('households').delete().in('organization_id', orgIds);
    await admin.from('memberships').delete().in('organization_id', orgIds);
    await admin.from('profiles').delete().in('organization_id', orgIds);
    await admin.from('session_templates').delete().in('organization_id', orgIds);
    await admin.from('organizations').delete().in('id', orgIds);
  }

  // Auth users: list and delete those whose email starts with the prefix.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const e2eUsers = (list?.users ?? []).filter((u) => u.email?.startsWith('e2etest_'));
  for (const u of e2eUsers) {
    await admin.auth.admin.deleteUser(u.id);
  }
}
