import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { authFetch } from '../../lib/authFetch';
import { supabase } from '../../lib/supabase';

// QuickCreate — a single 480-px modal that handles "create anything" from one
// shortcut.  Opens via:
//   * ⌘N anywhere
//   * "+" button in the top bar
//   * Cmd+K with a "/n*" prefix
//   * window dispatchEvent(new CustomEvent('crestio:open-quick-create'))
//
// The modal has a type selector (Student · Session · Household · Parent ·
// Invoice · Lesson plan · File · Template · Message thread) and renders a
// type-specific minimal form.  Cmd+Enter creates and closes; ESC cancels.
//
// Each create call is just a thin wrapper around the existing CRUD
// endpoints — it doesn't introduce a new "quick-create" API.

type CreateType =
  | 'student'
  | 'session'
  | 'household'
  | 'parent'
  | 'invoice'
  | 'lesson_plan'
  | 'file'
  | 'template'
  | 'message_thread';

type TypeMeta = {
  type: CreateType;
  label: string;
  hint: string;
  shortcut: string;
};

const TYPES: TypeMeta[] = [
  { type: 'student',         label: 'Student',         hint: 'Add a new student',                shortcut: '/nstu' },
  { type: 'session',         label: 'Session',         hint: 'Schedule or log a session',        shortcut: '/ns' },
  { type: 'household',       label: 'Household',       hint: 'Group parents + students',         shortcut: '/nh' },
  { type: 'parent',          label: 'Parent',          hint: 'Add a parent contact',             shortcut: '/np' },
  { type: 'invoice',         label: 'Invoice',         hint: 'Bill a household for sessions',    shortcut: '/ni' },
  { type: 'lesson_plan',     label: 'Lesson plan',     hint: 'Plan a single session',            shortcut: '/nlp' },
  { type: 'file',            label: 'File',            hint: 'Upload a file',                    shortcut: '/nf' },
  { type: 'template',        label: 'Template',        hint: 'Recurring session template',       shortcut: '/nt' },
  { type: 'message_thread',  label: 'Message thread',  hint: 'Start a conversation with a parent', shortcut: '/nm' },
];

