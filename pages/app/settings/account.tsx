import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';
import { Profile } from '../../../lib/types';
import { useMembership } from '../../../lib/membershipContext';
import { centsToDollars, dollarsToCents, formatCents } from '../../../lib/utils';

function AccountInner() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { membership } = useMembership();
  const isTutor = membership?.role === 'tutor';
  const [myPayRateCents, setMyPayRateCents] = useState<number | null>(null);
  const [myCurrency, setMyCurrency] = useState('AUD');

  useEffect(() => {
    if (!isTutor) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: tutor } = await supabase
        .from('tutors').select('pay_rate_cents').eq('auth_user_id', session.user.id).maybeSingle();
      if (tutor) setMyPayRateCents((tutor as any).pay_rate_cents ?? null);
      const { data: p } = await supabase
        .from('profiles').select('currency').eq('id', session.user.id).maybeSingle();
      if (p?.currency) setMyCurrency(p.currency);
    })();
  }, [isTutor]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(p);
      if (p) {
        setForm({
          owner_name: p.owner_name ?? '',
          email: p.email ?? session.user.email ?? '',
          phone: p.phone ?? '',
          default_rate: p.default_rate_cents ? centsToDollars(p.default_rate_cents) : '',
          currency: p.currency ?? 'AUD',
        });
      }
    })();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: err } = await supabase.from('profiles').update({
      owner_name: form.owner_name || null,
      email: form.email || null,
      phone: form.phone || null,
      default_rate_cents: form.default_rate ? dollarsToCents(form.default_rate) : null,
      currency: form.currency,
    }).eq('id', profile.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // ---- MFA ----------------------------------------------------------------
  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaQrCode, setMfaQrCode] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);

  async function loadFactors() {
    setMfaLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === 'verified');
    setMfaEnabled(!!verified);
    setMfaLoading(false);
  }
  useEffect(() => { loadFactors(); }, []);

  async function startMfaEnroll() {
    setMfaError(null);
    setMfaBusy(true);
    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      for (const f of factorsData?.totp ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Crestio · ${new Date().toISOString().slice(0, 10)}`,
      });
      if (err) throw err;
      if (!data) throw new Error('No enrollment data returned.');
      setMfaQrCode(data.totp.qr_code);
      setMfaSecret(data.totp.secret);
      setMfaFactorId(data.id);
      setMfaEnrolling(true);
    } catch (e: any) {
      setMfaError(e?.message ?? t('account.mfa_could_not_start'));
    } finally {
      setMfaBusy(false);
    }
  }

  async function verifyMfaEnroll(e: FormEvent) {
    e.preventDefault();
    setMfaError(null);
    setMfaBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId, challengeId: ch.id, code: mfaCode,
      });
      if (vErr) throw vErr;
      setMfaEnrolling(false); setMfaCode(''); setMfaQrCode(''); setMfaSecret(''); setMfaFactorId('');
      await loadFactors();
    } catch {
      setMfaError(t('account.mfa_invalid_code'));
    } finally {
      setMfaBusy(false);
    }
  }

  async function cancelMfaEnroll() {
    if (mfaFactorId) await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
    setMfaEnrolling(false); setMfaCode(''); setMfaQrCode(''); setMfaSecret(''); setMfaFactorId(''); setMfaError(null);
  }

  async function disableMfa() {
    if (!window.confirm(t('account.mfa_disable_confirm'))) return;
    setMfaError(null);
    setMfaBusy(true);
    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      for (const f of factorsData?.totp ?? []) {
        const { error: err } = await supabase.auth.mfa.unenroll({ factorId: f.id });
        if (err) throw err;
      }
      await loadFactors();
    } catch (e: any) {
      setMfaError(e?.message ?? t('account.mfa_could_not_disable'));
    } finally {
      setMfaBusy(false);
    }
  }

  async function deleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t('common.not_signed_in'));
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      let payload: any = null;
      try { payload = await res.json(); }
      catch { throw new Error(`Server returned ${res.status}`); }
      if (!res.ok) throw new Error(payload?.error || `Server returned ${res.status}`);
      await supabase.auth.signOut();
      router.push('/?deleted=true');
    } catch (e: any) {
      setDeleteError(e?.message ?? t('common.something_wrong'));
      setDeleting(false);
    }
  }

  if (!form) {
    return (
      <Layout pageTitle={`${t('tabs.account')} · ${t('page_title')}`} subtitle={t('tabs.account')} title={t('page_title')}>
        <SettingsTabs />
        <div className="card p-6 text-sm text-ink-muted">{t('common.loading')}</div>
      </Layout>
    );
  }

  const deleteKeyword = t('account.delete_confirm_keyword');

  return (
    <Layout pageTitle={`${t('tabs.account')} · ${t('page_title')}`} subtitle={t('tabs.account')} title={t('page_title')}>
      <SettingsTabs />
      <div className="max-w-2xl space-y-6">
        {isTutor && (
          <div className="card p-8">
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('account.pay_eyebrow')}</div>
            <h2 className="font-display text-xl tracking-tightest">
              {myPayRateCents !== null
                ? <>{formatCents(myPayRateCents, myCurrency)} <span className="text-ink-soft text-sm">{t('account.pay_per_hour')}</span></>
                : t('account.pay_not_set')}
            </h2>
            <div className="text-2xs text-ink-soft mt-3">
              {t('account.pay_hint')}
            </div>
          </div>
        )}

        <form onSubmit={save} className="card p-8 space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('account.profile_eyebrow')}</div>
            <h2 className="font-display text-xl tracking-tightest">{isTutor ? t('account.profile_heading_tutor') : t('account.profile_heading_owner')}</h2>
          </div>
          <div>
            <label className="label">{t('account.name_label')}</label>
            <input className="input" value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('account.email_label')}</label>
              <input type="email" className="input" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <div className="text-2xs text-ink-soft mt-1.5">{t('account.email_hint')}</div>
            </div>
            <div>
              <label className="label">{t('account.phone_label')}</label>
              <input type="tel" className="input" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          {!isTutor && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('account.default_rate_label')}</label>
                <input type="number" min="0" className="input" value={form.default_rate}
                  onChange={(e) => setForm({ ...form, default_rate: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('account.currency_label')}</label>
                <select className="input" value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="AUD">AUD</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                  <option value="NZD">NZD</option>
                  <option value="CAD">CAD</option>
                </select>
              </div>
            </div>
          )}

          {error && <div className="text-sm text-claret">{error}</div>}
          {saved && <div className="text-sm text-forest">{t('common.saved')}</div>}
          <div className="pt-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? t('common.saving') : t('common.save_changes')}
            </button>
          </div>
        </form>

        <div className="card p-8">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('account.security_eyebrow')}</div>
          <h2 className="font-display text-xl tracking-tightest mb-3">{t('account.mfa_heading')}</h2>

          {mfaLoading ? (
            <div className="text-sm text-ink-muted">{t('common.loading')}</div>
          ) : mfaEnrolling ? (
            <div className="space-y-5">
              <p className="text-sm text-ink-muted leading-relaxed">
                {t('account.mfa_scan_prompt')}
              </p>
              <div className="flex flex-col items-center gap-4 p-6 border border-rule rounded bg-cream">
                {mfaQrCode && <img src={mfaQrCode} alt={t('account.mfa_qr_alt')} className="w-44 h-44" />}
                <div className="text-center">
                  <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('account.mfa_secret_label')}</div>
                  <div className="font-mono text-xs text-ink break-all max-w-xs select-all">{mfaSecret}</div>
                </div>
              </div>
              <form onSubmit={verifyMfaEnroll} className="space-y-3 max-w-sm">
                <label className="label">{t('account.mfa_code_label')}</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6}
                  required autoFocus value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  className="input font-mono tracking-widest text-center text-lg" />
                {mfaError && <div className="text-sm text-claret">{mfaError}</div>}
                <div className="flex gap-3">
                  <button type="submit" disabled={mfaBusy || mfaCode.length !== 6} className="btn-primary flex-1">
                    {mfaBusy ? t('account.mfa_verifying') : t('account.mfa_verify_and_enable')}
                  </button>
                  <button type="button" onClick={cancelMfaEnroll} disabled={mfaBusy} className="btn-ghost">{t('common.cancel')}</button>
                </div>
              </form>
            </div>
          ) : mfaEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-forest">
                <span className="inline-block w-2 h-2 rounded-full bg-forest" aria-hidden="true" />
                <span>{t('account.mfa_enabled_state')}</span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                {t('account.mfa_enabled_body')}
              </p>
              {mfaError && <div className="text-sm text-claret">{mfaError}</div>}
              <button type="button" onClick={disableMfa} disabled={mfaBusy} className="btn-secondary">
                {mfaBusy ? t('account.mfa_disabling') : t('account.mfa_disable')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink-muted leading-relaxed">
                {t('account.mfa_disabled_body')}
              </p>
              {mfaError && <div className="text-sm text-claret">{mfaError}</div>}
              <button type="button" onClick={startMfaEnroll} disabled={mfaBusy} className="btn-primary">
                {mfaBusy ? t('account.mfa_starting') : t('account.mfa_enable')}
              </button>
            </div>
          )}
        </div>

        <VoiceUsageCard />

        <OwnerExemptionCard />

        <div className="card p-8 border-claret/30 bg-claret/5">
          <div className="text-2xs uppercase tracking-widest text-claret/80 mb-1">{t('account.danger_eyebrow')}</div>
          <h2 className="font-display text-xl tracking-tightest mb-3 text-claret">{t('account.delete_heading')}</h2>
          <p className="text-sm text-ink-muted mb-4 leading-relaxed">
            {t('account.delete_body_prefix')}<code className="font-mono text-ink">{deleteKeyword}</code>{t('account.delete_body_suffix')}
          </p>
          <div className="space-y-3 max-w-sm">
            <input type="text" className="input" placeholder={t('account.delete_placeholder')}
              value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting} autoComplete="off" />
            <button type="button" onClick={deleteAccount}
              disabled={confirmText !== deleteKeyword || deleting}
              className="btn-danger w-full">
              {deleting ? t('account.deleting') : t('account.delete_button')}
            </button>
            {deleteError && <div className="text-sm text-claret">{deleteError}</div>}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function VoiceUsageCard() {
  const { t } = useTranslation('settings');
  const [usage, setUsage] = useState<{
    count_today: number; max_count: number;
    minutes_today: number; max_minutes: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/voice/usage', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) setUsage(await res.json());
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="card p-8">
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('account.voice_eyebrow')}</div>
      <h2 className="font-display text-xl tracking-tightest mb-3">{t('account.voice_heading')}</h2>
      {loading ? (
        <div className="text-sm text-ink-muted">{t('common.loading')}</div>
      ) : usage ? (
        <div className="space-y-1 text-sm text-ink">
          <div>
            {t('account.voice_usage_line', {
              count: usage.count_today,
              max_count: usage.max_count,
              minutes: usage.minutes_today,
              max_minutes: usage.max_minutes,
            })}
          </div>
          <div className="text-2xs text-ink-soft">{t('account.voice_resets')}</div>
        </div>
      ) : (
        <div className="text-sm text-ink-muted">{t('account.voice_load_fail')}</div>
      )}
      <div className="text-2xs text-ink-soft leading-relaxed mt-4">
        {t('account.voice_privacy')}
      </div>
    </div>
  );
}

function OwnerExemptionCard() {
  const { t } = useTranslation('settings');
  const [loaded, setLoaded] = useState(false);
  const [isOwnerEmail, setIsOwnerEmail] = useState(false);
  const [active, setActive] = useState(true);
  const [showTestAccounts, setShowTestAccounts] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) return;
      const { isPlatformOwner } = await import('../../../lib/owner');
      if (!isPlatformOwner(session.user.email)) { setLoaded(true); return; }
      setIsOwnerEmail(true);
      const res = await fetch('/api/owner/billing-exemption', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const payload = await res.json();
        setActive(payload.active !== false);
        setShowTestAccounts(!!payload.show_test_accounts_in_lists);
      }
      setLoaded(true);
    })();
  }, []);

  async function toggle(nextActive: boolean) {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSaving(false); return; }
    const res = await fetch('/api/owner/billing-exemption', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ active: nextActive }),
    });
    setSaving(false);
    if (res.ok) setActive(nextActive);
  }

  async function toggleTestAccounts(next: boolean) {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSaving(false); return; }
    const res = await fetch('/api/owner/billing-exemption', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ show_test_accounts_in_lists: next }),
    });
    setSaving(false);
    if (res.ok) setShowTestAccounts(next);
  }

  if (!loaded || !isOwnerEmail) return null;

  return (
    <div className="card p-8 mb-6 border-amber/40 bg-amber-soft/40">
      <div className="text-2xs uppercase tracking-widest text-amber-ink/80 mb-1">{t('account.owner_eyebrow')}</div>
      <h2 className="font-display text-xl tracking-tightest mb-3">{t('account.owner_heading')}</h2>
      <p className="text-sm text-ink-muted mb-4 leading-relaxed">
        {t('account.owner_body')}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => toggle(!active)}
          disabled={saving}
          aria-pressed={active}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
            active ? 'bg-forest text-cream' : 'bg-ruleSoft text-ink'
          }`}
        >
          <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-cream' : 'bg-claret'}`} aria-hidden="true" />
          {active ? t('account.owner_exemption_active') : t('account.owner_exemption_off')}
        </button>
        <span className="text-2xs text-ink-soft">
          {active
            ? t('account.owner_state_active')
            : t('account.owner_state_off')}
        </span>
      </div>

      <div className="mt-6 pt-6 border-t border-amber/30">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 accent-forest"
            checked={showTestAccounts}
            onChange={(e) => toggleTestAccounts(e.target.checked)}
            disabled={saving}
          />
          <div>
            <div className="text-sm text-ink">{t('account.owner_test_accounts_label')}</div>
            <div className="text-2xs text-ink-soft">
              {t('account.owner_test_accounts_body')}
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

export default function Page() {
  return <AuthGuard><AccountInner /></AuthGuard>;
}
