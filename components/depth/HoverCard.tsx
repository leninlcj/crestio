import { ReactNode, useEffect, useRef, useState } from 'react';
import { authFetch } from '../../lib/authFetch';

// HoverCard — wraps any inline label.  After 300ms hover, fetches
// /api/hover-stats/[type]/[id] and renders a 280px floating card.  Touch
// fallback: long-press 600ms shows the same card.

type EntityType = 'student' | 'parent' | 'tutor' | 'session' | 'invoice' | 'file' | 'lesson_plan';

type Stats = {
  label: string;
  sublabel: string | null;
  stats: Array<{ label: string; value: string }>;
  lastActivity: string | null;
  status: string | null;
};

const HOVER_DELAY = 300;
const TOUCH_DELAY = 600;

type Cache = { at: number; data: Stats };
const memo = new Map<string, Cache>();
const TTL = 60_000;

type Props = {
  type: EntityType;
  id: string;
  children: ReactNode;
  /** When true, render as inline-flex so wrapping label stays inline. */
  inline?: boolean;
};

export function HoverCard({ type, id, children, inline = true }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Stats | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; placement: 'top' | 'bottom' } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchData() {
    const k = `${type}:${id}`;
    const c = memo.get(k);
    if (c && Date.now() - c.at < TTL) {
      setData(c.data);
      return;
    }
    void (async () => {
      const res = await authFetch(`/api/hover-stats/${type}/${id}`);
      if (!res.ok) return;
      const d = await res.json();
      memo.set(k, { at: Date.now(), data: d });
      setData(d);
    })();
  }

  function showAt(target: HTMLElement) {
    const r = target.getBoundingClientRect();
    const margin = 8;
    const cardWidth = 280;
    const cardHeight = 200; // estimated max
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const placement: 'top' | 'bottom' = spaceBelow >= cardHeight + margin || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    let x = r.left;
    if (x + cardWidth > window.innerWidth - margin) x = window.innerWidth - cardWidth - margin;
    if (x < margin) x = margin;
    const y = placement === 'bottom' ? r.bottom + margin : r.top - margin;
    setPos({ x, y, placement });
    setOpen(true);
    fetchData();
  }

  function onMouseEnter(e: React.MouseEvent) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => showAt(e.currentTarget as HTMLElement), HOVER_DELAY);
  }
  function onMouseLeave() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }
  function onTouchStart(e: React.TouchEvent) {
    if (timer.current) clearTimeout(timer.current);
    const target = e.currentTarget as HTMLElement;
    timer.current = setTimeout(() => showAt(target), TOUCH_DELAY);
  }
  function onTouchEnd() {
    if (timer.current) clearTimeout(timer.current);
  }

  // Esc dismisses.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={inline ? 'inline-flex items-center' : ''}
      >
        {children}
      </span>
      {open && pos && (
        <div
          role="tooltip"
          aria-live="polite"
          className="fixed z-[120] w-[280px] bg-surface border border-rule rounded-md shadow-lift p-3 pointer-events-none animate-fade-in"
          style={{
            left: pos.x,
            top: pos.placement === 'bottom' ? pos.y : 'auto',
            bottom: pos.placement === 'top' ? `${window.innerHeight - pos.y}px` : 'auto',
          }}
        >
          {!data ? (
            <div className="text-2xs text-ink-soft">Loading…</div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-ink truncate">{data.label}</div>
                  {data.sublabel && (
                    <div className="text-2xs text-ink-soft truncate">{data.sublabel}</div>
                  )}
                </div>
                {data.status && data.status !== 'active' && (
                  <span className="text-2xs px-1.5 py-0.5 rounded bg-ruleSoft text-ink-muted shrink-0">{data.status}</span>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {data.stats.map((s, i) => (
                  <li key={i} className="text-2xs flex items-center justify-between gap-2">
                    <span className="text-ink-muted">{s.label}</span>
                    <span className="text-ink tabular truncate">{s.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default HoverCard;
