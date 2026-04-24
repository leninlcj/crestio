import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';

type PrefKey =
  | 'notify_session_reminders'
  | 'notify_reschedule_events'
  | 'notify_invoice_events'
  | 'notify_overdue_alerts'
  | 'notify_trial_and_billing'
  | 'notify_messages_email'
  | 'notify_messages_urgent_only';

type Prefs = Partial<Record<PrefKey, boolean>>;

const TOGGLES: Array<{ key: PrefKey; i18nKey: string; defaultOn: boolean }> = [
  { key: 'notify_session_reminders',    i18nKey: 'session_reminders',    defaultOn: true },
  { key: 'notify_reschedule_events',    i18nKey: 'reschedule_events',    defaultOn: true },
  { key: 'notify_invoice_events',       i18nKey: 'invoice_events',       defaultOn: true },
  { key: 'notify_overdue_alerts',       i18nKey: 'overdue_alerts',       defaultOn: true },
  { key: 'notify_trial_and_billing',    i18nKey: 'trial_and_billing',    defaultOn: true },
  { key: 'notify_messages_email',       i18nKey: 'messages_email',       defaultOn: true },
  { key: 'notify_messages_urgent_only', i18nKey: 'messages_urgent_only', defaultOn: false },
];

function Inner() {
  const { t } = useTranslation('settings');
  const [prefs, setPrefs] = useState<Prefs>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles')
        .select('notify_session_reminders, notify_reschedule_events, notify_invoice_events, notify_overdue_alerts, notify_trial_and_billing, notify_messages_email, notify_messages_urgent_only')
        .eq('id', session.user.id)
        .maybeSingle();
      if (data) setPrefs(data as Prefs);
      setLoading(false);
    })();
  }, []);

  function valueOf(key: PrefKey): boolean {
    const v = prefs[key];
    if (typeof v === 'boolean') return v;
    return TOGGLES.find((t) => t.key === key)?.defaultOn ?? true;
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
    <Layout subtitle={t('tabs.notifications')} title={t('page_title')}>
      <SettingsTabs />
      <div className="max-w-2xl">
        <div className="card p-8 space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('notifications.eyebrow')}</div>
            <h2 className="font-display text-xl tracking-tightest">{t('notifications.heading')}</h2>
            <p className="text-sm text-ink-muted mt-2">
              {t('notifications.intro')}
            </p>
          </div>
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
                <div className="text-sm text-ink">{t(`notifications.toggles.${toggle.i18nKey}.label`)}</div>
                <div className="text-2xs text-ink-muted mt-1 leading-relaxed">{t(`notifications.toggles.${toggle.i18nKey}.description`)}</div>
              </div>
            </label>
          ))}
          {saved && <div className="text-xs text-forest">{t('common.saved')}</div>}
        </div>
      </div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><Inner /></AuthGuard>;
}
