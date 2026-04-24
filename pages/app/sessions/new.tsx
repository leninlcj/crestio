import { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { getCurrentOrganizationId } from '../../../lib/organization';
import { useMembership } from '../../../lib/membershipContext';
import { useBilling } from '../../../lib/billingContext';
import { Student, Tutor } from '../../../lib/types';
import VoiceRecorder from '../../../components/voice/VoiceRecorder';
import {
  saveDraft,
  loadDraft,
  clearDraft,
  newSessionDraftKey,
  SessionDraft,
} from '../../../lib/sessionDrafts';
import {
  dollarsToCents,
  centsToDollars,
  toDateTimeLocalInput,
  fromDateTimeLocalInput,
} from '../../../lib/utils';

type FormState = {
  student_id: string;
  tutor_id: string;
  subject: string;
  topic: string;
  scheduled_at: string;
  duration_minutes: number;
  charge_rate: string;
  pay_rate: string;
  status: 'scheduled' | 'completed';
  notes_internal: string;
  notes_parent_facing: string;
  homework_description: string;
  homework_due_date: string;
  next_session_focus: string;
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function splitDateTime(local: string): { date: string | null; time: string | null } {
  if (!local || !local.includes('T')) return { date: null, time: null };
  const [date, time] = local.split('T');
  return { date: date || null, time: time ? time.slice(0, 5) : null };
}

function joinDateTime(date: string | null, time: string | null): string | null {
  if (!date || !time) return null;
  return `${date}T${time}`;
}

function formToDraft(form: FormState, polishAccepted: boolean): Omit<SessionDraft, 'lastEditedAt'> {
  const { date, time } = splitDateTime(form.scheduled_at);
  return {
    studentId: form.student_id || null,
    tutorId: form.tutor_id || null,
    subject: form.subject,
    topic: form.topic,
    sessionDate: date,
    sessionTime: time,
    durationMinutes: Number.isFinite(form.duration_minutes) ? form.duration_minutes : null,
    chargeRate: form.charge_rate !== '' && !Number.isNaN(Number(form.charge_rate)) ? Number(form.charge_rate) : null,
    payRate: form.pay_rate !== '' && !Number.isNaN(Number(form.pay_rate)) ? Number(form.pay_rate) : null,
    status: form.status || null,
    notesInternal: form.notes_internal,
    notesParentFacing: form.notes_parent_facing,
    homework: '',
    homeworkDescription: form.homework_description,
    homeworkDueDate: form.homework_due_date,
    nextSessionFocus: form.next_session_focus,
    polishedNotesDraft: polishAccepted && form.notes_parent_facing ? form.notes_parent_facing : null,
  };
}

function draftToForm(draft: SessionDraft, defaults: FormState): FormState {
  const scheduled = joinDateTime(draft.sessionDate, draft.sessionTime) || defaults.scheduled_at;
  return {
    student_id: draft.studentId ?? '',
    tutor_id: draft.tutorId ?? defaults.tutor_id,
    subject: draft.subject || defaults.subject,
    topic: draft.topic || defaults.topic,
    scheduled_at: scheduled,
    duration_minutes: draft.durationMinutes ?? defaults.duration_minutes,
    charge_rate: draft.chargeRate !== null ? String(draft.chargeRate) : '',
    pay_rate: draft.payRate !== null ? String(draft.payRate) : '',
    status: (draft.status === 'completed' || draft.status === 'scheduled') ? draft.status : 'scheduled',
    notes_internal: draft.notesInternal,
    notes_parent_facing: draft.notesParentFacing,
    homework_description: draft.homeworkDescription || draft.homework || '',
    homework_due_date: draft.homeworkDueDate || '',
    next_session_focus: draft.nextSessionFocus || '',
  };
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

function NewSessionInner() {
  const router = useRouter();
  const { t } = useTranslation(['sessions', 'common']);
  const { membership, loading: membershipLoading } = useMembership();
  const { status: billingStatus, openPaywall } = useBilling();
  const isTutor = membership?.role === 'tutor';
  const [userId, setUserId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [defaultRate, setDefaultRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [polishAccepted, setPolishAccepted] = useState(false);
  const [editingShared, setEditingShared] = useState(false);
  const [saveStatus, setSaveStatus] = useState<null | 'saved_local'>(null);
  const [hydrated, setHydrated] = useState(false);
  const [resumeBanner, setResumeBanner] = useState<string | null>(null);

  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);

  const [form, setForm] = useState<FormState>({
    student_id: '',
    tutor_id: '',
    subject: '',
    topic: '',
    scheduled_at: toDateTimeLocalInput(now.toISOString()),
    duration_minutes: 60,
    charge_rate: '',
    pay_rate: '',
    status: 'scheduled',
    notes_internal: '',
    notes_parent_facing: '',
    homework_description: '',
    homework_due_date: '',
    next_session_focus: '',
  });

  const defaultFormSnapshotRef = useRef<string>(JSON.stringify(form));
  const lastSavedSnapshotRef = useRef<string>('');

  // Initial load: user + students/tutors + profile + (draft or preset)
  useEffect(() => {
    if (!router.isReady) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);

      const [{ data: ss }, { data: ts }, { data: p }] = await Promise.all([
        (isTutor && membership?.tutor_id
          ? supabase.from('students').select('*').eq('archived', false).eq('primary_tutor_id', membership.tutor_id).order('name')
          : supabase.from('students').select('*').eq('archived', false).order('name')),
        supabase.from('tutors').select('*').eq('archived', false).order('name'),
        supabase.from('profiles').select('default_rate_cents').eq('id', session.user.id).single(),
      ]);
      setStudents(ss ?? []);
      setTutors(ts ?? []);
      if (p?.default_rate_cents) setDefaultRate(p.default_rate_cents);

      const draft = loadDraft(newSessionDraftKey(session.user.id));
      const resumeParam = router.query.resume === 'true';

      if (draft) {
        setForm((f) => draftToForm(draft, f));
        if (polishedFlagFromDraft(draft)) setPolishAccepted(true);
        if (!resumeParam) {
          setResumeBanner(`You have unfinished changes from ${relativeTime(draft.lastEditedAt)}.`);
        }
      } else {
        // Preset from ?student=<id>
        const presetStudent = router.query.student;
        const prefillFocus = router.query.prefill_focus;
        const focusText = typeof prefillFocus === 'string' && prefillFocus.trim()
          ? `Focus from last session: ${prefillFocus}\n\n`
          : '';
        if (typeof presetStudent === 'string') {
          const s = (ss ?? []).find((x) => x.id === presetStudent);
          if (s) {
            const rate = s.hourly_rate_cents ?? p?.default_rate_cents ?? null;
            setForm((f) => ({
              ...f,
              student_id: s.id,
              charge_rate: rate ? centsToDollars(rate) : '',
              notes_internal: focusText || f.notes_internal,
            }));
          } else if (focusText) {
            setForm((f) => ({ ...f, notes_internal: focusText }));
          }
        } else if (focusText) {
          setForm((f) => ({ ...f, notes_internal: focusText }));
        }
      }

      setHydrated(true);
    })();
  }, [router.isReady, router.query]);

  // Full-form debounced draft save (50ms) — skips saves when the form
  // matches the original defaults (nothing worth recovering).
  useEffect(() => {
    if (!hydrated || !userId) return;
    const t = setTimeout(() => {
      const snapshot = JSON.stringify(form);
      if (snapshot === lastSavedSnapshotRef.current) return;
      if (snapshot === defaultFormSnapshotRef.current) {
        clearDraft(newSessionDraftKey(userId), userId);
        lastSavedSnapshotRef.current = '';
        return;
      }
      const student = students.find((s) => s.id === form.student_id) ?? null;
      const label = student ? `New session for ${student.name}` : 'New session';
      saveDraft(
        newSessionDraftKey(userId),
        formToDraft(form, polishAccepted),
        {
          userId,
          type: 'new',
          label,
          studentName: student?.name ?? null,
          sessionDate: splitDateTime(form.scheduled_at).date,
        }
      );
      lastSavedSnapshotRef.current = snapshot;
      setSaveStatus('saved_local');
    }, 50);
    return () => clearTimeout(t);
  }, [form, hydrated, userId, students, polishAccepted]);

  function selectStudent(id: string) {
    const s = students.find((x) => x.id === id);
    const rate = s?.hourly_rate_cents ?? defaultRate ?? null;
    setForm({
      ...form,
      student_id: id,
      charge_rate: rate && !form.charge_rate ? centsToDollars(rate) : form.charge_rate,
    });
  }

  function selectTutor(id: string) {
    const t = tutors.find((x) => x.id === id);
    setForm({
      ...form,
      tutor_id: id,
      pay_rate: t?.pay_rate_cents ? centsToDollars(t.pay_rate_cents) : form.pay_rate,
    });
  }

  function startFresh() {
    if (!userId) return;
    clearDraft(newSessionDraftKey(userId), userId);
    lastSavedSnapshotRef.current = '';
    const fresh = new Date();
    fresh.setMinutes(0, 0, 0);
    fresh.setHours(fresh.getHours() + 1);
    setForm({
      student_id: '',
      tutor_id: '',
      subject: '',
      topic: '',
      scheduled_at: toDateTimeLocalInput(fresh.toISOString()),
      duration_minutes: 60,
      charge_rate: '',
      pay_rate: '',
      status: 'scheduled',
      notes_internal: '',
      notes_parent_facing: '',
      homework_description: '',
      homework_due_date: '',
      next_session_focus: '',
    });
    setPolishAccepted(false);
    setResumeBanner(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (billingStatus && !billingStatus.is_active) {
      openPaywall(
        billingStatus.subscription_status === 'trialing'
          ? 'trial_expired'
          : billingStatus.subscription_status === 'past_due'
          ? 'subscription_past_due'
          : 'canceled',
      );
      return;
    }

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not signed in.'); setLoading(false); return; }
    const organizationId = await getCurrentOrganizationId();
    if (!organizationId) { setError('No organisation is linked to your account. Contact support@crestio.ai.'); setLoading(false); return; }

    // tutor_user_id: for tutors, always themselves. For owners, use the selected
    // tutor's auth_user_id if any, otherwise themselves.
    let tutorUserId: string | null = session.user.id;
    if (!isTutor && form.tutor_id) {
      const t = tutors.find((x) => x.id === form.tutor_id);
      tutorUserId = (t as any)?.auth_user_id ?? session.user.id;
    }

    // Tutors: charge_rate is not shown or editable; default to the student's
    // hourly_rate_cents. pay_rate is editable with a default from their tutor row.
    let chargeRateCents: number | null = form.charge_rate ? dollarsToCents(form.charge_rate) : null;
    if (isTutor) {
      const s = students.find((x) => x.id === form.student_id);
      chargeRateCents = s?.hourly_rate_cents ?? null;
    }

    const insert: Record<string, unknown> = {
      owner_id: session.user.id,
      organization_id: organizationId,
      student_id: form.student_id,
      tutor_id: form.tutor_id || null,
      tutor_user_id: tutorUserId,
      subject: form.subject || null,
      topic: form.topic || null,
      scheduled_at: fromDateTimeLocalInput(form.scheduled_at),
      duration_minutes: Number(form.duration_minutes) || 60,
      charge_rate_cents: chargeRateCents,
      pay_rate_cents: form.pay_rate ? dollarsToCents(form.pay_rate) : null,
      status: form.status,
      notes_internal: form.notes_internal || null,
      notes_parent_facing: form.notes_parent_facing || null,
      homework: form.homework_description || null,
      homework_description: form.homework_description || null,
      homework_due_date: form.homework_due_date || null,
      next_session_focus: form.next_session_focus || null,
    };
    if (polishAccepted) {
      insert.notes_polished_by_ai = true;
    }

    const { data, error: err } = await supabase.from('sessions').insert(insert).select().single();

    setLoading(false);
    if (err) {
      if (err.code === '42501' && billingStatus && !billingStatus.is_active) {
        openPaywall(
          billingStatus.subscription_status === 'trialing'
            ? 'trial_expired'
            : billingStatus.subscription_status === 'past_due'
            ? 'subscription_past_due'
            : 'canceled',
        );
        return;
      }
      setError(err.message);
      return;
    }
    if (userId) clearDraft(newSessionDraftKey(userId), userId);
    router.push(`/app/sessions/${data.id}`);
  }

  async function polishNotes() {
    if (!form.notes_internal || form.notes_internal.trim().length < 10) return;
    if (!form.student_id) return;
    if (!Number(form.duration_minutes)) return;
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
      setForm((f) => ({ ...f, notes_parent_facing: text }));
      setPolishAccepted(true);
      setEditingShared(false);
    } catch {
      setPolishError('Something went wrong. Your notes are still saved — please try again in a moment.');
    } finally {
      setPolishing(false);
    }
  }

  if (students.length === 0 && hydrated) {
    return (
      <Layout subtitle={t('sessions:subtitle')} title={t('sessions:title_new')}>
        <div className="card p-8 text-center">
          <div className="font-display text-2xl mb-2 tracking-tightest">{t('sessions:empty.add_student_first_title')}</div>
          <p className="text-sm text-ink-muted mb-5">{t('sessions:empty.add_student_first_body')}</p>
          <Link href="/app/students/new" className="btn-primary inline-flex">{t('sessions:empty.add_student_cta')}</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout subtitle="Sessions" title="Log session">
      <div className="max-w-2xl">
        {resumeBanner && (
          <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 rounded bg-forest-soft border border-forest/20">
            <div className="text-sm text-forest-ink">{resumeBanner}</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setResumeBanner(null)} className="btn-ghost text-xs">
                Keep
              </button>
              <button type="button" onClick={startFresh} className="btn-ghost text-xs text-claret">
                Start fresh
              </button>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="card p-8 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Student *</label>
              <select required className="input" value={form.student_id}
                onChange={(e) => selectStudent(e.target.value)}>
                <option value="">Select a student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            {!isTutor && (
              <div>
                <label className="label">Tutor</label>
                <select className="input" value={form.tutor_id}
                  onChange={(e) => selectTutor(e.target.value)}>
                  <option value="">You</option>
                  {tutors.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Subject</label>
              <input className="input" value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="e.g. Maths Advanced" />
            </div>
            <div>
              <label className="label">Topic</label>
              <input className="input" value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                placeholder="e.g. Parabolas" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">When *</label>
              <input type="datetime-local" required className="input" value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
            </div>
            <div>
              <label className="label">Duration (minutes) *</label>
              <input type="number" required min="15" step="15" className="input"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
            </div>
          </div>

          <div className={isTutor ? '' : 'grid md:grid-cols-2 gap-4'}>
            {!isTutor && (
              <div>
                <label className="label">Charge rate (per hour)</label>
                <input type="number" min="0" className="input" value={form.charge_rate}
                  onChange={(e) => setForm({ ...form, charge_rate: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label">Tutor pay rate (per hour)</label>
              <input type="number" min="0" className="input" value={form.pay_rate}
                onChange={(e) => setForm({ ...form, pay_rate: e.target.value })} />
              <div className="text-2xs text-ink-soft mt-1.5">Leave blank if you tutored this session.</div>
            </div>
          </div>

          <div>
            <label className="label">Status</label>
            <select className="input md:w-48" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Private notes</label>
              <span className="text-2xs text-ink-soft" aria-live="polite">
                {saveStatus === 'saved_local' && 'Saved locally'}
              </span>
            </div>
            <div className="relative">
              <textarea rows={4} className="input pr-16" value={form.notes_internal}
                onChange={(e) => setForm({ ...form, notes_internal: e.target.value })}
                placeholder="What did you cover? How did it go?" />
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
              Only you see these. Tap the mic to dictate — transcripts append. Click Polish with AI to publish a parent-friendly version.
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
                    Polishing…
                  </span>
                ) : (
                  'Polish with AI'
                )}
              </button>
              {(!form.student_id || !Number(form.duration_minutes)) && (
                <span className="text-2xs text-ink-soft">
                  Select a student and duration first.
                </span>
              )}
            </div>
            {polishError && (
              <div className="mt-3 text-sm text-claret">{polishError}</div>
            )}
          </div>

          <div>
            <label className="label">Shared with parent</label>
            <div className="text-2xs text-ink-soft mb-2">
              What parents see in their portal. Auto-filled when you polish.
            </div>
            {editingShared ? (
              <div className="space-y-2">
                <textarea rows={4} className="input" value={form.notes_parent_facing}
                  onChange={(e) => setForm({ ...form, notes_parent_facing: e.target.value })}
                  placeholder="Parent-facing notes."
                  autoFocus />
                <button type="button" onClick={() => setEditingShared(false)} className="btn-ghost text-xs">
                  Done editing
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
                    Shared with parent on save
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingShared(true)}
                    className="text-2xs text-forest-ink/80 underline underline-offset-2 hover:text-forest-ink"
                  >
                    Edit shared version
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 border border-dashed border-rule rounded text-sm text-ink-soft italic">
                Nothing shared yet. Click Polish with AI to publish notes to the parent dashboard.
              </div>
            )}
          </div>

          <div>
            <label className="label">Homework for next session</label>
            <div className="relative">
              <textarea rows={4} className="input pr-16" value={form.homework_description}
                onChange={(e) => setForm({ ...form, homework_description: e.target.value })}
                placeholder="e.g. Read chapter 7, complete exercises 3-9." />
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
              <label className="label text-2xs">Due by</label>
              <input
                type="date"
                className="input md:w-48"
                value={form.homework_due_date || (form.homework_description ? addDays(fromDateTimeLocalInput(form.scheduled_at) || new Date().toISOString(), 7) : '')}
                onChange={(e) => setForm({ ...form, homework_due_date: e.target.value })}
              />
            </div>
            <div className="text-2xs text-ink-soft mt-1.5">
              Parents will see this in the portal and can mark it complete.
            </div>
          </div>

          <div>
            <label className="label">Focus for next session</label>
            <div className="relative">
              <textarea rows={3} className="input pr-16" value={form.next_session_focus}
                onChange={(e) => setForm({ ...form, next_session_focus: e.target.value })}
                placeholder="e.g. Cover integration by parts. Revisit the trig identity from today." />
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
              Shows up as a reminder when you open this student next time.
            </div>
          </div>

          {error && <div className="text-sm text-claret">{error}</div>}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Saving…' : 'Save session'}
            </button>
            <Link href="/app/sessions" className="btn-ghost">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}

function polishedFlagFromDraft(draft: SessionDraft): boolean {
  return !!(draft.polishedNotesDraft && draft.polishedNotesDraft.trim());
}

export default function NewSession() {
  return <AuthGuard><NewSessionInner /></AuthGuard>;
}
