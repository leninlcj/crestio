import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  /** HTML string. Empty string for blank. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Auto-save with this debounce (ms). When > 0, fires onAutoSave after settle. */
  autoSaveMs?: number;
  onAutoSave?: () => Promise<void> | void;
  className?: string;
  /** Minimum height in px. Default 120. */
  minHeight?: number;
  ariaLabel?: string;
};

// Minimal HTML editor — bold, italic, bullet list, numbered list. No
// headings, no links, no images. Built on contenteditable + execCommand
// (legacy but adequate for plain prose); zero dep.
//
// Auto-save status is tracked locally and exposed via the `data-status`
// attribute on the wrapper so a sibling badge can read "Saving..." / "Saved".
export function RichEditor({
  value, onChange, placeholder, autoSaveMs = 0, onAutoSave,
  className, minHeight = 120, ariaLabel,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const debounceRef = useRef<number | null>(null);
  const lastSentRef = useRef<string>(value ?? '');

  // Sync value -> DOM only when the editor isn't focused (avoids cursor jump).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if ((value ?? '') !== el.innerHTML) el.innerHTML = value ?? '';
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    onChange(html);
    if (autoSaveMs > 0 && onAutoSave) {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      setStatus('saving');
      debounceRef.current = window.setTimeout(async () => {
        try {
          await onAutoSave();
          lastSentRef.current = html;
          setStatus('saved');
          window.setTimeout(() => setStatus('idle'), 1500);
        } catch {
          setStatus('error');
        }
      }, autoSaveMs);
    }
  }

  const exec = useCallback((cmd: 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList') => {
    document.execCommand(cmd, false);
    ref.current?.focus();
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      exec('bold');
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      exec('italic');
    }
  }

  return (
    <div
      data-status={status}
      className={['rounded border border-rule bg-surface focus-within:border-forest focus-within:shadow-[0_0_0_2px_rgba(31,58,46,0.18)] transition-colors duration-100', className ?? ''].join(' ')}
    >
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-rule">
        <ToolbarBtn label="Bold" shortcut="⌘B" onClick={() => exec('bold')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h7a4 4 0 0 1 0 8H6zM6 12h8a4 4 0 0 1 0 8H6z"/></svg>
        </ToolbarBtn>
        <ToolbarBtn label="Italic" shortcut="⌘I" onClick={() => exec('italic')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-rule" aria-hidden="true" />
        <ToolbarBtn label="Bullet list" onClick={() => exec('insertUnorderedList')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
        </ToolbarBtn>
        <ToolbarBtn label="Numbered list" onClick={() => exec('insertOrderedList')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
        </ToolbarBtn>
        <span className="ml-auto text-2xs text-ink-soft transition-opacity duration-100">
          {status === 'saving' && 'Saving…'}
          {status === 'saved' && 'Saved'}
          {status === 'error' && <span className="text-claret">Couldn’t save</span>}
        </span>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel ?? 'Editor'}
        spellCheck
        onInput={emit}
        onBlur={emit}
        onKeyDown={onKeyDown}
        data-placeholder={placeholder ?? ''}
        className="rich-editor px-3 py-2 text-sm leading-relaxed text-ink outline-none whitespace-pre-wrap"
        style={{ minHeight }}
      />
    </div>
  );
}

function ToolbarBtn({
  label, shortcut, onClick, children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={shortcut ? `${label} · ${shortcut}` : label}
      aria-label={label}
      className="h-7 w-7 grid place-items-center rounded text-ink-muted hover:text-ink hover:bg-ruleSoft transition-colors duration-100"
    >
      {children}
    </button>
  );
}

export default RichEditor;
