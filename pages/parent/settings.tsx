import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuardParent from '../../components/AuthGuardParent';
import { supabase } from '../../lib/supabase';

function ParentSettingsInner() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: parent } = await supabase
        .from('parents')
        .select('id, name, email')
        .eq('auth_user_id', session.user.id)
        .single();
      if (parent) {
        setParentId(parent.id);
        setName(parent.name ?? '');
        setEmail(parent.email);
      }
      setLoading(false);
    })();
  }, []);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!parentId) return;
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    const { error: err } = await supabase
      .from('parents')
      .update({ name: name.trim() || null })
      .eq('id', parentId);
    setSavingName(false);
    if (err) { setNameError(err.message); return; }
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMsg(null);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    setChangingPassword(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (err) { setPasswordError(err.message); return; }
    setNewPassword('');
    setPasswordMsg('Password updated.');
    setTimeout(() => setPasswordMsg(null), 3000);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/parent/signin');
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/dashboard" className="text-sm text-ink-muted hover:text-ink">
          ← Dashboard
        </Link>
      </nav>

      <main className="px-6 md:px-12 py-12 md:py-16 max-w-xl mx-auto space-y-6">
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Account</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tightest mb-6">Settings</h1>
        </div>

        {loading ? (
          <div className="text-sm text-ink-muted">Loading…</div>
        ) : (
          <>
            <form onSubmit={saveName} className="card p-8 space-y-5">
              <h2 className="font-display text-xl tracking-tightest">Your details</h2>
              <div>
                <label className="label">Email</label>
                <input type="email" disabled value={email} className="input bg-ink-soft/10" />
                <div className="text-2xs text-ink-soft mt-1.5">
                  Contact your tutor if your email needs to change.
                </div>
              </div>
              <div>
                <label className="label">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" />
              </div>
              {nameError && <div className="text-sm text-claret">{nameError}</div>}
              {nameSaved && <div className="text-sm text-forest">Saved.</div>}
              <button type="submit" disabled={savingName} className="btn-primary">
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </form>

            <form onSubmit={changePassword} className="card p-8 space-y-5">
              <h2 className="font-display text-xl tracking-tightest">Change password</h2>
              <div>
                <label className="label">New password</label>
                <input type="password" minLength={8} required value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)} className="input" />
                <div className="text-2xs text-ink-soft mt-1.5">At least 8 characters.</div>
              </div>
              {passwordError && <div className="text-sm text-claret">{passwordError}</div>}
              {passwordMsg && <div className="text-sm text-forest">{passwordMsg}</div>}
              <button type="submit" disabled={changingPassword || newPassword.length < 8}
                className="btn-primary">
                {changingPassword ? 'Updating…' : 'Update password'}
              </button>
            </form>

            {parentId && <ParentNotifPrefs parentId={parentId} />}

            <div className="card p-8">
              <h2 className="font-display text-xl tracking-tightest mb-4">Sign out</h2>
              <p className="text-sm text-ink-muted mb-4">
                Signing out ends this session.
              </p>
              <button onClick={signOut} className="btn-secondary">Sign out</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ParentNotifPrefs({ parentId }: { parentId: string }) {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('parents')
        .select('notify_messages_email, notify_messages_urgent_only')
        .eq('id', parentId)
        .maybeSingle();
      if (data) {
        setEmailEnabled(data.notify_messages_email !== false);
        setUrgentOnly(!!data.notify_messages_urgent_only);
      }
      setLoaded(true);
    })();
  }, [parentId]);

  async function update(field: 'notify_messages_email' | 'notify_messages_urgent_only', value: boolean) {
    await supabase.from('parents').update({ [field]: value }).eq('id', parentId);
  }

  return (
    <div className="card p-8 space-y-5">
      <div>
        <h2 className="font-display text-xl tracking-tightest">Message notifications</h2>
        <p className="text-sm text-ink-muted mt-2">
          Choose when Crestio emails you. In-app messages appear regardless.
        </p>
      </div>
      <label className="flex items-start gap-4 cursor-pointer">
        <input
          type="checkbox"
          checked={emailEnabled}
          disabled={!loaded}
          onChange={(e) => { setEmailEnabled(e.target.checked); update('notify_messages_email', e.target.checked); }}
          className="h-5 w-5 accent-forest mt-0.5"
        />
        <div className="flex-1">
          <div className="text-sm text-ink">Email me when my tutor messages me</div>
          <div className="text-2xs text-ink-muted mt-1">Throttled to at most once every 30 minutes per thread.</div>
        </div>
      </label>
      <label className="flex items-start gap-4 cursor-pointer">
        <input
          type="checkbox"
          checked={urgentOnly}
          disabled={!loaded || !emailEnabled}
          onChange={(e) => { setUrgentOnly(e.target.checked); update('notify_messages_urgent_only', e.target.checked); }}
          className="h-5 w-5 accent-forest mt-0.5"
        />
        <div className="flex-1">
          <div className="text-sm text-ink">Email me only for urgent messages</div>
          <div className="text-2xs text-ink-muted mt-1">Skip emails for normal or info messages.</div>
        </div>
      </label>
    </div>
  );
}

export default function ParentSettings() {
  return <AuthGuardParent><ParentSettingsInner /></AuthGuardParent>;
}
