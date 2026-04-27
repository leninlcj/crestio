import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { DetailPane } from '../design/DetailPane';
import { StatusPill } from '../design/StatusPill';
import { Skeleton } from '../design/Skeleton';
import { InlineEditField } from '../design/InlineEditField';
import { useToast } from '../design/Toast';
import { initials, formatCents, formatDate, formatTime } from '../../lib/utils';

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
};

type Stats = {
  total_sessions: number;
  total_minutes: number;
  total_cents: number;
  last_session_at: string | null;
  next_session_at: string | null;
};

type SubTab = 'overview' | 'sessions' | 'files' | 'notes';

export function StudentDetailPane({ open, studentId, onClose, currency, isOwner }: Props) {
  const toast = useToast();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<SubTab>('overview');

  useEffect(() => {
    if (!open || !studentId) { setStudent(null); setSessions([]); setStats(null); return; }
    let cancelled = false;
    setLoading(true);
    setTab('overview');
    (async () => {
      const [{ data: s }, { data: sess }] = await Promise.all([
        supabase
          .from('students')
          .select('id, name, year_level, school, subjects, hourly_rate_cents, notes, parent_name, parent_email, household_id, created_at, archived')
          .eq('id', studentId)
          .maybeSingle(),
        supabase
          .from('sessions')
          .select('id, scheduled_at, duration_minutes, subject, status, paid')
          .eq('student_id', studentId)
          .order('scheduled_at', { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;
      setStudent(s as any);
      const list = (sess ?? []) as SessionRow[];
      setSessions(list);
      const completed = list.filter((r) => r.status === 'completed');
      const totalMinutes = completed.reduce((acc, r) => acc + (r.duration_minutes ?? 0), 0);
      const totalCents = completed.reduce(
        (acc, r) => acc + Math.round(((s as any)?.hourly_rate_cents ?? 0) * (r.duration_minutes ?? 0) / 60),
        0,
      );
      const future = list.filter((r) => new Date(r.scheduled_at).getTime() > Date.now()).reverse();
      setStats({
        total_sessions: completed.length,
        total_minutes: totalMinutes,
        total_cents: totalCents,
        last_session_at: completed[0]?.scheduled_at ?? null,
        next_session_at: future[0]?.scheduled_at ?? null,
      });
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

  const isActive = (() => {
    if (!stats?.last_session_at) return false;
    return Date.now() - new Date(stats.last_session_at).getTime() < 21 * 86_400_000;
  })();

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
            <div className="h-12 w-12 rounded-full bg-forest-soft text-forest-ink grid place-items-center text-sm font-mono font-medium shrink-0">
              {initials(student.name)}
            </div>
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

          {/* Quick stats */}
          {stats && (
            <div className="px-5 py-3 border-b border-rule grid grid-cols-4 gap-3 text-center">
              <Stat label="Sessions" value={stats.total_sessions.toString()} />
              <Stat label="Hours" value={(stats.total_minutes / 60).toFixed(1)} />
              {isOwner ? (
                <Stat label="Lifetime" value={formatCents(stats.total_cents, currency)} />
              ) : (
                <Stat label="" value="" />
              )}
              <Stat
                label="Last"
                value={stats.last_session_at ? formatDate(stats.last_session_at, { day: 'numeric', month: 'short' }) : '—'}
              />
            </div>
          )}

          {/* Sub-tabs */}
          <nav className="flex border-b border-rule px-3" role="tablist">
            {(['overview', 'sessions', 'files', 'notes'] as SubTab[]).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                role="tab"
                aria-selected={tab === k}
                className={[
                  'px-3 py-2.5 text-xs capitalize transition-colors duration-100 -mb-px border-b-2',
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
                        <div className="text-xs text-ink-muted tabular w-20 shrink-0">
                          {formatDate(s.scheduled_at, { day: 'numeric', month: 'short' })}
                          <div className="text-2xs text-ink-soft">{formatTime(s.scheduled_at)}</div>
                        </div>
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
            <div className="p-5 text-center text-xs text-ink-soft">
              Manage files in <Link href="/app/files" className="text-forest hover:underline">Resources</Link>.
            </div>
          )}

          {tab === 'notes' && (
            <div className="p-5">
              <textarea
                className="input min-h-[200px] w-full"
                defaultValue={student.notes ?? ''}
                placeholder="Parent context, learning style, goals, concerns…"
                onBlur={async (e) => {
                  const next = e.currentTarget.value;
                  if (next === (student.notes ?? '')) return;
                  try {
                    await patchStudent({ notes: next || null });
                  } catch {
                    toast.show({ message: "Couldn't save notes.", tone: 'error' });
                  }
                }}
              />
              <p className="text-2xs text-ink-soft mt-2">Saves on blur.</p>
            </div>
          )}
        </div>
      )}
    </DetailPane>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-ink font-medium tabular">{value || '—'}</div>
      <div className="text-2xs uppercase tracking-widest text-ink-soft mt-0.5">{label || ' '}</div>
    </div>
  );
}

export default StudentDetailPane;
