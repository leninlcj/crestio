import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';

type LatestSession = {
  id: string;
  student_id: string;
  student_name: string;
  scheduled_at: string;
  notes_parent_facing: string | null;
};

type Props = { studentIds: string[] };

export default function LatestSessionCard({ studentIds }: Props) {
  const { t } = useTranslation('parent');
  const { formatDate } = useLocaleFormatters();
  const [latest, setLatest] = useState<LatestSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (studentIds.length === 0) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('sessions')
        .select('id, student_id, scheduled_at, notes_parent_facing, student:students!inner(id, name)')
        .in('student_id', studentIds)
        .eq('status', 'completed')
        .not('notes_parent_facing', 'is', null)
        .order('scheduled_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = (data ?? [])[0] as any;
      if (row) {
        setLatest({
          id: row.id,
          student_id: row.student_id,
          student_name: row.student?.name ?? '—',
          scheduled_at: row.scheduled_at,
          notes_parent_facing: row.notes_parent_facing,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [studentIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <section className="rounded-md border border-rule bg-surface p-5 md:p-6 animate-pulse">
        <div className="h-3 w-24 bg-ruleSoft rounded mb-3" />
        <div className="h-4 w-full bg-ruleSoft rounded mb-2" />
        <div className="h-4 w-3/4 bg-ruleSoft rounded" />
      </section>
    );
  }

  if (!latest) {
    return <LatestSessionPending studentIds={studentIds} />;
  }

  const preview = (latest.notes_parent_facing ?? '').slice(0, 200);
  const truncated = (latest.notes_parent_facing ?? '').length > 200;

  return (
    <Link
      href={`/parent/student/${latest.student_id}#session-${latest.id}`}
      className="rounded-md border border-rule bg-surface p-5 md:p-6 block hover:bg-cream transition-colors"
    >
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <h2 className="text-2xs uppercase tracking-widest text-ink-soft">
          {t('dashboard_v2.latest_session')}
        </h2>
        <span className="text-2xs text-ink-soft tabular-nums">
          {formatDate(latest.scheduled_at, { day: 'numeric', month: 'short' })}
        </span>
      </div>
      <div className="text-sm text-ink font-medium mb-2">{latest.student_name}</div>
      <p className="text-sm text-ink-muted leading-relaxed line-clamp-2">
        {preview}{truncated ? '…' : ''}
      </p>
      <div className="text-xs text-forest mt-3 hover:underline underline-offset-4">
        {t('dashboard_v2.read_full_note')} →
      </div>
    </Link>
  );
}

// Pending state — there's a recent completed session but the polished note
// hasn't shipped yet. Soft "tutor is working on it" copy.
function LatestSessionPending({ studentIds }: { studentIds: string[] }) {
  const { t } = useTranslation('parent');
  const { formatDate } = useLocaleFormatters();
  const [pending, setPending] = useState<{ student_name: string; scheduled_at: string } | null>(null);

  useEffect(() => {
    if (studentIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('sessions')
        .select('scheduled_at, student:students!inner(name)')
        .in('student_id', studentIds)
        .eq('status', 'completed')
        .is('notes_parent_facing', null)
        .order('scheduled_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = (data ?? [])[0] as any;
      if (row) setPending({ student_name: row.student?.name ?? '—', scheduled_at: row.scheduled_at });
    })();
    return () => { cancelled = true; };
  }, [studentIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pending) {
    const within24h = Date.now() - new Date(pending.scheduled_at).getTime() < 30 * 3600_000;
    return (
      <section className="rounded-md border border-rule bg-surface p-5 md:p-6">
        <h2 className="text-2xs uppercase tracking-widest text-ink-soft mb-2">
          {t('dashboard_v2.latest_session')}
        </h2>
        <div className="text-sm text-ink leading-relaxed">
          {within24h ? (
            <>Your tutor is working on {pending.student_name.split(' ')[0]}'s notes from {formatDate(pending.scheduled_at, { weekday: 'long' }).toLowerCase()}'s session. Check back tonight.</>
          ) : (
            <>Notes for {pending.student_name.split(' ')[0]}'s last session are coming soon.</>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-rule bg-surface p-5 md:p-6">
      <h2 className="text-2xs uppercase tracking-widest text-ink-soft mb-2">
        {t('dashboard_v2.latest_session')}
      </h2>
      <div className="text-sm text-ink-muted">{t('dashboard_v2.no_latest_session')}</div>
    </section>
  );
}
