import { useEffect, useRef, useState } from 'react';

type Template = { key: string; label: string; body: string };

const DEFAULT_TEMPLATES: Template[] = [
  { key: 'reschedule_confirm', label: 'Reschedule confirmation', body: "Confirming our session has been moved. See you at the new time." },
  { key: 'homework_reminder',  label: 'Homework reminder',       body: "Just a quick reminder about the homework from our last session — happy to clarify anything." },
  { key: 'session_summary',    label: 'Session summary follow-up', body: "Quick summary of what we covered today and what to focus on for next session:" },
  { key: 'payment_reminder',   label: 'Payment reminder',         body: "Just a gentle reminder — the latest invoice is still outstanding. Let me know if anything's unclear." },
  { key: 'welcome_parent',     label: 'Welcome new parent',       body: "Welcome — looking forward to working with you and your child. Here's how things will run from my side:" },
];

const STORAGE_KEY = 'crestio.canned_responses.v1';
const USAGE_KEY = 'crestio.canned_responses.usage.v1';

function loadUsage(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(USAGE_KEY) ?? '{}'); }
  catch { return {}; }
}
function bumpUsage(key: string) {
  if (typeof window === 'undefined') return;
  const usage = loadUsage();
  usage[key] = (usage[key] ?? 0) + 1;
  try { window.localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); } catch { /* */ }
}

type Props = {
  onPick: (body: string) => void;
};

export default function CannedResponses({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<Template[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setCustom(JSON.parse(raw));
    } catch { /* ignore */ }
    setUsage(loadUsage());
  }, []);

  function pickAndCount(tpl: Template) {
    bumpUsage(tpl.key);
    setUsage(loadUsage());
    onPick(tpl.body);
    setOpen(false);
  }

  // Sort all templates by usage; the most-used floats to the top so heavy
  // users land on their favourite without scanning.
  const allTemplates = [...DEFAULT_TEMPLATES, ...custom];
  const mostUsed = allTemplates
    .map((t) => ({ t, count: usage[t.key] ?? 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)[0];

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function persist(next: Template[]) {
    setCustom(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function add() {
    if (!draftLabel.trim() || !draftBody.trim()) return;
    persist([...custom, { key: `custom-${Date.now()}`, label: draftLabel.trim(), body: draftBody.trim() }]);
    setDraftLabel(''); setDraftBody(''); setAdding(false);
  }

  function remove(key: string) {
    persist(custom.filter((t) => t.key !== key));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="btn-ghost text-xs h-7 min-h-[28px] px-2.5 inline-flex items-center gap-1"
      >
        Templates
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-80 max-h-96 overflow-y-auto rounded-md bg-surface border border-rule shadow-lift z-30 animate-fade-in">
          <div className="px-3 py-2 border-b border-rule flex items-center justify-between">
            <div className="text-2xs uppercase tracking-widest text-ink-soft">Templates</div>
            {mostUsed && (
              <div className="text-2xs text-ink-soft">
                Most used: <strong className="text-ink-muted">{mostUsed.t.label}</strong> ({mostUsed.count}×)
              </div>
            )}
          </div>
          <ul>
            {DEFAULT_TEMPLATES.map((tpl) => (
              <li key={tpl.key}>
                <button
                  type="button"
                  onClick={() => pickAndCount(tpl)}
                  className="w-full text-left px-3 py-2.5 hover:bg-cream transition-colors flex items-start justify-between gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink truncate">{tpl.label}</span>
                    <span className="block text-2xs text-ink-soft truncate">{tpl.body}</span>
                  </span>
                  {(usage[tpl.key] ?? 0) > 0 && (
                    <span className="text-2xs text-ink-soft num tabular shrink-0 mt-0.5">{usage[tpl.key]}×</span>
                  )}
                </button>
              </li>
            ))}
            {custom.length > 0 && (
              <li className="border-t border-rule mt-1 pt-1">
                <div className="px-3 py-1.5 text-2xs uppercase tracking-widest text-ink-soft">Yours</div>
              </li>
            )}
            {custom.map((tpl) => (
              <li key={tpl.key} className="flex items-center group">
                <button
                  type="button"
                  onClick={() => pickAndCount(tpl)}
                  className="flex-1 text-left px-3 py-2.5 hover:bg-cream transition-colors flex items-start justify-between gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink truncate">{tpl.label}</span>
                    <span className="block text-2xs text-ink-soft truncate">{tpl.body}</span>
                  </span>
                  {(usage[tpl.key] ?? 0) > 0 && (
                    <span className="text-2xs text-ink-soft num tabular shrink-0 mt-0.5">{usage[tpl.key]}×</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => remove(tpl.key)}
                  className="px-2 text-2xs text-ink-soft hover:text-claret opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${tpl.label}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-rule p-3">
            {adding ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  placeholder="Label"
                  className="input text-xs h-8 min-h-[32px]"
                />
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Message body"
                  rows={3}
                  className="input text-xs"
                />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setAdding(false)} className="btn-ghost text-xs h-7 min-h-[28px] px-2">
                    Cancel
                  </button>
                  <button type="button" onClick={add} className="btn-primary text-xs h-7 min-h-[28px] px-3">
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full text-xs text-forest hover:text-forest-ink underline-offset-2 hover:underline"
              >
                + Add a template
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
