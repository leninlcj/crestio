import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconUsers, IconArchive } from '../../../components/design/icons';
import { Skeleton } from '../../../components/design/Skeleton';
import { FilterChips } from '../../../components/design/FilterChips';
import { useDetailParam } from '../../../components/design/DetailPane';
import dynamic from 'next/dynamic';
const StudentDetailPane = dynamic(
  () => import('../../../components/students/StudentDetailPane').then((m) => m.StudentDetailPane),
  { ssr: false },
);
import { Avatar } from '../../../components/design/Avatar';
import { MiniBarChart } from '../../../components/design/MiniBarChart';
import { Tooltip } from '../../../components/design/Tooltip';
import { InlineAddRow } from '../../../components/quickcreate/InlineAddRow';
import { BulkArchiveBar } from '../../../components/design/BulkArchiveBar';
import { HoverCard } from '../../../components/depth/HoverCard';
import { useOptionalDetailStack } from '../../../components/depth/DetailPaneStack';
import SampleDataBanner from '../../../components/SampleDataBanner';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { Student } from '../../../lib/types';
import { formatCents, initials, cx } from '../../../lib/utils';
import { formatTime, formatRelativeDate } from '../../../lib/format';

type StudentRow = Student & {
  _last_session_at?: string | null;
  _next_session_at?: string | null;
  _session_count?: number;
  _total_minutes?: number;
  /** 28-day activity buckets (oldest → newest) for the bottom card strip. */
  _activity_28d?: number[];
  /** True when an active recurring template still exists for this student. */
  _has_active_template?: boolean;
};

const VIEW_KEY = 'crestio.students.view';

