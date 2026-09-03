import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { Tutor, Session } from '../../../lib/types';
import { TutorVettingCard, VETTING_FORM_FIELDS, vettingFormFromTutor, vettingPatchFromForm } from '../../../components/tutors/TutorVetting';
import {
  formatCents,
  formatDateTime,
  centsToDollars,
  dollarsToCents,
  tutorPayAmount,
  cx,
} from '../../../lib/utils';

function TutorDetailInner() {
  const { t } = useTranslation('tutors');
  const { t: tCommon } = useTranslation('common');
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
      const [{ data: tu }, { data: ss }] = await Promise.all([
        supabase.from('tutors').select('*').eq('id', id).single(),
        supabase.from('sessions').select('*').eq('tutor_id', id).order('scheduled_at', { ascending: false }).limit(20),
      ]);
      setTutor(tu);
      setSessions(ss ?? []);
      if (tu) {
        setForm({
          name: tu.name,
          email: tu.email ?? '',
          phone: tu.phone ?? '',
          subjects: (tu.subjects ?? []).join(', '),
          pay_rate: tu.pay_rate_cents ? centsToDollars(tu.pay_rate_cents) : '',
          notes: tu.notes ?? '',
          ...vettingFormFromTutor(tu),
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
      ...vettingPatchFromForm(form),
    }).eq('id', tutor.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    const { data: fresh } = await supabase.from('tutors').select('*').eq('id', tutor.id).single();
    if (fresh) setTutor(fresh);
    setEditing(false);
  }

  async function deleteTutor() {
    if (!tutor) return;
    const ok = window.confirm(t('detail.confirm_delete', { name: tutor.name }));
    if (!ok) return;
    const { error: err } = await supabase.from('tutors').delete().eq('id', tutor.id);
    if (err) { setError(err.message); return; }
    router.push('/app/tutors');
  }

  if (loading) return <Layout title={t('detail.loading_title')}><div className="card p-6 text-sm text-ink-muted">{t('detail.loading')}</div></Layout>;
  if (!tutor) return <Layout title={t('detail.not_found_title')}><div className="card p-6 text-sm text-ink-muted">{t('detail.not_found_body')}</div></Layout>;

  const totalOwed = sessions
    .filter((s) => s.status === 'completed')
    .reduce((a, s) => a + tutorPayAmount(s), 0);

  return (
    <Layout
      subtitle={t('detail.subtitle')}
      title={tutor.name}
      actions={!editing ? <button onClick={() => setEditing(true)} className="btn-secondary">{t('detail.edit')}</button> : undefined}
    >
      {editing && form ? (
        <form onSubmit={save} className="card p-8 space-y-5 max-w-2xl">
          <div>
            <label className="label">{t('detail.form.name_label')}</label>
            <input required className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('detail.form.email_label')}</label>
              <input type="email" className="input" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('detail.form.phone_label')}</label>
              <input className="input" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">{t('detail.form.subjects_label')}</label>
            <input className="input" value={form.subjects}
              onChange={(e) => setForm({ ...form, subjects: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('detail.form.pay_rate_label')}</label>
            <input type="number" min="0" className="input" value={form.pay_rate}
              onChange={(e) => setForm({ ...form, pay_rate: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('detail.form.notes_label')}</label>
            <textarea rows={3} className="input" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="pt-4 border-t border-rule">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">Vetting and matching</div>
            <div className="grid md:grid-cols-2 gap-4">
              {VETTING_FORM_FIELDS.map((f) => (
                <div key={f.key} className={f.wide ? 'md:col-span-2' : ''}>
                  <label className="label">{f.label}</label>
                  {f.type === 'select' ? (
                    <select className="input" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                      <option value="">—</option>
                      {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea rows={3} className="input" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
                  ) : (
                    <input type={f.type} className="input" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
                  )}
                </div>
              ))}
            </div>
          </div>
          {error && <div className="text-sm text-claret">{error}</div>}
          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? t('detail.saving') : t('detail.save')}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost">{t('detail.cancel')}</button>
            </div>
            <button type="button" onClick={deleteTutor} className="btn-danger text-xs">{t('detail.delete')}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-6 mb-8">
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('detail.contact_eyebrow')}</div>
              <div className="space-y-2 text-sm">
                {tutor.email && <div>{tutor.email}</div>}
                {tutor.phone && <div>{tutor.phone}</div>}
                {!tutor.email && !tutor.phone && <div className="text-ink-soft">{t('detail.no_contact')}</div>}
              </div>
            </div>
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('detail.teaches_eyebrow')}</div>
              <div className="text-sm text-ink-muted">
                {tutor.subjects && tutor.subjects.length > 0 ? tutor.subjects.join(', ') : t('detail.no_subjects')}
              </div>
            </div>
            <div className="card p-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('detail.pay_eyebrow')}</div>
              <div className="space-y-2 text-sm">
                <div><span className="text-ink-muted">{t('detail.rate_label')}</span>
                  <span className="font-mono num">{formatCents(tutor.pay_rate_cents, currency)}</span>
                  <span className="text-ink-soft text-xs">{t('detail.rate_per_hour')}</span>
                </div>
                <div><span className="text-ink-muted">{t('detail.total_label')}</span>
                  <span className="font-mono num">{formatCents(totalOwed, currency, { showZero: true })}</span>
                </div>
              </div>
            </div>
          </div>

          <TutorVettingCard tutor={tutor} onChange={(fresh) => setTutor(fresh as Tutor)} />

          {tutor.notes && (
            <div className="card p-6 mb-8">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">{t('detail.notes_eyebrow')}</div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{tutor.notes}</p>
            </div>
          )}

          <div className="mb-4">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('detail.record_eyebrow')}</div>
            <h2 className="font-display text-2xl tracking-tightest">{t('detail.recent_heading')}</h2>
          </div>

          {sessions.length === 0 ? (
            <div className="card p-6 text-sm text-ink-muted">{t('detail.no_sessions')}</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('detail.table.when')}</th>
                    <th>{t('detail.table.subject')}</th>
                    <th>{t('detail.table.duration')}</th>
                    <th>{t('detail.table.status')}</th>
                    <th className="text-right">{t('detail.table.pay')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="row-link"
                      onClick={() => window.location.assign(`/app/sessions/${s.id}`)}>
                      <td>{formatDateTime(s.scheduled_at)}</td>
                      <td className="text-ink-muted">{s.subject ?? t('detail.table.subject_dash')}</td>
                      <td className="text-ink-muted font-mono text-xs">{t('detail.table.duration_minutes', { count: s.duration_minutes })}</td>
                      <td>
                        <span className={cx(
                          s.status === 'completed' && 'badge-forest',
                          s.status === 'scheduled' && 'badge-neutral',
                          s.status === 'cancelled' && 'badge-neutral',
                          s.status === 'no_show' && 'badge-claret'
                        )}>
                          {tCommon(`status.${s.status}`)}
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
