import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconInvoice } from '../../../components/design/icons';
import { Skeleton } from '../../../components/design/Skeleton';
import { FilterChips } from '../../../components/design/FilterChips';
import { SavedViewsMenu } from '../../../components/design/SavedViewsMenu';
import { BulkActionBar } from '../../../components/design/BulkActionBar';
import { StatusPill } from '../../../components/design/StatusPill';
import { useDetailParam } from '../../../components/design/DetailPane';
import dynamic from 'next/dynamic';
const InvoiceDetailPane = dynamic(
  () => import('../../../components/invoices/InvoiceDetailPane').then((m) => m.InvoiceDetailPane),
  { ssr: false },
);
import { Tooltip } from '../../../components/design/Tooltip';
import { useToast } from '../../../components/design/Toast';
import SampleDataBanner from '../../../components/SampleDataBanner';
import { supabase } from '../../../lib/supabase';
import { Invoice, Student } from '../../../lib/types';
import { formatCents, formatDate, cx } from '../../../lib/utils';

type InvoiceRow = Invoice & {
  student: Student | null;
  household: { id: string; display_name: string } | null;
};

const STATUS_OPTIONS = [
  { value: 'draft',   label: 'Draft' },
  { value: 'sent',    label: 'Sent' },
  { value: 'paid',    label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

function InvoicesInner() {
  const router = useRouter();
  const { t } = useTranslation(['invoices', 'common']);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [currency, setCurrency] = useState('AUD');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const detail = useDetailParam();
  const detailId = detail.value && detail.value.startsWith('invoice:')
    ? detail.value.slice('invoice:'.length) : null;

  // ?filter=overdue/unbilled/draft compatibility — translate into ?status=.
  useEffect(() => {
    const filter = router.query.filter;
    if (filter === 'overdue' || filter === 'unbilled' || filter === 'draft' || filter === 'sent' || filter === 'paid') {
      const url = new URL(window.location.href);
      url.searchParams.set('status', filter as string);
      url.searchParams.delete('filter');
      router.replace(url.pathname + url.search);
    }
  }, [router.query.filter, router]);

  // Free-text search.
  const [search, setSearch] = useState('');

  const statusParam = (router.query.status as string) ?? '';
  const statusValues = statusParam ? statusParam.split(',') : [];

  // Default chip selection if nothing is set.
  const effectiveStatusValues = statusValues.length > 0
    ? statusValues
    : []; // empty = show all

  function setStatus(values: string[]) {
    const url = new URL(window.location.href);
    if (values.length === 0) url.searchParams.delete('status');
    else url.searchParams.set('status', values.join(','));
    router.replace(url.pathname + url.search);
  }

  const load = async () => {
    setLoading(true);
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
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = effectiveStatusValues.length === 0
      ? invoices
      : invoices.filter((i) => effectiveStatusValues.includes(i.status));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) =>
        [i.number, i.student?.name, i.household?.display_name]
          .filter(Boolean).join(' ').toLowerCase().includes(q),
      );
    }
    return list;
  }, [invoices, effectiveStatusValues, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of invoices) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [invoices]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearSelected() { setSelected(new Set()); }

  async function bulkMarkPaid() {
    const ids = Array.from(selected);
    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).in('id', ids);
    clearSelected();
    load();
  }

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
      <div className="mb-4"><SampleDataBanner /></div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <input
          type="search"
          placeholder="Search by number, student, household…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input md:max-w-xs flex-1 min-w-[200px]"
        />
        <FilterChips
          ariaLabel="Status"
          multi
          options={STATUS_OPTIONS.map((o) => ({ ...o, count: counts[o.value] }))}
          value={effectiveStatusValues}
          onChange={(next) => setStatus(next as string[])}
        />
        <div className="flex items-center gap-2">
          {effectiveStatusValues.length > 0 && (
            <button
              type="button"
              onClick={() => setStatus([])}
              className="btn-ghost text-xs"
              style={{ height: 32, minHeight: 32 }}
            >
              Clear
            </button>
          )}
          <SavedViewsMenu listId="invoices" />
        </div>
      </div>

      {loading ? (
        <div className="card divide-y divide-rule">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5" style={{ minHeight: 48 }}>
              <Skeleton className="w-4 h-4" />
              <Skeleton className="w-20 h-3" />
              <div className="flex-1"><Skeleton className="h-3 w-1/3 mb-1" /><Skeleton className="h-2.5 w-1/4" /></div>
              <Skeleton className="w-16 h-3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconInvoice />}
          title="No invoices."
          description="Create one from completed sessions."
          action={<Link href="/app/invoices/batch" className="btn-primary">Create invoices</Link>}
        />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-rule">
            {filtered.map((i) => (
              <InvoiceRow
                key={i.id}
                invoice={i}
                currency={currency}
                isSelected={selected.has(i.id)}
                onToggleSelect={() => toggleSelect(i.id)}
                onOpen={() => detail.open(`invoice:${i.id}`)}
                onChanged={load}
              />
            ))}
          </ul>
        </div>
      )}

      <BulkActionBar count={selected.size} onClear={clearSelected}>
        <button
          type="button"
          onClick={() => bulkSend(Array.from(selected), invoices, load, clearSelected)}
          className="text-xs font-medium bg-cream text-forest-ink px-2.5 py-1 rounded-full hover:bg-cream/90 transition-colors duration-100"
        >
          Send selected ({selected.size})
        </button>
        <button type="button" onClick={bulkMarkPaid} className="text-xs text-cream/90 hover:text-cream px-2.5 py-1 rounded-full hover:bg-cream/10 transition-colors duration-100">
          Mark paid
        </button>
      </BulkActionBar>

      <InvoiceDetailPane
        open={!!detailId}
        invoiceId={detailId}
        onClose={detail.close}
        currency={currency}
        onChanged={load}
      />
    </Layout>
  );
}

