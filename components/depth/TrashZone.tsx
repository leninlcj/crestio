import { useEffect, useState } from 'react';
import { authFetch } from '../../lib/authFetch';
import { undoStack } from '../../lib/undoStack';
import { useToast } from '../design/Toast';

// Drag-to-trash drop target.  Hidden by default; fades in while a drag is
// in progress on the document (any element with draggable=true).  Drop
// data shape: dataTransfer.setData('application/x-crestio-entity',
// JSON.stringify({ type, id, label })).

const ARCHIVE_TYPES = new Set(['student','household','parent','tutor','session_template','message_thread','file','lesson_plan']);
const SOFT_DELETE_TYPES = new Set(['session','invoice','file','lesson_plan','message']);

export function TrashZone() {
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    function onDragStart() { setVisible(true); }
    function onDragEnd() { setVisible(false); setHover(false); }
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragend', onDragEnd);
    return () => {
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragend', onDragEnd);
    };
  }, []);

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHover(true);
  }

  function onDragLeave() { setHover(false); }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setHover(false);
    setVisible(false);

    const raw = e.dataTransfer.getData('application/x-crestio-entity');
    if (!raw) return;
    let parsed: { type: string; id: string; label?: string } | null = null;
    try { parsed = JSON.parse(raw); } catch { return; }
    if (!parsed?.type || !parsed?.id) return;

    const useArchive = ARCHIVE_TYPES.has(parsed.type);
    const useSoftDelete = SOFT_DELETE_TYPES.has(parsed.type);
    if (!useArchive && !useSoftDelete) {
      toast.show({ message: `Can't delete ${parsed.type}.`, tone: 'warning' });
      return;
    }

    const verb = useArchive ? 'Archived' : 'Deleted';
    const apiPath = useArchive ? '/api/archive' : '/api/soft-delete';
    const restoreFrom = useArchive ? 'archive' : 'soft-delete';

    const res = await authFetch(apiPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entity_type: parsed.type, ids: [parsed.id] }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.show({ message: data.error ?? 'Could not delete.', tone: 'error' });
      return;
    }

    toast.show({ message: `${verb} ${parsed.label ?? parsed.type}. Undo (⌘Z)`, tone: 'success' });
    undoStack.push({
      label: `${verb} ${parsed.label ?? parsed.type}`,
      undo: async () => {
        await authFetch('/api/restore', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entity_type: parsed!.type, ids: [parsed!.id], from: restoreFrom }),
        });
      },
    });

    // Tell the dragged-from list to remove the row.
    window.dispatchEvent(new CustomEvent('crestio:entity-archived', { detail: parsed }));
  }

  if (!visible) return null;

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="region"
      aria-label="Drop to delete"
      className={[
        'fixed bottom-6 right-6 z-[90] w-32 h-32 rounded-full border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all duration-150 pointer-events-auto animate-fade-in',
        hover ? 'border-claret bg-claret/10 scale-110 text-claret' : 'border-rule bg-surface/95 text-ink-muted',
      ].join(' ')}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      </svg>
      <span className="text-2xs uppercase tracking-widest">{hover ? 'Release to delete' : 'Drop here'}</span>
    </div>
  );
}

export default TrashZone;
