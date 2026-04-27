import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { DetailPane } from '../design/DetailPane';
import { StatusPill } from '../design/StatusPill';
import { Skeleton } from '../design/Skeleton';
import { formatDate, formatTime, formatCents, sessionAmount } from '../../lib/utils';

type Props = {
  open: boolean;
  sessionId: string | null;
  onClose: () => void;
  currency: string;
  onChanged?: () => void;
};

type Detail = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  status: string;
  paid: boolean;
  charge_rate_cents: number | null;
  pay_rate_cents: number | null;
  notes_internal: string | null;
  notes_parent_facing: string | null;
  parent_notified_at: string | null;
  invoice_id: string | null;
  student: { id: string; name: string } | null;
  tutor: { id: string; name: string } | null;
};

export function SessionDetailPane({ open, sessionId, onClose, currency, onChanged }: Props) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !sessionId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: row } = await supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes, subject, topic, status, paid, charge_rate_cents, pay_rate_cents, notes_internal, notes_parent_facing, parent_notified_at, invoice_id, student:students(id,name), tutor:tutors(id,name)')
        .eq('id', sessionId)
        .maybeSingle();
      if (!cancelled) {
        setData(row as any);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, sessionId]);

  return (
    <DetailPane
      open={open}
      onClose={onClose}
      title={
        loading || !data
          ? 'Session'
          : <>{data.student?.name ?? 'Session'}{' '}<span className="text-ink-soft text-xs font-normal">· {formatTime(data.scheduled_at)}</span></>
      }
      fullPageHref={sessionId ? `/app/sessions/${sessionId}` : undefined}
    >
      {loading || !data ? (
        <div className="p-5 space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="p-5 space-y-5">
          <SessionMeta data={data} currency={currency} />

          <section>
            <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-2">
              Tutor notes (internal)
            </div>
            {data.notes_internal ? (
              <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{data.notes_internal}</p>
            ) : (
              <p className="text-sm text-ink-soft italic">No notes yet.</p>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium">
                Polished update for parent
              </div>
              {data.parent_notified_at && (
                <span className="text-2xs text-forest">Sent {formatDate(data.parent_notified_at)}</span>
              )}
            </div>
            {data.notes_parent_facing ? (
              <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{data.notes_parent_facing}</p>
            ) : data.notes_internal ? (
              <Link
                href={`/app/sessions/${data.id}?polish=1`}
                className="btn-primary text-xs"
                style={{ height: 32, minHeight: 32 }}
              >
                Polish notes
              </Link>
            ) : (
              <p className="text-sm text-ink-soft italic">Log notes first.</p>
            )}
          </section>

          <section className="pt-4 border-t border-rule flex items-center gap-2">
            <Link
              href={`/app/sessions/${data.id}`}
              className="btn-secondary text-xs"
              style={{ height: 32, minHeight: 32 }}
            >
              Edit session
            </Link>
            {data.status === 'scheduled' && (
              <Link
                href={`/app/sessions/${data.id}?action=log`}
                className="btn-primary text-xs"
                style={{ height: 32, minHeight: 32 }}
              >
                Log session
              </Link>
            )}
          </section>
        </div>
      )}
    </DetailPane>
  );
}

function SessionMeta({ data, currency }: { data: Detail; currency: string }) {
  const tone =
    data.status === 'completed' && data.paid ? 'success'
    : data.status === 'completed' ? 'rust'
    : data.status === 'cancelled' ? 'neutral'
    : data.status === 'no_show' ? 'claret'
    : 'forest';
  const label =
    data.status === 'completed' ? (data.paid ? 'Paid' : 'Unpaid')
    : data.status;
  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <Field label="When" value={`${formatDate(data.scheduled_at)} · ${formatTime(data.scheduled_at)}`} />
      <Field label="Duration" value={`${data.duration_minutes} min`} />
      <Field label="Subject" value={[data.subject, data.topic].filter(Boolean).join(' · ') || '—'} />
      <Field label="Tutor" value={data.tutor?.name ?? 'You'} />
      <Field label="Amount" value={formatCents(sessionAmount(data as any), currency)} />
      <Field label="Status" value={<StatusPill tone={tone as any}>{label}</StatusPill>} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-1">{label}</div>
      <div className="text-sm text-ink">{value}</div>
    </div>
  );
}

export default SessionDetailPane;
