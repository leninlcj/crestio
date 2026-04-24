import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../../components/AuthGuardParent';
import { supabase } from '../../../lib/supabase';

type PrefKey =
  | 'notify_session_reminders'
  | 'notify_reschedule_events'
  | 'notify_invoice_events'
  | 'notify_parent_updates'
  | 'notify_messages_email'
  | 'notify_messages_urgent_only';

type Prefs = Partial<Record<PrefKey, boolean>>;

const TOGGLES: Array<{ key: PrefKey; i18nKey: string; defaultOn: boolean }> = [
  { key: 'notify_session_reminders',    i18nKey: 'session_reminders',    defaultOn: true },
  { key: 'notify_reschedule_events',    i18nKey: 'reschedule_events',    defaultOn: true },
  { key: 'notify_invoice_events',       i18nKey: 'invoice_events',       defaultOn: true },
  { key: 'notify_parent_updates',       i18nKey: 'parent_updates',       defaultOn: true },
  { key: 'notify_messages_email',       i18nKey: 'messages_email',       defaultOn: true },
  { key: 'notify_messages_urgent_only', i18nKey: 'messages_urgent_only', defaultOn: false },
];

function Inner() {
  const { t } = useTranslation('parent');
  const [prefs, setPrefs] = useState<Prefs>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data } = await supabase
        .from('parents')
        .select('notify_session_reminders, notify_reschedule_events, notify_invoice_events, notify_parent_updates, notify_messages_email, notify_messages_urgent_only')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (data) setPrefs(data as Prefs);
      setLoading(false);
    })();
  }, []);

  function valueOf(key: PrefKey): boolean {
    const v = prefs[key];
    if (typeof v === 'boolean') return v;
    return TOGGLES.find((tg) => tg.key === key)?.defaultOn ?? true;
  }

  async function update(key: PrefKey, value: boolean) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/user/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ [key]: value }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/settings" className="text-sm text-ink-muted hover:text-ink">{t('nav.back_settings')}</Link>
      </nav>
      <main className="px-6 md:px-12 py-10 max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">{t('settings_notifications_page.kicker')}</div>
          <h1 className="font-display text-4xl tracking-tightest">{t('settings_notifications_page.heading')}</h1>
        </div>
        <div className="card p-8 space-y-5">
          <p className="text-sm text-ink-muted">
            {t('settings_notifications_page.intro')}
          </p>
          {TOGGLES.map((toggle) => (
            <label key={toggle.key} className="flex items-start gap-4 cursor-pointer">
              <input
                type="checkbox"
                checked={valueOf(toggle.key)}
                disabled={loading}
                onChange={(e) => update(toggle.key, e.target.checked)}
                className="h-5 w-5 accent-forest mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm text-ink">{t(`settings_notifications_page.toggles.${toggle.i18nKey}.label`)}</div>
                <div className="text-2xs text-ink-muted mt-1 leading-relaxed">{t(`settings_notifications_page.toggles.${toggle.i18nKey}.description`)}</div>
              </div>
            </label>
          ))}
          {saved && <div className="text-xs text-forest">{t('settings_notifications_page.saved')}</div>}
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return <AuthGuardParent><Inner /></AuthGuardParent>;
}
