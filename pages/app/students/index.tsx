import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { IconUsers, IconArchive } from '../../../components/design/icons';
import { TableSkeleton } from '../../../components/design/Skeleton';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { Student } from '../../../lib/types';
import { formatCents, initials } from '../../../lib/utils';

function StudentsInner() {
  const router = useRouter();
  const { t } = useTranslation(['students', 'common']);
  const { membership, loading: membershipLoading } = useMembership();
  const isTutor = membership?.role === 'tutor';
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [currency, setCurrency] = useState('AUD');
  const [query, setQuery] = useState('');
  const [homeworkPendingIds, setHomeworkPendingIds] = useState<Set<string> | null>(null);
  const homeworkFilter = router.query.filter === 'homework_pending';

  useEffect(() => {
    if (membershipLoading) return;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: p } = await supabase
          .from('profiles').select('currency').eq('id', session.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }
      // Respect the owner's show_test_accounts_in_lists preference.
      let showTests = false;
      if (session) {
        const { data: me } = await supabase
          .from('profiles')
          .select('show_test_accounts_in_lists')
          .eq('id', session.user.id)
          .maybeSingle();
        showTests = !!me?.show_test_accounts_in_lists;
      }

      let q = supabase
        .from('students')
        .select('*')
        .eq('archived', showArchived)
        .order('name', { ascending: true });
      if (!showTests) q = q.eq('is_test_record', false);
      if (isTutor && membership?.tutor_id) {
        q = q.eq('primary_tutor_id', membership.tutor_id);
      } else if (isTutor && !membership?.tutor_id) {
        // Tutor with no tutor record yet — nothing to show.
        setStudents([]);
        setLoading(false);
        return;
      }
      const { data } = await q;
      setStudents(data ?? []);

      if (homeworkFilter && session) {
        let hwQ = supabase
          .from('sessions')
          .select('student_id')
          .not('homework_description', 'is', null)
          .is('homework_completed_at', null);
        if (isTutor) hwQ = hwQ.eq('tutor_user_id', session.user.id);
        const { data: hwRows } = await hwQ;
        const ids = new Set<string>((hwRows ?? []).map((r: any) => r.student_id).filter(Boolean));
        setHomeworkPendingIds(ids);
      } else {
        setHomeworkPendingIds(null);
      }
      setLoading(false);
    })();
  }, [showArchived, membership, membershipLoading, isTutor, homeworkFilter]);

  const homeworkFiltered = homeworkPendingIds
    ? students.filter((s) => homeworkPendingIds.has(s.id))
    : students;
  const filtered = query
    ? homeworkFiltered.filter((s) =>
        [s.name, s.school, s.parent_name, (s.subjects ?? []).join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : homeworkFiltered;

  return (
    <Layout
      subtitle={t('students:subtitle')}
      title={t('students:title_list')}
      actions={
        isTutor ? undefined : <Link href="/app/students/new" className="btn-primary">{t('students:actions.add')}</Link>
      }
    >
      {homeworkFilter && (
        <div className="mb-4 flex items-center justify-between gap-3 p-3 rounded bg-forest-soft border border-forest/20 text-sm">
          <span className="text-forest-ink">{t('students:filter_banner.homework_pending')}</span>
          <Link href="/app/students" className="text-xs text-forest underline">{t('students:filter_banner.clear_filter')}</Link>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
        <input
          type="search"
          placeholder={t('students:search_placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input md:max-w-sm"
        />
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <button
            onClick={() => setShowArchived(false)}
            className={
              (showArchived ? 'btn-ghost ' : 'btn-secondary ') +
              'text-xs px-3 py-1.5'
            }
          >
            {t('students:filters.active')}
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={
              (!showArchived ? 'btn-ghost ' : 'btn-secondary ') +
              'text-xs px-3 py-1.5'
            }
          >
            {t('students:filters.archived')}
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={[{ width: 'w-40' }, { width: 'w-16' }, { width: 'w-32' }, { width: 'w-32' }, { width: 'w-20' }]} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={showArchived ? <IconArchive /> : <IconUsers />}
          title={showArchived ? t('students:empty.no_archived') : (isTutor ? t('students:empty.no_tutor_record') : t('students:empty.no_students'))}
          description={
            showArchived
              ? t('students:empty.show_archived')
              : (isTutor
                  ? t('students:empty.description_tutor')
                  : t('students:empty.description_owner'))
          }
          action={!showArchived && !isTutor ? <Link href="/app/students/new" className="btn-primary">{t('students:empty.add_first')}</Link> : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('students:columns.name')}</th>
                <th>{t('students:columns.year')}</th>
                <th>{t('students:columns.subjects')}</th>
                {!isTutor && <th>{t('students:columns.parent')}</th>}
                {!isTutor && <th className="text-right">{t('students:columns.rate')}</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="row-link"
                  onClick={() => window.location.assign(`/app/students/${s.id}`)}
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-forest-soft text-forest-ink grid place-items-center text-2xs font-mono font-medium">
                        {initials(s.name)}
                      </div>
                      <div>
                        <div className="text-ink font-medium">
                          {s.name}
                          {(s as any).is_test_record && (
                            <span className="ml-2 badge-neutral text-2xs">{t('students:test_pill')}</span>
                          )}
                        </div>
                        {s.school && <div className="text-2xs text-ink-soft">{s.school}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="text-ink-muted">{s.year_level ?? '—'}</td>
                  <td className="text-ink-muted">
                    {s.subjects && s.subjects.length > 0 ? s.subjects.join(', ') : '—'}
                  </td>
                  {!isTutor && <td className="text-ink-muted">{s.parent_name ?? '—'}</td>}
                  {!isTutor && (
                    <td className="text-right font-mono text-sm num">
                      {formatCents(s.hourly_rate_cents, currency)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}

export default function StudentsPage() {
  return (
    <AuthGuard>
      <StudentsInner />
    </AuthGuard>
  );
}
