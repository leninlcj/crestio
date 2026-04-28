import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuardStudent from '../../components/AuthGuardStudent';
import StudentLayout from '../../components/student/StudentLayout';
import { useStudentMe } from '../../components/student/StudentContext';
import { authFetch } from '../../lib/authFetch';

// /student — the dashboard (Today).  Three calm cards: next session, open
// homework, latest note from tutor.  No streaks, no points, no leaderboard.

type SessionRow = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  status: string;
  notes_parent_facing: string | null;
  parent_notified_at: string | null;
  hasNote: boolean;
  homework: Array<{ index: number; text: string; done: boolean }>;
};

function Inner() {
  const { me } = useStudentMe();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [icsUrl, setIcsUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await authFetch('/api/student/sessions');
      if (!cancelled && res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const now = Date.now();
  const next = sessions
    .filter((s) => new Date(s.scheduled_at).getTime() >= now && s.status !== 'cancelled')
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))[0];
  const openHomework: Array<{ session: SessionRow; item: SessionRow['homework'][number] }> = [];
  for (const s of sessions) {
    for (const h of s.homework) if (!h.done) openHomework.push({ session: s, item: h });
  }
  openHomework.sort((a, b) => +new Date(b.session.scheduled_at) - +new Date(a.session.scheduled_at));

  const latestNote = sessions
    .filter((s) => s.hasNote && s.parent_notified_at)
    .sort((a, b) => +new Date(b.parent_notified_at!) - +new Date(a.parent_notified_at!))[0];

  async function getIcsUrl() {
    const res = await authFetch('/api/student/calendar-token', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setIcsUrl(data.ics_url);
    }
  }

  async function toggleHomework(sessionId: string, index: number, done: boolean) {
    setSessions((prev) => prev.map((s) =>
      s.id !== sessionId ? s : { ...s, homework: s.homework.map((h) => h.index === index ? { ...h, done } : h) }
    ));
    await authFetch('/api/student/homework-toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, homework_index: index, completed: done }),
    });
  }

  const firstName = (me?.profile.full_name ?? '').split(/\s+/)[0] || 'there';

  return (
    <StudentLayout active="today">
      <h1 className="font-display text-[28px] tracking-tightest leading-tight">Hi {firstName}.</h1>
      <p className="text-sm text-ink-muted mt-1">{me?.tutor.name}'s student portal.</p>

      <div className="mt-8 space-y-6">
        {/* Next session */}
        <section className="card p-5">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Next session</div>
          {loading ? (
            <div className="h-6 w-32 bg-ruleSoft rounded animate-pulse" />
          ) : !next ? (
            <p className="text-sm text-ink-muted">No sessions scheduled. Your tutor will set one up soon.</p>
          ) : (
            <>
              <div className="font-display text-2xl tracking-tightest tabular">
                {formatNext(next.scheduled_at)}
              </div>
              <div className="text-sm text-ink mt-1">
                {[next.subject, `${next.duration_minutes} min`, next.topic].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-3">
                {!icsUrl ? (
                  <button type="button" onClick={getIcsUrl} className="text-sm underline text-ink-muted hover:text-ink">
                    Add to my calendar
                  </button>
                ) : (
                  <a href={icsUrl} className="text-sm underline" download>
                    Download .ics
                  </a>
                )}
              </div>
            </>
          )}
        </section>

        {/* Homework */}
        {openHomework.length > 0 && (
          <section className="card p-5">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Homework</div>
            <ul className="space-y-2">
              {openHomework.slice(0, 5).map(({ session, item }) => (
                <li key={`${session.id}-${item.index}`} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Mark ${item.text} done`}
                    checked={item.done}
                    onChange={(e) => toggleHomework(session.id, item.index, e.target.checked)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink">{item.text}</div>
                    <div className="text-2xs text-ink-soft tabular">From {formatDate(session.scheduled_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
            {openHomework.length > 5 && (
              <Link href="/student/homework" className="mt-3 inline-block text-sm text-ink-muted hover:text-ink underline-offset-2">
                View all homework →
              </Link>
            )}
          </section>
        )}

        {/* Latest note */}
        {latestNote && (
          <section className="card p-5">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
              Latest note from {me?.tutor.name}
            </div>
            <div className="text-sm text-ink leading-relaxed">
              {(latestNote.notes_parent_facing ?? '').slice(0, 80)}
              {(latestNote.notes_parent_facing?.length ?? 0) > 80 && '…'}
            </div>
            <Link href={`/student/sessions/${latestNote.id}`} className="mt-3 inline-block text-sm text-ink-muted hover:text-ink underline-offset-2">
              Read full →
            </Link>
          </section>
        )}
      </div>
    </StudentLayout>
  );
}

function formatNext(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function Page() {
  return <AuthGuardStudent><Inner /></AuthGuardStudent>;
}
