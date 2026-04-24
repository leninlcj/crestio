import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('households');
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
      setError(t('common.load_failed'));
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
      setError(payload?.error ?? t('common.create_failed'));
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
      setError(payload?.error ?? t('common.apply_failed'));
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
      subtitle={t('page.subtitle')}
      title={t('page.title')}
      actions={
        !isTutor ? (
          <button type="button" onClick={() => setNewFormOpen((v) => !v)} className="btn-primary">
            {newFormOpen ? t('actions.cancel') : t('actions.new')}
          </button>
        ) : undefined
      }
    >
      {newFormOpen && (
        <form onSubmit={createHousehold} className="card p-5 mb-6 max-w-lg space-y-3">
          <div>
            <label className="label">{t('form.name_label')}</label>
            <input
              className="input"
              placeholder={t('form.name_placeholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" disabled={creating || !newName.trim()} className="btn-primary text-sm">
            {creating ? t('actions.creating') : t('actions.create')}
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
          placeholder={t('filters.search_placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input md:max-w-sm"
        />
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <button
            onClick={() => setShowArchived(false)}
            className={(showArchived ? 'btn-ghost ' : 'btn-secondary ') + 'text-xs px-3 py-1.5'}
          >
            {t('filters.active')}
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={(!showArchived ? 'btn-ghost ' : 'btn-secondary ') + 'text-xs px-3 py-1.5'}
          >
            {t('filters.archived')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="font-display text-2xl mb-2 tracking-tightest">
            {showArchived ? t('empty.archived_none') : t('empty.none')}
          </div>
          <p className="text-sm text-ink-muted mb-5 max-w-md mx-auto">
            {t('empty.description')}
          </p>
          {!isTutor && (
            <button type="button" onClick={() => setNewFormOpen(true)} className="btn-primary">
              {t('empty.create')}
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
  const { t } = useTranslation('households');
  const parentLabel = s.parents[0]?.name || s.parents[0]?.email || t('suggestion.fallback_parent');
  const studentNames = s.students.map((x) => x.name);
  const studentsText =
    studentNames.length === 2
      ? `${studentNames[0]} and ${studentNames[1]}`
      : `${studentNames.slice(0, -1).join(', ')}, and ${studentNames[studentNames.length - 1]}`;
  const question = s.action === 'add_to_existing'
    ? t('suggestion.question_existing', { students: studentsText, parent: parentLabel })
    : t('suggestion.question_new', { students: studentsText, parent: parentLabel });
  return (
    <div className="card p-4 bg-forest-soft border-forest/20 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="text-sm text-forest-ink">{question}</div>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" onClick={onAccept} className="btn-primary text-xs">{t('suggestion.accept')}</button>
        <button type="button" onClick={onDismiss} className="btn-ghost text-xs">{t('suggestion.dismiss')}</button>
      </div>
    </div>
  );
}

function HouseholdCard({ h }: { h: Household }) {
  const { t } = useTranslation('households');
  const kids = h.students.map((s) => s.name);
  const kidsLabel = kids.length === 0 ? t('card.no_students') : kids.join(' · ');
  const studentsLabel = h.student_count === 1
    ? t('card.students_one', { count: h.student_count })
    : t('card.students_other', { count: h.student_count });
  const parentsLabel = h.parent_count === 1
    ? t('card.parents_one', { count: h.parent_count })
    : t('card.parents_other', { count: h.parent_count });
  return (
    <Link href={`/app/households/${h.id}`} className="card p-5 hover:shadow-lift transition-shadow block">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="font-display text-xl tracking-tightest text-ink leading-tight">
          {h.display_name}
        </div>
        {h.archived_at && <span className="badge-neutral text-2xs">{t('card.archived_badge')}</span>}
      </div>
      {h.primary_parent ? (
        <div className="text-2xs text-ink-muted mb-3">
          {h.primary_parent.name ?? t('card.parent_label_fallback')}
          {h.primary_parent.email && <span className="block text-ink-soft">{h.primary_parent.email}</span>}
        </div>
      ) : (
        <div className="text-2xs text-claret mb-3">{t('card.needs_primary')}</div>
      )}
      <div className="text-sm text-ink-muted">{kidsLabel}</div>
      <div className="text-2xs text-ink-soft mt-3">
        {t('card.summary', { students: studentsLabel, parents: parentsLabel })}
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
