import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import { formatDate, formatDateTime } from '../../../lib/utils';
import { NEEDS, subjectLabels, hourlyRateCents, rateBandForYearLevel, rateBand, type SubjectKey } from '../../../lib/agency';

type Enquiry = {
  id: string;
  created_at: string;
  updated_at: string;
  status: 'new' | 'contacted' | 'trial_booked' | 'matched' | 'lost' | 'spam';
  who: 'my_child' | 'me' | 'someone_else';
  parent_name: string;
  email: string;
  phone: string | null;
  student_first_name: string | null;
  year_level: string;
  subjects: string[];
  mode: 'online' | 'in_home' | 'either';
  suburb: string | null;
  need: string | null;
  message: string | null;
  source: string | null;
  owner_notes: string | null;
  assigned_tutor_id: string | null;
  household_id: string | null;
  student_id: string | null;
  contacted_at: string | null;
  converted_at: string | null;
};

type Tutor = { id: string; name: string; subjects: string[] | null; suburb: string | null; mode: string | null };

const STATUS_LABEL: Record<Enquiry['status'], string> = {
  new: 'New', contacted: 'Contacted', trial_booked: 'Trial booked', matched: 'Matched', lost: 'Lost', spam: 'Spam',
};
const STATUS_TONE: Record<Enquiry['status'], 'neutral' | 'forest' | 'success' | 'amber' | 'claret' | 'rust'> = {
  new: 'amber', contacted: 'forest', trial_booked: 'forest', matched: 'success', lost: 'neutral', spam: 'claret',
};
const MODE_LABEL = { online: 'Online', in_home: 'In-home', either: 'Either' } as const;

function needLabel(key: string | null): string {
  return NEEDS.find((n) => n.key === key)?.label ?? '—';
}

function suggestedRate(e: Enquiry, mode: 'online' | 'in_home'): number | null {
  let best: number | null = null;
  for (const s of e.subjects as SubjectKey[]) {
    const r = hourlyRateCents(s, mode);
    if (r != null && (best == null || r > best)) best = r;
  }
  if (best == null) {
    const band = rateBandForYearLevel(e.year_level);
    if (band) {
      const b = rateBand(band);
      const d = mode === 'online' ? b.online : b.inHome;
      best = d == null ? null : d * 100;
    }
  }
  return best;
}

