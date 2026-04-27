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
import { supabase } from '../../../lib/supabase';
import { formatDate } from '../../../lib/utils';

type ParentRow = {
  id: string;
  name: string | null;
  email: string;
  created_at: string;
  // Derived
  student_names: string[];
  student_ids: string[];
  household_name?: string | null;
  household_id?: string | null;
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
      // Pull links + their student names; group up to a per-parent row.
      const { data: links } = await supabase
        .from('parent_student_links')
        .select('parent_id, student_id, parent:parents!inner(id, name, email, created_at), student:students!inner(id, name, household_id)')
        .is('revoked_at', null)
        .limit(1000);
      // Pull invitations to fold in invitation status (best-effort).
      const { data: invites } = await supabase
        .from('parent_invitations')
        .select('email, accepted_at')
        .limit(500);
      // Pull households for naming (best-effort).
      const { data: households } = await supabase
        .from('households')
        .select('id, display_name')
        .limit(500);

      if (cancelled) return;
      const householdNameById = new Map<string, string>(
        ((households ?? []) as any[]).map((h) => [h.id, h.display_name]),
      );

      const inviteByEmail = new Map<string, { invited: boolean; accepted: boolean }>();
      for (const inv of (invites ?? []) as any[]) {
        const cur = inviteByEmail.get(inv.email) ?? { invited: false, accepted: false };
        cur.invited = true;
        if (inv.accepted_at) cur.accepted = true;
        inviteByEmail.set(inv.email, cur);
      }

      const byParent = new Map<string, ParentRow>();
      for (const l of (links ?? []) as any[]) {
        if (!l.parent) continue;
        const id = l.parent.id;
        if (!byParent.has(id)) {
          const inviteState = inviteByEmail.get(l.parent.email) ?? { invited: false, accepted: false };
          byParent.set(id, {
            id,
            name: l.parent.name ?? null,
            email: l.parent.email,
            created_at: l.parent.created_at,
            student_names: [],
            student_ids: [],
            household_id: l.student?.household_id ?? null,
            household_name: l.student?.household_id ? householdNameById.get(l.student.household_id) ?? null : null,
            invited: inviteState.invited,
            accepted: inviteState.accepted,
          });
        }
        const row = byParent.get(id)!;
        if (l.student && !row.student_ids.includes(l.student.id)) {
          row.student_ids.push(l.student.id);
          row.student_names.push(l.student.name);
        }
      }

      // Sort by accepted desc, then name.
      const list = Array.from(byParent.values()).sort((a, b) => {
        if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
        return (a.name ?? a.email).localeCompare(b.name ?? b.email);
      });
      setRows(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) =>
      [r.name, r.email, r.household_name, r.student_names.join(' ')]
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
      // Use the first student as the anchor for the invite.
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
    <Layout title="Parents" subtitle="People">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="search"
          placeholder="Search parents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input md:max-w-sm flex-1 min-w-[200px]"
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
          description="Parents appear here when you add a parent contact to a student."
        />
      ) : (
        <div className="card overflow-hidden">
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
              return (
                <li
                  key={p.id}
                  className={[
                    'group cursor-pointer flex items-center gap-3 px-3 py-2.5 hover:bg-ruleSoft/40 transition-colors duration-100',
                    isSelected ? 'bg-forest-soft/30' : '',
                  ].join(' ')}
                  onClick={() => toggle(p.id)}
                  style={{ minHeight: 56 }}
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
                      {p.household_name && p.household_id && (
                        <Link
                          href={`/app/households/${p.household_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-2xs text-forest hover:underline"
                        >
                          · {p.household_name}
                        </Link>
                      )}
                    </div>
                    <div className="text-2xs text-ink-soft truncate flex items-center gap-2">
                      <CopyOnClick value={p.email}>
                        <span className="hover:text-ink transition-colors">{p.email}</span>
                      </CopyOnClick>
                      {p.student_names.length > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">
                            {p.student_names.slice(0, 2).join(', ')}
                            {p.student_names.length > 2 ? ` +${p.student_names.length - 2}` : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="hidden md:block text-2xs text-ink-soft num tabular shrink-0 text-right">
                    Added {formatDate(p.created_at, { day: 'numeric', month: 'short' })}
                  </div>
                  <StatusPill tone={inviteTone as any}>{inviteLabel}</StatusPill>
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
        >
          Send invite to selected
        </button>
      </BulkActionBar>
    </Layout>
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
