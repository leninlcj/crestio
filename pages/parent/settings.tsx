import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuardParent from '../../components/AuthGuardParent';
import ParentLayout from '../../components/parent/ParentLayout';
import { supabase } from '../../lib/supabase';

function Inner() {
  const { t } = useTranslation('parent');
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
      setPasswordError(t('settings_page.password_too_short'));
      return;
    }
    setChangingPassword(true);
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (err) { setPasswordError(err.message); return; }
    setNewPassword('');
    setPasswordMsg(t('settings_page.password_updated'));
    setTimeout(() => setPasswordMsg(null), 3000);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/parent/signin');
  }

  return (
    <section className="px-6 md:px-12 pt-10 pb-16 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-1">
          {t('settings_page.heading')}
        </h1>
        <p className="text-sm text-ink-muted">{t('settings_page.sub_v2')}</p>
      </div>

      {loading ? (
        <div className="text-sm text-ink-muted">{t('settings_page.loading')}</div>
      ) : (
        <div className="space-y-6">
          <form onSubmit={saveName} className="rounded-md border border-rule bg-surface p-6 md:p-7 space-y-5">
            <div>
              <h2 className="font-display text-lg tracking-tightest mb-1">{t('settings_page.profile_heading')}</h2>
              <p className="text-2xs text-ink-soft">{t('settings_page.profile_sub')}</p>
            </div>
            <div>
              <label className="label">{t('settings_page.email_label')}</label>
              <input type="email" disabled value={email} className="input bg-ruleSoft" />
              <div className="text-2xs text-ink-soft mt-1.5">{t('settings_page.email_hint')}</div>
            </div>
            <div>
              <label className="label">{t('settings_page.name_label')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </div>
            {nameError && <div className="text-sm text-claret">{nameError}</div>}
            {nameSaved && <div className="text-sm text-success">{t('settings_page.saved')}</div>}
            <div>
              <button type="submit" disabled={savingName} className="btn-primary">
                {savingName ? t('settings_page.saving') : t('settings_page.save')}
              </button>
            </div>
          </form>

          <form onSubmit={changePassword} className="rounded-md border border-rule bg-surface p-6 md:p-7 space-y-5">
            <div>
              <h2 className="font-display text-lg tracking-tightest mb-1">{t('settings_page.change_password')}</h2>
              <p className="text-2xs text-ink-soft">{t('settings_page.password_sub')}</p>
            </div>
            <div>
              <label className="label">{t('settings_page.new_password_label')}</label>
              <input type="password" minLength={8} required value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} className="input" />
              <div className="text-2xs text-ink-soft mt-1.5">{t('settings_page.password_min')}</div>
            </div>
            {passwordError && <div className="text-sm text-claret">{passwordError}</div>}
            {passwordMsg && <div className="text-sm text-success">{passwordMsg}</div>}
            <div>
              <button type="submit" disabled={changingPassword || newPassword.length < 8} className="btn-primary">
                {changingPassword ? t('settings_page.updating') : t('settings_page.update_password')}
              </button>
            </div>
          </form>

          <div className="rounded-md border border-rule bg-surface p-6 md:p-7">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h2 className="font-display text-lg tracking-tightest">{t('settings_page.notifications_heading')}</h2>
              <Link href="/parent/settings/notifications" className="text-xs text-forest hover:text-forest-ink underline underline-offset-2">
                {t('settings_page.notifications_manage')} →
              </Link>
            </div>
            <p className="text-sm text-ink-muted">{t('settings_page.notifications_sub')}</p>
          </div>

          <div className="rounded-md border border-rule bg-surface p-6 md:p-7">
            <h2 className="font-display text-lg tracking-tightest mb-2">{t('settings_page.sign_out_heading')}</h2>
            <p className="text-sm text-ink-muted mb-4">
              {t('settings_page.sign_out_body')}
            </p>
            <button onClick={signOut} className="btn-secondary">{t('settings_page.sign_out')}</button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ParentSettings() {
  return (
    <AuthGuardParent>
      <ParentLayout noTabs>
        <Inner />
      </ParentLayout>
    </AuthGuardParent>
  );
}
