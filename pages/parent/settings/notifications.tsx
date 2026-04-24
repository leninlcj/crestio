import { useEffect, useState } from 'react';
import Link from 'next/link';
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

const TOGGLES: Array<{ key: PrefKey; label: string; description: string; defaultOn: boolean }> = [
  {
    key: 'notify_session_reminders',
    label: 'Session reminders',
    description: 'Email you 24 hours before each scheduled session.',
    defaultOn: true,
  },
  {
    key: 'notify_reschedule_events',
    label: 'Reschedules and cancellations',
    description: 'When your tutor changes or cancels a session.',
    defaultOn: true,
  },
  {
    key: 'notify_invoice_events',
    label: 'Invoice notifications',
    description: 'When a new invoice is sent.',
    defaultOn: true,
  },
  {
    key: 'notify_parent_updates',
    label: 'Updates from your tutor',
    description: 'When your tutor posts a portal update about your child.',
    defaultOn: true,
  },
  {
    key: 'notify_messages_email',
    label: 'Messages from your tutor',
    description: 'Email you when the tutor sends you a message. Throttled to once every 30 minutes.',
    defaultOn: true,
  },
  {
    key: 'notify_messages_urgent_only',
    label: 'Urgent messages only',
    description: 'If on, skip emails for normal or info messages.',
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
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/settings" className="text-sm text-ink-muted hover:text-ink">← Settings</Link>
      </nav>
      <main className="px-6 md:px-12 py-10 max-w-2xl mx-auto">
        <div className="mb-6">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Settings</div>
          <h1 className="font-display text-4xl tracking-tightest">Email notifications</h1>
        </div>
        <div className="card p-8 space-y-5">
          <p className="text-sm text-ink-muted">
            In-app notifications always appear regardless of these toggles. These only control email delivery.
          </p>
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
      </main>
    </div>
  );
}

export default function Page() {
  return <AuthGuardParent><Inner /></AuthGuardParent>;
}
