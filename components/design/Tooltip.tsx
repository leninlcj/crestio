import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Side = 'top' | 'bottom' | 'left' | 'right';

type Props = {
  label: ReactNode;
  side?: Side;
  /** Delay before showing, in ms. Default 200. Hide is instant. */
  delay?: number;
  children: ReactNode;
  /** Tooltip is suppressed when label is empty. */
  className?: string;
};

// Lightweight tooltip — 11px text, 6×10 padding, dark-on-white, 6px radius.
// Positioning is portal + fixed so it escapes overflow:hidden parents.
// Activates on hover and focus; hides on blur, scroll, or escape.
export function Tooltip({ label, side = 'top', delay = 200, children, className }: Props) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const id = useId();

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  function show() {
    if (!label) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setOpen(true);
      requestAnimationFrame(reposition);
    }, delay);
  }
  function hide() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setOpen(false);
  }

  function reposition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const margin = 6;
    let top = 0, left = 0;
    if (side === 'top')    { top = r.top - margin; left = r.left + r.width / 2; }
    if (side === 'bottom') { top = r.bottom + margin; left = r.left + r.width / 2; }
    if (side === 'left')   { top = r.top + r.height / 2; left = r.left - margin; }
    if (side === 'right')  { top = r.top + r.height / 2; left = r.right + margin; }
    setPos({ top, left });
  }

  useEffect(() => {
    if (!open) return;
    const onScroll = () => hide();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const transform =
    side === 'top' ? 'translate(-50%, -100%)' :
    side === 'bottom' ? 'translate(-50%, 0)' :
    side === 'left' ? 'translate(-100%, -50%)' :
    'translate(0, -50%)';

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={open ? id : undefined}
        className={className}
      >
        {children}
      </span>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          id={id}
          role="tooltip"
          className="fixed z-[120] pointer-events-none text-2xs text-ink bg-surface border border-rule rounded shadow-lift whitespace-nowrap"
          style={{
            top: pos.top,
            left: pos.left,
            transform,
            padding: '6px 10px',
          }}
        >
          {label}
        </div>,
        document.body,
      )}
    </>
  );
}

export default Tooltip;
