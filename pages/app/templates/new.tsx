import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';

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

type StudentOption = { id: string; name: string };

function NewTemplateInner() {
  const router = useRouter();
  const { membership } = useMembership();
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('16:00');
  const [duration, setDuration] = useState(60);
  const [recurrence, setRecurrence] = useState<'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [notesTemplate, setNotesTemplate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      let q = supabase
        .from('students')
        .select('id, name')
        .eq('archived', false)
        .order('name', { ascending: true })
        .limit(200);
      if (membership?.role === 'tutor' && membership.tutor_id) {
        q = q.eq('primary_tutor_id', membership.tutor_id);
      }
      const { data } = await q;
      setStudents((data ?? []) as StudentOption[]);
    })();
  }, [membership]);

  // Prefill from /sessions/[id] "Make recurring" link.
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (typeof q.student_id === 'string' && q.student_id) setStudentId(q.student_id);
    if (typeof q.subject === 'string' && q.subject) setSubject(q.subject);
    if (typeof q.duration === 'string') {
      const d = Number(q.duration);
      if (DURATION_OPTIONS.includes(d)) setDuration(d);
    }
    if (typeof q.scheduled_at === 'string' && q.scheduled_at) {
      const d = new Date(q.scheduled_at);
      if (!isNaN(d.getTime())) {
        setDayOfWeek(d.getDay());
        setStartTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    }
  }, [router.isReady, router.query]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentId) { setError('Select a student.'); return; }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not signed in.'); return; }
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch('/api/session-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          student_id: studentId,
          subject: subject || null,
          duration_minutes: duration,
          recurrence_rule: recurrence,
          day_of_week: dayOfWeek,
          start_time_local: startTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney',
          effective_from: today,
          notes_template: notesTemplate || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error ?? 'Could not create template.'); return; }
      router.push('/app/templates');
    } finally { setSubmitting(false); }
  }

  const filteredStudents = studentSearch
    ? students.filter((s) => s.name.toLowerCase().includes(studentSearch.toLowerCase()))
    : students;

  return (
    <Layout title="New recurring template" subtitle="Create once, generates 8 weeks of sessions automatically"
      actions={<Link href="/app/templates" className="btn-ghost text-xs">Cancel</Link>}
    >
      <form onSubmit={onSubmit} className="card p-8 space-y-5 max-w-2xl">
        <div>
          <label className="label">Student</label>
          <input
            type="text"
            placeholder="Search students…"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            className="input mb-2"
          />
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="input"
            size={Math.min(6, Math.max(2, filteredStudents.length))}
            required
          >
            {filteredStudents.length === 0 && <option value="" disabled>No students found</option>}
            {filteredStudents.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="input"
            placeholder="e.g. Mathematics"
          />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="label">Day</label>
            <select
              className="input"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
            >
              {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Start time</label>
            <input
              type="time"
              className="input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Duration</label>
            <select
              className="input"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
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
                className={
                  (recurrence === r ? 'btn-secondary ' : 'btn-ghost ') +
                  'text-xs px-3 py-1.5 capitalize'
                }
              >{r}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Notes template (optional)</label>
          <textarea
            rows={3}
            className="input"
            value={notesTemplate}
            onChange={(e) => setNotesTemplate(e.target.value)}
            placeholder="Pre-fill internal notes for each generated session. Use {student_name}, {date}, {subject} as placeholders."
          />
          <div className="text-2xs text-ink-soft mt-1">
            Placeholders: <code>{'{student_name}'}</code>, <code>{'{date}'}</code>, <code>{'{subject}'}</code>
          </div>
        </div>

        {error && <div className="text-sm text-claret">{error}</div>}

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={submitting || !studentId} className="btn-primary">
            {submitting ? 'Creating…' : 'Create and generate 8 weeks'}
          </button>
          <Link href="/app/templates" className="btn-ghost">Cancel</Link>
        </div>
      </form>
    </Layout>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export default function Page() {
  return <AuthGuard><NewTemplateInner /></AuthGuard>;
}
