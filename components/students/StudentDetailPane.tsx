import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { DetailPane } from '../design/DetailPane';
import { StatusPill } from '../design/StatusPill';
import { Skeleton } from '../design/Skeleton';
import { InlineEditField } from '../design/InlineEditField';
import { useToast } from '../design/Toast';
import { Avatar } from '../design/Avatar';
import { Sparkline } from '../design/Sparkline';
import { HealthIndicator } from '../design/HealthIndicator';
import { RichEditor } from '../design/RichEditor';
import { Tooltip } from '../design/Tooltip';
import { formatCents, formatDate, formatTime } from '../../lib/utils';
import { formatMoney, formatDuration } from '../../lib/format';

type Props = {
  open: boolean;
  studentId: string | null;
  onClose: () => void;
  currency: string;
  isOwner: boolean;
};

type StudentDetail = {
  id: string;
  name: string;
  year_level: string | null;
  school: string | null;
  subjects: string[];
  hourly_rate_cents: number | null;
  notes: string | null;
  parent_name: string | null;
  parent_email: string | null;
  household_id: string | null;
  created_at: string;
  archived: boolean;
};

type SessionRow = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  status: string;
  paid: boolean;
  notes_internal: string | null;
  notes_parent_facing: string | null;
  parent_notified_at: string | null;
  invoice_id: string | null;
};

type Stats = {
  total_sessions: number;
  total_minutes: number;
  total_cents: number;
  last_session_at: string | null;
  next_session_at: string | null;
  avg_minutes: number;
  weekly_counts: number[];
};

type SubTab = 'overview' | 'sessions' | 'files' | 'notes' | 'plan';

