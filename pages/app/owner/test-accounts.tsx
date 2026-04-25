import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { isPlatformOwner } from '../../../lib/owner';
import { activeLocale } from '../../../lib/utils';

type Account = {
  user_id: string;
  parent_id?: string;
  role: 'tutor' | 'parent';
  email: string;
  name: string | null;
  created_at: string;
  last_login: string | null;
};

type SessionRow = {
  id: string;
  test_account_user_id: string;
  started_at: string;
  ended_at: string | null;
  ip_address: string | null;
};

function OwnerTestAccountsInner() {
  const { t } = useTranslation('owner');
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'tutor' | 'parent'>('tutor');
  const [fullName, setFullName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<{ email: string; password: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email ?? null;
      const ok = isPlatformOwner(email);
      setAllowed(ok);
      setAuthChecked(true);
      if (!ok) {
        router.replace('/app');
        return;
      }
      await reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }
    const res = await fetch('/api/owner/test-accounts', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      setError(t('test_accounts.errors.load_failed'));
      setLoading(false);
      return;
    }
    const payload = await res.json();
    setAccounts(payload.accounts ?? []);
    setRecentSessions(payload.recent_sessions ?? []);
    setLoading(false);
  }

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setCreating(true);
    setError(null);
    setJustCreated(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setCreating(false); return; }
    const res = await fetch('/api/owner/test-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ role, full_name: fullName.trim(), email: customEmail.trim() || undefined }),
    });
    setCreating(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload?.error ?? t('test_accounts.errors.create_failed'));
      return;
    }
    const payload = await res.json();
    setJustCreated({ email: payload.email, password: payload.initial_password });
    setFullName('');
    setCustomEmail('');
    await reload();
  }

  async function switchToTestAccount(userId: string) {
    setBusyId(userId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setBusyId(null); return; }
    const res = await fetch('/api/owner/switch-to-test-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ test_user_id: userId }),
    });
    setBusyId(null);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload?.error ?? t('test_accounts.errors.login_link_failed'));
      return;
    }
    const { login_url } = await res.json();
    window.open(login_url, '_blank', 'noopener');
    await reload();
  }

  async function deleteAccount(userId: string, email: string) {
    if (!window.confirm(t('test_accounts.list.confirm_delete', { email }))) return;
    setBusyId(userId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setBusyId(null); return; }
    const res = await fetch(`/api/owner/test-accounts/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setBusyId(null);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload?.error ?? t('test_accounts.errors.delete_failed'));
      return;
    }
    await reload();
  }

  if (!authChecked) return null;
  if (!allowed) return null;

  return (
    <Layout subtitle={t('test_accounts.page.subtitle')} title={t('test_accounts.page.title')}>
      <div className="card p-5 mb-6 bg-amber-soft/60 border-amber/40">
        <div className="text-sm text-amber-ink leading-relaxed">
          <span className="font-medium">{t('test_accounts.intro.label')}</span>{' '}
          {t('test_accounts.intro.body')}
        </div>
      </div>

      <section className="mb-10">
        <h2 className="font-display text-xl tracking-tightest mb-3">{t('test_accounts.list.heading')}</h2>
        {loading ? (
          <div className="card p-5 text-sm text-ink-muted">{t('test_accounts.list.loading')}</div>
        ) : accounts.length === 0 ? (
          <div className="card p-5 text-sm text-ink-muted">{t('test_accounts.list.empty')}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('test_accounts.list.col_role')}</th>
                  <th>{t('test_accounts.list.col_name')}</th>
                  <th>{t('test_accounts.list.col_email')}</th>
                  <th>{t('test_accounts.list.col_created')}</th>
                  <th>{t('test_accounts.list.col_last_login')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.user_id}>
                    <td><span className="badge-neutral text-2xs">{a.role}</span></td>
                    <td className="text-ink">{a.name ?? t('test_accounts.list.name_dash')}</td>
                    <td className="font-mono text-2xs text-ink-muted">{a.email}</td>
                    <td className="text-2xs text-ink-soft">
                      {new Date(a.created_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="text-2xs text-ink-soft">
                      {a.last_login
                        ? new Date(a.last_login).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' })
                        : t('test_accounts.list.last_login_dash')}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => switchToTestAccount(a.user_id)}
                          disabled={busyId === a.user_id}
                          className="btn-primary text-xs"
                        >
                          {busyId === a.user_id ? t('test_accounts.list.login_busy') : t('test_accounts.list.login_button')}
                        </button>
                        <button
                          onClick={() => deleteAccount(a.user_id, a.email)}
                          disabled={busyId === a.user_id}
                          className="btn-ghost text-xs text-claret"
                        >
                          {t('test_accounts.list.delete_button')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="font-display text-xl tracking-tightest mb-3">{t('test_accounts.create.heading')}</h2>
        <form onSubmit={createAccount} className="card p-5 space-y-3 max-w-xl">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('test_accounts.create.role_label')}</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as any)}>
                <option value="tutor">{t('test_accounts.create.role_tutor')}</option>
                <option value="parent">{t('test_accounts.create.role_parent')}</option>
              </select>
            </div>
            <div>
              <label className="label">{t('test_accounts.create.name_label')}</label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('test_accounts.create.name_placeholder')}
              />
            </div>
          </div>
          <div>
            <label className="label">{t('test_accounts.create.email_label')}</label>
            <input
              className="input"
              type="email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder={t('test_accounts.create.email_placeholder')}
            />
          </div>
          <button type="submit" disabled={creating || !fullName.trim()} className="btn-primary text-sm">
            {creating ? t('test_accounts.create.creating') : t('test_accounts.create.submit')}
          </button>
          {justCreated && (
            <div className="card p-4 bg-forest-soft/60 border-forest/30">
              <div className="text-sm text-forest-ink mb-1 font-medium">{t('test_accounts.create.success_title')}</div>
              <div className="text-2xs text-forest-ink/80 mb-1">
                {t('test_accounts.create.success_email_label')} <span className="font-mono">{justCreated.email}</span>
              </div>
              <div className="text-2xs text-forest-ink/80 mb-1">
                {t('test_accounts.create.success_password_label')}{' '}
                <span className="font-mono break-all select-all">{justCreated.password}</span>
              </div>
              <div className="text-2xs text-forest-ink/70">
                {t('test_accounts.create.success_hint')}
              </div>
            </div>
          )}
          {error && <div className="text-sm text-claret">{error}</div>}
        </form>
      </section>

      <section>
        <h2 className="font-display text-xl tracking-tightest mb-3">{t('test_accounts.recent.heading')}</h2>
        {recentSessions.length === 0 ? (
          <div className="card p-5 text-sm text-ink-muted">{t('test_accounts.recent.empty')}</div>
        ) : (
          <ul className="space-y-2">
            {recentSessions.map((s) => {
              const acct = accounts.find((a) => a.user_id === s.test_account_user_id);
              return (
                <li key={s.id} className="card p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-ink">{acct?.email ?? s.test_account_user_id}</span>
                    <span className="text-ink-soft"> · {acct?.role ?? t('test_accounts.recent.role_unknown')}</span>
                  </div>
                  <div className="text-ink-soft text-2xs">
                    {new Date(s.started_at).toLocaleString(activeLocale(), {
                      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                    })}
                    {s.ended_at && t('test_accounts.recent.ended_suffix')}
                    {s.ip_address && ` · ${s.ip_address}`}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Layout>
  );
}

export default function OwnerTestAccountsPage() {
  return (
    <AuthGuard>
      <OwnerTestAccountsInner />
    </AuthGuard>
  );
}