function InvoiceRow({
  invoice, currency, isSelected, onToggleSelect, onOpen, onChanged,
}: {
  invoice: InvoiceRow;
  currency: string;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const tone =
    invoice.status === 'paid' ? 'success'
    : invoice.status === 'overdue' ? 'claret'
    : invoice.status === 'sent' ? 'forest'
    : 'neutral';

  async function markPaid(e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoice.id);
    toast.show({ message: 'Marked paid.', tone: 'success' });
    onChanged();
  }
  async function send(e: React.MouseEvent) {
    e.stopPropagation();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/invoices/${invoice.id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      toast.show({ message: 'Sent to parent.', tone: 'success' });
      onChanged();
    } else {
      toast.show({ message: 'Send failed.', tone: 'error' });
    }
  }
  function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice.id}`);
    toast.show({ message: 'Pay link copied.', tone: 'success' });
  }

  return (
    <li
      onClick={onOpen}
      className={cx(
        'group flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-ruleSoft/40 transition-colors duration-100',
        isSelected && 'bg-forest-soft/30',
      )}
      style={{ minHeight: 48 }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        aria-label={isSelected ? 'Deselect' : 'Select'}
        className={cx(
          'shrink-0 w-4 h-4 rounded border grid place-items-center transition-all duration-100',
          isSelected
            ? 'bg-forest border-forest text-cream'
            : 'border-rule opacity-0 group-hover:opacity-100',
        )}
      >
        {isSelected && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="font-mono text-2xs text-ink-muted shrink-0 w-20 truncate num tabular">{invoice.number}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink truncate">
          {invoice.household?.display_name ?? invoice.student?.name ?? '—'}
        </div>
        <div className="text-2xs text-ink-soft truncate num tabular">
          Issued {formatDate(invoice.issued_on)}
          {invoice.due_on && <> · Due {formatDate(invoice.due_on)}</>}
        </div>
      </div>
      <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100 shrink-0">
        {invoice.status === 'draft' && (
          <Tooltip label="Send to parent">
            <button type="button" onClick={send} className="btn-ghost text-2xs px-2 py-1">Send</button>
          </Tooltip>
        )}
        {invoice.status !== 'paid' && invoice.status !== 'void' && (
          <Tooltip label="Mark as paid">
            <button type="button" onClick={markPaid} className="btn-ghost text-2xs px-2 py-1">Mark paid</button>
          </Tooltip>
        )}
        <Tooltip label="Copy payment link">
          <button type="button" onClick={copyLink} className="btn-ghost text-2xs px-2 py-1">Copy link</button>
        </Tooltip>
        <Link
          href={`/app/invoices/${invoice.id}`}
          onClick={(e) => e.stopPropagation()}
          className="btn-ghost text-2xs px-2 py-1"
        >
          Open
        </Link>
      </div>
      <span className="inline-flex items-center gap-1.5 shrink-0">
        {invoice.status === 'overdue' && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-claret overdue-dot-pulse" aria-hidden="true" />
        )}
        <StatusPill tone={tone as any}>{invoice.status}</StatusPill>
      </span>
      <div className="w-20 shrink-0 text-right text-[13px] num tabular text-ink">
        {formatCents(invoice.total_cents, currency, { showZero: true })}
      </div>
    </li>
  );
}

async function bulkSend(
  ids: string[],
  invoices: InvoiceRow[],
  reload: () => void,
  clear: () => void,
) {
  const targets = invoices.filter((i) => ids.includes(i.id) && i.status === 'draft');
  if (targets.length === 0) return;
  const recipients = Array.from(new Set(targets.map((i) =>
    i.household?.display_name ?? i.student?.name ?? 'Unknown',
  ))).slice(0, 8).join(', ');
  if (!window.confirm(`Send ${targets.length} draft invoice(s) to: ${recipients}?`)) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;
  let ok = 0;
  for (const t of targets) {
    const res = await fetch(`/api/invoices/${t.id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) ok++;
  }
  clear();
  reload();
}

export default function InvoicesPage() {
  return <AuthGuard><OwnerOnly><InvoicesInner /></OwnerOnly></AuthGuard>;
}
