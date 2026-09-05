import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../components/AuthGuardParent';
import ParentLayout from '../../components/parent/ParentLayout';
import { useParentContext } from '../../components/parent/ParentContext';
import { supabase } from '../../lib/supabase';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';

type SessionRow = {
  id: string;
  student_id: string;
  student_name: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  status: string;
  notes_parent_facing: string | null;
};

type Filter = 'all' | 'upcoming' | 'completed' | 'this_month';

function Inner() {
  const { t } = useTranslation('parent');
  const { overview, loading: ctxLoading } = useParentContext();
  const { formatDate, formatTimeOfDay } = useLocaleFormatters();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const studentIds = useMemo(() => (overview?.students ?? []).map((s) => s.id), [overview]);

  useEffect(() => {
    if (ctxLoading) return;
    if (studentIds.length === 0) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sessions')
        .select('id, student_id, scheduled_at, duration_minutes, subject, status, notes_parent_facing, student:students!inner(id, name)')
        .in('student_id', studentIds)
        .order('scheduled_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      setSessions(((data ?? []) as any[]).map((s) => ({
        id: s.id,
        student_id: s.student_id,
        student_name: s.student?.name ?? '–',
        scheduled_at: s.scheduled_at,
        duration_minutes: s.duration_minutes,
        subject: s.subject,
        status: s.status,
        notes_parent_facing: s.notes_parent_facing,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [studentIds.join(','), ctxLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return sessions.filter((s) => {
      if (filter === 'upcoming') return new Date(s.scheduled_at) >= now && s.status !== 'cancelled' && s.status !== 'completed';
      if (filter === 'completed') return s.status === 'completed';
      if (filter === 'this_month') return new Date(s.scheduled_at) >= monthStart;
      return true;
    });
  }, [sessions, filter]);

  return (
    <section className="px-6 md:px-12 pt-10 pb-16 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-1">
          {t('sessions_page.heading')}
        </h1>
        <p className="text-sm text-ink-muted">{t('sessions_page.sub')}</p>
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-thin -mx-6 px-6 md:mx-0 md:px-0">
        {(['all', 'upcoming', 'completed', 'this_month'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={[
              'px-3 py-1.5 text-xs whitespace-nowrap rounded-full border transition-colors',
              filter === f
                ? 'border-forest bg-forest text-cream'
                : 'border-rule text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {t(`sessions_page.filter_${f}`)}
          </button>
        ))}
      </div>

      {loading || ctxLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-ruleSoft rounded-md" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-rule bg-surface p-6 text-sm text-ink-muted">
          {t('sessions_page.empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const upcoming = new Date(s.scheduled_at) >= new Date() && s.status !== 'completed' && s.status !== 'cancelled';
            return (
              <Link
                key={s.id}
                href={`/parent/student/${s.student_id}#session-${s.id}`}
                className={[
                  'block p-4 rounded-md border bg-surface hover:bg-cream transition-colors',
                  upcoming ? 'border-forest/30' : 'border-rule',
                ].join(' ')}
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-sm font-medium text-ink">{s.student_name}</div>
                    <div className="text-2xs text-ink-soft mt-0.5">
                      {formatDate(s.scheduled_at, { weekday: 'short', day: 'numeric', month: 'short' })}
                      {' · '}
                      {formatTimeOfDay(s.scheduled_at)}
                      {' · '}
                      {t('dashboard_v2.duration_minutes', { count: s.duration_minutes })}
                      {s.subject ? ` · ${s.subject}` : ''}
                    </div>
                  </div>
                  <span className={[
                    'pill text-2xs',
                    s.status === 'completed' ? 'pill-forest' :
                    s.status === 'cancelled' ? 'pill-claret' :
                    s.status === 'no_show'   ? 'pill-rust'   :
                    'pill-neutral',
                  ].join(' ')}>
                    {t(`sessions_page.status_${s.status}`, { defaultValue: s.status })}
                  </span>
                </div>
                {s.notes_parent_facing && s.status === 'completed' && (
                  <p className="text-sm text-ink-muted leading-relaxed mt-2 line-clamp-2">
                    {s.notes_parent_facing.slice(0, 200)}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function ParentSessions() {
  return (
    <AuthGuardParent>
      <ParentLayout active="sessions">
        <Inner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
