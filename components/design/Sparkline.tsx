import { useId, useMemo } from 'react';

type Props = {
  data: number[];
  width?: number;
  height?: number;
  /** Forest-green by default; pass any CSS color string. */
  stroke?: string;
  /** When true, fill underneath the line at low opacity. */
  fill?: boolean;
  className?: string;
};

// Tiny SVG sparkline. No axis, no labels — for stat-card footers.
export function Sparkline({
  data,
  width = 84,
  height = 18,
  stroke = '#1F3A2E',
  fill = true,
  className,
}: Props) {
  const id = useId();
  const path = useMemo(() => buildPath(data, width, height), [data, width, height]);
  const area = useMemo(() => buildArea(data, width, height), [data, width, height]);

  if (!data || data.length === 0) {
    return <span className={className} style={{ display: 'inline-block', width, height }} />;
  }

  return (
    <svg
      role="img"
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={`sparkline-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#sparkline-fill-${id})`} />
        </>
      )}
      <path d={path} stroke={stroke} strokeWidth="1.25" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function buildPath(data: number[], w: number, h: number): string {
  if (data.length === 0) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  return data
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function buildArea(data: number[], w: number, h: number): string {
  const path = buildPath(data, w, h);
  if (!path) return '';
  return `${path} L ${w} ${h} L 0 ${h} Z`;
}

export default Sparkline;
