import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { DetailPane } from '../../../components/design/DetailPane';
import { FilterChips } from '../../../components/design/FilterChips';
import { StatusPill } from '../../../components/design/StatusPill';
import { Skeleton } from '../../../components/design/Skeleton';
import { useToast } from '../../../components/design/Toast';
import { IconArchive } from '../../../components/design/icons';
import { authFetch } from '../../../lib/authFetch';
import { formatDate, formatDateTime } from '../../../lib/utils';
import { INCIDENT_CATEGORIES } from '../../../lib/incidentForms';

type Incident = {
  id: string; created_at: string; updated_at: string;
  reported_by_role: string; reporter_name: string | null; reporter_email: string | null;
  student_id: string | null; tutor_id: string | null; session_id: string | null;
  occurred_at: string | null; category: string; description: string;
  status: 'open' | 'reviewing' | 'closed'; outcome: string | null; closed_at: string | null;
};

const TONE: Record<Incident['status'], 'amber' | 'forest' | 'neutral'> = { open: 'amber', reviewing: 'forest', closed: 'neutral' };
const LABEL: Record<Incident['status'], string> = { open: 'Open', reviewing: 'Reviewing', closed: 'Closed' };
const catLabel = (k: string) => INCIDENT_CATEGORIES.find((c) => c.key === k)?.label ?? k;

function IncidentsInner() {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Incident[]>([]);
  const [filter, setFilter] = useState('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/owner/incidents?status=${encodeURIComponent(status)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to load reports.');
      setRows(payload.incidents ?? []);
      setSetupRequired(!!payload.setup_required);
    } catch (e: any) {
      toast.show({ message: e?.message ?? 'Failed to load reports.', tone: 'error' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(filter); }, [filter, load]);
  useEffect(() => {
    const id = typeof router.query.incident === 'string' ? router.query.incident : null;
    if (id) { setSelectedId(id); setFilter('all'); }
  }, [router.query.incident]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  async function update(id: string, body: Record<string, unknown>, msg?: string) {
    const res = await authFetch(`/api/owner/incidents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show({ message: payload?.error ?? 'Could not update.', tone: 'error' }); return; }
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...payload.incident } : r)));
    if (msg) toast.show({ message: msg, tone: 'success' });
  }

  return (
    <Layout title="Leads" subtitle="Reports and incidents" pageTitle="Reports · Leads">
      {setupRequired && (
        <div className="card p-4 mb-4 bg-amber-soft/60 border-amber/40 text-sm text-amber-ink" role="status">
          The incidents table does not exist yet. Reports are being emailed to you in the meantime. Run <code className="font-mono text-xs">supabase/migrations/20260904_agency_chunk2.sql</code> in the Supabase SQL editor.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <FilterChips ariaLabel="Filter reports" options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} value={filter} onChange={(v) => setFilter(v as string)} />
      </div>
      {loading ? (
        <div className="card overflow-hidden">{Array.from({ length: 3 }, (_, i) => <div key={i} className="px-3 py-3"><Skeleton className="h-3 w-1/3 mb-1" /><Skeleton className="h-2.5 w-1/2" /></div>)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<IconArchive />} title={filter === 'open' ? 'No open reports.' : 'Nothing here.'} description="Concerns and complaints from crestio.ai/report land here, and you get an email for each one. Every report is a child-safe record; keep them." />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-rule">
            {rows.map((r) => (
              <li key={r.id} className={['cursor-pointer flex items-center gap-3 px-3 py-2.5 hover:bg-ruleSoft/40 transition-colors duration-100', selectedId === r.id ? 'bg-forest-soft/30' : ''].join(' ')} style={{ minHeight: 56 }} onClick={() => setSelectedId(r.id)}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink truncate">{catLabel(r.category)}<span className="text-ink-soft"> · {r.reporter_name ?? 'Anonymous'} ({r.reported_by_role})</span></div>
                  <div className="text-2xs text-ink-soft truncate">{r.description.slice(0, 120)}</div>
                </div>
                <div className="hidden md:block text-2xs text-ink-soft num tabular shrink-0">{formatDate(r.created_at, { day: 'numeric', month: 'short' })}</div>
                {r.category === 'safety' && <StatusPill tone="claret">Safety</StatusPill>}
                <StatusPill tone={TONE[r.status]}>{LABEL[r.status]}</StatusPill>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DetailPane open={!!selected} onClose={() => setSelectedId(null)} title={selected ? catLabel(selected.category) : ''} width={520}>
        {selected && <IncidentDetail key={selected.id} r={selected} onUpdate={(b, m) => update(selected.id, b, m)} />}
      </DetailPane>
    </Layout>
  );
}

function IncidentDetail({ r, onUpdate }: { r: Incident; onUpdate: (body: Record<string, unknown>, msg?: string) => Promise<void> }) {
  const [outcome, setOutcome] = useState(r.outcome ?? '');
  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap gap-2">
        {(['open', 'reviewing', 'closed'] as Incident['status'][]).map((s) => (
          <button key={s} type="button" onClick={() => onUpdate({ status: s }, `Marked ${LABEL[s].toLowerCase()}.`)} className={['pill', r.status === s ? 'pill-forest' : 'pill-neutral hover:bg-ruleSoft'].join(' ')} aria-pressed={r.status === s}>{LABEL[s]}</button>
        ))}
      </div>
      <dl>
        {[
          ['Received', formatDateTime(r.created_at)],
          ['From', `${r.reporter_name ?? '—'} (${r.reported_by_role})`],
          ['Email', r.reporter_email ?? '—'],
          ['Occurred', r.occurred_at ? formatDateTime(r.occurred_at) : '—'],
          ['Closed', r.closed_at ? formatDateTime(r.closed_at) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-2 border-b border-rule last:border-b-0">
            <dt className="text-xs text-ink-muted w-24 shrink-0">{k}</dt><dd className="text-sm text-ink text-right break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">Report</div>
        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{r.description}</p>
      </div>
      <div>
        <label className="label" htmlFor="inc-outcome">What you did and the outcome</label>
        <textarea id="inc-outcome" className="input" rows={5} value={outcome} onChange={(e) => setOutcome(e.target.value)} onBlur={() => { if (outcome !== (r.outcome ?? '')) onUpdate({ outcome }, 'Outcome saved.'); }} placeholder="Who you spoke to, when, what was found, what changed, whether anything was reported to the police or the Office of the Children's Guardian." />
        <p className="mt-1.5 text-2xs text-ink-soft">This is the record the NSW Child Safe Scheme expects you to keep. Write it as if someone else will read it later.</p>
      </div>
    </div>
  );
}

export default function IncidentsPage() {
  return <AuthGuard><IncidentsInner /></AuthGuard>;
}
