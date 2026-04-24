import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import { supabase } from '../../../lib/supabase';
import { useMembership } from '../../../lib/membershipContext';
import { cx, formatCents, centsToDollars, dollarsToCents } from '../../../lib/utils';
import { periodPreset } from '../../../lib/billing/groupSessionsByHousehold';
import type { HouseholdGroup } from '../../../lib/billing/groupSessionsByHousehold';

type PeriodKind = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

type DraftState = {
  // Sessions the tutor has un-checked (default is all included).
  excludedSessionIds: string[];
  // Per-session rate overrides (cents).
  rateOverrides: Record<string, number>;
  // Per-household notes.
  householdNotes: Record<string, string>;
  // Households the tutor has deselected from the batch entirely.
  excludedHouseholdIds: string[];
};

function emptyDraft(): DraftState {
  return {
    excludedSessionIds: [],
    rateOverrides: {},
    householdNotes: {},
    excludedHouseholdIds: [],
  };
}

function draftKey(periodStart: string, periodEnd: string): string {
  return `crestio.batch_invoice.draft:${periodStart}:${periodEnd}`;
}

function loadDraft(key: string): DraftState {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptyDraft();
    return { ...emptyDraft(), ...JSON.parse(raw) };
  } catch {
    return emptyDraft();
  }
}

function saveDraft(key: string, d: DraftState) {
  try {
    window.localStorage.setItem(key, JSON.stringify(d));
  } catch { /* ignore quota */ }
}

