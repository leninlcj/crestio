import { ReactNode } from 'react';
import { cx } from '../../lib/utils';

export type ChipOption = {
  value: string;
  label: ReactNode;
  count?: number;
};

type Props = {
  options: ChipOption[];
  /** Current value(s). String for single-select, array for multi. */
  value: string | string[];
  /** When true, multiple chips can be active at once. */
  multi?: boolean;
  onChange: (next: string | string[]) => void;
  className?: string;
  ariaLabel?: string;
};

// Compact filter chip row. Single or multi select. Used at the top of every list.
export function FilterChips({
  options,
  value,
  multi,
  onChange,
  className,
  ariaLabel,
}: Props) {
  const valuesActive = (() => {
    if (multi) return Array.isArray(value) ? value : [value].filter(Boolean);
    return [Array.isArray(value) ? value[0] : value].filter(Boolean);
  })();

  function toggle(v: string) {
    if (multi) {
      const set = new Set(valuesActive);
      if (set.has(v)) set.delete(v); else set.add(v);
      onChange(Array.from(set));
    } else {
      onChange(v === valuesActive[0] ? '' : v);
    }
  }

  return (
    <div className={cx('flex items-center gap-1.5 flex-wrap', className)} role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = valuesActive.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            aria-pressed={active}
            className={cx(
              'inline-flex items-center gap-1.5 h-7 px-2.5 text-xs rounded-full border transition-colors duration-100',
              active
                ? 'bg-ink text-cream border-ink'
                : 'bg-surface border-rule text-ink-muted hover:text-ink hover:bg-ruleSoft',
            )}
          >
            <span>{o.label}</span>
            {typeof o.count === 'number' && o.count > 0 && (
              <span className={cx('text-2xs tabular', active ? 'text-cream/70' : 'text-ink-soft')}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default FilterChips;
