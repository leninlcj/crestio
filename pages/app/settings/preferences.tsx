import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import CalendarHowToModal from '../../../components/CalendarHowToModal';
import { supabase } from '../../../lib/supabase';
import { SUPPORTED_LOCALES, LOCALE_NATIVE_NAME, isSupportedLocale, type SupportedLocale } from '../../../lib/i18n';
import { useLocale } from '../../../lib/localeContext';

const LOCALES: Array<{ value: SupportedLocale; label: string }> = SUPPORTED_LOCALES.map((v) => ({
  value: v,
  label: LOCALE_NATIVE_NAME[v],
}));

function PreferencesInner() {
  const { t } = useTranslation('settings');
  const { setLocale: applyLocale } = useLocale();
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [timezone, setTimezone] = useState('Australia/Sydney');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles').select('locale').eq('id', session.user.id).maybeSingle();
      if (data?.locale && isSupportedLocale(data.locale)) setLocale(data.locale);
      try { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney'); }
      catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setSaved(false); setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError(t('common.not_signed_in')); setSaving(false); return; }
    const { error: err } = await supabase
      .from('profiles').update({ locale }).eq('id', session.user.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    await applyLocale(locale);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Layout pageTitle={`${t('tabs.preferences')} · ${t('page_title')}`} subtitle={t('tabs.preferences')} title={t('page_title')}>
      <SettingsTabs />
      <div className="max-w-2xl space-y-6">
        <form onSubmit={save} className="card p-8 space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('preferences.eyebrow')}</div>
            <h2 className="font-display text-xl tracking-tightest">{t('preferences.heading')}</h2>
          </div>
          <div>
            <label className="label">{t('preferences.language_label')}</label>
            <select
              className="input"
              value={locale}
              onChange={(e) => setLocale(e.target.value as SupportedLocale)}
              disabled={loading}
            >
              {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <div className="text-2xs text-ink-soft mt-1.5">
              {t('preferences.language_hint')}
            </div>
          </div>
          <div>
            <label className="label">{t('preferences.timezone_label')}</label>
            <input className="input" value={timezone} readOnly />
            <div className="text-2xs text-ink-soft mt-1.5">
              {t('preferences.timezone_hint')}
            </div>
          </div>
          {error && <div className="text-sm text-claret">{error}</div>}
          {saved && <div className="text-sm text-forest">{t('common.saved')}</div>}
          <div className="pt-2">
            <button type="submit" disabled={saving || loading} className="btn-primary">
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>

        <CalendarExportCard />
      </div>
    </Layout>
  );
}

function CalendarExportCard() {
  const { t } = useTranslation('settings');
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);

  async function getOrCreateUrl(rotate = false) {
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError(t('common.not_signed_in')); return; }
      const res = await fetch('/api/calendar/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ audience: 'tutor', rotate }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        setError(payload?.error ?? t('preferences.could_not_generate'));
        return;
      }
      setUrl(payload.url);
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('Copy this URL:', url); }
  }

  return (
    <div className="card p-8 space-y-4">
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('preferences.calendar_export_eyebrow')}</div>
        <h2 className="font-display text-xl tracking-tightest">{t('preferences.calendar_export_heading')}</h2>
        <p className="text-sm text-ink-muted mt-2">
          {t('preferences.calendar_export_body')}
        </p>
      </div>

      {!url && (
        <button type="button" onClick={() => getOrCreateUrl(false)} disabled={busy} className="btn-primary">
          {busy ? t('preferences.generating') : t('preferences.generate')}
        </button>
      )}

      {url && (
        <>
          <div className="flex gap-2">
            <input type="text" readOnly value={url} className="input text-xs flex-1 font-mono"
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={copy} className="btn-secondary text-xs px-4">
              {copied ? t('preferences.copied') : t('preferences.copy')}
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            {t('preferences.url_hint')}
          </p>
          <button
            type="button"
            onClick={() => setHowToOpen(true)}
            className="text-xs text-forest hover:text-forest-ink underline underline-offset-2 text-left"
          >
            {t('preferences.how_add')}
          </button>
          <div className="flex gap-2 pt-2 border-t border-rule">
            <button type="button" onClick={() => getOrCreateUrl(true)} disabled={busy} className="btn-ghost text-xs">
              {busy ? t('preferences.rotating') : t('preferences.revoke')}
            </button>
          </div>
          <div className="text-2xs text-ink-soft">
            {t('preferences.private_warning')}
          </div>
        </>
      )}

      {error && <div className="text-sm text-claret">{error}</div>}

      <CalendarHowToModal open={howToOpen} onClose={() => setHowToOpen(false)} />
    </div>
  );
}

export default function Page() {
  return <AuthGuard><PreferencesInner /></AuthGuard>;
}