function StudentsInner() {
  const router = useRouter();
  const { t } = useTranslation(['students', 'common']);
  const { membership, loading: membershipLoading } = useMembership();
  const isTutor = membership?.role === 'tutor';
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [currency, setCurrency] = useState('AUD');
  const [query, setQuery] = useState('');
  const detail = useDetailParam();
  const detailId = detail.value && detail.value.startsWith('student:')
    ? detail.value.slice('student:'.length) : null;

  const archived = router.query.archived === '1';
  const status = (router.query.status as string) ?? 'active';
  const subject = (router.query.subject as string) ?? '';
  const sort = (router.query.sort as string) ?? 'name';

  const [view, setView] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    return (window.localStorage.getItem(VIEW_KEY) as 'grid' | 'list') ?? 'grid';
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  // Drop-on-TrashZone removes the row; restore (⌘Z) re-adds via a refresh.
  useEffect(() => {
    function onArchived(e: Event) {
      const detail = (e as CustomEvent).detail as { type: string; id: string };
      if (detail?.type !== 'student') return;
      setStudents((rs) => rs.filter((r) => r.id !== detail.id));
    }
    window.addEventListener('crestio:entity-archived', onArchived as EventListener);
    return () => window.removeEventListener('crestio:entity-archived', onArchived as EventListener);
  }, []);

  useEffect(() => {
    if (membershipLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: p } = await supabase
          .from('profiles').select('currency').eq('id', session.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }
      let showTests = false;
      if (session) {
        const { data: me } = await supabase
          .from('profiles').select('show_test_accounts_in_lists').eq('id', session.user.id).maybeSingle();
        showTests = !!me?.show_test_accounts_in_lists;
      }
      let q = supabase.from('students').select('*').eq('archived', archived);
      if (!showTests) q = q.eq('is_test_record', false);
      if (isTutor && membership?.tutor_id) {
        q = q.eq('primary_tutor_id', membership.tutor_id);
      } else if (isTutor && !membership?.tutor_id) {
        if (!cancelled) { setStudents([]); setLoading(false); }
        return;
      }
      const { data } = await q;
      if (cancelled) return;
      const list = (data ?? []) as StudentRow[];

      // Enrich with session aggregates in one round-trip.
      if (list.length > 0) {
        const ids = list.map((s) => s.id);
        const { data: sessRows } = await supabase
          .from('sessions')
          .select('student_id, scheduled_at, status, duration_minutes')
          .in('student_id', ids)
          .gte('scheduled_at', new Date(Date.now() - 365 * 86_400_000).toISOString())
          .limit(2000);
        const byStudent = new Map<string, any[]>();
        for (const s of (sessRows ?? []) as any[]) {
          if (!byStudent.has(s.student_id)) byStudent.set(s.student_id, []);
          byStudent.get(s.student_id)!.push(s);
        }
        // Build 28-day buckets (oldest → newest), one per day.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayKeys: string[] = Array.from({ length: 28 }, (_, i) => {
          const d = new Date(today);
          d.setDate(today.getDate() - (27 - i));
          return d.toISOString().slice(0, 10);
        });

        for (const stu of list) {
          const rows = byStudent.get(stu.id) ?? [];
          const completed = rows.filter((r) => r.status === 'completed');
          const last = completed
            .map((r) => r.scheduled_at)
            .sort()
            .reverse()[0] ?? null;
          const future = rows
            .filter((r) => new Date(r.scheduled_at).getTime() > Date.now())
            .map((r) => r.scheduled_at)
            .sort()[0] ?? null;
          stu._last_session_at = last;
          stu._next_session_at = future;
          stu._session_count = completed.length;
          stu._total_minutes = completed.reduce((acc, r) => acc + (r.duration_minutes ?? 0), 0);

          const buckets = new Map<string, number>(dayKeys.map((k) => [k, 0]));
          for (const r of completed) {
            const k = (r.scheduled_at as string).slice(0, 10);
            if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
          }
          stu._activity_28d = dayKeys.map((k) => buckets.get(k) ?? 0);
        }
        // Look up active templates per student in one round-trip.
        const { data: templates } = await supabase
          .from('session_templates')
          .select('student_id, paused_at')
          .in('student_id', ids);
        const activeBy = new Set<string>();
        for (const t of (templates ?? []) as any[]) {
          if (!t.paused_at) activeBy.add(t.student_id);
        }
        for (const stu of list) stu._has_active_template = activeBy.has(stu.id);
      }
      setStudents(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [archived, membership, membershipLoading, isTutor]);

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) for (const subj of s.subjects ?? []) set.add(subj);
    return Array.from(set).sort();
  }, [students]);

  const filtered = useMemo(() => {
    let list = students;
    // Mutually exclusive across active / dormant / new. "All" is everyone.
    //   active  = had a session in the last 30 days
    //   dormant = had a session before, but none in the last 30 days
    //   new     = created in the last 14 days AND zero sessions
    if (status === 'active') {
      list = list.filter((s) => s._last_session_at
        && Date.now() - new Date(s._last_session_at).getTime() < 30 * 86_400_000);
    } else if (status === 'dormant') {
      list = list.filter((s) => s._last_session_at
        && Date.now() - new Date(s._last_session_at).getTime() >= 30 * 86_400_000);
    } else if (status === 'new') {
      list = list.filter((s) => !s._last_session_at
        && Date.now() - new Date(s.created_at).getTime() < 14 * 86_400_000);
    }
    if (subject) list = list.filter((s) => (s.subjects ?? []).includes(subject));
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((s) =>
        [s.name, s.school, s.parent_name, (s.subjects ?? []).join(' ')]
          .join(' ').toLowerCase().includes(q),
      );
    }
    if (sort === 'last') {
      list = [...list].sort((a, b) => (b._last_session_at ?? '').localeCompare(a._last_session_at ?? ''));
    } else if (sort === 'sessions') {
      list = [...list].sort((a, b) => (b._session_count ?? 0) - (a._session_count ?? 0));
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [students, status, subject, query, sort]);

  function setQueryParam(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    router.replace(url.pathname + url.search);
  }

  return (
    <Layout
      subtitle={t('students:subtitle')}
      title={t('students:title_list')}
      actions={
        isTutor ? undefined : (
          <div className="flex items-center gap-2">
            <Link href="/app/students/import" className="btn-secondary text-xs">Import CSV</Link>
            <Link href="/app/students/new" className="btn-primary">{t('students:actions.add')}</Link>
          </div>
        )
      }
    >
      <div className="mb-4"><SampleDataBanner /></div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="search"
          placeholder="Search students…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input md:max-w-sm flex-1 min-w-[180px]"
        />
        <FilterChips
          ariaLabel="Status"
          options={[
            { value: 'active',  label: 'Active' },
            { value: 'dormant', label: 'Dormant' },
            { value: 'new',     label: 'New' },
            { value: '',        label: 'All' },
          ]}
          value={status}
          onChange={(next) => setQueryParam('status', next as string)}
        />
        {allSubjects.length > 0 && (
          <select
            value={subject}
            onChange={(e) => setQueryParam('subject', e.target.value)}
            className="input text-xs h-8 max-w-[160px]"
            aria-label="Subject filter"
          >
            <option value="">All subjects</option>
            {allSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Grid view"
            onClick={() => setView('grid')}
            className={cx(
              'h-8 w-8 grid place-items-center rounded transition-colors duration-100',
              view === 'grid' ? 'bg-ink text-cream' : 'text-ink-muted hover:bg-ruleSoft hover:text-ink',
            )}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
          <button
            type="button"
            aria-label="List view"
            onClick={() => setView('list')}
            className={cx(
              'h-8 w-8 grid place-items-center rounded transition-colors duration-100',
              view === 'list' ? 'bg-ink text-cream' : 'text-ink-muted hover:bg-ruleSoft hover:text-ink',
            )}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <button
            type="button"
            onClick={() => setQueryParam('archived', archived ? '' : '1')}
            className={cx(
              'h-8 px-2.5 text-xs rounded transition-colors duration-100',
              archived ? 'bg-ink text-cream' : 'text-ink-muted hover:bg-ruleSoft hover:text-ink',
            )}
            aria-pressed={archived}
          >
            {archived ? 'Showing archived' : 'Active only'}
          </button>
        </div>
      </div>

      {loading ? (
        view === 'grid' ? <StudentGridSkeleton /> : <StudentListSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={archived ? <IconArchive /> : <IconUsers />}
          title={archived ? 'No archived students.' : isTutor ? 'No students assigned.' : 'No students yet.'}
          description={archived
            ? 'Switch back to active to see your roster.'
            : isTutor
              ? 'Ask your owner to assign students to you.'
              : 'Start with one or import a roster from CSV.'}
          action={!archived && !isTutor
            ? (
              <div className="flex items-center gap-2">
                <Link href="/app/students/new" className="btn-primary">Add your first</Link>
                <Link href="/app/students/import" className="btn-secondary text-sm">Import from CSV</Link>
              </div>
            )
            : undefined}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <StudentCard
              key={s.id}
              student={s}
              currency={currency}
              showRate={!isTutor}
              onOpen={() => detail.open(`student:${s.id}`)}
            />
          ))}
          {!isTutor && !archived && <InlineAddRow type="student" label="Add student" variant="tile" />}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-rule">
            {filtered.map((s) => (
              <li
                key={s.id}
                onClick={() => detail.open(`student:${s.id}`)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-crestio-entity', JSON.stringify({ type: 'student', id: s.id, label: s.name }));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                className="group cursor-pointer flex items-center gap-3 px-3 py-2.5 hover:bg-ruleSoft/40 transition-colors duration-100"
                style={{ minHeight: 48 }}
              >
                {!isTutor && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${s.name}`}
                    checked={selected.has(s.id)}
                    onChange={(e) => { e.stopPropagation(); toggleSel(s.id); }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                )}
                <div className="h-7 w-7 rounded-full bg-forest-soft text-forest-ink grid place-items-center text-2xs font-mono font-medium shrink-0">
                  {initials(s.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink truncate">
                    <HoverCard type="student" id={s.id}>{s.name}</HoverCard>
                  </div>
                  <div className="text-2xs text-ink-soft truncate">
                    {[s.year_level, (s.subjects ?? []).join(', '), s.school].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="text-2xs text-ink-muted tabular shrink-0 hidden sm:block">
                  {s._last_session_at ? `Last ${relativeDays(s._last_session_at)}` : 'No sessions'}
                </div>
                {!isTutor && (
                  <div className="text-2xs text-ink-muted tabular shrink-0 w-16 text-right hidden sm:block">
                    {formatCents(s.hourly_rate_cents, currency)}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!isTutor && !archived && (
            <div className="px-3 py-2 border-t border-rule">
              <InlineAddRow type="student" label="Add student" />
            </div>
          )}
        </div>
      )}

      {!isTutor && selected.size > 0 && (
        <BulkArchiveBar
          entityType="student"
          selected={selected}
          onClear={() => setSelected(new Set())}
          items={filtered.filter((s) => selected.has(s.id)).map((s) => ({
            id: s.id, label: s.name,
            sublabel: [s.year_level, (s.subjects ?? []).join(', ')].filter(Boolean).join(' · '),
          }))}
          onLocalRemove={(ids) => setStudents((rs) => rs.filter((r) => !ids.includes(r.id)))}
        />
      )}

      <StudentDetailPane
        open={!!detailId}
        studentId={detailId}
        onClose={detail.close}
        currency={currency}
        isOwner={!isTutor}
      />
    </Layout>
  );
}

function StudentCard({
  student, currency, showRate, onOpen,
}: { student: StudentRow; currency: string; showRate: boolean; onOpen: () => void }) {
  const lastLabel = student._last_session_at
    ? `Last ${relativeDays(student._last_session_at)}`
    : 'No sessions yet';
  const subjects = student.subjects ?? [];
  const status = computeStudentStatus(student);
  const next = student._next_session_at;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card p-4 text-left transition-colors duration-100 hover:bg-ruleSoft/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 group block w-full"
    >
      <div className="flex items-start gap-3">
        <Avatar name={student.name} size={32} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink font-medium truncate flex items-center gap-1.5">
            <Tooltip label={status.label}>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: status.color }}
                aria-label={status.label}
              />
            </Tooltip>
            <span className="truncate">{student.name}</span>
          </div>
          <div className="text-2xs text-ink-soft truncate mt-0.5">
            {[student.year_level, student.school].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        {showRate && student.hourly_rate_cents && (
          <div className="text-2xs text-ink-muted num tabular shrink-0">
            {formatCents(student.hourly_rate_cents, currency)}
          </div>
        )}
      </div>
      {subjects.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {subjects.slice(0, 3).map((s) => (
            <span key={s} className="text-2xs px-1.5 py-0.5 rounded bg-ruleSoft text-ink-muted">{s}</span>
          ))}
        </div>
      )}
      <div className="text-2xs text-ink-muted mt-3 truncate">
        {next
          ? <>Next: <span className="text-ink num tabular">{formatRelativeDate(next)} · {formatTime(next)}</span></>
          : 'No upcoming session'}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-ruleSoft text-2xs text-ink-muted gap-2">
        <span className="truncate">{lastLabel}</span>
        <span className="num tabular shrink-0">
          {student._session_count ?? 0}{' · '}{((student._total_minutes ?? 0) / 60).toFixed(1)}h
        </span>
      </div>
      {student._activity_28d && student._activity_28d.some((v) => v > 0) && (
        <div className="mt-2">
          <MiniBarChart
            data={student._activity_28d.map((v, i) => ({ label: `Day ${i + 1}`, value: v }))}
            variant="bars"
            width={220}
            height={20}
          />
        </div>
      )}
      <AtRiskStrip student={student} />
    </button>
  );
}

function AtRiskStrip({ student }: { student: StudentRow }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (!student._last_session_at) return null;
  const days = Math.floor((Date.now() - new Date(student._last_session_at).getTime()) / 86_400_000);
  if (days < 22) return null;
  if (!student._has_active_template) return null;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-2 -mx-1 px-2 py-1.5 rounded-md bg-claret/8 border border-claret/20 flex items-center gap-2"
    >
      <span className="w-1 h-1 rounded-full bg-claret shrink-0" />
      <span className="text-2xs text-claret flex-1 truncate">
        Last session {days}d ago. Template still active.
      </span>
      <Link
        href={`/app/sessions/new?student=${student.id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-2xs text-claret font-medium underline underline-offset-2 shrink-0"
      >
        Schedule
      </Link>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setDismissed(true); }}
        aria-label="Dismiss"
        className="text-claret/60 hover:text-claret shrink-0"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  );
}

function computeStudentStatus(s: StudentRow): { tone: 'active' | 'dormant' | 'new'; color: string; label: string } {
  // Mirror the filter rules so a student's badge always matches the tab they
  // would appear under. Mutually exclusive across active / dormant / new.
  const hasSession = !!s._last_session_at;
  const isNew = !hasSession
    && Date.now() - new Date(s.created_at).getTime() < 14 * 86_400_000;
  if (isNew) {
    return { tone: 'new', color: '#1E40AF', label: 'New (added in the last 14 days, no sessions yet)' };
  }
  if (hasSession && Date.now() - new Date(s._last_session_at!).getTime() < 30 * 86_400_000) {
    return { tone: 'active', color: '#2F7D4F', label: 'Active (session in the last 30 days)' };
  }
  return { tone: 'dormant', color: '#A0A39E', label: 'Dormant (no session in the last 30 days)' };
}

function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function StudentGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="w-9 h-9 rounded-full" />
            <div className="flex-1"><Skeleton className="h-4 w-2/3 mb-1.5" /><Skeleton className="h-3 w-1/2" /></div>
          </div>
          <div className="flex gap-1 mt-3"><Skeleton className="h-4 w-12" /><Skeleton className="h-4 w-16" /></div>
          <Skeleton className="h-3 w-1/2 mt-3" />
        </div>
      ))}
    </div>
  );
}

function StudentListSkeleton() {
  return (
    <div className="card divide-y divide-rule">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5" style={{ minHeight: 48 }}>
          <Skeleton className="w-7 h-7 rounded-full" />
          <div className="flex-1"><Skeleton className="h-3 w-1/3 mb-1" /><Skeleton className="h-2.5 w-1/4" /></div>
          <Skeleton className="w-14 h-3" />
        </div>
      ))}
    </div>
  );
}

export default function StudentsPage() {
  return <AuthGuard><StudentsInner /></AuthGuard>;
}
