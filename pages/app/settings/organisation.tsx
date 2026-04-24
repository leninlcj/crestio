import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';
import { useOrganization } from '../../../lib/organizationContext';
import { useMembership } from '../../../lib/membershipContext';

function OrganisationInner() {
  const { t } = useTranslation('settings');
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
      setError(t('organisation.name_too_long'));
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
    <Layout subtitle={t('tabs.organisation')} title={t('page_title')}>
      <SettingsTabs />
      <div className="max-w-2xl">
        {!organization ? (
          <div className="card p-6 text-sm text-ink-muted">{t('common.loading')}</div>
        ) : (
          <form onSubmit={save} className="card p-8 space-y-5">
            <div>
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('organisation.eyebrow')}</div>
              <h2 className="font-display text-xl tracking-tightest">{t('organisation.heading')}</h2>
            </div>
            <div>
              <label className="label">{t('organisation.name_label')}</label>
              <input type="text" className="input" value={orgName}
                onChange={(e) => setOrgName(e.target.value)} maxLength={80} />
              <div className="text-2xs text-ink-soft mt-1.5">
                {t('organisation.name_hint')}
              </div>
            </div>
            {error && <div className="text-sm text-claret">{error}</div>}
            {saved && <div className="text-sm text-forest">{t('common.saved')}</div>}
            <div className="pt-2">
              <button type="submit" disabled={saving || orgName.trim() === organization.name} className="btn-primary">
                {saving ? t('common.saving') : t('common.save')}
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
