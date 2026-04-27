import { useEffect, useState } from 'react';
import Link from 'next/link';

type Entry = { version: string; date: string; title: string; bullets: string[] };

type Props = {
  onClose: () => void;
};

// Loaded from /api/changelog so the avatar menu doesn't drag fs into its
// import chain. Cached on first open per session.
export default function WhatsNewSection({ onClose }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/changelog?limit=3')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.entries) setEntries(data.entries);
        else setEntries([]);
      })
      .catch(() => setEntries([]));
  }, []);

  if (entries === null) {
    return (
      <div className="border-b border-rule px-3 py-2.5">
        <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium mb-1.5">What's new</div>
        <div className="text-xs text-ink-soft">Loading…</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-rule px-3 py-2 max-h-72 overflow-y-auto">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-2xs uppercase tracking-widest text-ink-soft font-medium">What's new</div>
        <Link href="/changelog" onClick={onClose} className="text-2xs text-forest hover:underline">All →</Link>
      </div>
      <ul className="space-y-1.5">
        {entries.map((e, i) => (
          <li key={e.version}>
            <button
              type="button"
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              className="w-full text-left rounded px-2 py-1.5 hover:bg-ruleSoft transition-colors"
              aria-expanded={expandedIdx === i}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xs font-medium text-ink truncate">{e.title}</span>
                <span className="text-[10px] uppercase tracking-widest text-ink-soft num tabular shrink-0">{e.version}</span>
              </div>
              <div className="text-[10px] text-ink-soft num tabular">{e.date}</div>
              {expandedIdx === i && e.bullets.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 pl-3">
                  {e.bullets.slice(0, 3).map((b, bi) => (
                    <li key={bi} className="text-[11px] text-ink-muted leading-snug list-disc">{b}</li>
                  ))}
                </ul>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
