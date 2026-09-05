import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { authFetch } from '../../lib/authFetch';
import { formatCentsDetailed, formatDateTime } from '../../lib/utils';
import { CREDIT_KIND_LABEL, blockFaceValueCents, blockPriceCents, lessonsCovered, type CreditKind, type CreditRow } from '../../lib/householdCredit';

type StudentLite = { id: string; name: string; hourly_rate_cents: number | null };
type HouseholdLite = { id: string; display_name: string };

type CreditPayload = {
  balance_cents: number;
  ledger: CreditRow[];
  setup_required: boolean;
  referred_by: HouseholdLite | null;
  referral_credited_at: string | null;
  block: { hours: number; discount_percent: number };
};

// The Credit tab on a household: balance, ledger, a prepaid block invoice,
// manual adjustments, and which family referred this one. Owner only for
// changes; tutors see the balance.
export function HouseholdCreditTab({ householdId, students, isTutor, currency = 'AUD' }: { householdId: string; students: StudentLite[]; isTutor: boolean; currency?: string }) {
  const fmt = (c: number) => formatCentsDetailed(c, currency);
  const [data, setData] = useState<CreditPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [blockStudent, setBlockStudent] = useState<string>(students[0]?.id ?? '');
  const [blockHours, setBlockHours] = useState<number>(10);
  const [sendEmail, setSendEmail] = useState(true);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [households, setHouseholds] = useState<HouseholdLite[]>([]);
  const [referredBy, setReferredBy] = useState<string>('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authFetch(`/api/households/${householdId}/credit`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? 'Could not load credit.');
      setData(payload);
      setReferredBy(payload.referred_by?.id ?? '');
      if (payload.block?.hours) setBlockHours(payload.block.hours);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load credit.');
    }
  }, [householdId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!blockStudent && students[0]) setBlockStudent(students[0].id); }, [students, blockStudent]);

  useEffect(() => {
    if (isTutor) return;
    (async () => {
      try {
        const res = await authFetch('/api/households');
        const payload = await res.json();
        const list: HouseholdLite[] = (payload?.households ?? payload ?? []).map((h: any) => ({ id: h.id, display_name: h.display_name })).filter((h: HouseholdLite) => h.id && h.id !== householdId);
        setHouseholds(list);
      } catch { /* the selector simply stays empty */ }
    })();
  }, [householdId, isTutor]);

  const student = students.find((s) => s.id === blockStudent) ?? null;
  const rate = student?.hourly_rate_cents ?? null;
  const face = rate ? blockFaceValueCents(rate, blockHours) : 0;
  const price = data ? blockPriceCents(face, data.block.discount_percent) : 0;
  const bestRate = useMemo(() => Math.max(0, ...students.map((s) => s.hourly_rate_cents ?? 0)), [students]);

  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const res = await authFetch(`/api/households/${householdId}/credit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Request failed.');
      setMessage(ok);
      await load();
      return payload;
    } catch (e: any) {
      setError(e?.message ?? 'Request failed.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createBlock(e: FormEvent) {
    e.preventDefault();
    if (!blockStudent) return;
    const payload = await post({ kind: 'block', student_id: blockStudent, hours: blockHours, send_email: sendEmail }, 'Prepaid block invoice created.');
    if (payload?.invoice?.number) {
      setMessage(`Invoice ${payload.invoice.number} created for ${fmt(payload.invoice.total_cents)}${payload.emailed ? ' and emailed to the parent' : ''}. The credit lands when it is paid.`);
    }
  }

  async function adjust(e: FormEvent) {
    e.preventDefault();
    const dollars = Number(adjAmount);
    if (!Number.isFinite(dollars) || dollars === 0) { setError('Enter an amount in dollars, negative to remove credit.'); return; }
    const ok = await post({ kind: 'adjustment', amount_cents: Math.round(dollars * 100), note: adjNote }, 'Credit adjusted.');
    if (ok) { setAdjAmount(''); setAdjNote(''); }
  }

  async function saveReferredBy(value: string) {
    setReferredBy(value);
    await post({ kind: 'referred_by', referred_by_household_id: value || null }, value ? 'Referral recorded. The referring family is credited after this family\'s third lesson.' : 'Referral cleared.');
  }

  if (!data && !error) return <div className="card p-5 text-sm text-ink-muted">Loading credit.</div>;
  if (data?.setup_required) {
    return (
      <div className="card p-4 bg-amber-soft/60 border-amber/40 text-sm text-amber-ink" role="status">
        The credit ledger does not exist yet. Run <code className="font-mono text-xs">supabase/migrations/20260906_agency_chunk5.sql</code> in the Supabase SQL editor, then reload.
      </div>
    );
  }

  const balance = data?.balance_cents ?? 0;
  const covered = lessonsCovered(balance, bestRate || null);

  return (
    <div className="space-y-6">
      <section className="grid md:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">Prepaid credit</div>
          <div className={`font-display text-3xl tracking-tightest num ${balance < 0 ? 'text-claret' : 'text-ink'}`}>{fmt(balance)}</div>
          <div className="text-xs text-ink-muted mt-1">
            {balance < 0 ? 'Negative: a refunded block had already been spent. Collect the difference or add an adjustment.' : bestRate ? `Covers about ${covered} ${covered === 1 ? 'lesson' : 'lessons'} at ${fmt(bestRate)} an hour.` : 'Set a student rate to see how many lessons this covers.'}
          </div>
        </div>
        <div className="card p-5 md:col-span-2">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">How it works</div>
          <p className="text-sm text-ink-muted leading-relaxed">
            When an invoice is issued to this family, credit is applied first; an invoice fully covered is marked paid on the spot. A prepaid block is an invoice like any other: the credit arrives when it is paid, by card or by you marking it paid. Voided invoices return their credit. Nothing here is edited by hand; every change is a row below.
          </p>
        </div>
      </section>

      {message && <div className="text-sm text-forest-ink bg-forest-soft border border-forest/20 rounded p-3" role="status">{message}</div>}
      {error && <div className="text-sm text-claret" role="alert">{error}</div>}

      {!isTutor && (
        <section className="grid lg:grid-cols-2 gap-4">
          <form onSubmit={createBlock} className="card p-5 space-y-4">
            <div>
              <h2 className="font-display text-xl tracking-tightest">Sell a prepaid block</h2>
              <p className="text-xs text-ink-muted mt-1">{data?.block.hours} hours at {data?.block.discount_percent}% off the student's hourly rate. Creates an issued invoice with a card link.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="block-student">Student</label>
                <select id="block-student" className="input" value={blockStudent} onChange={(e) => setBlockStudent(e.target.value)} required>
                  {students.length === 0 && <option value="">No students in this household</option>}
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}{s.hourly_rate_cents ? ` · ${fmt(s.hourly_rate_cents)}/h` : ' · no rate set'}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="block-hours">Hours</label>
                <input id="block-hours" type="number" min={1} max={100} className="input" value={blockHours} onChange={(e) => setBlockHours(Number(e.target.value))} />
              </div>
            </div>
            <div className="text-sm text-ink bg-ruleSoft/40 border border-rule rounded p-3">
              {rate ? (
                <>Credit <span className="font-medium num">{fmt(face)}</span> for <span className="font-medium num">{fmt(price)}</span> (saves {fmt(face - price)}).</>
              ) : (
                <>Set an hourly rate on the student first.</>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="h-4 w-4 accent-forest" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              Email the invoice and card link to the primary parent now
            </label>
            <button type="submit" className="btn-primary" disabled={busy || !rate || !blockStudent}>{busy ? 'Working' : 'Create block invoice'}</button>
          </form>

          <div className="space-y-4">
            <form onSubmit={adjust} className="card p-5 space-y-3">
              <div>
                <h2 className="font-display text-xl tracking-tightest">Adjust credit</h2>
                <p className="text-xs text-ink-muted mt-1">A bank transfer for a block, goodwill after a problem, or a correction. Negative removes credit. The note shows on the family's ledger.</p>
              </div>
              <div className="grid sm:grid-cols-[120px_1fr] gap-3">
                <div>
                  <label className="label" htmlFor="adj-amount">Dollars</label>
                  <input id="adj-amount" type="number" step="0.01" className="input num" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="950.00" />
                </div>
                <div>
                  <label className="label" htmlFor="adj-note">Why</label>
                  <input id="adj-note" className="input" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="Bank transfer received 6 Sep for a 10-hour block" maxLength={500} />
                </div>
              </div>
              <button type="submit" className="btn-secondary" disabled={busy}>Record adjustment</button>
            </form>

            <div className="card p-5 space-y-3">
              <div>
                <h2 className="font-display text-xl tracking-tightest">Referred by</h2>
                <p className="text-xs text-ink-muted mt-1">If another family sent this one, record it. They receive $50 of lesson credit after this family's third completed lesson.{data?.referral_credited_at ? ` Credited on ${formatDateTime(data.referral_credited_at)}.` : ''}</p>
              </div>
              <select className="input" value={referredBy} onChange={(e) => saveReferredBy(e.target.value)} disabled={busy || !!data?.referral_credited_at}>
                <option value="">Nobody, or not recorded</option>
                {data?.referred_by && !households.some((h) => h.id === data.referred_by?.id) && <option value={data.referred_by.id}>{data.referred_by.display_name}</option>}
                {households.map((h) => <option key={h.id} value={h.id}>{h.display_name}</option>)}
              </select>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl tracking-tightest mb-3">Ledger</h2>
        {(data?.ledger.length ?? 0) === 0 ? (
          <div className="card p-5 text-sm text-ink-muted">No credit movements yet.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-widest text-ink-soft border-b border-rule">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">What</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ruleSoft">
                {data!.ledger.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 text-ink-muted whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-2.5 text-ink">
                      <span className="font-medium">{CREDIT_KIND_LABEL[r.kind as CreditKind] ?? r.kind}</span>
                      {r.invoice?.number && r.invoice_id && (
                        <> · <Link href={`/app/invoices/${r.invoice_id}`} className="text-forest underline underline-offset-2">{r.invoice.number}</Link></>
                      )}
                      {r.note && <span className="text-ink-muted"> · {r.note}</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono num whitespace-nowrap ${r.amount_cents < 0 ? 'text-ink-muted' : 'text-forest-ink'}`}>{r.amount_cents < 0 ? '-' : '+'}{fmt(Math.abs(r.amount_cents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
