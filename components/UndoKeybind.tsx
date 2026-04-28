import { useEffect } from 'react';
import { undoStack } from '../lib/undoStack';
import { useToast } from './design/Toast';

// Mounted once in _app.tsx.  Listens for ⌘Z / ⌘⇧Z globally (when not in
// an input/textarea/contenteditable) and runs the top of the undo stack.

export function UndoKeybind() {
  const toast = useToast();

  useEffect(() => {
    function inEditableField(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    async function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      if (inEditableField(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) {
        const r = await undoStack.redo();
        if (r) toast.show({ message: `Redone: ${r.label}`, tone: 'success' });
        else toast.show({ message: 'Nothing to redo.', tone: 'info' });
      } else {
        const u = await undoStack.pop();
        if (u) toast.show({ message: `Undone: ${u.label}`, tone: 'success' });
        else toast.show({ message: 'Nothing to undo.', tone: 'info' });
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast]);

  return null;
}

export default UndoKeybind;
