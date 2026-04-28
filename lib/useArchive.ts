import { useCallback } from 'react';
import { authFetch } from './authFetch';
import { useUndo } from './useUndo';
import { ENTITY_SPECS, EntityType } from './entitySchema';

// useArchive — handles the soft-archive flow for entity types that support it.
// The mutation runs immediately (so UI hides the row) and an undo toast is
// shown for 5s with an inverseCommit that restores via /api/restore.
//
//   const archive = useArchive();
//   archive.run({
//     entity_type: 'student',
//     ids: ['abc-…'],
//     label: 'Archived "Diego".',
//     onLocalRemove: () => removeFromList(diegoId),
//     onLocalRestore: () => addBackToList(diego),
//   });

export type ArchiveOptions = {
  entity_type: EntityType;
  ids: string[];
  label?: string;
  reason?: string;
  cascade?: boolean;
  onLocalRemove?: () => void;
  onLocalRestore?: () => void;
  onCommitted?: () => void;
};

export function useArchive() {
  const undo = useUndo();

  const run = useCallback(async (opts: ArchiveOptions) => {
    const spec = ENTITY_SPECS[opts.entity_type];
    const labelDefault = opts.ids.length === 1
      ? `Archived ${spec.label}.`
      : `Archived ${opts.ids.length} ${spec.labelPlural}.`;
    const label = opts.label ?? labelDefault;

    opts.onLocalRemove?.();

    // Fire the mutation right away so the row is genuinely archived.
    const archivePromise = authFetch('/api/archive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entity_type: opts.entity_type,
        ids: opts.ids,
        reason: opts.reason ?? null,
        cascade: opts.cascade ?? false,
      }),
    });

    undo.queue({
      id: `archive-${opts.entity_type}-${opts.ids.join(',')}`,
      label,
      holdMs: 5000,
      commit: async () => {
        await archivePromise;
        opts.onCommitted?.();
      },
      inverseCommit: async () => {
        await archivePromise;  // wait for archive to land before restoring
        await authFetch('/api/restore', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            entity_type: opts.entity_type,
            ids: opts.ids,
            from: 'archive',
          }),
        });
        opts.onLocalRestore?.();
      },
    });
  }, [undo]);

  return { run };
}
