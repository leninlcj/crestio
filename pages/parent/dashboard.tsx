import { activeLocale } from '../../lib/utils';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../components/AuthGuardParent';
import NotificationBell from '../../components/notifications/NotificationBell';
import { supabase } from '../../lib/supabase';

type Overview = {
  parent: { name: string | null; email: string | null };
  students: Array<{
    id: string;
    name: string;
    year_level: string | null;
    subjects: string[] | null;
    household_id: string | null;
    household_name: string | null;
    outstanding_cents: number;
  }>;
  this_week_sessions: Array<{
    id: string;
    student_id: string;
    student_name: string;
    subject: string | null;
    scheduled_at: string;
    duration_minutes: number;
    status: string;
    tutor_name: string | null;
  }>;
  recent_updates: Array<{
    id: string;
    student_id: string;
    student_name: string | null;
    content: string;
    created_at: string;
    created_by_name: string;
  }>;
  stats: {
    sessions_this_month: number;
    sessions_this_year: number;
    outstanding_cents: number;
    paid_cents: number;
  };
};

function formatAud(cents: number): string {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency', currency: 'AUD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
function relativeDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const ad = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const bd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((ad.getTime() - bd.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(activeLocale(), { weekday: 'long' });
  return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(activeLocale(), { hour: 'numeric', minute: '2-digit' });
}
function displayYearLevel(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Don't prepend "Year" if it's already there (fixes the "Year Year 11" bug).
  if (/^year\s/i.test(trimmed)) return trimmed;
  return `Year ${trimmed}`;
}

function DashboardInner() {
  const router = useRouter();
  const { t } = useTranslation('parent');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noAccessBanner, setNoAccessBanner] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      const res = await fetch('/api/parent/overview', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError(t('dashboard.loading_error'));
        setLoading(false);
        return;
      }
      setOverview(await res.json());
      setLoading(false);
    })();
  }, []);

  // Surface the ?error=no_access banner that AuthGuardParent / per-student
  // redirects set when the parent hits a forbidden route.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.error === 'no_access') {
      setNoAccessBanner(true);
      const id = setTimeout(() => setNoAccessBanner(false), 8000);
      return () => clearTimeout(id);
    }
  }, [router.isReady, router.query.error]);

  useEffect(() => {
    const handle = () => setNoAccessBanner(false);
    router.events.on('routeChangeStart', handle);
    return () => router.events.off('routeChangeStart', handle);
  }, [router.events]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/parent/signin');
  }

  const childNames = (overview?.students ?? []).map((s) => s.name).filter(Boolean);
  const browserTitle = childNames.length
    ? `${childNames.join(', ')} · Crestio`
    : 'Crestio';

  return (
    <div className="min-h-screen bg-cream text-ink">
      <Head>
        <title>{browserTitle}</title>
      </Head>
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/parent/calendar" className="text-ink-muted hover:text-ink">{t('nav.calendar')}</Link>
          <Link href="/parent/messages" className="text-ink-muted hover:text-ink">{t('nav.messages')}</Link>
          <Link href="/parent/invoices" className="text-ink-muted hover:text-ink">{t('nav.invoices')}</Link>
          <Link href="/parent/settings" className="text-ink-muted hover:text-ink">{t('nav.settings')}</Link>
          <NotificationBell mode="parent" />
          <button onClick={signOut} className="text-claret hover:text-claret/80">{t('nav.sign_out')}</button>
        </div>
      </nav>

      <main className="px-6 md:px-12 py-10 md:py-14 max-w-5xl mx-auto">
        {noAccessBanner && (
          <div
            role="alert"
            className="mb-8 flex items-start justify-between gap-3 p-3 rounded border border-claret/30 bg-claret/5 text-sm text-claret"
          >
            <span>{t('dashboard.no_access_banner')}</span>
            <button
              type="button"
              onClick={() => setNoAccessBanner(false)}
              className="text-2xs text-claret/70 hover:text-claret"
              aria-label={t('dashboard.banner_dismiss')}
            >
              ✕
            </button>
          </div>
        )}
        <div className="mb-10">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">{t('dashboard.kicker')}</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tightest text-ink">
            {overview?.parent?.name ? t('dashboard.greeting', { name: overview.parent.name.split(' ')[0] }) : t('dashboard.greeting_fallback')}
          </h1>
        </div>

        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <div className="card p-6 text-sm text-claret">{error}</div>
        ) : overview ? (
          <div className="space-y-10">
            <ThisWeek sessions={overview.this_week_sessions} t={t as any} />
            <RecentUpdates updates={overview.recent_updates} t={t as any} />
            <ChildrenGrid students={overview.students} t={t as any} />
            <QuickStats stats={overview.stats} t={t as any} />
          </div>
        ) : null}
      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10 animate-pulse">
      <div>
        <div className="h-4 w-32 bg-ruleSoft rounded mb-4" />
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 w-64 bg-ruleSoft rounded shrink-0" />
          ))}
        </div>
      </div>
      <div>
        <div className="h-4 w-48 bg-ruleSoft rounded mb-4" />
        <div className="h-24 bg-ruleSoft rounded" />
      </div>
      <div>
        <div className="h-4 w-28 bg-ruleSoft rounded mb-4" />
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="h-32 bg-ruleSoft rounded" />)}
        </div>
      </div>
    </div>
  );
}

