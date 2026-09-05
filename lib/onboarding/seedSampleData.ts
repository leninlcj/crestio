// Seed trial sample data for a freshly-onboarded tutor. Service-role only.
//
// Creates 5 sample students, 12 sessions across the past 30 days (3 with
// polished parent-facing notes), and 2 invoices (one paid, one pending).
//
// Notes on what's NOT seeded:
//   * Parent message threads — message_threads.parent_id requires a parents
//     row, which requires a real auth.users row. Standing up a fake auth
//     user pollutes auth.users + triggers organization creation. Out of
//     scope for activation. The user discovers messaging through the
//     existing parent invitation flow instead.
//
// Idempotency: caller checks profiles.has_sample_data before invoking.

import type { SupabaseClient } from '@supabase/supabase-js';

type SeedArgs = {
  admin: SupabaseClient;
  userId: string;
  organizationId: string;
};

type SampleStudent = {
  name: string;
  year_level: string;
  subject: string;
  parent_name: string;
  parent_email: string;
};

const SAMPLE_STUDENTS: SampleStudent[] = [
  { name: 'Sarah Chen',    year_level: 'Year 11', subject: 'English Advanced', parent_name: 'Mei Chen',      parent_email: 'mei.chen.sample@example.com' },
  { name: 'Diego Rivera',  year_level: 'Year 10', subject: 'Mathematics',      parent_name: 'Ana Rivera',    parent_email: 'ana.rivera.sample@example.com' },
  { name: 'Priya Patel',   year_level: 'Year 12', subject: 'Chemistry',        parent_name: 'Anil Patel',    parent_email: 'anil.patel.sample@example.com' },
  { name: 'James Wilson',  year_level: 'Year 9',  subject: 'Physics',          parent_name: 'Robert Wilson', parent_email: 'robert.wilson.sample@example.com' },
  { name: 'Yuki Tanaka',   year_level: 'Year 11', subject: 'Biology',          parent_name: 'Hana Tanaka',   parent_email: 'hana.tanaka.sample@example.com' },
];

// Realistic notes — written by hand to avoid AI sterility.
const POLISHED_NOTES: Record<string, string> = {
  'Sarah Chen': `Sarah came in with her annotations on "The Handmaid's Tale" already prepared, which made for a focused 75 minutes. We worked through the symbolism of the colour red across the novel, she identified four distinct functions and we built a paragraph that links two of them to the broader argument about female autonomy. Her topic sentence is sharp; the link sentences need more work to avoid restating the evidence.\n\nFor next session she's drafting an analytical paragraph on the Aunts as a control mechanism. She's also going to re-read chapters 23 and 24 and bring two quotes she wants to discuss.`,
  'Diego Rivera': `Diego is comfortable with linear equations now and we spent most of the hour on word problems involving rates and ratios. He gets the setup quickly but loses marks by skipping the units check at the end. We did three problems together with a deliberate pause after each to check units, and he caught his own mistake on the third one without prompting.\n\nHomework is exercises 5.3 questions 1-8 and one extension question I gave him about a recipe scaling problem. We'll move on to inequalities next week.`,
  'Priya Patel': `Strong session on equilibrium. Priya had trouble with Le Chatelier last week and we revisited it with a fresh approach, drawing the changes as graphs rather than memorising the rules. She immediately saw why increasing pressure shifts the equilibrium toward fewer moles of gas, and applied it correctly to two practice problems.\n\nThe area to watch is calculation-heavy questions where she rushes the algebra. We'll do a 30-minute drill at the start of next session focused only on Kc calculations.`,
};

