import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../../components/AuthGuard';
import Layout from '../../../../components/Layout';
import { supabase } from '../../../../lib/supabase';

type Template = {
  id: string;
  subject: string | null;
  duration_minutes: number;
  recurrence_rule: 'weekly' | 'fortnightly' | 'monthly';
  day_of_week: number;
  start_time_local: string;
  effective_from: string;
  effective_until: string | null;
  cancelled_at: string | null;
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RULE_LABELS: Record<Template['recurrence_rule'], string> = {
  weekly: 'every week',
  fortnightly: 'every fortnight',
  monthly: 'every 4 weeks',
};

function ScheduleInner() {
  const router = useRouter();
  const { id } = router.query;
  const studentId = typeof id === 'string' ? id : '';
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!studentId) return;
    setLoading(true);
    const [stuRes, tplRes] = await Promise.all([
      supabase.from('students').select('id, name').eq('id', studentId).maybeSingle(),
      supabase.from('session_templates').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
    ]);
    setStudent(stuRes.data as any);
    setTemplates((tplRes.data ?? []) as Template[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [studentId]);

  async function endTemplate(t: Template, cancelFuture: boolean) {
    if (!window.confirm(`End this recurring schedule?${cancelFuture ? ' Future sessions from it will be cancelled.' : ''}`)) return;
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Not signed in.'); return; }
      const res = await fetch(`/api/session-templates/${t.id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ cancel_future_sessions: cancelFuture }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(payload?.error ?? 'Could not end the schedule.'); return; }
      await load();
    } finally { setBusy(false); }
  }

  return (
    <Layout subtitle={student?.name ?? 'Student'} title="Recurring schedule" actions={
      <Link href={`/app/students/${studentId}`} className="btn-ghost text-xs">Back to student</Link>
    }>
      <div className="max-w-2xl space-y-5">
        {error && <div className="card p-4 text-sm text-claret">{error}</div>}
        {loading ? (
          <div className="card p-6 text-sm text-ink-muted">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">No recurring schedule</div>
            <p className="text-sm text-ink-muted mb-4">
              {student?.name ?? 'This student'} doesn't have a recurring session set up. You can create one from the <Link href="/app/calendar" className="underline text-forest">Calendar</Link> by checking "Make this recurring".
            </p>
          </div>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">
                    {t.cancelled_at ? 'Ended' : 'Active'}
                  </div>
                  <h2 className="font-display text-xl tracking-tightest text-ink">
                    {DAY_LABELS[t.day_of_week]}s at {formatTime(t.start_time_local)}
                  </h2>
                  <div className="text-sm text-ink-muted mt-1">
                    {RULE_LABELS[t.recurrence_rule]} · {t.duration_minutes} min{t.subject ? ` · ${t.subject}` : ''}
                  </div>
                  <div className="text-2xs text-ink-soft mt-2">
                    Started {formatDate(t.effective_from)}{t.effective_until ? ` · ends ${formatDate(t.effective_until)}` : ''}
                  </div>
                </div>
                {!t.cancelled_at && (
                  <div className="flex flex-col gap-2">
                    <button type="button" onClick={() => endTemplate(t, true)} disabled={busy}
                      className="btn-danger text-xs">End &amp; cancel future</button>
                    <button type="button" onClick={() => endTemplate(t, false)} disabled={busy}
                      className="btn-secondary text-xs">End (keep existing)</button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}

function formatTime(hms: string): string {
  const [hh, mm] = hms.split(':');
  const h = Number(hh); const m = Number(mm);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
}
function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Page() {
  return <AuthGuard><ScheduleInner /></AuthGuard>;
}
