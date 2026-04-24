import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../../components/AuthGuard';
import OwnerOnly from '../../components/OwnerOnly';
import Layout from '../../components/Layout';
import { supabase } from '../../lib/supabase';
import { useOrganization } from '../../lib/organizationContext';
import { Tutor } from '../../lib/types';
import { formatCents, startOfMonth, startOfWeek, cx } from '../../lib/utils';
import { activeLocale } from '../../lib/utils';

type Preset = 'this_month' | 'last_month' | 'this_week' | 'last_week' | 'custom';

type SessionRow = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  pay_rate_cents: number | null;
  paid: boolean;
  tutor_user_id: string | null;
  student: { id: string; name: string } | null;
};

type TutorRow = Tutor & { student_count?: number };

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function presetRange(p: Preset, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date();
  if (p === 'this_month') {
    const from = startOfMonth(now);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (p === 'last_month') {
    const thisStart = startOfMonth(now);
    const from = new Date(thisStart.getFullYear(), thisStart.getMonth() - 1, 1);
    const to = new Date(thisStart.getFullYear(), thisStart.getMonth(), 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (p === 'this_week') {
    const from = startOfWeek(now);
    const to = endOfDay(new Date(from.getTime() + 6 * 86_400_000));
    return { from, to };
  }
  if (p === 'last_week') {
    const thisStart = startOfWeek(now);
    const from = new Date(thisStart.getTime() - 7 * 86_400_000);
    const to = endOfDay(new Date(thisStart.getTime() - 86_400_000));
    return { from, to };
  }
  // custom
  const f = customFrom ? new Date(customFrom) : startOfMonth(now);
  const t = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
  return { from: f, to: t };
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sessionPayoutCents(s: { duration_minutes: number; pay_rate_cents: number | null }): number {
  if (!s.pay_rate_cents) return 0;
  return Math.round((s.duration_minutes * s.pay_rate_cents) / 60);
}

function escapeCsv(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function PayoutsInner() {
  const { organization } = useOrganization();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [customFrom, setCustomFrom] = useState<string>(toDateInput(startOfMonth(new Date())));
  const [customTo, setCustomTo] = useState<string>(toDateInput(new Date()));
  const [tutorFilter, setTutorFilter] = useState<string>('');
  const [tutors, setTutors] = useState<TutorRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('AUD');
  const [updatingPaid, setUpdatingPaid] = useState<Record<string, boolean>>({});

  const range = useMemo(() => presetRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: p } = await supabase
          .from('profiles').select('currency').eq('id', session.user.id).single();
        if (p?.currency) setCurrency(p.currency);
      }
      const { data: ts } = await supabase
        .from('tutors')
        .select('*')
        .not('auth_user_id', 'is', null)
        .eq('archived', false)
        .order('name');
      setTutors((ts as TutorRow[]) ?? []);
    })();
  }, [organization?.id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes, pay_rate_cents, paid, tutor_user_id, student:students(id,name)')
        .eq('status', 'completed')
        .not('pay_rate_cents', 'is', null)
        .gte('scheduled_at', range.from.toISOString())
        .lte('scheduled_at', range.to.toISOString())
        .order('scheduled_at', { ascending: true });
      setSessions((data ?? []) as any);
      setLoading(false);
    })();
  }, [range.from.getTime(), range.to.getTime()]);

  // Group sessions by tutor_user_id.
  const byTutor = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      const key = s.tutor_user_id ?? '__null__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessions]);

  // Build display rows: one per tutor in org (including zeros), plus a "Former tutors"
  // bucket for sessions whose tutor_user_id is no longer a current tutor.
  type DisplayRow = {
    key: string;
    name: string;
    email: string | null;
    isFormer: boolean;
    tutorRow: TutorRow | null;
    sessions: SessionRow[];
  };
  const displayRows: DisplayRow[] = useMemo(() => {
    const knownIds = new Set(tutors.map((t) => t.auth_user_id).filter(Boolean) as string[]);
    const rows: DisplayRow[] = tutors.map((t) => ({
      key: t.auth_user_id as string,
      name: t.name,
      email: t.email ?? null,
      isFormer: false,
      tutorRow: t,
      sessions: byTutor.get(t.auth_user_id as string) ?? [],
    }));
    // Sessions under tutor_user_ids not matching a current tutor → group as "Former tutors".
    const former: SessionRow[] = [];
    for (const [key, list] of byTutor.entries()) {
      if (key === '__null__') {
        former.push(...list);
        continue;
      }
      if (!knownIds.has(key)) former.push(...list);
    }
    if (former.length > 0) {
      rows.push({
        key: 'former',
        name: 'Former tutors',
        email: null,
        isFormer: true,
        tutorRow: null,
        sessions: former,
      });
    }
    return tutorFilter ? rows.filter((r) => r.key === tutorFilter) : rows;
  }, [tutors, byTutor, tutorFilter]);

  const grandTotal = displayRows.reduce(
    (acc, r) => acc + r.sessions.reduce((a, s) => a + sessionPayoutCents(s), 0),
    0
  );

  async function togglePaid(sessionId: string, currentPaid: boolean) {
    setUpdatingPaid((m) => ({ ...m, [sessionId]: true }));
    // Optimistic update
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, paid: !currentPaid } : s));
    const { error } = await supabase
      .from('sessions')
      .update({ paid: !currentPaid })
      .eq('id', sessionId);
    if (error) {
      // revert
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, paid: currentPaid } : s));
    }
    setUpdatingPaid((m) => ({ ...m, [sessionId]: false }));
  }

  function exportCsv() {
    const fromStr = toDateInput(range.from);
    const toStr = toDateInput(range.to);
    const header = ['tutor_name', 'tutor_email', 'session_date', 'student_name', 'duration_minutes', 'pay_rate_cents', 'subtotal_cents'];
    const lines: string[] = [header.join(',')];
    for (const r of displayRows) {
      for (const s of r.sessions) {
        const date = new Date(s.scheduled_at).toISOString().slice(0, 10);
        lines.push([
          escapeCsv(r.name),
          escapeCsv(r.email ?? ''),
          escapeCsv(date),
          escapeCsv(s.student?.name ?? ''),
          escapeCsv(s.duration_minutes),
          escapeCsv(s.pay_rate_cents ?? 0),
          escapeCsv(sessionPayoutCents(s)),
        ].join(','));
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crestio-payouts-${fromStr}-${toStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Layout subtitle="Money" title="Payouts">
      <div className="card p-5 mb-6 flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1">
          <label className="label">Date range</label>
          <div className="flex flex-wrap items-center gap-2">
            {(['this_month', 'last_month', 'this_week', 'last_week', 'custom'] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={cx(
                  'text-xs px-3 py-1.5 rounded border transition-colors',
                  preset === p ? 'bg-ink text-cream border-ink' : 'border-rule text-ink-muted hover:text-ink'
                )}
              >
                {p.replace('_', ' ')}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2 mt-3">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input md:w-44" />
              <span className="text-ink-soft text-sm">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input md:w-44" />
            </div>
          )}
        </div>
        <div className="md:w-64">
          <label className="label">Tutor</label>
          <select className="input" value={tutorFilter} onChange={(e) => setTutorFilter(e.target.value)}>
            <option value="">All tutors</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.auth_user_id ?? ''}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card p-6 text-sm text-ink-muted">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="card p-8 text-sm text-ink-muted">
          No completed sessions in this period.
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th>Tutor</th>
                  <th className="text-right">Sessions</th>
                  <th className="text-right">Hours</th>
                  <th className="text-right">Payout</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => {
                  const sessionsCount = r.sessions.length;
                  const totalMinutes = r.sessions.reduce((a, s) => a + s.duration_minutes, 0);
                  const totalHours = totalMinutes / 60;
                  const totalCents = r.sessions.reduce((a, s) => a + sessionPayoutCents(s), 0);
                  const isOpen = !!expanded[r.key];
                  return (
                    <>
                      <tr key={r.key}>
                        <td>
                          <div className="text-ink font-medium">{r.name}</div>
                          {r.email && <div className="text-2xs text-ink-soft">{r.email}</div>}
                          {r.isFormer && <div className="text-2xs text-claret">No longer on team</div>}
                        </td>
                        <td className="text-right font-mono num text-sm">{sessionsCount}</td>
                        <td className="text-right font-mono num text-sm">{totalHours.toFixed(1)}</td>
                        <td className="text-right font-mono num text-sm">{formatCents(totalCents, currency, { showZero: true })}</td>
                        <td className="text-right">
                          {sessionsCount > 0 && (
                            <button
                              type="button"
                              className="text-2xs text-ink-muted hover:text-ink underline underline-offset-2"
                              onClick={() => setExpanded((m) => ({ ...m, [r.key]: !m[r.key] }))}
                            >
                              {isOpen ? 'Hide' : 'View sessions'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && r.sessions.length > 0 && (
                        <tr key={`${r.key}-expand`}>
                          <td colSpan={5} className="bg-rule-soft/40 p-0">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-2xs uppercase tracking-widest text-ink-muted">
                                  <th className="text-left px-5 py-2">Date</th>
                                  <th className="text-left px-5 py-2">Student</th>
                                  <th className="text-right px-5 py-2">Mins</th>
                                  <th className="text-right px-5 py-2">Rate</th>
                                  <th className="text-right px-5 py-2">Subtotal</th>
                                  <th className="text-right px-5 py-2">Paid</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.sessions.map((s) => {
                                  const subtotal = sessionPayoutCents(s);
                                  const dateLabel = new Date(s.scheduled_at).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
                                  return (
                                    <tr key={s.id}>
                                      <td className="px-5 py-1.5 text-ink-muted font-mono text-xs">{dateLabel}</td>
                                      <td className="px-5 py-1.5 text-ink">
                                        <Link href={`/app/sessions/${s.id}`} className="hover:underline">
                                          {s.student?.name ?? '—'}
                                        </Link>
                                      </td>
                                      <td className="px-5 py-1.5 text-right font-mono num text-xs">{s.duration_minutes}</td>
                                      <td className="px-5 py-1.5 text-right font-mono num text-xs">{formatCents(s.pay_rate_cents, currency)}</td>
                                      <td className="px-5 py-1.5 text-right font-mono num text-xs">{formatCents(subtotal, currency, { showZero: true })}</td>
                                      <td className="px-5 py-1.5 text-right">
                                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={!!s.paid}
                                            disabled={!!updatingPaid[s.id]}
                                            onChange={() => togglePaid(s.id, !!s.paid)}
                                            className="accent-forest"
                                          />
                                          <span className="text-2xs text-ink-muted">{s.paid ? 'Paid' : 'Unpaid'}</span>
                                        </label>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-ink-muted">
              Grand total: <span className="font-mono num text-ink">{formatCents(grandTotal, currency, { showZero: true })}</span>
            </div>
            <button type="button" onClick={exportCsv} className="btn-secondary text-xs">
              Export CSV
            </button>
          </div>
        </>
      )}
    </Layout>
  );
}

export default function PayoutsPage() {
  return <AuthGuard><OwnerOnly><PayoutsInner /></OwnerOnly></AuthGuard>;
}
