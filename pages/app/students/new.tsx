import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { getCurrentOrganizationId } from '../../../lib/organization';
import { useBilling } from '../../../lib/billingContext';
import { dollarsToCents } from '../../../lib/utils';

function NewStudentInner() {
  const { t } = useTranslation(['students', 'common']);
  const router = useRouter();
  const { status, openPaywall } = useBilling();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultRate, setDefaultRate] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: '',
    year_level: '',
    school: '',
    subjects: '',
    parent_name: '',
    parent_email: '',
    parent_phone: '',
    hourly_rate: '',
    notes: '',
  });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: p } = await supabase
        .from('profiles').select('default_rate_cents').eq('id', session.user.id).single();
      if (p?.default_rate_cents) setDefaultRate(p.default_rate_cents);
    })();
  }, []);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm({ ...form, [k]: v });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (status && !status.is_active) {
      openPaywall(
        status.subscription_status === 'trialing'
          ? 'trial_expired'
          : status.subscription_status === 'past_due'
          ? 'subscription_past_due'
          : 'canceled',
      );
      return;
    }

    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('Not signed in.');
      setLoading(false);
      return;
    }
    const organizationId = await getCurrentOrganizationId();
    if (!organizationId) {
      setError('No organisation is linked to your account. Contact support@crestio.ai.');
      setLoading(false);
      return;
    }

    const subjects = form.subjects
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const { data, error: err } = await supabase
      .from('students')
      .insert({
        owner_id: session.user.id,
        organization_id: organizationId,
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
      .select()
      .single();

    setLoading(false);
    if (err) {
      // RLS rejection when billing is not ok — open paywall instead of showing
      // a scary "permission denied" error.
      if (err.code === '42501' && status && !status.is_active) {
        openPaywall(
          status.subscription_status === 'trialing'
            ? 'trial_expired'
            : status.subscription_status === 'past_due'
            ? 'subscription_past_due'
            : 'canceled',
        );
        setLoading(false);
        return;
      }
      setError(err.message);
      setLoading(false);
      return;
    }
    router.push(`/app/students/${data.id}`);
  }

  return (
    <Layout subtitle={t('students:title_list')} title={t('students:title_new')}>
      <div className="max-w-2xl">
        <form onSubmit={onSubmit} className="card p-8 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input
                type="text" required autoFocus
                value={form.name} onChange={(e) => update('name', e.target.value)}
                className="input" placeholder="e.g. Sam Chen"
              />
            </div>
            <div>
              <label className="label">Year level</label>
              <input
                type="text"
                value={form.year_level} onChange={(e) => update('year_level', e.target.value)}
                className="input" placeholder="e.g. Year 11"
              />
            </div>
          </div>

          <div>
            <label className="label">School</label>
            <input
              type="text"
              value={form.school} onChange={(e) => update('school', e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="label">Subjects</label>
            <input
              type="text"
              value={form.subjects} onChange={(e) => update('subjects', e.target.value)}
              className="input" placeholder="Maths Advanced, Physics"
            />
            <div className="text-2xs text-ink-soft mt-1.5">Comma separated.</div>
          </div>

          <div className="pt-2 border-t border-ruleSoft">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3 mt-4">Parent / guardian</div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={form.parent_name} onChange={(e) => update('parent_name', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  value={form.parent_phone} onChange={(e) => update('parent_phone', e.target.value)}
                  className="input"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Email</label>
              <input
                type="email"
                value={form.parent_email} onChange={(e) => update('parent_email', e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-ruleSoft">
            <div className="mt-4">
              <label className="label">Hourly rate</label>
              <input
                type="number" min="0" step="1"
                value={form.hourly_rate} onChange={(e) => update('hourly_rate', e.target.value)}
                className="input"
                placeholder={defaultRate ? `Default: ${defaultRate / 100}` : 'e.g. 80'}
              />
              <div className="text-2xs text-ink-soft mt-1.5">
                Leave blank to use your default rate.
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              rows={3}
              value={form.notes} onChange={(e) => update('notes', e.target.value)}
              className="input" placeholder="Learning style, goals, things to remember…"
            />
          </div>

          {error && <div className="text-sm text-claret">{error}</div>}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Saving…' : 'Create student'}
            </button>
            <Link href="/app/students" className="btn-ghost">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}

export default function NewStudent() {
  return (
    <AuthGuard>
      <NewStudentInner />
    </AuthGuard>
  );
}
