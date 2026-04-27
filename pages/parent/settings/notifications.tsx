import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../../components/AuthGuardParent';
import ParentLayout from '../../../components/parent/ParentLayout';
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
    <section className="px-6 md:px-12 pt-10 pb-16 max-w-2xl mx-auto">
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-1">
            {t('settings_notifications_page.heading')}
          </h1>
          <p className="text-sm text-ink-muted">{t('settings_notifications_page.intro')}</p>
        </div>
        <Link href="/parent/settings" className="text-sm text-ink-muted hover:text-ink shrink-0">
          {t('nav.back_settings')}
        </Link>
      </div>

      <div className="rounded-md border border-rule bg-surface divide-y divide-ruleSoft">
        {TOGGLES.map((toggle) => (
          <label key={toggle.key} className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-cream transition-colors">
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
      </div>

      <div className="rounded-md border border-rule bg-surface p-5 mt-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-ink">{t('settings_notifications_page.sms_label')}</div>
          <div className="text-2xs text-ink-soft mt-0.5">{t('settings_notifications_page.sms_hint')}</div>
        </div>
        <span className="badge-neutral text-2xs">{t('settings_notifications_page.coming_soon')}</span>
      </div>

      {saved && <div className="text-xs text-success mt-4">{t('settings_notifications_page.saved')}</div>}
    </section>
  );
}

export default function Page() {
  return (
    <AuthGuardParent>
      <ParentLayout noTabs>
        <Inner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
