import type { RoadmapItem, RoadmapStatus } from '../../lib/roadmap';

type Props = {
  status: RoadmapStatus;
  title: string;
  items: RoadmapItem[];
};

const STATUS_DOT: Record<RoadmapStatus, string> = {
  shipped: 'bg-forest',
  in_progress: 'bg-amber',
  planned: 'bg-ink-soft',
};

const STATUS_BADGE: Record<RoadmapStatus, string> = {
  shipped: 'bg-forest-soft text-forest-ink',
  in_progress: 'bg-amber-soft/60 text-amber-ink',
  planned: 'bg-ruleSoft text-ink-muted',
};

const AUDIENCE_LABEL: Record<string, string> = {
  tutor: 'Tutor',
  owner: 'Owner',
  parent: 'Parent',
  infra: 'Infra',
};

export default function RoadmapColumn({ status, title, items }: Props) {
  return (
    <section className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-4">
        <span className={['w-2 h-2 rounded-full', STATUS_DOT[status]].join(' ')} aria-hidden />
        <h2 className="font-display text-base tracking-tightest text-ink m-0">{title}</h2>
        <span className="text-2xs text-ink-soft num tabular ml-1">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-rule bg-surface p-5 text-2xs text-ink-soft">
          Nothing here yet.
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((item, i) => (
            <li
              key={i}
              className="rounded-md border border-rule bg-surface p-4 md:p-5"
              data-audience={item.audience}
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <h3 className="font-display text-sm md:text-base tracking-tightest text-ink m-0 leading-tight">
                  {item.title}
                </h3>
                <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-medium whitespace-nowrap shrink-0', STATUS_BADGE[status]].join(' ')}>
                  {AUDIENCE_LABEL[item.audience] ?? item.audience}
                </span>
              </div>
              {item.description && (
                <p className="text-2xs md:text-xs text-ink-muted leading-relaxed">
                  {item.description}
                </p>
              )}
              {item.eta && status !== 'shipped' && (
                <div className="mt-3 text-[10px] uppercase tracking-widest text-ink-soft num tabular">
                  ETA · {item.eta}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
