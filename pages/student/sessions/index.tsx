import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuardStudent from '../../../components/AuthGuardStudent';
import StudentLayout from '../../../components/student/StudentLayout';
import { authFetch } from '../../../lib/authFetch';

type Sess = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  status: string;
  hasNote: boolean;
  homework: { index: number; text: string; done: boolean }[];
};

function Inner() {
  const [rows, setRows] = useState<Sess[]>([]);
  const [filter, setFilter] = useState<'this_month' | 'past_3_months' | 'all'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await authFetch('/api/student/sessions');
      if (res.ok) setRows((await res.json()).sessions ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    const now = Date.now();
    if (filter === 'this_month') {
      const month = new Date().getMonth(); const year = new Date().getFullYear();
      list = list.filter((s) => {
        const d = new Date(s.scheduled_at);
        return d.getMonth() === month && d.getFullYear() === year;
      });
    } else if (filter === 'past_3_months') {
      const cutoff = now - 90 * 86400_000;
      list = list.filter((s) => new Date(s.scheduled_at).getTime() >= cutoff);
    }
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((s) => [s.subject, s.topic, s.scheduled_at].join(' ').toLowerCase().includes(q));
    }
    return list;
  }, [rows, filter, query]);

  return (
    <StudentLayout active="sessions" title="Sessions">
      <h1 className="font-display text-[28px] tracking-tightest">Sessions</h1>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {[
          { v: 'this_month', l: 'This month' },
          { v: 'past_3_months', l: 'Past 3 months' },
          { v: 'all', l: 'All' },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setFilter(o.v as any)}
            className={[
              'text-xs px-3 py-1.5 rounded-full border transition-colors',
              filter === o.v ? 'bg-forest text-cream border-forest' : 'border-rule text-ink-muted hover:bg-ruleSoft',
            ].join(' ')}
          >
            {o.l}
          </button>
        ))}
        <input
          type="search"
          placeholder="Search by date or topic"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input text-sm flex-1 min-w-[200px]"
        />
      </div>

      <div className="mt-6 card overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-ink-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-ink-muted text-center">
            No sessions yet. They'll appear here after your first one.
          </div>
        ) : (
          <ul className="divide-y divide-ruleSoft">
            {filtered.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/student/sessions/${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-ruleSoft/40 transition-colors min-h-[56px]"
                >
                  <div className="w-32 shrink-0">
                    <div className="text-sm text-ink tabular">{formatLong(s.scheduled_at)}</div>
                    <div className="text-2xs text-ink-soft tabular">{formatTime(s.scheduled_at)} · {s.duration_minutes}m</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{s.subject ?? '–'}</div>
                    <div className="text-2xs text-ink-soft truncate">{s.topic ?? ''}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.hasNote ? (
                      <span title="Note available" aria-label="Note available">
                        <BookFilled />
                      </span>
                    ) : (
                      <span title="No note yet" aria-label="No note yet">
                        <BookOutline />
                      </span>
                    )}
                    {s.homework.length > 0 && (
                      <span className="text-2xs px-2 py-0.5 rounded-full bg-ruleSoft text-ink-muted">
                        {s.homework.filter((h) => !h.done).length} hw
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </StudentLayout>
  );
}

function formatLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function BookFilled() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-forest"><path d="M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0 0 4h13v-2H6a0 0 0 0 0 0 0V4z"/></svg>;
}
function BookOutline() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-soft"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5v-13A2.5 2.5 0 0 1 6.5 2z"/></svg>;
}

export default function Page() {
  return <AuthGuardStudent><Inner /></AuthGuardStudent>;
}
