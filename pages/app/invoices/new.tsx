import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { getCurrentOrganizationId } from '../../../lib/organization';
import { Student, Session } from '../../../lib/types';
import {
  formatCents,
  formatDateTime,
  sessionAmount,
  generateInvoiceNumber,
} from '../../../lib/utils';

function NewInvoiceInner() {
  const router = useRouter();
  const { t } = useTranslation(['invoices', 'students', 'sessions', 'common']);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('AUD');
  const [dueDays, setDueDays] = useState(14);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: p } = await supabase
          .from('profiles').select('currency').eq('id', session.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }
      const { data } = await supabase.from('students').select('*').eq('archived', false).order('name');
      setStudents(data ?? []);
      // Pre-fill student from query (?student=<id>) — used by Cmd+K's "invoice zane".
      const presetStudent = router.query.student;
      if (typeof presetStudent === 'string' && (data ?? []).some((s) => s.id === presetStudent)) {
        setStudentId(presetStudent);
      }
    })();
  }, [router.query.student]);

  useEffect(() => {
    if (!studentId) { setSessions([]); setChecked(new Set()); return; }
    (async () => {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'completed')
        .is('invoice_id', null)
        .order('scheduled_at', { ascending: true });
      setSessions(data ?? []);
      // preselect all
      setChecked(new Set((data ?? []).map((s) => s.id)));
    })();
  }, [studentId]);

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
  }

  const selected = sessions.filter((s) => checked.has(s.id));
  const subtotal = selected.reduce((a, s) => a + sessionAmount(s), 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.length === 0) { setError('Select at least one session.'); return; }
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError('Not signed in.'); setLoading(false); return; }
    const organizationId = await getCurrentOrganizationId();
    if (!organizationId) { setError('No organisation is linked to your account. Contact hello@crestio.ai.'); setLoading(false); return; }

    // Get count of existing invoices to generate next number
    const { count } = await supabase
      .from('invoices').select('*', { count: 'exact', head: true });

    const issued = new Date();
    const due = new Date();
    due.setDate(issued.getDate() + dueDays);

    const { data: inv, error: err } = await supabase.from('invoices').insert({
      owner_id: session.user.id,
      organization_id: organizationId,
      student_id: studentId,
      number: generateInvoiceNumber(count ?? 0),
      issued_on: issued.toISOString().slice(0, 10),
      due_on: due.toISOString().slice(0, 10),
      subtotal_cents: subtotal,
      total_cents: subtotal,
      status: 'draft',
      notes: notes || null,
    }).select().single();

    if (err) { setError(err.message); setLoading(false); return; }

    // link sessions to this invoice
    const { error: linkErr } = await supabase
      .from('sessions')
      .update({ invoice_id: inv.id })
      .in('id', Array.from(checked));

    setLoading(false);
    if (linkErr) { setError(linkErr.message); return; }
    router.push(`/app/invoices/${inv.id}`);
  }

  if (students.length === 0) {
    return (
      <Layout subtitle={t('invoices:title_list')} title={t('invoices:title_new')}>
        <div className="card p-8 text-center">
          <div className="font-display text-2xl mb-2 tracking-tightest">{t('sessions:empty.add_student_first_title', { defaultValue: 'Add a student first' })}</div>
          <p className="text-sm text-ink-muted mb-5">Invoices belong to a student.</p>
          <Link href="/app/students/new" className="btn-primary inline-flex">{t('students:actions.add')}</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout subtitle={t('invoices:title_list')} title={t('invoices:title_new')}>
      <div className="max-w-3xl">
        <form onSubmit={onSubmit} className="card p-8 space-y-6">
          <div>
            <label className="label">Student *</label>
            <select required className="input md:max-w-md" value={studentId}
              onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Select a student</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {studentId && (
            <>
              <div>
                <div className="label">Unbilled completed sessions</div>
                {sessions.length === 0 ? (
                  <div className="text-sm text-ink-muted bg-ruleSoft/40 border border-rule rounded p-4">
                    No unbilled completed sessions for this student.
                  </div>
                ) : (
                  <div className="border border-rule rounded divide-y divide-ruleSoft">
                    {sessions.map((s) => (
                      <label key={s.id} className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-ruleSoft/50">
                        <input
                          type="checkbox"
                          checked={checked.has(s.id)}
                          onChange={() => toggle(s.id)}
                          className="h-4 w-4 accent-forest"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink">
                            {formatDateTime(s.scheduled_at)}
                          </div>
                          <div className="text-xs text-ink-muted truncate">
                            {[s.subject, s.topic].filter(Boolean).join(' · ') || '–'} · {s.duration_minutes} min
                          </div>
                        </div>
                        <div className="font-mono num text-sm">
                          {formatCents(sessionAmount(s), currency)}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Due in (days)</label>
                  <input type="number" min="0" className="input" value={dueDays}
                    onChange={(e) => setDueDays(Number(e.target.value))} />
                </div>
                <div className="flex items-end">
                  <div className="w-full bg-forest-soft border border-forest/20 rounded p-4">
                    <div className="text-2xs uppercase tracking-widest text-forest-ink mb-1">Invoice total</div>
                    <div className="font-display text-3xl tracking-tightest text-forest-ink num">
                      {formatCents(subtotal, currency, { showZero: true })}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="label">Notes (optional)</label>
                <textarea rows={3} className="input" value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment details, bank info, etc." />
              </div>
            </>
          )}

          {error && <div className="text-sm text-claret">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading || !studentId || selected.length === 0} className="btn-primary">
              {loading ? 'Creating…' : 'Create invoice'}
            </button>
            <Link href="/app/invoices" className="btn-ghost">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}

export default function NewInvoice() {
  return <AuthGuard><OwnerOnly><NewInvoiceInner /></OwnerOnly></AuthGuard>;
}
