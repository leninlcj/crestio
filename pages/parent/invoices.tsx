import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../components/AuthGuardParent';
import ParentLayout from '../../components/parent/ParentLayout';
import AutoPayCard from '../../components/parent/AutoPayCard';
import { supabase } from '../../lib/supabase';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';

type InvoiceRow = {
  id: string;
  number: string;
  issued_on: string;
  due_on: string | null;
  total_cents: number;
  status: string;
  student_id: string | null;
  student_name: string | null;
  household_id: string | null;
  household_name: string | null;
  is_batch_generated: boolean;
};

function Inner() {
  const { t } = useTranslation('parent');
  const { formatMoney, formatDate } = useLocaleFormatters();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: parent } = await supabase
          .from('parents').select('id').eq('auth_user_id', session.user.id).maybeSingle();
        if (parent) setParentId(parent.id);
      }
      const { data } = await supabase
        .from('invoices')
        .select('id, number, issued_on, due_on, total_cents, status, student_id, household_id, is_batch_generated, student:students(name), household:households(display_name)')
        .order('issued_on', { ascending: false });
      setInvoices(((data ?? []) as any[]).map((i) => ({
        id: i.id,
        number: i.number,
        issued_on: i.issued_on,
        due_on: i.due_on,
        total_cents: i.total_cents,
        status: i.status,
        student_id: i.student_id,
        student_name: i.student?.name ?? null,
        household_id: i.household_id,
        household_name: i.household?.display_name ?? null,
        is_batch_generated: !!i.is_batch_generated,
      })));
      setLoading(false);
    })();
  }, []);

  const formatAud = (cents: number) => formatMoney(cents, 'AUD', { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
  const isUnpaid = (i: InvoiceRow) => i.status !== 'paid' && i.status !== 'void';

  const unpaid = useMemo(() => invoices.filter(isUnpaid), [invoices]);
  const paid = useMemo(() => invoices.filter((i) => i.status === 'paid'), [invoices]);
  const unpaidTotal = unpaid.reduce((a, i) => a + (i.total_cents ?? 0), 0);

  return (
    <section className="px-6 md:px-12 pt-10 pb-16 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-1">
          {t('invoices_page.heading_v2')}
        </h1>
        <p className="text-sm text-ink-muted">
          {t('invoices_page.sub_v2', { paid: paid.length, unpaid: unpaid.length })}
        </p>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-ruleSoft rounded-md" />)}
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-md border border-rule bg-surface p-6 text-sm text-ink-muted">
          {t('invoices_page.empty')}
        </div>
      ) : (
        <>
          {unpaidTotal > 0 && (
            <div className="rounded-md border border-claret/30 bg-claret/[0.04] p-5 mb-6">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-2xs uppercase tracking-widest text-claret mb-1">
                    {t('invoices_page.outstanding_eyebrow')}
                  </div>
                  <div className="font-display text-3xl tracking-tighter text-claret tabular-nums">
                    {formatAud(unpaidTotal)}
                  </div>
                  <div className="text-2xs text-claret/80 mt-1">
                    {t('dashboard_v2.unpaid_invoices', { count: unpaid.length })}
                  </div>
                </div>
                <Link href="/parent/pay" className="btn-primary text-sm h-10 min-h-[40px] px-4">
                  {t('invoices_page.pay_all', { count: unpaid.length })}
                </Link>
              </div>
            </div>
          )}

          {paid.length > 0 && (
            <div className="mb-6">
              <AutoPayCard parentId={parentId} />
            </div>
          )}

          {unpaid.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
                {t('invoices_page.section_unpaid')}
              </h2>
              <div className="space-y-2">
                {unpaid.map((inv) => <InvoiceCard key={inv.id} inv={inv} formatAud={formatAud} formatDate={formatDate} t={t as any} />)}
              </div>
            </div>
          )}

          {paid.length > 0 && (
            <div>
              <h2 className="text-2xs uppercase tracking-widest text-ink-soft mb-3">
                {t('invoices_page.section_paid')}
              </h2>
              <div className="space-y-2">
                {paid.map((inv) => <InvoiceCard key={inv.id} inv={inv} formatAud={formatAud} formatDate={formatDate} t={t as any} />)}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function InvoiceCard({ inv, formatAud, formatDate, t }: { inv: InvoiceRow; formatAud: (c: number) => string; formatDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string; t: (k: string, v?: any) => string }) {
  const overdue = inv.due_on && inv.status !== 'paid' && inv.status !== 'void' && new Date(inv.due_on) < new Date();
  const isUnpaid = inv.status !== 'paid' && inv.status !== 'void';
  const issuedText = t('invoices_page.issued_label', {
    date: formatDate(inv.issued_on, { day: 'numeric', month: 'short', year: 'numeric' }),
  });
  const dueText = inv.due_on
    ? ` · ${t('invoices_page.due_label', { date: formatDate(inv.due_on, { day: 'numeric', month: 'short' }) })}`
    : '';
  return (
    <Link
      href={`/parent/invoices/${inv.id}`}
      className={[
        'block p-4 rounded-md border bg-surface hover:bg-cream transition-colors',
        overdue ? 'border-claret/30' : 'border-rule',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {overdue && <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-claret overdue-dot-pulse" />}
            <span className="font-mono text-sm text-ink">{inv.number}</span>
            {inv.is_batch_generated && (
              <span className="badge-neutral text-2xs">{t('invoices_page.family_badge')}</span>
            )}
          </div>
          <div className="text-2xs text-ink-soft mt-0.5">
            {inv.household_name ? <>{inv.household_name} · </> : inv.student_name ? <>{inv.student_name} · </> : null}
            {issuedText}{dueText}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums">{formatAud(inv.total_cents)}</span>
          <span className={inv.status === 'paid' ? 'badge-forest' : overdue ? 'badge-claret' : 'badge-rust'}>
            {inv.status === 'paid' ? t('invoices_page.status_paid') : overdue ? t('invoices_page.status_overdue') : inv.status}
          </span>
          {isUnpaid && (
            <span className="hidden md:inline text-xs text-forest hover:underline underline-offset-2">
              {t('invoices_page.pay_inline')} →
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function ParentInvoices() {
  return (
    <AuthGuardParent>
      <ParentLayout active="invoices">
        <Inner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
