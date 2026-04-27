import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { activeLocale } from '../../../lib/utils';
import AuthGuardParent from '../../../components/AuthGuardParent';
import ParentLayout from '../../../components/parent/ParentLayout';
import { supabase } from '../../../lib/supabase';
import { WeekCalendar, mondayOfWeek } from '../../../components/calendar/WeekCalendar';
import { SessionDetailModal } from '../../../components/calendar/SessionDetailModal';
import CalendarHowToModal from '../../../components/CalendarHowToModal';
import type { CalendarSession } from '../../../components/calendar/types';

type StudentRow = {
  id: string;
  name: string;
  year_level: string | null;
  subjects: string[] | null;
};
type SessionRow = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  status: string;
  notes_parent_facing: string | null;
  proposed_change_by?: 'tutor' | 'parent' | null;
  proposed_new_start_time?: string | null;
  student_id: string;
  homework: string | null;
  homework_description: string | null;
  homework_due_date: string | null;
  homework_completed_at: string | null;
  homework_completed_by_user_id: string | null;
};
type ParentUpdate = {
  id: string;
  content: string;
  created_at: string;
  created_by_name: string;
};
type InvoiceRow = {
  id: string;
  number: string;
  issued_on: string;
  due_on: string | null;
  total_cents: number;
  status: string;
};

