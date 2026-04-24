import { useEffect, useMemo, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { cx, formatCents, formatDateTime, sessionAmount } from '../../../lib/utils';
import { activeLocale } from '../../../lib/utils';

type Parent = {
  membership_id: string;
  parent_id: string;
  name: string | null;
  email: string | null;
  auth_user_id: string | null;
  is_primary: boolean;
  added_at: string;
};
type Student = {
  id: string;
  name: string;
  year_level: string | null;
  subjects: string[] | null;
  hourly_rate_cents: number | null;
};
type SessionRow = {
  id: string;
  student_id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  status: string;
  charge_rate_cents: number | null;
  paid: boolean;
  student: { name: string; household_id: string };
};
type InvoiceRow = {
  id: string;
  number: string;
  issued_on: string;
  due_on: string | null;
  total_cents: number;
  status: string;
  student_id: string;
  household_id: string | null;
  student?: { name: string } | null;
};
type Household = {
  id: string;
  display_name: string;
  billing_email: string | null;
  notes: string | null;
  archived_at: string | null;
};

type Tab = 'members' | 'sessions' | 'invoices' | 'notes';

function HouseholdDetailInner() {
  const router = useRouter();
  const { id } = router.query;
  const { membership } = useMembership();
  const isTutor = membership?.role === 'tutor';
  const [loading, setLoading] = useState(true);
  const [household, setHousehold] = useState<Household | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [tab, setTab] = useState<Tab>('members');
  const [error, setError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddParent, setShowAddParent] = useState(false);

  async function load() {
    if (!id || typeof id !== 'string') return;
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }
    const res = await fetch(`/api/households/${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 404) { router.replace('/app/households'); return; }
    if (!res.ok) { setError('Could not load household.'); setLoading(false); return; }
    const payload = await res.json();
    setHousehold(payload.household);
    setParents(payload.parents ?? []);
    setStudents(payload.students ?? []);
    setSessions(payload.sessions ?? []);
    setInvoices(payload.invoices ?? []);
    setNameDraft(payload.household?.display_name ?? '');
    setNotesDraft(payload.household?.notes ?? '');
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function saveName() {
    if (!household || !nameDraft.trim() || nameDraft.trim() === household.display_name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSavingName(false); return; }
    const res = await fetch(`/api/households/${household.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ display_name: nameDraft.trim() }),
    });
    setSavingName(false);
    if (res.ok) {
      const payload = await res.json();
      setHousehold(payload.household);
      setEditingName(false);
    }
  }

  async function saveNotes() {
    if (!household) return;
    setSavingNotes(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSavingNotes(false); return; }
    const res = await fetch(`/api/households/${household.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ notes: notesDraft }),
    });
    setSavingNotes(false);
    if (res.ok) {
      const payload = await res.json();
      setHousehold(payload.household);
      setEditingNotes(false);
    }
  }

  async function archiveHousehold() {
    if (!household) return;
    if (!window.confirm('Archive this household? Students and parents stay put; the household is hidden from lists.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/households/${household.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) router.push('/app/households');
  }

  async function unarchiveHousehold() {
    if (!household) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch(`/api/households/${household.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ archived: false }),
    });
    if (res.ok) load();
  }

  async function removeStudent(studentId: string) {
    if (!household) return;
    if (!window.confirm('Remove this student from the household? Sessions and invoices remain intact.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch(`/api/households/${household.id}/students`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ student_id: studentId }),
    });
    load();
  }

  async function setPrimaryParent(parentId: string) {
    if (!household) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch(`/api/households/${household.id}/parents`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ parent_id: parentId, set_primary: true }),
    });
    load();
  }

  async function removeParent(parentId: string) {
    if (!household) return;
    if (!window.confirm('Remove this parent from the household? They keep access to their linked students.')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch(`/api/households/${household.id}/parents`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ parent_id: parentId }),
    });
    load();
  }

  const hasPrimary = useMemo(() => parents.some((p) => p.is_primary), [parents]);

  if (loading) {
    return <Layout title="…"><div className="card p-6 text-sm text-ink-muted">Loading…</div></Layout>;
  }
  if (!household) {
    return <Layout title="Not found"><div className="card p-6 text-sm text-ink-muted">Household not found.</div></Layout>;
  }

  return (
    <Layout
      subtitle={household.archived_at ? 'Archived household' : 'Household'}
      title={household.display_name}
      actions={
        !isTutor ? (
          <>
            {household.archived_at ? (
              <button onClick={unarchiveHousehold} className="btn-secondary">Unarchive</button>
            ) : (
              <button onClick={archiveHousehold} className="btn-ghost text-claret">Archive</button>
            )}
          </>
        ) : undefined
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              className="input md:max-w-sm"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') { setNameDraft(household.display_name); setEditingName(false); }
              }}
              autoFocus
            />
            <button onClick={saveName} disabled={savingName} className="btn-primary text-xs">
              {savingName ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setNameDraft(household.display_name); setEditingName(false); }} className="btn-ghost text-xs">
              Cancel
            </button>
          </div>
        ) : (
          !isTutor && (
            <button onClick={() => setEditingName(true)} className="text-2xs text-forest underline underline-offset-2">
              Edit name
            </button>
          )
        )}
        {parents.length > 0 && parents.find((p) => p.is_primary) && (
          <div className="text-sm text-ink-muted">
            Billed to <span className="text-ink font-medium">{parents.find((p) => p.is_primary)?.name ?? 'Parent'}</span>
            {parents.find((p) => p.is_primary)?.email && (
              <span className="text-ink-soft"> · {parents.find((p) => p.is_primary)?.email}</span>
            )}
          </div>
        )}
        {!hasPrimary && (
          <div className="text-sm text-claret">Needs a primary parent</div>
        )}
      </div>

      <div className="border-b border-rule mb-6 overflow-x-auto">
        <nav className="flex gap-1 min-w-max" role="tablist">
          {(['members', 'sessions', 'invoices', 'notes'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx(
                'px-4 py-3 text-sm -mb-px border-b-2 transition-colors capitalize',
                tab === t ? 'border-forest text-ink font-medium' : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'members' && (
        <MembersTab
          parents={parents}
          students={students}
          isTutor={!!isTutor}
          onSetPrimary={setPrimaryParent}
          onRemoveParent={removeParent}
          onRemoveStudent={removeStudent}
          onRefresh={load}
          householdId={household.id}
          showAddParent={showAddParent}
          setShowAddParent={setShowAddParent}
          showAddStudent={showAddStudent}
          setShowAddStudent={setShowAddStudent}
        />
      )}
      {tab === 'sessions' && <SessionsTab sessions={sessions} />}
      {tab === 'invoices' && <InvoicesTab invoices={invoices} />}
      {tab === 'notes' && (
        <NotesTab
          notes={household.notes ?? ''}
          editing={editingNotes}
          draft={notesDraft}
          setDraft={setNotesDraft}
          setEditing={setEditingNotes}
          save={saveNotes}
          saving={savingNotes}
          isTutor={!!isTutor}
        />
      )}

      {error && <div className="mt-4 text-sm text-claret">{error}</div>}
    </Layout>
  );
}

function MembersTab({
  parents, students, isTutor, onSetPrimary, onRemoveParent, onRemoveStudent, onRefresh,
  householdId, showAddParent, setShowAddParent, showAddStudent, setShowAddStudent,
}: {
  parents: Parent[];
  students: Student[];
  isTutor: boolean;
  onSetPrimary: (parentId: string) => void;
  onRemoveParent: (parentId: string) => void;
  onRemoveStudent: (studentId: string) => void;
  onRefresh: () => void;
  householdId: string;
  showAddParent: boolean;
  setShowAddParent: (v: boolean) => void;
  showAddStudent: boolean;
  setShowAddStudent: (v: boolean) => void;
}) {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl tracking-tightest">Parents</h2>
          {!isTutor && (
            <button onClick={() => setShowAddParent(!showAddParent)} className="btn-ghost text-xs">
              {showAddParent ? 'Cancel' : '+ Add co-parent'}
            </button>
          )}
        </div>
        {showAddParent && (
          <AddParentForm householdId={householdId} onDone={() => { setShowAddParent(false); onRefresh(); }} />
        )}
        {parents.length === 0 ? (
          <div className="card p-5 text-sm text-ink-muted">No parents linked yet.</div>
        ) : (
          <ul className="space-y-2">
            {parents.map((p) => (
              <li key={p.parent_id} className="card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="text-sm text-ink">
                    {p.name ?? '(no name)'}
                    {p.is_primary && <span className="ml-2 badge-forest text-2xs">Primary</span>}
                  </div>
                  {p.email && <div className="text-2xs text-ink-soft">{p.email}</div>}
                </div>
                {!isTutor && (
                  <div className="flex items-center gap-2">
                    {!p.is_primary && (
                      <button onClick={() => onSetPrimary(p.parent_id)} className="btn-ghost text-xs">
                        Make primary
                      </button>
                    )}
                    <button onClick={() => onRemoveParent(p.parent_id)} className="btn-ghost text-xs text-claret">
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl tracking-tightest">Students</h2>
          {!isTutor && (
            <button onClick={() => setShowAddStudent(!showAddStudent)} className="btn-ghost text-xs">
              {showAddStudent ? 'Cancel' : '+ Add sibling'}
            </button>
          )}
        </div>
        {showAddStudent && (
          <AddStudentForm
            householdId={householdId}
            existingStudentIds={new Set(students.map((s) => s.id))}
            onDone={() => { setShowAddStudent(false); onRefresh(); }}
          />
        )}
        {students.length === 0 ? (
          <div className="card p-5 text-sm text-ink-muted">No students in this household yet.</div>
        ) : (
          <ul className="space-y-2">
            {students.map((s) => (
              <li key={s.id} className="card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <Link href={`/app/students/${s.id}`} className="text-sm text-ink underline underline-offset-2">
                    {s.name}
                  </Link>
                  <div className="text-2xs text-ink-muted">
                    {s.year_level ?? '—'}
                    {s.subjects && s.subjects.length > 0 && ` · ${s.subjects.join(', ')}`}
                  </div>
                </div>
                {!isTutor && (
                  <button onClick={() => onRemoveStudent(s.id)} className="btn-ghost text-xs text-claret">
                    Remove from household
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AddParentForm({ householdId, onDone }: { householdId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parents, setParents] = useState<Array<{ id: string; name: string | null; email: string }>>([]);
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Parents in the org who aren't already in this household.
      const { data } = await supabase
        .from('parents')
        .select('id, name, email');
      setParents((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSubmitting(false); return; }
    const res = await fetch(`/api/households/${householdId}/parents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ parent_id: selected }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload?.error ?? 'Could not add parent.');
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="card p-4 mb-3 space-y-3 bg-forest-soft/30">
      {loading ? (
        <div className="text-sm text-ink-muted">Loading parents…</div>
      ) : (
        <>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Pick an existing parent…</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? '(no name)'} · {p.email}
              </option>
            ))}
          </select>
          <div className="text-2xs text-ink-soft">
            To add a brand-new parent, invite them from the student's page — they'll be created when they accept.
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!selected || submitting} className="btn-primary text-xs">
              {submitting ? 'Adding…' : 'Add parent'}
            </button>
          </div>
          {error && <div className="text-xs text-claret">{error}</div>}
        </>
      )}
    </form>
  );
}

function AddStudentForm({
  householdId,
  existingStudentIds,
  onDone,
}: {
  householdId: string;
  existingStudentIds: Set<string>;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Array<{ id: string; name: string; household_id: string | null }>>([]);
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkParents, setLinkParents] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('students')
        .select('id, name, household_id')
        .eq('archived', false)
        .order('name');
      setStudents((data ?? []) as any);
      setLoading(false);
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const selectedStudent = students.find((s) => s.id === selected);
    const otherHousehold = !!(selectedStudent?.household_id && selectedStudent.household_id !== householdId);
    if (otherHousehold && !window.confirm('This student is in another household. Move them to this household?')) {
      setSubmitting(false);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSubmitting(false); return; }
    const res = await fetch(`/api/households/${householdId}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ student_id: selected, force: otherHousehold, link_parents: linkParents }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload?.error ?? 'Could not add student.');
      return;
    }
    onDone();
  }

  const selectable = students.filter((s) => !existingStudentIds.has(s.id));

  return (
    <form onSubmit={submit} className="card p-4 mb-3 space-y-3 bg-forest-soft/30">
      {loading ? (
        <div className="text-sm text-ink-muted">Loading students…</div>
      ) : (
        <>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Pick a student…</option>
            {selectable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.household_id ? ' (in another household)' : ''}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={linkParents}
              onChange={(e) => setLinkParents(e.target.checked)}
              className="accent-forest"
            />
            Also link this student to the household's parent(s)
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={!selected || submitting} className="btn-primary text-xs">
              {submitting ? 'Adding…' : 'Add to household'}
            </button>
          </div>
          {error && <div className="text-xs text-claret">{error}</div>}
        </>
      )}
    </form>
  );
}

function SessionsTab({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return <div className="card p-5 text-sm text-ink-muted">No sessions yet for this household.</div>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Student</th>
            <th>Subject · Topic</th>
            <th>Status</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className="row-link" onClick={() => window.location.assign(`/app/sessions/${s.id}`)}>
              <td className="text-ink">{formatDateTime(s.scheduled_at)}</td>
              <td className="text-ink">{s.student?.name ?? '—'}</td>
              <td className="text-ink-muted">{[s.subject, s.topic].filter(Boolean).join(' · ') || '—'}</td>
              <td>
                <span className={cx(
                  s.status === 'completed' && (s.paid ? 'badge-forest' : 'badge-rust'),
                  s.status === 'cancelled' && 'badge-neutral',
                  s.status === 'no_show' && 'badge-claret',
                  s.status === 'scheduled' && 'badge-neutral'
                )}>
                  {s.status === 'completed' ? (s.paid ? 'Paid' : 'Unpaid') : s.status}
                </span>
              </td>
              <td className="text-right font-mono num text-sm">
                {formatCents(sessionAmount(s as any), 'AUD')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesTab({ invoices }: { invoices: InvoiceRow[] }) {
  if (invoices.length === 0) {
    return (
      <div className="card p-5 text-sm text-ink-muted">
        No invoices for this household yet. Batch invoicing is coming soon — you can invoice individual students from the Invoices page.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <Link
          key={inv.id}
          href={`/app/invoices/${inv.id}`}
          className="card p-4 flex flex-wrap items-center justify-between gap-3 hover:shadow-lift transition-shadow"
        >
          <div>
            <div className="font-mono text-sm">{inv.number}</div>
            <div className="text-2xs text-ink-muted">
              {inv.student?.name ?? 'Household'} · Issued {new Date(inv.issued_on).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm">{formatCents(inv.total_cents, 'AUD')}</span>
            <span className={cx(
              inv.status === 'paid' && 'badge-forest',
              inv.status === 'sent' && 'badge-rust',
              inv.status === 'draft' && 'badge-neutral',
              inv.status === 'overdue' && 'badge-claret',
              inv.status === 'void' && 'badge-neutral',
            )}>
              {inv.status}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function NotesTab({
  notes, editing, draft, setDraft, setEditing, save, saving, isTutor,
}: {
  notes: string;
  editing: boolean;
  draft: string;
  setDraft: (v: string) => void;
  setEditing: (v: boolean) => void;
  save: () => void;
  saving: boolean;
  isTutor: boolean;
}) {
  if (editing) {
    return (
      <div className="space-y-3">
        <textarea
          rows={6}
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Allergies, schedule constraints, billing preferences…"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="btn-primary text-xs">
            {saving ? 'Saving…' : 'Save notes'}
          </button>
          <button onClick={() => setEditing(false)} className="btn-ghost text-xs">Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      {notes ? (
        <div className="card p-5 whitespace-pre-wrap text-sm text-ink">{notes}</div>
      ) : (
        <div className="card p-5 text-sm text-ink-muted italic">No household notes yet.</div>
      )}
      {!isTutor && (
        <button onClick={() => setEditing(true)} className="mt-3 btn-ghost text-xs">
          {notes ? 'Edit notes' : 'Add notes'}
        </button>
      )}
    </div>
  );
}

export default function HouseholdDetail() {
  return (
    <AuthGuard>
      <HouseholdDetailInner />
    </AuthGuard>
  );
}
