import { useEffect, useRef, useState, FormEvent } from 'react';
import { supabase } from '../lib/supabase';

type Category = 'question' | 'bug' | 'feature' | 'billing' | 'other';

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'question', label: 'Question' },
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
  { value: 'billing', label: 'Billing issue' },
  { value: 'other', label: 'Other' },
];

const ACCEPT_MIMES = 'image/*,video/*';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 3;

export function SupportWidget() {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'form' | 'sent'>('form');
  const [category, setCategory] = useState<Category>('question');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSignedIn(!!session);
      setUserEmail(session?.user.email ?? '');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => {
      setSignedIn(!!s);
      setUserEmail(s?.user.email ?? '');
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const handler = () => { if (signedIn) openWidget(); };
    window.addEventListener('crestio:open-support', handler as EventListener);
    return () => window.removeEventListener('crestio:open-support', handler as EventListener);
  }, [signedIn]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  function openWidget() {
    setPhase('form');
    setError(null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    if (successTimer.current) { clearTimeout(successTimer.current); successTimer.current = null; }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) break;
      if (f.size > MAX_FILE_BYTES) {
        setError(`${f.name} is larger than 10 MB.`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (message.trim().length < 20) {
      setError('Please write at least 20 characters so we can help.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Not signed in.'); setSubmitting(false); return; }

      // Upload each file to support-attachments/<user_id>/<uuid-ish>.<ext>
      const paths: string[] = [];
      for (const file of files) {
        const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().slice(0, 10);
        const key = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('support-attachments').upload(key, file, { contentType: file.type, upsert: false });
        if (uploadErr) {
          console.error('[support] upload failed', uploadErr);
          setError(`Could not upload ${file.name}.`);
          setSubmitting(false);
          return;
        }
        paths.push(key);
      }

      const res = await fetch('/api/support/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          category, subject: subject.trim(), message: message.trim(), attachment_paths: paths,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error ?? 'Could not send. Please try again.');
        return;
      }
      setPhase('sent');
      setCategory('question'); setSubject(''); setMessage(''); setFiles([]);
      successTimer.current = setTimeout(() => { setOpen(false); }, 5000);
    } finally {
      setSubmitting(false);
    }
  }

  if (!signedIn) return null;

  // Floating support-chat button removed in Session 13C hotfix — the modal is
  // opened exclusively via the account dropdown's "Help & support" item,
  // which dispatches `crestio:open-support` (handled in the effect above).
  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Contact support"
          className="fixed inset-0 z-40 bg-ink/40 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in"
          onClick={close}
        >
          <div
            className="relative bg-surface border border-rule rounded-t-lg md:rounded-lg shadow-lift w-full md:max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-rule flex items-start justify-between gap-4">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-soft mb-0.5">Support</div>
                <h2 className="font-display text-xl tracking-tightest text-ink">How can we help?</h2>
              </div>
              <button type="button" onClick={close} className="btn-ghost text-xs" aria-label="Close">×</button>
            </div>

            {phase === 'form' ? (
              <form onSubmit={onSubmit} className="p-5 space-y-4 overflow-y-auto">
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Subject</label>
                  <input type="text" className="input" value={subject} maxLength={200}
                    onChange={(e) => setSubject(e.target.value)} placeholder="One-line summary" required />
                </div>
                <div>
                  <label className="label">Message</label>
                  <textarea className="input" rows={5} minLength={20} value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what's happening. Include steps to reproduce if it's a bug." required />
                </div>
                <div>
                  <label className="label">Attachments (optional)</label>
                  <div
                    className="border border-dashed border-rule rounded p-4 text-center text-sm text-ink-muted cursor-pointer hover:bg-ruleSoft/50 transition-colors"
                    onClick={() => document.getElementById('support-files')?.click()}
                    onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    Drop images or videos, or click to upload. Max 3 files, 10 MB each.
                  </div>
                  <input id="support-files" type="file" accept={ACCEPT_MIMES}
                    multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center justify-between text-xs text-ink-muted">
                          <span className="truncate">{f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB</span>
                          <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                            className="text-claret text-2xs underline">Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {error && <div className="text-sm text-claret">{error}</div>}
                <div className="text-2xs text-ink-soft">We typically respond within 1 business day.</div>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={submitting} className="btn-primary flex-1">
                    {submitting ? 'Sending…' : 'Send message'}
                  </button>
                  <button type="button" onClick={close} disabled={submitting} className="btn-ghost">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="p-8 text-center">
                <div className="text-2xs uppercase tracking-widest text-forest mb-3">Sent</div>
                <h3 className="font-display text-2xl tracking-tightest mb-2">Thanks, we have your message.</h3>
                <p className="text-sm text-ink-muted">
                  We'll respond to <strong>{userEmail}</strong> within 1 business day.
                </p>
                <button type="button" onClick={close} className="btn-ghost mt-6 text-xs">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default SupportWidget;
