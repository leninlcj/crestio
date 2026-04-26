import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconBook } from '../../../components/design/icons';
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
        <div className="card p-6 text-sm text-ink-muted">{t('common.loading')}</div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={<IconBook />}
          title={t('empty.title')}
          description={t('empty.description')}
          action={<Link href="/app/lesson-plans/new" className="btn-primary">{t('actions.generate')}</Link>}
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {plans.map((p) => (
            <Link key={p.id} href={`/app/lesson-plans/new?id=${p.id}`}
              className="card p-6 hover:border-forest transition-colors block">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
                    {p.subject}
                    {p.year_level && ` · ${p.year_level}`}
                  </div>
                  <div className="font-display text-xl tracking-tightest text-ink leading-tight">
                    {p.topic}
                  </div>
                </div>
                {p.generated_by_ai && (
                  <span className="badge-forest">{t('card.ai_badge')}</span>
                )}
              </div>
              <div className="text-xs text-ink-muted mt-3 flex items-center justify-between">
                <div>{p.student?.name ?? t('card.unassigned')}</div>
                <div className="font-mono">{formatDate(p.created_at)}</div>
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
