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
import { ConfirmDrawer } from '../../../components/design/ConfirmDrawer';
import { Banner } from '../../../components/design/Banner';
import { useUndo } from '../../../lib/useUndo';
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

type UnbilledSuggestion = {
  household_name: string;
  household_id: string | null;
  count: number;
  total_cents: number;
  intervalDays: number;
};

function InvoicesInner() {
  const router = useRouter();
  const { t } = useTranslation(['invoices', 'common']);
  const undo = useUndo();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [currency, setCurrency] = useState('AUD');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggestion, setSuggestion] = useState<UnbilledSuggestion | null>(null);
  const [bulkDrawer, setBulkDrawer] = useState<null | 'send' | 'paid'>(null);
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

  // Suggest creating an invoice when a single household has 3+ unbilled
  // sessions. Only show one suggestion at a time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const { data } = await supabase
        .from('sessions')
        .select('id, duration_minutes, scheduled_at, student:students!inner(household_id, hourly_rate_cents, household:households(id, display_name))')
        .eq('status', 'completed')
        .is('invoice_id', null)
        .gte('scheduled_at', since);
      if (cancelled) return;
      const byHh = new Map<string, { name: string; count: number; total: number; first?: string }>();
      for (const s of (data ?? []) as any[]) {
        const hh = s.student?.household;
        if (!hh) continue;
        const cur = byHh.get(hh.id) ?? { name: hh.display_name, count: 0, total: 0 };
        cur.count++;
        cur.total += Math.round(((s.student?.hourly_rate_cents ?? 0) * (s.duration_minutes ?? 0)) / 60);
        byHh.set(hh.id, cur);
      }
      let topHhId: string | null = null;
      let top: { name: string; count: number; total: number } | null = null;
      for (const [hhId, v] of byHh) {
        if (v.count >= 3 && (!top || v.total > top.total)) {
          top = v;
          topHhId = hhId;
        }
      }
      if (!top || !topHhId) { setSuggestion(null); return; }

      // Compute typical interval from past invoices for this household.
      const { data: past } = await supabase
        .from('invoices')
        .select('issued_on, household_id')
        .eq('household_id', topHhId)
        .order('issued_on', { ascending: false })
        .limit(6);
      const issued = ((past ?? []) as any[]).map((i) => new Date(i.issued_on).getTime()).sort((a, b) => b - a);
      let interval = 14;
      if (issued.length >= 2) {
        const diffs: number[] = [];
        for (let i = 0; i < issued.length - 1; i++) {
          diffs.push(Math.round((issued[i] - issued[i + 1]) / 86_400_000));
        }
        diffs.sort((a, b) => a - b);
        interval = diffs[Math.floor(diffs.length / 2)] ?? 14;
      }

      // Snooze check.
      const snoozedKey = `crestio.invoice-suggestion.snoozed.${topHhId}`;
      const snoozedTs = typeof window !== 'undefined' ? Number(window.localStorage.getItem(snoozedKey) ?? 0) : 0;
      if (snoozedTs && Date.now() - snoozedTs < 7 * 86_400_000) { setSuggestion(null); return; }

      setSuggestion({
        household_name: top.name,
        household_id: topHhId,
        count: top.count,
        total_cents: top.total,
        intervalDays: interval,
      });
    })();
    return () => { cancelled = true; };
  }, [invoices]);

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

      <PaydayBanner invoices={invoices} currency={currency} />

      {suggestion && (
        <div className="mb-4 card p-3 md:p-4 border-amber/40 bg-amber-soft/30 flex items-center gap-3 flex-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-ink shrink-0">
            <path d="M12 2v4M12 18v4M5 12H1M23 12h-4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>
          </svg>
          <div className="flex-1 min-w-0 text-sm leading-snug">
            <strong>{suggestion.count} unbilled sessions</strong> for <strong>{suggestion.household_name}</strong> worth {formatCents(suggestion.total_cents, currency)}.{' '}
            <span className="text-ink-muted">Most tutors invoice this group every {suggestion.intervalDays} days.</span>
          </div>
          <Link
            href={`/app/invoices/batch?household_id=${suggestion.household_id}&combine=1`}
            className="btn-primary text-xs"
            style={{ height: 32, minHeight: 32 }}
          >
            Create invoice
          </Link>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && suggestion.household_id) {
                window.localStorage.setItem(`crestio.invoice-suggestion.snoozed.${suggestion.household_id}`, String(Date.now()));
              }
              setSuggestion(null);
            }}
            className="btn-ghost text-xs"
            style={{ height: 32, minHeight: 32 }}
          >
            Snooze
          </button>
        </div>
      )}

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
          onClick={() => setBulkDrawer('send')}
          className="text-xs font-medium bg-cream text-forest-ink px-2.5 py-1 rounded-full hover:bg-cream/90 transition-colors duration-100"
        >
          Send selected ({selected.size})
        </button>
        <button type="button" onClick={() => setBulkDrawer('paid')} className="text-xs text-cream/90 hover:text-cream px-2.5 py-1 rounded-full hover:bg-cream/10 transition-colors duration-100">
          Mark paid
        </button>
      </BulkActionBar>

      <ConfirmDrawer
        open={!!bulkDrawer}
        title={bulkDrawer === 'send' ? 'Send selected invoices' : 'Mark selected as paid'}
        summary={
          bulkDrawer === 'send'
            ? `${selected.size} invoices will be emailed to their parents.`
            : `${selected.size} invoices will be marked paid.`
        }
        items={invoices.filter((i) => selected.has(i.id)).map((i) => ({
          id: i.id,
          label: `${i.number} · ${i.household?.display_name ?? i.student?.name ?? '—'}`,
          sublabel: formatCents(i.total_cents, currency),
          warning: bulkDrawer === 'send' && i.status === 'paid' ? 'Already paid' : undefined,
        }))}
        confirmLabel={bulkDrawer === 'send' ? `Send ${selected.size}` : `Mark ${selected.size} paid`}
        onCancel={() => setBulkDrawer(null)}
        onConfirm={async () => {
          const ids = Array.from(selected);
          if (bulkDrawer === 'send') {
            await bulkSend(ids, invoices, load, clearSelected);
            undo.queue({
              id: `bulk-send-${Date.now()}`,
              label: `${ids.length} ${ids.length === 1 ? 'invoice' : 'invoices'} sent.`,
              holdMs: 5000,
              commit: async () => null,
            });
          } else {
            await bulkMarkPaid();
            undo.queue({
              id: `bulk-paid-${Date.now()}`,
              label: `${ids.length} marked paid.`,
              holdMs: 5000,
              commit: async () => null,
              inverseCommit: async () => {
                await supabase.from('invoices').update({ status: 'sent', paid_at: null }).in('id', ids);
                load();
              },
            });
          }
          setBulkDrawer(null);
        }}
      />

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

