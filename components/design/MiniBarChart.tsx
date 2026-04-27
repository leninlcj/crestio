import { useMemo } from 'react';
import { Tooltip } from './Tooltip';

type Series = {
  label: string;
  value: number;
  color?: string;
};

type Props = {
  /** Array of bars (when bars=segments, used as a stacked bar). */
  data: Series[];
  /** "bars" = side-by-side, "stacked" = single horizontal stacked bar. */
  variant?: 'bars' | 'stacked';
  width?: number;
  height?: number;
  className?: string;
};

// Tiny chart used in stat cards. "bars" mode for the activity strip,
// "stacked" for the per-tutor breakdown on the owner card.
export function MiniBarChart({ data, variant = 'bars', width = 120, height = 24, className }: Props) {
  const total = useMemo(() => data.reduce((acc, s) => acc + Math.max(0, s.value), 0), [data]);
  if (data.length === 0 || total === 0) {
    return (
      <span
        aria-hidden="true"
        className={['inline-block bg-ruleSoft/50 rounded', className ?? ''].join(' ')}
        style={{ width, height: Math.max(4, Math.round(height / 4)) }}
      />
    );
  }

  if (variant === 'stacked') {
    return (
      <div
        className={['flex overflow-hidden rounded', className ?? ''].join(' ')}
        style={{ width, height: Math.max(4, Math.round(height / 4)) }}
        role="img"
        aria-label={`Stacked: ${data.map((s) => `${s.label} ${s.value}`).join(', ')}`}
      >
        {data.map((s, i) => {
          const pct = total === 0 ? 0 : (s.value / total) * 100;
          if (pct === 0) return null;
          return (
            <Tooltip key={`${s.label}-${i}`} label={`${s.label}: ${s.value}`}>
              <span
                className="block transition-opacity duration-100 hover:opacity-80"
                style={{ width: `${pct}%`, height: '100%', background: s.color ?? '#1F3A2E' }}
              />
            </Tooltip>
          );
        })}
      </div>
    );
  }

  // bars mode
  const max = Math.max(...data.map((s) => s.value), 1);
  const gap = 1;
  const barW = Math.max(1, (width - gap * (data.length - 1)) / data.length);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Activity over ${data.length} buckets`}
    >
      {data.map((s, i) => {
        const h = Math.max(1, (s.value / max) * height);
        const x = i * (barW + gap);
        const y = height - h;
        const color = s.color ?? '#1F3A2E';
        const opacity = s.value === 0 ? 0.15 : 0.7;
        return (
          <rect
            key={`${s.label}-${i}`}
            x={x.toFixed(1)}
            y={y.toFixed(1)}
            width={barW.toFixed(1)}
            height={h.toFixed(1)}
            fill={color}
            opacity={opacity}
            rx="0.5"
          >
            <title>{`${s.label}: ${s.value}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export default MiniBarChart;
