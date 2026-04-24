import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { supabase } from '../../../lib/supabase';
import { Tutor } from '../../../lib/types';
import { formatCents, initials, startOfMonth } from '../../../lib/utils';

type TutorWithExtras = Tutor & {
  assigned_student_count: number;
  month_payout_cents: number;
};

function TutorsInner() {
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

      // Student counts per tutor.
      const { data: studentsForCount } = await supabase
        .from('students')
        .select('id, primary_tutor_id')
        .not('primary_tutor_id', 'is', null);
      const studentCount = new Map<string, number>();
      for (const s of studentsForCount ?? []) {
        const id = (s as any).primary_tutor_id as string;
        studentCount.set(id, (studentCount.get(id) ?? 0) + 1);
      }

      // This month's payouts per tutor (by tutor_user_id = auth_user_id).
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

      setTutors(baseTutors.map((t) => ({
        ...t,
        assigned_student_count: studentCount.get(t.id) ?? 0,
        month_payout_cents: t.auth_user_id ? (payoutByUserId.get(t.auth_user_id) ?? 0) : 0,
      })));
      setLoading(false);
    })();
  }, []);

  return (
    <Layout
      subtitle="Team"
      title="Tutors"
      actions={<Link href="/app/tutors/new" className="btn-primary">Add tutor</Link>}
    >
      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">Loading…</div>
      ) : tutors.length === 0 ? (
        <EmptyState
          title="No tutors yet"
          description="Add tutors when you bring people on to teach for your business. If you're a solo tutor, you can skip this."
          action={<Link href="/app/tutors/new" className="btn-primary">Add a tutor</Link>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Subjects</th>
                <th>Linked login</th>
                <th className="text-right">Students</th>
                <th className="text-right">Pay rate</th>
                <th className="text-right">This month</th>
              </tr>
            </thead>
            <tbody>
              {tutors.map((t) => (
                <tr key={t.id} className="row-link"
                  onClick={() => window.location.assign(`/app/tutors/${t.id}`)}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-forest text-cream grid place-items-center text-2xs font-mono font-medium">
                        {initials(t.name)}
                      </div>
                      <div className="text-ink font-medium">{t.name}</div>
                    </div>
                  </td>
                  <td className="text-ink-muted">
                    {t.subjects && t.subjects.length > 0 ? t.subjects.join(', ') : '—'}
                  </td>
                  <td>
                    {t.auth_user_id
                      ? <span className="text-2xs uppercase tracking-widest text-forest">Yes</span>
                      : <span className="text-2xs uppercase tracking-widest text-ink-soft">No</span>}
                  </td>
                  <td className="text-right font-mono num text-sm text-ink-muted">
                    {t.assigned_student_count}
                  </td>
                  <td className="text-right font-mono num text-sm">
                    {formatCents(t.pay_rate_cents, currency)}
                  </td>
                  <td className="text-right font-mono num text-sm">
                    {t.auth_user_id ? formatCents(t.month_payout_cents, currency, { showZero: true }) : '—'}
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