function BatchInvoicesInner() {
  const router = useRouter();
  const { t } = useTranslation(['invoices', 'common']);
  const { membership } = useMembership();
  const isTutor = membership?.role === 'tutor';

  const [period, setPeriod] = useState<PeriodKind>('this_week');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<HouseholdGroup[]>([]);
  const [totals, setTotals] = useState<{ households: number; sessions: number; total_cents: number }>({ households: 0, sessions: 0, total_cents: 0 });

  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedStudent, setExpandedStudent] = useState<Set<string>>(new Set());

  const [showConfirm, setShowConfirm] = useState<null | 'draft' | 'send'>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currency] = useState('AUD');

  // Resolve the active period → ISO strings for API.
  const computedPeriod = useMemo(() => {
    if (period === 'custom') {
      if (!customStart || !customEnd) return null;
      const start = new Date(customStart + 'T00:00:00');
      const end = new Date(customEnd + 'T00:00:00');
      end.setDate(end.getDate() + 1); // inclusive end
      return { start, end };
    }
    return periodPreset(period);
  }, [period, customStart, customEnd]);

  const draftStorageKey = useMemo(() => {
    if (!computedPeriod) return null;
    return draftKey(computedPeriod.start.toISOString(), computedPeriod.end.toISOString());
  }, [computedPeriod]);

  // Load draft on period change.
  useEffect(() => {
    if (!draftStorageKey) return;
    setDraft(loadDraft(draftStorageKey));
  }, [draftStorageKey]);

  // Persist draft on every change.
  useEffect(() => {
    if (!draftStorageKey) return;
    saveDraft(draftStorageKey, draft);
  }, [draftStorageKey, draft]);

  const reload = useCallback(async () => {
    if (!computedPeriod) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLoading(false); return; }
      const qs = new URLSearchParams({
        period_start: computedPeriod.start.toISOString(),
        period_end: computedPeriod.end.toISOString(),
      });
      const res = await fetch(`/api/invoices/unbilled?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload?.error ?? 'Failed to load unbilled sessions.');
        setLoading(false);
        return;
      }
      const payload = await res.json();
      setGroups(payload.groups ?? []);
      setTotals(payload.totals ?? { households: 0, sessions: 0, total_cents: 0 });
    } finally {
      setLoading(false);
    }
  }, [computedPeriod?.start, computedPeriod?.end]);

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [reload]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleExpandedStudent(studentId: string) {
    setExpandedStudent((prev) => {
      const next = new Set(prev);
      next.has(studentId) ? next.delete(studentId) : next.add(studentId);
      return next;
    });
  }

  function toggleHousehold(householdId: string) {
    setDraft((d) => {
      const set = new Set(d.excludedHouseholdIds);
      set.has(householdId) ? set.delete(householdId) : set.add(householdId);
      return { ...d, excludedHouseholdIds: Array.from(set) };
    });
  }
  function toggleSession(sessionId: string) {
    setDraft((d) => {
      const set = new Set(d.excludedSessionIds);
      set.has(sessionId) ? set.delete(sessionId) : set.add(sessionId);
      return { ...d, excludedSessionIds: Array.from(set) };
    });
  }
  function setRateOverride(sessionId: string, cents: number | null) {
    setDraft((d) => {
      const next = { ...d.rateOverrides };
      if (cents === null || Number.isNaN(cents)) delete next[sessionId];
      else next[sessionId] = cents;
      return { ...d, rateOverrides: next };
    });
  }
  function setNote(householdId: string, note: string) {
    setDraft((d) => ({
      ...d,
      householdNotes: { ...d.householdNotes, [householdId]: note },
    }));
  }

  // Post-edit totals using the current draft state.
  const effective = useMemo(() => {
    const excludedHouseholds = new Set(draft.excludedHouseholdIds);
    const excludedSessions = new Set(draft.excludedSessionIds);
    let selectedHouseholds = 0;
    let selectedSessions = 0;
    let selectedCents = 0;
    const perHousehold: Array<{ id: string; cents: number; sessions: number; }> = [];
    for (const g of groups) {
      if (g.is_ungrouped || !g.household_id) continue;
      if (excludedHouseholds.has(g.household_id)) continue;
      let hhCents = 0;
      let hhSessions = 0;
      for (const st of g.students) {
        for (const s of st.sessions) {
          if (excludedSessions.has(s.session_id)) continue;
          const rate = draft.rateOverrides[s.session_id] ?? s.charge_rate_cents ?? 0;
          const amount = Math.round((rate * s.duration_minutes) / 60);
          hhCents += amount;
          hhSessions += 1;
        }
      }
      if (hhSessions === 0) continue;
      selectedHouseholds += 1;
      selectedSessions += hhSessions;
      selectedCents += hhCents;
      perHousehold.push({ id: g.household_id, cents: hhCents, sessions: hhSessions });
    }
    return { households: selectedHouseholds, sessions: selectedSessions, cents: selectedCents, perHousehold };
  }, [groups, draft]);

  async function submit(mode: 'draft' | 'send') {
    if (!computedPeriod) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setSubmitError('Not signed in.'); return; }

      const excludedHouseholds = new Set(draft.excludedHouseholdIds);
      const excludedSessions = new Set(draft.excludedSessionIds);
      const householdsPayload = groups
        .filter((g) => !g.is_ungrouped && g.household_id && !excludedHouseholds.has(g.household_id))
        .map((g) => {
          const sessionIds: string[] = [];
          const rateOverrides: Record<string, number> = {};
          for (const st of g.students) {
            for (const s of st.sessions) {
              if (excludedSessions.has(s.session_id)) continue;
              sessionIds.push(s.session_id);
              if (typeof draft.rateOverrides[s.session_id] === 'number') {
                rateOverrides[s.session_id] = draft.rateOverrides[s.session_id];
              }
            }
          }
          return {
            household_id: g.household_id!,
            note: draft.householdNotes[g.household_id!] || null,
            included_session_ids: sessionIds,
            rate_overrides: Object.keys(rateOverrides).length ? rateOverrides : undefined,
          };
        })
        .filter((h) => h.included_session_ids.length > 0);

      if (householdsPayload.length === 0) {
        setSubmitError('Nothing selected.');
        return;
      }

      const res = await fetch('/api/invoices/batch-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          period_start: computedPeriod.start.toISOString(),
          period_end: computedPeriod.end.toISOString(),
          households: householdsPayload,
          mode,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(payload?.error ?? 'Batch create failed.');
        return;
      }
      if (draftStorageKey) window.localStorage.removeItem(draftStorageKey);
      router.push('/app/invoices?batch=1');
    } finally {
      setSubmitting(false);
      setShowConfirm(null);
    }
  }

  const groupsToShow = groups;

  return (
    <Layout subtitle={t('invoices:title_list')} title={t('invoices:title_batch')}>
      <div className="mb-6 flex flex-col md:flex-row md:items-end gap-3">
        <div>
          <label className="label">Period</label>
          <select
            className="input md:w-56"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKind)}
          >
            <option value="this_week">This week</option>
            <option value="last_week">Last week</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="custom">Custom range…</option>
          </select>
        </div>
        {period === 'custom' && (
          <>
            <div>
              <label className="label">From</label>
              <input type="date" className="input" value={customStart}
                onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </>
        )}
        <div className="ml-auto text-sm text-ink-muted">
          <Link href="/app/invoices" className="underline underline-offset-2">
            Back to invoice list
          </Link>
        </div>
      </div>

      <div className="card p-5 mb-6 flex flex-wrap gap-6 items-center">
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Households</div>
          <div className="font-display text-2xl tracking-tightest">{totals.households}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Sessions</div>
          <div className="font-display text-2xl tracking-tightest">{totals.sessions}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Unbilled total</div>
          <div className="font-display text-2xl tracking-tightest font-mono num">
            {formatCents(totals.total_cents, currency, { showZero: true })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">Loading…</div>
      ) : error ? (
        <div className="card p-6 text-sm text-claret">{error}</div>
      ) : groupsToShow.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="font-display text-2xl mb-2 tracking-tightest">Nothing to invoice</div>
          <p className="text-sm text-ink-muted mb-5">
            No completed unbilled sessions in this period. Log more sessions or pick a different date range.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-28">
          {groupsToShow.map((g) => (
            <HouseholdCard
              key={g.household_id ?? 'ungrouped'}
              group={g}
              draft={draft}
              expanded={expanded.has(g.household_id ?? 'ungrouped')}
              expandedStudent={expandedStudent}
              onToggleExpand={() => toggleExpanded(g.household_id ?? 'ungrouped')}
              onToggleExpandStudent={toggleExpandedStudent}
              onToggleHousehold={toggleHousehold}
              onToggleSession={toggleSession}
              onSetRateOverride={setRateOverride}
              onSetNote={setNote}
            />
          ))}
        </div>
      )}

      {effective.households > 0 && (
        <div className="fixed bottom-0 inset-x-0 md:left-60 bg-cream border-t border-rule p-4 z-30">
          <div className="max-w-[800px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm text-ink">
              <strong>{effective.households}</strong> household{effective.households === 1 ? '' : 's'} · {' '}
              <strong>{effective.sessions}</strong> session{effective.sessions === 1 ? '' : 's'} · {' '}
              <span className="font-mono num">{formatCents(effective.cents, currency, { showZero: true })}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm('draft')}
                className="btn-ghost text-sm"
              >
                Save as drafts
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm('send')}
                className="btn-primary text-sm"
              >
                Send invoices
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <ConfirmModal
          mode={showConfirm}
          count={effective.households}
          total={effective.cents}
          currency={currency}
          submitting={submitting}
          error={submitError}
          onCancel={() => { setShowConfirm(null); setSubmitError(null); }}
          onConfirm={() => submit(showConfirm)}
        />
      )}
    </Layout>
  );
}

function HouseholdCard({
  group, draft, expanded, expandedStudent,
  onToggleExpand, onToggleExpandStudent, onToggleHousehold, onToggleSession,
  onSetRateOverride, onSetNote,
}: {
  group: HouseholdGroup;
  draft: DraftState;
  expanded: boolean;
  expandedStudent: Set<string>;
  onToggleExpand: () => void;
  onToggleExpandStudent: (studentId: string) => void;
  onToggleHousehold: (id: string) => void;
  onToggleSession: (id: string) => void;
  onSetRateOverride: (sessionId: string, cents: number | null) => void;
  onSetNote: (householdId: string, note: string) => void;
}) {
  const isUngrouped = group.is_ungrouped;
  const householdId = group.household_id ?? 'ungrouped';
  const selected = !draft.excludedHouseholdIds.includes(householdId) && !isUngrouped;

  // Recalculate per-household totals post-edit.
  const excludedSessions = new Set(draft.excludedSessionIds);
  let liveCents = 0;
  let liveSessionCount = 0;
  for (const st of group.students) {
    for (const s of st.sessions) {
      if (excludedSessions.has(s.session_id)) continue;
      const rate = draft.rateOverrides[s.session_id] ?? s.charge_rate_cents ?? 0;
      liveCents += Math.round((rate * s.duration_minutes) / 60);
      liveSessionCount += 1;
    }
  }

  return (
    <div className={cx(
      'card p-4',
      isUngrouped ? 'bg-rust-soft/40 border-rust/20' : selected ? '' : 'opacity-60',
    )}>
      <div className="flex items-start gap-3">
        {!isUngrouped && (
          <input
            type="checkbox"
            className="mt-1 w-5 h-5 accent-forest"
            checked={selected}
            onChange={() => onToggleHousehold(householdId)}
            aria-label={`Include ${group.household_display_name}`}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1">
            <div>
              <div className="font-display text-lg tracking-tightest">
                {group.household_display_name}
              </div>
              {!isUngrouped && group.primary_parent ? (
                <div className="text-2xs text-ink-muted">
                  {group.primary_parent.name ?? 'Primary parent'}
                  {group.primary_parent.email && ` · ${group.primary_parent.email}`}
                </div>
              ) : isUngrouped ? (
                <div className="text-2xs text-rust">
                  These students don't have a household. Assign one before batching.
                </div>
              ) : (
                <div className="text-2xs text-claret">No primary parent — add one first.</div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-2xs text-ink-muted">
                {liveSessionCount} session{liveSessionCount === 1 ? '' : 's'}
              </div>
              <div className="font-mono num text-sm">
                {formatCents(liveCents, 'AUD', { showZero: true })}
              </div>
              <button
                type="button"
                onClick={onToggleExpand}
                className="btn-ghost text-xs"
              >
                {expanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 space-y-3">
              {group.students.map((st) => (
                <div key={st.student_id} className="border border-rule rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-ink">
                      <Link href={`/app/students/${st.student_id}`} className="underline underline-offset-2">
                        {st.student_name}
                      </Link>
                      <span className="text-ink-soft text-2xs"> · {st.session_count} session{st.session_count === 1 ? '' : 's'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleExpandStudent(st.student_id)}
                      className="text-2xs text-forest underline"
                    >
                      {expandedStudent.has(st.student_id) ? 'Hide sessions' : 'Show sessions'}
                    </button>
                  </div>
                  {expandedStudent.has(st.student_id) && (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-ink-muted">
                          <th className="text-left font-normal pb-1">Include</th>
                          <th className="text-left font-normal pb-1">When</th>
                          <th className="text-left font-normal pb-1">Subject</th>
                          <th className="text-right font-normal pb-1">Min</th>
                          <th className="text-right font-normal pb-1">Rate</th>
                          <th className="text-right font-normal pb-1">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {st.sessions.map((s) => {
                          const excluded = excludedSessions.has(s.session_id);
                          const rate = draft.rateOverrides[s.session_id] ?? s.charge_rate_cents ?? 0;
                          const amount = Math.round((rate * s.duration_minutes) / 60);
                          return (
                            <tr key={s.session_id} className={excluded ? 'text-ink-soft' : 'text-ink'}>
                              <td className="py-1">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 accent-forest"
                                  checked={!excluded}
                                  onChange={() => onToggleSession(s.session_id)}
                                />
                              </td>
                              <td className="py-1">
                                {new Date(s.scheduled_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                              </td>
                              <td className="py-1">{s.subject ?? '—'}</td>
                              <td className="py-1 text-right font-mono">{s.duration_minutes}</td>
                              <td className="py-1 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  className="input text-xs w-20 text-right py-0.5"
                                  value={centsToDollars(rate)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (!raw) onSetRateOverride(s.session_id, null);
                                    else onSetRateOverride(s.session_id, dollarsToCents(raw));
                                  }}
                                />
                              </td>
                              <td className="py-1 text-right font-mono">
                                {formatCents(amount, 'AUD', { showZero: true })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}

              {!isUngrouped && group.household_id && (
                <div>
                  <label className="label text-2xs">Note on this invoice (optional)</label>
                  <textarea
                    rows={2}
                    className="input text-sm"
                    value={draft.householdNotes[group.household_id] ?? ''}
                    onChange={(e) => onSetNote(group.household_id!, e.target.value)}
                    placeholder="e.g. Thanks — bank transfer preferred."
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  mode, count, total, currency, submitting, error, onCancel, onConfirm,
}: {
  mode: 'draft' | 'send';
  count: number;
  total: number;
  currency: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-cream border border-rule rounded shadow-lift max-w-md w-full p-6">
        <h2 className="font-display text-xl tracking-tightest mb-2">
          {mode === 'send' ? 'Send invoices' : 'Save as drafts'}
        </h2>
        <p className="text-sm text-ink-muted mb-4 leading-relaxed">
          {mode === 'send'
            ? <>You're about to send <strong>{count}</strong> invoice{count === 1 ? '' : 's'} totalling <strong className="font-mono">{formatCents(total, currency, { showZero: true })}</strong>. Parents will receive an email immediately. You can still edit or void them after.</>
            : <>Create <strong>{count}</strong> draft invoice{count === 1 ? '' : 's'} totalling <strong className="font-mono">{formatCents(total, currency, { showZero: true })}</strong>. Nothing is sent yet.</>}
        </p>
        {error && <div className="text-sm text-claret mb-3">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost text-sm" disabled={submitting}>Cancel</button>
          <button type="button" onClick={onConfirm} className="btn-primary text-sm" disabled={submitting}>
            {submitting ? 'Working…' : (mode === 'send' ? `Send ${count}` : `Save ${count} draft${count === 1 ? '' : 's'}`)}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BatchInvoicesPage() {
  return (
    <AuthGuard>
      <BatchInvoicesInner />
    </AuthGuard>
  );
}
