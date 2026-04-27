import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { parseSession, type ParsedSlots } from '../../lib/useNlpParse';
import { useToast } from './Toast';
import { useUndo } from '../../lib/useUndo';

// Press N anywhere (when not in an input) to slide this composer down from
// the top of the viewport. Smart entry point that parses natural language
// into student/subject/time/duration chips. Cmd+Enter saves.
//
// Listens to:
//   crestio:open-inline-composer (custom event)
//   "n" key (global)

const STUDENT_CACHE_KEY = 'crestio.inline.students.v1';
const STUDENT_CACHE_TTL = 30 * 60_000; // 30 minutes

type Student = { id: string; name: string };

export function InlineComposer() {
  const router = useRouter();
  const toast = useToast();
  const undo = useUndo();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [chosenStudentId, setChosenStudentId] = useState<string | null>(null);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [busy, setBusy] = useState(false);

  // Open via custom event or N key.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'n' && e.key !== 'N') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable
        || target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT')) {
        return;
      }
      e.preventDefault();
      setOpen(true);
    }
    function onOpen() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('crestio:open-inline-composer', onOpen as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('crestio:open-inline-composer', onOpen as EventListener);
    };
  }, []);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text, chosenStudentId]);

  // Focus on open + load students.
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 60);
    loadStudents();
  }, [open]);

  // Reset on close + on route change.
  useEffect(() => {
    const onRoute = () => close();
    router.events.on('routeChangeStart', onRoute);
    return () => router.events.off('routeChangeStart', onRoute);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStudents() {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.sessionStorage.getItem(STUDENT_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { ts: number; rows: Student[] };
          if (Date.now() - parsed.ts < STUDENT_CACHE_TTL) {
            setStudents(parsed.rows);
            return;
          }
        }
      } catch { /* */ }
    }
    const { data } = await supabase.from('students').select('id, name').eq('archived', false).order('name');
    const rows = (data ?? []) as Student[];
    setStudents(rows);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(STUDENT_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows }));
      } catch { /* */ }
    }
  }

  function close() {
    setOpen(false);
    setText('');
    setChosenStudentId(null);
    setStudentPickerOpen(false);
  }

  const parsed: ParsedSlots = useMemo(
    () => parseSession(text, students.map((s) => s.name)),
    [text, students],
  );

  // Resolve chosen student. Either user clicked a chip, or NLP matched a
  // known name.
  const matchedStudent = useMemo(() => {
    if (chosenStudentId) return students.find((s) => s.id === chosenStudentId) ?? null;
    if (parsed.studentName) {
      return students.find((s) => s.name.toLowerCase() === parsed.studentName!.toLowerCase()) ?? null;
    }
    return null;
  }, [parsed.studentName, chosenStudentId, students]);

  const canSave = !!matchedStudent && !!parsed.when;

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.show({ message: 'Not signed in.', tone: 'error' });
        return;
      }
      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          student_id: matchedStudent!.id,
          subject: parsed.subject,
          scheduled_at: parsed.when!.toISOString(),
          duration_minutes: parsed.durationMinutes ?? 60,
        }),
      });
      const payload = await res.json().catch(() => ({} as any));
      if (!res.ok || !payload?.session_id) {
        toast.show({ message: payload?.error ?? 'Could not schedule.', tone: 'error' });
        return;
      }
      // Optimistic close + undo toast.
      const sid = payload.session_id as string;
      close();
      undo.queue({
        id: `inline-create-${sid}`,
        label: `Session scheduled for ${parsed.when!.toLocaleString(undefined, {
          weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
        })}.`,
        holdMs: 5000,
        commit: async () => null,
        inverseCommit: async () => {
          const { data: { session: s2 } } = await supabase.auth.getSession();
          if (!s2?.access_token) return;
          await fetch(`/api/sessions/${sid}/cancel`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${s2.access_token}` },
          });
          window.dispatchEvent(new Event('crestio:sessions-refresh'));
        },
      });
      window.dispatchEvent(new Event('crestio:sessions-refresh'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const whenLabel = parsed.when
    ? parsed.when.toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
      })
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick log session"
      className="fixed inset-0 z-[75] bg-ink/30 animate-fade-in"
      onClick={close}
    >
      <div
        className="mx-auto mt-6 md:mt-12 w-full max-w-[600px] bg-surface border border-rule rounded-xl shadow-lift overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Try: 'Diego — math — 4pm Tuesday — 1h'"
          rows={1}
          className="w-full resize-none px-5 py-4 text-[15px] text-ink placeholder:text-ink-soft outline-none bg-transparent"
          style={{ minHeight: 56 }}
        />

        {/* Chips row */}
        <div className="px-5 pb-3 flex items-center flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStudentPickerOpen((v) => !v)}
            className={[
              'text-2xs uppercase tracking-widest px-2 py-1 rounded-full border transition-colors duration-100',
              matchedStudent
                ? 'bg-forest-soft text-forest-ink border-forest/20'
                : 'bg-ruleSoft text-ink-muted border-rule hover:bg-ruleSoft/80',
            ].join(' ')}
          >
            {matchedStudent ? matchedStudent.name : 'Pick a student'}
          </button>
          {whenLabel && (
            <span className="text-2xs uppercase tracking-widest px-2 py-1 rounded-full bg-forest-soft text-forest-ink border border-forest/20">
              {whenLabel}
            </span>
          )}
          {parsed.durationMinutes && (
            <span className="text-2xs uppercase tracking-widest px-2 py-1 rounded-full bg-forest-soft text-forest-ink border border-forest/20">
              {parsed.durationMinutes}m
            </span>
          )}
          {parsed.subject && (
            <span className="text-2xs uppercase tracking-widest px-2 py-1 rounded-full bg-ruleSoft text-ink border border-rule">
              {parsed.subject}
            </span>
          )}

          <div className="flex-1" />
          <span className="text-2xs text-ink-soft hidden md:inline">
            <kbd className="font-mono border border-rule rounded px-1">⌘↵</kbd> save · <kbd className="font-mono border border-rule rounded px-1">⎋</kbd> cancel
          </span>
        </div>

        {/* Student picker dropdown */}
        {studentPickerOpen && (
          <div className="border-t border-rule max-h-60 overflow-y-auto">
            {students.length === 0 ? (
              <div className="p-3 text-xs text-ink-muted">No students yet.</div>
            ) : (
              students.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => {
                    setChosenStudentId(s.id);
                    setStudentPickerOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left px-5 py-2 text-sm text-ink hover:bg-ruleSoft/60"
                >
                  {s.name}
                </button>
              ))
            )}
          </div>
        )}

        {/* Footer action */}
        <div className="border-t border-rule px-5 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">
            {!matchedStudent
              ? 'Pick a student to continue.'
              : !parsed.when
              ? 'Add a time — try "tomorrow 3pm".'
              : 'Looks good.'}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!canSave || busy}
            className="btn-primary text-xs"
            style={{ height: 32, minHeight: 32 }}
          >
            {busy ? 'Saving…' : 'Schedule'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-down { animation: slide-down 200ms ease-out both; }
      `}</style>
    </div>
  );
}

export default InlineComposer;
