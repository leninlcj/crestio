import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { Avatar } from '../../../components/design/Avatar';
import { StatusPill } from '../../../components/design/StatusPill';
import { Skeleton } from '../../../components/design/Skeleton';
import { BulkActionBar } from '../../../components/design/BulkActionBar';
import { Tooltip } from '../../../components/design/Tooltip';
import { useToast } from '../../../components/design/Toast';
import { IconUsers } from '../../../components/design/icons';
import { authFetch } from '../../../lib/authFetch';
import { supabase } from '../../../lib/supabase';
import { formatDate } from '../../../lib/utils';

type ParentRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
  household_names: string[];
  household_ids: string[];
  student_names: string[];
  student_ids: string[];
  invited: boolean;
  accepted: boolean;
};

function ParentsInner() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ParentRow[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/parents/list');
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(payload?.error ?? 'Failed to load parents.');
        setRows((payload.parents ?? []) as ParentRow[]);
      } catch (e: any) {
        if (cancelled) return;
        toast.show({ message: e?.message ?? 'Failed to load parents.', tone: 'error' });
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) =>
      [r.name, r.email, r.phone, r.household_names.join(' '), r.student_names.join(' ')]
        .filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [rows, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function deleteParent(p: ParentRow) {
    // Soft-delete via /api/archive — keeps history (links revoke; no hard
    // delete). Confirmation copy mirrors the student/household flow so the
    // restore window is consistent.
    const ok = window.confirm(
      `Delete ${p.name ?? p.email}? Their session history and invoices stay on file. You can restore them within 30 days from Settings → Archived.`,
    );
    if (!ok) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ entity_type: 'parent', ids: [p.id] }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      toast.show({ message: payload?.error ?? 'Could not delete parent.', tone: 'error' });
      return;
    }
    setRows((rs) => rs.filter((r) => r.id !== p.id));
    toast.show({ message: 'Parent deleted. Restore from Settings → Archived within 30 days.', tone: 'success' });
  }

  async function inviteSelected() {
    const ids = Array.from(selected);
    const targets = rows.filter((r) => ids.includes(r.id) && !r.accepted && !r.invited);
    if (targets.length === 0) {
      toast.show({ message: 'No selected parents to invite.', tone: 'info' });
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    let ok = 0;
    for (const t of targets) {
      const studentId = t.student_ids[0];
      if (!studentId) continue;
      const res = await fetch('/api/parents/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ student_id: studentId, email: t.email }),
      });
      if (res.ok) ok++;
    }
    setSelected(new Set());
    toast.show({ message: `Sent ${ok}/${targets.length} invitations.`, tone: ok === targets.length ? 'success' : 'warning' });
  }

  return (
    <Layout
      title="Parents"
      subtitle="People"
      actions={
        <Link href="/app/import?tab=households" className="btn-secondary text-xs">Import CSV</Link>
      }
    >
      <div className="flex flex-wrap items-center gap-3 mb-4" data-test-id="parents-toolbar">
        <input
          type="search"
          placeholder="Search parents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input md:max-w-sm flex-1 min-w-[200px]"
          data-test-id="parents-search"
        />
      </div>

      {loading ? (
        <div className="card overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5" style={{ minHeight: 48 }}>
              <Skeleton className="w-7 h-7 rounded-full" />
              <div className="flex-1"><Skeleton className="h-3 w-1/3 mb-1" /><Skeleton className="h-2.5 w-1/4" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title="No parents yet."
          description="Add a parent contact when creating a student."
        />
      ) : (
        <div className="card overflow-hidden" data-test-id="parents-list">
          <ul className="divide-y divide-rule">
            {filtered.map((p) => {
              const isSelected = selected.has(p.id);
              const inviteTone =
                p.accepted ? 'success'
                : p.invited ? 'amber'
                : 'neutral';
              const inviteLabel =
                p.accepted ? 'Joined'
                : p.invited ? 'Invited'
                : 'Not invited';
              const studentCount = p.student_ids.length;
              const householdLabel = p.household_names[0] ?? null;
              const moreHouseholds = p.household_names.length > 1
                ? ` +${p.household_names.length - 1}` : '';
              return (
                <li
                  key={p.id}
                  className={[
                    'group cursor-pointer flex items-center gap-3 px-3 py-2.5 hover:bg-ruleSoft/40 transition-colors duration-100',
                    isSelected ? 'bg-forest-soft/30' : '',
                  ].join(' ')}
                  onClick={() => toggle(p.id)}
                  style={{ minHeight: 56 }}
                  data-test-id="parents-row"
                >
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggle(p.id); }}
                    aria-label={isSelected ? 'Deselect' : 'Select'}
                    className={[
                      'shrink-0 w-4 h-4 rounded border grid place-items-center transition-all duration-100',
                      isSelected ? 'bg-forest border-forest text-cream' : 'border-rule opacity-0 group-hover:opacity-100',
                    ].join(' ')}
                  >
                    {isSelected && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <Avatar name={p.name ?? p.email} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ink truncate flex items-center gap-2">
                      {p.name ?? p.email.split('@')[0]}
                      {householdLabel && p.household_ids[0] && (
                        <Link
                          href={`/app/households/${p.household_ids[0]}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-2xs text-forest hover:underline"
                        >
                          · {householdLabel}{moreHouseholds}
                        </Link>
                      )}
                    </div>
                    <div className="text-2xs text-ink-soft truncate flex items-center gap-2">
                      <CopyOnClick value={p.email}>
                        <span className="hover:text-ink transition-colors">{p.email}</span>
                      </CopyOnClick>
                      {p.phone && (
                        <>
                          <span aria-hidden>·</span>
                          <CopyOnClick value={p.phone}>
                            <span className="hover:text-ink transition-colors num tabular">{p.phone}</span>
                          </CopyOnClick>
                        </>
                      )}
                      {studentCount > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">
                            {studentCount} {studentCount === 1 ? 'student' : 'students'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="hidden md:block text-2xs text-ink-soft num tabular shrink-0 text-right">
                    Added {formatDate(p.created_at, { day: 'numeric', month: 'short' })}
                  </div>
                  <StatusPill tone={inviteTone as any}>{inviteLabel}</StatusPill>
                  <RowKebab
                    onDelete={() => deleteParent(p)}
                    parentLabel={p.name ?? p.email}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button
          type="button"
          onClick={inviteSelected}
          className="text-xs font-medium bg-cream text-forest-ink px-2.5 py-1 rounded-full hover:bg-cream/90 transition-colors duration-100"
          data-test-id="parents-bulk-invite"
        >
          Send invite to selected
        </button>
      </BulkActionBar>
    </Layout>
  );
}

function RowKebab({ onDelete, parentLabel }: { onDelete: () => void; parentLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`Actions for ${parentLabel}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="h-7 w-7 grid place-items-center rounded text-ink-muted hover:bg-ruleSoft hover:text-ink transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-8 z-40 min-w-[160px] card border border-rule rounded-md py-1 shadow-lift">
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete(); }}
              className="block w-full text-left px-3 py-1.5 text-sm text-claret hover:bg-claret/8 transition-colors"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CopyOnClick({ value, children }: { value: string; children: React.ReactNode }) {
  const toast = useToast();
  return (
    <Tooltip label={`Copy ${value}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(value);
          toast.show({ message: 'Copied.', tone: 'success' });
        }}
        className="inline-flex items-center gap-1 group/copy"
      >
        {children}
        <svg className="opacity-0 group-hover/copy:opacity-100 transition-opacity duration-100" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>
        </svg>
      </button>
    </Tooltip>
  );
}

export default function ParentsPage() {
  return <AuthGuard><ParentsInner /></AuthGuard>;
}
