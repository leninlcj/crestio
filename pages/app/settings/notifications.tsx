import { useEffect, useState } from 'react';
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

const TOGGLES: Array<{ key: PrefKey; label: string; description: string; defaultOn: boolean }> = [
  {
    key: 'notify_session_reminders',
    label: 'Session reminders',
    description: 'Email you one hour before each scheduled session.',
    defaultOn: true,
  },
  {
    key: 'notify_reschedule_events',
    label: 'Reschedules and cancellations',
    description: 'Parent-requested changes, confirmations, and rejections.',
    defaultOn: true,
  },
  {
    key: 'notify_invoice_events',
    label: 'Invoice events',
    description: 'When a parent marks an invoice paid or views it.',
    defaultOn: true,
  },
  {
    key: 'notify_overdue_alerts',
    label: 'Overdue invoice reminders',
    description: 'Once-per-invoice reminder 14 days after the due date.',
    defaultOn: true,
  },
  {
    key: 'notify_trial_and_billing',
    label: 'Trial and billing alerts',
    description: 'Trial ending, payment failures, subscription changes.',
    defaultOn: true,
  },
  {
    key: 'notify_messages_email',
    label: 'Messages from parents',
    description: 'Emails you when a parent sends you a message, throttled to once every 30 minutes per thread.',
    defaultOn: true,
  },
  {
    key: 'notify_messages_urgent_only',
    label: 'Urgent messages only',
    description: 'If on, skip emails for normal or info messages. You still see them in-app.',
    defaultOn: false,
  },
];

function Inner() {
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
    <Layout subtitle="Notifications" title="Settings">
      <SettingsTabs />
      <div className="max-w-2xl">
        <div className="card p-8 space-y-5">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Notifications</div>
            <h2 className="font-display text-xl tracking-tightest">Email notifications</h2>
            <p className="text-sm text-ink-muted mt-2">
              In-app notifications always appear regardless of these settings. These toggles only control email delivery.
            </p>
          </div>
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex items-start gap-4 cursor-pointer">
              <input
                type="checkbox"
                checked={valueOf(t.key)}
                disabled={loading}
                onChange={(e) => update(t.key, e.target.checked)}
                className="h-5 w-5 accent-forest mt-0.5"
              />
              <div className="flex-1">
                <div className="text-sm text-ink">{t.label}</div>
                <div className="text-2xs text-ink-muted mt-1 leading-relaxed">{t.description}</div>
              </div>
            </label>
          ))}
          {saved && <div className="text-xs text-forest">Saved.</div>}
        </div>
      </div>
    </Layout>
  );
}

export default function Page() {
  return <AuthGuard><Inner /></AuthGuard>;
}
