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

type Group = 'sessions' | 'money' | 'parents';

const TOGGLES: Array<{ key: PrefKey; i18nKey: string; defaultOn: boolean; group: Group }> = [
  { key: 'notify_session_reminders',    i18nKey: 'session_reminders',    defaultOn: true,  group: 'sessions' },
  { key: 'notify_reschedule_events',    i18nKey: 'reschedule_events',    defaultOn: true,  group: 'sessions' },
  { key: 'notify_invoice_events',       i18nKey: 'invoice_events',       defaultOn: true,  group: 'money' },
  { key: 'notify_overdue_alerts',       i18nKey: 'overdue_alerts',       defaultOn: true,  group: 'money' },
  { key: 'notify_trial_and_billing',    i18nKey: 'trial_and_billing',    defaultOn: true,  group: 'money' },
  { key: 'notify_messages_email',       i18nKey: 'messages_email',       defaultOn: true,  group: 'parents' },
  { key: 'notify_messages_urgent_only', i18nKey: 'messages_urgent_only', defaultOn: false, group: 'parents' },
];

const GROUP_LABELS: Record<Group, string> = {
  sessions: 'Sessions',
  money: 'Money',
  parents: 'Parents',
};

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
    <Layout pageTitle={`${t('tabs.notifications')} · ${t('page_title')}`} subtitle={t('tabs.notifications')} title={t('page_title')}>
      <SettingsTabs />
      <div className="max-w-2xl space-y-4">
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('notifications.eyebrow')}</div>
          <h2 className="font-display text-xl tracking-tighter m-0">{t('notifications.heading')}</h2>
          <p className="text-sm text-ink-muted mt-2">
            {t('notifications.intro')}
          </p>
        </div>
        {(['sessions', 'money', 'parents'] as Group[]).map((g) => {
          const items = TOGGLES.filter((tg) => tg.group === g);
          return (
            <div key={g} className="card p-5">
              <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium mb-3">{GROUP_LABELS[g]}</div>
              <ul className="divide-y divide-ruleSoft">
                {items.map((toggle) => (
                  <li key={toggle.key} className="flex items-center justify-between gap-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink">{t(`notifications.toggles.${toggle.i18nKey}.label`)}</div>
                      <div className="text-2xs text-ink-muted mt-0.5 leading-relaxed">{t(`notifications.toggles.${toggle.i18nKey}.description`)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Toggle
                        label="Email"
                        checked={valueOf(toggle.key)}
                        disabled={loading}
                        onChange={(v) => update(toggle.key, v)}
                      />
                      <DisabledToggle label="Push" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {saved && <div className="text-xs text-forest">{t('common.saved')}</div>}
      </div>
    </Layout>
  );
}

function Toggle({
  label, checked, disabled, onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <span className="text-2xs text-ink-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex w-9 h-5 rounded-full transition-colors duration-100',
          checked ? 'bg-forest' : 'bg-rule',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 inline-block h-4 w-4 rounded-full bg-surface shadow-sm transition-transform duration-100',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </label>
  );
}

function DisabledToggle({ label }: { label: string }) {
  return (
    <span title="Coming soon" className="inline-flex items-center gap-2 opacity-50 cursor-not-allowed">
      <span className="text-2xs text-ink-muted">{label}</span>
      <span className="relative inline-flex w-9 h-5 rounded-full bg-rule">
        <span className="absolute top-0.5 left-0.5 inline-block h-4 w-4 rounded-full bg-surface shadow-sm" />
      </span>
    </span>
  );
}

export default function Page() {
  return <AuthGuard><Inner /></AuthGuard>;
}
