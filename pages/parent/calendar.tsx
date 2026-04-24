import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuardParent from '../../components/AuthGuardParent';
import { supabase } from '../../lib/supabase';
import { WeekCalendar, mondayOfWeek } from '../../components/calendar/WeekCalendar';
import { SessionDetailModal } from '../../components/calendar/SessionDetailModal';
import type { CalendarSession } from '../../components/calendar/types';

function ParentCalendarInner() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOfWeek(new Date()));
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [detailSession, setDetailSession] = useState<CalendarSession | null>(null);

  const rangeEnd = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d;
  }, [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }

    // Re-use the overview endpoint's students list then fetch this-week across all.
    const res = await fetch('/api/parent/overview', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) { setLoading(false); return; }
    const payload = await res.json();
    const studentIds = payload.students.map((s: any) => s.id);
    if (studentIds.length === 0) { setSessions([]); setLoading(false); return; }

    // Parent can select sessions via RLS when they're linked to the student.
    const { data } = await supabase
      .from('sessions')
      .select('id, student_id, subject, scheduled_at, duration_minutes, status, proposed_change_by, proposed_new_start_time, student:students!inner(id, name)')
      .in('student_id', studentIds)
      .gte('scheduled_at', weekStart.toISOString())
      .lt('scheduled_at', rangeEnd.toISOString())
      .order('scheduled_at', { ascending: true });

    setSessions(((data ?? []) as any[]).map((s) => ({
      id: s.id,
      student_id: s.student_id,
      student_name: s.student?.name ?? 'Unknown',
      subject: s.subject,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      status: s.status,
      proposed_change_by: s.proposed_change_by,
      proposed_new_start_time: s.proposed_new_start_time,
    })));
    setLoading(false);
  }, [weekStart, rangeEnd]);

  useEffect(() => { load(); }, [load]);

  function shiftWeek(days: number) {
    const d = new Date(weekStart); d.setDate(d.getDate() + days); setWeekStart(d);
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/dashboard" className="text-sm text-ink-muted hover:text-ink">← Dashboard</Link>
      </nav>

      <main className="px-4 md:px-12 py-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Calendar</div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tightest">This week</h1>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => shiftWeek(-7)} className="btn-ghost text-xs">‹</button>
          <button onClick={() => setWeekStart(mondayOfWeek(new Date()))} className="btn-ghost text-xs">Today</button>
          <button onClick={() => shiftWeek(7)} className="btn-ghost text-xs">›</button>
          <span className="text-sm text-ink ml-2">
            {weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – {
              new Date(weekStart.getTime() + 6 * 86_400_000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
            }
          </span>
        </div>

        {loading ? (
          <div className="card p-6 text-sm text-ink-muted">Loading…</div>
        ) : (
          <WeekCalendar
            weekStart={weekStart}
            sessions={sessions}
            onClickSession={(s) => setDetailSession(s)}
            readOnly
          />
        )}

        <SessionDetailModal
          open={!!detailSession}
          onClose={() => setDetailSession(null)}
          session={detailSession}
          onChanged={load}
          mode="parent"
        />
      </main>
    </div>
  );
}

export default function ParentCalendar() {
  return <AuthGuardParent><ParentCalendarInner /></AuthGuardParent>;
}
