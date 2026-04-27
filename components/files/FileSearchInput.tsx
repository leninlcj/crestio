import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
};

export default function FileSearchInput({ value, onChange, placeholder = 'Search files…' }: Props) {
  const [internal, setInternal] = useState(value);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => { setInternal(value); }, [value]);

  // Cmd/Ctrl + F focuses the search input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && ref.current && document.activeElement !== ref.current) {
        // Only intercept if it makes sense — when ref is visible
        const rect = ref.current.getBoundingClientRect();
        if (rect.width > 0) {
          e.preventDefault();
          ref.current.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Debounce: 150ms.
  useEffect(() => {
    const id = setTimeout(() => onChange(internal), 150);
    return () => clearTimeout(id);
  }, [internal, onChange]);

  return (
    <div className="relative">
      <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <input
        ref={ref}
        type="search"
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
        placeholder={placeholder}
        className="input pl-9 h-9 min-h-[36px] text-sm"
      />
      {internal && (
        <button
          type="button"
          onClick={() => { setInternal(''); onChange(''); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 text-2xs text-ink-soft hover:text-ink"
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  try {
    const re = new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) ? <mark key={i} className="bg-amber-soft text-ink-muted not-italic">{p}</mark> : p,
    );
  } catch {
    return text;
  }
}
