import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatTimeOfDay } from '../../lib/formatTime';

// Right-now card.
// Five mutually exclusive states (in priority order):
//   1. session in progress       → show timer + "Open log"
//   2. next session in ≤60 min    → countdown + "Start session"
//   3. next session is later today → time + duration
//   4. next session is later this week → day + time
//   5. nothing scheduled this week → "Nothing scheduled. [Add session]"

export type RightNowSession = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  student_name: string;
};

export type RightNowProps = {
  /** The next scheduled session (anywhere in the future). */
  nextSession: RightNowSession | null;
  /** Sessions happening today, in chronological order. */
  todaySessions: RightNowSession[];
  /** Sessions later this week, in chronological order. */
  weekAhead: RightNowSession[];
};

function useTickingNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'starting now';
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  if (mins >= 1) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

function formatElapsed(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const dayMs = 86_400_000;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tomorrow = new Date(now.getTime() + dayMs);
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short' });
}

export function RightNowCard({ nextSession, todaySessions, weekAhead }: RightNowProps) {
  const now = useTickingNow(1000);
  const nowDate = new Date(now);

  // Find a session currently in progress.
  const inProgress = todaySessions.find((s) => {
    const start = new Date(s.scheduled_at).getTime();
    const end = start + (s.duration_minutes ?? 0) * 60_000;
    return now >= start && now <= end;
  });

  if (inProgress) {
    const start = new Date(inProgress.scheduled_at).getTime();
    return (
      <div
        className="card p-5 md:p-6 bg-forest-soft/40 border-forest/30"
        data-test-id="right-now-card"
        data-state="in-progress"
      >
        <div className="text-2xs uppercase tracking-widest text-forest font-medium mb-2">In session</div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-display text-2xl tracking-tightest leading-tight" data-test-id="right-now-title">
              {inProgress.student_name}
            </div>
            <div className="text-sm text-ink-muted mt-1">
              {[inProgress.subject, `${inProgress.duration_minutes} min`].filter(Boolean).join(' · ')}
              {' · '}
              <span className="num tabular text-forest" data-test-id="right-now-elapsed">
                {formatElapsed(now - start)} elapsed
              </span>
            </div>
          </div>
          <Link
            href={`/app/sessions/${inProgress.id}`}
            className="btn-primary text-sm"
            data-test-id="right-now-cta"
          >
            Open log
          </Link>
        </div>
      </div>
    );
  }

  // Next session within 60 minutes.
  if (nextSession) {
    const start = new Date(nextSession.scheduled_at).getTime();
    const diff = start - now;
    const sameDay = new Date(start).toDateString() === nowDate.toDateString();
    if (diff > 0 && diff <= 60 * 60_000) {
      return (
        <div
          className="card p-5 md:p-6 bg-amber-soft/40 border-amber/30"
          data-test-id="right-now-card"
          data-state="starting-soon"
        >
          <div className="text-2xs uppercase tracking-widest text-amber-ink font-medium mb-2">
            Starts in <span className="num tabular" data-test-id="right-now-countdown">{formatCountdown(diff)}</span>
          </div>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="font-display text-2xl tracking-tightest leading-tight" data-test-id="right-now-title">
                {nextSession.student_name}
              </div>
              <div className="text-sm text-ink-muted mt-1">
                {[nextSession.subject, formatTimeOfDay(nextSession.scheduled_at), `${nextSession.duration_minutes} min`]
                  .filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/app/sessions/${nextSession.id}`}
                className="btn-secondary text-sm"
                data-test-id="right-now-link"
              >
                Open
              </Link>
              <Link
                href={`/app/sessions/${nextSession.id}?start=1`}
                className="btn-primary text-sm"
                data-test-id="right-now-cta"
              >
                Start session
              </Link>
            </div>
          </div>
        </div>
      );
    }

    if (sameDay) {
      return (
        <div className="card p-5 md:p-6" data-test-id="right-now-card" data-state="later-today">
          <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium mb-2">Next today</div>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="font-display text-2xl tracking-tightest leading-tight" data-test-id="right-now-title">
                {nextSession.student_name}
              </div>
              <div className="text-sm text-ink-muted mt-1">
                {[
                  formatTimeOfDay(nextSession.scheduled_at),
                  nextSession.subject,
                  `${nextSession.duration_minutes} min`,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Link
              href={`/app/sessions/${nextSession.id}`}
              className="btn-secondary text-sm"
              data-test-id="right-now-link"
            >
              Open session
            </Link>
          </div>
        </div>
      );
    }

    // Later this week.
    const day = dayLabel(nextSession.scheduled_at, nowDate);
    return (
      <div className="card p-5 md:p-6" data-test-id="right-now-card" data-state="later-this-week">
        <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium mb-2">Nothing today</div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-display text-2xl tracking-tightest leading-tight" data-test-id="right-now-title">
              Next: {day} {formatTimeOfDay(nextSession.scheduled_at)}
            </div>
            <div className="text-sm text-ink-muted mt-1">
              {nextSession.student_name}
              {nextSession.subject ? ` · ${nextSession.subject}` : ''}
            </div>
          </div>
          <Link
            href={`/app/sessions/${nextSession.id}`}
            className="btn-secondary text-sm"
            data-test-id="right-now-link"
          >
            View
          </Link>
        </div>
      </div>
    );
  }

  // Nothing scheduled this week.
  return (
    <div className="card p-5 md:p-6" data-test-id="right-now-card" data-state="empty">
      <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium mb-2">Right now</div>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-display text-2xl tracking-tightest leading-tight" data-test-id="right-now-title">
            Nothing scheduled.
          </div>
          <div className="text-sm text-ink-muted mt-1">Plan a session to get started.</div>
        </div>
        <Link
          href="/app/sessions/new"
          className="btn-primary text-sm"
          data-test-id="right-now-cta"
        >
          Add session
        </Link>
      </div>
    </div>
  );
}

export default RightNowCard;
