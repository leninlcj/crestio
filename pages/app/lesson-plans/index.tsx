import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconBook } from '../../../components/design/icons';
import { Skeleton } from '../../../components/design/Skeleton';
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
            <Link
              key={p.id}
              href={`/app/lesson-plans/new?id=${p.id}`}
              className="card p-4 hover:bg-ruleSoft/40 transition-colors duration-100 block"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="text-2xs uppercase tracking-widest text-ink-muted truncate">
                  {p.subject}
                  {p.year_level && ` · ${p.year_level}`}
                </div>
                {p.generated_by_ai && (
                  <span className="text-2xs text-forest shrink-0" title="AI generated">✨</span>
                )}
              </div>
              <div className="text-sm font-medium text-ink leading-snug line-clamp-2 mb-3">
                {p.topic}
              </div>
              <div className="text-2xs text-ink-soft flex items-center justify-between">
                <span className="truncate">{p.student?.name ?? t('card.unassigned')}</span>
                <span className="tabular shrink-0 ml-2">{formatDate(p.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}

export default function LessonPlansPage() {
  return <AuthGuard><LessonPlansInner /></AuthGuard>;
}
