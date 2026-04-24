import { useEffect, useState, FormEvent } from 'react';
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

const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Pacific/Auckland',
  'Asia/Singapore',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
];

function PreferencesInner() {
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
    if (!session) { setError('Not signed in.'); setSaving(false); return; }
    const { error: err } = await supabase
      .from('profiles').update({ locale }).eq('id', session.user.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    await applyLocale(locale);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Layout subtitle="Preferences" title="Settings">
      <SettingsTabs />
      <div className="max-w-2xl space-y-6">
        <form onSubmit={save} className="card p-8 space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Preferences</div>
            <h2 className="font-display text-xl tracking-tightest">Language and region</h2>
          </div>
          <div>
            <label className="label">Language</label>
            <select
              className="input"
              value={locale}
              onChange={(e) => setLocale(e.target.value as SupportedLocale)}
              disabled={loading}
            >
              {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <div className="text-2xs text-ink-soft mt-1.5">
              Translations are machine-generated. We'll apply your choice right away.
            </div>
          </div>
          <div>
            <label className="label">Timezone (detected)</label>
            <input className="input" value={timezone} readOnly />
            <div className="text-2xs text-ink-soft mt-1.5">
              Dates and times across Crestio use your browser's timezone.
            </div>
          </div>
          {error && <div className="text-sm text-claret">{error}</div>}
          {saved && <div className="text-sm text-forest">Saved.</div>}
          <div className="pt-2">
            <button type="submit" disabled={saving || loading} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>

        <CalendarExportCard />
      </div>
    </Layout>
  );
}

function CalendarExportCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);

  async function getOrCreateUrl(rotate = false) {
    setBusy(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError('Not signed in.'); return; }
      const res = await fetch('/api/calendar/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ audience: 'tutor', rotate }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        setError(payload?.error ?? 'Could not generate calendar URL.');
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
        <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Calendar export</div>
        <h2 className="font-display text-xl tracking-tightest">Subscribe in your calendar app</h2>
        <p className="text-sm text-ink-muted mt-2">
          Generate a private subscription URL for Google Calendar, Apple Calendar, Outlook, or any app that supports iCal feeds. Your sessions refresh automatically every hour.
        </p>
      </div>

      {!url && (
        <button type="button" onClick={() => getOrCreateUrl(false)} disabled={busy} className="btn-primary">
          {busy ? 'Generating…' : 'Generate subscription URL'}
        </button>
      )}

      {url && (
        <>
          <div className="flex gap-2">
            <input type="text" readOnly value={url} className="input text-xs flex-1 font-mono"
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={copy} className="btn-secondary text-xs px-4">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Copy this URL, then add it to your calendar app. Your sessions will appear automatically and refresh every hour.
          </p>
          <button
            type="button"
            onClick={() => setHowToOpen(true)}
            className="text-xs text-forest hover:text-forest-ink underline underline-offset-2 text-left"
          >
            How do I add this to my calendar?
          </button>
          <div className="flex gap-2 pt-2 border-t border-rule">
            <button type="button" onClick={() => getOrCreateUrl(true)} disabled={busy} className="btn-ghost text-xs">
              {busy ? 'Rotating…' : 'Revoke and generate new'}
            </button>
          </div>
          <div className="text-2xs text-ink-soft">
            Keep this URL private. Anyone with it can see your tutoring schedule. Revoke if it leaks.
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
