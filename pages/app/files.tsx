// Team-only org library + cross-student search.
//
// Solo accounts get an upgrade nudge. Server enforces the tier; the page
// guards the UI for clarity.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../components/AuthGuard';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';
import { FilesPanel } from '../../components/files/FilesPanel';

type Mode = 'library' | 'all';

function FilesPageInner() {
  const { t } = useTranslation('files');
  const router = useRouter();
  const [planTier, setPlanTier] = useState<'solo' | 'team' | 'growth' | null>(null);
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>([]);
  const [studentFilter, setStudentFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

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
      <div className="border-b border-rule mb-6">
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

      {mode === 'all' && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-xs text-ink-muted">{t('page.filter_student')}</label>
          <select
            className="input text-sm"
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
          >
            <option value="">{t('page.filter_all_students')}</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {mode === 'library' ? (
        <FilesPanel scope={{ kind: 'library' }} showSearch={showSearch} students={students} />
      ) : (
        <FilesPanel
          scope={studentFilter ? { kind: 'org_browse', student_id: studentFilter } : { kind: 'org_browse' }}
          showSearch={showSearch}
          students={students}
        />
      )}
    </Layout>
  );
}

export default function FilesPage() {
  return <AuthGuard><FilesPageInner /></AuthGuard>;
}
