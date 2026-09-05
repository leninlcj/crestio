// Prepaid credit for families (the household_credits ledger).
//
// How it works, end to end:
//   * A family buys a block of PREPAID_BLOCK.hours hours at PREPAID_BLOCK.discountPercent
//     off. That is an ordinary invoice with is_prepaid_block = true, paid through
//     the normal pay page. When it is marked paid (webhook, "mark paid", anywhere)
//     a database trigger adds the block's face value to the ledger.
//   * When a lesson invoice is issued (status 'sent'), the same triggers draw the
//     family's credit down against it. Fully covered invoices are marked paid
//     with total_cents = 0 and credit_applied_cents = what was used.
//   * Voids and refunds reverse through the ledger; nothing is ever deleted.
//   * Referral credit and manual adjustments are plain ledger rows.
//
// The pure helpers here are unit-tested; the async ones talk to Supabase with
// the service role and are used by the API routes and the daily cron.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AGENCY, PREPAID_BLOCK, REFERRAL } from './agency';
import { isMissingTableError } from './dbErrors';
import { generateInvoiceNumber, formatCentsDetailed } from './utils';

type Admin = SupabaseClient<any, any, any>;

export type CreditKind = 'purchase' | 'referral' | 'adjustment' | 'drawdown' | 'reversal';

export type CreditRow = {
  id: string;
  created_at: string;
  kind: CreditKind;
  amount_cents: number;
  invoice_id: string | null;
  note: string | null;
  invoice?: { number: string; status: string } | null;
};

export const CREDIT_KIND_LABEL: Record<CreditKind, string> = {
  purchase: 'Prepaid block',
  referral: 'Referral credit',
  adjustment: 'Adjustment',
  drawdown: 'Applied to invoice',
  reversal: 'Reversal',
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** What the family's credit is worth: hours times the student's hourly rate, in cents. */
export function blockFaceValueCents(rateCents: number, hours: number = PREPAID_BLOCK.hours): number {
  if (!Number.isFinite(rateCents) || rateCents <= 0 || !Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(rateCents * hours);
}

/** What the family pays for the block: the face value less the discount, in cents. */
export function blockPriceCents(faceValueCents: number, discountPercent: number = PREPAID_BLOCK.discountPercent): number {
  if (!Number.isFinite(faceValueCents) || faceValueCents <= 0) return 0;
  const pct = Math.min(Math.max(discountPercent, 0), 100);
  return Math.round((faceValueCents * (100 - pct)) / 100);
}

/** Whole lessons a balance still covers at a rate; 0 when the rate is unknown. */
export function lessonsCovered(balanceCents: number, rateCents: number | null | undefined, lessonMinutes = 60): number {
  if (!rateCents || rateCents <= 0 || balanceCents <= 0) return 0;
  const perLesson = Math.round((rateCents * lessonMinutes) / 60);
  return perLesson > 0 ? Math.floor(balanceCents / perLesson) : 0;
}

/** The line item and the note a prepaid block invoice carries. */
export function describePrepaidBlock(args: { hours: number; rateCents: number; discountPercent?: number; studentName?: string | null; currency?: string }): {
  lineItem: { description: string; qty: number; rate_cents: number; amount_cents: number };
  faceValueCents: number;
  priceCents: number;
  note: string;
} {
  const discount = args.discountPercent ?? PREPAID_BLOCK.discountPercent;
  const faceValueCents = blockFaceValueCents(args.rateCents, args.hours);
  const priceCents = blockPriceCents(faceValueCents, discount);
  const currency = args.currency ?? 'AUD';
  const who = args.studentName ? ` for ${args.studentName}` : '';
  const hoursLabel = `${args.hours} ${args.hours === 1 ? 'hour' : 'hours'}`;
  return {
    lineItem: {
      description: `Prepaid block${who}: ${hoursLabel} of lessons at ${formatCentsDetailed(args.rateCents, currency)} an hour, ${discount}% off`,
      qty: args.hours,
      rate_cents: Math.round(priceCents / args.hours),
      amount_cents: priceCents,
    },
    faceValueCents,
    priceCents,
    note: `This invoice buys ${formatCentsDetailed(faceValueCents, currency)} of lesson credit (${hoursLabel} at ${formatCentsDetailed(args.rateCents, currency)} an hour) for ${formatCentsDetailed(priceCents, currency)}, ${discount}% off. Once paid, each lesson is drawn from the credit and your invoices show what was used and what is left. Unused credit is refundable on request. ${AGENCY.name} holds prepaid amounts on the tutor's behalf until lessons are delivered.`,
  };
}

/** Sums a ledger. Exposed for the UI so the number on screen matches the rows shown. */
export function sumLedger(rows: ReadonlyArray<{ amount_cents: number }>): number {
  return rows.reduce((a, r) => a + (r.amount_cents ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Data access (service role)
// ---------------------------------------------------------------------------

export type HouseholdCredit = { balance_cents: number; ledger: CreditRow[]; setup_required: boolean };

export async function getHouseholdCredit(admin: Admin, householdId: string, limit = 200): Promise<HouseholdCredit> {
  const { data, error } = await admin
    .from('household_credits')
    .select('id, created_at, kind, amount_cents, invoice_id, note, invoice:invoices(number, status)')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error)) return { balance_cents: 0, ledger: [], setup_required: true };
    throw new Error(error.message);
  }
  const ledger = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    kind: r.kind as CreditKind,
    amount_cents: r.amount_cents,
    invoice_id: r.invoice_id ?? null,
    note: r.note ?? null,
    invoice: Array.isArray(r.invoice) ? (r.invoice[0] ?? null) : (r.invoice ?? null),
  })) as CreditRow[];
  // The balance is the sum of every row, not just the page shown.
  let balance = sumLedger(ledger);
  if (ledger.length >= limit) {
    const { data: all } = await admin.from('household_credits').select('amount_cents').eq('household_id', householdId);
    balance = sumLedger((all ?? []) as Array<{ amount_cents: number }>);
  }
  return { balance_cents: balance, ledger, setup_required: false };
}

