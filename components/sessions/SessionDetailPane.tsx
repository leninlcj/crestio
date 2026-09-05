import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { DetailPane } from '../design/DetailPane';
import { StatusPill } from '../design/StatusPill';
import { Skeleton } from '../design/Skeleton';
import { Stepper, type Step } from '../design/Stepper';
import { RichEditor } from '../design/RichEditor';
import { useToast } from '../design/Toast';
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
  const toast = useToast();

  const notesSectionRef = useRef<HTMLDivElement | null>(null);
  const polishedSectionRef = useRef<HTMLDivElement | null>(null);
  const sentSectionRef = useRef<HTMLDivElement | null>(null);
  const billedSectionRef = useRef<HTMLDivElement | null>(null);

  // Local state for inline-editable notes (auto-save).
  const [internalDraft, setInternalDraft] = useState<string>('');

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
        setInternalDraft((row as any)?.notes_internal ?? '');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, sessionId]);

  async function saveInternalNotes() {
    if (!sessionId) return;
    const { error } = await supabase
      .from('sessions')
      .update({ notes_internal: internalDraft })
      .eq('id', sessionId);
    if (error) {
      toast.show({ message: 'Couldn’t save notes.', tone: 'error' });
      throw error;
    }
    onChanged?.();
  }

  const steps: Step[] = data ? buildSteps(data, {
    notes: notesSectionRef,
    polished: polishedSectionRef,
    sent: sentSectionRef,
    billed: billedSectionRef,
  }) : [];

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
        <div className="p-5 space-y-5" data-pane-print="true">
          {/* Pipeline stepper at top of pane. */}
          <div className="-mt-1 mb-1">
            <Stepper steps={steps} />
          </div>

          <SessionMeta data={data} currency={currency} />

          <section ref={notesSectionRef}>
            <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-2">
              Tutor notes (internal)
            </div>
            <RichEditor
              value={internalDraft}
              onChange={setInternalDraft}
              placeholder="What happened in this session?"
              autoSaveMs={2000}
              onAutoSave={saveInternalNotes}
              minHeight={140}
              ariaLabel="Tutor notes"
            />
          </section>

          <section ref={polishedSectionRef}>
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

          <section ref={sentSectionRef} className="hidden" aria-hidden="true" />
          <section ref={billedSectionRef} className="hidden" aria-hidden="true" />

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

function buildSteps(d: Detail, refs: Record<string, React.RefObject<HTMLElement>>): Step[] {
  const scheduledDone = d.status !== 'cancelled' && d.status !== 'no_show';
  const loggedDone = d.status === 'completed';
  const polishedDone = !!d.notes_parent_facing;
  const sentDone = !!d.parent_notified_at;
  const invoicedDone = !!d.invoice_id;
  const paidDone = !!d.paid;

  function go(ref?: React.RefObject<HTMLElement>) {
    return ref?.current
      ? () => ref.current!.scrollIntoView({ behavior: 'smooth', block: 'start' })
      : undefined;
  }

  return [
    { key: 'sched',     label: 'Scheduled', state: scheduledDone ? 'done' : 'todo' },
    { key: 'logged',    label: 'Logged',    state: loggedDone ? 'done' : (scheduledDone ? 'current' : 'todo'), onClick: go(refs.notes) },
    { key: 'polished',  label: 'Polished',  state: polishedDone ? 'done' : (loggedDone ? 'current' : 'todo'), onClick: go(refs.polished) },
    { key: 'sent',      label: 'Sent',      state: sentDone ? 'done' : (polishedDone ? 'current' : 'todo'), onClick: go(refs.sent) },
    { key: 'invoiced',  label: 'Invoiced',  state: invoicedDone ? 'done' : (sentDone ? 'current' : 'todo'), onClick: go(refs.billed) },
    { key: 'paid',      label: 'Paid',      state: paidDone ? 'done' : (invoicedDone ? 'current' : 'todo') },
  ];
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
      <Field label="Subject" value={[data.subject, data.topic].filter(Boolean).join(' · ') || '–'} />
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
