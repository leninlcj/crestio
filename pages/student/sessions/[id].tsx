import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuardStudent from '../../../components/AuthGuardStudent';
import StudentLayout from '../../../components/student/StudentLayout';
import { useStudentMe } from '../../../components/student/StudentContext';
import { authFetch } from '../../../lib/authFetch';

type Sess = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  status: string;
  notes_parent_facing: string | null;
  homework: { index: number; text: string; done: boolean }[];
};

type FileRow = {
  id: string;
  display_name: string | null;
  original_filename: string;
  mime_type: string;
  created_at: string;
};

function Inner() {
  const router = useRouter();
  const { me } = useStudentMe();
  const sessionId = router.query.id as string | undefined;
  const [session, setSession] = useState<Sess | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const res = await authFetch('/api/student/sessions');
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        const found = (data.sessions ?? []).find((s: Sess) => s.id === sessionId);
        setSession(found ?? null);
      }
      const fres = await authFetch('/api/student/files');
      if (cancelled) return;
      if (fres.ok) {
        // For v1 we don't have per-session file linking yet — show files
        // shared with the student.  When intended_file→session linkage
        // ships, filter by session_id here.
        setFiles(((await fres.json()).files ?? []) as FileRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  async function toggleHomework(index: number, done: boolean) {
    if (!session) return;
    setSession({ ...session, homework: session.homework.map((h) => h.index === index ? { ...h, done } : h) });
    await authFetch('/api/student/homework-toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, homework_index: index, completed: done }),
    });
  }

  if (loading) return <StudentLayout><p className="text-sm text-ink-muted">Loading…</p></StudentLayout>;
  if (!session) return (
    <StudentLayout>
      <Link href="/student/sessions" className="text-sm text-ink-muted">← Back</Link>
      <h1 className="font-display text-2xl mt-4">Session not found</h1>
    </StudentLayout>
  );

  return (
    <StudentLayout active="sessions" title={`${session.subject ?? 'Session'}`}>
      <Link href="/student/sessions" className="text-sm text-ink-muted hover:text-ink">← Back</Link>

      <header className="mt-4">
        <div className="text-2xs uppercase tracking-widest text-ink-muted">{statusLabel(session)}</div>
        <h1 className="font-display text-3xl tracking-tightest mt-1">
          {session.subject ?? 'Session'}
        </h1>
        <p className="text-sm text-ink-muted tabular mt-1">
          {formatFull(session.scheduled_at)} · {session.duration_minutes} min
        </p>
      </header>

      {session.notes_parent_facing && (
        <section className="mt-8">
          <h2 className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Notes from {me?.tutor.name}</h2>
          <div className="prose prose-sm max-w-none text-ink leading-relaxed whitespace-pre-wrap">
            {session.notes_parent_facing}
          </div>
        </section>
      )}

      {session.homework.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Homework</h2>
          <ul className="space-y-2">
            {session.homework.map((h) => (
              <li key={h.index} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={h.done}
                  onChange={(e) => toggleHomework(h.index, e.target.checked)}
                  className="mt-1"
                  aria-label={`Mark "${h.text}" done`}
                />
                <span className={['text-sm', h.done ? 'line-through text-ink-soft' : 'text-ink'].join(' ')}>
                  {h.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {files.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Files</h2>
          <ul className="divide-y divide-ruleSoft border border-rule rounded-md">
            {files.slice(0, 5).map((f) => (
              <li key={f.id} className="px-4 py-2 flex items-center justify-between gap-3">
                <span className="text-sm text-ink truncate">{f.display_name ?? f.original_filename}</span>
                <Link href={`/student/files/${f.id}`} className="text-sm text-ink-muted hover:text-ink shrink-0">
                  View →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </StudentLayout>
  );
}

function statusLabel(s: Sess): string {
  if (s.status === 'completed') return 'Completed';
  if (s.status === 'cancelled') return 'Cancelled';
  if (new Date(s.scheduled_at).getTime() < Date.now()) return 'Past';
  return 'Upcoming';
}
function formatFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  });
}

export default function Page() {
  return <AuthGuardStudent><Inner /></AuthGuardStudent>;
}
