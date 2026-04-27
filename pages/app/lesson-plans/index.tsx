import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconBook } from '../../../components/design/icons';
import { Skeleton } from '../../../components/design/Skeleton';
import { Modal } from '../../../components/design/Modal';
import { StatusPill } from '../../../components/design/StatusPill';
import { useToast } from '../../../components/design/Toast';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { LessonPlan, Student } from '../../../lib/types';
import { useLocaleFormatters } from '../../../lib/useLocaleFormatters';

function LessonPlansInner() {
  const { t } = useTranslation('lesson_plans');
  const { formatDate } = useLocaleFormatters();
  const { membership, loading: membershipLoading } = useMembership();
  const isTutor = membership?.role === 'tutor';
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<(LessonPlan & { student: Student | null })[]>([]);
  const [useInPlan, setUseInPlan] = useState<(LessonPlan & { student: Student | null }) | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    if (!useInPlan) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('students')
        .select('id, name')
        .eq('archived', false)
        .order('name');
      if (!cancelled) setStudents((data ?? []) as Student[]);
    })();
    return () => { cancelled = true; };
  }, [useInPlan]);

  useEffect(() => {
    if (membershipLoading) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      let q = supabase
        .from('lesson_plans')
        .select('*, student:students(id,name)')
        .order('created_at', { ascending: false });
      if (isTutor && session) {
        q = q.eq('owner_id', session.user.id);
      }
      const { data } = await q;
      setPlans((data ?? []) as any);
      setLoading(false);
    })();
  }, [membership, membershipLoading, isTutor]);

  return (
    <Layout
      subtitle={t('page.subtitle')}
      title={t('page.title')}
      actions={<Link href="/app/lesson-plans/new" className="btn-primary">{t('actions.new')}</Link>}
    >
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-4 w-3/4 mb-3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<IconBook />}
          title="No lesson plans yet."
          description="Generate one and use it in a session."
          action={<Link href="/app/lesson-plans/new" className="btn-primary">{t('actions.generate')}</Link>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className="card p-4 hover:bg-ruleSoft/40 transition-colors duration-100 flex flex-col gap-2"
            >
              <Link href={`/app/lesson-plans/new?id=${p.id}`} className="block">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="text-2xs uppercase tracking-widest text-ink-muted truncate">
                    {p.subject}
                    {p.year_level && ` · ${p.year_level}`}
                  </div>
                  {p.generated_by_ai && (
                    <span className="text-2xs text-forest shrink-0" title="AI generated">✨</span>
                  )}
                </div>
                <div className="text-sm font-medium text-ink leading-snug line-clamp-2 mb-2">
                  {p.topic}
                </div>
                <div className="flex items-center gap-2">
                  <DifficultyPill plan={p} />
                </div>
              </Link>
              <div className="text-2xs text-ink-soft flex items-center justify-between mt-auto">
                <span className="truncate">{p.student?.name ?? t('card.unassigned')}</span>
                <span className="num tabular shrink-0 ml-2">{formatDate(p.created_at)}</span>
              </div>
              <div className="flex items-center gap-1 pt-1 border-t border-ruleSoft -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setUseInPlan(p)}
                  className="btn-ghost text-2xs px-2 py-1 text-forest hover:text-forest"
                >
                  Use in session →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {useInPlan && (
        <UseInSessionModal
          plan={useInPlan}
          students={students}
          onClose={() => setUseInPlan(null)}
        />
      )}
    </Layout>
  );
}

// Infer difficulty from the plan's year level. The schema doesn't track this
// explicitly yet — read year_level when available; default to "Intermediate".
function DifficultyPill({ plan }: { plan: LessonPlan & { student: Student | null } }) {
  const yearNum = plan.year_level ? parseInt(plan.year_level.replace(/\D/g, ''), 10) : NaN;
  let level: 'Beginner' | 'Intermediate' | 'Advanced' = 'Intermediate';
  if (Number.isFinite(yearNum)) {
    if (yearNum <= 4) level = 'Beginner';
    else if (yearNum >= 11) level = 'Advanced';
  }
  const tone = level === 'Beginner' ? 'success' : level === 'Advanced' ? 'forest' : 'neutral';
  return <StatusPill tone={tone as any}>{level}</StatusPill>;
}

function UseInSessionModal({
  plan, students, onClose,
}: {
  plan: LessonPlan & { student: Student | null };
  students: Student[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [studentId, setStudentId] = useState<string>(plan.student?.id ?? '');
  const [when, setWhen] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!studentId || !when) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          student_id: studentId,
          scheduled_at: new Date(when).toISOString(),
          duration_minutes: 60,
          subject: plan.subject,
          topic: plan.topic,
          lesson_plan_id: plan.id,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json().catch(() => ({} as any));
      toast.show({ message: 'Session scheduled.', tone: 'success' });
      onClose();
      if (json?.id) router.push(`/app/sessions/${json.id}`);
    } catch {
      toast.show({ message: 'Could not create session.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Use in session">
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          Schedule a session and attach <strong className="text-ink">{plan.topic}</strong> as the lesson plan.
        </p>
        <div>
          <label className="label">Student</label>
          <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Pick a student…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">When</label>
          <input
            type="datetime-local"
            className="input"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !studentId || !when}
            className="btn-primary text-xs"
          >
            {busy ? 'Scheduling…' : 'Schedule session'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function LessonPlansPage() {
  return <AuthGuard><LessonPlansInner /></AuthGuard>;
}