// State-of-the-app banner for invoices: payday + month-end variants. Reads
// the current invoice list to compute total unbilled.
function PaydayBanner({ invoices, currency }: { invoices: InvoiceRow[]; currency: string }) {
  const now = new Date();
  const dow = now.getDay();
  const dom = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysUntilEom = lastDay - dom;
  const drafts = invoices.filter((i) => i.status === 'draft');
  const draftTotal = drafts.reduce((a, i) => a + (i.total_cents ?? 0), 0);

  // Friday (5) afternoon (after 12pm) — payday cue.
  if (dow === 5 && now.getHours() >= 12 && drafts.length > 0) {
    return (
      <div className="mb-4">
        <Banner id={`payday-${now.toISOString().slice(0, 10)}`} tone="forest">
          It's Friday — {drafts.length} draft {drafts.length === 1 ? 'invoice' : 'invoices'} ready ({formatCents(draftTotal, currency)}).{' '}
          <Link className="underline underline-offset-2" href="/app/invoices?status=draft">
            Review and send
          </Link>
        </Banner>
      </div>
    );
  }

  if (daysUntilEom <= 3 && drafts.length > 0) {
    return (
      <div className="mb-4">
        <Banner id={`eom-${now.getFullYear()}-${now.getMonth()}`} tone="amber">
          Month closes in {daysUntilEom} {daysUntilEom === 1 ? 'day' : 'days'}. {drafts.length} unbilled.{' '}
          <Link className="underline underline-offset-2" href="/app/invoices?status=draft">
            Review
          </Link>
        </Banner>
      </div>
    );
  }
  return null;
}

export default function InvoicesPage() {
  return <AuthGuard><OwnerOnly><InvoicesInner /></OwnerOnly></AuthGuard>;
}