function LeadsInner() {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/owner/enquiries?status=${encodeURIComponent(status)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to load enquiries.');
      setRows(payload.enquiries ?? []);
      setTutors(payload.tutors ?? []);
      setSetupRequired(!!payload.setup_required);
    } catch (e: any) {
      toast.show({ message: e?.message ?? 'Failed to load enquiries.', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(filter); }, [filter, load]);

  // Deep link from the alert email: /app/leads?enquiry=<id>
  useEffect(() => {
    const id = typeof router.query.enquiry === 'string' ? router.query.enquiry : null;
    if (id) { setSelectedId(id); setFilter('all'); }
  }, [router.query.enquiry]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => [r.parent_name, r.email, r.phone, r.student_first_name, r.suburb, r.year_level, r.subjects.join(' ')].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [rows, query]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const counts = useMemo(() => ({ new: rows.filter((r) => r.status === 'new').length }), [rows]);

  function patchLocal(id: string, patch: Partial<Enquiry>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function update(id: string, body: Record<string, unknown>, okMessage?: string) {
    const res = await authFetch(`/api/owner/enquiries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show({ message: payload?.error ?? 'Could not update.', tone: 'error' }); return false; }
    patchLocal(id, payload.enquiry);
    if (okMessage) toast.show({ message: okMessage, tone: 'success' });
    return true;
  }

  async function convert(e: Enquiry, mode: 'online' | 'in_home', rateCents: number | null, tutorId: string | null, studentName: string) {
    const res = await authFetch(`/api/owner/enquiries/${e.id}/convert`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, hourly_rate_cents: rateCents, tutor_id: tutorId, student_name: studentName }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show({ message: payload?.error ?? 'Could not convert.', tone: 'error' }); return; }
    patchLocal(e.id, { household_id: payload.household_id, student_id: payload.student_id, converted_at: new Date().toISOString(), assigned_tutor_id: tutorId, status: e.status === 'new' || e.status === 'contacted' ? 'trial_booked' : e.status });
    toast.show({ message: 'Household and student created. Invite the parent from People → Parents when ready.', tone: 'success' });
  }

  async function propose(e: Enquiry, tutorId: string, message: string, times: string) {
    const res = await authFetch(`/api/owner/enquiries/${e.id}/propose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tutor_id: tutorId, message, proposed_times: times }) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show({ message: payload?.error ?? 'Could not send the proposal.', tone: 'error' }); return; }
    if (payload.enquiry) patchLocal(e.id, payload.enquiry);
    toast.show({ message: `Proposal emailed to ${e.email}.`, tone: 'success' });
  }

  return (
    <Layout title="Leads" subtitle="Enquiries" pageTitle="Enquiries · Leads">
      {setupRequired && (
        <div className="card p-4 mb-4 bg-amber-soft/60 border-amber/40 text-sm text-amber-ink" role="status">
          The enquiries table does not exist yet. Enquiries are being emailed to you in the meantime. Run <code className="font-mono text-xs">supabase/migrations/20260903_agency_enquiries_applications.sql</code> in the Supabase SQL editor to start storing them here.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <FilterChips
          ariaLabel="Filter enquiries"
          options={[
            { value: 'open', label: 'Open', count: filter === 'open' ? rows.length : undefined },
            { value: 'new', label: 'New', count: counts.new || undefined },
            { value: 'matched', label: 'Matched' },
            { value: 'lost', label: 'Lost' },
            { value: 'all', label: 'All' },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as string)}
        />
        <input type="search" placeholder="Search enquiries…" value={query} onChange={(e) => setQuery(e.target.value)} className="input md:max-w-sm flex-1 min-w-[200px]" />
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
        <EmptyState
          icon={<IconUsers />}
          title={filter === 'open' ? 'No open enquiries.' : 'Nothing here.'}
          description="Enquiries from crestio.ai/enquire land here, and you get an email for each one."
        />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-rule">
            {filtered.map((e) => (
              <li
                key={e.id}
                className={['cursor-pointer flex items-center gap-3 px-3 py-2.5 hover:bg-ruleSoft/40 transition-colors duration-100', selectedId === e.id ? 'bg-forest-soft/30' : ''].join(' ')}
                style={{ minHeight: 56 }}
                onClick={() => setSelectedId(e.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink truncate">
                    {e.parent_name}
                    <span className="text-ink-soft"> · {e.student_first_name ? `${e.student_first_name}, ` : ''}{e.year_level}</span>
                  </div>
                  <div className="text-2xs text-ink-soft truncate">
                    {subjectLabels(e.subjects).join(', ')} · {MODE_LABEL[e.mode]}{e.suburb ? ` · ${e.suburb}` : ''}{e.source ? ` · via ${e.source}` : ''}
                  </div>
                </div>
                <div className="hidden md:block text-2xs text-ink-soft num tabular shrink-0">{formatDate(e.created_at, { day: 'numeric', month: 'short' })}</div>
                {e.converted_at && <StatusPill tone="success">Converted</StatusPill>}
                <StatusPill tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</StatusPill>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DetailPane open={!!selected} onClose={() => setSelectedId(null)} title={selected ? selected.parent_name : ''} width={520}>
        {selected && (
          <LeadDetail
            key={selected.id}
            e={selected}
            tutors={tutors}
            onUpdate={(body, msg) => update(selected.id, body, msg)}
            onConvert={(mode, rate, tutorId, name) => convert(selected, mode, rate, tutorId, name)}
            onPropose={(tutorId, message, times) => propose(selected, tutorId, message, times)}
          />
        )}
      </DetailPane>
    </Layout>
  );
}

function LeadDetail({ e, tutors, onUpdate, onConvert, onPropose }: {
  e: Enquiry;
  tutors: Tutor[];
  onUpdate: (body: Record<string, unknown>, okMessage?: string) => Promise<boolean>;
  onConvert: (mode: 'online' | 'in_home', rateCents: number | null, tutorId: string | null, studentName: string) => Promise<void>;
  onPropose: (tutorId: string, message: string, times: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState(e.owner_notes ?? '');
  const [mode, setMode] = useState<'online' | 'in_home'>(e.mode === 'in_home' ? 'in_home' : 'online');
  const [rate, setRate] = useState<string>(() => { const r = suggestedRate(e, e.mode === 'in_home' ? 'in_home' : 'online'); return r == null ? '' : String(r / 100); });
  const [tutorId, setTutorId] = useState<string>(e.assigned_tutor_id ?? '');
  const [studentName, setStudentName] = useState<string>(() => {
    const last = e.parent_name.trim().split(/\s+/).slice(-1)[0] ?? '';
    return e.who === 'me' ? e.parent_name : [e.student_first_name, last].filter(Boolean).join(' ');
  });
  const [busy, setBusy] = useState(false);
  const [proposeMsg, setProposeMsg] = useState('');
  const [proposeTimes, setProposeTimes] = useState('');
  const [proposing, setProposing] = useState(false);

  useEffect(() => {
    const r = suggestedRate(e, mode);
    setRate(r == null ? '' : String(r / 100));
  }, [mode, e]);

  const rateCents = rate.trim() === '' ? null : Math.round(parseFloat(rate) * 100);

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-rule last:border-b-0">
      <dt className="text-xs text-ink-muted shrink-0 w-24">{k}</dt>
      <dd className="text-sm text-ink text-right break-words">{v}</dd>
    </div>
  );

  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap gap-2">
        {(['new', 'contacted', 'trial_booked', 'matched', 'lost', 'spam'] as Enquiry['status'][]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onUpdate({ status: s }, `Marked ${STATUS_LABEL[s].toLowerCase()}.`)}
            className={['pill', e.status === s ? 'pill-forest' : 'pill-neutral hover:bg-ruleSoft'].join(' ')}
            aria-pressed={e.status === s}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <dl>
        {row('Received', formatDateTime(e.created_at))}
        {row('Email', <a className="text-forest underline underline-offset-2" href={`mailto:${e.email}`}>{e.email}</a>)}
        {row('Phone', e.phone ? <a className="text-forest underline underline-offset-2" href={`tel:${e.phone}`}>{e.phone}</a> : '—')}
        {row('Who', e.who === 'me' ? 'Themselves' : e.who === 'my_child' ? 'Their child' : 'Someone else')}
        {row('Student', `${e.student_first_name ?? '—'} · ${e.year_level}`)}
        {row('Subjects', subjectLabels(e.subjects).join(', '))}
        {row('Lessons', `${MODE_LABEL[e.mode]}${e.suburb ? ` · ${e.suburb}` : ''}`)}
        {row('Focus', needLabel(e.need))}
        {row('Source', e.source ?? '—')}
        {e.contacted_at && row('Contacted', formatDateTime(e.contacted_at))}
      </dl>

      {e.message && (
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">Their message</div>
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{e.message}</p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="lead-notes">Your notes</label>
        <textarea id="lead-notes" className="input" rows={3} value={notes} onChange={(ev) => setNotes(ev.target.value)} onBlur={() => { if (notes !== (e.owner_notes ?? '')) onUpdate({ owner_notes: notes }, 'Notes saved.'); }} placeholder="Call summary, availability, what they need." />
      </div>

      <div>
        <label className="label" htmlFor="lead-tutor">Assigned tutor</label>
        <select id="lead-tutor" className="input" value={tutorId} onChange={(ev) => { setTutorId(ev.target.value); onUpdate({ assigned_tutor_id: ev.target.value || null }, ev.target.value ? 'Tutor assigned.' : 'Tutor cleared.'); }}>
          <option value="">— Not yet —</option>
          {tutors.map((t) => <option key={t.id} value={t.id}>{t.name}{t.suburb ? ` · ${t.suburb}` : ''}</option>)}
        </select>
        {tutors.length === 0 && <p className="mt-1.5 text-2xs text-ink-soft">No tutors yet. Accepted applications appear here.</p>}
      </div>

      {tutorId && !e.converted_at && (
        <div className="card p-4 space-y-3">
          <div className="text-2xs uppercase tracking-widest text-ink-soft">Email the family a tutor proposal</div>
          <div>
            <label className="label" htmlFor="lead-times">Times that could work (optional)</label>
            <input id="lead-times" className="input" value={proposeTimes} onChange={(ev) => setProposeTimes(ev.target.value)} placeholder="e.g. Tue 4pm, Thu 5pm, Sat 10am" />
          </div>
          <div>
            <label className="label" htmlFor="lead-propose-msg">A line from you (optional)</label>
            <textarea id="lead-propose-msg" className="input" rows={2} value={proposeMsg} onChange={(ev) => setProposeMsg(ev.target.value)} placeholder="Why this tutor is the right fit for them." />
          </div>
          <p className="text-2xs text-ink-soft">Sends the tutor's name, bio and subjects with the first-lesson guarantee, marks the enquiry contacted, and asks the family to reply with a time. Blocked until the tutor's WWCC is verified.</p>
          <button type="button" disabled={proposing} className="btn-primary w-full" onClick={async () => { setProposing(true); try { await onPropose(tutorId, proposeMsg, proposeTimes); } finally { setProposing(false); } }}>
            {proposing ? 'Sending…' : 'Send tutor proposal'}
          </button>
        </div>
      )}

      {e.converted_at ? (
        <div className="card p-4 bg-success-soft/40 border-success/30">
          <div className="text-sm font-medium text-success-ink mb-1">Converted {formatDate(e.converted_at, { day: 'numeric', month: 'short' })}</div>
          <div className="text-xs text-ink-muted flex flex-wrap gap-3">
            {e.household_id && <Link className="text-forest underline underline-offset-2" href={`/app/households/${e.household_id}`}>Open household</Link>}
            {e.student_id && <Link className="text-forest underline underline-offset-2" href={`/app/students/${e.student_id}`}>Open student</Link>}
            <Link className="text-forest underline underline-offset-2" href="/app/parents">Invite parent</Link>
          </div>
        </div>
      ) : (
        <div className="card p-4 space-y-3">
          <div className="text-2xs uppercase tracking-widest text-ink-soft">Convert to household + student</div>
          <div>
            <label className="label" htmlFor="lead-student-name">Student name</label>
            <input id="lead-student-name" className="input" value={studentName} onChange={(ev) => setStudentName(ev.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="lead-mode">Lessons</label>
              <select id="lead-mode" className="input" value={mode} onChange={(ev) => setMode(ev.target.value as 'online' | 'in_home')}>
                <option value="online">Online</option>
                <option value="in_home">In-home</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lead-rate">Rate ($/hour)</label>
              <input id="lead-rate" className="input num tabular" inputMode="decimal" value={rate} onChange={(ev) => setRate(ev.target.value)} />
            </div>
          </div>
          <p className="text-2xs text-ink-soft">Rate comes from the rate card for the level and format; change it if you agreed something else. The parent invitation is sent separately from People → Parents.</p>
          <button
            type="button"
            disabled={busy || !studentName.trim()}
            className="btn-primary w-full"
            onClick={async () => { setBusy(true); try { await onConvert(mode, rateCents, tutorId || null, studentName.trim()); } finally { setBusy(false); } }}
          >
            {busy ? 'Creating…' : 'Create household and student'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function LeadsPage() {
  return <AuthGuard><LeadsInner /></AuthGuard>;
}
