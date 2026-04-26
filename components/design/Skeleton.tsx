import { CSSProperties } from 'react';

type Props = {
  className?: string;
  style?: CSSProperties;
};

// A single shimmer block. Subtle 1.4s cream → ruleSoft pulse — matches the
// rest of the design language without screaming for attention.
export function Skeleton({ className, style }: Props) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={['skeleton-shimmer rounded', className].filter(Boolean).join(' ')}
    />
  );
}

// Convenience: a row of skeleton table cells styled to look like an actual
// table row. Used by `TableSkeleton` below.
function SkeletonCell({ widthClass = 'w-24' }: { widthClass?: string }) {
  return (
    <td className="px-5 py-4 border-b border-ruleSoft">
      <Skeleton className={`h-3.5 ${widthClass}`} />
    </td>
  );
}

type TableSkeletonProps = {
  rows?: number;
  columns?: Array<{ width?: string }>;
};

export function TableSkeleton({
  rows = 6,
  columns = [{ width: 'w-32' }, { width: 'w-40' }, { width: 'w-24' }, { width: 'w-20' }],
}: TableSkeletonProps) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>
                <span className="opacity-50">·</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {columns.map((c, i) => (
                <SkeletonCell key={i} widthClass={c.width ?? 'w-24'} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CardListSkeletonProps = {
  rows?: number;
};

export function CardListSkeleton({ rows = 4 }: CardListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card p-5 md:p-6">
          <Skeleton className="h-3 w-24 mb-4" />
          <Skeleton className="h-6 w-1/2 mb-2" />
          <Skeleton className="h-4 w-1/3 mb-5" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