function ThisWeek({ sessions, t }: { sessions: Overview['this_week_sessions']; t: (k: string, v?: any) => string }) {
  if (sessions.length === 0) {
    return (
      <section>
        <h2 className="font-display text-xl tracking-tightest mb-3">{t('parent:dashboard.this_week')}</h2>
        <div className="card p-6 text-sm text-ink-muted">{t('parent:dashboard.this_week_empty')}</div>
      </section>
    );
  }
  return (
    <section>
      <h2 className="font-display text-xl tracking-tightest mb-3">{t('parent:dashboard.this_week')}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 md:mx-0 md:px-0">
        {sessions.map((s) => (
          <Link
            key={s.id}
            href={`/parent/student/${s.student_id}`}
            className="card p-4 w-64 shrink-0 hover:shadow-lift transition-shadow"
          >
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
              {relativeDay(s.scheduled_at)} · {formatTime(s.scheduled_at)}
            </div>
            <div className="font-display text-lg tracking-tightest text-ink mb-1">
              {s.student_name}
            </div>
            <div className="text-xs text-ink-muted">
              {s.duration_minutes} min{s.subject ? ` · ${s.subject}` : ''}
            </div>
            {s.tutor_name && (
              <div className="text-2xs text-ink-soft mt-2">{t('common:connectors.with_tutor', { name: s.tutor_name })}</div>
            )}
            {s.status === 'pending_change' && (
              <div className="text-2xs text-amber-ink mt-2">{t('parent:dashboard.change_requested')}</div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecentUpdates({ updates, t }: { updates: Overview['recent_updates']; t: (k: string, v?: any) => string }) {
  if (updates.length === 0) return null;
  return (
    <section>
      <h2 className="font-display text-xl tracking-tightest mb-3">{t('parent:dashboard.recent_updates')}</h2>
      <div className="space-y-3">
        {updates.map((u) => (
          <article key={u.id} className="card p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-2xs uppercase tracking-widest text-ink-muted">
                {relativeDay(u.created_at)}{u.student_name ? ` · ${t('parent:dashboard.about_student', { name: u.student_name, defaultValue: 'About {{name}}' })}` : ''}
              </div>
              <div className="text-2xs text-ink-soft">{t('parent:dashboard.from_sender', { name: u.created_by_name, defaultValue: 'From {{name}}' })}</div>
            </div>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{u.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChildrenGrid({ students, t }: { students: Overview['students']; t: (k: string, v?: any) => string }) {
  if (students.length === 0) return null;

  // Group by household. Students without a household (or with a unique
  // household) render in an "Other" bucket by id so each card stays together.
  const groups = new Map<string, { label: string | null; students: Overview['students'] }>();
  for (const s of students) {
    const key = s.household_id ?? `__no_household:${s.id}`;
    const label = s.household_id ? s.household_name ?? null : null;
    if (!groups.has(key)) groups.set(key, { label, students: [] });
    groups.get(key)!.students.push(s);
  }
  const entries = Array.from(groups.values());
  const showHouseholdLabels = entries.some((g) => g.label && g.students.length > 1);

  return (
    <section>
      <h2 className="font-display text-xl tracking-tightest mb-3">{t('parent:dashboard.your_children')}</h2>
      <div className="space-y-6">
        {entries.map((group, idx) => (
          <div key={idx}>
            {showHouseholdLabels && group.label && group.students.length > 1 && (
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
                {group.label}
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              {group.students.map((s) => {
                const yl = displayYearLevel(s.year_level);
                const subject = s.subjects && s.subjects.length > 0 ? s.subjects[0] : null;
                return (
                  <Link key={s.id} href={`/parent/student/${s.id}`}
                    className="card p-6 hover:shadow-lift transition-shadow">
                    <div className="font-display text-xl tracking-tightest mb-1">{s.name}</div>
                    <div className="text-sm text-ink-muted mb-4">
                      {[yl, subject].filter(Boolean).join(' · ') || '—'}
                    </div>
                    {s.outstanding_cents > 0 && (
                      <div className="text-xs text-claret">
                        Outstanding: {formatAud(s.outstanding_cents)}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickStats({ stats, t }: { stats: Overview['stats']; t: (k: string, v?: any) => string }) {
  return (
    <section>
      <h2 className="font-display text-xl tracking-tightest mb-3">{t('parent:dashboard.at_a_glance')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label={t('parent:dashboard.stats.sessions_this_month')} value={String(stats.sessions_this_month)} />
        <StatTile label={t('parent:dashboard.stats.sessions_completed_this_year')} value={String(stats.sessions_this_year)} />
        <StatTile label={t('parent:dashboard.stats.paid')} value={formatAud(stats.paid_cents)} />
        <StatTile label={t('parent:dashboard.stats.outstanding')} value={formatAud(stats.outstanding_cents)}
          tone={stats.outstanding_cents > 0 ? 'claret' : 'default'} />
      </div>
    </section>
  );
}
function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'claret' }) {
  return (
    <div className="card p-4">
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{label}</div>
      <div className={['font-display text-2xl tracking-tightest', tone === 'claret' ? 'text-claret' : 'text-ink'].join(' ')}>
        {value}
      </div>
    </div>
  );
}

export default function ParentDashboard() {
  return <AuthGuardParent><DashboardInner /></AuthGuardParent>;
}
