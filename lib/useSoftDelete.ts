import { useCallback } from 'react';
import { authFetch } from './authFetch';
import { useUndo } from './useUndo';
import { ENTITY_SPECS, EntityType } from './entitySchema';

// useSoftDelete — sets deleted_at on the row (auto-purged after 30 days).  Use
// for sessions, invoices (drafts only), files, lesson_plans, messages.

export type SoftDeleteOptions = {
  entity_type: EntityType;
  ids: string[];
  label?: string;
  onLocalRemove?: () => void;
  onLocalRestore?: () => void;
  onCommitted?: () => void;
};

export function useSoftDelete() {
  const undo = useUndo();

  const run = useCallback(async (opts: SoftDeleteOptions) => {
    const spec = ENTITY_SPECS[opts.entity_type];
    const labelDefault = opts.ids.length === 1
      ? `Deleted ${spec.label}.`
      : `Deleted ${opts.ids.length} ${spec.labelPlural}.`;
    const label = opts.label ?? labelDefault;

    opts.onLocalRemove?.();

    const deletePromise = authFetch('/api/soft-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entity_type: opts.entity_type, ids: opts.ids }),
    });

    undo.queue({
      id: `delete-${opts.entity_type}-${opts.ids.join(',')}`,
      label,
      holdMs: 5000,
      commit: async () => {
        await deletePromise;
        opts.onCommitted?.();
      },
      inverseCommit: async () => {
        await deletePromise;
        await authFetch('/api/restore', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            entity_type: opts.entity_type,
            ids: opts.ids,
            from: 'soft-delete',
          }),
        });
        opts.onLocalRestore?.();
      },
    });
  }, [undo]);

  return { run };
}
