import { useEffect, useRef } from 'react';
import { SHORTCUTS, KeyBinding } from './keyboard';

// useKeyboard — register a handler for one shortcut by id.
// Components don't define key combos themselves; they reference the registry
// in lib/keyboard.ts. That keeps the help overlay always in sync.
//
//   useKeyboard('goHome', () => router.push('/app'));
//
// Pass `enabled = false` to temporarily disable (e.g. while a modal is open).

type Options = { enabled?: boolean };

export function useKeyboard(id: string, handler: () => void, opts: Options = {}) {
  const enabled = opts.enabled ?? true;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const binding = SHORTCUTS.find((s) => s.id === id);
    if (!binding) return;

    let seqIndex = 0;
    let seqTimer: ReturnType<typeof setTimeout> | null = null;
    function clearSeq() {
      seqIndex = 0;
      if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; }
    }

    function inEditableTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function matchKeys(e: KeyboardEvent, combo: string): boolean {
      const parts = combo.split('+').map((p) => p.trim().toLowerCase());
      const wantMod = parts.includes('mod');
      const wantShift = parts.includes('shift');
      const wantAlt = parts.includes('alt');
      const wantCtrl = parts.includes('ctrl');
      const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
      const modPressed = isMac ? e.metaKey : e.ctrlKey;
      if (wantMod && !modPressed) return false;
      if (!wantMod && (e.metaKey || (!isMac && e.ctrlKey && !wantCtrl))) return false;
      if (wantShift !== e.shiftKey) return false;
      if (wantAlt !== e.altKey) return false;
      if (wantCtrl && !e.ctrlKey) return false;
      const main = parts.filter((p) => !['mod', 'shift', 'alt', 'ctrl'].includes(p))[0] ?? '';
      const key = e.key.toLowerCase();
      return key === main;
    }

    function onKey(e: KeyboardEvent) {
      const editable = inEditableTarget(e.target);
      if (editable && !binding!.allowInInput) return;

      if (binding!.keys && binding!.keys.length > 0) {
        for (const combo of binding!.keys) {
          if (matchKeys(e, combo)) {
            e.preventDefault();
            handlerRef.current();
            return;
          }
        }
      }
      if (binding!.sequence && binding!.sequence.length > 0) {
        // Sequences require no modifiers and a plain key match.
        if (e.metaKey || e.ctrlKey || e.altKey) { clearSeq(); return; }
        const expected = binding!.sequence[seqIndex];
        if (e.key.toLowerCase() === expected.toLowerCase()) {
          seqIndex += 1;
          if (seqTimer) clearTimeout(seqTimer);
          seqTimer = setTimeout(clearSeq, 1200);
          if (seqIndex === binding!.sequence.length) {
            e.preventDefault();
            handlerRef.current();
            clearSeq();
          }
        } else {
          clearSeq();
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearSeq();
    };
  }, [id, enabled]);
}

// Hook: list-row navigation with J/K/Enter and basic select.
// Caller passes the count + a setter for the active index.
export function useListNav({
  count,
  active,
  setActive,
  onOpen,
  onSelect,
  enabled = true,
}: {
  count: number;
  active: number;
  setActive: (i: number) => void;
  onOpen?: (i: number) => void;
  onSelect?: (i: number) => void;
  enabled?: boolean;
}) {
  useKeyboard('listDown', () => setActive(Math.min(count - 1, active + 1)), { enabled });
  useKeyboard('listUp',   () => setActive(Math.max(0, active - 1)), { enabled });
  useKeyboard('listOpen', () => onOpen?.(active), { enabled: enabled && !!onOpen });
  useKeyboard('listSelect', () => onSelect?.(active), { enabled: enabled && !!onSelect });
}

export function getShortcutBindings(): KeyBinding[] {
  return SHORTCUTS;
}
