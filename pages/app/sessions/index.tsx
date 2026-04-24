import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { Session, Student, Tutor } from '../../../lib/types';
import { listDrafts, clearDraft, DraftIndexEntry } from '../../../lib/sessionDrafts';
import {
  formatCents,
  formatDateTime,
  sessionAmount,
  cx,
} from '../../../lib/utils';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

type Filter = 'upcoming' | 'past' | 'unpaid' | 'all';

function SessionsInner() {
  const { t } = useTranslation(['sessions', 'common']);
  const router = useRouter();
  const { membership, loading: membershipLoading } = useMembership();
  const isTutor = membership?.role === 'tutor';
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [sessions, setSessions] = useState<(Session & { student: Student | null; tutor: Tutor | null })[]>([]);
  const [currency, setCurrency] = useState('AUD');
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftIndexEntry[]>([]);

  function refreshDrafts(uid: string) {
    setDrafts(listDrafts(uid));
  }

  function resumeDraft(entry: DraftIndexEntry) {
    if (entry.type === 'new') {
      router.push('/app/sessions/new?resume=true');
    } else {
      const sessionId = entry.key.replace(/^crestio-draft-session-/, '');
      router.push(`/app/sessions/${sessionId}?resume=true`);
    }
  }

  function discardDraft(entry: DraftIndexEntry) {
    if (!userId) return;
    if (!window.confirm('Delete this draft?')) return;
    clearDraft(entry.key, userId);
    refreshDrafts(userId);
  }

  useEffect(() => {
    if (membershipLoading) return;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUserId(session.user.id);
        refreshDrafts(session.user.id);
        const { data: p } = await supabase
          .from('profiles').select('currency').eq('id', session.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }

      const now = new Date().toISOString();
      let q = supabase
        .from('sessions')
        .select('*, student:students(id,name), tutor:tutors(id,name)')
        .order('scheduled_at', { ascending: filter === 'upcoming' });

      if (filter === 'upcoming') q = q.gte('scheduled_at', now).eq('status', 'scheduled');
      else if (filter === 'past') q = q.lt('scheduled_at', now);
      else if (filter === 'unpaid') q = q.eq('status', 'completed').eq('paid', false);

      if (isTutor && session) {
        q = q.eq('tutor_user_id', session.user.id);
      }

      const { data } = await q.limit(200);
      setSessions((data ?? []) as any);
      setLoading(false);
    })();
  }, [filter, membership, membershipLoading, isTutor]);

  return (
    <Layout
      subtitle={t('sessions:subtitle')}
      title={t('sessions:title_list')}
      actions={<Link href="/app/sessions/new" className="btn-primary">{t('sessions:actions.new')}</Link>}
    >
      {drafts.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-display text-xl tracking-tightest">Drafts</h2>
            <span className="text-2xs uppercase tracking-widest text-ink-muted bg-ruleSoft rounded-full px-2 py-0.5">
              {drafts.length}
            </span>
          </div>
          <div className="card divide-y divide-ruleSoft">
            {drafts.map((d) => (
              <div key={d.key} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-ink truncate text-sm">{d.label}</div>
                  <div className="text-2xs text-ink-soft">Last edited {relativeTime(d.lastEditedAt)}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => resumeDraft(d)} className="btn-secondary text-xs">
                    Resume
                  </button>
                  <button type="button" onClick={() => discardDraft(d)} className="btn-ghost text-xs text-claret">
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center gap-1 mb-6 text-xs">
        {(['upcoming', 'past', 'unpaid', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              'px-3 py-1.5 capitalize transition-colors rounded',
              filter === f
                ? 'bg-ink text-cream'
                : 'text-ink-muted hover:text-ink hover:bg-ruleSoft'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">Loading…</div>
      ) : sessions.length === 0 ? (
        <EmptyState
          title={
            filter === 'upcoming' ? 'No upcoming sessions' :
            filter === 'unpaid' ? 'Nothing unpaid' :
            filter === 'past' ? 'No past sessions' :
            'No sessions yet'
          }
          description={filter === 'upcoming' ? 'Schedule one to fill your week.' : undefined}
          action={filter === 'upcoming' ? <Link href="/app/sessions/new" className="btn-primary">Schedule a session</Link> : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Student</th>
                <th>Subject · Topic</th>
                <th>Tutor</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="row-link"
                  onClick={() => window.location.assign(`/app/sessions/${s.id}`)}>
                  <td className="text-ink">{formatDateTime(s.scheduled_at)}</td>
                  <td className="text-ink font-medium">{s.student?.name ?? '—'}</td>
                  <td className="text-ink-muted">{[s.subject, s.topic].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="text-ink-muted">{s.tutor?.name ?? <span className="text-ink-soft">You</span>}</td>
                  <td>
                    <span className={cx(
                      s.status === 'completed' && (s.paid ? 'badge-forest' : 'badge-rust'),
                      s.status === 'cancelled' && 'badge-neutral',
                      s.status === 'no_show' && 'badge-claret',
                      s.status === 'scheduled' && 'badge-neutral'
                    )}>
                      {s.status === 'completed' ? (s.paid ? 'Paid' : 'Unpaid') : s.status}
                    </span>
                  </td>
                  <td className="text-right font-mono num text-sm">
                    {formatCents(sessionAmount(s), currency)}
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

export default function SessionsPage() {
  return <AuthGuard><SessionsInner /></AuthGuard>;
}
