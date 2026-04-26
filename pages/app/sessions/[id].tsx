import { useEffect, useRef, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useLocaleFormatters } from '../../../lib/useLocaleFormatters';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { Session, Student, Tutor } from '../../../lib/types';
import VoiceRecorder from '../../../components/voice/VoiceRecorder';
import { FilesPanel } from '../../../components/files/FilesPanel';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  existingSessionDraftKey,
  SessionDraft,
} from '../../../lib/sessionDrafts';
import {
  formatCents,
  centsToDollars,
  dollarsToCents,
  toDateTimeLocalInput,
  fromDateTimeLocalInput,
  sessionAmount,
  tutorPayAmount,
  cx,
  activeLocale,
} from '../../../lib/utils';

function splitDateTime(local: string): { date: string | null; time: string | null } {
  if (!local || !local.includes('T')) return { date: null, time: null };
  const [date, time] = local.split('T');
  return { date: date || null, time: time ? time.slice(0, 5) : null };
}

function joinDateTime(date: string | null, time: string | null): string | null {
  if (!date || !time) return null;
  return `${date}T${time}`;
}

function getFormSnapshot(form: any): string {
  if (!form) return '';
  return JSON.stringify({
    student_id: form.student_id ?? '',
    tutor_id: form.tutor_id ?? '',
    subject: form.subject ?? '',
    topic: form.topic ?? '',
    scheduled_at: form.scheduled_at ?? '',
    duration_minutes: form.duration_minutes ?? 0,
    charge_rate: form.charge_rate ?? '',
    pay_rate: form.pay_rate ?? '',
    status: form.status ?? '',
    notes_internal: form.notes_internal ?? '',
    notes_parent_facing: form.notes_parent_facing ?? '',
    homework_description: form.homework_description ?? '',
    homework_due_date: form.homework_due_date ?? '',
    next_session_focus: form.next_session_focus ?? '',
  });
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function draftToFormPatch(draft: SessionDraft, fallback: any): any {
  const scheduled = joinDateTime(draft.sessionDate, draft.sessionTime) || fallback.scheduled_at;
  return {
    student_id: draft.studentId ?? fallback.student_id,
    tutor_id: draft.tutorId ?? fallback.tutor_id,
    subject: draft.subject || fallback.subject,
    topic: draft.topic || fallback.topic,
    scheduled_at: scheduled,
    duration_minutes: draft.durationMinutes ?? fallback.duration_minutes,
    charge_rate: draft.chargeRate !== null ? String(draft.chargeRate) : fallback.charge_rate,
    pay_rate: draft.payRate !== null ? String(draft.payRate) : fallback.pay_rate,
    status: draft.status ?? fallback.status,
    notes_internal: draft.notesInternal,
    notes_parent_facing: draft.notesParentFacing,
    homework_description: draft.homeworkDescription || fallback.homework_description,
    homework_due_date: draft.homeworkDueDate || fallback.homework_due_date,
    next_session_focus: draft.nextSessionFocus || fallback.next_session_focus,
  };
}

function SessionDetailInner() {
  const router = useRouter();
  const { t } = useTranslation(['sessions', 'common']);
  const fmt = useLocaleFormatters();
  const { id } = router.query;
  const { membership } = useMembership();
  const isTutor = membership?.role === 'tutor';
  const [userId, setUserId] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<(Session & { student: Student | null; tutor: Tutor | null }) | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('AUD');
  const [form, setForm] = useState<any>(null);
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [editingShared, setEditingShared] = useState(false);
  const [saveStatus, setSaveStatus] = useState<null | 'saving' | 'saved_remote' | 'saved_local'>(null);
  const [pendingRecovery, setPendingRecovery] = useState<SessionDraft | null>(null);
  const [pendingRecoveryAt, setPendingRecoveryAt] = useState<string | null>(null);
  const lastSyncedRef = useRef<{
    notesInternal: string;
    notesParentFacing: string;
    homeworkDescription: string;
    homeworkDueDate: string;
    nextSessionFocus: string;
  } | null>(null);
  const mountedFormSnapshotRef = useRef<string>('');
  const lastDraftSnapshotRef = useRef<string>('');

  async function polishNotes() {
    if (!form?.notes_internal || form.notes_internal.trim().length < 10) return;
    if (!form?.student_id) return;
    if (!Number(form?.duration_minutes)) return;
    setPolishError(null);
    setPolishing(true);
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth?.access_token) {
        setPolishError('Not signed in.');
        return;
      }
      const res = await fetch('/api/polish-session-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          rawNotes: form.notes_internal,
          studentId: form.student_id,
          durationMinutes: Number(form.duration_minutes),
          subject: form.subject || undefined,
          sessionId: session?.id,
        }),
      });
      let payload: any = null;
      try {
        payload = await res.json();
      } catch {
        setPolishError('Something went wrong. Your notes are still saved — please try again in a moment.');
        return;
      }
      if (res.status === 429) {
        setPolishError(payload?.message || 'Rate limit reached. Try again later.');
        return;
      }
      if (!res.ok) {
        setPolishError('Something went wrong. Your notes are still saved — please try again in a moment.');
        return;
      }
      const text = typeof payload?.polishedNotes === 'string' ? payload.polishedNotes : '';
      if (!text) {
        setPolishError('Something went wrong. Your notes are still saved — please try again in a moment.');
        return;
      }
      // Auto-share: write locally so the UI reflects what the API just persisted.
      setForm((f: any) => ({ ...f, notes_parent_facing: text }));
      if (session) {
        setSession((s) => (s ? ({ ...(s as any), notes_parent_facing: text, notes_polished_by_ai: true } as any) : s));
      }
      if (lastSyncedRef.current) {
        lastSyncedRef.current = { ...lastSyncedRef.current, notesParentFacing: text };
      }
      setEditingShared(false);
    } catch {
      setPolishError('Something went wrong. Your notes are still saved — please try again in a moment.');
    } finally {
      setPolishing(false);
    }
  }

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    (async () => {
      setLoading(true);
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (auth) {
        setUserId(auth.user.id);
        const { data: p } = await supabase.from('profiles').select('currency').eq('id', auth.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }
      const [{ data: s }, { data: ss }, { data: ts }] = await Promise.all([
        supabase.from('sessions').select('*, student:students(*), tutor:tutors(*)').eq('id', id).maybeSingle(),
        supabase.from('students').select('*').eq('archived', false).order('name'),
        supabase.from('tutors').select('*').eq('archived', false).order('name'),
      ]);

      // Tutors can only view their own sessions.
      if (isTutor && s && (s as any).tutor_user_id !== auth?.user.id) {
        setDenied(true);
        setLoading(false);
        return;
      }

      setSession(s as any);
      setStudents(ss ?? []);
      setTutors(ts ?? []);
      if (s) {
        const dbNotesInternal = (s as any).notes_internal ?? '';
        const dbNotesParentFacing = (s as any).notes_parent_facing ?? '';
        const dbHomeworkDescription = (s as any).homework_description ?? (s as any).homework ?? '';
        const dbHomeworkDueDate = (s as any).homework_due_date ?? '';
        const dbNextSessionFocus = (s as any).next_session_focus ?? '';
        const dbForm = {
          student_id: s.student_id,
          tutor_id: s.tutor_id ?? '',
          subject: s.subject ?? '',
          topic: s.topic ?? '',
          scheduled_at: toDateTimeLocalInput(s.scheduled_at),
          duration_minutes: s.duration_minutes,
          charge_rate: s.charge_rate_cents ? centsToDollars(s.charge_rate_cents) : '',
          pay_rate: s.pay_rate_cents ? centsToDollars(s.pay_rate_cents) : '',
          status: s.status,
          notes_internal: dbNotesInternal,
          notes_parent_facing: dbNotesParentFacing,
          homework_description: dbHomeworkDescription,
          homework_due_date: dbHomeworkDueDate,
          next_session_focus: dbNextSessionFocus,
        };
        setForm(dbForm);
        mountedFormSnapshotRef.current = getFormSnapshot(dbForm);
        lastSyncedRef.current = {
          notesInternal: dbNotesInternal,
          notesParentFacing: dbNotesParentFacing,
          homeworkDescription: dbHomeworkDescription,
          homeworkDueDate: dbHomeworkDueDate,
          nextSessionFocus: dbNextSessionFocus,
        };
        const draft = loadDraft(existingSessionDraftKey(s.id));
        if (draft) {
          const patched = { ...dbForm, ...draftToFormPatch(draft, dbForm) };
          if (getFormSnapshot(patched) === mountedFormSnapshotRef.current) {
            // Draft matches DB — stale, clean it up.
            clearDraft(existingSessionDraftKey(s.id), auth?.user.id);
          } else {
            setPendingRecovery(draft);
            setPendingRecoveryAt(draft.lastEditedAt);
          }
        }

        // Auto-enter edit mode when navigated from Resume.
        if (router.query.resume === 'true') {
          setEditing(true);
        }
      }
      setLoading(false);
    })();
  }, [id, router.query.resume]);

  // Layer 1: save full form to localStorage with 50ms debounce.
  useEffect(() => {
    if (!session || !form || !userId) return;
    const t = setTimeout(() => {
      const snapshot = getFormSnapshot(form);
      if (snapshot === lastDraftSnapshotRef.current) return;
      if (snapshot === mountedFormSnapshotRef.current) {
        // Form reverted to DB state — clear the draft.
        clearDraft(existingSessionDraftKey(session.id), userId);
        lastDraftSnapshotRef.current = '';
        return;
      }
      const student = students.find((s) => s.id === form.student_id) ?? session.student;
      const dateStr = form.scheduled_at
        ? new Date(form.scheduled_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })
        : '';
      const label = student ? `${student.name} — ${dateStr}` : `Session — ${dateStr}`;
      saveDraft(
        existingSessionDraftKey(session.id),
        {
          studentId: form.student_id || null,
          tutorId: form.tutor_id || null,
          subject: form.subject ?? '',
          topic: form.topic ?? '',
          sessionDate: splitDateTime(form.scheduled_at).date,
          sessionTime: splitDateTime(form.scheduled_at).time,
          durationMinutes: Number.isFinite(form.duration_minutes) ? form.duration_minutes : null,
          chargeRate: form.charge_rate !== '' && !Number.isNaN(Number(form.charge_rate)) ? Number(form.charge_rate) : null,
          payRate: form.pay_rate !== '' && !Number.isNaN(Number(form.pay_rate)) ? Number(form.pay_rate) : null,
          status: form.status ?? null,
          notesInternal: form.notes_internal ?? '',
          notesParentFacing: form.notes_parent_facing ?? '',
          homework: '',
          homeworkDescription: form.homework_description ?? '',
          homeworkDueDate: form.homework_due_date ?? '',
          nextSessionFocus: form.next_session_focus ?? '',
          polishedNotesDraft: null,
        },
        {
          userId,
          type: 'existing',
          label,
          studentName: student?.name ?? null,
          sessionDate: splitDateTime(form.scheduled_at).date,
        }
      );
      lastDraftSnapshotRef.current = snapshot;
    }, 50);
    return () => clearTimeout(t);
  }, [form, session, userId, students]);

  // Layer 2: debounced server sync (existing sessions only).
  useEffect(() => {
    if (!editing || !session || !form) return;
    const last = lastSyncedRef.current;
    if (!last) return;
    const notesInternal = form.notes_internal ?? '';
    const notesParentFacing = form.notes_parent_facing ?? '';
    const homeworkDescription = form.homework_description ?? '';
    const homeworkDueDate = form.homework_due_date ?? '';
    const nextSessionFocus = form.next_session_focus ?? '';
    if (
      notesInternal === last.notesInternal &&
      notesParentFacing === last.notesParentFacing &&
      homeworkDescription === last.homeworkDescription &&
      homeworkDueDate === last.homeworkDueDate &&
      nextSessionFocus === last.nextSessionFocus
    ) return;

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const { data: { session: auth } } = await supabase.auth.getSession();
        if (!auth?.access_token) {
          setSaveStatus('saved_local');
          return;
        }
        const res = await fetch(`/api/sessions/${session.id}/draft-save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.access_token}`,
          },
          body: JSON.stringify({
            notesInternal,
            notesParentFacing,
            homework: homeworkDescription,
            homeworkDescription,
            homeworkDueDate,
            nextSessionFocus,
          }),
        });
        if (res.ok) {
          lastSyncedRef.current = {
            notesInternal,
            notesParentFacing,
            homeworkDescription,
            homeworkDueDate,
            nextSessionFocus,
          };
          setSaveStatus('saved_remote');
        } else {
          setSaveStatus('saved_local');
        }
      } catch {
        setSaveStatus('saved_local');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    form?.notes_internal,
    form?.notes_parent_facing,
    form?.homework_description,
    form?.homework_due_date,
    form?.next_session_focus,
    editing,
    session,
  ]);

  // Fade "Saved" after 2s.
  useEffect(() => {
    if (saveStatus !== 'saved_remote') return;
    const t = setTimeout(() => {
      setSaveStatus((s) => (s === 'saved_remote' ? null : s));
    }, 2000);
    return () => clearTimeout(t);
  }, [saveStatus]);

  function restoreDraft() {
    if (!pendingRecovery || !form) return;
    setForm((f: any) => ({ ...f, ...draftToFormPatch(pendingRecovery, f) }));
    setPendingRecovery(null);
    setPendingRecoveryAt(null);
  }

  function discardDraft() {
    if (session) clearDraft(existingSessionDraftKey(session.id), userId ?? undefined);
    setPendingRecovery(null);
    setPendingRecoveryAt(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    const update: Record<string, unknown> = {
      student_id: form.student_id,
      tutor_id: form.tutor_id || null,
      subject: form.subject || null,
      topic: form.topic || null,
      scheduled_at: fromDateTimeLocalInput(form.scheduled_at),
      duration_minutes: Number(form.duration_minutes),
      charge_rate_cents: form.charge_rate ? dollarsToCents(form.charge_rate) : null,
      pay_rate_cents: form.pay_rate ? dollarsToCents(form.pay_rate) : null,
      status: form.status,
      notes_internal: form.notes_internal || null,
      notes_parent_facing: form.notes_parent_facing || null,
      homework: form.homework_description || null,
      homework_description: form.homework_description || null,
      homework_due_date: form.homework_due_date || null,
      next_session_focus: form.next_session_focus || null,
    };
    const { error: err } = await supabase.from('sessions').update(update).eq('id', session.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setPolishError(null);
    setEditingShared(false);
    clearDraft(existingSessionDraftKey(session.id), userId ?? undefined);
    setPendingRecovery(null);
    setPendingRecoveryAt(null);
    lastSyncedRef.current = {
      notesInternal: form.notes_internal ?? '',
      notesParentFacing: form.notes_parent_facing ?? '',
      homeworkDescription: form.homework_description ?? '',
      homeworkDueDate: form.homework_due_date ?? '',
      nextSessionFocus: form.next_session_focus ?? '',
    };
    mountedFormSnapshotRef.current = getFormSnapshot(form);
    lastDraftSnapshotRef.current = '';
    setSaveStatus(null);
    // refresh
    const { data: fresh } = await supabase
      .from('sessions').select('*, student:students(*), tutor:tutors(*)').eq('id', session.id).single();
    if (fresh) setSession(fresh as any);
    setEditing(false);
  }

  async function setStatus(status: Session['status']) {
    if (!session) return;
    const { error: err } = await supabase.from('sessions').update({ status }).eq('id', session.id);
    if (err) { setError(err.message); return; }
    setSession({ ...session, status });
  }

  async function togglePaid() {
    if (!session) return;
    const paid = !session.paid;
    const { error: err } = await supabase.from('sessions').update({ paid }).eq('id', session.id);
    if (err) { setError(err.message); return; }
    setSession({ ...session, paid });
  }

  async function deleteSession() {
    if (!session) return;
    if (!window.confirm(t('sessions:actions.delete_confirm'))) return;
    const { error: err } = await supabase.from('sessions').delete().eq('id', session.id);
    if (err) { setError(err.message); return; }
    router.push('/app/sessions');
  }

  if (loading) return <Layout title={t('sessions:title_loading')}><div className="card p-6 text-sm text-ink-muted">{t('sessions:loading')}</div></Layout>;
  if (denied) return (
    <Layout title={t('sessions:title_not_available')}>
      <div className="card p-6 text-sm text-ink-muted">
        {t('sessions:denied')}
      </div>
    </Layout>
  );
  if (!session) return <Layout title={t('sessions:title_not_found')}><div className="card p-6 text-sm text-ink-muted">{t('sessions:not_found')}</div></Layout>;

  const amount = sessionAmount(session);
  const pay = tutorPayAmount(session);

  return (
    <Layout
      pageTitle={t('sessions:subtitle_session')}
      subtitle={t('sessions:subtitle_session')}
      title={session.student?.name ?? t('sessions:subtitle_session')}
      actions={
        !editing ? (
          <>
            <button onClick={() => setEditing(true)} className="btn-secondary">{t('sessions:actions.edit')}</button>
            {session.status === 'scheduled' && (
              <button onClick={() => setStatus('completed')} className="btn-primary">
                {t('sessions:actions.mark_completed')}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      {editing && form ? (
        <form onSubmit={save} className="card p-8 space-y-5 max-w-2xl">
          {pendingRecovery && (
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 rounded bg-forest-soft border border-forest/20">
              <div className="text-sm text-forest-ink">
                {t('sessions:drafts.banner_unfinished', { when: pendingRecoveryAt ? relativeTime(pendingRecoveryAt) : '' })}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={restoreDraft} className="btn-primary text-xs">
                  {t('sessions:actions.restore')}
                </button>
                <button type="button" onClick={discardDraft} className="btn-ghost text-xs">
                  {t('sessions:actions.discard_draft')}
                </button>
              </div>
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('sessions:fields.student')}</label>
              <select required className="input" value={form.student_id}
                onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('sessions:fields.tutor')}</label>
              <select className="input" value={form.tutor_id}
                onChange={(e) => setForm({ ...form, tutor_id: e.target.value })}>
                <option value="">{t('sessions:fields.tutor_self')}</option>
                {tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('sessions:fields.subject')}</label>
              <input className="input" value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('sessions:fields.topic')}</label>
              <input className="input" value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('sessions:fields.when')}</label>
              <input type="datetime-local" className="input" value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('sessions:fields.duration')}</label>
              <input type="number" min="15" step="15" className="input"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
            </div>
          </div>
          <div className={cx('grid gap-4', isTutor ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
            {!isTutor && (
              <div>
                <label className="label">{t('sessions:fields.charge_rate')}</label>
                <input type="number" className="input" value={form.charge_rate}
                  onChange={(e) => setForm({ ...form, charge_rate: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label">{t('sessions:fields.pay_rate')}</label>
              <input type="number" className="input" value={form.pay_rate}
                onChange={(e) => setForm({ ...form, pay_rate: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('sessions:fields.status')}</label>
              <select className="input" value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="scheduled">{t('sessions:status_values.scheduled')}</option>
                <option value="completed">{t('sessions:status_values.completed')}</option>
                <option value="cancelled">{t('sessions:status_values.cancelled')}</option>
                <option value="no_show">{t('sessions:status_values.no_show')}</option>
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">{t('sessions:fields.notes_internal')}</label>
              <span className="text-2xs text-ink-soft transition-opacity" aria-live="polite">
                {saveStatus === 'saving' && t('sessions:save_status.saving')}
                {saveStatus === 'saved_remote' && t('sessions:save_status.saved')}
                {saveStatus === 'saved_local' && t('sessions:save_status.saved_locally')}
              </span>
            </div>
            <div className="relative">
              <textarea rows={4} className="input pr-16" value={form.notes_internal}
                onChange={(e) => setForm({ ...form, notes_internal: e.target.value })} />
              <div className="absolute bottom-2 right-2">
                <VoiceRecorder
                  context="session_note"
                  size="md"
                  onTranscript={(text) => setForm((f: any) => ({
                    ...f,
                    notes_internal: f.notes_internal
                      ? `${f.notes_internal.trim()}\n\n${text}`
                      : text,
                  }))}
                />
              </div>
            </div>
            <div className="text-2xs text-ink-soft mt-1.5">
              {t('sessions:fields.notes_internal_hint')}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={polishNotes}
                disabled={
                  polishing ||
                  !form.notes_internal ||
                  form.notes_internal.trim().length < 10 ||
                  !form.student_id ||
                  !Number(form.duration_minutes)
                }
                className="btn-ghost text-xs"
              >
                {polishing ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-ink-muted border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                    {t('sessions:actions.polishing')}
                  </span>
                ) : (
                  t('sessions:actions.polish_with_ai')
                )}
              </button>
              {(!form.student_id || !Number(form.duration_minutes)) && (
                <span className="text-2xs text-ink-soft">
                  {t('sessions:polish_needs_student_duration')}
                </span>
              )}
            </div>
            {polishError && (
              <div className="mt-3 text-sm text-claret">{polishError}</div>
            )}
          </div>

          <div>
            <label className="label">{t('sessions:fields.notes_parent_facing')}</label>
            <div className="text-2xs text-ink-soft mb-2">
              {t('sessions:fields.notes_parent_facing_hint')}
            </div>
            {editingShared ? (
              <div className="space-y-2">
                <textarea rows={4} className="input" value={form.notes_parent_facing}
                  onChange={(e) => setForm({ ...form, notes_parent_facing: e.target.value })}
                  placeholder={t('sessions:fields.notes_parent_facing_placeholder')}
                  autoFocus />
                <button type="button" onClick={() => setEditingShared(false)} className="btn-ghost text-xs">
                  {t('sessions:actions.done_editing')}
                </button>
              </div>
            ) : form.notes_parent_facing ? (
              <div className="card p-5 bg-forest-soft border-forest/20">
                <p className="text-sm text-forest-ink leading-relaxed whitespace-pre-wrap mb-4">
                  {form.notes_parent_facing}
                </p>
                <div className="flex items-center justify-between pt-3 border-t border-forest/20">
                  <div className="text-2xs text-forest-ink/80 inline-flex items-center gap-1.5">
                    <span aria-hidden="true">✓</span>
                    {t('sessions:fields.shared_with_parent')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingShared(true)}
                    className="text-2xs text-forest-ink/80 underline underline-offset-2 hover:text-forest-ink"
                  >
                    {t('sessions:actions.edit_shared')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 border border-dashed border-rule rounded text-sm text-ink-soft italic">
                {t('sessions:fields.nothing_shared_yet')}
              </div>
            )}
          </div>
          <div>
            <label className="label">{t('sessions:fields.homework')}</label>
            <div className="relative">
              <textarea rows={4} className="input pr-16" value={form.homework_description ?? ''}
                onChange={(e) => setForm({ ...form, homework_description: e.target.value })}
                placeholder={t('sessions:fields.homework_placeholder')} />
              <div className="absolute bottom-2 right-2">
                <VoiceRecorder
                  context="session_note"
                  size="md"
                  onTranscript={(text) => setForm((f: any) => ({
                    ...f,
                    homework_description: f.homework_description
                      ? `${f.homework_description.trim()}\n\n${text}`
                      : text,
                  }))}
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="label text-2xs">{t('sessions:fields.homework_due_by')}</label>
              <input
                type="date"
                className="input md:w-48"
                value={form.homework_due_date || (form.homework_description ? addDays(fromDateTimeLocalInput(form.scheduled_at) || new Date().toISOString(), 7) : '')}
                onChange={(e) => setForm({ ...form, homework_due_date: e.target.value })}
              />
            </div>
            <div className="text-2xs text-ink-soft mt-1.5">
              {t('sessions:fields.homework_hint')}
            </div>
          </div>

          <div>
            <label className="label">{t('sessions:fields.next_focus')}</label>
            <div className="relative">
              <textarea rows={3} className="input pr-16" value={form.next_session_focus ?? ''}
                onChange={(e) => setForm({ ...form, next_session_focus: e.target.value })}
                placeholder={t('sessions:fields.next_focus_placeholder')} />
              <div className="absolute bottom-2 right-2">
                <VoiceRecorder
                  context="session_note"
                  size="md"
                  onTranscript={(text) => setForm((f: any) => ({
                    ...f,
                    next_session_focus: f.next_session_focus
                      ? `${f.next_session_focus.trim()}\n\n${text}`
                      : text,
                  }))}
                />
              </div>
            </div>
            <div className="text-2xs text-ink-soft mt-1.5">
              {t('sessions:fields.next_focus_hint')}
            </div>
          </div>

          {error && <div className="text-sm text-claret">{error}</div>}

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? t('sessions:actions.saving') : t('sessions:actions.save')}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">{t('sessions:actions.cancel')}</button>
            </div>
            <button type="button" onClick={deleteSession} className="btn-danger text-xs">{t('sessions:actions.delete')}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-6 mb-8">
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('sessions:detail.when')}</div>
              <div className="font-display text-2xl tracking-tightest">
                {fmt.formatDate(session.scheduled_at, { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
              <div className="text-sm font-mono text-ink-muted mt-1">
                {fmt.formatTimeOfDay(session.scheduled_at)} · {session.duration_minutes} min
              </div>
            </div>
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('sessions:detail.what')}</div>
              <div className="text-sm">
                <div className="text-ink">{session.subject ?? '—'}</div>
                <div className="text-ink-muted">{session.topic ?? '—'}</div>
                <div className="text-ink-muted mt-2">
                  {session.tutor?.name
                    ? t('sessions:detail.tutor_with', { name: session.tutor.name })
                    : t('sessions:detail.tutor_you')}
                </div>
              </div>
            </div>
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('sessions:detail.money')}</div>
              <div className="text-sm space-y-1">
                <div className="font-mono num text-ink text-base">{fmt.formatMoney(amount, currency, { showZero: true })} <span className="text-2xs text-ink-soft uppercase tracking-widest">{t('sessions:detail.charge')}</span></div>
                {session.pay_rate_cents && (
                  <div className="font-mono num text-ink-muted">{fmt.formatMoney(pay, currency, { showZero: true })} <span className="text-2xs text-ink-soft uppercase tracking-widest">{t('sessions:detail.tutor_pay')}</span></div>
                )}
                <div className="pt-2">
                  <span className={cx(
                    session.status === 'completed' && (session.paid ? 'badge-forest' : 'badge-rust'),
                    session.status === 'cancelled' && 'badge-neutral',
                    session.status === 'no_show' && 'badge-claret',
                    session.status === 'scheduled' && 'badge-neutral'
                  )}>
                    {session.status === 'completed'
                      ? (session.paid ? t('sessions:status.paid') : t('sessions:status.unpaid'))
                      : t(`sessions:status.${session.status}` as any)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-8">
            {session.status === 'scheduled' && (
              <>
                <button onClick={() => setStatus('completed')} className="btn-secondary text-xs">{t('sessions:actions.mark_completed')}</button>
                <button onClick={() => setStatus('cancelled')} className="btn-ghost text-xs">{t('sessions:actions.cancel_session')}</button>
                <button onClick={() => setStatus('no_show')} className="btn-ghost text-xs">{t('sessions:actions.no_show')}</button>
              </>
            )}
            {session.status === 'completed' && (
              <button onClick={togglePaid} className="btn-secondary text-xs">
                {t('sessions:actions.mark_paid', {
                  status: session.paid ? t('sessions:status.unpaid').toLowerCase() : t('sessions:status.paid').toLowerCase(),
                })}
              </button>
            )}
            <Link href={`/app/students/${session.student_id}`} className="btn-ghost text-xs">{t('sessions:actions.view_student')}</Link>
          </div>

          <div className="card p-6 mb-4">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-4">
              {t('sessions:detail.files')}
            </div>
            <FilesPanel
              scope={{ kind: 'session', session_id: session.id, student_id: session.student_id }}
              students={[]}
            />
          </div>

          {(session as any).notes_parent_facing && (
            <div className="card p-6 mb-4 bg-forest-soft border-forest/20">
              <div className="text-2xs uppercase tracking-widest text-forest-ink/70 mb-3">
                {t('sessions:detail.parent_facing_notes')}
              </div>
              <p className="text-sm text-forest-ink leading-relaxed whitespace-pre-wrap">
                {(session as any).notes_parent_facing}
              </p>
            </div>
          )}

          {(session as any).notes_internal && (
            <div className="card p-6 mb-4">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">
                {t('sessions:detail.private_notes')}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {(session as any).notes_internal}
              </p>
            </div>
          )}

          {(session.homework_description || session.homework) && (
            <div className="card p-6 mb-4">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('sessions:detail.homework_set')}</div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap mb-3">
                {session.homework_description || session.homework}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-2xs">
                {session.homework_due_date && (
                  <span className="text-ink-muted">
                    {t('sessions:detail.due_prefix', { date: fmt.formatDate(session.homework_due_date, { day: 'numeric', month: 'short' }) })}
                  </span>
                )}
                {session.homework_completed_at ? (
                  <span className="badge-forest">{t('sessions:detail.completed_badge')}</span>
                ) : session.homework_due_date && new Date(session.homework_due_date) < new Date() ? (
                  <span className="badge-rust">{t('sessions:detail.overdue_badge')}</span>
                ) : null}
              </div>
            </div>
          )}

          {session.next_session_focus && (
            <div className="card p-6 bg-forest-soft border-forest/20">
              <div className="text-2xs uppercase tracking-widest text-forest-ink/70 mb-3">{t('sessions:detail.next_focus')}</div>
              <p className="text-sm text-forest-ink leading-relaxed whitespace-pre-wrap">{session.next_session_focus}</p>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

export default function SessionDetail() {
  return <AuthGuard><SessionDetailInner /></AuthGuard>;
}
