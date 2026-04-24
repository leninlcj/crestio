import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import OwnerOnly from '../../../components/OwnerOnly';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { getCurrentOrganizationId } from '../../../lib/organization';
import { dollarsToCents } from '../../../lib/utils';

function NewTutorInner() {
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
    if (!session) { setError('Not signed in.'); setLoading(false); return; }
    const organizationId = await getCurrentOrganizationId();
    if (!organizationId) { setError('No organisation is linked to your account. Contact support@crestio.ai.'); setLoading(false); return; }

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
    <Layout subtitle="Tutors" title="New tutor">
      <div className="max-w-2xl">
        <form onSubmit={onSubmit} className="card p-8 space-y-5">
          <div>
            <label className="label">Name *</label>
            <input required autoFocus className="input" value={form.name}
              onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email}
                onChange={(e) => update('email', e.target.value)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input type="tel" className="input" value={form.phone}
                onChange={(e) => update('phone', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Subjects they teach</label>
            <input className="input" value={form.subjects} placeholder="Maths, Chemistry"
              onChange={(e) => update('subjects', e.target.value)} />
            <div className="text-2xs text-ink-soft mt-1.5">Comma separated.</div>
          </div>
          <div>
            <label className="label">Pay rate per hour</label>
            <input type="number" min="0" className="input" value={form.pay_rate}
              onChange={(e) => update('pay_rate', e.target.value)}
              placeholder="e.g. 55" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={3} className="input" value={form.notes}
              onChange={(e) => update('notes', e.target.value)} />
          </div>
          {error && <div className="text-sm text-claret">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Saving…' : 'Create tutor'}
            </button>
            <Link href="/app/tutors" className="btn-ghost">Cancel</Link>
          </div>
        </form>
      </div>
    </Layout>
  );
}

export default function NewTutor() {
  return <AuthGuard><OwnerOnly><NewTutorInner /></OwnerOnly></AuthGuard>;
}