/** Balances for many households at once (owner screens, the Monday check-in). */
export async function getHouseholdBalances(admin: Admin, householdIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (householdIds.length === 0) return out;
  const { data, error } = await admin
    .from('household_credits')
    .select('household_id, amount_cents')
    .in('household_id', householdIds);
  if (error) {
    if (isMissingTableError(error)) return out;
    throw new Error(error.message);
  }
  for (const r of (data ?? []) as Array<{ household_id: string; amount_cents: number }>) {
    out.set(r.household_id, (out.get(r.household_id) ?? 0) + r.amount_cents);
  }
  return out;
}

export async function addCreditAdjustment(admin: Admin, args: {
  organizationId: string;
  householdId: string;
  amountCents: number;
  note: string;
  kind?: 'adjustment' | 'referral';
  createdBy: string | null;
}): Promise<{ id: string }> {
  if (!Number.isInteger(args.amountCents) || args.amountCents === 0) throw new Error('Amount must be a whole number of cents and not zero.');
  const { data, error } = await admin
    .from('household_credits')
    .insert({
      organization_id: args.organizationId,
      household_id: args.householdId,
      kind: args.kind ?? 'adjustment',
      amount_cents: args.amountCents,
      note: args.note.trim().slice(0, 500) || null,
      created_by: args.createdBy,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not record the credit.');
  return { id: data.id as string };
}

/**
 * Creates a prepaid block invoice, issued (status 'sent') and payable at
 * /pay/[token]. The credit lands in the ledger when the invoice is paid.
 */
export async function createPrepaidBlockInvoice(admin: Admin, args: {
  organizationId: string;
  ownerUserId: string;
  householdId: string;
  studentId: string | null;
  studentName: string | null;
  rateCents: number;
  hours?: number;
  currency?: string;
  dueDays?: number;
}): Promise<{ id: string; number: string; payment_token: string | null; total_cents: number; face_value_cents: number }> {
  const hours = args.hours ?? PREPAID_BLOCK.hours;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 100) throw new Error('Hours must be between 1 and 100.');
  if (!Number.isFinite(args.rateCents) || args.rateCents <= 0) throw new Error('The student needs an hourly rate before a block can be sold.');
  const currency = args.currency ?? 'AUD';
  const block = describePrepaidBlock({ hours, rateCents: args.rateCents, studentName: args.studentName, currency });

  const { count } = await admin.from('invoices').select('*', { count: 'exact', head: true });
  const issued = new Date();
  const due = new Date(issued);
  due.setDate(due.getDate() + (args.dueDays ?? 7));

  const { data, error } = await admin
    .from('invoices')
    .insert({
      owner_id: args.ownerUserId,
      organization_id: args.organizationId,
      student_id: args.studentId,
      household_id: args.householdId,
      number: generateInvoiceNumber(count ?? 0),
      issued_on: issued.toISOString().slice(0, 10),
      due_on: due.toISOString().slice(0, 10),
      subtotal_cents: block.priceCents,
      total_cents: block.priceCents,
      status: 'sent',
      sent_at: issued.toISOString(),
      notes: block.note,
      is_prepaid_block: true,
      prepaid_face_value_cents: block.faceValueCents,
      prepaid_hours: hours,
      line_items: [block.lineItem],
    })
    .select('id, number, payment_token, total_cents')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the prepaid block invoice.');
  return {
    id: data.id as string,
    number: data.number as string,
    payment_token: (data.payment_token as string | null) ?? null,
    total_cents: data.total_cents as number,
    face_value_cents: block.faceValueCents,
  };
}

// ---------------------------------------------------------------------------
// Referral credit: the referring family is credited once the referred family
// has had REFERRAL.afterLessons completed lessons. Run daily by the cron.
// ---------------------------------------------------------------------------

export type ReferralCreditResult = { credited: Array<{ referrer_household_id: string; referred_household_id: string }>; setup_required: boolean };

export async function processReferralCredits(admin: Admin, organizationId: string): Promise<ReferralCreditResult> {
  const { data: referred, error } = await admin
    .from('households')
    .select('id, display_name, referred_by_household_id, referral_credited_at')
    .eq('organization_id', organizationId)
    .not('referred_by_household_id', 'is', null)
    .is('referral_credited_at', null)
    .is('archived_at', null);
  if (error) {
    if (isMissingTableError(error) || /column|schema cache/i.test(error.message)) return { credited: [], setup_required: true };
    throw new Error(error.message);
  }
  const credited: ReferralCreditResult['credited'] = [];
  for (const h of (referred ?? []) as any[]) {
    const { data: students } = await admin.from('students').select('id').eq('household_id', h.id);
    const ids = ((students ?? []) as any[]).map((s) => s.id);
    if (ids.length === 0) continue;
    const { count } = await admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .in('student_id', ids)
      .eq('status', 'completed')
      .is('deleted_at', null);
    if ((count ?? 0) < REFERRAL.afterLessons) continue;

    const { error: insErr } = await admin.from('household_credits').insert({
      organization_id: organizationId,
      household_id: h.referred_by_household_id,
      kind: 'referral',
      amount_cents: REFERRAL.creditCents,
      note: `Thank you for referring the ${h.display_name}`,
    });
    if (insErr) { console.error('[referral-credit] insert failed', insErr.message); continue; }
    await admin.from('households').update({ referral_credited_at: new Date().toISOString() }).eq('id', h.id);
    credited.push({ referrer_household_id: h.referred_by_household_id, referred_household_id: h.id });
  }
  return { credited, setup_required: false };
}
