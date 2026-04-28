import { useState } from 'react';
import { BulkActionBar } from './BulkActionBar';
import { ConfirmDrawer } from './ConfirmDrawer';
import { CascadePreview } from './CascadePreview';
import { useArchive } from '../../lib/useArchive';
import { useSoftDelete } from '../../lib/useSoftDelete';
import { ENTITY_SPECS, EntityType } from '../../lib/entitySchema';
import { authFetch } from '../../lib/authFetch';

// Drop-in BulkActionBar specialised for archive / soft-delete.  Wraps the
// confirm-drawer flow with cascade preview so the most common bulk action
// (Archive / Delete) lands in two clicks anywhere a list provides selection.
//
// Usage:
//   <BulkArchiveBar
//     entityType="student"
//     selected={selected}
//     onClear={() => setSelected(new Set())}
//     items={selectedRows.map((s) => ({ id: s.id, label: s.name }))}
//     onLocalRemove={(ids) => setRows((rs) => rs.filter((r) => !ids.includes(r.id)))}
//     extraActions={<button>Reassign</button>}
//   />

type Item = { id: string; label: string; sublabel?: string; warning?: string };

type Props = {
  entityType: EntityType;
  selected: Set<string>;
  items: Item[];
  onClear: () => void;
  onLocalRemove?: (ids: string[]) => void;
  /** Extra child buttons for entity-specific bulk actions (Tag, Bill, etc). */
  extraActions?: React.ReactNode;
  /** When the entity supports both archive + soft-delete, pick which the bulk button uses. */
  prefer?: 'archive' | 'soft-delete';
  /** Optional cascade summary (precomputed). When provided, drives the cascade banner. */
  cascadeSummary?: Record<string, number>;
};

export function BulkArchiveBar({
  entityType, selected, items, onClear,
  onLocalRemove, extraActions, prefer, cascadeSummary,
}: Props) {
  const archive = useArchive();
  const softDelete = useSoftDelete();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const spec = ENTITY_SPECS[entityType];
  const supportsArchive = !!spec.archiveCol;
  const supportsDelete = !!spec.softDeleteCol;
  const mode: 'archive' | 'soft-delete' =
    prefer === 'archive' && supportsArchive ? 'archive'
    : prefer === 'soft-delete' && supportsDelete ? 'soft-delete'
    : supportsArchive ? 'archive' : 'soft-delete';

  const ids = Array.from(selected);
  const verb = mode === 'archive' ? 'Archive' : 'Delete';

  async function performExportCsv() {
    const rowsCsv = items.map((it) => ({ id: it.id, label: it.label }));
    const header = Object.keys(rowsCsv[0] ?? { id: '', label: '' }).join(',');
    const body = rowsCsv.map((r) => `${r.id},"${(r.label ?? '').replace(/"/g, '""')}"`).join('\n');
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `crestio-${spec.labelPlural}-${Date.now()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function confirm() {
    setBusy(true);
    try {
      if (mode === 'archive') {
        await archive.run({
          entity_type: entityType,
          ids,
          cascade: !!cascadeSummary,
          onLocalRemove: () => onLocalRemove?.(ids),
        });
      } else {
        await softDelete.run({
          entity_type: entityType,
          ids,
          onLocalRemove: () => onLocalRemove?.(ids),
        });
      }
      onClear();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BulkActionBar count={selected.size} onClear={onClear}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-7 px-3 text-2xs uppercase tracking-widest rounded-full bg-cream/10 hover:bg-cream/20 transition-colors duration-100"
        >
          {verb}
        </button>
        <button
          type="button"
          onClick={performExportCsv}
          className="h-7 px-3 text-2xs uppercase tracking-widest rounded-full bg-cream/10 hover:bg-cream/20 transition-colors duration-100"
        >
          Export CSV
        </button>
        {extraActions}
      </BulkActionBar>

      <ConfirmDrawer
        open={open}
        title={`${verb} ${selected.size} ${selected.size === 1 ? spec.label : spec.labelPlural}?`}
        summary={mode === 'archive'
          ? 'Archived items move to Trash. You can restore them any time.'
          : 'Items will be permanently removed in 30 days. You can restore them until then.'}
        items={items}
        confirmLabel={`${verb} ${selected.size}`}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
        busy={busy}
        destructive
      >
        {cascadeSummary && Object.keys(cascadeSummary).length > 0 && (
          <CascadePreview summary={cascadeSummary} rootLabel={spec.label} />
        )}
      </ConfirmDrawer>
    </>
  );
}

export default BulkArchiveBar;
