import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { activeLocale } from '../lib/utils';

// ----------------------------------------------------------------------
// Cmd+K command palette.
// Replaces the legacy GlobalSearch. Sections (in priority order):
//   1. Quick actions  — Log session, Polish last, Add student, Invoice
//   2. Jump to        — Today's sessions, Polish queue, Unbilled, etc.
//   3. Search results — students, sessions, invoices, lesson plans
// Recents shown when input is empty.
// ----------------------------------------------------------------------

type SearchResults = {
  students: Array<{ id: string; name: string; year_level: string | null; subject: string | null }>;
  sessions: Array<{ id: string; scheduled_at: string; subject: string | null; topic: string | null; status: string; student_id: string; student_name: string }>;
  invoices: Array<{ id: string; number: string; status: string; total_cents: number; issued_on: string; student_name: string }>;
  lesson_plans: Array<{ id: string; subject: string; topic: string; year_level: string | null; student_name: string | null }>;
};

const EMPTY_SEARCH: SearchResults = { students: [], sessions: [], invoices: [], lesson_plans: [] };

type Item = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  shortcut?: string;
  href?: string;
  onSelect?: () => void;
};

const RECENTS_KEY = 'crestio.cmdk.recents';
const RECENT_CMDS_KEY = 'crestio.cmdk.recent_commands';
const MAX_RECENTS = 5;
const MAX_RECENT_CMDS = 6;

