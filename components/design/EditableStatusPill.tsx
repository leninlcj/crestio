import { useEffect, useRef, useState } from 'react';
import { StatusPill } from './StatusPill';
import { useToast } from './Toast';
import { cx } from '../../lib/utils';

type Tone = 'neutral' | 'forest' | 'success' | 'amber' | 'claret' | 'rust';

export type StatusOption = {
  value: string;
  label: string;
  tone: Tone;
};

type Props = {
  value: string;
  options: StatusOption[];
  onChange: (next: string) => Promise<void> | void;
  disabled?: boolean;
};

// Click-to-edit status pill. Opens a tiny popover with the valid set.
// Optimistic — reverts on rejection and shows a toast.
export function EditableStatusPill({ value, options, onChange, disabled }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const effective = optimistic ?? value;
  const current = options.find((o) => o.value === effective) ?? options[0];

  async function pick(next: string) {
    setOpen(false);
    if (next === value) return;
    setOptimistic(next);
    try {
      await onChange(next);
    } catch {
      setOptimistic(null);
      toast.show({ message: "Couldn't save. Try again.", tone: 'error' });
      return;
    }
    setOptimistic(null);
  }

  if (disabled) {
    return <StatusPill tone={current?.tone ?? 'neutral'}>{current?.label}</StatusPill>;
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="rounded-full hover:opacity-80 transition-opacity duration-100"
      >
        <StatusPill tone={current?.tone ?? 'neutral'}>{current?.label}</StatusPill>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-30 min-w-[160px] bg-surface border border-rule rounded-md shadow-lift py-1 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitem"
              onClick={() => pick(o.value)}
              className={cx(
                'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-ruleSoft transition-colors duration-100',
                o.value === effective ? 'text-ink' : 'text-ink-muted',
              )}
            >
              <span>{o.label}</span>
              {o.value === effective && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-forest">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default EditableStatusPill;
