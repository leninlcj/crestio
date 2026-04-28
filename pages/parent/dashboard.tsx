import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../components/AuthGuardParent';
import ParentLayout from '../../components/parent/ParentLayout';
import { useParentContext } from '../../components/parent/ParentContext';
import NextSessionCard from '../../components/parent/NextSessionCard';
import LatestSessionCard from '../../components/parent/LatestSessionCard';
import BalanceCard from '../../components/parent/BalanceCard';
import StudentRow from '../../components/parent/StudentRow';
import ActivityFeed from '../../components/parent/ActivityFeed';
import FirstTimeWelcome from '../../components/parent/FirstTimeWelcome';
import TutorWeekStrip from '../../components/parent/TutorWeekStrip';
import { supabase } from '../../lib/supabase';

function ParentDashboardContents() {
  const router = useRouter();
  const { t } = useTranslation('parent');
  const { overview, loading, error, parentFirstName, primaryTutorName, reload } = useParentContext();
  const [noAccessBanner, setNoAccessBanner] = useState(false);
  const [parentRow, setParentRow] = useState<{ id: string; first_login_seen_at: string | null } | null>(null);
  const [tutorAbout, setTutorAbout] = useState<string | null>(null);

  // Load the first-login marker + tutor about. The overview API doesn't yet
  // include first_login_seen_at, so a small extra query is fine here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const { data: parent } = await supabase
        .from('parents')
        .select('id, first_login_seen_at')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (!cancelled && parent) setParentRow({ id: parent.id, first_login_seen_at: parent.first_login_seen_at });

      // Tutor about — single round-trip via the parent's first student → org.
      const { data: link } = await supabase
        .from('parent_student_links')
        .select('student:students!inner(organization_id)')
        .eq('parent_id', (parent as any)?.id ?? '')
        .is('revoked_at', null)
        .limit(1);
      const orgId = ((link ?? [])[0] as any)?.student?.organization_id;
      if (orgId) {
        const { data: org } = await supabase.from('organizations').select('about').eq('id', orgId).maybeSingle();
        if (!cancelled) setTutorAbout((org as any)?.about ?? null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.error === 'no_access') {
      setNoAccessBanner(true);
      const id = setTimeout(() => setNoAccessBanner(false), 8000);
      return () => clearTimeout(id);
    }
  }, [router.isReady, router.query.error]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    let key = 'dashboard_v2.greeting_morning';
    if (hour >= 12 && hour < 17) key = 'dashboard_v2.greeting_afternoon';
    else if (hour >= 17 || hour < 5) key = 'dashboard_v2.greeting_evening';
    return parentFirstName ? t(key, { name: parentFirstName }) : t('dashboard_v2.greeting_anon');
  }, [parentFirstName, t]);

  const subline = useMemo(() => {
    const students = overview?.students ?? [];
    if (students.length === 0) return null;
    const tutorName = primaryTutorName;
    const childCount = students.length;
    if (childCount === 1 && tutorName) {
      return t('dashboard_v2.subline_one_child', { child: students[0].name, tutor: tutorName });
    }
    if (tutorName) {
      return t('dashboard_v2.subline_many_with_tutor', { count: childCount, tutor: tutorName });
    }
    if (childCount === 1) return t('dashboard_v2.subline_one_child_no_tutor', { child: students[0].name });
    return t('dashboard_v2.subline_many', { count: childCount });
  }, [overview, primaryTutorName, t]);

  const nextSession = useMemo(() => {
    if (!overview) return null;
    const now = Date.now();
    return overview.this_week_sessions
      .filter((s) => new Date(s.scheduled_at).getTime() >= now)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]
      ?? null;
  }, [overview]);

  const studentIds = useMemo(() => (overview?.students ?? []).map((s) => s.id), [overview]);
  const unpaidCount = useMemo(() => (overview?.students ?? []).filter((s) => s.outstanding_cents > 0).length, [overview]);

  return (
    <>
      <Head>
        <title>Crestio</title>
      </Head>

      <section className="px-6 md:px-12 pt-10 md:pt-14 pb-6 max-w-5xl mx-auto">
        {noAccessBanner && (
          <div role="alert" className="mb-6 flex items-start justify-between gap-3 p-3 rounded border border-claret/30 bg-claret/5 text-sm text-claret">
            <span>{t('dashboard.no_access_banner')}</span>
            <button type="button" onClick={() => setNoAccessBanner(false)} className="text-2xs text-claret/70 hover:text-claret" aria-label={t('dashboard.banner_dismiss')}>✕</button>
          </div>
        )}
        <h1 className="font-display text-3xl md:text-[28px] tracking-tighter text-ink leading-tight">
          {greeting}
        </h1>
        {subline && (
          <p className="text-base text-ink-muted mt-2">{subline}</p>
        )}
      </section>

      <FirstTimeWelcome
        parentId={parentRow?.id ?? null}
        parentName={parentFirstName}
        tutorName={primaryTutorName}
        practiceName={overview?.primary_organization?.name ?? null}
        tutorAbout={tutorAbout}
        shouldShow={!!parentRow && parentRow.first_login_seen_at == null}
      />

      <section className="px-6 md:px-12 pb-16 max-w-5xl mx-auto space-y-6">
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <div className="card p-6 text-sm text-claret">{error}</div>
        ) : !overview ? null : (
          <>
            <NextSessionCard session={nextSession} onChanged={reload} />

            <TutorWeekStrip sessionsThisWeek={overview.this_week_sessions} />

            <div className="grid md:grid-cols-2 gap-4 md:gap-6">
              <LatestSessionCard studentIds={studentIds} />
              <BalanceCard outstandingCents={overview.stats.outstanding_cents} unpaidCount={unpaidCount} />
            </div>

            <section id="students">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-2xs uppercase tracking-widest text-ink-soft">
                  {t('dashboard_v2.all_students', { count: overview.students.length })}
                </h2>
              </div>
              {overview.students.length === 0 ? (
                <div className="rounded-md border border-rule bg-surface p-5 text-sm text-ink-muted">
                  {t('dashboard_v2.no_students_yet')}
                </div>
              ) : (
                <div className="space-y-2">
                  {overview.students.map((s) => {
                    const lastSession = overview.this_week_sessions
                      .filter((x) => x.student_id === s.id)
                      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0]
                      ?.scheduled_at ?? null;
                    return <StudentRow key={s.id} student={s} lastSessionDate={lastSession} />;
                  })}
                </div>
              )}
            </section>

            <ActivityFeed updates={overview.recent_updates} />
          </>
        )}
      </section>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-32 bg-ruleSoft rounded-md" />
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <div className="h-28 bg-ruleSoft rounded-md" />
        <div className="h-28 bg-ruleSoft rounded-md" />
      </div>
      <div className="h-4 w-32 bg-ruleSoft rounded" />
      <div className="space-y-2">
        <div className="h-16 bg-ruleSoft rounded-md" />
        <div className="h-16 bg-ruleSoft rounded-md" />
      </div>
    </div>
  );
}

export default function ParentDashboard() {
  return (
    <AuthGuardParent>
      <ParentLayout active="home">
        <ParentDashboardContents />
      </ParentLayout>
    </AuthGuardParent>
  );
}
