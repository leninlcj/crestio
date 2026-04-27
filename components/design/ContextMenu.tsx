import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem = {
  label: string;
  onSelect?: () => void;
  href?: string;
  /** When true, item is rendered as destructive (claret text). */
  destructive?: boolean;
  /** Optional shortcut to display on the right. */
  shortcut?: string;
  /** Renders a separator above this item. */
  separator?: boolean;
  disabled?: boolean;
};

type Props = {
  items: ContextMenuItem[];
  children: ReactNode;
};

// Right-click context menu. Wraps a child element; suppressing the native
// context menu and rendering an inline menu at the cursor.
export function ContextMenu({ items, children }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!pos) return;
    function close(e: Event) {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      setPos(null);
    }
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos]);

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setPos({ x: e.clientX, y: e.clientY });
    setActive(0);
  }

  function pick(item: ContextMenuItem) {
    setPos(null);
    if (item.disabled) return;
    if (item.onSelect) item.onSelect();
    else if (item.href) window.location.href = item.href;
  }

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(items[active]); }
  }

  return (
    <>
      <div ref={wrapRef} onContextMenu={onContextMenu} className="contents">
        {children}
      </div>
      {pos && typeof document !== 'undefined' && createPortal(
        <div
          role="menu"
          tabIndex={-1}
          autoFocus
          onKeyDown={onMenuKey}
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-[120] bg-surface border border-rule rounded-md shadow-lift py-1 min-w-[180px] text-sm animate-fade-in"
          style={{ top: clampY(pos.y), left: clampX(pos.x) }}
        >
          {items.map((item, i) => (
            <div key={`${item.label}-${i}`}>
              {item.separator && <div className="my-1 border-t border-ruleSoft" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(item)}
                className={[
                  'w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left text-sm',
                  active === i ? 'bg-ruleSoft' : 'hover:bg-ruleSoft/60',
                  item.destructive ? 'text-claret' : 'text-ink',
                  item.disabled ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="text-2xs text-ink-soft font-mono">{item.shortcut}</span>
                )}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

function clampX(x: number): number {
  if (typeof window === 'undefined') return x;
  return Math.min(x, window.innerWidth - 200);
}
function clampY(y: number): number {
  if (typeof window === 'undefined') return y;
  return Math.min(y, window.innerHeight - 280);
}

export default ContextMenu;
