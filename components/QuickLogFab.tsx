import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import VoiceRecorder from './voice/VoiceRecorder';

// Floating quick-log button + bottom sheet for the mobile dashboard.
// Lets a tutor log a completed session in 3 taps between clients.

const DRAFT_KEY = 'crestio.quicklog.draft';
const DRAFT_TTL_HOURS = 24;
const DURATION_CHOICES = [30, 45, 60, 75, 90];

type Student = { id: string; name: string; subjects: string[] | null };

type Draft = {
  studentId: string;
  duration: number;
  subject: string;
  notes: string;
  savedAt: number;
};

export function QuickLogFab({ visible = true }: { visible?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [duration, setDuration] = useState(60);
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; msg: string } | null>(null);

  // Load students on first open.
  useEffect(() => {
    if (!open || students.length > 0) return;
    (async () => {
      const { data } = await supabase
        .from('students')
        .select('id, name, subjects')
        .eq('archived', false)
        .order('name');
      setStudents((data ?? []) as any);
    })();
  }, [open, students.length]);

  // Restore draft on open.
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      if (Date.now() - draft.savedAt > DRAFT_TTL_HOURS * 3600_000) {
        localStorage.removeItem(DRAFT_KEY); return;
      }
      setStudentId(draft.studentId);
      setDuration(draft.duration);
      setSubject(draft.subject);
      setNotes(draft.notes);
    } catch { /* ignore */ }
  }, [open]);

  // Pre-fill subject from student's usual subject when student changes.
  useEffect(() => {
    if (!studentId) return;
    const s = students.find((x) => x.id === studentId);
    if (s?.subjects && s.subjects.length > 0 && !subject) {
      setSubject(s.subjects[0]);
    }
  }, [studentId, students, subject]);

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        studentId, duration, subject, notes, savedAt: Date.now(),
      } as Draft));
    } catch { /* ignore */ }
  }

  function close() {
    if (studentId || notes.trim() || subject.trim()) saveDraft();
    setOpen(false);
  }

  async function submit() {
    setError(null);
    if (!studentId) { setError('Pick a student.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Not signed in.'); return; }
      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          student_id: studentId,
          subject: subject || null,
          scheduled_at: new Date().toISOString(),
          duration_minutes: duration,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.session_id) {
        setError(payload?.error ?? 'Could not log session.');
        return;
      }

      // If notes were typed / dictated, save them to notes_internal via a follow-up update.
      if (notes.trim()) {
        await supabase.from('sessions').update({
          notes_internal: notes.trim(),
          status: 'completed',
        }).eq('id', payload.session_id);
      } else {
        await supabase.from('sessions').update({ status: 'completed' }).eq('id', payload.session_id);
      }

      localStorage.removeItem(DRAFT_KEY);
      setStudentId(''); setSubject(''); setNotes(''); setDuration(60);
      setOpen(false);
      setToast({ id: payload.session_id, msg: 'Session logged.' });
      setTimeout(() => setToast(null), 6000);
    } finally {
      setBusy(false);
    }
  }

  function openPolish() {
    if (!toast?.id) return;
    router.push(`/app/sessions/${toast.id}`);
    setToast(null);
  }

  if (!visible) return null;

  return (
    <>
      {/* FAB — above the mobile bottom tab bar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick-log a session"
        className="md:hidden fixed right-5 bottom-[88px] z-20 h-16 w-16 rounded-full bg-forest text-cream shadow-lift flex items-center justify-center hover:bg-forest-ink"
      >
        <div className="text-center leading-none">
          <div className="text-lg font-display">+</div>
          <div className="text-[9px] uppercase tracking-widest">Log</div>
        </div>
      </button>

      {/* Bottom sheet */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 animate-fade-in"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Quick log session"
        >
          <div
            className="absolute left-0 right-0 bottom-0 bg-surface rounded-t-xl shadow-lift pb-safe max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 w-10 bg-rule rounded-full mx-auto my-3" />
            <div className="px-5 pb-5 space-y-5">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Quick log</div>
                <h2 className="font-display text-2xl tracking-tightest">Log a session</h2>
              </div>

              <div>
                <label className="label">Student</label>
                <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">Select a student</option>
                  {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Duration</label>
                <div className="grid grid-cols-5 gap-2">
                  {DURATION_CHOICES.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDuration(mins)}
                      className={[
                        'min-h-[48px] rounded border text-sm',
                        duration === mins
                          ? 'bg-forest text-cream border-forest'
                          : 'bg-surface text-ink-muted border-rule hover:bg-ruleSoft',
                      ].join(' ')}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Subject</label>
                <input type="text" className="input" value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Year 11 Chemistry" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">Quick notes</label>
                  <VoiceRecorder
                    context="session_note"
                    size="sm"
                    label="Dictate"
                    onTranscript={(text) => setNotes((prev) => prev ? `${prev.trim()}\n\n${text}` : text)}
                  />
                </div>
                <textarea
                  rows={3}
                  className="input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional — you can add more later."
                />
              </div>

              {error && <div className="text-sm text-claret">{error}</div>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={submit} disabled={busy} className="btn-primary flex-1 min-h-[48px]">
                  {busy ? 'Logging…' : 'Log session'}
                </button>
                <button type="button" onClick={close} className="btn-ghost">
                  Save for later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast with polish-notes action */}
      {toast && (
        <div className="fixed left-4 right-4 bottom-[100px] md:hidden z-50 bg-forest text-cream rounded-lg shadow-lift p-4 flex items-center justify-between gap-3 animate-fade-in">
          <span className="text-sm">{toast.msg}</span>
          <button type="button" onClick={openPolish} className="text-xs underline underline-offset-2">
            Polish notes with AI →
          </button>
        </div>
      )}
    </>
  );
}

export default QuickLogFab;
