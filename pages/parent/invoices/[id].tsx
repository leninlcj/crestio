import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../../components/AuthGuardParent';
import ParentLayout from '../../../components/parent/ParentLayout';
import { supabase } from '../../../lib/supabase';
import { useLocaleFormatters } from '../../../lib/useLocaleFormatters';

type LineItem = {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  scheduled_at: string | null;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  amount_cents: number;
};

type InvoiceData = {
  id: string;
  number: string;
  issued_on: string;
  due_on: string | null;
  total_cents: number;
  status: string;
  notes: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  is_batch_generated: boolean;
  household_id: string | null;
  student_id: string | null;
  payment_token: string | null;
  household: { id: string; display_name: string } | null;
  student: { id: string; name: string } | null;
};

function Inner() {
  const { t } = useTranslation('parent');
  const router = useRouter();
  const { id } = router.query;
  const { formatMoney, formatDate, formatDateTime } = useLocaleFormatters();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [legacySessions, setLegacySessions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const formatAud = (cents: number) => formatMoney(cents, 'AUD', { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return t('invoice_detail.em_dash');
    return formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtDateTime = (d: string | null) => {
    if (!d) return t('invoice_detail.em_dash');
    return formatDateTime(d, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  };

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    (async () => {
      setLoading(true);
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('id, number, issued_on, due_on, total_cents, status, notes, billing_period_start, billing_period_end, is_batch_generated, household_id, student_id, payment_token, household:households(id, display_name), student:students(id, name)')
        .eq('id', id)
        .maybeSingle();
      if (invErr || !inv) { setError(t('invoice_detail.not_found')); setLoading(false); return; }
      setInvoice(inv as any);

      if ((inv as any).household_id) {
        const { data: lines } = await supabase
          .from('invoice_sessions')
          .select('id, session_id, student_id, duration_minutes, amount_cents, line_item_description')
          .eq('invoice_id', id);
        const sessionIds = ((lines ?? []) as any[]).map((l) => l.session_id);
        const studentIds = Array.from(new Set(((lines ?? []) as any[]).map((l) => l.student_id)));
        const [{ data: sess }, { data: studs }] = await Promise.all([
          sessionIds.length > 0
            ? supabase.from('sessions').select('id, scheduled_at, subject, topic').in('id', sessionIds)
            : Promise.resolve({ data: [] as any[] }),
          studentIds.length > 0
            ? supabase.from('students').select('id, name').in('id', studentIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const sessionById = new Map<string, any>();
        for (const s of (sess ?? []) as any[]) sessionById.set(s.id, s);
        const studentById = new Map<string, any>();
        for (const s of (studs ?? []) as any[]) studentById.set(s.id, s);
        const items: LineItem[] = ((lines ?? []) as any[]).map((l) => ({
          id: l.id,
          session_id: l.session_id,
          student_id: l.student_id,
          student_name: studentById.get(l.student_id)?.name ?? t('invoice_detail.em_dash'),
          scheduled_at: sessionById.get(l.session_id)?.scheduled_at ?? null,
          duration_minutes: l.duration_minutes,
          subject: sessionById.get(l.session_id)?.subject ?? null,
          topic: sessionById.get(l.session_id)?.topic ?? null,
          amount_cents: l.amount_cents,
        }));
        items.sort((a, b) => {
          if (a.student_name !== b.student_name) return a.student_name.localeCompare(b.student_name);
          return new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime();
        });
        setLineItems(items);
      } else {
        const { data: sess } = await supabase
          .from('sessions')
          .select('id, scheduled_at, subject, topic, duration_minutes, charge_rate_cents, pay_rate_cents')
          .eq('invoice_id', id)
          .order('scheduled_at');
        setLegacySessions((sess ?? []) as any[]);
      }
      setLoading(false);
    })();
  }, [id]);

  const grouped = useMemo(() => {
    const map = new Map<string, LineItem[]>();
    for (const l of lineItems) {
      const arr = map.get(l.student_id) ?? [];
      arr.push(l);
      map.set(l.student_id, arr);
    }
    return Array.from(map.entries()).map(([sid, items]) => ({
      student_id: sid,
      student_name: items[0]?.student_name ?? t('invoice_detail.em_dash'),
      items,
      subtotal: items.reduce((a, i) => a + i.amount_cents, 0),
    }));
  }, [lineItems, t]);

  const overdue =
    invoice?.due_on && invoice.status !== 'paid' && invoice.status !== 'void' &&
    new Date(invoice.due_on) < new Date();
  const isUnpaid = invoice && invoice.status !== 'paid' && invoice.status !== 'void';

  return (
    <section className="px-6 md:px-12 pt-10 pb-16 max-w-3xl mx-auto">
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-6 w-40 bg-ruleSoft rounded" />
          <div className="h-12 bg-ruleSoft rounded" />
          <div className="h-32 bg-ruleSoft rounded" />
        </div>
      ) : error || !invoice ? (
        <div className="card p-6 text-sm text-claret">{error ?? t('invoice_detail.not_found')}</div>
      ) : (
        <>
          <Link href="/parent/invoices" className="text-sm text-ink-muted hover:text-ink mb-6 inline-block">
            ← {t('invoices_page.heading_v2')}
          </Link>

          <div className="rounded-md border border-rule bg-surface p-6 md:p-8 mb-6">
            <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
                  {t('invoice_detail.number_label', { number: invoice.number })}
                </div>
                <div className="font-display text-2xl tracking-tighter">
                  {invoice.household?.display_name ?? invoice.student?.name ?? t('invoice_detail.heading_fallback')}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-3xl tracking-tighter font-mono tabular-nums">
                  {formatAud(invoice.total_cents)}
                </div>
                <span className={[
                  'mt-1 inline-block',
                  invoice.status === 'paid' ? 'badge-forest' :
                  overdue ? 'badge-claret' :
                  invoice.status === 'sent' ? 'badge-rust' : 'badge-neutral',
                ].join(' ')}>
                  {invoice.status === 'paid' ? t('invoice_detail.status_paid')
                    : overdue ? t('invoice_detail.status_overdue')
                    : invoice.status}
                </span>
              </div>
            </div>

            {isUnpaid && invoice.payment_token && (
              <Link
                href={`/pay/${invoice.payment_token}`}
                className="btn-primary w-full sm:w-auto text-sm h-11 px-6 inline-flex items-center justify-center"
              >
                {t('invoice_detail.pay_now')}
              </Link>
            )}

            <div className="grid grid-cols-2 gap-6 text-sm pt-6 border-t border-rule mt-6">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">{t('invoice_detail.issued')}</div>
                <div>{fmtDate(invoice.issued_on)}</div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">{t('invoice_detail.due')}</div>
                <div className={overdue ? 'text-claret' : ''}>{fmtDate(invoice.due_on)}</div>
              </div>
              {invoice.billing_period_start && invoice.billing_period_end && (
                <div className="col-span-2">
                  <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">{t('invoice_detail.period')}</div>
                  <div>{fmtDate(invoice.billing_period_start)} – {fmtDate(invoice.billing_period_end)}</div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-rule bg-surface p-6 mb-6">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">{t('invoice_detail.sessions')}</div>
            {invoice.household_id ? (
              grouped.length === 0 ? (
                <div className="text-sm text-ink-muted">{t('invoice_detail.no_line_items')}</div>
              ) : (
                <div className="space-y-5">
                  {grouped.map((g) => (
                    <div key={g.student_id}>
                      <div className="text-sm font-medium text-ink mb-2">{g.student_name}</div>
                      <ul className="divide-y divide-ruleSoft">
                        {g.items.map((l) => (
                          <li key={l.id} className="py-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm text-ink">
                                {fmtDateTime(l.scheduled_at)}
                                <span className="text-ink-soft text-2xs"> · {t('invoice_detail.minutes_suffix', { minutes: l.duration_minutes })}</span>
                              </div>
                              <div className="text-2xs text-ink-muted">
                                {[l.subject, l.topic].filter(Boolean).join(' · ') || t('invoice_detail.tutoring_session')}
                              </div>
                            </div>
                            <div className="font-mono text-sm shrink-0 tabular-nums">{formatAud(l.amount_cents)}</div>
                          </li>
                        ))}
                      </ul>
                      <div className="text-right text-2xs text-ink-muted mt-2">
                        {t('invoice_detail.subtotal')} <span className="font-mono text-sm text-ink tabular-nums">{formatAud(g.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : legacySessions.length === 0 ? (
              <div className="text-sm text-ink-muted">{t('invoice_detail.no_sessions')}</div>
            ) : (
              <ul className="divide-y divide-ruleSoft">
                {legacySessions.map((s: any) => {
                  const amount = Math.round(((s.charge_rate_cents ?? 0) * s.duration_minutes) / 60);
                  return (
                    <li key={s.id} className="py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-ink">
                          {fmtDateTime(s.scheduled_at)}
                          <span className="text-ink-soft text-2xs"> · {t('invoice_detail.minutes_suffix', { minutes: s.duration_minutes })}</span>
                        </div>
                        <div className="text-2xs text-ink-muted">
                          {[s.subject, s.topic].filter(Boolean).join(' · ') || t('invoice_detail.tutoring_session')}
                        </div>
                      </div>
                      <div className="font-mono text-sm shrink-0 tabular-nums">{formatAud(amount)}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {invoice.notes && (
            <div className="rounded-md border border-rule bg-surface p-5 mb-6">
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">{t('invoice_detail.notes')}</div>
              <p className="text-sm text-ink whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={() => window.print()} className="btn-secondary text-sm">{t('invoice_detail.download_print')}</button>
          </div>
        </>
      )}
    </section>
  );
}

export default function Page() {
  return (
    <AuthGuardParent>
      <ParentLayout active="invoices" noTabs>
        <Inner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