type TemplateRow = {
  id: string;
  recurrence_rule: 'weekly' | 'fortnightly' | 'monthly';
  day_of_week: number;
  start_time_local: string;
  duration_minutes: number;
  cancelled_at: string | null;
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function StudentDetailPane({ open, studentId, onClose, currency, isOwner }: Props) {
  const toast = useToast();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [files, setFiles] = useState<Array<{ id: string; name: string; bytes: number; created_at: string }>>([]);
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<SubTab>('overview');
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null);

  useEffect(() => {
    if (!open || !studentId) {
      setStudent(null); setSessions([]); setStats(null); setTemplates([]); setFiles([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setTab('overview');
    (async () => {
      const [{ data: s }, { data: sess }, { data: tpl }, { data: fls }] = await Promise.all([
        supabase
          .from('students')
          .select('id, name, year_level, school, subjects, hourly_rate_cents, notes, parent_name, parent_email, household_id, created_at, archived')
          .eq('id', studentId)
          .maybeSingle(),
        supabase
          .from('sessions')
          .select('id, scheduled_at, duration_minutes, subject, status, paid, notes_internal, notes_parent_facing, parent_notified_at, invoice_id')
          .eq('student_id', studentId)
          .order('scheduled_at', { ascending: false })
          .limit(50),
        supabase
          .from('session_templates')
          .select('id, recurrence_rule, day_of_week, start_time_local, duration_minutes, cancelled_at')
          .eq('student_id', studentId),
        supabase
          .from('files')
          .select('id, name, bytes, created_at')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;
      setStudent(s as any);
      setNotesDraft((s as any)?.notes ?? '');
      const list = (sess ?? []) as SessionRow[];
      setSessions(list);
      const completed = list.filter((r) => r.status === 'completed');
      const totalMinutes = completed.reduce((acc, r) => acc + (r.duration_minutes ?? 0), 0);
      const totalCents = completed.reduce(
        (acc, r) => acc + Math.round(((s as any)?.hourly_rate_cents ?? 0) * (r.duration_minutes ?? 0) / 60),
        0,
      );
      const future = list.filter((r) => new Date(r.scheduled_at).getTime() > Date.now()).reverse();
      // 12-week count series for the Plan tab sparkline.
      const weeklyCounts = buildWeeklyCounts(completed.map((r) => r.scheduled_at), 12);
      setStats({
        total_sessions: completed.length,
        total_minutes: totalMinutes,
        total_cents: totalCents,
        last_session_at: completed[0]?.scheduled_at ?? null,
        next_session_at: future[0]?.scheduled_at ?? null,
        avg_minutes: completed.length > 0 ? Math.round(totalMinutes / completed.length) : 0,
        weekly_counts: weeklyCounts,
      });
      setTemplates((tpl ?? []) as TemplateRow[]);
      setFiles((fls ?? []) as any[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, studentId]);

  async function patchStudent(patch: Partial<StudentDetail>) {
    if (!studentId) return;
    const { error } = await supabase.from('students').update(patch).eq('id', studentId);
    if (error) throw error;
    setStudent((s) => s ? { ...s, ...patch } as StudentDetail : s);
  }

  async function saveNotes() {
    if (!studentId) return;
    const { error } = await supabase.from('students').update({ notes: notesDraft || null }).eq('id', studentId);
    if (error) {
      toast.show({ message: "Couldn't save notes.", tone: 'error' });
      throw error;
    }
    setStudent((s) => s ? { ...s, notes: notesDraft || null } : s);
  }

  const daysSinceLast = stats?.last_session_at
    ? Math.floor((Date.now() - new Date(stats.last_session_at).getTime()) / 86_400_000)
    : null;
  const isActive = daysSinceLast !== null && daysSinceLast < 21;

  // Files drag-and-drop (uploads via /api/files/upload).
  async function handleDrop(ev: React.DragEvent) {
    ev.preventDefault();
    setDragOver(false);
    if (!studentId) return;
    const fileList = Array.from(ev.dataTransfer?.files ?? []);
    if (fileList.length === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    for (const f of fileList) {
      try {
        setUploadProgress({ name: f.name, pct: 0 });
        const fd = new FormData();
        fd.append('file', f);
        fd.append('student_id', studentId);
        // No native progress events on fetch yet — show indeterminate then 100%.
        setUploadProgress({ name: f.name, pct: 60 });
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd,
        });
        if (!res.ok) throw new Error('Upload failed');
        const json = await res.json().catch(() => ({} as any));
        setUploadProgress({ name: f.name, pct: 100 });
        if (json?.id) {
          setFiles((prev) => [{ id: json.id, name: f.name, bytes: f.size, created_at: new Date().toISOString() }, ...prev]);
        }
        toast.show({ message: `Uploaded ${f.name}`, tone: 'success' });
      } catch {
        toast.show({ message: `Upload failed for ${f.name}`, tone: 'error' });
      } finally {
        setUploadProgress(null);
      }
    }
  }

  return (
    <DetailPane
      open={open}
      onClose={onClose}
      fullPageHref={studentId ? `/app/students/${studentId}` : undefined}
      title={
        loading || !student
          ? 'Student'
          : <>{student.name}{' '}<span className="text-ink-soft text-xs font-normal">· {student.year_level ?? 'No year'}</span></>
      }
    >
      {loading || !student ? (
        <div className="p-5 space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div>
          {/* Header */}
          <div className="px-5 py-4 border-b border-rule flex items-start gap-3">
            <Avatar name={student.name} size={48} />
            <div className="flex-1 min-w-0">
              <InlineEditField
                value={student.name}
                onSave={(name) => patchStudent({ name })}
                variant="title"
              />
              <div className="text-xs text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
                {student.school && <span>{student.school}</span>}
                <StatusPill tone={isActive ? 'success' : 'neutral'}>
                  {isActive ? 'Active' : 'Dormant'}
                </StatusPill>
              </div>
            </div>
          </div>

          {/* Mini stat cards */}
          {stats && (
            <div className="px-3 py-3 border-b border-rule grid grid-cols-4 gap-2">
              <MiniStat label="Sessions" value={stats.total_sessions.toString()} hint="Completed sessions" />
              <MiniStat label="Hours" value={formatDuration(stats.total_minutes)} hint="Total time" />
              {isOwner ? (
                <MiniStat label="Lifetime" value={formatMoney(stats.total_cents, currency)} hint="Total billed" />
              ) : (
                <MiniStat label="" value="" hint="" />
              )}
              <MiniStat label="Avg" value={stats.avg_minutes ? formatDuration(stats.avg_minutes) : '—'} hint="Avg per session" />
            </div>
          )}

          {/* Health indicator row */}
          {stats && (
            <div className="px-5 py-3 border-b border-rule flex items-center gap-3">
              <span className="text-2xs uppercase tracking-widest text-ink-soft font-medium">Health</span>
              <HealthIndicator daysSinceLast={daysSinceLast} />
              <span className="ml-auto text-2xs text-ink-soft num tabular">
                {stats.last_session_at ? `Last ${formatDate(stats.last_session_at, { day: 'numeric', month: 'short' })}` : 'No sessions yet'}
              </span>
            </div>
          )}

          {/* Sub-tabs */}
          <nav className="flex border-b border-rule px-3 overflow-x-auto scrollbar-thin" role="tablist">
            {(['overview', 'sessions', 'files', 'notes', 'plan'] as SubTab[]).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                role="tab"
                aria-selected={tab === k}
                className={[
                  'px-3 py-2.5 text-xs capitalize transition-colors duration-100 -mb-px border-b-2 whitespace-nowrap',
                  tab === k
                    ? 'text-ink font-medium border-forest'
                    : 'text-ink-muted hover:text-ink border-transparent',
                ].join(' ')}
              >
                {k}
              </button>
            ))}
          </nav>

          {/* Sub-tab body */}
          {tab === 'overview' && (
            <div className="p-5 space-y-4">
              <Field label="Year level">
                <InlineEditField
                  value={student.year_level ?? ''}
                  placeholder="Add year"
                  onSave={(year_level) => patchStudent({ year_level: year_level || null })}
                />
              </Field>
              <Field label="School">
                <InlineEditField
                  value={student.school ?? ''}
                  placeholder="Add school"
                  onSave={(school) => patchStudent({ school: school || null })}
                />
              </Field>
              <Field label="Subjects">
                <InlineEditField
                  value={(student.subjects ?? []).join(', ')}
                  placeholder="Add subjects (comma-separated)"
                  onSave={(text) =>
                    patchStudent({
                      subjects: text.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </Field>
              {isOwner && (
                <Field label="Rate">
                  <InlineEditField
                    value={student.hourly_rate_cents
                      ? (student.hourly_rate_cents / 100).toFixed(0)
                      : ''}
                    placeholder="0"
                    display={(v) => v ? formatCents(parseInt(v, 10) * 100, currency) + '/hr' : '—'}
                    onSave={(text) => {
                      const n = parseFloat(text);
                      patchStudent({ hourly_rate_cents: Number.isFinite(n) ? Math.round(n * 100) : null });
                    }}
                  />
                </Field>
              )}
              <Field label="Parent">
                <div className="text-sm text-ink">
                  {student.parent_name ?? <span className="text-ink-soft">—</span>}
                </div>
                {student.parent_email && (
                  <div className="text-xs text-ink-muted">{student.parent_email}</div>
                )}
              </Field>
              <div className="flex items-center gap-2 pt-2 border-t border-rule">
                <Link
                  href={`/app/sessions/new?student_id=${student.id}`}
                  className="btn-primary text-xs"
                  style={{ height: 32, minHeight: 32 }}
                >
                  Schedule session
                </Link>
                <Link
                  href={`/app/messages?student_id=${student.id}`}
                  className="btn-secondary text-xs"
                  style={{ height: 32, minHeight: 32 }}
                >
                  Message parent
                </Link>
              </div>
            </div>
          )}

          {tab === 'sessions' && (
            <div className="p-2 max-h-full overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="p-6 text-center text-sm text-ink-soft">No sessions yet.</div>
              ) : (
                <ul className="divide-y divide-rule">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/app/sessions/${s.id}`}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-ruleSoft/40 transition-colors duration-100"
                      >
                        <div className="text-xs text-ink-muted num tabular w-20 shrink-0">
                          {formatDate(s.scheduled_at, { day: 'numeric', month: 'short' })}
                          <div className="text-2xs text-ink-soft">{formatTime(s.scheduled_at)}</div>
                        </div>
                        <SessionPipelineDots row={s} />
                        <div className="flex-1 min-w-0 text-xs text-ink truncate">
                          {s.subject ?? '—'} · {s.duration_minutes}m
                        </div>
                        <StatusPill
                          tone={
                            s.status === 'completed' ? (s.paid ? 'success' : 'rust')
                            : s.status === 'cancelled' ? 'neutral'
                            : 'forest'
                          }
                        >
                          {s.status === 'completed' ? (s.paid ? 'Paid' : 'Unpaid') : s.status}
                        </StatusPill>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={[
                'p-3 min-h-[200px] transition-colors duration-100',
                dragOver ? 'bg-forest-soft/20 outline outline-1 outline-forest/40' : '',
              ].join(' ')}
            >
              {uploadProgress && (
                <div className="text-2xs text-ink-muted mb-2">
                  Uploading {uploadProgress.name}…
                  <div className="h-0.5 w-full bg-ruleSoft mt-1 rounded-full overflow-hidden">
                    <div className="h-full bg-forest transition-[width] duration-200" style={{ width: `${uploadProgress.pct}%` }} />
                  </div>
                </div>
              )}
              {files.length === 0 ? (
                <div className="text-center text-sm text-ink-soft py-8">
                  Drop files here, or manage them in <Link href="/app/files" className="text-forest hover:underline">Resources</Link>.
                </div>
              ) : (
                <ul className="space-y-1">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-3 px-2 py-1.5 hover:bg-ruleSoft/40 rounded transition-colors duration-100">
                      <span className="text-sm text-ink truncate">{f.name}</span>
                      <span className="text-2xs text-ink-soft num tabular shrink-0">{Math.round(f.bytes / 1024)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div className="p-5">
              <RichEditor
                value={notesDraft}
                onChange={setNotesDraft}
                placeholder="Parent context, learning style, goals, concerns…"
                autoSaveMs={2000}
                onAutoSave={saveNotes}
                minHeight={200}
                ariaLabel="Student notes"
              />
            </div>
          )}

          {tab === 'plan' && (
            <PlanTab
              templates={templates}
              weeklyCounts={stats?.weekly_counts ?? []}
              onPause={(id) => patchTemplate(id, { cancelled_at: new Date().toISOString() }, setTemplates, toast, 'Template ended.')}
              onEnd={(id) => patchTemplate(id, { cancelled_at: new Date().toISOString() }, setTemplates, toast, 'Template ended.')}
            />
          )}
        </div>
      )}
    </DetailPane>
  );
}

function PlanTab({
  templates, weeklyCounts, onEnd,
}: {
  templates: TemplateRow[];
  weeklyCounts: number[];
  onPause: (id: string) => void;
  onEnd: (id: string) => void;
}) {
  const active = templates.filter((t) => !t.cancelled_at);
  return (
    <div className="p-5 space-y-5">
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-2">Recurring schedule</div>
        {active.length === 0 ? (
          <p className="text-sm text-ink-soft">No active recurring schedule.</p>
        ) : (
          <ul className="space-y-1.5">
            {active.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded bg-cream/60 border border-rule">
                <div className="text-sm text-ink">
                  {DAY_LABELS[t.day_of_week]}s at {formatHm(t.start_time_local)} · {t.duration_minutes}m
                  <div className="text-2xs text-ink-soft">
                    {t.recurrence_rule === 'weekly' ? 'Every week' : t.recurrence_rule === 'fortnightly' ? 'Every fortnight' : 'Every 4 weeks'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEnd(t.id)}
                  className="btn-ghost text-2xs px-2 py-1 text-claret hover:text-claret"
                >
                  End template
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-2">Sessions per week (last 12)</div>
        {weeklyCounts.length > 0 ? (
          <Sparkline data={weeklyCounts} width={300} height={36} />
        ) : (
          <p className="text-sm text-ink-soft">Not enough history yet.</p>
        )}
      </div>
    </div>
  );
}

function SessionPipelineDots({ row }: { row: SessionRow }) {
  const dots = [
    { tip: 'Scheduled', on: row.status === 'scheduled' || row.status === 'completed' },
    { tip: 'Notes drafted', on: !!row.notes_internal },
    { tip: 'Polished', on: !!row.notes_parent_facing },
    { tip: 'Sent to parent', on: !!row.parent_notified_at },
    { tip: 'Invoiced', on: !!row.invoice_id },
  ];
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {dots.map((d, i) => (
        <Tooltip key={i} label={d.tip}>
          <span
            className={['inline-block w-1.5 h-1.5 rounded-full', d.on ? 'bg-forest' : 'bg-rule'].join(' ')}
            aria-label={d.tip}
          />
        </Tooltip>
      ))}
    </span>
  );
}

async function patchTemplate(
  id: string,
  patch: Partial<TemplateRow>,
  setTemplates: React.Dispatch<React.SetStateAction<TemplateRow[]>>,
  toast: ReturnType<typeof useToast>,
  successMessage: string,
) {
  const { error } = await supabase.from('session_templates').update(patch).eq('id', id);
  if (error) {
    toast.show({ message: 'Action failed.', tone: 'error' });
    return;
  }
  setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } as TemplateRow : t));
  toast.show({ message: successMessage, tone: 'success' });
}

function buildWeeklyCounts(isos: string[], weeks: number): number[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Snap to the start of the current week (Mon).
  const dow = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const buckets = new Array(weeks).fill(0);
  for (const iso of isos) {
    const t = new Date(iso).getTime();
    const diffWeeks = Math.floor((startOfWeek.getTime() + 7 * 86_400_000 - t) / (7 * 86_400_000));
    if (diffWeeks >= 0 && diffWeeks < weeks) {
      buckets[weeks - 1 - diffWeeks] += 1;
    }
  }
  return buckets;
}

function formatHm(hms: string): string {
  const [hh, mm] = hms.split(':');
  const d = new Date();
  d.setHours(Number(hh), Number(mm), 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  if (!label) return <div />;
  return (
    <Tooltip label={hint}>
      <div className="rounded p-2 hover:bg-ruleSoft/40 transition-colors duration-100 text-center cursor-default">
        <div className="text-sm text-ink font-medium num tabular">{value || '—'}</div>
        <div className="text-2xs uppercase tracking-widest text-ink-soft mt-0.5">{label}</div>
      </div>
    </Tooltip>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-1.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default StudentDetailPane;
