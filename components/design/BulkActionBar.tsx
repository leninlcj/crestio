import { ReactNode } from 'react';

type Props = {
  count: number;
  onClear: () => void;
  /** Action buttons rendered on the right. */
  children: ReactNode;
};

// Sticky bar that fades in when rows are selected.
export function BulkActionBar({ count, onClear, children }: Props) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-3 md:bottom-4 z-30 mx-auto max-w-fit animate-fade-in">
      <div className="flex items-center gap-3 bg-ink text-cream rounded-full pl-4 pr-2 py-1.5 shadow-lift">
        <span className="text-xs tabular">
          {count} selected
        </span>
        <span className="text-cream/40 text-xs" aria-hidden="true">·</span>
        <div className="flex items-center gap-1">{children}</div>
        <button
          type="button"
          onClick={onClear}
          className="ml-1 h-7 px-2.5 text-2xs uppercase tracking-widest rounded-full text-cream/70 hover:text-cream hover:bg-cream/10 transition-colors duration-100"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default BulkActionBar;
