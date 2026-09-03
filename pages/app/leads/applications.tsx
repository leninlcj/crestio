import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import EmptyState from '../../../components/EmptyState';
import { DetailPane } from '../../../components/design/DetailPane';
import { FilterChips } from '../../../components/design/FilterChips';
import { StatusPill } from '../../../components/design/StatusPill';
import { Skeleton } from '../../../components/design/Skeleton';
import { useToast } from '../../../components/design/Toast';
import { IconUsers } from '../../../components/design/icons';
import { authFetch } from '../../../lib/authFetch';
import { formatDate, formatDateTime, toDateTimeLocalInput, fromDateTimeLocalInput } from '../../../lib/utils';
import { subjectLabels, TUTOR_PAY_BANDS } from '../../../lib/agency';

type Status = 'new' | 'screening' | 'interview' | 'test' | 'offer' | 'accepted' | 'rejected' | 'withdrawn';

type Application = {
  id: string;
  created_at: string;
  updated_at: string;
  status: Status;
  full_name: string;
  email: string;
  phone: string;
  suburb: string;
  subjects: string[];
  qualifications: string;
  wwcc_status: 'current' | 'applying' | 'not_yet';
  wwcc_number: string | null;
  abn: string | null;
  mode: 'online' | 'in_home' | 'both';
  availability: string | null;
  has_transport: boolean | null;
  experience: string | null;
  cv_url: string | null;
  message: string | null;
  source: string | null;
  owner_notes: string | null;
  interview_at: string | null;
  decided_at: string | null;
  tutor_invitation_id: string | null;
  tutor_id: string | null;
};

const STATUS_LABEL: Record<Status, string> = {
  new: 'New', screening: 'Screening', interview: 'Interview', test: 'Subject test', offer: 'Offer', accepted: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn',
};
const STATUS_TONE: Record<Status, 'neutral' | 'forest' | 'success' | 'amber' | 'claret' | 'rust'> = {
  new: 'amber', screening: 'forest', interview: 'forest', test: 'forest', offer: 'forest', accepted: 'success', rejected: 'neutral', withdrawn: 'neutral',
};
const WWCC_LABEL = { current: 'Current', applying: 'Applying', not_yet: 'Not yet' } as const;
const MODE_LABEL = { online: 'Online', in_home: 'In-home', both: 'Online + in-home' } as const;

