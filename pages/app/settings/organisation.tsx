import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';
import { useOrganization } from '../../../lib/organizationContext';
import { useMembership } from '../../../lib/membershipContext';

function OrganisationInner() {
  const router = useRouter();
  const { organization, refresh } = useOrganization();
  const { membership } = useMembership();
  const isOwner = membership?.role === 'owner';

  const [orgName, setOrgName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOwner && membership !== null) {
      router.replace('/app/settings/account');
    }
  }, [isOwner, membership, router]);

  useEffect(() => {
    if (organization) setOrgName(organization.name);
  }, [organization]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!organization) return;
    const trimmed = orgName.trim();
    if (trimmed.length < 1 || trimmed.length > 80) {
      setError('Organisation name must be between 1 and 80 characters.');
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    const { error: err } = await supabase
      .from('organizations').update({ name: trimmed }).eq('id', organization.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    await refresh();
    setOrgName(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Layout subtitle="Organisation" title="Settings">
      <SettingsTabs />
      <div className="max-w-2xl">
        {!organization ? (
          <div className="card p-6 text-sm text-ink-muted">Loading…</div>
        ) : (
          <form onSubmit={save} className="card p-8 space-y-5">
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Organisation</div>
              <h2 className="font-display text-xl tracking-tightest">Organisation name</h2>
            </div>
            <div>
              <label className="label">Name</label>
              <input type="text" className="input" value={orgName}
                onChange={(e) => setOrgName(e.target.value)} maxLength={80} />
              <div className="text-2xs text-ink-soft mt-1.5">
                Shown to parents in emails, the parent portal, and on invoices. 1–80 characters.
              </div>
            </div>
            {error && <div className="text-sm text-claret">{error}</div>}
            {saved && <div className="text-sm text-forest">Saved.</div>}
            <div className="pt-2">
              <button type="submit" disabled={saving || orgName.trim() === organization.name} className="btn-primary">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><OrganisationInner /></AuthGuard>;
}
