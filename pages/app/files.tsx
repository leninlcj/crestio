// Team-only org library + cross-student search.
//
// Phase 3 layout: 240px folder tree on the left (By student / By date / By
// tag), file panel on the right. Solo accounts get an upgrade nudge.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../components/AuthGuard';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';
import { FilesPanel } from '../../components/files/FilesPanel';
import { Avatar } from '../../components/design/Avatar';

type Mode = 'library' | 'all';
type DateBucket = 'today' | 'week' | 'month' | 'older' | null;

function FilesPageInner() {
  const { t } = useTranslation('files');
  const router = useRouter();
  const [planTier, setPlanTier] = useState<'solo' | 'team' | 'growth' | null>(null);
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [studentFilter, setStudentFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<DateBucket>(null);
  const [loading, setLoading] = useState(true);
  const [studentsExpanded, setStudentsExpanded] = useState(true);
  const [datesExpanded, setDatesExpanded] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth?.access_token) { setLoading(false); return; }
      const usageRes = await fetch('/api/files/storage-usage', {
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      if (usageRes.ok) {
        const u = await usageRes.json();
        setPlanTier(u.plan_tier);
      }
      const { data: ss } = await supabase
        .from('students').select('id, name').eq('archived', false).order('name');
      setStudents((ss as Array<{ id: string; name: string }>) ?? []);
      setLoading(false);
    })();
  }, []);

  const mode: Mode = router.query.library === '1' ? 'library' : 'all';
  const showSearch = planTier === 'team' || planTier === 'growth';

  if (loading) {
    return <Layout title={t('page.title_loading')}><div className="card p-6 text-sm text-ink-muted">{t('loading')}</div></Layout>;
  }

  if (planTier === 'solo') {
    return (
      <Layout title={t('page.title')}>
        <div className="card p-8 text-center max-w-2xl mx-auto">
          <h2 className="font-display text-3xl tracking-tightest mb-3">{t('upgrade.title')}</h2>
          <p className="text-sm text-ink-muted mb-6">{t('upgrade.body')}</p>
          <Link href="/app/settings?tab=billing" className="btn-primary">
            {t('upgrade.cta')}
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('page.title')} subtitle={t('page.subtitle')}>
      <div className="border-b border-rule mb-4">
        <nav className="flex gap-1" role="tablist">
          <Link
            href="/app/files"
            className={`px-4 py-3 text-sm -mb-px border-b-2 transition-colors ${mode === 'all' ? 'border-forest text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {t('page.tab_all')}
          </Link>
          <Link
            href="/app/files?library=1"
            className={`px-4 py-3 text-sm -mb-px border-b-2 transition-colors ${mode === 'library' ? 'border-forest text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {t('page.tab_library')}
          </Link>
        </nav>
      </div>

      {mode === 'library' ? (
        <FilesPanel scope={{ kind: 'library' }} showSearch={showSearch} students={students} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
          {/* Left: folder tree */}
          <aside className="card p-2 self-start max-h-[calc(100vh-220px)] overflow-y-auto sticky top-[100px]">
            <FolderHeader
              expanded={studentsExpanded}
              onToggle={() => setStudentsExpanded((v) => !v)}
              label="By student"
              count={students.length}
            />
            {studentsExpanded && (
              <ul className="space-y-0.5 pl-2 mb-2">
                <FolderRow
                  active={studentFilter === ''}
                  onClick={() => setStudentFilter('')}
                  label="All students"
                />
                {students.map((s) => (
                  <FolderRow
                    key={s.id}
                    active={studentFilter === s.id}
                    onClick={() => setStudentFilter(s.id)}
                    label={s.name}
                    leading={<Avatar name={s.name} size={16} />}
                  />
                ))}
              </ul>
            )}

            <FolderHeader
              expanded={datesExpanded}
              onToggle={() => setDatesExpanded((v) => !v)}
              label="By date"
              count={null}
            />
            {datesExpanded && (
              <ul className="space-y-0.5 pl-2">
                {(['today', 'week', 'month', 'older'] as const).map((k) => (
                  <FolderRow
                    key={k}
                    active={dateFilter === k}
                    onClick={() => setDateFilter(dateFilter === k ? null : k)}
                    label={DATE_LABELS[k]}
                  />
                ))}
              </ul>
            )}
          </aside>

          {/* Right: file panel — defers to existing FilesPanel. */}
          <div>
            <FilesPanel
              scope={studentFilter ? { kind: 'org_browse', student_id: studentFilter } : { kind: 'org_browse' }}
              showSearch={showSearch}
              students={students}
            />
          </div>
        </div>
      )}
    </Layout>
  );
}

const DATE_LABELS: Record<'today' | 'week' | 'month' | 'older', string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  older: 'Older',
};

function FolderHeader({
  expanded, onToggle, label, count,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
  count: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-2xs uppercase tracking-widest text-ink-muted font-medium hover:text-ink transition-colors duration-100"
    >
      <span className="flex items-center gap-1">
        <svg
          className={['transition-transform duration-100', expanded ? 'rotate-90' : ''].join(' ')}
          width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
        ><polyline points="9 18 15 12 9 6"/></svg>
        {label}
      </span>
      {count != null && <span className="text-2xs text-ink-soft num tabular">{count}</span>}
    </button>
  );
}

function FolderRow({
  active, onClick, label, leading,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  leading?: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={[
          'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors duration-100 truncate',
          active
            ? 'bg-forest-soft text-forest-ink font-medium border-l-2 border-forest -ml-px'
            : 'text-ink-muted hover:text-ink hover:bg-ruleSoft',
        ].join(' ')}
      >
        {leading}
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
}

export default function FilesPage() {
  return <AuthGuard><FilesPageInner /></AuthGuard>;
}
