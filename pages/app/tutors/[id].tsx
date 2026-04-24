import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { Tutor, Session } from '../../../lib/types';
import {
  formatCents,
  formatDateTime,
  centsToDollars,
  dollarsToCents,
  tutorPayAmount,
  cx,
} from '../../../lib/utils';

function TutorDetailInner() {
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState('AUD');
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    (async () => {
      setLoading(true);
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (auth) {
        const { data: p } = await supabase.from('profiles').select('currency').eq('id', auth.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }
      const [{ data: t }, { data: ss }] = await Promise.all([
        supabase.from('tutors').select('*').eq('id', id).single(),
        supabase.from('sessions').select('*').eq('tutor_id', id).order('scheduled_at', { ascending: false }).limit(20),
      ]);
      setTutor(t);
      setSessions(ss ?? []);
      if (t) {
        setForm({
          name: t.name,
          email: t.email ?? '',
          phone: t.phone ?? '',
          subjects: (t.subjects ?? []).join(', '),
          pay_rate: t.pay_rate_cents ? centsToDollars(t.pay_rate_cents) : '',
          notes: t.notes ?? '',
        });
      }
      setLoading(false);
    })();
  }, [id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!tutor) return;
    setSaving(true);
    setError(null);
    const subjects = form.subjects.split(',').map((s: string) => s.trim()).filter(Boolean);
    const { error: err } = await supabase.from('tutors').update({
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      subjects,
      pay_rate_cents: form.pay_rate ? dollarsToCents(form.pay_rate) : null,
      notes: form.notes || null,
    }).eq('id', tutor.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    const { data: fresh } = await supabase.from('tutors').select('*').eq('id', tutor.id).single();
    if (fresh) setTutor(fresh);
    setEditing(false);
  }

  async function deleteTutor() {
    if (!tutor) return;
    const ok = window.confirm(`Delete ${tutor.name}? Their past sessions stay, but lose the tutor link. This cannot be undone.`);
    if (!ok) return;
    const { error: err } = await supabase.from('tutors').delete().eq('id', tutor.id);
    if (err) { setError(err.message); return; }
    router.push('/app/tutors');
  }

  if (loading) return <Layout title="…"><div className="card p-6 text-sm text-ink-muted">Loading…</div></Layout>;
  if (!tutor) return <Layout title="Not found"><div className="card p-6 text-sm text-ink-muted">Tutor not found.</div></Layout>;

  const totalOwed = sessions
    .filter((s) => s.status === 'completed')
    .reduce((a, s) => a + tutorPayAmount(s), 0);

  return (
    <Layout
      subtitle="Tutor"
      title={tutor.name}
      actions={!editing ? <button onClick={() => setEditing(true)} className="btn-secondary">Edit</button> : undefined}
    >
      {editing && form ? (
        <form onSubmit={save} className="card p-8 space-y-5 max-w-2xl">
          <div>
            <label className="label">Name</label>
            <input required className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Subjects</label>
            <input className="input" value={form.subjects}
              onChange={(e) => setForm({ ...form, subjects: e.target.value })} />
          </div>
          <div>
            <label className="label">Pay rate</label>
            <input type="number" min="0" className="input" value={form.pay_rate}
              onChange={(e) => setForm({ ...form, pay_rate: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={3} className="input" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {error && <div className="text-sm text-claret">{error}</div>}
          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
            </div>
            <button type="button" onClick={deleteTutor} className="btn-danger text-xs">Delete</button>
          </div>
        </form>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-6 mb-8">
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Contact</div>
              <div className="space-y-2 text-sm">
                {tutor.email && <div>{tutor.email}</div>}
                {tutor.phone && <div>{tutor.phone}</div>}
                {!tutor.email && !tutor.phone && <div className="text-ink-soft">No contact.</div>}
              </div>
            </div>
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Teaches</div>
              <div className="text-sm text-ink-muted">
                {tutor.subjects && tutor.subjects.length > 0 ? tutor.subjects.join(', ') : '—'}
              </div>
            </div>
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Pay</div>
              <div className="space-y-2 text-sm">
                <div><span className="text-ink-muted">Rate: </span>
                  <span className="font-mono num">{formatCents(tutor.pay_rate_cents, currency)}</span>
                  <span className="text-ink-soft text-xs"> / hr</span>
                </div>
                <div><span className="text-ink-muted">Total paid/owed: </span>
                  <span className="font-mono num">{formatCents(totalOwed, currency, { showZero: true })}</span>
                </div>
              </div>
            </div>
          </div>

          {tutor.notes && (
            <div className="card p-6 mb-8">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Notes</div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{tutor.notes}</p>
            </div>
          )}

          <div className="mb-4">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Record</div>
            <h2 className="font-display text-2xl tracking-tightest">Recent sessions</h2>
          </div>

          {sessions.length === 0 ? (
            <div className="card p-6 text-sm text-ink-muted">No sessions assigned yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Subject</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th className="text-right">Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="row-link"
                      onClick={() => window.location.assign(`/app/sessions/${s.id}`)}>
                      <td>{formatDateTime(s.scheduled_at)}</td>
                      <td className="text-ink-muted">{s.subject ?? '—'}</td>
                      <td className="text-ink-muted font-mono text-xs">{s.duration_minutes} min</td>
                      <td>
                        <span className={cx(
                          s.status === 'completed' && 'badge-forest',
                          s.status === 'scheduled' && 'badge-neutral',
                          s.status === 'cancelled' && 'badge-neutral',
                          s.status === 'no_show' && 'badge-claret'
                        )}>
                          {s.status}
                        </span>
                      </td>
                      <td className="text-right font-mono num text-sm">
                        {formatCents(tutorPayAmount(s), currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

export default function TutorDetail() {
  return <AuthGuard><OwnerOnly><TutorDetailInner /></OwnerOnly></AuthGuard>;
}
