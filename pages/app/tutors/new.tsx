import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { getCurrentOrganizationId } from '../../../lib/organization';
import { dollarsToCents } from '../../../lib/utils';

function NewTutorInner() {
  const { t } = useTranslation('tutors');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', subjects: '', pay_rate: '', notes: '',
  });

  function update(k: keyof typeof form, v: string) { setForm({ ...form, [k]: v }); }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError(t('new.not_signed_in')); setLoading(false); return; }
    const organizationId = await getCurrentOrganizationId();
    if (!organizationId) { setError(t('new.no_organization')); setLoading(false); return; }

    const subjects = form.subjects.split(',').map((s) => s.trim()).filter(Boolean);
    const { data, error: err } = await supabase.from('tutors').insert({
      owner_id: session.user.id,
      organization_id: organizationId,
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      subjects,
      pay_rate_cents: form.pay_rate ? dollarsToCents(form.pay_rate) : null,
      notes: form.notes || null,
    }).select().single();

    setLoading(false);
    if (err) { setError(err.message); return; }
    router.push(`/app/tutors/${data.id}`);
  }

  return (
    <Layout subtitle={t('new.page_subtitle')} title={t('new.page_title')}>
      <div className="max-w-2xl">
        <form onSubmit={onSubmit} className="card p-8 space-y-5">
          <div>
            <label className="label">{t('new.name_label')}</label>
            <input required autoFocus className="input" value={form.name}
              onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('new.email_label')}</label>
              <input type="email" className="input" value={form.email}
                onChange={(e) => update('email', e.target.value)} />
            </div>
            <div>
              <label className="label">{t('new.phone_label')}</label>
              <input type="tel" className="input" value={form.phone}
                onChange={(e) => update('phone', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">{t('new.subjects_label')}</label>
            <input className="input" value={form.subjects} placeholder={t('new.subjects_placeholder')}
              onChange={(e) => update('subjects', e.target.value)} />
            <div className="text-2xs text-ink-soft mt-1.5">{t('new.subjects_hint')}</div>
          </div>
          <div>
            <label className="label">{t('new.pay_rate_label')}</label>
            <input type="number" min="0" className="input" value={form.pay_rate}
              onChange={(e) => update('pay_rate', e.target.value)}
              placeholder={t('new.pay_rate_placeholder')} />
          </div>
          <div>
            <label className="label">{t('new.notes_label')}</label>
            <textarea rows={3} className="input" value={form.notes}
              onChange={(e) => update('notes', e.target.value)} />
          </div>
          {error && <div className="text-sm text-claret">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? t('new.saving') : t('new.submit')}
            </button>
            <Link href="/app/tutors" className="btn-ghost">{t('new.cancel')}</Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}

export default function NewTutor() {
  return <AuthGuard><OwnerOnly><NewTutorInner /></OwnerOnly></AuthGuard>;
}
