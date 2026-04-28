import { useEffect, useState, useMemo } from 'react';
import AuthGuardStudent from '../../components/AuthGuardStudent';
import StudentLayout from '../../components/student/StudentLayout';
import { authFetch } from '../../lib/authFetch';

type Sess = {
  id: string;
  scheduled_at: string;
  subject: string | null;
  homework: { index: number; text: string; done: boolean }[];
};

function Inner() {
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await authFetch('/api/student/sessions');
      if (res.ok) setSessions((await res.json()).sessions ?? []);
      setLoading(false);
    })();
  }, []);

  async function toggle(sessionId: string, index: number, done: boolean) {
    setSessions((prev) => prev.map((s) =>
      s.id !== sessionId ? s : { ...s, homework: s.homework.map((h) => h.index === index ? { ...h, done } : h) }
    ));
    await authFetch('/api/student/homework-toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, homework_index: index, completed: done }),
    });
  }

  const open = useMemo(() => sessions
    .filter((s) => s.homework.some((h) => !h.done))
    .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)),
  [sessions]);

  const recentlyDone = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    return sessions
      .filter((s) => new Date(s.scheduled_at).getTime() >= cutoff && s.homework.some((h) => h.done))
      .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
  }, [sessions]);

  return (
    <StudentLayout active="homework" title="Homework">
      <h1 className="font-display text-[28px] tracking-tightest">Homework</h1>

      {loading ? (
        <p className="mt-6 text-sm text-ink-muted">Loading…</p>
      ) : open.length === 0 && recentlyDone.length === 0 ? (
        <p className="mt-8 text-sm text-ink-muted">
          No homework right now. Your tutor will assign some after your next session.
        </p>
      ) : (
        <>
          <div className="mt-6 space-y-4">
            {open.map((s) => (
              <section key={s.id} className="card p-5">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
                  {formatDate(s.scheduled_at)} · {s.subject ?? '—'}
                </div>
                <ul className="space-y-2">
                  {s.homework.filter((h) => !h.done).map((h) => (
                    <li key={h.index} className="flex items-start gap-3">
                      <input type="checkbox" checked={false}
                        onChange={(e) => toggle(s.id, h.index, e.target.checked)}
                        className="mt-1" aria-label={`Mark "${h.text}" done`} />
                      <span className="text-sm text-ink">{h.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {recentlyDone.length > 0 && (
            <details className="mt-8 group">
              <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink list-none flex items-center gap-2">
                <span>Past completed (last 30 days)</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-open:rotate-180 transition-transform">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </summary>
              <ul className="mt-3 space-y-1.5">
                {recentlyDone.flatMap((s) => s.homework.filter((h) => h.done).map((h) => (
                  <li key={`${s.id}-${h.index}`} className="flex items-start gap-3 text-sm text-ink-soft">
                    <input type="checkbox" checked={true}
                      onChange={(e) => toggle(s.id, h.index, e.target.checked)}
                      className="mt-1" aria-label={`Unmark "${h.text}" done`} />
                    <span className="line-through">{h.text}</span>
                  </li>
                )))}
              </ul>
            </details>
          )}
        </>
      )}
    </StudentLayout>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function Page() {
  return <AuthGuardStudent><Inner /></AuthGuardStudent>;
}