export async function seedSampleData({ admin, userId, organizationId }: SeedArgs): Promise<{
  students: number;
  sessions: number;
  invoices: number;
}> {
  // 1) Students
  const studentRows = SAMPLE_STUDENTS.map((s) => ({
    owner_id: userId,
    organization_id: organizationId,
    name: s.name,
    year_level: s.year_level,
    subjects: [s.subject],
    parent_name: s.parent_name,
    parent_email: s.parent_email,
    hourly_rate_cents: 8500,
    is_sample: true,
  }));
  const { data: students, error: studentErr } = await admin
    .from('students').insert(studentRows).select('id, name');
  if (studentErr || !students) {
    console.error('[seedSampleData] student insert failed', studentErr);
    return { students: 0, sessions: 0, invoices: 0 };
  }

  // 2) Sessions (12 across past 30 days; 3 with polished notes)
  const sessionRows: any[] = [];
  let polishedCount = 0;
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    const student = students[i % students.length];
    const subject = SAMPLE_STUDENTS[i % SAMPLE_STUDENTS.length].subject;
    const daysAgo = Math.floor((i + 1) * 2.4);
    const scheduled = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    scheduled.setHours(16, 0, 0, 0);

    const polished = POLISHED_NOTES[student.name as string];
    const includePolished = polished && polishedCount < 3 && i % 4 === 0;
    if (includePolished) polishedCount++;

    sessionRows.push({
      owner_id: userId,
      organization_id: organizationId,
      student_id: student.id,
      tutor_user_id: userId,
      subject,
      scheduled_at: scheduled.toISOString(),
      duration_minutes: 60,
      status: 'completed',
      charge_rate_cents: 8500,
      notes_internal: includePolished
        ? `Worked through ${subject} content. ${student.name} is engaged and asking good questions.`
        : null,
      notes_parent_facing: includePolished ? polished : null,
      notes_polished_by_ai: !!includePolished,
      is_sample: true,
    });
  }
  const { error: sessionErr } = await admin.from('sessions').insert(sessionRows);
  if (sessionErr) console.error('[seedSampleData] session insert failed', sessionErr);

  // 3) Invoices: one paid 14 days ago ($240), one pending due in 5 days ($180)
  const sarah = students.find((s: any) => s.name === 'Sarah Chen');
  const diego = students.find((s: any) => s.name === 'Diego Rivera');
  const paidIssuedOn = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const paidDueOn = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pendingIssuedOn = new Date(now).toISOString().slice(0, 10);
  const pendingDueOn = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const invoiceRows: any[] = [];
  if (sarah) {
    invoiceRows.push({
      owner_id: userId,
      organization_id: organizationId,
      student_id: sarah.id,
      number: 'SAMPLE-001',
      issued_on: paidIssuedOn,
      due_on: paidDueOn,
      subtotal_cents: 24000,
      total_cents: 24000,
      status: 'paid',
      paid_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      is_sample: true,
    });
  }
  if (diego) {
    invoiceRows.push({
      owner_id: userId,
      organization_id: organizationId,
      student_id: diego.id,
      number: 'SAMPLE-002',
      issued_on: pendingIssuedOn,
      due_on: pendingDueOn,
      subtotal_cents: 18000,
      total_cents: 18000,
      status: 'sent',
      sent_at: new Date(now).toISOString(),
      is_sample: true,
    });
  }
  if (invoiceRows.length > 0) {
    const { error: invErr } = await admin.from('invoices').insert(invoiceRows);
    if (invErr) console.error('[seedSampleData] invoice insert failed', invErr);
  }

  // 4) Mark profile so we don't seed twice and so the banner renders.
  await admin.from('profiles').update({ has_sample_data: true }).eq('id', userId);

  return {
    students: students.length,
    sessions: sessionRows.length,
    invoices: invoiceRows.length,
  };
}

// Remove every sample row for the caller's organization. Idempotent.
export async function clearSampleData(args: SeedArgs): Promise<{
  students: number;
  sessions: number;
  invoices: number;
}> {
  const { admin, userId, organizationId } = args;

  // Sessions and invoices first (both reference students). They have their
  // own is_sample column so we don't depend on cascade ordering.
  const { data: deletedSessions } = await admin
    .from('sessions').delete()
    .eq('organization_id', organizationId).eq('is_sample', true)
    .select('id');
  const { data: deletedInvoices } = await admin
    .from('invoices').delete()
    .eq('organization_id', organizationId).eq('is_sample', true)
    .select('id');
  const { data: deletedStudents } = await admin
    .from('students').delete()
    .eq('organization_id', organizationId).eq('is_sample', true)
    .select('id');

  await admin.from('profiles').update({
    has_sample_data: false,
    sample_data_dismissed_at: new Date().toISOString(),
  }).eq('id', userId);

  return {
    students: deletedStudents?.length ?? 0,
    sessions: deletedSessions?.length ?? 0,
    invoices: deletedInvoices?.length ?? 0,
  };
}