export function QuickCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CreateType>('student');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Type-agnostic form state.  We use one big bag of strings — fine for a
  // create-once modal.
  const [name, setName] = useState('');
  const [secondary, setSecondary] = useState('');
  const [tertiary, setTertiary] = useState('');

  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // Listen for the open event + ⌘N globally.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as { type?: CreateType } | undefined;
      if (detail?.type) setType(detail.type);
      setOpen(true);
    }
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inInput = !!target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !e.shiftKey && !inInput) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('crestio:open-quick-create', onOpen as EventListener);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('crestio:open-quick-create', onOpen as EventListener);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Reset on close.
  useEffect(() => {
    if (open) {
      setName(''); setSecondary(''); setTertiary(''); setError(null);
      setTimeout(() => firstFieldRef.current?.focus(), 60);
    }
  }, [open, type]);

  const placeholders = useMemo(() => {
    switch (type) {
      case 'student':         return { primary: 'Student name (e.g. Diego Hernandez)', secondary: 'Subject (optional)', tertiary: 'Parent email (optional)' };
      case 'session':         return { primary: 'Type "schedule …" or pick a student', secondary: 'When (e.g. tomorrow 4pm)', tertiary: '' };
      case 'household':       return { primary: 'Household display name (e.g. The Hartleys)', secondary: 'Address (optional)', tertiary: '' };
      case 'parent':          return { primary: 'Parent name', secondary: 'Email', tertiary: 'Phone (optional)' };
      case 'invoice':         return { primary: 'Pick a household to open the invoice composer', secondary: '', tertiary: '' };
      case 'lesson_plan':     return { primary: 'Topic (e.g. HSC essay structure)', secondary: 'Subject', tertiary: 'Duration mins' };
      case 'file':            return { primary: 'Click to choose a file…', secondary: '', tertiary: '' };
      case 'template':        return { primary: 'Pick a student to open the template builder', secondary: '', tertiary: '' };
      case 'message_thread':  return { primary: 'Pick a parent to open the composer', secondary: '', tertiary: '' };
    }
  }, [type]);

  function close() { setOpen(false); }

  async function submit() {
    setError(null); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Not signed in.'); return; }
      const orgRow = await supabase.from('organization_members')
        .select('organization_id').eq('user_id', session.user.id).maybeSingle();
      const orgId = orgRow.data?.organization_id;

      if (type === 'student') {
        if (!name.trim()) { setError('Name is required.'); return; }
        const { data, error: insErr } = await supabase
          .from('students')
          .insert({
            organization_id: orgId,
            owner_id: session.user.id,
            name: name.trim(),
            subjects: secondary.trim() ? [secondary.trim()] : [],
            parent_email: tertiary.trim() || null,
          })
          .select('id')
          .single();
        if (insErr) { setError(insErr.message); return; }
        close();
        router.push(`/app/students/${data.id}`);
        return;
      }

      if (type === 'household') {
        if (!name.trim()) { setError('Display name required.'); return; }
        const { data, error: insErr } = await supabase
          .from('households')
          .insert({
            organization_id: orgId,
            display_name: name.trim(),
            notes: secondary.trim() || null,
          })
          .select('id')
          .single();
        if (insErr) { setError(insErr.message); return; }
        close();
        router.push(`/app/households`);
        return;
      }

      if (type === 'parent') {
        if (!name.trim() || !secondary.trim()) { setError('Name and email required.'); return; }
        // Parents are created by inviting them — defer to /api/parents/invite.
        // The invite flow needs a student_id; we open the parent management
        // page where the user can pick.
        close();
        router.push(`/app/parents`);
        return;
      }

      if (type === 'session') {
        // Re-use the inline composer for sessions.
        close();
        window.dispatchEvent(new CustomEvent('crestio:open-inline-composer'));
        if (name.trim() || secondary.trim()) {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('crestio:seed-inline-composer', {
              detail: `${name} ${secondary}`.trim(),
            }));
          }, 80);
        }
        return;
      }

      if (type === 'invoice') {
        close();
        router.push('/app/invoices/new');
        return;
      }

      if (type === 'lesson_plan') {
        if (!name.trim() || !secondary.trim()) { setError('Topic + subject required.'); return; }
        const { data, error: insErr } = await supabase
          .from('lesson_plans')
          .insert({
            organization_id: orgId,
            owner_id: session.user.id,
            topic: name.trim(),
            subject: secondary.trim(),
            duration_minutes: parseInt(tertiary, 10) || 60,
            content: '',
          })
          .select('id')
          .single();
        if (insErr) { setError(insErr.message); return; }
        close();
        router.push('/app/lesson-plans');
        return;
      }

      if (type === 'file')           { close(); router.push('/app/files?upload=1'); return; }
      if (type === 'template')       { close(); router.push('/app/templates'); return; }
      if (type === 'message_thread') { close(); router.push('/app/messages'); return; }

    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void submit(); }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick create"
      className="fixed inset-0 z-[80] bg-ink/40 flex items-start justify-center pt-24 animate-fade-in"
      onClick={close}
      onKeyDown={onKeyDown}
    >
      <div
        className="w-full max-w-[480px] bg-surface border border-rule rounded-[12px] shadow-lift overflow-hidden mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-rule flex items-center justify-between">
          <div className="text-2xs uppercase tracking-widest text-ink-muted">Quick create</div>
          <kbd className="text-2xs font-mono text-ink-soft border border-rule rounded px-1.5 py-0.5">Esc</kbd>
        </header>

        {/* Primary input */}
        <div className="p-4 space-y-3">
          <input
            ref={firstFieldRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholders.primary}
            className="w-full text-base text-ink bg-transparent outline-none border-b border-rule pb-2 focus:border-forest"
          />

          {placeholders.secondary && (
            <input
              type="text"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              placeholder={placeholders.secondary}
              className="w-full text-sm text-ink bg-transparent outline-none border-b border-ruleSoft pb-1.5 focus:border-forest"
            />
          )}

          {placeholders.tertiary && (
            <input
              type="text"
              value={tertiary}
              onChange={(e) => setTertiary(e.target.value)}
              placeholder={placeholders.tertiary}
              className="w-full text-sm text-ink bg-transparent outline-none border-b border-ruleSoft pb-1.5 focus:border-forest"
            />
          )}

          {error && <div className="text-sm text-claret">{error}</div>}
        </div>

        {/* Type selector */}
        <div className="px-2 pb-2">
          <div className="text-2xs uppercase tracking-widest text-ink-soft px-2 pt-1 pb-1">Create…</div>
          <ul role="listbox" className="grid grid-cols-3 gap-1">
            {TYPES.map((t) => (
              <li key={t.type}>
                <button
                  type="button"
                  onClick={() => setType(t.type)}
                  aria-selected={type === t.type}
                  className={[
                    'w-full text-left px-2 py-1.5 rounded text-sm transition-colors duration-100',
                    type === t.type ? 'bg-forest text-cream' : 'hover:bg-ruleSoft text-ink',
                  ].join(' ')}
                >
                  <div className="font-medium truncate">{t.label}</div>
                  <div className={['text-[10px] truncate', type === t.type ? 'text-cream/80' : 'text-ink-muted'].join(' ')}>
                    {t.shortcut}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className="px-4 py-3 border-t border-rule flex items-center justify-between gap-2">
          <span className="text-2xs text-ink-soft">
            <kbd className="font-mono border border-rule rounded px-1">⌘↵</kbd> create ·{' '}
            <kbd className="font-mono border border-rule rounded px-1">Esc</kbd> close
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={close} className="btn-ghost text-sm" style={{ height: 32 }}>Cancel</button>
            <button type="button" onClick={submit} disabled={busy} className="btn-primary text-sm" style={{ height: 32 }}>
              {busy ? 'Creating…' : `Create ${TYPES.find((t) => t.type === type)?.label.toLowerCase()}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default QuickCreate;
