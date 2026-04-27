import { useMemo } from 'react';

type Props = {
  before: string;
  after: string;
  className?: string;
};

// Word-level diff renderer for the polish preview. No external dep —
// uses LCS over tokenized words to pick out additions and removals.
// Additions are shown with a faint green background; removals are
// gray strikethrough. Whitespace is preserved.
export function Diff({ before, after, className }: Props) {
  const ops = useMemo(() => diffWords(before ?? '', after ?? ''), [before, after]);
  return (
    <div className={['whitespace-pre-wrap text-sm leading-relaxed', className ?? ''].join(' ')}>
      {ops.map((op, i) => {
        if (op.type === 'eq') return <span key={i}>{op.text}</span>;
        if (op.type === 'add') return (
          <span
            key={i}
            className="bg-success-soft/60 text-success-ink rounded-sm"
            style={{ padding: '0 2px' }}
          >
            {op.text}
          </span>
        );
        return (
          <span
            key={i}
            className="text-ink-soft line-through"
            style={{ padding: '0 1px' }}
          >
            {op.text}
          </span>
        );
      })}
    </div>
  );
}

type Op = { type: 'eq' | 'add' | 'del'; text: string };

function tokenize(s: string): string[] {
  // Split into words and the whitespace/punct between them (kept).
  return s.split(/(\s+|[.,;:!?])/g).filter((t) => t.length > 0);
}

function diffWords(before: string, after: string): Op[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  // LCS table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const out: Op[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.unshift({ type: 'eq', text: a[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.unshift({ type: 'del', text: a[i - 1] });
      i--;
    } else {
      out.unshift({ type: 'add', text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) { out.unshift({ type: 'del', text: a[i - 1] }); i--; }
  while (j > 0) { out.unshift({ type: 'add', text: b[j - 1] }); j--; }
  // Merge adjacent ops of same type for cleaner DOM.
  const merged: Op[] = [];
  for (const op of out) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else merged.push({ ...op });
  }
  return merged;
}

export default Diff;
