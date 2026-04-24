import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { isPlatformOwner } from '../../../lib/owner';

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
      setError('Could not load test accounts.');
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
      setError(payload?.error ?? 'Could not create test account.');
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
      setError(payload?.error ?? 'Could not generate login link.');
      return;
    }
    const { login_url } = await res.json();
    window.open(login_url, '_blank', 'noopener');
    await reload();
  }

  async function deleteAccount(userId: string, email: string) {
    if (!window.confirm(`Delete test account ${email}? This deletes the auth user and cannot be undone.`)) return;
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
      setError(payload?.error ?? 'Could not delete.');
      return;
    }
    await reload();
  }

  if (!authChecked) return null;
  if (!allowed) return null;

  return (
    <Layout subtitle="Owner tools" title="Test accounts">
      <div className="card p-5 mb-6 bg-amber-soft/60 border-amber/40">
        <div className="text-sm text-amber-ink leading-relaxed">
          <span className="font-medium">Test accounts.</span>{' '}
          These are pre-created test accounts you own. Logging in as one opens a new session
          bounded by the same security rules as any real user. You never see other users' data
          through this flow.
        </div>
      </div>

      <section className="mb-10">
        <h2 className="font-display text-xl tracking-tightest mb-3">Your test accounts</h2>
        {loading ? (
          <div className="card p-5 text-sm text-ink-muted">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="card p-5 text-sm text-ink-muted">No test accounts yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Last login</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.user_id}>
                    <td><span className="badge-neutral text-2xs">{a.role}</span></td>
                    <td className="text-ink">{a.name ?? '—'}</td>
                    <td className="font-mono text-2xs text-ink-muted">{a.email}</td>
                    <td className="text-2xs text-ink-soft">
                      {new Date(a.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="text-2xs text-ink-soft">
                      {a.last_login
                        ? new Date(a.last_login).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => switchToTestAccount(a.user_id)}
                          disabled={busyId === a.user_id}
                          className="btn-primary text-xs"
                        >
                          {busyId === a.user_id ? '…' : 'Log in as test'}
                        </button>
                        <button
                          onClick={() => deleteAccount(a.user_id, a.email)}
                          disabled={busyId === a.user_id}
                          className="btn-ghost text-xs text-claret"
                        >
                          Delete
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
        <h2 className="font-display text-xl tracking-tightest mb-3">Create test account</h2>
        <form onSubmit={createAccount} className="card p-5 space-y-3 max-w-xl">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Role</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as any)}>
                <option value="tutor">Tutor (inside your org)</option>
                <option value="parent">Parent (portal)</option>
              </select>
            </div>
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Test Tutor Mai"
              />
            </div>
          </div>
          <div>
            <label className="label">Email (optional — auto-generated if blank)</label>
            <input
              className="input"
              type="email"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="test-tutor-abc123@crestio.test"
            />
          </div>
          <button type="submit" disabled={creating || !fullName.trim()} className="btn-primary text-sm">
            {creating ? 'Creating…' : 'Create test account'}
          </button>
          {justCreated && (
            <div className="card p-4 bg-forest-soft/60 border-forest/30">
              <div className="text-sm text-forest-ink mb-1 font-medium">Test account created.</div>
              <div className="text-2xs text-forest-ink/80 mb-1">
                Email: <span className="font-mono">{justCreated.email}</span>
              </div>
              <div className="text-2xs text-forest-ink/80 mb-1">
                Initial password:{' '}
                <span className="font-mono break-all select-all">{justCreated.password}</span>
              </div>
              <div className="text-2xs text-forest-ink/70">
                Save this password now — it's shown once. Or click "Log in as test" in the table above to get
                a magic-link login.
              </div>
            </div>
          )}
          {error && <div className="text-sm text-claret">{error}</div>}
        </form>
      </section>

      <section>
        <h2 className="font-display text-xl tracking-tightest mb-3">Recent test sessions</h2>
        {recentSessions.length === 0 ? (
          <div className="card p-5 text-sm text-ink-muted">No test-account logins yet.</div>
        ) : (
          <ul className="space-y-2">
            {recentSessions.map((s) => {
              const acct = accounts.find((a) => a.user_id === s.test_account_user_id);
              return (
                <li key={s.id} className="card p-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-ink">{acct?.email ?? s.test_account_user_id}</span>
                    <span className="text-ink-soft"> · {acct?.role ?? 'unknown'}</span>
                  </div>
                  <div className="text-ink-soft text-2xs">
                    {new Date(s.started_at).toLocaleString('en-AU', {
                      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                    })}
                    {s.ended_at && ' · ended'}
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