function ApplicationsInner() {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Application[]>([]);
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/owner/tutor-applications?status=${encodeURIComponent(status)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to load applications.');
      setRows(payload.applications ?? []);
    } catch (e: any) {
      toast.show({ message: e?.message ?? 'Failed to load applications.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(filter); }, [filter, load]);

  useEffect(() => {
    const id = typeof router.query.application === 'string' ? router.query.application : null;
    if (id) { setSelectedId(id); setFilter('all'); }
  }, [router.query.application]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => [r.full_name, r.email, r.phone, r.suburb, r.qualifications, r.subjects.join(' ')].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [rows, query]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  function patchLocal(id: string, patch: Partial<Application>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function update(id: string, body: Record<string, unknown>, okMessage?: string) {
    const res = await authFetch(`/api/owner/tutor-applications/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show({ message: payload?.error ?? 'Could not update.', tone: 'error' }); return false; }
    patchLocal(id, payload.application);
    if (okMessage) toast.show({ message: okMessage, tone: 'success' });
    return true;
  }

  async function invite(a: Application, payRateCents: number | null) {
    const res = await authFetch(`/api/owner/tutor-applications/${a.id}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pay_rate_cents: payRateCents }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show({ message: payload?.error ?? 'Could not send invitation.', tone: 'error' }); return; }
    patchLocal(a.id, { status: 'accepted', decided_at: new Date().toISOString(), tutor_invitation_id: payload.invitation_id, tutor_id: payload.tutor_id });
    if (payload.email_sent) toast.show({ message: `Invitation emailed to ${a.email}.`, tone: 'success' });
    else {
      try { await navigator.clipboard.writeText(payload.accept_url); } catch { /* ignore */ }
      toast.show({ message: 'Email failed; the invitation link was copied to your clipboard.', tone: 'warning' });
    }
  }

  return (
    <Layout title="Leads" subtitle="Tutor applications" pageTitle="Tutor applications · Leads">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <FilterChips
          ariaLabel="Filter applications"
          options={[
            { value: 'open', label: 'Open' },
            { value: 'new', label: 'New' },
            { value: 'interview', label: 'Interview' },
            { value: 'accepted', label: 'Accepted' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'all', label: 'All' },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as string)}
        />
        <input type="search" placeholder="Search applications…" value={query} onChange={(e) => setQuery(e.target.value)} className="input md:max-w-sm flex-1 min-w-[200px]" />
      </div>

      {loading ? (
        <div className="card overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5" style={{ minHeight: 56 }}>
              <div className="flex-1"><Skeleton className="h-3 w-1/3 mb-1" /><Skeleton className="h-2.5 w-1/2" /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<IconUsers />} title={filter === 'open' ? 'No open applications.' : 'Nothing here.'} description="Applications from crestio.ai/tutors/apply land here, and you get an email for each one." />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-rule">
            {filtered.map((a) => (
              <li
                key={a.id}
                className={['cursor-pointer flex items-center gap-3 px-3 py-2.5 hover:bg-ruleSoft/40 transition-colors duration-100', selectedId === a.id ? 'bg-forest-soft/30' : ''].join(' ')}
                style={{ minHeight: 56 }}
                onClick={() => setSelectedId(a.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink truncate">{a.full_name}<span className="text-ink-soft"> · {a.suburb}</span></div>
                  <div className="text-2xs text-ink-soft truncate">{subjectLabels(a.subjects).join(', ')} · {MODE_LABEL[a.mode]} · WWCC {WWCC_LABEL[a.wwcc_status]}</div>
                </div>
                <div className="hidden md:block text-2xs text-ink-soft num tabular shrink-0">{formatDate(a.created_at, { day: 'numeric', month: 'short' })}</div>
                <StatusPill tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</StatusPill>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DetailPane open={!!selected} onClose={() => setSelectedId(null)} title={selected ? selected.full_name : ''} width={520}>
        {selected && (
          <ApplicationDetail key={selected.id} a={selected} onUpdate={(b, m) => update(selected.id, b, m)} onInvite={(pay) => invite(selected, pay)} />
        )}
      </DetailPane>
    </Layout>
  );
}

function ApplicationDetail({ a, onUpdate, onInvite }: {
  a: Application;
  onUpdate: (body: Record<string, unknown>, okMessage?: string) => Promise<boolean>;
  onInvite: (payRateCents: number | null) => Promise<void>;
}) {
  const [notes, setNotes] = useState(a.owner_notes ?? '');
  const [interviewAt, setInterviewAt] = useState(a.interview_at ? toDateTimeLocalInput(a.interview_at) : '');
  const [pay, setPay] = useState('');
  const [busy, setBusy] = useState(false);

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-rule last:border-b-0">
      <dt className="text-xs text-ink-muted shrink-0 w-24">{k}</dt>
      <dd className="text-sm text-ink text-right break-words">{v}</dd>
    </div>
  );

  const payCents = pay.trim() === '' ? null : Math.round(parseFloat(pay) * 100);

  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap gap-2">
        {(['new', 'screening', 'interview', 'test', 'offer', 'rejected', 'withdrawn'] as Status[]).map((s) => (
          <button key={s} type="button" onClick={() => onUpdate({ status: s }, `Marked ${STATUS_LABEL[s].toLowerCase()}.`)} className={['pill', a.status === s ? 'pill-forest' : 'pill-neutral hover:bg-ruleSoft'].join(' ')} aria-pressed={a.status === s}>
            {STATUS_LABEL[s]}
          </button>
        ))}
        {a.status === 'accepted' && <span className="pill pill-success">Accepted</span>}
      </div>

      <dl>
        {row('Received', formatDateTime(a.created_at))}
        {row('Email', <a className="text-forest underline underline-offset-2" href={`mailto:${a.email}`}>{a.email}</a>)}
        {row('Phone', <a className="text-forest underline underline-offset-2" href={`tel:${a.phone}`}>{a.phone}</a>)}
        {row('Suburb', a.suburb)}
        {row('Subjects', subjectLabels(a.subjects).join(', '))}
        {row('Lessons', `${MODE_LABEL[a.mode]}${a.has_transport === true ? ' · own transport' : a.has_transport === false ? ' · public transport' : ''}`)}
        {row('WWCC', `${WWCC_LABEL[a.wwcc_status]}${a.wwcc_number ? ` · ${a.wwcc_number}` : ''}`)}
        {row('ABN', a.abn ?? '—')}
        {row('CV', a.cv_url ? <a className="text-forest underline underline-offset-2" href={a.cv_url} target="_blank" rel="noopener noreferrer">Open link</a> : '—')}
        {row('Source', a.source ?? '—')}
      </dl>

      <div>
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">Results and qualifications</div>
        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{a.qualifications}</p>
      </div>
      {a.experience && (
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">Experience</div>
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{a.experience}</p>
        </div>
      )}
      {a.availability && (
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">Availability</div>
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{a.availability}</p>
        </div>
      )}
      {a.message && (
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">Their message</div>
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{a.message}</p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="app-interview">Interview time</label>
        <input id="app-interview" type="datetime-local" className="input" value={interviewAt} onChange={(ev) => setInterviewAt(ev.target.value)} onBlur={() => { const iso = interviewAt ? fromDateTimeLocalInput(interviewAt) : null; if ((iso ?? null) !== (a.interview_at ?? null)) onUpdate({ interview_at: iso }, iso ? 'Interview saved.' : 'Interview cleared.'); }} />
      </div>

      <div>
        <label className="label" htmlFor="app-notes">Your notes</label>
        <textarea id="app-notes" className="input" rows={4} value={notes} onChange={(ev) => setNotes(ev.target.value)} onBlur={() => { if (notes !== (a.owner_notes ?? '')) onUpdate({ owner_notes: notes }, 'Notes saved.'); }} placeholder="Call notes, subject test result, practice lesson, WWCC verification date, references." />
      </div>

      {a.status === 'accepted' ? (
        <div className="card p-4 bg-success-soft/40 border-success/30 text-xs text-ink-muted">
          Accepted {a.decided_at ? formatDate(a.decided_at, { day: 'numeric', month: 'short' }) : ''}. The invitation email was sent; they appear under Team once they create their account.
        </div>
      ) : (
        <div className="card p-4 space-y-3">
          <div className="text-2xs uppercase tracking-widest text-ink-soft">Accept and invite</div>
          <div>
            <label className="label" htmlFor="app-pay">Hourly pay ($/hour, before super)</label>
            <input id="app-pay" className="input num tabular" inputMode="decimal" value={pay} onChange={(ev) => setPay(ev.target.value)} placeholder="e.g. 50" />
            <p className="mt-1.5 text-2xs text-ink-soft">
              Proposed bands (confirm with your accountant first): Years 7–10 ${TUTOR_PAY_BANDS.years_7_10.online} online / ${TUTOR_PAY_BANDS.years_7_10.inHome} in-home · HSC ${TUTOR_PAY_BANDS.hsc.online} / ${TUTOR_PAY_BANDS.hsc.inHome} · Ext 2 ${TUTOR_PAY_BANDS.ext2.online} / ${TUTOR_PAY_BANDS.ext2.inHome}.
            </p>
          </div>
          <p className="text-2xs text-ink-soft">Sends the tutor invitation email and creates their tutor record with the details from this application. Do this only after the WWCC is verified.</p>
          <button type="button" disabled={busy} className="btn-primary w-full" onClick={async () => { setBusy(true); try { await onInvite(payCents); } finally { setBusy(false); } }}>
            {busy ? 'Sending…' : 'Accept and send invitation'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ApplicationsPage() {
  return <AuthGuard><ApplicationsInner /></AuthGuard>;
}
