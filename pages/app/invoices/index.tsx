import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconInvoice } from '../../../components/design/icons';
import { supabase } from '../../../lib/supabase';
import { Invoice, Student } from '../../../lib/types';
import { formatCents, formatDate, cx } from '../../../lib/utils';

type Filter = 'all' | 'student' | 'household';

type InvoiceRow = Invoice & {
  student: Student | null;
  household: { id: string; display_name: string } | null;
};

function InvoicesInner() {
  const router = useRouter();
  const { t } = useTranslation(['invoices', 'common']);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [currency, setCurrency] = useState('AUD');
  const [filter, setFilter] = useState<Filter>('all');
  const [showBatchToast, setShowBatchToast] = useState(false);

  useEffect(() => {
    if (router.query.batch === '1') {
      setShowBatchToast(true);
      setTimeout(() => setShowBatchToast(false), 6000);
    }
  }, [router.query.batch]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: p } = await supabase
          .from('profiles').select('currency').eq('id', session.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }
      const { data } = await supabase
        .from('invoices')
        .select('*, student:students(id,name), household:households(id,display_name)')
        .order('issued_on', { ascending: false });
      setInvoices((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'student') return invoices.filter((i) => !i.household_id);
    if (filter === 'household') return invoices.filter((i) => !!i.household_id);
    return invoices;
  }, [invoices, filter]);

  return (
    <Layout
      subtitle={t('invoices:subtitle')}
      title={t('invoices:title_list')}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/app/invoices/batch" className="btn-secondary">{t('invoices:actions.batch')}</Link>
          <Link href="/app/invoices/new" className="btn-primary">{t('invoices:actions.new')}</Link>
        </div>
      }
    >
      {showBatchToast && (
        <div className="mb-4 card p-3 bg-forest-soft/60 border-forest/20 text-sm text-forest-ink">
          {t('invoices:batch_toast_created')}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 text-xs">
        {(['all', 'household', 'student'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cx(
              'px-3 py-1.5 rounded border transition-colors',
              filter === f ? 'bg-surface border-rule text-ink' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t(`invoices:filters.${f === 'student' ? 'per_student' : f}` as any)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">{t('common:actions.loading')}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconInvoice />}
          title={t('invoices:empty.no_invoices_title')}
          description={t('invoices:empty.no_invoices_body')}
          action={<Link href="/app/invoices/batch" className="btn-primary">{t('invoices:empty.cta_batch')}</Link>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('invoices:columns.number')}</th>
                <th>{t('invoices:columns.billed_to')}</th>
                <th>{t('invoices:columns.issued')}</th>
                <th>{t('invoices:columns.due')}</th>
                <th>{t('invoices:columns.status')}</th>
                <th className="text-right">{t('invoices:columns.total')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="row-link"
                  onClick={() => window.location.assign(`/app/invoices/${i.id}`)}>
                  <td className="font-mono text-sm">
                    {i.number}
                    {i.is_batch_generated && (
                      <span className="ml-2 badge-neutral text-2xs">{t('invoices:batch_pill', { defaultValue: 'BATCH' })}</span>
                    )}
                  </td>
                  <td className="text-ink font-medium">
                    {i.household?.display_name ?? i.student?.name ?? '—'}
                  </td>
                  <td className="text-ink-muted">{formatDate(i.issued_on)}</td>
                  <td className="text-ink-muted">{formatDate(i.due_on)}</td>
                  <td>
                    <span className={cx(
                      i.status === 'paid' && 'badge-forest',
                      i.status === 'overdue' && 'badge-claret',
                      i.status === 'sent' && 'badge-rust',
                      i.status === 'draft' && 'badge-neutral',
                      i.status === 'void' && 'badge-neutral'
                    )}>
                      {t(`common:status.${i.status}` as any)}
                    </span>
                  </td>
                  <td className="text-right font-mono num text-sm">
                    {formatCents(i.total_cents, currency, { showZero: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}

export default function InvoicesPage() {
  return <AuthGuard><OwnerOnly><InvoicesInner /></OwnerOnly></AuthGuard>;
}
