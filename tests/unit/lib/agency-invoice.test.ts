import { describe, it, expect } from 'vitest';
import { buildAgencyInvoiceNote } from '../../../lib/agencyInvoice';

// A tiny stand-in for the Supabase admin client: from(table).select().eq()/.in()
// filters over in-memory rows, then .maybeSingle() or await.

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const q: any = {
        select() { return q; },
        eq(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return q; },
        in(col: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[col])); return q; },
        is(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return q; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(resolve: (v: { data: Row[]; error: null }) => void) { resolve({ data: rows, error: null }); },
      };
      return q;
    },
  } as any;
}

const OWNER = 'owner-user';

describe('buildAgencyInvoiceNote', () => {
  it('names the tutor and shows the fee split when every session carries a pay rate', async () => {
    const admin = fakeAdmin({
      invoice_sessions: [{ invoice_id: 'inv1', session_id: 's1' }, { invoice_id: 'inv1', session_id: 's2' }],
      sessions: [
        { id: 's1', duration_minutes: 60, pay_rate_cents: 5000, tutor_id: 't1' },
        { id: 's2', duration_minutes: 90, pay_rate_cents: 5000, tutor_id: 't1' },
      ],
      tutors: [{ id: 't1', name: 'Priya Nair', auth_user_id: 'tutor-user' }],
      students: [],
    });
    const note = await buildAgencyInvoiceNote(admin, { invoiceId: 'inv1', studentId: null, ownerUserId: OWNER, totalCents: 23750, currency: 'AUD' });
    expect(note).toContain('Priya Nair, an independent tutor introduced by Crestio Tutoring');
    expect(note).toContain('$237.50');
    expect(note).toContain("$125.00 is Priya Nair's fee");
    expect(note).toContain("$112.50 is Crestio Tutoring's service fee");
    expect(note).not.toContain('—');
  });

  it('says the founder taught directly when the tutor row belongs to the owner', async () => {
    const admin = fakeAdmin({
      invoice_sessions: [{ invoice_id: 'inv1', session_id: 's1' }],
      sessions: [{ id: 's1', duration_minutes: 60, pay_rate_cents: null, tutor_id: 't-owner' }],
      tutors: [{ id: 't-owner', name: 'Lenin Joaquin', auth_user_id: OWNER }],
      students: [],
    });
    const note = await buildAgencyInvoiceNote(admin, { invoiceId: 'inv1', studentId: null, ownerUserId: OWNER, totalCents: 9500, currency: 'AUD' });
    expect(note).toContain('provided directly by Crestio Tutoring (Lenin Joaquin)');
    expect(note).not.toContain('service fee');
  });

  it('falls back to the plain disclosure when a session has no pay rate', async () => {
    const admin = fakeAdmin({
      invoice_sessions: [{ invoice_id: 'inv1', session_id: 's1' }, { invoice_id: 'inv1', session_id: 's2' }],
      sessions: [
        { id: 's1', duration_minutes: 60, pay_rate_cents: 5000, tutor_id: 't1' },
        { id: 's2', duration_minutes: 60, pay_rate_cents: null, tutor_id: 't1' },
      ],
      tutors: [{ id: 't1', name: 'Priya Nair', auth_user_id: 'tutor-user' }],
      students: [],
    });
    const note = await buildAgencyInvoiceNote(admin, { invoiceId: 'inv1', studentId: null, ownerUserId: OWNER, totalCents: 19000, currency: 'AUD' });
    expect(note).toContain('Priya Nair');
    expect(note).not.toContain('Of the');
  });

  it('uses the student primary tutor when the invoice has no sessions yet', async () => {
    const admin = fakeAdmin({
      invoice_sessions: [],
      sessions: [],
      tutors: [{ id: 't1', name: 'Priya Nair', auth_user_id: 'tutor-user' }],
      students: [{ id: 'st1', primary_tutor_id: 't1' }],
    });
    const note = await buildAgencyInvoiceNote(admin, { invoiceId: 'inv1', studentId: 'st1', ownerUserId: OWNER, totalCents: 9500, currency: 'AUD' });
    expect(note).toContain('Priya Nair');
    expect(note).not.toContain('Of the');
  });
});