function displayYearLevel(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^year\s/i.test(trimmed)) return trimmed;
  return `Year ${trimmed}`;
}
function formatAud(cents: number): string {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency', currency: 'AUD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
function relativeDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const ad = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const bd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((ad.getTime() - bd.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(activeLocale(), { weekday: 'long' });
  return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}
function relativeOrAbsolute(iso: string): string {
  const now = new Date();
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays <= 0) {
    const diffH = Math.floor(diffMs / 3_600_000);
    if (diffH <= 0) return 'Just now';
    if (diffH === 1) return '1 hour ago';
    if (diffH < 24) return `${diffH} hours ago`;
    return 'Today';
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return `Last ${d.toLocaleDateString(activeLocale(), { weekday: 'long' })}`;
  return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

type Tab = 'overview' | 'sessions' | 'homework' | 'files' | 'updates';

type ParentFileRow = {
  id: string;
  session_id: string | null;
  display_name: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
};

function ParentStudentInner() {
  const router = useRouter();
  const { t } = useTranslation('parent');
  const { id } = router.query;
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [updates, setUpdates] = useState<ParentUpdate[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [files, setFiles] = useState<ParentFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOfWeek(new Date()));
  const [detailSession, setDetailSession] = useState<CalendarSession | null>(null);

  async function toggleHomework(sessionId: string, completed: boolean): Promise<{ ok: boolean; error?: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, error: 'Not signed in.' };
    const res = await fetch('/api/parent/homework/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ session_id: sessionId, completed }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: payload?.error || 'Something went wrong.' };
    setSessions((xs) =>
      xs.map((x) =>
        x.id === sessionId
          ? {
              ...x,
              homework_completed_at: completed ? (payload.completedAt ?? new Date().toISOString()) : null,
              homework_completed_by_user_id: completed ? session.user.id : null,
            }
          : x,
      ),
    );
    return { ok: true };
  }

  async function load() {
    if (!id || typeof id !== 'string') return;
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }
    const res = await fetch(`/api/parent/sessions?studentId=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 403) { router.replace('/parent/dashboard?error=no_access'); return; }
    if (!res.ok) { setError('Could not load sessions.'); setLoading(false); return; }
    const payload = await res.json();
    setStudent(payload.student);
    setSessions(payload.sessions ?? []);
    setUpdates(payload.parent_updates ?? []);

    // Invoices — parallel fetch via PostgREST, RLS allows parent SELECT.
    const { data: invRows } = await supabase
      .from('invoices')
      .select('id, number, issued_on, due_on, total_cents, status')
      .eq('student_id', id)
      .order('issued_on', { ascending: false });
    setInvoices((invRows ?? []) as InvoiceRow[]);

    // Files — RLS allows parent SELECT for non-deleted, non-org-library
    // student files where the parent has a non-revoked link.
    const { data: fileRows } = await supabase
      .from('files')
      .select('id, session_id, display_name, mime_type, file_size_bytes, created_at')
      .eq('student_id', id)
      .eq('is_org_library', false)
      .eq('status', 'ready')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setFiles((fileRows ?? []) as ParentFileRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const now = useMemo(() => new Date(), []);
  const calendarSessions: CalendarSession[] = useMemo(() => sessions.map((s) => ({
    id: s.id,
    student_id: s.student_id,
    student_name: student?.name ?? '—',
    subject: s.subject,
    scheduled_at: s.scheduled_at,
    duration_minutes: s.duration_minutes,
    status: s.status as any,
    proposed_change_by: s.proposed_change_by ?? null,
    proposed_new_start_time: s.proposed_new_start_time ?? null,
  })), [sessions, student]);

  const nextSession = useMemo(() => {
    return sessions
      .filter((s) => s.status === 'scheduled' && new Date(s.scheduled_at) >= now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;
  }, [sessions, now]);

  const pastSessions = useMemo(() => sessions.filter((s) => {
    if (s.status === 'completed' || s.status === 'cancelled' || s.status === 'no_show') return true;
    return new Date(s.scheduled_at).getTime() < now.getTime() - 60_000;
  }).sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
  [sessions, now]);
  const upcomingSessions = useMemo(() => sessions
    .filter((s) => new Date(s.scheduled_at).getTime() >= now.getTime() - 60_000 &&
      s.status !== 'cancelled' && s.status !== 'completed' && s.status !== 'no_show')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
  [sessions, now]);

  const yl = displayYearLevel(student?.year_level ?? null);
  const subject = student?.subjects && student.subjects.length > 0 ? student.subjects[0] : null;

  return (
    <>
      <Head>
        <title>{student?.name ? `${student.name} · Crestio` : 'Crestio'}</title>
      </Head>

      <main className="px-6 md:px-12 pt-10 pb-16 max-w-4xl mx-auto">
        {loading ? (
          <div className="card p-6 text-sm text-ink-muted animate-pulse">{t('student.loading')}</div>
        ) : error ? (
          <div className="card p-6 text-sm text-claret">{error}</div>
        ) : (
          <>
            <div className="mb-8">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('student.student')}</div>
              <h1 className="font-display text-4xl md:text-5xl tracking-tightest mb-2">
                {student?.name ?? '—'}
              </h1>
              <div className="text-sm text-ink-muted">
                {[yl, subject].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>

            {nextSession && (
              <div className="card p-6 mb-8 bg-forest-soft/40 border-forest/20">
                <div className="text-2xs uppercase tracking-widest text-forest-ink/80 mb-1">{t('student.next_session')}</div>
                <div className="font-display text-2xl tracking-tightest text-forest-ink mb-1">
                  {relativeDayLabel(nextSession.scheduled_at)} at {new Date(nextSession.scheduled_at).toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' })}
                </div>
                <div className="text-sm text-forest-ink/80">
                  {nextSession.duration_minutes} min{nextSession.subject ? ` · ${nextSession.subject}` : ''}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailSession(calendarSessions.find((s) => s.id === nextSession.id) ?? null)}
                  className="mt-3 text-xs text-forest underline"
                >
                  View / request changes →
                </button>
              </div>
            )}

            <div className="border-b border-rule mb-6 overflow-x-auto scrollbar-thin -mx-6 px-6 md:mx-0 md:px-0">
              <nav className="flex gap-1 min-w-max" role="tablist">
                {(['overview', 'sessions', 'homework', 'files', 'updates'] as Tab[]).map((tk) => (
                  <button
                    key={tk}
                    type="button"
                    role="tab"
                    aria-selected={tab === tk}
                    onClick={() => setTab(tk)}
                    className={[
                      'px-4 py-3 text-sm -mb-px border-b-2 transition-colors capitalize',
                      tab === tk ? 'border-forest text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink',
                    ].join(' ')}
                  >
                    {tk}
                  </button>
                ))}
              </nav>
            </div>

            {tab === 'overview' && typeof id === 'string' && (
              <OverviewTab
                weekStart={weekStart} setWeekStart={setWeekStart}
                sessions={calendarSessions}
                onClickSession={(s) => setDetailSession(s)}
                studentId={id}
                upcoming={upcomingSessions}
                past={pastSessions}
                allSessions={sessions}
                updates={updates}
              />
            )}

            {tab === 'sessions' && (
              <SessionsTab
                sessions={sessions}
                upcoming={upcomingSessions}
                past={pastSessions}
                onClickSession={(id) => setDetailSession(calendarSessions.find((c) => c.id === id) ?? null)}
                onToggleHomework={toggleHomework}
              />
            )}

            {tab === 'homework' && (
              <HomeworkTab sessions={sessions} onToggleHomework={toggleHomework} />
            )}

            {tab === 'updates' && <UpdatesTab updates={updates} />}

            {tab === 'files' && <FilesTab files={files} sessions={sessions} />}
          </>
        )}
      </main>

      <SessionDetailModal
        open={!!detailSession}
        onClose={() => setDetailSession(null)}
        session={detailSession}
        onChanged={load}
        mode="parent"
      />
    </>
  );
}

function OverviewTab({
  weekStart, setWeekStart, sessions, onClickSession, studentId,
  upcoming, past, allSessions, updates,
}: {
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  sessions: CalendarSession[];
  onClickSession: (s: CalendarSession) => void;
  studentId: string;
  upcoming: SessionRow[];
  past: SessionRow[];
  allSessions: SessionRow[];
  updates: ParentUpdate[];
}) {
  const recent = past.slice(0, 5);
  const next = upcoming.slice(0, 3);
  const tutorNote = updates[0] ?? null;
  return (
    <div className="space-y-10">
      {next.length > 0 && (
        <section>
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Coming up</div>
          <div className="space-y-2">
            {next.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onClickSession(sessions.find((c) => c.id === s.id) ?? sessions[0])}
                className="w-full text-left p-4 rounded-md border border-forest/30 bg-forest/[0.04] hover:bg-forest/[0.06] transition-colors"
              >
                <div className="font-display text-base tracking-tightest text-forest-ink">
                  {relativeDayLabel(s.scheduled_at)} · {new Date(s.scheduled_at).toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' })}
                </div>
                <div className="text-xs text-forest-ink/80 mt-0.5">
                  {s.duration_minutes} min{s.subject ? ` · ${s.subject}` : ''}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Recent sessions</div>
          <div className="space-y-3">
            {recent.map((s) => (
              <article key={s.id} className="rounded-md border border-rule bg-surface p-5">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1 mb-2">
                  <div className="font-display text-base tracking-tightest">
                    {relativeDayLabel(s.scheduled_at)} · {new Date(s.scheduled_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-2xs text-ink-soft font-mono tabular-nums">
                    {new Date(s.scheduled_at).toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' })} · {s.duration_minutes} min
                  </div>
                </div>
                {s.notes_parent_facing ? (
                  <p className="text-sm text-ink-muted leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
                    {s.notes_parent_facing}
                  </p>
                ) : (
                  <p className="text-2xs text-ink-soft italic">No notes shared yet.</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {tutorNote && (
        <section>
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Tutor&apos;s note</div>
          <article className="rounded-md border border-rule bg-surface p-5">
            <div className="text-2xs text-ink-soft mb-2">
              {relativeOrAbsolute(tutorNote.created_at)} · {tutorNote.created_by_name}
            </div>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">{tutorNote.content}</p>
          </article>
        </section>
      )}

      <section>
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">This week</div>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => {
            const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d);
          }} className="btn-ghost text-xs h-8 min-h-[32px] px-2.5">‹</button>
          <button onClick={() => setWeekStart(mondayOfWeek(new Date()))} className="btn-ghost text-xs h-8 min-h-[32px] px-3">Today</button>
          <button onClick={() => {
            const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d);
          }} className="btn-ghost text-xs h-8 min-h-[32px] px-2.5">›</button>
        </div>
        <WeekCalendar
          weekStart={weekStart}
          sessions={sessions}
          onClickSession={onClickSession}
          readOnly
        />
        <ParentCalendarSubscribeCard studentId={studentId} />
      </section>
    </div>
  );
}

function CalendarTab({
  weekStart, setWeekStart, sessions, onClickSession, studentId,
}: {
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  sessions: CalendarSession[];
  onClickSession: (s: CalendarSession) => void;
  studentId: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => {
          const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d);
        }} className="btn-ghost text-xs">‹</button>
        <button onClick={() => setWeekStart(mondayOfWeek(new Date()))} className="btn-ghost text-xs">Today</button>
        <button onClick={() => {
          const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d);
        }} className="btn-ghost text-xs">›</button>
      </div>
      <WeekCalendar
        weekStart={weekStart}
        sessions={sessions}
        onClickSession={onClickSession}
        readOnly
      />
      <ParentCalendarSubscribeCard studentId={studentId} />
    </div>
  );
}

function ParentCalendarSubscribeCard({ studentId }: { studentId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);

  async function getOrCreateUrl(rotate = false) {
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Not signed in.'); return; }
      const res = await fetch('/api/calendar/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ audience: 'parent_student', student_id: studentId, rotate }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        setError(payload?.error ?? 'Could not generate calendar URL.');
        return;
      }
      setUrl(payload.url);
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('Copy this URL:', url); }
  }

  return (
    <div className="card p-5 md:p-6 mt-6 space-y-3">
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Calendar export</div>
        <h3 className="font-display text-lg tracking-tightest">Subscribe in your calendar app</h3>
        <p className="text-sm text-ink-muted mt-1">
          See sessions directly in Google Calendar, Apple Calendar, Outlook, or any app that supports iCal feeds.
        </p>
      </div>

      {!url && (
        <button type="button" onClick={() => getOrCreateUrl(false)} disabled={busy} className="btn-primary text-xs">
          {busy ? 'Generating…' : 'Generate subscription URL'}
        </button>
      )}

      {url && (
        <>
          <div className="flex gap-2">
            <input type="text" readOnly value={url} className="input text-xs flex-1 font-mono"
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={copy} className="btn-secondary text-xs px-4">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Copy this URL, then add it to your calendar app. Your sessions will appear automatically and refresh every hour.
          </p>
          <button
            type="button"
            onClick={() => setHowToOpen(true)}
            className="text-xs text-forest hover:text-forest-ink underline underline-offset-2 text-left"
          >
            How do I add this to my calendar?
          </button>
          <div className="flex gap-2 pt-2 border-t border-rule">
            <button type="button" onClick={() => getOrCreateUrl(true)} disabled={busy} className="btn-ghost text-2xs">
              {busy ? 'Rotating…' : 'Revoke and generate new'}
            </button>
          </div>
        </>
      )}

      {error && <div className="text-sm text-claret">{error}</div>}

      <CalendarHowToModal open={howToOpen} onClose={() => setHowToOpen(false)} />
    </div>
  );
}

function SessionsTab({
  sessions, upcoming, past, onClickSession, onToggleHomework,
}: {
  sessions: SessionRow[];
  upcoming: SessionRow[];
  past: SessionRow[];
  onClickSession: (id: string) => void;
  onToggleHomework: (sessionId: string, completed: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const unmarkedHomework = sessions
    .filter((s) => (s.homework_description || s.homework) && !s.homework_completed_at)
    .sort((a, b) => new Date(a.homework_due_date ?? a.scheduled_at).getTime() - new Date(b.homework_due_date ?? b.scheduled_at).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-10">
      {unmarkedHomework.length > 0 && (
        <section>
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Homework</div>
          <div className="space-y-3">
            {unmarkedHomework.map((s) => (
              <HomeworkCheckRow key={s.id} session={s} onToggle={onToggleHomework} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-display text-2xl tracking-tightest mb-4">Upcoming sessions</h2>
        {upcoming.length === 0 ? (
          <div className="card p-6 text-sm text-ink-muted">
            No upcoming sessions scheduled.
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onClickSession(s.id)}
                className="w-full text-left card p-5 hover:shadow-lift transition-shadow bg-forest-soft/40 border-forest/20"
              >
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1">
                  <div className="font-display text-xl tracking-tightest text-forest-ink">
                    {relativeDayLabel(s.scheduled_at)} · {new Date(s.scheduled_at).toLocaleDateString(activeLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  <div className="text-xs text-forest-ink/80 font-mono">
                    {new Date(s.scheduled_at).toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' })} · {s.duration_minutes} min
                  </div>
                </div>
                {(s.subject || s.topic) && (
                  <div className="text-sm text-forest-ink/80 mt-2">{[s.subject, s.topic].filter(Boolean).join(' · ')}</div>
                )}
                {s.status === 'pending_change' && (
                  <div className="text-2xs text-amber-ink mt-2">Change requested — awaiting tutor response</div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl tracking-tightest mb-4">Past sessions</h2>
        {past.length === 0 ? (
          <div className="card p-6 text-sm text-ink-muted">No past sessions yet.</div>
        ) : (
          <div className="space-y-3">
            {past.map((s) => (
              <article key={s.id} className="card p-5 md:p-6">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1 mb-2">
                  <div className="font-display text-lg md:text-xl tracking-tightest">
                    {relativeDayLabel(s.scheduled_at)} · {new Date(s.scheduled_at).toLocaleDateString(activeLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-ink-muted font-mono">
                      {new Date(s.scheduled_at).toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' })} · {s.duration_minutes} min
                    </div>
                    {s.status === 'cancelled' && (
                      <span className="badge-neutral">Cancelled</span>
                    )}
                    {s.status === 'no_show' && (
                      <span className="badge-claret">No-show</span>
                    )}
                  </div>
                </div>
                {(s.subject || s.topic) && (
                  <div className="text-sm text-ink-muted mb-3">{[s.subject, s.topic].filter(Boolean).join(' · ')}</div>
                )}
                {s.status === 'completed' && (
                  s.notes_parent_facing
                    ? <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">{s.notes_parent_facing}</p>
                    : <p className="text-sm text-ink-soft italic">No notes shared for this session yet.</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function InvoicesTab({ invoices }: { invoices: InvoiceRow[] }) {
  if (invoices.length === 0) {
    return <div className="card p-6 text-sm text-ink-muted">No invoices yet for this student.</div>;
  }
  return (
    <div className="space-y-3">
      {invoices.map((inv) => {
        const overdue = inv.due_on && inv.status !== 'paid' && inv.status !== 'void' && new Date(inv.due_on) < new Date();
        const badge = inv.status === 'paid' ? 'badge-forest' : overdue ? 'badge-claret' : 'badge-rust';
        return (
          <div key={inv.id} className="card p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-sm">{inv.number}</div>
              <div className="text-2xs text-ink-muted">
                Issued {new Date(inv.issued_on).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}
                {inv.due_on ? ` · Due ${new Date(inv.due_on).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm">{formatAud(inv.total_cents)}</span>
              <span className={badge}>{inv.status === 'paid' ? 'Paid' : overdue ? 'Overdue' : inv.status}</span>
            </div>
          </div>
        );
      })}
      <div className="text-2xs text-ink-soft pt-2">
        To pay, please follow the instructions on each invoice from your tutor.
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fileTypeLabel(mime: string): string {
  if (mime.startsWith('image/')) return 'Image';
  if (mime === 'application/pdf') return 'PDF';
  return 'File';
}

function FilesTab({ files, sessions }: { files: ParentFileRow[]; sessions: SessionRow[] }) {
  if (files.length === 0) {
    return (
      <div className="card p-6 text-sm text-ink-muted">
        No files shared yet.
      </div>
    );
  }

  const sessionFiles = files.filter((f) => f.session_id);
  const resourceFiles = files.filter((f) => !f.session_id);

  const sessionLabel = (id: string | null): string | null => {
    if (!id) return null;
    const s = sessions.find((x) => x.id === id);
    if (!s) return null;
    return new Date(s.scheduled_at).toLocaleDateString(activeLocale(), {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  };

  return (
    <div className="space-y-10">
      {sessionFiles.length > 0 && (
        <section>
          <h2 className="font-display text-2xl tracking-tightest mb-4">Session files</h2>
          <div className="space-y-2">
            {sessionFiles.map((f) => (
              <Link
                key={f.id}
                href={`/files/${f.id}`}
                className="card p-4 flex items-center justify-between gap-3 hover:shadow-lift transition-shadow"
              >
                <div className="min-w-0">
                  <div className="text-sm text-ink truncate">{f.display_name}</div>
                  <div className="text-2xs text-ink-soft mt-0.5">
                    {fileTypeLabel(f.mime_type)} · {formatBytes(f.file_size_bytes)}
                    {sessionLabel(f.session_id) && <> · {sessionLabel(f.session_id)}</>}
                  </div>
                </div>
                <span className="text-xs text-forest underline-offset-2 underline shrink-0">View →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {resourceFiles.length > 0 && (
        <section>
          <h2 className="font-display text-2xl tracking-tightest mb-4">Resources</h2>
          <div className="space-y-2">
            {resourceFiles.map((f) => (
              <Link
                key={f.id}
                href={`/files/${f.id}`}
                className="card p-4 flex items-center justify-between gap-3 hover:shadow-lift transition-shadow"
              >
                <div className="min-w-0">
                  <div className="text-sm text-ink truncate">{f.display_name}</div>
                  <div className="text-2xs text-ink-soft mt-0.5">
                    {fileTypeLabel(f.mime_type)} · {formatBytes(f.file_size_bytes)} · {new Date(f.created_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}
                  </div>
                </div>
                <span className="text-xs text-forest underline-offset-2 underline shrink-0">View →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function UpdatesTab({ updates }: { updates: ParentUpdate[] }) {
  if (updates.length === 0) {
    return <div className="card p-6 text-sm text-ink-muted">No updates from your tutor yet.</div>;
  }
  return (
    <div className="space-y-3">
      {updates.map((u) => (
        <article key={u.id} className="card p-5">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
            {relativeOrAbsolute(u.created_at)}
          </div>
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words mb-3">{u.content}</p>
          <div className="text-2xs text-ink-soft">From {u.created_by_name}</div>
        </article>
      ))}
    </div>
  );
}

function homeworkText(s: SessionRow): string {
  return (s.homework_description || s.homework || '').trim();
}

function HomeworkCheckRow({
  session,
  onToggle,
}: {
  session: SessionRow;
  onToggle: (sessionId: string, completed: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justMarked, setJustMarked] = useState(false);
  const [undoVisible, setUndoVisible] = useState(false);
  const text = homeworkText(session);
  const due = session.homework_due_date;
  const overdue = due ? new Date(due) < new Date() : false;

  async function handleCheck() {
    setPending(true);
    setError(null);
    const result = await onToggle(session.id, true);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }
    setJustMarked(true);
    setUndoVisible(true);
    setTimeout(() => setUndoVisible(false), 8000);
  }

  async function handleUndo() {
    setPending(true);
    setError(null);
    const result = await onToggle(session.id, false);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      return;
    }
    setJustMarked(false);
    setUndoVisible(false);
  }

  if (justMarked) {
    return (
      <div className="card p-4 flex items-center justify-between gap-3 bg-forest-soft border-forest/20">
        <div className="text-sm text-forest-ink">
          <span className="mr-2" aria-hidden="true">✓</span>
          Done
          <span className="text-forest-ink/70 text-xs"> · {text.length > 80 ? text.slice(0, 79) + '…' : text}</span>
        </div>
        {undoVisible && (
          <button
            type="button"
            onClick={handleUndo}
            disabled={pending}
            className="text-xs text-forest-ink underline underline-offset-2 hover:text-forest"
          >
            Undo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
      <label className="flex items-start gap-3 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          className="mt-0.5 w-5 h-5 md:w-6 md:h-6 accent-forest"
          checked={false}
          disabled={pending}
          onChange={handleCheck}
          style={{ minWidth: 24, minHeight: 24 }}
        />
        <div className="min-w-0">
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">{text}</p>
          {due && (
            <div className={`text-2xs mt-1 ${overdue ? 'text-rust' : 'text-ink-muted'}`}>
              {overdue ? 'Overdue — was due ' : 'Due '}
              {new Date(due).toLocaleDateString(activeLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          )}
        </div>
      </label>
      {error && <div className="text-xs text-claret">{error}</div>}
    </div>
  );
}

function HomeworkTab({
  sessions,
  onToggleHomework,
}: {
  sessions: SessionRow[];
  onToggleHomework: (sessionId: string, completed: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const items = sessions
    .filter((s) => homeworkText(s))
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  if (items.length === 0) {
    return (
      <div className="card p-6 text-sm text-ink-muted">
        No homework assigned yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((s) => (
        <HomeworkHistoryRow key={s.id} session={s} onToggle={onToggleHomework} />
      ))}
    </div>
  );
}

function HomeworkHistoryRow({
  session,
  onToggle,
}: {
  session: SessionRow;
  onToggle: (sessionId: string, completed: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = homeworkText(session);
  const due = session.homework_due_date;
  const completedAt = session.homework_completed_at;
  const overdue = !completedAt && due && new Date(due) < new Date();
  const canUndo = completedAt
    ? Date.now() - new Date(completedAt).getTime() < 24 * 60 * 60 * 1000
    : false;

  async function handleCheck(completed: boolean) {
    setPending(true);
    setError(null);
    const result = await onToggle(session.id, completed);
    setPending(false);
    if (!result.ok) setError(result.error ?? 'Something went wrong.');
  }

  return (
    <div className="card p-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-2">
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted">
            Assigned {new Date(session.scheduled_at).toLocaleDateString(activeLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          {due && (
            <div className="text-2xs text-ink-soft mt-0.5">
              Due {new Date(due).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {completedAt ? (
            <>
              <span className="badge-forest">✓ Done</span>
              {canUndo && (
                <button
                  type="button"
                  onClick={() => handleCheck(false)}
                  disabled={pending}
                  className="text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  Undo
                </button>
              )}
            </>
          ) : overdue ? (
            <span className="badge-rust">Overdue</span>
          ) : (
            <span className="badge-neutral">Pending</span>
          )}
          {!completedAt && (
            <button
              type="button"
              onClick={() => handleCheck(true)}
              disabled={pending}
              className="btn-ghost text-xs"
              style={{ minHeight: 44, minWidth: 44 }}
            >
              Mark as done
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">{text}</p>
      {completedAt && (
        <div className="text-2xs text-ink-soft mt-2">
          Marked complete on {new Date(completedAt).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}
        </div>
      )}
      {error && <div className="text-xs text-claret mt-2">{error}</div>}
    </div>
  );
}

export default function ParentStudent() {
  return (
    <AuthGuardParent>
      <ParentLayout active="students" noTabs>
        <ParentStudentInner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
