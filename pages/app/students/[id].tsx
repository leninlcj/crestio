import { activeLocale } from '../../../lib/utils';
import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { Student, Session, Tutor } from '../../../lib/types';
import { FilesPanel } from '../../../components/files/FilesPanel';
import {
  formatCents,
  formatDateTime,
  centsToDollars,
  dollarsToCents,
  sessionAmount,
  cx,
} from '../../../lib/utils';

type LinkedParent = {
  linkId: string;
  email: string;
  name: string | null;
};

type PendingInvitation = {
  id: string;
  email: string;
  created_at: string;
  expires_at: string;
};

function StudentDetailInner() {
  const router = useRouter();
  const { t } = useTranslation(['students', 'common']);
  const { id } = router.query;
  const { membership, loading: membershipLoading } = useMembership();
  const isTutor = membership?.role === 'tutor';

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('AUD');
  const [availableTutors, setAvailableTutors] = useState<Tutor[]>([]);
  const [assigningTutor, setAssigningTutor] = useState(false);
  const [assignSaved, setAssignSaved] = useState(false);

  const [form, setForm] = useState<any>(null);
  const [tab, setTab] = useState<'sessions' | 'homework' | 'files'>('sessions');
  const [markingHomework, setMarkingHomework] = useState<string | null>(null);
  const [household, setHousehold] = useState<{ id: string; display_name: string } | null>(null);
  const [showHouseholdPicker, setShowHouseholdPicker] = useState(false);
  const [availableHouseholds, setAvailableHouseholds] = useState<Array<{ id: string; display_name: string }>>([]);
  const [loadingHouseholds, setLoadingHouseholds] = useState(false);

  const [linkedParents, setLinkedParents] = useState<LinkedParent[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInvitationUrl, setLastInvitationUrl] = useState<string | null>(null);
  const [lastInvitationEmail, setLastInvitationEmail] = useState<string | null>(null);
  const [lastInvitationEmailSent, setLastInvitationEmailSent] = useState<boolean>(false);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    if (membershipLoading) return;

    (async () => {
      setLoading(true);
      setDenied(false);
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (auth) {
        const { data: p } = await supabase
          .from('profiles').select('currency').eq('id', auth.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }

      const [{ data: s }, { data: ss }] = await Promise.all([
        supabase.from('students').select('*').eq('id', id).maybeSingle(),
        isTutor && auth?.user.id
          ? supabase
              .from('sessions')
              .select('*')
              .eq('student_id', id)
              .eq('tutor_user_id', auth.user.id)
              .order('scheduled_at', { ascending: false })
          : supabase
              .from('sessions')
              .select('*')
              .eq('student_id', id)
              .order('scheduled_at', { ascending: false }),
      ]);

      // Tutors can only see students assigned to them.
      if (isTutor && s) {
        if ((s as any).primary_tutor_id !== membership?.tutor_id) {
          setDenied(true);
          setLoading(false);
          return;
        }
      }

      setStudent(s as any);
      setSessions(ss ?? []);
      if (s && (s as any).household_id) {
        const { data: h } = await supabase
          .from('households')
          .select('id, display_name')
          .eq('id', (s as any).household_id)
          .maybeSingle();
        setHousehold(h ? { id: h.id, display_name: h.display_name } : null);
      } else {
        setHousehold(null);
      }
      if (!isTutor) {
        await loadParentAccess(id);
        await loadAvailableTutors();
      }
      if (s) {
        setForm({
          name: s.name,
          year_level: (s as any).year_level ?? '',
          school: (s as any).school ?? '',
          subjects: ((s as any).subjects ?? []).join(', '),
          parent_name: (s as any).parent_name ?? '',
          parent_email: (s as any).parent_email ?? '',
          parent_phone: (s as any).parent_phone ?? '',
          hourly_rate: (s as any).hourly_rate_cents ? centsToDollars((s as any).hourly_rate_cents) : '',
          notes: (s as any).notes ?? '',
        });
      }
      setLoading(false);
    })();
  }, [id, membership, membershipLoading, isTutor]);

  async function loadAvailableTutors() {
    const { data } = await supabase
      .from('tutors')
      .select('*')
      .not('auth_user_id', 'is', null)
      .eq('archived', false)
      .order('name');
    setAvailableTutors((data as Tutor[]) ?? []);
  }

  async function assignPrimaryTutor(newTutorId: string) {
    if (!student) return;
    setAssigningTutor(true);
    setAssignSaved(false);
    const { error: err } = await supabase
      .from('students')
      .update({ primary_tutor_id: newTutorId || null })
      .eq('id', student.id);
    setAssigningTutor(false);
    if (err) {
      setError(err.message);
      return;
    }
    setStudent({ ...student, primary_tutor_id: newTutorId || null } as any);
    setAssignSaved(true);
    setTimeout(() => setAssignSaved(false), 2000);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    setSaving(true);
    setError(null);

    const subjects = form.subjects.split(',').map((s: string) => s.trim()).filter(Boolean);

    const { error: err } = await supabase
      .from('students')
      .update({
        name: form.name,
        year_level: form.year_level || null,
        school: form.school || null,
        subjects,
        parent_name: form.parent_name || null,
        parent_email: form.parent_email || null,
        parent_phone: form.parent_phone || null,
        hourly_rate_cents: form.hourly_rate ? dollarsToCents(form.hourly_rate) : null,
        notes: form.notes || null,
      })
      .eq('id', student.id);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }

    // refresh
    const { data: fresh } = await supabase.from('students').select('*').eq('id', student.id).single();
    if (fresh) setStudent(fresh);
    setEditing(false);
  }

  async function toggleArchive() {
    if (!student) return;
    const newArchived = !student.archived;
    const ok = window.confirm(
      newArchived
        ? `Archive ${student.name}? You can unarchive them later.`
        : `Restore ${student.name}?`
    );
    if (!ok) return;
    const { error: err } = await supabase
      .from('students')
      .update({ archived: newArchived })
      .eq('id', student.id);
    if (err) { setError(err.message); return; }
    router.push('/app/students');
  }

  async function loadParentAccess(studentId: string) {
    const [{ data: links }, { data: invitations }] = await Promise.all([
      supabase
        .from('parent_student_links')
        .select('id, parent:parents(email, name)')
        .eq('student_id', studentId)
        .is('revoked_at', null),
      supabase
        .from('parent_invitations')
        .select('id, email, created_at, expires_at')
        .eq('student_id', studentId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
    ]);
    setLinkedParents(
      (links ?? []).map((l: any) => ({
        linkId: l.id,
        email: l.parent?.email ?? '(unknown)',
        name: l.parent?.name ?? null,
      }))
    );
    setPendingInvitations(invitations ?? []);
  }

  async function inviteParent(e: FormEvent) {
    e.preventDefault();
    if (!student) return;
    setInviteError(null);
    setLastInvitationUrl(null);
    setLastInvitationEmail(null);
    setLastInvitationEmailSent(false);
    setInviting(true);
    const attemptedEmail = inviteEmail;
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth?.access_token) throw new Error('Not signed in.');
      const res = await fetch('/api/parents/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({ studentId: student.id, email: attemptedEmail }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? `Server returned ${res.status}`);
      setLastInvitationEmail(attemptedEmail);
      setLastInvitationEmailSent(Boolean(payload.emailSent));
      setLastInvitationUrl(payload.emailSent ? null : payload.invitationUrl ?? null);
      setInviteEmail('');
      await loadParentAccess(student.id);
    } catch (e: any) {
      setInviteError(e?.message ?? 'Could not send invitation.');
    } finally {
      setInviting(false);
    }
  }

  async function revokeLink(linkId: string) {
    if (!student) return;
    if (!window.confirm('Revoke this parent\'s access? They will no longer see any sessions.')) return;
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch('/api/parents/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.access_token}`,
      },
      body: JSON.stringify({ linkId }),
    });
    if (res.ok) await loadParentAccess(student.id);
  }

  async function cancelInvitation(invitationId: string) {
    if (!student) return;
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch('/api/parents/cancel-invitation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.access_token}`,
      },
      body: JSON.stringify({ invitationId }),
    });
    if (res.ok) await loadParentAccess(student.id);
  }

  function timeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  async function openHouseholdPicker() {
    setShowHouseholdPicker(true);
    setLoadingHouseholds(true);
    const { data } = await supabase
      .from('households')
      .select('id, display_name')
      .is('archived_at', null)
      .order('display_name');
    setAvailableHouseholds((data as any) ?? []);
    setLoadingHouseholds(false);
  }

  async function assignToHousehold(householdId: string) {
    if (!student) return;
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch(`/api/households/${householdId}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
      body: JSON.stringify({ student_id: student.id, force: true, link_parents: false }),
    });
    if (!res.ok) return;
    const { data: h } = await supabase
      .from('households').select('id, display_name').eq('id', householdId).maybeSingle();
    setHousehold(h ? { id: h.id, display_name: h.display_name } : null);
    setShowHouseholdPicker(false);
    setStudent({ ...student, household_id: householdId } as any);
  }

  async function removeFromHousehold() {
    if (!student || !household) return;
    if (!window.confirm('Remove this student from the household? They stay in the org.')) return;
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch(`/api/households/${household.id}/students`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
      body: JSON.stringify({ student_id: student.id }),
    });
    if (!res.ok) return;
    setHousehold(null);
    setStudent({ ...student, household_id: null } as any);
  }

  async function markHomeworkComplete(sessionId: string) {
    setMarkingHomework(sessionId);
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth?.access_token) return;
      const res = await fetch(`/api/sessions/${sessionId}/homework/mark-complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      if (res.ok) {
        const { completedAt } = await res.json();
        setSessions((xs) =>
          xs.map((x) =>
            x.id === sessionId
              ? { ...x, homework_completed_at: completedAt, homework_completed_by_user_id: auth.user.id }
              : x,
          ),
        );
      }
    } finally {
      setMarkingHomework(null);
    }
  }

  async function deleteStudent() {
    if (!student) return;
    // Soft-delete: hide from default views but preserve session/invoice
    // history. The unified /api/archive route stamps archived_at + archived_by
    // and (for students) flips the legacy `archived` boolean too.
    const ok = window.confirm(
      `Delete ${student.name}? Their session history and invoices stay on file. You can restore them within 30 days from Settings → Archived.`,
    );
    if (!ok) return;
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth?.access_token) return;
    const res = await fetch('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
      body: JSON.stringify({ entity_type: 'student', ids: [student.id] }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload?.error ?? 'Could not delete student.');
      return;
    }
    router.push('/app/students');
  }

  if (loading) {
    return <Layout title={t('students:title_loading')}><div className="card p-6 text-sm text-ink-muted">{t('students:loading')}</div></Layout>;
  }

  if (denied) {
    return (
      <Layout title={t('students:title_not_available')}>
        <div className="card p-6 text-sm text-ink-muted">
          {t('students:denied')}
        </div>
      </Layout>
    );
  }

  if (!student) {
    return (
      <Layout title={t('students:title_not_found')}>
        <div className="card p-6 text-sm text-ink-muted">
          {t('students:not_found')}
        </div>
      </Layout>
    );
  }

  const lifetimeRevenue = sessions
    .filter((s) => s.status === 'completed')
    .reduce((a, s) => a + sessionAmount(s), 0);

  return (
    <Layout
      subtitle={student.archived ? 'Archived student' : 'Student'}
      title={student.name}
      actions={
        <>
          {!editing && (
            <>
              <button onClick={() => setEditing(true)} className="btn-secondary">Edit</button>
              <Link
                href={`/app/sessions/new?student=${student.id}`}
                className="btn-primary"
              >
                Log session
              </Link>
            </>
          )}
        </>
      }
    >
      {editing && form ? (
        <form onSubmit={save} className="card p-8 space-y-5 max-w-2xl">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Name</label>
              <input className="input" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Year level</label>
              <input className="input" value={form.year_level}
                onChange={(e) => setForm({ ...form, year_level: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">School</label>
            <input className="input" value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })} />
          </div>
          <div>
            <label className="label">Subjects (comma separated)</label>
            <input className="input" value={form.subjects}
              onChange={(e) => setForm({ ...form, subjects: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Parent name</label>
              <input className="input" value={form.parent_name}
                onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
            </div>
            <div>
              <label className="label">Parent phone</label>
              <input className="input" value={form.parent_phone}
                onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Parent email</label>
            <input type="email" className="input" value={form.parent_email}
              onChange={(e) => setForm({ ...form, parent_email: e.target.value })} />
          </div>
          <div>
            <label className="label">Hourly rate</label>
            <input type="number" min="0" step="1" className="input" value={form.hourly_rate}
              onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={4} className="input" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {error && <div className="text-sm text-claret">{error}</div>}

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleArchive} className="btn-ghost text-xs">
                {student.archived ? 'Restore' : 'Archive'}
              </button>
              <button type="button" onClick={deleteStudent} className="btn-danger text-xs">
                Delete
              </button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <div className={cx('grid gap-6 mb-8', isTutor ? 'md:grid-cols-1' : 'lg:grid-cols-3')}>
            {!isTutor && (
              <div className="card p-6">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Contact</div>
                <div className="space-y-2 text-sm">
                  {student.parent_name && <div><span className="text-ink-muted">Parent: </span>{student.parent_name}</div>}
                  {student.parent_email && <div><span className="text-ink-muted">Email: </span><a href={`mailto:${student.parent_email}`} className="text-forest underline underline-offset-2">{student.parent_email}</a></div>}
                  {student.parent_phone && <div><span className="text-ink-muted">Phone: </span>{student.parent_phone}</div>}
                  {!student.parent_name && !student.parent_email && !student.parent_phone && (
                    <div className="text-ink-soft">No parent contact yet.</div>
                  )}
                </div>
              </div>
            )}
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Academic</div>
              <div className="space-y-2 text-sm">
                <div><span className="text-ink-muted">Year: </span>{student.year_level ?? '–'}</div>
                <div><span className="text-ink-muted">School: </span>{student.school ?? '–'}</div>
                <div><span className="text-ink-muted">Subjects: </span>
                  {student.subjects && student.subjects.length > 0 ? student.subjects.join(', ') : '–'}
                </div>
              </div>
            </div>
            {!isTutor && (
              <div className="card p-6">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Billing</div>
                <div className="space-y-2 text-sm">
                  <div><span className="text-ink-muted">Rate: </span>
                    <span className="font-mono num">{formatCents(student.hourly_rate_cents, currency)}</span>
                    <span className="text-ink-soft text-xs"> / hr</span>
                  </div>
                  <div><span className="text-ink-muted">Lifetime: </span>
                    <span className="font-mono num">{formatCents(lifetimeRevenue, currency, { showZero: true })}</span>
                  </div>
                  <div><span className="text-ink-muted">Sessions: </span>{sessions.length}</div>
                </div>
              </div>
            )}
          </div>

          {!isTutor && (
            <div className="card p-6 mb-8">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Assigned tutor</div>
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <select
                  className="input md:max-w-sm"
                  value={(student as any).primary_tutor_id ?? ''}
                  onChange={(e) => assignPrimaryTutor(e.target.value)}
                  disabled={assigningTutor}
                >
                  <option value="">Unassigned (owner handles directly)</option>
                  {availableTutors.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} · {t.email ?? 'no email'}</option>
                  ))}
                </select>
                {assignSaved && <span className="text-sm text-forest">Saved.</span>}
              </div>
              <div className="text-2xs text-ink-soft mt-2">
                Only tutors who have accepted their invitation appear here.
              </div>
            </div>
          )}

          {student.notes && (
            <div className="card p-6 mb-8">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Notes</div>
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{student.notes}</p>
            </div>
          )}

          {!isTutor && (
            <div className="card p-5 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Household</div>
                {household ? (
                  <div className="text-sm text-ink">
                    <Link href={`/app/households/${household.id}`} className="font-medium underline underline-offset-2">
                      {household.display_name}
                    </Link>
                    <span className="text-ink-soft"> · billing groups siblings together</span>
                  </div>
                ) : (
                  <div className="text-sm text-ink-muted">Not in a household.</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {showHouseholdPicker ? (
                  <div className="flex items-center gap-2">
                    {loadingHouseholds ? (
                      <span className="text-xs text-ink-muted">Loading…</span>
                    ) : (
                      <select
                        className="input text-sm"
                        onChange={(e) => e.target.value && assignToHousehold(e.target.value)}
                        defaultValue=""
                      >
                        <option value="">Pick a household…</option>
                        {availableHouseholds
                          .filter((h) => h.id !== household?.id)
                          .map((h) => (
                            <option key={h.id} value={h.id}>{h.display_name}</option>
                          ))}
                      </select>
                    )}
                    <button onClick={() => setShowHouseholdPicker(false)} className="btn-ghost text-xs">Cancel</button>
                  </div>
                ) : (
                  <>
                    <button onClick={openHouseholdPicker} className="btn-ghost text-xs">
                      {household ? 'Change' : 'Assign household'}
                    </button>
                    {household && (
                      <button onClick={removeFromHousehold} className="btn-ghost text-xs text-claret">
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <FromLastSessionCard
            sessions={sessions}
            studentId={student.id}
          />

          {!isTutor && (
          <div className="card p-6 mb-8">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Parent access</div>
            <h3 className="font-display text-xl tracking-tightest mb-4">
              Who can see this student's notes
            </h3>

            {linkedParents.length === 0 && pendingInvitations.length === 0 && (
              <p className="text-sm text-ink-soft mb-5">No parents linked or invited yet.</p>
            )}

            {linkedParents.length > 0 && (
              <div className="mb-5">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Linked</div>
                <ul className="space-y-2">
                  {linkedParents.map((p) => (
                    <li key={p.linkId} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <span className="text-ink">{p.email}</span>
                        {p.name && <span className="text-ink-muted"> · {p.name}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => revokeLink(p.linkId)}
                        className="btn-ghost text-xs text-claret"
                      >
                        Revoke access
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pendingInvitations.length > 0 && (
              <div className="mb-5">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Pending</div>
                <ul className="space-y-2">
                  {pendingInvitations.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <span className="text-ink">{inv.email}</span>
                        <span className="text-ink-soft"> · Invited {timeAgo(inv.created_at)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => cancelInvitation(inv.id)}
                        className="btn-ghost text-xs"
                      >
                        Cancel invitation
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={inviteParent} className="pt-4 border-t border-rule space-y-3">
              <div>
                <label className="label">Parent email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input"
                  placeholder="parent@example.com"
                  disabled={inviting}
                />
              </div>
              {inviteError && <div className="text-sm text-claret">{inviteError}</div>}
              {lastInvitationEmail && lastInvitationEmailSent && (
                <div className="p-3 bg-forest-soft border border-forest/20 rounded text-xs text-forest-ink">
                  Invitation sent to <span className="font-medium">{lastInvitationEmail}</span>.
                </div>
              )}
              {lastInvitationUrl && (
                <div className="p-3 bg-forest-soft border border-forest/20 rounded text-xs">
                  <div className="text-forest-ink mb-1 font-medium">Invitation created.</div>
                  <div className="text-forest-ink/80 mb-2">
                    Share this link with the parent if they don't receive the email:
                  </div>
                  <div className="font-mono text-2xs break-all select-all bg-cream p-2 rounded">
                    {lastInvitationUrl}
                  </div>
                </div>
              )}
              <button type="submit" disabled={inviting || !inviteEmail} className="btn-primary">
                {inviting ? 'Sending…' : 'Invite parent'}
              </button>
            </form>
          </div>
          )}

          <div className="flex items-end justify-between mb-4">
            <div className="flex items-end gap-6">
              <button
                type="button"
                onClick={() => setTab('sessions')}
                className={cx(
                  'text-left',
                  tab === 'sessions' ? '' : 'opacity-60 hover:opacity-100'
                )}
              >
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Record</div>
                <h2 className={cx(
                  'font-display text-2xl tracking-tightest',
                  tab === 'sessions' ? 'text-ink' : 'text-ink-muted'
                )}>
                  Sessions
                </h2>
              </button>
              <button
                type="button"
                onClick={() => setTab('homework')}
                className={cx(
                  'text-left',
                  tab === 'homework' ? '' : 'opacity-60 hover:opacity-100'
                )}
              >
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Track</div>
                <h2 className={cx(
                  'font-display text-2xl tracking-tightest',
                  tab === 'homework' ? 'text-ink' : 'text-ink-muted'
                )}>
                  Homework
                </h2>
              </button>
              <button
                type="button"
                onClick={() => setTab('files')}
                className={cx(
                  'text-left',
                  tab === 'files' ? '' : 'opacity-60 hover:opacity-100'
                )}
              >
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Share</div>
                <h2 className={cx(
                  'font-display text-2xl tracking-tightest',
                  tab === 'files' ? 'text-ink' : 'text-ink-muted'
                )}>
                  Files
                </h2>
              </button>
            </div>
            <Link href={`/app/sessions/new?student=${student.id}`} className="btn-secondary text-xs">
              New session
            </Link>
          </div>

          {tab === 'sessions' ? (
            sessions.length === 0 ? (
              <div className="card p-6 text-sm text-ink-muted">No sessions yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Subject · Topic</th>
                      <th>Duration</th>
                      <th>Status</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} className="row-link" onClick={() => window.location.assign(`/app/sessions/${s.id}`)}>
                        <td className="text-ink">{formatDateTime(s.scheduled_at)}</td>
                        <td className="text-ink-muted">
                          {[s.subject, s.topic].filter(Boolean).join(' · ') || '–'}
                        </td>
                        <td className="text-ink-muted font-mono text-xs">{s.duration_minutes} min</td>
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
                          {formatCents(sessionAmount(s), currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : tab === 'homework' ? (
            <HomeworkList
              sessions={sessions}
              onMarkComplete={markHomeworkComplete}
              marking={markingHomework}
            />
          ) : (
            <FilesPanel
              scope={{ kind: 'student', student_id: student.id }}
              students={[]}
            />
          )}
        </>
      )}
    </Layout>
  );
}

function relativeFromNow(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) {
    const hrs = Math.max(1, Math.floor(diffMs / 3_600_000));
    return hrs === 1 ? 'earlier today' : `${hrs} hours ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' });
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed.length <= n) return trimmed;
  return trimmed.slice(0, n - 1).trimEnd() + '…';
}

function homeworkStatus(s: Session): 'done' | 'overdue' | 'due' {
  if (s.homework_completed_at) return 'done';
  if (s.homework_due_date && new Date(s.homework_due_date) < new Date()) return 'overdue';
  return 'due';
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

function FromLastSessionCard({ sessions, studentId }: { sessions: Session[]; studentId: string }) {
  const lastCompleted = sessions.find((s) => s.status === 'completed');
  if (!lastCompleted) return null;

  const covered = (lastCompleted.notes_parent_facing || lastCompleted.notes_internal || '').trim();
  const homework = (lastCompleted.homework_description || lastCompleted.homework || '').trim();
  const focus = (lastCompleted.next_session_focus || '').trim();

  if (!covered && !homework && !focus) return null;

  const status = homework ? homeworkStatus(lastCompleted) : null;
  const prefillQuery = focus ? `&prefill_focus=${encodeURIComponent(focus)}` : '';

  return (
    <div className="card p-6 mb-8 bg-forest-soft border-forest/20">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-3">
        <div>
          <div className="text-2xs uppercase tracking-widest text-forest-ink/70">From last session</div>
          <div className="text-xs text-forest-ink/80 mt-0.5">{relativeFromNow(lastCompleted.scheduled_at)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/sessions/${lastCompleted.id}`} className="btn-ghost text-xs">
            Open last session →
          </Link>
          <Link
            href={`/app/sessions/new?student=${studentId}${prefillQuery}`}
            className="btn-primary text-xs"
          >
            Log new session with this context →
          </Link>
        </div>
      </div>
      <div className="space-y-2 text-sm text-forest-ink leading-relaxed">
        {covered && (
          <div>
            <span className="text-forest-ink/70">Last time you covered: </span>
            {truncate(covered, 140)}
          </div>
        )}
        {homework && status === 'done' && (
          <div className="text-forest">✓ Homework done: {truncate(homework, 140)}</div>
        )}
        {homework && status === 'overdue' && (
          <div className="text-rust">⚠ Homework overdue: {truncate(homework, 140)}</div>
        )}
        {homework && status === 'due' && (
          <div>
            <span className="text-forest-ink/70">Homework assigned: </span>
            {truncate(homework, 140)}
            {lastCompleted.homework_due_date && (
              <span className="text-forest-ink/70">
                {' '}(due {new Date(lastCompleted.homework_due_date).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })})
              </span>
            )}
          </div>
        )}
        {focus && (
          <div>
            <span className="text-forest-ink/70">Planned for today: </span>
            {focus}
          </div>
        )}
      </div>
    </div>
  );
}

function HomeworkList({
  sessions,
  onMarkComplete,
  marking,
}: {
  sessions: Session[];
  onMarkComplete: (sessionId: string) => void;
  marking: string | null;
}) {
  const items = sessions.filter((s) => (s.homework_description || s.homework));
  if (items.length === 0) {
    return (
      <div className="card p-6 text-sm text-ink-muted">
        No homework assigned yet. Add homework when logging a session.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((s) => {
        const text = s.homework_description || s.homework || '';
        const status = homeworkStatus(s);
        const due = s.homework_due_date;
        return (
          <div key={s.id} className="card p-5">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-2">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted">
                  {new Date(s.scheduled_at).toLocaleDateString(activeLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                {due && (
                  <div className="text-2xs text-ink-soft mt-0.5">
                    Due {new Date(due).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {status === 'done' && <span className="badge-forest">Completed</span>}
                {status === 'overdue' && <span className="badge-rust">Overdue</span>}
                {status === 'due' && due && (
                  <span className="badge-neutral">
                    {(() => {
                      const d = daysUntil(due);
                      if (d === 0) return 'Due today';
                      if (d === 1) return 'Due tomorrow';
                      if (d < 0) return 'Overdue';
                      return `Due in ${d} days`;
                    })()}
                  </span>
                )}
                {status !== 'done' && (
                  <button
                    type="button"
                    onClick={() => onMarkComplete(s.id)}
                    disabled={marking === s.id}
                    className="btn-ghost text-xs"
                  >
                    {marking === s.id ? 'Marking…' : 'Mark as done'}
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{text}</p>
            {s.homework_completed_at && (
              <div className="text-2xs text-ink-soft mt-2">
                Marked complete on {new Date(s.homework_completed_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StudentDetail() {
  return (
    <AuthGuard>
      <StudentDetailInner />
    </AuthGuard>
  );
}
