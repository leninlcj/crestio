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
import { IconMessage } from '../../../components/design/icons';
import { authFetch } from '../../../lib/authFetch';
import { formatDate, formatDateTime } from '../../../lib/utils';
import { REVIEWS } from '../../../lib/agency';

type Review = {
  id: string; created_at: string; household_id: string; household_name: string | null;
  student_name: string | null; student_year_level: string | null; tutor_name: string | null;
  parent_email: string | null; language: 'en' | 'es'; source: 'auto' | 'manual';
  requested_at: string | null; reminded_at: string | null; submitted_at: string | null;
  rating: number | null; body: string | null; reviewer_name: string | null; reviewer_suburb: string | null;
  consent_public: boolean; status: 'requested' | 'submitted' | 'approved' | 'hidden' | 'declined'; approved_at: string | null;
  review_url: string;
};

const TONE: Record<Review['status'], 'amber' | 'forest' | 'neutral' | 'claret'> = { requested: 'neutral', submitted: 'amber', approved: 'forest', hidden: 'neutral', declined: 'claret' };
const LABEL: Record<Review['status'], string> = { requested: 'Waiting for the family', submitted: 'To approve', approved: 'On the site', hidden: 'Hidden', declined: 'Declined' };

function ReviewsInner() {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Review[]>([]);
  const [filter, setFilter] = useState('submitted');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [households, setHouseholds] = useState<Array<{ id: string; display_name: string }>>([]);
  const [requestFor, setRequestFor] = useState('');
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/owner/reviews?status=${encodeURIComponent(status)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to load reviews.');
      setRows(payload.reviews ?? []);
      setSetupRequired(!!payload.setup_required);
    } catch (e: any) {
      toast.show({ message: e?.message ?? 'Failed to load reviews.', tone: 'error' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(filter); }, [filter, load]);
  useEffect(() => {
    const id = typeof router.query.review === 'string' ? router.query.review : null;
    if (id) { setSelectedId(id); setFilter('all'); }
  }, [router.query.review]);
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch('/api/households');
        const payload = await res.json();
        setHouseholds(((payload?.households ?? []) as any[]).filter((h) => !h.archived_at).map((h) => ({ id: h.id, display_name: h.display_name })));
      } catch { /* selector stays empty */ }
    })();
  }, []);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  async function update(id: string, body: Record<string, unknown>, msg?: string) {
    const res = await authFetch(`/api/owner/reviews/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show({ message: payload?.error ?? 'Could not update.', tone: 'error' }); return; }
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...payload.review } : r)));
    if (msg) toast.show({ message: payload.revalidated === false && body.status ? `${msg} The site refreshes within the hour.` : msg, tone: 'success' });
  }

  async function requestReview() {
    if (!requestFor) return;
    setRequesting(true);
    try {
      const res = await authFetch('/api/owner/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ household_id: requestFor }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Could not send the request.');
      toast.show({ message: 'Review request emailed.', tone: 'success' });
      setRequestFor('');
      setFilter('requested');
    } catch (e: any) {
      toast.show({ message: e?.message ?? 'Could not send the request.', tone: 'error' });
    } finally { setRequesting(false); }
  }

  return (
    <Layout title="Leads" subtitle="Reviews" pageTitle="Reviews · Leads">
      {setupRequired && (
        <div className="card p-4 mb-4 bg-amber-soft/60 border-amber/40 text-sm text-amber-ink" role="status">
          The reviews table does not exist yet. Run <code className="font-mono text-xs">supabase/migrations/20260906_agency_chunk5.sql</code> in the Supabase SQL editor.
        </div>
      )}
      <div className="card p-4 mb-4 flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1">
          <div className="text-sm text-ink font-medium">Ask a family for a review</div>
          <p className="text-xs text-ink-muted mt-0.5">Families are asked automatically after {REVIEWS.askAfterLessons} lessons. Use this for the families you already teach, or anyone the automatic ask has not reached. One email, one reminder a week later, nothing more.</p>
        </div>
        <div className="flex gap-2">
          <select className="input md:w-64" value={requestFor} onChange={(e) => setRequestFor(e.target.value)} aria-label="Household">
            <option value="">Choose a household</option>
            {households.map((h) => <option key={h.id} value={h.id}>{h.display_name}</option>)}
          </select>
          <button type="button" className="btn-primary whitespace-nowrap" disabled={!requestFor || requesting} onClick={requestReview}>{requesting ? 'Sending' : 'Send request'}</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <FilterChips ariaLabel="Filter reviews" options={[{ value: 'submitted', label: 'To approve' }, { value: 'approved', label: 'On the site' }, { value: 'requested', label: 'Waiting' }, { value: 'hidden', label: 'Hidden' }, { value: 'all', label: 'All' }]} value={filter} onChange={(v) => setFilter(v as string)} />
      </div>
      {loading ? (
        <div className="card overflow-hidden">{Array.from({ length: 3 }, (_, i) => <div key={i} className="px-3 py-3"><Skeleton className="h-3 w-1/3 mb-1" /><Skeleton className="h-2.5 w-1/2" /></div>)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<IconMessage />} title={filter === 'submitted' ? 'Nothing to approve.' : 'Nothing here.'} description="Reviews arrive here when a family writes one. You read each one, then approve it for the site or keep it private. The words are never edited." />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-rule">
            {rows.map((r) => (
              <li key={r.id} className={['cursor-pointer flex items-center gap-3 px-3 py-2.5 hover:bg-ruleSoft/40 transition-colors duration-100', selectedId === r.id ? 'bg-forest-soft/30' : ''].join(' ')} style={{ minHeight: 56 }} onClick={() => setSelectedId(r.id)}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink truncate">{r.household_name ?? 'Household'}{r.rating ? <span className="text-ink-soft"> · {r.rating} out of 5</span> : null}{r.reviewer_name ? <span className="text-ink-soft"> · as “{r.reviewer_name}”</span> : null}</div>
                  <div className="text-2xs text-ink-soft truncate">{r.body ? r.body.slice(0, 120) : `Requested ${r.requested_at ? formatDate(r.requested_at, { day: 'numeric', month: 'short' }) : ''}${r.reminded_at ? ', reminded' : ''} · ${r.parent_email ?? ''}`}</div>
                </div>
                {r.language === 'es' && <StatusPill tone="neutral">Español</StatusPill>}
                {r.status === 'submitted' && !r.consent_public && <StatusPill tone="neutral">Private</StatusPill>}
                <StatusPill tone={TONE[r.status]}>{LABEL[r.status]}</StatusPill>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DetailPane open={!!selected} onClose={() => setSelectedId(null)} title={selected ? (selected.household_name ?? 'Review') : ''} width={560}>
        {selected && <ReviewDetail key={selected.id} r={selected} onUpdate={(b, m) => update(selected.id, b, m)} />}
      </DetailPane>
    </Layout>
  );
}

function ReviewDetail({ r, onUpdate }: { r: Review; onUpdate: (body: Record<string, unknown>, msg?: string) => Promise<void> }) {
  const [name, setName] = useState(r.reviewer_name ?? '');
  const [suburb, setSuburb] = useState(r.reviewer_suburb ?? '');
  const canApprove = r.status !== 'requested' && r.consent_public && !!r.body;
  return (
    <div className="space-y-6 text-sm">
      {r.status === 'requested' ? (
        <div className="card p-4 bg-ruleSoft/40 text-sm text-ink-muted">
          The family has the link and has not written anything yet.{r.reminded_at ? ' They were reminded once.' : ' One reminder goes out a week after the request.'}
          <div className="mt-2 font-mono text-2xs break-all text-ink-soft">{r.review_url}</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onUpdate({ status: 'approved' }, 'Approved. It is on the site.')} className={['pill', r.status === 'approved' ? 'pill-forest' : 'pill-neutral hover:bg-ruleSoft'].join(' ')} aria-pressed={r.status === 'approved'} disabled={!canApprove} title={canApprove ? '' : 'The family did not give permission to show this review.'}>Show on the site</button>
            <button type="button" onClick={() => onUpdate({ status: 'hidden' }, 'Hidden. It stays in your records.')} className={['pill', r.status === 'hidden' ? 'pill-forest' : 'pill-neutral hover:bg-ruleSoft'].join(' ')} aria-pressed={r.status === 'hidden'}>Keep private</button>
            <button type="button" onClick={() => onUpdate({ status: 'declined' }, 'Declined.')} className={['pill', r.status === 'declined' ? 'pill-forest' : 'pill-neutral hover:bg-ruleSoft'].join(' ')} aria-pressed={r.status === 'declined'}>Decline</button>
          </div>
          {!r.consent_public && <p className="text-xs text-amber-ink">The family did not tick the permission box. This review is for you only.</p>}
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">{r.rating} out of 5</div>
            <blockquote className="text-base text-ink leading-relaxed whitespace-pre-wrap border-l-2 border-forest pl-4">{r.body}</blockquote>
            <p className="mt-2 text-2xs text-ink-soft">The words are the family's. You can change how their name and suburb show, not what they wrote.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="rv-name">Shown as</label>
              <input id="rv-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() !== (r.reviewer_name ?? '')) onUpdate({ reviewer_name: name }, 'Display name saved.'); }} />
            </div>
            <div>
              <label className="label" htmlFor="rv-suburb">Suburb</label>
              <input id="rv-suburb" className="input" value={suburb} onChange={(e) => setSuburb(e.target.value)} onBlur={() => { if (suburb.trim() !== (r.reviewer_suburb ?? '')) onUpdate({ reviewer_suburb: suburb }, 'Suburb saved.'); }} />
            </div>
          </div>
        </>
      )}
      <dl>
        {[
          ['Student', [r.student_name, r.student_year_level].filter(Boolean).join(', ') || 'Not recorded'],
          ['Tutor', r.tutor_name ?? 'Not recorded'],
          ['Parent email', r.parent_email ?? 'Not recorded'],
          ['Requested', r.requested_at ? formatDateTime(r.requested_at) : 'Not yet'],
          ['Written', r.submitted_at ? formatDateTime(r.submitted_at) : 'Not yet'],
          ['Approved', r.approved_at ? formatDateTime(r.approved_at) : 'No'],
          ['Source', r.source === 'auto' ? `Automatic, after ${REVIEWS.askAfterLessons} lessons` : 'Requested by you'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-2 border-b border-rule last:border-b-0">
            <dt className="text-xs text-ink-muted w-28 shrink-0">{k}</dt><dd className="text-sm text-ink text-right break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function ReviewsPage() {
  return <AuthGuard><ReviewsInner /></AuthGuard>;
}
