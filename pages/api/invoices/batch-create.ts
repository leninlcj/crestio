import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getMembershipForUser } from '../../../lib/membership';
import { checkRateLimit } from '../../../lib/rateLimit';
import { createNotification } from '../../../lib/notifications';
import { generateInvoiceNumber } from '../../../lib/utils';

type HouseholdInput = {
  household_id: string;
  note?: string | null;
  included_session_ids: string[];
  rate_overrides?: Record<string, number>;
};

// POST /api/invoices/batch-create
// Body: { period_start, period_end, households: HouseholdInput[], mode: 'draft'|'send' }
// Creates one invoice per household covering its included sessions, with line
// items recorded in invoice_sessions. All-or-nothing per request.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated.' });
  const userId = userData.user.id;

  const membership = await getMembershipForUser(userClient, userId);
  if (!membership) return res.status(403).json({ error: 'No organization membership.' });

  // Per-user rate limit: 20 batch calls / hour.
  const rl = checkRateLimit({
    key: `batch_invoices:${userId}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return res.status(429).json({ error: 'rate_limit', retry_after_seconds: rl.retry_after_seconds });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const periodStart = typeof body.period_start === 'string' ? body.period_start : '';
  const periodEnd = typeof body.period_end === 'string' ? body.period_end : '';
  const mode = body.mode === 'send' ? 'send' : 'draft';
  const households = Array.isArray(body.households) ? (body.households as HouseholdInput[]) : [];
  const dueDays = typeof body.due_days === 'number' ? body.due_days : 14;

  if (!periodStart || !periodEnd) {
    return res.status(400).json({ error: 'period_start and period_end required.' });
  }
  if (households.length === 0) {
    return res.status(400).json({ error: 'households must be non-empty.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Pre-flight validation: every session must be completed, in this org,
  // unbilled (no invoice_id, no invoice_sessions row), within the period, and
  // a member of the named household.
  const allSessionIds = households.flatMap((h) => h.included_session_ids ?? []);
  if (allSessionIds.length === 0) {
    return res.status(400).json({ error: 'No sessions selected.' });
  }
  const uniqueIds = Array.from(new Set(allSessionIds));
  if (uniqueIds.length !== allSessionIds.length) {
    return res.status(400).json({ error: 'Duplicate session IDs in request.' });
  }

  const { data: sessionRows, error: sErr } = await admin
    .from('sessions')
    .select('id, status, organization_id, tutor_user_id, invoice_id, scheduled_at, duration_minutes, subject, topic, student_id, charge_rate_cents, late_cancellation, cancellation_waived, student:students!inner(id, name, hourly_rate_cents, household_id)')
    .in('id', uniqueIds);
  if (sErr) return res.status(500).json({ error: sErr.message });
  if (!sessionRows || sessionRows.length !== uniqueIds.length) {
    return res.status(400).json({ error: 'Some sessions were not found.' });
  }

  const startMs = new Date(periodStart).getTime();
  const endMs = new Date(periodEnd).getTime();

  for (const s of sessionRows as any[]) {
    if (s.organization_id !== membership.organization_id) {
      return res.status(403).json({ error: 'Some sessions are not in your organization.' });
    }
    const chargeableLateCancel = s.status === 'cancelled' && s.late_cancellation === true && s.cancellation_waived !== true;
    if (s.status !== 'completed' && !chargeableLateCancel) {
      return res.status(400).json({ error: `Session ${s.id} is not completed.` });
    }
    if (s.invoice_id) {
      return res.status(400).json({ error: `Session ${s.id} is already on invoice ${s.invoice_id}.` });
    }
    if (membership.role === 'tutor' && s.tutor_user_id !== userId) {
      return res.status(403).json({ error: 'You can only invoice sessions you taught.' });
    }
    const ts = new Date(s.scheduled_at).getTime();
    if (ts < startMs || ts >= endMs) {
      return res.status(400).json({ error: `Session ${s.id} is outside the period.` });
    }
  }

  // Check invoice_sessions for any sessions already batch-invoiced (race safety).
  const { data: already } = await admin
    .from('invoice_sessions')
    .select('session_id')
    .in('session_id', uniqueIds);
  if ((already ?? []).length > 0) {
    return res.status(400).json({ error: 'Some sessions are already on a batch invoice.' });
  }

  // Map each session to its household_id and verify the request matches.
  const sessionByHousehold = new Map<string, string[]>();
  const sessionMap = new Map<string, any>();
  for (const s of sessionRows as any[]) {
    sessionMap.set(s.id, s);
    const hh = s.student?.household_id;
    if (!hh) {
      return res.status(400).json({ error: `Session ${s.id} belongs to an ungrouped student.` });
    }
  }

  for (const h of households) {
    if (!h.household_id) {
      return res.status(400).json({ error: 'household_id required on each household.' });
    }
    if (!Array.isArray(h.included_session_ids) || h.included_session_ids.length === 0) {
      return res.status(400).json({ error: 'included_session_ids must be non-empty.' });
    }
    for (const sid of h.included_session_ids) {
      const s = sessionMap.get(sid);
      if (!s) {
        return res.status(400).json({ error: `Session ${sid} not found in preflight.` });
      }
      if (s.student?.household_id !== h.household_id) {
        return res.status(400).json({ error: `Session ${sid} does not belong to household ${h.household_id}.` });
      }
    }
  }

  // Household metadata (display name + primary parent auth_user_id).
  const householdIds = households.map((h) => h.household_id);
  const { data: householdMeta } = await admin
    .from('households')
    .select('id, display_name, organization_id, archived_at')
    .in('id', householdIds);
  for (const h of (householdMeta ?? []) as any[]) {
    if (h.organization_id !== membership.organization_id) {
      return res.status(403).json({ error: 'Household not in your organization.' });
    }
    if (h.archived_at) {
      return res.status(400).json({ error: `Household ${h.display_name} is archived.` });
    }
  }
  const householdById = new Map<string, any>();
  for (const h of (householdMeta ?? []) as any[]) householdById.set(h.id, h);

  const { data: primaryParentRows } = await admin
    .from('household_parents')
    .select('household_id, parent:parents!inner(id, auth_user_id, name, email)')
    .in('household_id', householdIds)
    .eq('is_primary', true);
  const primaryParentByHousehold = new Map<string, any>();
  for (const row of (primaryParentRows ?? []) as any[]) {
    primaryParentByHousehold.set(row.household_id, row.parent);
  }

  // Monotonic starting number. One bump per invoice below.
  const { count: existingCount } = await admin
    .from('invoices')
    .select('*', { count: 'exact', head: true });

  const issuedDate = new Date().toISOString().slice(0, 10);
  const dueDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (Number.isFinite(dueDays) ? dueDays : 14));
    return d.toISOString().slice(0, 10);
  })();

  // --- Create invoices + invoice_sessions atomically-ish ---
  // Supabase doesn't expose transactions; if something fails partway we roll
  // back the rows we created so far via DELETE.
  const created: Array<{ id: string; household_id: string; total_cents: number; number: string; session_count: number }> = [];
  let runningNumber = existingCount ?? 0;

  try {
    for (const h of households) {
      const lineItems = h.included_session_ids.map((sid) => {
        const s = sessionMap.get(sid);
        const rate = (h.rate_overrides && typeof h.rate_overrides[sid] === 'number')
          ? h.rate_overrides[sid]
          : (s.charge_rate_cents ?? s.student?.hourly_rate_cents ?? 0);
        if (!rate || rate <= 0) {
          throw new Error(`Session ${sid} has no rate.`);
        }
        const amount = Math.round((rate * s.duration_minutes) / 60);
        const parts = [
          new Date(s.scheduled_at).toLocaleDateString('en-AU', {
            day: 'numeric', month: 'short',
          }),
          s.student?.name ?? 'Session',
          s.subject ?? null,
          s.topic ?? null,
          `${s.duration_minutes} min`,
          s.status === 'cancelled' && s.late_cancellation ? 'Late cancellation (under 24h notice)' : null,
        ].filter(Boolean);
        return {
          session_id: sid,
          student_id: s.student_id,
          hourly_rate_cents: rate,
          duration_minutes: s.duration_minutes,
          amount_cents: amount,
          line_item_description: parts.join(' · '),
        };
      });

      const subtotal = lineItems.reduce((a, l) => a + l.amount_cents, 0);
      runningNumber += 1;
      const invoiceNumber = generateInvoiceNumber(runningNumber);
      const householdName = householdById.get(h.household_id)?.display_name ?? 'Household';

      const { data: invoice, error: invErr } = await admin
        .from('invoices')
        .insert({
          owner_id: userId,
          organization_id: membership.organization_id,
          student_id: null,
          household_id: h.household_id,
          number: invoiceNumber,
          issued_on: issuedDate,
          due_on: dueDate,
          subtotal_cents: subtotal,
          total_cents: subtotal,
          status: mode === 'send' ? 'sent' : 'draft',
          notes: h.note?.trim() || null,
          billing_period_start: periodStart.slice(0, 10),
          billing_period_end: periodEnd.slice(0, 10),
          is_batch_generated: true,
          sent_at: mode === 'send' ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (invErr || !invoice) {
        throw new Error(invErr?.message ?? 'Invoice insert failed.');
      }

      const { error: lineErr } = await admin
        .from('invoice_sessions')
        .insert(
          lineItems.map((l) => ({
            invoice_id: invoice.id,
            session_id: l.session_id,
            student_id: l.student_id,
            hourly_rate_cents: l.hourly_rate_cents,
            duration_minutes: l.duration_minutes,
            amount_cents: l.amount_cents,
            line_item_description: l.line_item_description,
          })),
        );
      if (lineErr) {
        // Roll back this invoice row before throwing.
        await admin.from('invoices').delete().eq('id', invoice.id);
        throw new Error(`Invoice line items: ${lineErr.message}`);
      }

      created.push({
        id: invoice.id,
        household_id: h.household_id,
        total_cents: subtotal,
        number: invoiceNumber,
        session_count: lineItems.length,
      });

      // Notify primary parent when sending. Best-effort; don't fail the
      // whole batch if a single notification errors.
      if (mode === 'send') {
        const primary = primaryParentByHousehold.get(h.household_id);
        if (primary?.auth_user_id) {
          try {
            await createNotification(admin, {
              userId: primary.auth_user_id,
              type: 'invoice_sent',
              titleKey: 'invoice_sent.title',
              bodyKey: 'invoice_sent.body',
              templateVars: {
                number: invoiceNumber,
                student_or_household: householdName,
                session_count: lineItems.length,
                count_suffix: lineItems.length === 1 ? '' : 's',
                amount: formatCents(subtotal),
              },
              linkUrl: `/parent/invoices`,
              context: { invoice_id: invoice.id, household_id: h.household_id },
              dedupeKey: `invoice_sent:${invoice.id}`,
            });
          } catch (e) {
            console.error('[batch-create] notification failed', e);
          }
        }
      }
    }
  } catch (e: any) {
    // Roll back everything we successfully wrote in this call.
    if (created.length > 0) {
      const ids = created.map((c) => c.id);
      await admin.from('invoice_sessions').delete().in('invoice_id', ids);
      await admin.from('invoices').delete().in('id', ids);
    }
    return res.status(500).json({ error: e?.message ?? 'Batch create failed.' });
  }

  return res.status(200).json({
    ok: true,
    mode,
    invoices: created,
    total_cents: created.reduce((a, c) => a + c.total_cents, 0),
  });
}

function formatCents(c: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    maximumFractionDigits: c % 100 === 0 ? 0 : 2,
  }).format(c / 100);
}
