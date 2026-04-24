import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { supabase } from '../../../lib/supabase';
import { Tutor } from '../../../lib/types';
import { initials, startOfMonth } from '../../../lib/utils';
import { useLocaleFormatters } from '../../../lib/useLocaleFormatters';

type TutorWithExtras = Tutor & {
  assigned_student_count: number;
  month_payout_cents: number;
};

function TutorsInner() {
  const { t } = useTranslation('tutors');
  const { formatMoney } = useLocaleFormatters();
  const [loading, setLoading] = useState(true);
  const [tutors, setTutors] = useState<TutorWithExtras[]>([]);
  const [currency, setCurrency] = useState('AUD');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      let showTests = false;
      if (session) {
        const { data: p } = await supabase
          .from('profiles').select('currency, show_test_accounts_in_lists').eq('id', session.user.id).single();
        if (p?.currency) setCurrency(p.currency);
        showTests = !!(p as any)?.show_test_accounts_in_lists;
      }
      const { data: tutorRows } = await supabase
        .from('tutors').select('*').eq('archived', false).order('name');
      let baseTutors: Tutor[] = tutorRows ?? [];
      if (!showTests) {
        const { data: testProfiles } = await supabase
          .from('profiles').select('id').eq('is_test_account', true);
        const testUserIds = new Set(((testProfiles ?? []) as any[]).map((p) => p.id));
        baseTutors = baseTutors.filter((t: any) => !t.auth_user_id || !testUserIds.has(t.auth_user_id));
      }

      const { data: studentsForCount } = await supabase
        .from('students')
        .select('id, primary_tutor_id')
        .not('primary_tutor_id', 'is', null);
      const studentCount = new Map<string, number>();
      for (const s of studentsForCount ?? []) {
        const id = (s as any).primary_tutor_id as string;
        studentCount.set(id, (studentCount.get(id) ?? 0) + 1);
      }

      const monthStart = startOfMonth(new Date()).toISOString();
      const { data: monthSessions } = await supabase
        .from('sessions')
        .select('tutor_user_id, duration_minutes, pay_rate_cents, status')
        .eq('status', 'completed')
        .not('pay_rate_cents', 'is', null)
        .gte('scheduled_at', monthStart);
      const payoutByUserId = new Map<string, number>();
      for (const s of (monthSessions ?? []) as any[]) {
        if (!s.tutor_user_id || !s.pay_rate_cents) continue;
        const payout = Math.round((s.duration_minutes * s.pay_rate_cents) / 60);
        payoutByUserId.set(s.tutor_user_id, (payoutByUserId.get(s.tutor_user_id) ?? 0) + payout);
      }

      setTutors(baseTutors.map((tu) => ({
        ...tu,
        assigned_student_count: studentCount.get(tu.id) ?? 0,
        month_payout_cents: tu.auth_user_id ? (payoutByUserId.get(tu.auth_user_id) ?? 0) : 0,
      })));
      setLoading(false);
    })();
  }, []);

  const formatAmount = (cents: number | null | undefined, showZero = false) =>
    formatMoney(cents, currency, { showZero, maximumFractionDigits: 0 });

  return (
    <Layout
      subtitle={t('page.subtitle')}
      title={t('page.title')}
      actions={<Link href="/app/tutors/new" className="btn-primary">{t('actions.add')}</Link>}
    >
      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">{t('common.loading')}</div>
      ) : tutors.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          description={t('empty.description')}
          action={<Link href="/app/tutors/new" className="btn-primary">{t('actions.add_one')}</Link>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('table.name')}</th>
                <th>{t('table.subjects')}</th>
                <th>{t('table.linked_login')}</th>
                <th className="text-right">{t('table.students')}</th>
                <th className="text-right">{t('table.pay_rate')}</th>
                <th className="text-right">{t('table.this_month')}</th>
              </tr>
            </thead>
            <tbody>
              {tutors.map((tu) => (
                <tr key={tu.id} className="row-link"
                  onClick={() => window.location.assign(`/app/tutors/${tu.id}`)}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-forest text-cream grid place-items-center text-2xs font-mono font-medium">
                        {initials(tu.name)}
                      </div>
                      <div className="text-ink font-medium">{tu.name}</div>
                    </div>
                  </td>
                  <td className="text-ink-muted">
                    {tu.subjects && tu.subjects.length > 0 ? tu.subjects.join(', ') : t('table.em_dash')}
                  </td>
                  <td>
                    {tu.auth_user_id
                      ? <span className="text-2xs uppercase tracking-widest text-forest">{t('table.linked_yes')}</span>
                      : <span className="text-2xs uppercase tracking-widest text-ink-soft">{t('table.linked_no')}</span>}
                  </td>
                  <td className="text-right font-mono num text-sm text-ink-muted">
                    {tu.assigned_student_count}
                  </td>
                  <td className="text-right font-mono num text-sm">
                    {formatAmount(tu.pay_rate_cents)}
                  </td>
                  <td className="text-right font-mono num text-sm">
                    {tu.auth_user_id ? formatAmount(tu.month_payout_cents, true) : t('table.em_dash')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}

export default function TutorsPage() {
  return (
    <AuthGuard>
      <OwnerOnly>
        <TutorsInner />
      </OwnerOnly>
    </AuthGuard>
  );
}
