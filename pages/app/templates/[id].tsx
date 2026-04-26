import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';

const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];
const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 120];

type Template = {
  id: string;
  subject: string | null;
  duration_minutes: number;
  recurrence_rule: 'weekly' | 'fortnightly' | 'monthly';
  day_of_week: number;
  start_time_local: string;
  effective_from: string;
  cancelled_at: string | null;
  notes_template: string | null;
  generated_through_date: string | null;
  student?: { id: string; name: string };
};

function EditTemplateInner() {
  const router = useRouter();
  const { id } = router.query;
  const templateId = typeof id === 'string' ? id : '';
  const [template, setTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  // Editable form state
  const [subject, setSubject] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('16:00');
  const [duration, setDuration] = useState(60);
  const [recurrence, setRecurrence] = useState<'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [notesTemplate, setNotesTemplate] = useState('');

  async function load() {
    if (!templateId) return;
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not signed in.'); return; }
    const res = await fetch(`/api/session-templates/${templateId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json?.error ?? 'Could not load template.'); return; }
    const t = json.template as Template;
    setTemplate(t);
    setSubject(t.subject ?? '');
    setDayOfWeek(t.day_of_week);
    setStartTime(t.start_time_local.slice(0, 5));
    setDuration(t.duration_minutes);
    setRecurrence(t.recurrence_rule);
    setNotesTemplate(t.notes_template ?? '');
  }

  useEffect(() => { load(); }, [templateId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not signed in.'); return; }
      const res = await fetch(`/api/session-templates/${templateId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          subject: subject || null,
          duration_minutes: duration,
          recurrence_rule: recurrence,
          day_of_week: dayOfWeek,
          start_time_local: startTime,
          notes_template: notesTemplate || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error ?? 'Could not save.'); return; }
      setInfo('Saved. Existing sessions keep their current time; new generations from now on use the updated schedule.');
      await load();
    } finally { setBusy(false); }
  }

  async function endTemplate(cancelFuture: boolean) {
    if (!window.confirm(`End this recurring schedule?${cancelFuture ? ' Future generated sessions will be cancelled.' : ''}`)) return;
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not signed in.'); return; }
      const res = await fetch(`/api/session-templates/${templateId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ cancel_future_sessions: cancelFuture }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error ?? 'Could not end.'); return; }
      router.push('/app/templates');
    } finally { setBusy(false); }
  }

  if (!template) {
    return (
      <Layout title="Edit template" subtitle="Recurring sessions">
        {error ? <div className="card p-4 text-sm text-claret max-w-2xl">{error}</div>
              : <div className="card p-6 text-sm text-ink-muted max-w-2xl">Loading…</div>}
      </Layout>
    );
  }

  return (
    <Layout
      title="Edit template"
      subtitle={`${template.student?.name ?? 'Student'} · recurring`}
      actions={<Link href="/app/templates" className="btn-ghost text-xs">Back</Link>}
    >
      <div className="max-w-2xl space-y-4">
        {error && <div className="card p-4 text-sm text-claret">{error}</div>}
        {info && <div className="card p-4 text-sm text-forest-ink bg-forest-soft">{info}</div>}

        <form onSubmit={onSave} className="card p-8 space-y-5">
          <div>
            <label className="label">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input"
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="label">Day</label>
              <select className="input" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
                {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Start time</label>
              <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="label">Duration</label>
              <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Recurrence</label>
            <div className="flex gap-2">
              {(['weekly', 'fortnightly', 'monthly'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecurrence(r)}
                  className={(recurrence === r ? 'btn-secondary ' : 'btn-ghost ') + 'text-xs px-3 py-1.5 capitalize'}
                >{r}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notes template</label>
            <textarea
              rows={3}
              className="input"
              value={notesTemplate}
              onChange={(e) => setNotesTemplate(e.target.value)}
              placeholder="Use {student_name}, {date}, {subject}"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <div className="text-2xs text-ink-soft">
              Existing sessions keep their current time. Edits apply to new generations.
            </div>
          </div>
        </form>

        {!template.cancelled_at && (
          <div className="card p-6">
            <h2 className="font-display text-lg tracking-tightest text-ink mb-2">End this template</h2>
            <p className="text-sm text-ink-muted mb-3">
              Ending stops future generation. Existing scheduled sessions can stay or be cancelled.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => endTemplate(false)} disabled={busy} className="btn-secondary text-xs">
                End (keep existing sessions)
              </button>
              <button onClick={() => endTemplate(true)} disabled={busy} className="btn-danger text-xs">
                End and cancel future sessions
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><EditTemplateInner /></AuthGuard>;
}
