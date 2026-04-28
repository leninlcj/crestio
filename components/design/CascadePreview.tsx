// Renders a small "this will also affect…" callout above the ConfirmDrawer
// item list when an archive action would cascade.  Pass a precomputed summary
// keyed by entity type ({ students: 3, parents: 2, templates: 1 }).

type Props = {
  summary: Record<string, number>;
  rootLabel?: string;
};

const ENTITY_LABEL: Record<string, [string, string]> = {
  students: ['student', 'students'],
  parents: ['parent', 'parents'],
  templates: ['active template', 'active templates'],
  sessions: ['session', 'sessions'],
  invoices: ['unpaid invoice', 'unpaid invoices'],
  files: ['file', 'files'],
  links_revoked: ['parent portal access', 'parent portal accesses'],
};

function describeOne(key: string, count: number): string {
  const labels = ENTITY_LABEL[key];
  if (!labels) return `${count} ${key}`;
  return `${count} ${count === 1 ? labels[0] : labels[1]}`;
}

export function CascadePreview({ summary, rootLabel = 'this will also affect' }: Props) {
  const entries = Object.entries(summary).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;
  return (
    <div className="mb-3 px-3 py-2 rounded-md bg-amber-soft/40 border border-amber-soft text-2xs text-amber-ink">
      <div className="font-medium uppercase tracking-widest text-2xs mb-1">Cascade</div>
      <div>
        {`Beyond the ${rootLabel.toLowerCase()}, `}
        {entries.map(([k, c], i) => (
          <span key={k}>
            {describeOne(k, c)}{i < entries.length - 1 ? ', ' : ''}
          </span>
        ))} will be archived.
      </div>
    </div>
  );
}

export default CascadePreview;
