import type { SupabaseClient } from '@supabase/supabase-js';
import { AGENCY, agencyInvoiceNote } from './agency';
import { formatCentsDetailed } from './utils';

// The disclosure printed on an invoice and the payment page under the
// introduction-agency model: who delivered the lessons, and how the amount
// splits between the tutor's fee and Crestio's service fee. Used by
// pages/api/invoices/[id]/pdf.ts and pages/api/pay/[token]/index.ts.
//
// The split is computed from the sessions on the invoice: each session
// carries the tutor's pay rate at the time it was logged. When the founder
// taught the lessons himself there is no introduced tutor and no split.

type Admin = SupabaseClient<any, any, any>;

type Args = {
  invoiceId: string;
  studentId: string | null;
  ownerUserId: string;
  /** The lesson value on the invoice (subtotal), before any prepaid credit was applied. */
  totalCents: number;
  currency: string;
  isPrepaidBlock?: boolean;
  prepaidHours?: number | null;
};

type SessionRow = { id: string; duration_minutes: number | null; pay_rate_cents: number | null; tutor_id: string | null };

export async function buildAgencyInvoiceNote(admin: Admin, args: Args): Promise<string> {
  // A prepaid block buys credit; the tutor fee split is shown on the lesson
  // invoices the credit later pays for.
  if (args.isPrepaidBlock) {
    const hours = args.prepaidHours != null && args.prepaidHours > 0 ? `${args.prepaidHours} ${args.prepaidHours === 1 ? 'hour' : 'hours'} of` : '';
    return `This invoice buys ${hours ? `${hours} ` : ''}prepaid lesson credit. ${AGENCY.name} holds the amount on the tutor's behalf until each lesson is delivered; every lesson invoice paid from the credit shows the tutor's fee and ${AGENCY.name}'s service fee. Unused credit is refundable on request. Questions: ${AGENCY.email}.`;
  }

  // Sessions linked to this invoice, through invoice_sessions or sessions.invoice_id.
  const ids = new Set<string>();
  const { data: links } = await admin.from('invoice_sessions').select('session_id').eq('invoice_id', args.invoiceId);
  for (const l of (links ?? []) as Array<{ session_id: string }>) if (l.session_id) ids.add(l.session_id);
  const { data: direct } = await admin.from('sessions').select('id').eq('invoice_id', args.invoiceId);
  for (const s of (direct ?? []) as Array<{ id: string }>) ids.add(s.id);

  let sessions: SessionRow[] = [];
  if (ids.size > 0) {
    const { data } = await admin.from('sessions').select('id, duration_minutes, pay_rate_cents, tutor_id').in('id', Array.from(ids));
    sessions = (data ?? []) as SessionRow[];
  }

  // Which tutor: the sessions' tutor when they agree, else the student's primary tutor.
  const tutorIds = new Set(sessions.map((s) => s.tutor_id).filter((t): t is string => !!t));
  let tutorId: string | null = tutorIds.size === 1 ? Array.from(tutorIds)[0] : null;
  if (!tutorId && tutorIds.size === 0 && args.studentId) {
    const { data: st } = await admin.from('students').select('primary_tutor_id').eq('id', args.studentId).maybeSingle();
    tutorId = (st as { primary_tutor_id?: string | null } | null)?.primary_tutor_id ?? null;
  }

  let tutorName: string | null = null;
  let tutorIsOwner = false;
  if (tutorId) {
    const { data: tu } = await admin.from('tutors').select('name, auth_user_id').eq('id', tutorId).maybeSingle();
    const t = tu as { name?: string | null; auth_user_id?: string | null } | null;
    tutorName = t?.name ?? null;
    tutorIsOwner = !!t?.auth_user_id && t.auth_user_id === args.ownerUserId;
  }

  // Lessons taught by the founder: no introduced tutor, no split.
  if (tutorIsOwner || (!tutorId && sessions.length > 0 && sessions.every((s) => !s.pay_rate_cents))) {
    return `Tutoring on this invoice was provided directly by ${AGENCY.name} (${AGENCY.founder.name}). Questions: ${AGENCY.email}.`;
  }

  const base = agencyInvoiceNote(tutorName);
  const priced = sessions.filter((s) => (s.pay_rate_cents ?? 0) > 0 && (s.duration_minutes ?? 0) > 0);
  if (sessions.length === 0 || priced.length !== sessions.length || tutorIds.size > 1) return base;

  const tutorFee = priced.reduce((sum, s) => sum + Math.round(((s.pay_rate_cents as number) * (s.duration_minutes as number)) / 60), 0);
  if (tutorFee <= 0 || tutorFee >= args.totalCents) return base;
  const serviceFee = args.totalCents - tutorFee;
  const who = tutorName ? `${tutorName}'s fee` : "the tutor's fee";
  return `${base} Of the ${formatCentsDetailed(args.totalCents, args.currency)} on this invoice, ${formatCentsDetailed(tutorFee, args.currency)} is ${who} and ${formatCentsDetailed(serviceFee, args.currency)} is ${AGENCY.name}'s service fee.`;
}
