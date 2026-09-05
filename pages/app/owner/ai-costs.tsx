import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { isPlatformOwner } from '../../../lib/owner';

type Rollup = {
  window_weeks: number;
  total: { calls: number; cost: number; escalations: number };
  by_user: Array<{ user_id: string; email: string | null; calls: number; cost: number; escalations: number }>;
  by_task: Array<{ task_type: string; calls: number; cost: number; escalations: number }>;
  by_model: Array<{ model: string; calls: number; cost: number }>;
};

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function AiCostsInner() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [data, setData] = useState<Rollup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(4);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email ?? null;
      const ok = isPlatformOwner(email);
      setAllowed(ok);
      setAuthChecked(true);
      if (!ok) router.replace('/app');
    })();
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not signed in.'); return; }
      const res = await fetch(`/api/owner/ai-costs?weeks=${weeks}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(payload?.error ?? 'Could not load costs.'); return; }
      setData(payload as Rollup);
    })();
  }, [allowed, weeks]);

  if (!authChecked) return null;
  if (!allowed) return null;

  return (
    <Layout title="AI costs" subtitle="Cost rollup by user, task, model">
      <div className="max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <label className="text-sm text-ink-muted">Window:</label>
          <select
            className="input w-32"
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
          >
            <option value={1}>1 week</option>
            <option value={2}>2 weeks</option>
            <option value={4}>4 weeks</option>
            <option value={8}>8 weeks</option>
            <option value={12}>12 weeks</option>
          </select>
        </div>

        {error && <div className="card p-4 text-sm text-claret">{error}</div>}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Stat label="Total calls" value={data.total.calls.toLocaleString()} />
              <Stat label="Total cost" value={fmtUsd(data.total.cost)} />
              <Stat
                label="Escalation rate"
                value={
                  data.total.calls
                    ? `${Math.round((data.total.escalations / data.total.calls) * 100)}%`
                    : '–'
                }
              />
            </div>

            <Section title="By user">
              <table className="table">
                <thead><tr><th>User</th><th>Calls</th><th>Cost</th><th>Escalations</th></tr></thead>
                <tbody>
                  {data.by_user.map((r) => (
                    <tr key={r.user_id}>
                      <td className="text-ink">{r.email ?? r.user_id}</td>
                      <td className="num font-mono">{r.calls}</td>
                      <td className="num font-mono">{fmtUsd(r.cost)}</td>
                      <td className="num font-mono">{r.escalations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="By task type">
              <table className="table">
                <thead><tr><th>Task</th><th>Calls</th><th>Cost</th><th>Escalations</th></tr></thead>
                <tbody>
                  {data.by_task.map((r) => (
                    <tr key={r.task_type}>
                      <td className="text-ink">{r.task_type}</td>
                      <td className="num font-mono">{r.calls}</td>
                      <td className="num font-mono">{fmtUsd(r.cost)}</td>
                      <td className="num font-mono">{r.escalations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="By model">
              <table className="table">
                <thead><tr><th>Model</th><th>Calls</th><th>Cost</th></tr></thead>
                <tbody>
                  {data.by_model.map((r) => (
                    <tr key={r.model}>
                      <td className="text-ink font-mono">{r.model}</td>
                      <td className="num font-mono">{r.calls}</td>
                      <td className="num font-mono">{fmtUsd(r.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-2xs uppercase tracking-widest text-ink-muted">{label}</div>
      <div className="text-2xl font-display tracking-tightest text-ink mt-1">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="font-display text-xl tracking-tightest text-ink mb-4">{title}</h2>
      <div className="table-wrap">{children}</div>
    </div>
  );
}

export default function Page() {
  return <AuthGuard><AiCostsInner /></AuthGuard>;
}
