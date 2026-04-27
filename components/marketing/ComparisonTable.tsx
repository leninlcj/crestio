import type { CompareSection, CompareCell } from '../../lib/comparisons';

type Props = {
  competitorName: string;
  sections: CompareSection[];
};

export default function ComparisonTable({ competitorName, sections }: Props) {
  return (
    <div className="rounded-md border border-rule overflow-hidden bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-cream border-b border-rule">
            <tr>
              <th className="text-left px-4 py-3 text-2xs uppercase tracking-widest text-ink-soft font-medium">
                Feature
              </th>
              <th className="text-center px-4 py-3 text-2xs uppercase tracking-widest text-forest font-medium whitespace-nowrap">
                Crestio
              </th>
              <th className="text-center px-4 py-3 text-2xs uppercase tracking-widest text-ink-muted font-medium whitespace-nowrap">
                {competitorName}
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <SectionRows key={section.key} section={section} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionRows({ section }: { section: CompareSection }) {
  return (
    <>
      <tr className="bg-ruleSoft/50">
        <td colSpan={3} className="px-4 py-2 text-2xs uppercase tracking-widest text-ink font-medium">
          {section.title}
        </td>
      </tr>
      {section.rows.map((row, i) => (
        <tr key={i} className="border-b border-ruleSoft last:border-b-0">
          <td className="px-4 py-3 text-ink-muted align-top">
            <div>{row.feature}</div>
            {row.note && <div className="text-2xs text-ink-soft mt-1 leading-relaxed">{row.note}</div>}
          </td>
          <td className="px-4 py-3 text-center align-top">
            <Cell value={row.crestio} side="own" />
          </td>
          <td className="px-4 py-3 text-center align-top">
            <Cell value={row.competitor} side="other" />
          </td>
        </tr>
      ))}
    </>
  );
}

function Cell({ value, side }: { value: CompareCell; side: 'own' | 'other' }) {
  if (value === 'yes') {
    return (
      <span className={['inline-flex', side === 'own' ? 'text-forest' : 'text-ink-soft'].join(' ')} aria-label="Included">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (value === 'no') {
    return (
      <span className="inline-flex text-claret/70" aria-label="Not included">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (value === 'partial') {
    return (
      <span className="inline-flex text-amber-ink/70" aria-label="Partial">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
        </svg>
      </span>
    );
  }
  return <span className="text-2xs text-ink num tabular">{value}</span>;
}
