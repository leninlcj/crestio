import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';

type Parent = { id: string; name: string | null; email: string | null; is_primary: boolean };
type StudentLite = { id: string; name: string };
type Household = {
  id: string;
  display_name: string;
  billing_email: string | null;
  notes: string | null;
  archived_at: string | null;
  parents: Parent[];
  students: StudentLite[];
  primary_parent: Parent | null;
  parent_count: number;
  student_count: number;
};

type Suggestion = {
  suggestion_key: string;
  action: 'add_to_existing' | 'create_new';
  parents: Array<{ id: string; name: string | null; email: string | null }>;
  students: Array<{ id: string; name: string; current_household_id: string | null }>;
  suggested_household_id: string | null;
};

function HouseholdsInner() {
  const { membership } = useMembership();
  const isTutor = membership?.role === 'tutor';
  const [loading, setLoading] = useState(true);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    if (!membership) return;
    const key = `crestio.household.dismissed:${membership.organization_id}`;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) setDismissed(JSON.parse(stored));
    } catch {}
  }, [membership]);

  async function reload() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }
    const qs = showArchived ? '?archived=true' : '';
    const [listRes, sugRes] = await Promise.all([
      fetch(`/api/households${qs}`, { headers: { Authorization: `Bearer ${session.access_token}` } }),
      fetch('/api/households/suggestions', { headers: { Authorization: `Bearer ${session.access_token}` } }),
    ]);
    if (listRes.ok) {
      const payload = await listRes.json();
      setHouseholds(payload.households ?? []);
    } else {
      setError('Could not load households.');
    }
    if (sugRes.ok) {
      const payload = await sugRes.json();
      setSuggestions(payload.suggestions ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [showArchived]);

  async function createHousehold(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setCreating(false); return; }
    const res = await fetch('/api/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ display_name: newName.trim() }),
    });
    setCreating(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload?.error ?? 'Could not create household.');
      return;
    }
    setNewName('');
    setNewFormOpen(false);
    await reload();
  }

  function dismissSuggestion(key: string) {
    if (!membership) return;
    const next = [...dismissed, key];
    setDismissed(next);
    try {
      window.localStorage.setItem(
        `crestio.household.dismissed:${membership.organization_id}`,
        JSON.stringify(next),
      );
    } catch {}
  }

  async function acceptSuggestion(s: Suggestion) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/households/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ suggestion_key: s.suggestion_key, action: s.action }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload?.error ?? 'Could not apply suggestion.');
      return;
    }
    await reload();
  }

  const visibleSuggestions = suggestions.filter((s) => !dismissed.includes(s.suggestion_key));

  const filtered = query
    ? households.filter((h) => {
        const hay = [
          h.display_name,
          h.primary_parent?.name,
          h.primary_parent?.email,
          ...h.students.map((s) => s.name),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(query.toLowerCase());
      })
    : households;

  return (
    <Layout
      subtitle="People"
      title="Households"
      actions={
        !isTutor ? (
          <button type="button" onClick={() => setNewFormOpen((v) => !v)} className="btn-primary">
            {newFormOpen ? 'Cancel' : '+ New household'}
          </button>
        ) : undefined
      }
    >
      {newFormOpen && (
        <form onSubmit={createHousehold} className="card p-5 mb-6 max-w-lg space-y-3">
          <div>
            <label className="label">Household name</label>
            <input
              className="input"
              placeholder="e.g. Chen family"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" disabled={creating || !newName.trim()} className="btn-primary text-sm">
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {visibleSuggestions.length > 0 && (
        <div className="mb-6 space-y-2">
          {visibleSuggestions.map((s) => (
            <SuggestionRow
              key={s.suggestion_key}
              s={s}
              onAccept={() => acceptSuggestion(s)}
              onDismiss={() => dismissSuggestion(s.suggestion_key)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
        <input
          type="search"
          placeholder="Search household, parent, student…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input md:max-w-sm"
        />
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <button
            onClick={() => setShowArchived(false)}
            className={(showArchived ? 'btn-ghost ' : 'btn-secondary ') + 'text-xs px-3 py-1.5'}
          >
            Active
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={(!showArchived ? 'btn-ghost ' : 'btn-secondary ') + 'text-xs px-3 py-1.5'}
          >
            Archived
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="font-display text-2xl mb-2 tracking-tightest">
            {showArchived ? 'No archived households' : 'No households yet'}
          </div>
          <p className="text-sm text-ink-muted mb-5 max-w-md mx-auto">
            A household groups siblings under one billing contact. When you link a parent to a student,
            a household is created automatically.
          </p>
          {!isTutor && (
            <button type="button" onClick={() => setNewFormOpen(true)} className="btn-primary">
              Create a household
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((h) => (
            <HouseholdCard key={h.id} h={h} />
          ))}
        </div>
      )}

      {error && <div className="mt-4 text-sm text-claret">{error}</div>}
    </Layout>
  );
}

function SuggestionRow({
  s,
  onAccept,
  onDismiss,
}: {
  s: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const parentLabel = s.parents[0]?.name || s.parents[0]?.email || 'a shared parent';
  const studentNames = s.students.map((x) => x.name);
  return (
    <div className="card p-4 bg-forest-soft border-forest/20 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="text-sm text-forest-ink">
        {studentNames.length === 2
          ? <><strong>{studentNames[0]}</strong> and <strong>{studentNames[1]}</strong></>
          : <><strong>{studentNames.slice(0, -1).join(', ')}</strong>, and <strong>{studentNames[studentNames.length - 1]}</strong></>}
        {' '}share {parentLabel}. Group them{s.action === 'add_to_existing' ? ' into one household' : ' into a new household'}?
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" onClick={onAccept} className="btn-primary text-xs">Group →</button>
        <button type="button" onClick={onDismiss} className="btn-ghost text-xs">Dismiss</button>
      </div>
    </div>
  );
}

function HouseholdCard({ h }: { h: Household }) {
  const kids = h.students.map((s) => s.name);
  const kidsLabel = kids.length === 0 ? 'No students' : kids.join(' · ');
  return (
    <Link href={`/app/households/${h.id}`} className="card p-5 hover:shadow-lift transition-shadow block">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="font-display text-xl tracking-tightest text-ink leading-tight">
          {h.display_name}
        </div>
        {h.archived_at && <span className="badge-neutral text-2xs">Archived</span>}
      </div>
      {h.primary_parent ? (
        <div className="text-2xs text-ink-muted mb-3">
          {h.primary_parent.name ?? 'Parent'}
          {h.primary_parent.email && <span className="block text-ink-soft">{h.primary_parent.email}</span>}
        </div>
      ) : (
        <div className="text-2xs text-claret mb-3">Needs a primary parent</div>
      )}
      <div className="text-sm text-ink-muted">{kidsLabel}</div>
      <div className="text-2xs text-ink-soft mt-3">
        {h.student_count} student{h.student_count === 1 ? '' : 's'} · {h.parent_count} parent{h.parent_count === 1 ? '' : 's'}
      </div>
    </Link>
  );
}

export default function HouseholdsPage() {
  return (
    <AuthGuard>
      <HouseholdsInner />
    </AuthGuard>
  );
}