function loadRecents(): Item[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(item: Item) {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadRecents().filter((i) => i.id !== item.id);
    const next = [{ ...item, group: 'Recent' }, ...existing].slice(0, MAX_RECENTS);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

type RecentCmd = { label: string; href?: string; onId?: string };
function loadRecentCmds(): RecentCmd[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_CMDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveRecentCmd(item: Item) {
  if (typeof window === 'undefined') return;
  if (!item.label.startsWith('Go to') && item.group !== 'Quick actions' && item.group !== 'Jump to') return;
  try {
    const existing = loadRecentCmds().filter((c) => c.label !== item.label);
    const next: RecentCmd[] = [{ label: item.label, href: item.href }, ...existing].slice(0, MAX_RECENT_CMDS);
    window.localStorage.setItem(RECENT_CMDS_KEY, JSON.stringify(next));
  } catch { /* */ }
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_SEARCH);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K and event-based open hooks.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
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
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // Reset on route change.
  useEffect(() => {
    const reset = () => { setOpen(false); setQuery(''); setResults(EMPTY_SEARCH); };
    router.events.on('routeChangeStart', reset);
    return () => router.events.off('routeChangeStart', reset);
  }, [router.events]);

  // Debounced search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults(EMPTY_SEARCH);
      setLoading(false);
      return;
    }
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
    }, 200);
  }, [query]);

  // Static items: Quick actions + Jump to + Go to (settings/help/etc).
  const staticItems: Item[] = useMemo(() => [
    // Quick actions
    { id: 'qa-log',       group: 'Quick actions', label: 'Log session',           shortcut: 'N',  onSelect: () => window.dispatchEvent(new CustomEvent('crestio:open-inline-composer')) },
    { id: 'qa-new',       group: 'Quick actions', label: 'New session (full form)', shortcut: '⌘⇧N', onSelect: () => router.push('/app/sessions/new') },
    { id: 'qa-polish',    group: 'Quick actions', label: 'Polish last session',                  onSelect: () => router.push('/app/sessions/polish-queue') },
    { id: 'qa-student',   group: 'Quick actions', label: 'Add student',                          onSelect: () => router.push('/app/students/new') },
    { id: 'qa-invoice',   group: 'Quick actions', label: 'Create invoice',                       onSelect: () => router.push('/app/invoices/new') },
    { id: 'qa-send',      group: 'Quick actions', label: 'Send invoice to parent',               onSelect: () => router.push('/app/invoices') },

    // Jump to
    { id: 'j-today',      group: 'Jump to', label: "Today's sessions",        href: '/app/sessions?tab=today' },
    { id: 'j-polish',     group: 'Jump to', label: 'Polish queue',            href: '/app/sessions/polish-queue' },
    { id: 'j-unbilled',   group: 'Jump to', label: 'Unbilled sessions',       href: '/app/money?tab=invoices&filter=unbilled' },
    { id: 'j-overdue',    group: 'Jump to', label: 'Overdue invoices',        href: '/app/money?tab=invoices&filter=overdue' },
    { id: 'j-billing',    group: 'Jump to', label: 'Settings → Billing',      href: '/app/settings/billing' },

    // Go to
    { id: 'g-settings',   group: 'Go to', label: 'Go to settings',            href: '/app/settings/account' },
    { id: 'g-billing',    group: 'Go to', label: 'Go to billing',             href: '/app/settings/billing' },
    { id: 'g-shortcuts',  group: 'Go to', label: 'Go to keyboard shortcuts',  onSelect: () => window.dispatchEvent(new CustomEvent('crestio:open-shortcuts')) },
    { id: 'g-changelog',  group: 'Go to', label: 'Go to changelog',           href: '/changelog' },
    { id: 'g-support',    group: 'Go to', label: 'Go to support',             onSelect: () => window.dispatchEvent(new CustomEvent('crestio:open-support')) },
  ], [router]);

  // Build full ordered list of items based on query.
  const items: Item[] = useMemo(() => {
    if (query.trim().length === 0) {
      const recents = loadRecents();
      return [...recents, ...staticItems];
    }

    const trimmed = query.trim();

    // Math: "= 1 + 2" → calculator
    if (trimmed.startsWith('=')) {
      const expr = trimmed.slice(1).trim();
      const evaled = evalSafe(expr);
      if (evaled != null) {
        return [{
          id: 'math-result',
          group: 'Math',
          label: `${expr} = ${evaled}`,
          hint: 'Press ↵ to copy',
          onSelect: () => {
            navigator.clipboard?.writeText(String(evaled)).catch(() => undefined);
          },
        }];
      }
      return [{
        id: 'math-empty',
        group: 'Math',
        label: 'Type an expression after =',
      } as Item];
    }

    // Natural language: "schedule diego tomorrow 4pm" → opens inline composer
    if (/^(schedule|log|book|new|add)\s+/i.test(trimmed)) {
      return [{
        id: 'nl-schedule',
        group: 'Quick action',
        label: `Open composer with "${trimmed}"`,
        onSelect: () => {
          window.dispatchEvent(new CustomEvent('crestio:open-inline-composer'));
          // Best-effort: deliver the seed text to the composer via a follow-up event.
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('crestio:seed-inline-composer', { detail: trimmed }));
          }, 80);
        },
      } as Item, ...staticItems.filter((s) => s.label.toLowerCase().includes('log session'))];
    }

    // Power-user prefix: ":s diego" → only Students. ":i" → only Invoices.
    // Supported: :s students, :se sessions, :i invoices, :l lesson plans,
    //            :h households, :f files, :m messages, :t templates, :p parents.
    let typeFilter: 'students' | 'sessions' | 'invoices' | 'lesson_plans' | null = null;
    let altRoute: string | null = null;
    let q = trimmed.toLowerCase();
    if (trimmed.startsWith(':')) {
      const m = /^:(\w+)\s*(.*)$/.exec(trimmed);
      if (m) {
        const prefix = m[1].toLowerCase();
        if (prefix.startsWith('se')) typeFilter = 'sessions';
        else if (prefix.startsWith('s')) typeFilter = 'students';
        else if (prefix.startsWith('i')) typeFilter = 'invoices';
        else if (prefix.startsWith('l') || prefix.startsWith('lp')) typeFilter = 'lesson_plans';
        else if (prefix.startsWith('h')) altRoute = '/app/households';
        else if (prefix.startsWith('f')) altRoute = '/app/files';
        else if (prefix.startsWith('m')) altRoute = '/app/messages';
        else if (prefix.startsWith('t')) altRoute = '/app/templates';
        else if (prefix.startsWith('p')) altRoute = '/app/parents';
        q = (m[2] ?? '').trim().toLowerCase();
      }
    }
    if (altRoute) {
      return [{
        id: 'altroute',
        group: 'Jump to',
        label: `Go to ${altRoute.replace('/app/', '')}`,
        href: altRoute,
      } as Item];
    }

    const filteredStatic = typeFilter
      ? []
      : staticItems.filter((i) =>
          i.label.toLowerCase().includes(q) || (i.hint?.toLowerCase().includes(q) ?? false),
        );

    const searchItems: Item[] = [];
    if (typeFilter && q.length === 0) {
      return [...filteredStatic, { id: 'hint', group: 'Type to filter', label: 'Keep typing to search…' } as Item];
    }
    if (!typeFilter || typeFilter === 'students') {
      results.students.forEach((s) => {
        searchItems.push({
          id: `s-${s.id}`,
          group: 'Students',
          label: s.name,
          hint: [s.year_level ? `Year ${s.year_level}` : null, s.subject].filter(Boolean).join(' · '),
          href: `/app/students/${s.id}`,
        });
      });
    }
    if (!typeFilter || typeFilter === 'sessions') {
      results.sessions.forEach((s) => {
        searchItems.push({
          id: `ss-${s.id}`,
          group: 'Sessions',
          label: `${s.student_name} · ${new Date(s.scheduled_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}`,
          hint: [s.subject, s.topic].filter(Boolean).join(' · ') || s.status,
          href: `/app/sessions/${s.id}`,
        });
      });
    }
    if (!typeFilter || typeFilter === 'invoices') {
      results.invoices.forEach((i) => {
        searchItems.push({
          id: `i-${i.id}`,
          group: 'Invoices',
          label: `${i.number} · ${i.student_name}`,
          hint: `${formatCents(i.total_cents)} · ${i.status}`,
          href: `/app/invoices/${i.id}`,
        });
      });
    }
    if (!typeFilter || typeFilter === 'lesson_plans') {
      results.lesson_plans.forEach((p) => {
        searchItems.push({
          id: `lp-${p.id}`,
          group: 'Lesson plans',
          label: `${p.subject} · ${p.topic}`,
          hint: [p.student_name, p.year_level ? `Year ${p.year_level}` : null].filter(Boolean).join(' · '),
          href: `/app/lesson-plans`,
        });
      });
    }

    return [...filteredStatic, ...searchItems];
  }, [query, results, staticItems]);

  // Group items in render order while preserving the global index for keyboard nav.
  const grouped = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Array<{ item: Item; index: number }>>();
    items.forEach((item, index) => {
      if (!map.has(item.group)) {
        map.set(item.group, []);
        order.push(item.group);
      }
      map.get(item.group)!.push({ item, index });
    });
    return order.map((g) => ({ group: g, entries: map.get(g)! }));
  }, [items]);

  function runItem(item: Item, mode: 'open' | 'newTab' | 'copyLink' = 'open') {
    saveRecent(item);
    saveRecentCmd(item);
    if (mode === 'copyLink' && item.href) {
      const fullHref = `${window.location.origin}${item.href}`;
      navigator.clipboard?.writeText(fullHref).catch(() => undefined);
      setOpen(false);
      return;
    }
    if (mode === 'newTab' && item.href) {
      window.open(item.href, '_blank');
      setOpen(false);
      return;
    }
    setOpen(false);
    if (item.onSelect) {
      item.onSelect();
    } else if (item.href) {
      router.push(item.href);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[active];
      if (target) {
        const mode = (e.metaKey || e.ctrlKey) ? 'newTab' : (e.altKey ? 'copyLink' : 'open');
        runItem(target, mode);
      }
    }
  }

  if (!open) return null;

  const totalHits = items.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[70] bg-ink/40"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-[600px] mx-auto mt-16 md:mt-24 bg-surface border border-rule rounded-[12px] shadow-lift overflow-hidden animate-palette-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="border-b border-rule px-4 py-3 flex items-center gap-3 relative cmdk-input-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-soft shrink-0">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            placeholder="Search anything… (or type = for math)"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-soft"
          />
          <kbd className="text-2xs font-mono text-ink-soft border border-rule rounded px-1.5 py-0.5">Esc</kbd>
          {!loading && totalHits > 0 && query.trim().length > 0 && (
            <span aria-hidden="true" className="absolute left-3 right-3 bottom-0 h-0.5 bg-forest cmdk-underline-anim origin-left" />
          )}
        </div>

        {query.trim().length === 0 && <RecentCommandsStrip onPick={(href) => { setOpen(false); router.push(href); }} />}

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {totalHits === 0 ? (
            <div className="px-4 py-10 text-sm text-ink-muted text-center">
              {loading ? 'Searching…' : 'No matches.'}
            </div>
          ) : (
            grouped.map(({ group, entries }) => (
              <div key={group}>
                <div className="px-4 pt-3 pb-1 text-2xs uppercase tracking-widest text-ink-soft font-medium">
                  {group}
                </div>
                <ul role="listbox">
                  {entries.map(({ item, index }) => {
                    const isActive = index === active;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setActive(index)}
                          onClick={() => runItem(item)}
                          aria-selected={isActive}
                          className={[
                            'w-full text-left px-4 py-2 flex items-center justify-between gap-3 text-sm transition-colors duration-100',
                            isActive ? 'bg-ruleSoft' : 'hover:bg-ruleSoft/60',
                          ].join(' ')}
                        >
                          <div className="min-w-0">
                            <div className="text-ink truncate">{item.label}</div>
                            {item.hint && (
                              <div className="text-xs text-ink-muted truncate">{item.hint}</div>
                            )}
                          </div>
                          <span className="text-ink-soft shrink-0 flex items-center gap-2">
                            {item.shortcut && (
                              <kbd className="text-2xs font-mono border border-rule rounded px-1.5 py-0.5">{item.shortcut}</kbd>
                            )}
                            {isActive ? (
                              <span className="text-2xs font-mono">
                                <span title="Open">↵</span>
                                {item.href && <> · <span title="Open in new tab">⌘↵</span></>}
                                {item.href && <> · <span title="Copy link">⌥↵</span></>}
                              </span>
                            ) : (
                              <span aria-hidden="true">↵</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-rule px-4 py-2 text-2xs text-ink-soft flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-3">
            <span><kbd className="font-mono border border-rule rounded px-1">↑↓</kbd> to navigate</span>
            <span><kbd className="font-mono border border-rule rounded px-1">↵</kbd> to open</span>
            <span><kbd className="font-mono border border-rule rounded px-1">⎋</kbd> to close</span>
          </span>
          <span className="hidden md:inline">
            <span className="text-ink-muted">tip:</span>{' '}
            type <kbd className="font-mono border border-rule rounded px-1">:s</kbd> students,{' '}
            <kbd className="font-mono border border-rule rounded px-1">:i</kbd> invoices,{' '}
            <kbd className="font-mono border border-rule rounded px-1">:se</kbd> sessions
          </span>
        </div>
      </div>
    </div>
  );
}

function formatCents(c: number): string {
  return new Intl.NumberFormat(activeLocale(), { style: 'currency', currency: 'AUD',
    maximumFractionDigits: c % 100 === 0 ? 0 : 2 }).format(c / 100);
}

// Safe expression evaluator. Allow only digits, operators, parens, decimal,
// whitespace, and the % sign. Reject anything else.
function evalSafe(expr: string): string | null {
  if (!expr || !/^[\d+\-*/%() .]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr.replace(/%/g, '/100')})`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) return null;
    // Round to 4 decimal places.
    return String(Math.round(result * 10_000) / 10_000);
  } catch { return null; }
}

function RecentCommandsStrip({ onPick }: { onPick: (href: string) => void }) {
  const recents = loadRecentCmds();
  if (recents.length === 0) return null;
  return (
    <div className="px-4 py-2 border-b border-rule flex items-center gap-1.5 flex-wrap">
      <span className="text-2xs uppercase tracking-widest text-ink-soft mr-1">Recent</span>
      {recents.map((r) => (
        <button
          key={r.label}
          type="button"
          onClick={() => r.href && onPick(r.href)}
          className="text-[11px] px-2 py-0.5 rounded-full bg-ruleSoft text-ink-muted hover:bg-ruleSoft/80 hover:text-ink transition-colors duration-100"
        >
          {r.label.replace(/^Go to /, '')}
        </button>
      ))}
    </div>
  );
}

export default CommandPalette;
