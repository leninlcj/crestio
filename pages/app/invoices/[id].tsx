import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { useOrganization } from '../../../lib/organizationContext';
import { Invoice, Student, Session, Profile } from '../../../lib/types';
import {
  formatCents,
  formatDate,
  sessionAmount,
  formatDateTime,
  cx,
} from '../../../lib/utils';

type InvoicePayment = {
  payment_token: string | null;
  stripe_payment_intent_id: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  paid_at: string | null;
  platform_fee_amount: number | null;
  stripe_fee_amount: number | null;
  net_amount_to_org: number | null;
};

type HouseholdLineItem = {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  description: string;
  amount_cents: number;
};

type HouseholdContext = {
  id: string;
  display_name: string;
  primary_parent: { name: string | null; email: string | null } | null;
};

function InvoiceDetailInner() {
  const router = useRouter();
  const { t } = useTranslation(['invoices', 'common']);
  const { id } = router.query;
  const { organization } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [householdContext, setHouseholdContext] = useState<HouseholdContext | null>(null);
  const [householdLineItems, setHouseholdLineItems] = useState<HouseholdLineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<InvoicePayment | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    (async () => {
      setLoading(true);
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;

      const [invRes, profileRes, payRes] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', id).single(),
        supabase.from('profiles').select('*').eq('id', auth.user.id).single(),
        supabase
          .from('invoices')
          .select('payment_token, stripe_payment_intent_id, payment_method_brand, payment_method_last4, paid_at, platform_fee_amount, stripe_fee_amount, net_amount_to_org')
          .eq('id', id)
          .maybeSingle(),
      ]);

      const inv = invRes.data;
      setInvoice(inv);
      setProfile(profileRes.data);
      setPayment((payRes.data as InvoicePayment | null) ?? null);

      if (inv) {
        if (inv.household_id) {
          // Household invoice: fetch invoice_sessions + enrich with sessions + students.
          const { data: lineRows } = await supabase
            .from('invoice_sessions')
            .select('*')
            .eq('invoice_id', inv.id);
          const sessionIds = ((lineRows ?? []) as any[]).map((l) => l.session_id);
          const studentIdsInRows = Array.from(new Set(((lineRows ?? []) as any[]).map((l) => l.student_id)));
          const [{ data: sess }, { data: studs }, { data: hh }, { data: hps }] = await Promise.all([
            sessionIds.length > 0
              ? supabase.from('sessions').select('id, scheduled_at, duration_minutes, subject, topic').in('id', sessionIds)
              : Promise.resolve({ data: [] as any[] }),
            studentIdsInRows.length > 0
              ? supabase.from('students').select('id, name').in('id', studentIdsInRows)
              : Promise.resolve({ data: [] as any[] }),
            supabase.from('households').select('id, display_name').eq('id', inv.household_id).maybeSingle(),
            supabase
              .from('household_parents')
              .select('is_primary, parent:parents!inner(name, email)')
              .eq('household_id', inv.household_id)
              .eq('is_primary', true)
              .limit(1),
          ]);
          const sessionById = new Map<string, any>();
          for (const s of (sess ?? []) as any[]) sessionById.set(s.id, s);
          const studentById = new Map<string, any>();
          for (const st of (studs ?? []) as any[]) studentById.set(st.id, st);
          const lines: HouseholdLineItem[] = ((lineRows ?? []) as any[]).map((l) => {
            const s = sessionById.get(l.session_id);
            return {
              id: l.id,
              session_id: l.session_id,
              student_id: l.student_id,
              student_name: studentById.get(l.student_id)?.name ?? '–',
              scheduled_at: s?.scheduled_at ?? '',
              duration_minutes: l.duration_minutes,
              subject: s?.subject ?? null,
              topic: s?.topic ?? null,
              description: l.line_item_description,
              amount_cents: l.amount_cents,
            };
          });
          lines.sort((a, b) => {
            if (a.student_name !== b.student_name) return a.student_name.localeCompare(b.student_name);
            return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
          });
          setHouseholdLineItems(lines);
          const primary = ((hps ?? []) as any[])[0]?.parent ?? null;
          setHouseholdContext({
            id: inv.household_id,
            display_name: (hh as any)?.display_name ?? 'Household',
            primary_parent: primary ? { name: primary.name ?? null, email: primary.email ?? null } : null,
          });
          setSessions([]);
          setStudent(null);
        } else {
          const [stuRes, sessRes] = await Promise.all([
            inv.student_id
              ? supabase.from('students').select('*').eq('id', inv.student_id).single()
              : Promise.resolve({ data: null }),
            supabase.from('sessions').select('*').eq('invoice_id', inv.id).order('scheduled_at'),
          ]);
          setStudent((stuRes as any).data);
          setSessions(sessRes.data ?? []);
        }
      }
      setLoading(false);
    })();
  }, [id]);

  const groupedHouseholdLines = useMemo(() => {
    const map = new Map<string, HouseholdLineItem[]>();
    for (const l of householdLineItems) {
      const arr = map.get(l.student_id) ?? [];
      arr.push(l);
      map.set(l.student_id, arr);
    }
    return Array.from(map.entries()).map(([student_id, items]) => ({
      student_id,
      student_name: items[0]?.student_name ?? '–',
      items,
      subtotal: items.reduce((a, i) => a + i.amount_cents, 0),
    }));
  }, [householdLineItems]);

  async function setStatus(status: Invoice['status']) {
    if (!invoice) return;
    const patch: any = { status };
    if (status === 'sent' && !invoice.sent_at) patch.sent_at = new Date().toISOString();
    if (status === 'paid' && !invoice.paid_at) patch.paid_at = new Date().toISOString();
    const { error: err } = await supabase.from('invoices').update(patch).eq('id', invoice.id);
    if (err) { setError(err.message); return; }
    // if paid, mark linked sessions paid
    if (status === 'paid') {
      await supabase.from('sessions').update({ paid: true }).eq('invoice_id', invoice.id);
    }
    setInvoice({ ...invoice, ...patch });
  }

  async function copyPayLink() {
    if (!payment?.payment_token) return;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://crestio.ai';
    const url = `${baseUrl}/pay/${encodeURIComponent(payment.payment_token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      window.prompt('Copy this pay link:', url);
    }
  }

  async function submitRefund() {
    if (!invoice) return;
    setRefundBusy(true);
    setRefundError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setRefundError('Sign in required.'); return; }
      const dollars = refundAmount.trim();
      if (dollars && (!Number.isFinite(Number(dollars)) || Number(dollars) <= 0)) {
        setRefundError('Enter a valid dollar amount.'); return;
      }
      const amountCents = dollars ? Math.round(Number(dollars) * 100) : null;
      const res = await fetch(`/api/invoices/${invoice.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ amount: amountCents ?? undefined, reason: refundReason.trim() || 'requested_by_customer' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setRefundError(payload?.error ?? 'Refund failed.'); return; }
      setRefundOpen(false);
      setRefundAmount('');
      setRefundReason('');
      // Hard reload — webhook will flip status; refresh from server to see changes.
      router.replace(router.asPath);
    } finally {
      setRefundBusy(false);
    }
  }

  async function deleteInvoice() {
    if (!invoice) return;
    if (!window.confirm(`Delete invoice ${invoice.number}? Sessions will be unlinked, not deleted.`)) return;
    // Unlink legacy-path sessions (stored on sessions.invoice_id)
    await supabase.from('sessions').update({ invoice_id: null }).eq('invoice_id', invoice.id);
    // Drop invoice_sessions rows for household/batch invoices — ON DELETE
    // CASCADE would do this too, but being explicit is cheap.
    await supabase.from('invoice_sessions').delete().eq('invoice_id', invoice.id);
    const { error: err } = await supabase.from('invoices').delete().eq('id', invoice.id);
    if (err) { setError(err.message); return; }
    router.push('/app/invoices');
  }

  if (loading) return <Layout title={t('invoices:title_loading')}><div className="card p-6 text-sm text-ink-muted">{t('common:actions.loading')}</div></Layout>;
  if (!invoice) return <Layout title={t('invoices:title_not_found')}><div className="card p-6 text-sm text-ink-muted">{t('invoices:not_found')}</div></Layout>;

  const currency = profile?.currency ?? 'AUD';

  const titleName = householdContext?.display_name ?? student?.name ?? 'Invoice';

  return (
    <Layout
      subtitle={`Invoice ${invoice.number}${invoice.is_batch_generated ? ' · Batch' : ''}`}
      title={titleName}
      actions={
        <>
          {invoice.status === 'draft' && (
            <button onClick={() => setStatus('sent')} className="btn-secondary">Mark sent</button>
          )}
          {invoice.status !== 'paid' && invoice.status !== 'void' && payment?.payment_token && (
            <button onClick={copyPayLink} className="btn-primary">
              {linkCopied ? 'Link copied' : 'Copy pay link'}
            </button>
          )}
          {invoice.status !== 'paid' && invoice.status !== 'void' && (
            <button onClick={() => setStatus('paid')} className="btn-secondary">Mark paid</button>
          )}
          {invoice.status === 'paid' && payment?.stripe_payment_intent_id && (
            <button onClick={() => setRefundOpen(true)} className="btn-secondary">Refund</button>
          )}
          <button onClick={() => window.print()} className="btn-ghost">Download PDF</button>
        </>
      }
    >
      {error && <div className="text-sm text-claret mb-4">{error}</div>}

      {/* Printable invoice — print-invoice class flips it to full-width + no padding in print mode */}
      <div className="card p-10 max-w-3xl mx-auto print-invoice">
        <div className="flex items-start justify-between mb-10">
          <div>
            <div className="font-display text-3xl tracking-tightest text-ink leading-none mb-1">
              {organization?.name ?? 'Your business'}
            </div>
            {profile?.owner_name && (
              <div className="text-sm text-ink-muted">{profile.owner_name}</div>
            )}
            {profile?.email && (
              <div className="text-sm text-ink-muted">{profile.email}</div>
            )}
            {profile?.phone && (
              <div className="text-sm text-ink-muted">{profile.phone}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Invoice</div>
            <div className="font-mono text-xl text-ink">{invoice.number}</div>
            <div className="mt-4 text-2xs uppercase tracking-widest text-ink-muted">Status</div>
            <span className={cx(
              'mt-1 inline-block',
              invoice.status === 'paid' && 'badge-forest',
              invoice.status === 'overdue' && 'badge-claret',
              invoice.status === 'sent' && 'badge-rust',
              invoice.status === 'draft' && 'badge-neutral',
              invoice.status === 'void' && 'badge-neutral'
            )}>
              {invoice.status}
            </span>
            {payment?.stripe_payment_intent_id && (
              <div className="mt-2 text-2xs text-ink-soft">
                {payment.payment_method_brand
                  ? `${payment.payment_method_brand.toUpperCase()} ····${payment.payment_method_last4}`
                  : 'Card payment'}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b border-rule">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Billed to</div>
            <div className="text-sm">
              {householdContext ? (
                <>
                  {householdContext.primary_parent?.name && (
                    <div className="text-ink">{householdContext.primary_parent.name}</div>
                  )}
                  <div className="text-ink-muted">Re: {householdContext.display_name}</div>
                  {householdContext.primary_parent?.email && (
                    <div className="text-ink-muted">{householdContext.primary_parent.email}</div>
                  )}
                </>
              ) : student && (
                <>
                  {student.parent_name && <div className="text-ink">{student.parent_name}</div>}
                  <div className="text-ink-muted">Re: {student.name}</div>
                  {student.parent_email && <div className="text-ink-muted">{student.parent_email}</div>}
                  {student.parent_phone && <div className="text-ink-muted">{student.parent_phone}</div>}
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Dates</div>
            <div className="text-sm">
              <div><span className="text-ink-muted">Issued: </span>{formatDate(invoice.issued_on)}</div>
              <div><span className="text-ink-muted">Due: </span>{formatDate(invoice.due_on)}</div>
              {invoice.billing_period_start && invoice.billing_period_end && (
                <div className="text-2xs text-ink-soft mt-1">
                  Period: {formatDate(invoice.billing_period_start)} – {formatDate(invoice.billing_period_end)}
                </div>
              )}
            </div>
          </div>
        </div>

        {invoice.is_prepaid_block ? (
          <div className="mb-8 rounded border border-rule bg-forest-soft/30 p-5">
            <div className="text-2xs uppercase tracking-widest text-forest-ink mb-1">Prepaid block</div>
            <div className="text-sm text-ink">
              {invoice.prepaid_hours ? `${Number(invoice.prepaid_hours)} hours of lesson credit` : 'Lesson credit'}
              {invoice.prepaid_face_value_cents ? ` worth ${formatCents(invoice.prepaid_face_value_cents, currency)}` : ''}, sold for {formatCents(invoice.total_cents, currency, { showZero: true })}.
              {invoice.status === 'paid' ? ' Paid: the credit is on the household\'s ledger.' : ' The credit is added to the household\'s ledger when this invoice is paid.'}
            </div>
            {invoice.household_id && (
              <Link href={`/app/households/${invoice.household_id}`} className="mt-3 inline-block text-xs text-forest underline underline-offset-2">Open the household's credit</Link>
            )}
          </div>
        ) : householdContext ? (
          <table className="w-full mb-8">
            <thead>
              <tr className="border-b border-rule">
                <th className="text-left text-2xs uppercase tracking-widest text-ink-muted font-medium py-2">Date</th>
                <th className="text-left text-2xs uppercase tracking-widest text-ink-muted font-medium py-2">Description</th>
                <th className="text-right text-2xs uppercase tracking-widest text-ink-muted font-medium py-2">Duration</th>
                <th className="text-right text-2xs uppercase tracking-widest text-ink-muted font-medium py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {groupedHouseholdLines.map((g) => (
                <>
                  <tr key={`${g.student_id}-header`} className="bg-ruleSoft/50">
                    <td colSpan={4} className="py-2 pl-2 text-2xs uppercase tracking-widest text-ink-muted">
                      {g.student_name}
                    </td>
                  </tr>
                  {g.items.map((l) => (
                    <tr key={l.id} className="border-b border-ruleSoft">
                      <td className="py-3 text-sm text-ink">
                        {l.scheduled_at ? formatDateTime(l.scheduled_at) : '–'}
                      </td>
                      <td className="py-3 text-sm text-ink-muted">
                        {[l.subject, l.topic].filter(Boolean).join(' · ') || 'Tutoring session'}
                      </td>
                      <td className="py-3 text-sm text-ink-muted font-mono text-right">
                        {l.duration_minutes} min
                      </td>
                      <td className="py-3 text-sm font-mono num text-right">
                        {formatCents(l.amount_cents, currency)}
                      </td>
                    </tr>
                  ))}
                  <tr key={`${g.student_id}-subtotal`} className="border-b border-rule">
                    <td colSpan={3} className="py-2 text-right text-2xs uppercase tracking-widest text-ink-muted">
                      {g.student_name} subtotal
                    </td>
                    <td className="py-2 text-sm font-mono num text-right">
                      {formatCents(g.subtotal, currency)}
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
            <tfoot>
              {(invoice.credit_applied_cents ?? 0) > 0 && (
                <>
                  <tr>
                    <td colSpan={2}></td>
                    <td className="py-1.5 text-right text-2xs uppercase tracking-widest text-ink-muted">Lessons</td>
                    <td className="py-1.5 text-sm font-mono num text-right">{formatCents(invoice.subtotal_cents, currency, { showZero: true })}</td>
                  </tr>
                  <tr>
                    <td colSpan={2}></td>
                    <td className="py-1.5 text-right text-2xs uppercase tracking-widest text-ink-muted">Prepaid credit</td>
                    <td className="py-1.5 text-sm font-mono num text-right">-{formatCents(invoice.credit_applied_cents ?? 0, currency, { showZero: true })}</td>
                  </tr>
                </>
              )}
              <tr>
                <td colSpan={2}></td>
                <td className="py-3 text-right text-2xs uppercase tracking-widest text-ink-muted">{(invoice.credit_applied_cents ?? 0) > 0 && invoice.total_cents === 0 ? 'Paid from credit' : 'Total'}</td>
                <td className="py-3 font-display text-2xl tracking-tightest text-right num">
                  {formatCents(invoice.total_cents, currency, { showZero: true })}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="w-full mb-8">
            <thead>
              <tr className="border-b border-rule">
                <th className="text-left text-2xs uppercase tracking-widest text-ink-muted font-medium py-2">Date</th>
                <th className="text-left text-2xs uppercase tracking-widest text-ink-muted font-medium py-2">Description</th>
                <th className="text-right text-2xs uppercase tracking-widest text-ink-muted font-medium py-2">Duration</th>
                <th className="text-right text-2xs uppercase tracking-widest text-ink-muted font-medium py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-ruleSoft">
                  <td className="py-3 text-sm text-ink">{formatDateTime(s.scheduled_at)}</td>
                  <td className="py-3 text-sm text-ink-muted">
                    {[s.subject, s.topic].filter(Boolean).join(' · ') || 'Tutoring session'}
                  </td>
                  <td className="py-3 text-sm text-ink-muted font-mono text-right">{s.duration_minutes} min</td>
                  <td className="py-3 text-sm font-mono num text-right">
                    {formatCents(sessionAmount(s), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {(invoice.credit_applied_cents ?? 0) > 0 && (
                <>
                  <tr>
                    <td colSpan={2}></td>
                    <td className="py-1.5 text-right text-2xs uppercase tracking-widest text-ink-muted">Lessons</td>
                    <td className="py-1.5 text-sm font-mono num text-right">{formatCents(invoice.subtotal_cents, currency, { showZero: true })}</td>
                  </tr>
                  <tr>
                    <td colSpan={2}></td>
                    <td className="py-1.5 text-right text-2xs uppercase tracking-widest text-ink-muted">Prepaid credit</td>
                    <td className="py-1.5 text-sm font-mono num text-right">-{formatCents(invoice.credit_applied_cents ?? 0, currency, { showZero: true })}</td>
                  </tr>
                </>
              )}
              <tr>
                <td colSpan={2}></td>
                <td className="py-3 text-right text-2xs uppercase tracking-widest text-ink-muted">{(invoice.credit_applied_cents ?? 0) > 0 && invoice.total_cents === 0 ? 'Paid from credit' : 'Total'}</td>
                <td className="py-3 font-display text-2xl tracking-tightest text-right num">
                  {formatCents(invoice.total_cents, currency, { showZero: true })}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {invoice.notes && (
          <div className="text-sm text-ink-muted border-t border-rule pt-6">
            <div className="text-2xs uppercase tracking-widest mb-2">Notes</div>
            <p className="whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-rule text-xs text-ink-soft flex items-center justify-between gap-4">
          <div>
            Thank you for choosing {organization?.name ?? 'us'}.
            {profile?.email && (
              <> Questions? Contact <span className="text-ink-muted">{profile.email}</span>.</>
            )}
          </div>
          <div className="text-2xs uppercase tracking-widest text-ink-soft opacity-60">
            crest<span className="italic">io</span>
          </div>
        </div>
      </div>

      {payment?.stripe_payment_intent_id && (
        <div className="max-w-3xl mx-auto mt-6 print-hide">
          <div className="card p-5">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Payment</div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-muted">Status</dt>
              <dd className="text-ink">{invoice.status === 'paid' ? 'Paid' : invoice.status}</dd>
              <dt className="text-ink-muted">Paid on</dt>
              <dd className="text-ink">{payment.paid_at ? formatDate(payment.paid_at) : '–'}</dd>
              <dt className="text-ink-muted">Card</dt>
              <dd className="text-ink">
                {payment.payment_method_brand
                  ? `${payment.payment_method_brand.toUpperCase()} ····${payment.payment_method_last4}`
                  : '–'}
              </dd>
              <dt className="text-ink-muted">Platform fee</dt>
              <dd className="text-ink font-mono">
                {payment.platform_fee_amount != null ? formatCents(payment.platform_fee_amount, currency) : '–'}
              </dd>
              <dt className="text-ink-muted">Stripe fee</dt>
              <dd className="text-ink font-mono">
                {payment.stripe_fee_amount != null ? formatCents(payment.stripe_fee_amount, currency) : '–'}
              </dd>
              <dt className="text-ink-muted">Net to you</dt>
              <dd className="text-ink font-mono">
                {payment.net_amount_to_org != null ? formatCents(payment.net_amount_to_org, currency, { showZero: true }) : '–'}
              </dd>
              <dt className="text-ink-muted">PaymentIntent</dt>
              <dd className="font-mono text-2xs text-ink-soft truncate">{payment.stripe_payment_intent_id}</dd>
            </dl>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto mt-6 flex justify-end print-hide">
        <button onClick={deleteInvoice} className="btn-danger text-xs">Delete invoice</button>
      </div>

      {refundOpen && invoice && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 print-hide" onClick={() => !refundBusy && setRefundOpen(false)}>
          <div className="bg-cream rounded-t-lg md:rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl tracking-tightest mb-2">Refund payment</h2>
            <p className="text-sm text-ink-muted mb-4">
              Refunds the parent and reverses the platform fee. Stripe's processing fee is not refunded.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-2xs uppercase tracking-widest text-ink-muted mb-1">
                  Amount (leave blank for full refund of {formatCents(invoice.total_cents, currency, { showZero: true })})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input w-full"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="Full"
                />
              </div>
              <div>
                <label className="block text-2xs uppercase tracking-widest text-ink-muted mb-1">Reason</label>
                <input
                  type="text"
                  className="input w-full"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Customer requested"
                />
              </div>
              {refundError && <div className="text-sm text-claret">{refundError}</div>}
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-ghost" disabled={refundBusy} onClick={() => setRefundOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="btn-primary" disabled={refundBusy} onClick={submitRefund}>
                  {refundBusy ? 'Processing…' : 'Issue refund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default function InvoiceDetail() {
  return <AuthGuard><OwnerOnly><InvoiceDetailInner /></OwnerOnly></AuthGuard>;
}
