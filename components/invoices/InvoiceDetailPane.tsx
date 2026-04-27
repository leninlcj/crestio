import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { DetailPane } from '../design/DetailPane';
import { StatusPill } from '../design/StatusPill';
import { Skeleton } from '../design/Skeleton';
import { formatCents, formatDate } from '../../lib/utils';

type Props = {
  open: boolean;
  invoiceId: string | null;
  onClose: () => void;
  currency: string;
  onChanged?: () => void;
};

type Detail = {
  id: string;
  number: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
  issued_on: string;
  due_on: string | null;
  subtotal_cents: number;
  total_cents: number;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  is_batch_generated: boolean;
  household: { id: string; display_name: string } | null;
  student: { id: string; name: string } | null;
};

type LineItem = {
  id: string;
  duration_minutes: number;
  amount_cents: number;
  hourly_rate_cents: number;
  line_item_description: string;
};

const TONE: Record<Detail['status'], 'success' | 'rust' | 'claret' | 'neutral' | 'forest'> = {
  draft: 'neutral',
  sent: 'forest',
  paid: 'success',
  overdue: 'claret',
  void: 'neutral',
};

export function InvoiceDetailPane({ open, invoiceId, onClose, currency, onChanged }: Props) {
  const [data, setData] = useState<Detail | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !invoiceId) { setData(null); setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: inv }, { data: lines }] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, number, status, issued_on, due_on, subtotal_cents, total_cents, notes, sent_at, paid_at, is_batch_generated, household:households(id,display_name), student:students(id,name)')
          .eq('id', invoiceId)
          .maybeSingle(),
        supabase
          .from('invoice_sessions')
          .select('id, duration_minutes, amount_cents, hourly_rate_cents, line_item_description')
          .eq('invoice_id', invoiceId)
          .order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      setData(inv as any);
      setItems((lines ?? []) as LineItem[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, invoiceId]);

  async function markPaid() {
    if (!invoiceId) return;
    await supabase.from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', invoiceId);
    setData((d) => d ? { ...d, status: 'paid', paid_at: new Date().toISOString() } : d);
    onChanged?.();
  }

  return (
    <DetailPane
      open={open}
      onClose={onClose}
      fullPageHref={invoiceId ? `/app/invoices/${invoiceId}` : undefined}
      title={
        loading || !data ? 'Invoice'
        : <>{data.number}{' '}<span className="text-ink-soft text-xs font-normal">· {data.household?.display_name ?? data.student?.name ?? '—'}</span></>
      }
    >
      {loading || !data ? (
        <div className="p-5 space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div>
          <div className="px-5 py-4 border-b border-rule">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="display-num text-ink leading-none">
                  {formatCents(data.total_cents, currency, { showZero: true })}
                </div>
                <div className="text-2xs text-ink-muted mt-1.5 tabular">
                  Issued {formatDate(data.issued_on)}{data.due_on ? ` · Due ${formatDate(data.due_on)}` : ''}
                </div>
              </div>
              <StatusPill tone={TONE[data.status]}>{data.status.toUpperCase()}</StatusPill>
            </div>
          </div>

          <div className="p-5">
            <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-2">Line items</div>
            {items.length === 0 ? (
              <p className="text-sm text-ink-soft italic">No line items.</p>
            ) : (
              <ul className="divide-y divide-rule -mx-2">
                {items.map((it) => (
                  <li key={it.id} className="px-2 py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0 text-xs text-ink truncate">
                      {it.line_item_description}
                    </div>
                    <div className="text-2xs text-ink-soft tabular">
                      {it.duration_minutes}m · {formatCents(it.hourly_rate_cents, currency)}/h
                    </div>
                    <div className="text-xs text-ink tabular w-20 text-right">
                      {formatCents(it.amount_cents, currency)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-rule pt-3 mt-3 text-sm">
              <span className="text-ink-muted">Total</span>
              <span className="font-medium text-ink tabular">
                {formatCents(data.total_cents, currency, { showZero: true })}
              </span>
            </div>
          </div>

          {data.notes && (
            <div className="px-5 pb-5 -mt-2">
              <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-1">Notes</div>
              <p className="text-sm text-ink whitespace-pre-wrap">{data.notes}</p>
            </div>
          )}

          <InvoiceTimeline data={data} />

          <div className="px-5 py-4 border-t border-rule flex items-center gap-2">
            <Link href={`/app/invoices/${data.id}`} className="btn-secondary text-xs" style={{ height: 32, minHeight: 32 }}>
              Open invoice
            </Link>
            {data.status !== 'paid' && data.status !== 'void' && (
              <button type="button" onClick={markPaid} className="btn-primary text-xs" style={{ height: 32, minHeight: 32 }}>
                Mark paid
              </button>
            )}
          </div>
        </div>
      )}
    </DetailPane>
  );
}

// Timeline of every event for the invoice. Reads only what the invoices row
// already exposes — created_at, sent_at, paid_at — and a void marker. No
// new endpoint required.
function InvoiceTimeline({ data }: { data: Detail }) {
  const events: Array<{ at: string; label: string; actor?: string }> = [];
  events.push({ at: data.issued_on, label: 'Created', actor: data.is_batch_generated ? 'Batch' : 'You' });
  if (data.sent_at) events.push({ at: data.sent_at, label: 'Sent to parent', actor: 'You' });
  if (data.paid_at) events.push({ at: data.paid_at, label: 'Paid', actor: 'Stripe' });
  if (data.status === 'void') events.push({ at: data.issued_on, label: 'Voided', actor: 'You' });
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return (
    <div className="px-5 pb-5">
      <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-2">Timeline</div>
      <ol className="space-y-2 relative pl-3 border-l border-rule">
        {events.map((e, i) => (
          <li key={`${e.label}-${i}`} className="relative">
            <span className="absolute -left-[7px] top-1.5 w-2 h-2 rounded-full bg-forest" aria-hidden="true" />
            <div className="text-sm text-ink">{e.label}</div>
            <div className="text-2xs text-ink-soft num tabular">
              {formatDate(e.at)}
              {e.actor && <> · {e.actor}</>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default InvoiceDetailPane;
