import { useEffect, useRef, useState } from 'react';
import { useInlineEdit } from '../../lib/useInlineEdit';
import { useToast } from './Toast';
import { cx } from '../../lib/utils';

type Props = {
  /** Current saved value. */
  value: string;
  /** Save handler. Throw / reject to revert. */
  onSave: (next: string) => Promise<void> | void;
  /** Optional rendering for the static state (defaults to text). */
  display?: (v: string) => React.ReactNode;
  /** Placeholder when empty. */
  placeholder?: string;
  /** Visual style — default looks like body text, "title" is bigger/heavier. */
  variant?: 'body' | 'title' | 'small';
  /** Force multi-line input (textarea). */
  multiline?: boolean;
  className?: string;
  inputClassName?: string;
};

// Click the text → it becomes an input. Enter saves, Esc cancels.
// Subtle pencil icon on hover signals editability.
export function InlineEditField({
  value,
  onSave,
  display,
  placeholder = '—',
  variant = 'body',
  multiline,
  className,
  inputClassName,
}: Props) {
  const toast = useToast();
  const { value: current, status, start, save, cancel, set } = useInlineEdit<string>({
    initial: value,
    commit: onSave,
    onError: () => toast.show({ message: "Couldn't save. Try again.", tone: 'error' }),
  });

  // Sync prop change.
  useEffect(() => { set(value); }, [value, set]);

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (status === 'edit') {
      const el = inputRef.current;
      el?.focus();
      if (el && 'select' in el) el.select();
    }
  }, [status]);

  const sizing =
    variant === 'title'
      ? 'text-base font-medium leading-tight'
      : variant === 'small'
      ? 'text-xs leading-tight'
      : 'text-sm leading-snug';

  if (status === 'edit' || status === 'saving') {
    const handleKey = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (!multiline || (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        save((e.currentTarget as HTMLInputElement).value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    if (multiline) {
      return (
        <textarea
          ref={(el) => { inputRef.current = el; }}
          defaultValue={current}
          onKeyDown={handleKey}
          onBlur={(e) => save(e.currentTarget.value)}
          rows={3}
          className={cx('input w-full', sizing, inputClassName)}
        />
      );
    }
    return (
      <input
        ref={(el) => { inputRef.current = el; }}
        defaultValue={current}
        onKeyDown={handleKey}
        onBlur={(e) => save(e.currentTarget.value)}
        className={cx('input w-full', sizing, inputClassName)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      className={cx(
        'group inline-flex items-center gap-1.5 text-left rounded px-1 -mx-1 py-0.5 hover:bg-ruleSoft/60 transition-colors duration-100 max-w-full',
        sizing,
        className,
      )}
    >
      <span className={cx('truncate', current ? 'text-ink' : 'text-ink-soft')}>
        {display ? display(current) : current || placeholder}
      </span>
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-0 group-hover:opacity-60 transition-opacity duration-100 shrink-0 text-ink-muted"
        aria-hidden="true"
      >
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>
  );
}

export default InlineEditField;
