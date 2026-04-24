import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

type Results = {
  students: Array<{ id: string; name: string; year_level: string | null; subject: string | null }>;
  sessions: Array<{ id: string; scheduled_at: string; subject: string | null; topic: string | null; status: string; student_id: string; student_name: string }>;
  invoices: Array<{ id: string; number: string; status: string; total_cents: number; issued_on: string; student_name: string }>;
  lesson_plans: Array<{ id: string; subject: string; topic: string; year_level: string | null; student_name: string | null }>;
};

const EMPTY: Results = { students: [], sessions: [], invoices: [], lesson_plans: [] };

// Global search modal. Mounted once (in _app via <AuthenticatedChrome>);
// listens globally for Cmd+K and for the 'crestio:open-search' custom event
// dispatched by the mobile search-icon button.
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener('crestio:open-search', onOpen as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('crestio:open-search', onOpen as EventListener);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // Clear query + results when the route changes (avoids stale state).
  useEffect(() => {
    const reset = () => { setOpen(false); setQuery(''); setResults(EMPTY); };
    router.events.on('routeChangeStart', reset);
    return () => router.events.off('routeChangeStart', reset);
  }, [router.events]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults(EMPTY); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setLoading(false); return; }
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  if (!open) return null;
  const totalHits = results.students.length + results.sessions.length + results.invoices.length + results.lesson_plans.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      className="fixed inset-0 z-[70] bg-ink/40 animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative max-w-xl mx-auto mt-16 md:mt-24 bg-surface border border-rule rounded-lg shadow-lift overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-rule px-4 py-3 flex items-center gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="text-ink-muted shrink-0">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a student, session, or invoice..."
            className="flex-1 bg-transparent outline-none text-base text-ink"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-2xs uppercase tracking-widest text-ink-soft hover:text-ink"
            aria-label="Close search"
          >Esc</button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="p-6 text-sm text-ink-muted text-center">
              Type at least 2 characters.
            </div>
          ) : loading ? (
            <div className="p-6 text-sm text-ink-muted text-center">Searching…</div>
          ) : totalHits === 0 ? (
            <div className="p-6 text-sm text-ink-muted text-center">No matches.</div>
          ) : (
            <div>
              {results.students.length > 0 && (
                <ResultGroup label="Students">
                  {results.students.map((s) => (
                    <ResultLink
                      key={s.id}
                      href={`/app/students/${s.id}`}
                      primary={s.name}
                      secondary={[s.year_level ? `Year ${s.year_level}` : null, s.subject].filter(Boolean).join(' · ')}
                    />
                  ))}
                </ResultGroup>
              )}
              {results.sessions.length > 0 && (
                <ResultGroup label="Sessions">
                  {results.sessions.map((s) => (
                    <ResultLink
                      key={s.id}
                      href={`/app/sessions/${s.id}`}
                      primary={`${s.student_name} · ${new Date(s.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                      secondary={[s.subject, s.topic].filter(Boolean).join(' · ') || s.status}
                    />
                  ))}
                </ResultGroup>
              )}
              {results.invoices.length > 0 && (
                <ResultGroup label="Invoices">
                  {results.invoices.map((i) => (
                    <ResultLink
                      key={i.id}
                      href={`/app/invoices/${i.id}`}
                      primary={`${i.number} · ${i.student_name}`}
                      secondary={`${formatCents(i.total_cents)} · ${i.status}`}
                    />
                  ))}
                </ResultGroup>
              )}
              {results.lesson_plans.length > 0 && (
                <ResultGroup label="Lesson plans">
                  {results.lesson_plans.map((p) => (
                    <ResultLink
                      key={p.id}
                      href={`/app/lesson-plans`}
                      primary={`${p.subject} · ${p.topic}`}
                      secondary={[p.student_name, p.year_level ? `Year ${p.year_level}` : null].filter(Boolean).join(' · ')}
                    />
                  ))}
                </ResultGroup>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-rule px-4 py-2 text-2xs text-ink-soft flex items-center justify-between">
          <span>Press Cmd/Ctrl + K to open anywhere.</span>
          <span>Enter to navigate</span>
        </div>
      </div>
    </div>
  );
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-4 pt-3 pb-1 text-2xs uppercase tracking-widest text-ink-soft">{label}</div>
      <ul>{children}</ul>
    </div>
  );
}

function ResultLink({ href, primary, secondary }: { href: string; primary: string; secondary?: string }) {
  const router = useRouter();
  return (
    <li>
      <button
        type="button"
        onClick={() => router.push(href)}
        className="w-full text-left px-4 py-2.5 hover:bg-ruleSoft/60 flex items-start justify-between gap-3"
      >
        <div className="min-w-0">
          <div className="text-sm text-ink truncate">{primary}</div>
          {secondary && <div className="text-2xs text-ink-muted truncate">{secondary}</div>}
        </div>
        <span className="text-ink-soft shrink-0">→</span>
      </button>
    </li>
  );
}

function formatCents(c: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD',
    maximumFractionDigits: c % 100 === 0 ? 0 : 2 }).format(c / 100);
}

export default GlobalSearch;
