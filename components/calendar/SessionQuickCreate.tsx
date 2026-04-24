import { useEffect, useState, FormEvent } from 'react';
import { Modal } from '../design/Modal';
import { supabase } from '../../lib/supabase';

type StudentOption = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  students: StudentOption[];
  initialStart: Date | null;       // pre-filled from slot click
  defaultStudentId?: string;
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SessionQuickCreate({
  open, onClose, onCreated, students, initialStart, defaultStudentId,
}: Props) {
  const [studentId, setStudentId] = useState(defaultStudentId ?? students[0]?.id ?? '');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('16:00');
  const [duration, setDuration] = useState(60);
  const [isRecurring, setIsRecurring] = useState(false);
  const [rule, setRule] = useState<'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [effectiveUntil, setEffectiveUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialStart) return;
    const d = initialStart;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setDate(`${y}-${m}-${day}`);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    setStartTime(`${hh}:${mm}`);
  }, [initialStart]);

  useEffect(() => {
    if (defaultStudentId) setStudentId(defaultStudentId);
    else if (students[0]?.id && !studentId) setStudentId(students[0].id);
  }, [defaultStudentId, students, studentId]);

  const recurringPreview = (() => {
    if (!isRecurring || !date) return null;
    const from = new Date(date);
    const until = effectiveUntil ? new Date(effectiveUntil) : new Date(from.getTime() + 90 * 86_400_000);
    const step = rule === 'weekly' ? 7 : rule === 'fortnightly' ? 14 : 28;
    let count = 0;
    for (let t = from.getTime(); t <= until.getTime(); t += step * 86_400_000) count++;
    return `This will create ${count} session${count === 1 ? '' : 's'} from ${from.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} to ${until.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}.`;
  })();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentId) { setError('Pick a student.'); return; }
    if (!date || !startTime) { setError('Pick a date and time.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Not signed in.'); return; }

      // Build ISO UTC from local date + time.
      const [y, mo, d] = date.split('-').map(Number);
      const [hh, mm] = startTime.split(':').map(Number);
      const localDate = new Date(y, mo - 1, d, hh, mm, 0);

      const body: any = {
        student_id: studentId,
        subject: subject || null,
        scheduled_at: localDate.toISOString(),
        duration_minutes: duration,
      };
      if (isRecurring) {
        body.recurring = {
          recurrence_rule: rule,
          day_of_week: localDate.getDay(),
          start_time_local: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney',
          effective_from: date,
          effective_until: effectiveUntil || null,
        };
      }

      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(payload?.error ?? 'Could not create session.'); return; }
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New session" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Student</label>
          <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select a student</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label">Start time</label>
            <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Duration (mins)</label>
            <input type="number" className="input" min={15} max={480} step={15}
              value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Subject (optional)</label>
            <input type="text" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="h-4 w-4 accent-forest" />
          <span>Make this recurring</span>
        </label>

        {isRecurring && (
          <div className="space-y-3 pl-6 border-l-2 border-forest-soft">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Repeats</label>
                <select className="input" value={rule} onChange={(e) => setRule(e.target.value as any)}>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Every 4 weeks</option>
                </select>
              </div>
              <div>
                <label className="label">End date (optional)</label>
                <input type="date" className="input" value={effectiveUntil}
                  onChange={(e) => setEffectiveUntil(e.target.value)} />
              </div>
            </div>
            {date && (
              <div className="text-2xs text-ink-muted">
                Repeats every {DAY_LABELS[new Date(date + 'T00:00:00').getDay()]}.
              </div>
            )}
            {recurringPreview && (
              <div className="text-xs text-forest-ink bg-forest-soft/40 border border-forest/20 rounded px-3 py-2">
                {recurringPreview}
              </div>
            )}
          </div>
        )}

        {error && <div className="text-sm text-claret">{error}</div>}

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {busy ? 'Creating…' : 'Create session'}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default SessionQuickCreate;
