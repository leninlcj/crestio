import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Command } from 'cmdk';
import { supabase } from '../lib/supabase';
import { activeLocale } from '../lib/utils';
import {
  parseQuickAction,
  describeAction,
  actionToHref,
  type ParsedAction,
  type StudentLite,
} from '../lib/cmdkGrammar';

// ---------------------------------------------------------------------------
// Cmd+K command palette (ph7d).
//
// - Built on the `cmdk` library so we get accessible roving focus, ARIA
//   roles, and fuzzy matching for free.
// - Two layers of intelligence:
//     1) A grammar parser ("log session zane 1h") that emits a top-ranked
//        result with a deep link to the prefilled form.
//     2) A debounced server search that fans out across students, sessions,
//        invoices, and other entities.
// - Empty state shows Recent (last 5 commands) + Quick actions.
// - Students are prefetched + cached for 5 minutes so the grammar parser is
//   instant on every subsequent open.
// ---------------------------------------------------------------------------

type SearchResults = {
  students: Array<{ id: string; name: string; year_level: string | null; subject: string | null }>;
  parents: Array<{ id: string; name: string | null; email: string | null }>;
  tutors: Array<{ id: string; name: string; email: string | null }>;
  sessions: Array<{ id: string; scheduled_at: string; subject: string | null; topic: string | null; status: string; student_id: string; student_name: string }>;
  invoices: Array<{ id: string; number: string; status: string; total_cents: number; issued_on: string; student_name: string }>;
  lesson_plans: Array<{ id: string; subject: string; topic: string; year_level: string | null; student_name: string | null }>;
  files: Array<{ id: string; name: string; mime_type: string; created_at: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
};

const EMPTY_SEARCH: SearchResults = {
  students: [], parents: [], tutors: [], sessions: [], invoices: [],
  lesson_plans: [], files: [], tags: [],
};

// Per-user keyed recents — rotated on sign-in so two operators on the same
// browser don't see each other's history.
const RECENTS_KEY_PREFIX = 'crestio.cmdk.recents.v2';
const MAX_RECENTS = 5;
const STUDENTS_CACHE_KEY = 'crestio.cmdk.students_cache.v1';
const STUDENTS_CACHE_TTL_MS = 5 * 60_000; // 5 minutes per spec

type RecentEntry = { id: string; label: string; href?: string; group?: string };

function recentsKey(userId: string | null): string {
  return `${RECENTS_KEY_PREFIX}:${userId ?? 'anon'}`;
}

function loadRecents(userId: string | null): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(recentsKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecent(userId: string | null, entry: RecentEntry) {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadRecents(userId).filter((i) => i.label !== entry.label);
    const next = [entry, ...existing].slice(0, MAX_RECENTS);
    window.localStorage.setItem(recentsKey(userId), JSON.stringify(next));
  } catch { /* ignore */ }
}

function readStudentsCache(): { students: StudentLite[]; at: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STUDENTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || !Array.isArray(parsed.students)) return null;
    if (Date.now() - parsed.at > STUDENTS_CACHE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeStudentsCache(students: StudentLite[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STUDENTS_CACHE_KEY, JSON.stringify({ students, at: Date.now() }));
  } catch { /* ignore */ }
}

// Sign-out hook lives on the supabase client. When the auth state flips to
// signed-out we clear the recents + cache so the next user doesn't see them.
function useClearRecentsOnSignOut() {
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && typeof window !== 'undefined') {
        try {
          for (const key of Object.keys(window.localStorage)) {
            if (key.startsWith(RECENTS_KEY_PREFIX)) window.localStorage.removeItem(key);
          }
          window.localStorage.removeItem(STUDENTS_CACHE_KEY);
        } catch { /* */ }
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_SEARCH);
  const [searching, setSearching] = useState(false);
  const [students, setStudents] = useState<StudentLite[]>(() => readStudentsCache()?.students ?? []);
  const [userId, setUserId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useClearRecentsOnSignOut();

  // Resolve the current user's id once for recents-key scoping.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) setUserId(session?.user?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  // Cmd+K toggle + custom event hook (the header search input fires this).
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

  // Reset on route change.
  useEffect(() => {
    const reset = () => { setOpen(false); setQuery(''); setResults(EMPTY_SEARCH); };
    router.events.on('routeChangeStart', reset);
    return () => router.events.off('routeChangeStart', reset);
  }, [router.events]);

  // Prefetch the students list on first open per session, then cache for
  // 5 minutes — keeps subsequent opens instant for the grammar parser.
  useEffect(() => {
    if (!open) return;
    if (students.length > 0) return;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      const { data, error } = await supabase
        .from('students')
        .select('id, name')
        .is('archived', false)
        .order('name', { ascending: true })
        .limit(1000);
      if (cancelled || error) return;
      const list = ((data ?? []) as any[]).map((s) => ({ id: s.id, name: s.name }));
      setStudents(list);
      writeStudentsCache(list);
    })();
    return () => { cancelled = true; };
  }, [open, students.length]);

  // Debounced server search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults(EMPTY_SEARCH);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setSearching(false); return; }
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 200);
  }, [query]);

  const parsed = useMemo<ParsedAction>(() => {
    return parseQuickAction(query, students);
  }, [query, students]);

  const recents = useMemo(() => loadRecents(userId), [userId, open]);

  function executeRecent(r: RecentEntry) {
    if (r.href) {
      saveRecent(userId, r);
      setOpen(false);
      router.push(r.href);
    }
  }

  function executeAction(a: ParsedAction) {
    const href = actionToHref(a);
    if (!href) return;
    saveRecent(userId, {
      id: `action:${a.kind}:${'studentId' in a ? a.studentId ?? '' : ''}`,
      label: describeAction(a),
      href,
      group: 'Quick actions',
    });
    setOpen(false);
    router.push(href);
  }

  function executeNavigation(href: string, label: string) {
    saveRecent(userId, { id: `nav:${href}`, label, href, group: 'Pages' });
    setOpen(false);
    router.push(href);
  }

  // Students that match the current query — used for the top "Students"
  // group when the grammar parser doesn't lock in a single result yet.
  const studentMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const list: Array<{ student: StudentLite; score: number }> = [];
    for (const s of students) {
      if (!s.name) continue;
      const lower = s.name.toLowerCase();
      if (lower === q) list.push({ student: s, score: 100 });
      else if (lower.startsWith(q)) list.push({ student: s, score: 80 });
      else if (lower.includes(q)) list.push({ student: s, score: 60 });
      else {
        const tokens = lower.split(/\s+/);
        if (tokens.some((t) => t.startsWith(q))) list.push({ student: s, score: 40 });
      }
    }
    list.sort((a, b) => b.score - a.score);
    return list.slice(0, 5).map((x) => x.student);
  }, [query, students]);

  if (!open) return null;

  const hasParsed = parsed.kind !== 'no_match';
  const querying = query.trim().length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[70] bg-ink/40 cmdk-backdrop"
      data-test-id="cmdk-backdrop"
      onClick={() => setOpen(false)}
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-[640px] mx-auto mt-16 md:mt-24 bg-surface border border-rule rounded-[12px] shadow-lift overflow-hidden animate-palette-in"
        onClick={(e) => e.stopPropagation()}
        data-test-id="cmdk-modal"
      >
        <Command
          shouldFilter={false}
          loop
          label="Command palette"
          className="cmdk-root"
        >
          <div className="border-b border-rule px-4 py-3 flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-ink-soft shrink-0">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder='Search anything — try "log session zane 1h"'
              className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-soft"
              data-test-id="cmdk-input"
            />
            <kbd className="text-2xs font-mono text-ink-soft border border-rule rounded px-1.5 py-0.5">Esc</kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto py-1" data-test-id="cmdk-list">
            <Command.Empty className="px-4 py-10 text-sm text-ink-muted text-center" data-test-id="cmdk-empty">
              {searching ? 'Searching…' : 'No matches.'}
            </Command.Empty>

            {/* Empty state: recents + quick action defaults. */}
            {!querying && (
              <>
                {recents.length > 0 && (
                  <Command.Group heading="Recent" className="cmdk-group" data-test-id="cmdk-group-recent">
                    {recents.map((r) => (
                      <Command.Item
                        key={r.id}
                        value={`recent:${r.label}`}
                        onSelect={() => executeRecent(r)}
                        className="cmdk-item"
                        data-test-id="cmdk-recent"
                      >
                        <PaletteRow label={r.label} hint={r.group} />
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                <Command.Group heading="Quick actions" className="cmdk-group" data-test-id="cmdk-group-quick">
                  {QUICK_DEFAULTS.map((q) => (
                    <Command.Item
                      key={q.id}
                      value={`quick:${q.label}`}
                      onSelect={() => executeNavigation(q.href, q.label)}
                      className="cmdk-item"
                      data-test-id="cmdk-quick-action"
                    >
                      <PaletteRow label={q.label} hint={q.hint} shortcut={q.shortcut} />
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            )}

            {/* Typed state: parsed action first, then students, sessions, invoices, pages. */}
            {querying && hasParsed && (
              <Command.Group heading="Run" className="cmdk-group" data-test-id="cmdk-group-action">
                <Command.Item
                  value={`action:${parsed.kind}:${'studentName' in parsed ? parsed.studentName ?? '' : ''}`}
                  onSelect={() => executeAction(parsed)}
                  className="cmdk-item cmdk-item-action"
                  data-test-id="cmdk-parsed-action"
                >
                  <PaletteRow
                    label={describeAction(parsed)}
                    hint={parsed.kind === 'log_session' ? 'Pre-fills the new-session form' : undefined}
                    shortcut="↵"
                  />
                </Command.Item>
              </Command.Group>
            )}

            {querying && studentMatches.length > 0 && (
              <Command.Group heading="Students" className="cmdk-group" data-test-id="cmdk-group-students">
                {studentMatches.map((s) => (
                  <Command.Item
                    key={`student:${s.id}`}
                    value={`student:${s.name}`}
                    onSelect={() => executeNavigation(`/app/students/${s.id}`, s.name)}
                    className="cmdk-item"
                    data-test-id="cmdk-student"
                  >
                    <PaletteRow label={s.name} hint="Open profile" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {querying && results.sessions.length > 0 && (
              <Command.Group heading="Sessions" className="cmdk-group" data-test-id="cmdk-group-sessions">
                {results.sessions.slice(0, 5).map((s) => (
                  <Command.Item
                    key={`session:${s.id}`}
                    value={`session:${s.id}`}
                    onSelect={() => executeNavigation(
                      `/app/sessions/${s.id}`,
                      `${s.student_name} — ${formatSessionDate(s.scheduled_at)}`,
                    )}
                    className="cmdk-item"
                    data-test-id="cmdk-session"
                  >
                    <PaletteRow
                      label={`${s.student_name} · ${formatSessionDate(s.scheduled_at)}`}
                      hint={[s.subject, s.topic].filter(Boolean).join(' · ') || s.status}
                    />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {querying && results.invoices.length > 0 && (
              <Command.Group heading="Invoices" className="cmdk-group" data-test-id="cmdk-group-invoices">
                {results.invoices.slice(0, 5).map((i) => (
                  <Command.Item
                    key={`invoice:${i.id}`}
                    value={`invoice:${i.id}`}
                    onSelect={() => executeNavigation(
                      `/app/invoices/${i.id}`,
                      `Invoice ${i.number} · ${i.student_name}`,
                    )}
                    className="cmdk-item"
                    data-test-id="cmdk-invoice"
                  >
                    <PaletteRow
                      label={`${i.number} · ${i.student_name}`}
                      hint={`${formatCents(i.total_cents)} · ${i.status}`}
                    />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {querying && (
              <Command.Group heading="Pages" className="cmdk-group" data-test-id="cmdk-group-pages">
                {PAGE_TARGETS
                  .filter((p) => p.label.toLowerCase().includes(query.trim().toLowerCase())
                              || p.aliases?.some((a) => a.toLowerCase().includes(query.trim().toLowerCase())))
                  .slice(0, 5)
                  .map((p) => (
                    <Command.Item
                      key={`page:${p.href}`}
                      value={`page:${p.label}`}
                      onSelect={() => executeNavigation(p.href, p.label)}
                      className="cmdk-item"
                      data-test-id="cmdk-page"
                    >
                      <PaletteRow label={p.label} hint={p.hint} />
                    </Command.Item>
                  ))}
              </Command.Group>
            )}

            {querying && results.parents.length > 0 && (
              <Command.Group heading="Parents" className="cmdk-group" data-test-id="cmdk-group-parents">
                {results.parents.slice(0, 5).map((p) => (
                  <Command.Item
                    key={`parent:${p.id}`}
                    value={`parent:${p.id}`}
                    onSelect={() => executeNavigation('/app/parents', p.name ?? p.email ?? 'Parent')}
                    className="cmdk-item"
                    data-test-id="cmdk-parent"
                  >
                    <PaletteRow label={p.name ?? p.email ?? 'Parent'} hint={p.email ?? undefined} />
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="border-t border-rule px-4 py-2 text-2xs text-ink-soft flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-center gap-3">
              <span><kbd className="font-mono border border-rule rounded px-1">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono border border-rule rounded px-1">↵</kbd> open</span>
              <span><kbd className="font-mono border border-rule rounded px-1">⎋</kbd> close</span>
            </span>
            <span className="hidden md:inline text-ink-muted">
              try <kbd className="font-mono border border-rule rounded px-1">log session zane 1h</kbd>
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

function PaletteRow({ label, hint, shortcut }: { label: string; hint?: string; shortcut?: string }) {
  return (
    <div className="w-full flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-ink truncate">{label}</div>
        {hint && <div className="text-xs text-ink-muted truncate">{hint}</div>}
      </div>
      {shortcut && (
        <kbd className="text-2xs font-mono text-ink-soft border border-rule rounded px-1.5 py-0.5 shrink-0">
          {shortcut}
        </kbd>
      )}
    </div>
  );
}

const QUICK_DEFAULTS: Array<{ id: string; label: string; href: string; hint?: string; shortcut?: string }> = [
  { id: 'q-log',        label: 'Log session',         href: '/app/sessions/new',          hint: 'Pre-fills today',  shortcut: 'N' },
  { id: 'q-add-stud',   label: 'Add student',         href: '/app/students/new',          hint: 'New student form' },
  { id: 'q-new-inv',    label: 'New invoice',         href: '/app/invoices/new',          hint: 'Single-student invoice' },
  { id: 'q-add-par',    label: 'Add parent',          href: '/app/students/new?focus=parent', hint: 'Add parent contact' },
  { id: 'q-polish',     label: 'Open polish queue',   href: '/app/sessions/polish-queue', hint: 'Sessions waiting on notes' },
  { id: 'q-today',      label: "Today's sessions",    href: '/app/sessions?tab=today' },
];

const PAGE_TARGETS: Array<{ label: string; href: string; hint?: string; aliases?: string[] }> = [
  { label: 'Home',                         href: '/app',                       hint: 'Morning briefing',     aliases: ['dashboard', 'briefing'] },
  { label: 'Sessions — Today',             href: '/app/sessions?tab=today',    hint: 'Today timeline',       aliases: ['today', 'sessions today'] },
  { label: 'Sessions — Upcoming',          href: '/app/sessions?tab=upcoming', hint: 'This week + later',    aliases: ['upcoming', 'this week', 'tomorrow'] },
  { label: 'Sessions — Past',              href: '/app/sessions?tab=past',     hint: 'Logged sessions',      aliases: ['past', 'history'] },
  { label: 'Sessions — Polish queue',      href: '/app/sessions/polish-queue', hint: 'Notes to polish',      aliases: ['polish', 'queue'] },
  { label: 'Sessions — Templates',         href: '/app/templates',             hint: 'Recurring schedules',  aliases: ['recurring', 'template'] },
  { label: 'People — Students',            href: '/app/students',              hint: 'All students',         aliases: ['students', 'roster'] },
  { label: 'People — Households',          href: '/app/households',            hint: 'Households / families', aliases: ['households', 'families'] },
  { label: 'People — Parents',             href: '/app/parents',               hint: 'Parent contacts',      aliases: ['parents'] },
  { label: 'Money — Invoices',             href: '/app/invoices',              hint: 'All invoices',         aliases: ['invoices', 'money'] },
  { label: 'Money — Batch invoice',        href: '/app/invoices/batch',        hint: 'Bill multiple parents at once', aliases: ['batch', 'bill'] },
  { label: 'Resources — Lesson plans',     href: '/app/lesson-plans',          hint: 'AI lesson plans',      aliases: ['lesson plans', 'lessons', 'plans'] },
  { label: 'Resources — Files',            href: '/app/files',                 hint: 'Uploaded files',       aliases: ['files'] },
  { label: 'Messages',                     href: '/app/messages',              hint: 'Parent threads',       aliases: ['messages', 'inbox'] },
  { label: 'Settings',                     href: '/app/settings/account',      hint: 'Account & billing',    aliases: ['settings', 'preferences'] },
  { label: 'Settings — Trash',             href: '/app/settings/trash',        hint: 'Archived & deleted items', aliases: ['trash', 'archived'] },
];

function formatCents(c: number): string {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency', currency: 'AUD',
    maximumFractionDigits: c % 100 === 0 ? 0 : 2,
  }).format(c / 100);
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });
}

export default CommandPalette;
