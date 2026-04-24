import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { minutesUntil } from '../../lib/formatTime';
import { useLocaleFormatters } from '../../lib/useLocaleFormatters';
import { Card } from '../design/Card';
import { Button } from '../design/Button';

// All "Today" dashboard sections. Each is a small card that takes its slice
// of the payload and renders only if it has content.

// ---------------------------------------------------------------------------
// Shared types — keep aligned with pages/api/dashboard/today.ts
// ---------------------------------------------------------------------------

export type NextSession = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  student_name: string;
  tutor_user_id: string | null;
  tutor_name: string | null;
};

export type PolishItem = {
  id: string;
  scheduled_at: string;
  subject: string | null;
  student_name: string;
  notes_internal_snippet: string | null;
};

export type RescheduleRequest = {
  session_id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  proposed_new_start_time: string | null;
  proposed_new_duration_minutes: number | null;
  proposed_at: string;
  message: string | null;
  student_name: string;
  parent_name: string | null;
};

export type WeekAheadItem = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  subject: string | null;
  status: string;
  student_name: string;
};

export type HomeworkPendingItem = {
  session_id: string;
  student_id: string;
  student_name: string;
  homework_snippet: string | null;
  homework_due_date: string | null;
};

export type InvoicingEntry = {
  parent_name: string;
  student_ids: string[];
  student_names: string[];
  session_count: number;
  total_cents: number;
  first_session_id: string;
};

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Kicker({ children, tone }: { children: React.ReactNode; tone?: 'neutral' | 'warning' }) {
  const color = tone === 'warning' ? 'text-amber-ink' : 'text-ink-muted';
  return <div className={`text-2xs uppercase tracking-widest ${color} mb-2`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// SECTION 1 — Next up
// ---------------------------------------------------------------------------

export function NextUpCard({ session }: { session: NextSession }) {
  const { t } = useTranslation('dashboard');
  const { formatRelative, formatNumber } = useLocaleFormatters();
  const soon = minutesUntil(session.scheduled_at) <= 30;
  const relative = formatRelative(session.scheduled_at);
  const lineParts = [
    session.student_name,
    session.subject,
    `${formatNumber(session.duration_minutes)} min`,
    session.tutor_name ? t('sections.next_up.with_tutor', { name: session.tutor_name, defaultValue: 'with {{name}}' }) : null,
  ].filter(Boolean);

  return (
    <Card
      padding="none"
      className={[
        'p-5 md:p-6',
        soon ? 'border-amber bg-amber-soft/40 next-up-pulse' : '',
      ].filter(Boolean).join(' ')}
    >
      <Kicker tone={soon ? 'warning' : 'neutral'}>
        {soon ? t('sections.next_up.kicker_soon') : t('sections.next_up.kicker')}
      </Kicker>
      <h2 className="font-display text-[22px] md:text-3xl tracking-tightest text-ink leading-tight mb-2">
        {relative}
      </h2>
      <div className="text-sm text-ink-muted mb-5">
        {lineParts.join(' · ')}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Link href={`/app/sessions/${session.id}`} className="btn-primary text-sm sm:w-auto w-full text-center">
          {t('sections.next_up.open')}
        </Link>
        <Link href={`/app/sessions/${session.id}#reschedule`} className="btn-secondary text-sm sm:w-auto w-full text-center">
          {t('sections.next_up.reschedule')}
        </Link>
        <Link href={`/app/sessions/${session.id}#notes`} className="btn-ghost text-sm sm:w-auto w-full text-center">
          {t('sections.next_up.log_notes')}
        </Link>
      </div>

      <style jsx>{`
        @keyframes next-up-pulse-kf {
          0%, 100% { box-shadow: 0 0 0 0 rgba(184, 134, 11, 0.35); }
          50%      { box-shadow: 0 0 0 10px rgba(184, 134, 11, 0); }
        }
        :global(.next-up-pulse) { animation: next-up-pulse-kf 1.8s ease-in-out infinite; }
      `}</style>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SECTION 2 — Needs polishing
// ---------------------------------------------------------------------------

export function PolishQueueCard({ items }: { items: PolishItem[] }) {
  const { t } = useTranslation('dashboard');
  const { formatRelativeDay } = useLocaleFormatters();
  const count = items.length;
  return (
    <Card padding="none" className="p-5 md:p-6">
      <Kicker>{t('sections.polish.kicker')}</Kicker>
      <h2 className="font-display text-xl md:text-2xl tracking-tightest mb-1">
        {t('sections.polish.title', { count })}
      </h2>
      <p className="text-sm text-ink-muted mb-4">{t('sections.polish.body')}</p>
      <ul className="divide-y divide-ruleSoft border-y border-ruleSoft">
        {items.map((s) => (
          <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-ink truncate">{s.student_name}</div>
              <div className="text-2xs text-ink-muted truncate">
                {formatRelativeDay(s.scheduled_at)}{s.subject ? ` · ${s.subject}` : ''}
              </div>
            </div>
            <Link href={`/app/sessions/${s.id}`} className="text-xs text-forest hover:text-forest-ink underline shrink-0">
              {t('sections.polish.row_cta')}
            </Link>
          </li>
        ))}
      </ul>
      <div className="pt-4">
        <Link href="/app/sessions/polish-queue" className="btn-primary text-sm inline-flex">
          {count >= 5 ? t('sections.polish.cta_many') : t('sections.polish.cta_some')}
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SECTION 3 — Needs invoicing
// ---------------------------------------------------------------------------

export function InvoicingCard({
  entries, currency,
}: { entries: InvoicingEntry[]; currency: string }) {
  const { t } = useTranslation('dashboard');
  const { formatMoney } = useLocaleFormatters();
  const totalCents = entries.reduce((a, e) => a + e.total_cents, 0);
  const href = '/app/invoices/batch';

  return (
    <Card padding="none" className="p-5 md:p-6">
      <Kicker>{t('sections.invoicing.kicker')}</Kicker>
      <h2 className="font-display text-xl md:text-2xl tracking-tightest mb-1">
        {t('sections.invoicing.title', { count: entries.length })}
      </h2>
      <p className="text-sm text-ink-muted mb-4">
        {t('sections.invoicing.total_uninvoiced', { amount: formatMoney(totalCents, currency, { showZero: true }) })}
      </p>
      <ul className="divide-y divide-ruleSoft border-y border-ruleSoft">
        {entries.map((e, idx) => (
          <li key={idx} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-ink truncate">
                {e.parent_name}
                {e.student_names.length > 1 && (
                  <span className="text-ink-muted"> · {t('sections.invoicing.student_count', { count: e.student_names.length, defaultValue: '{{count}} students' })}</span>
                )}
              </div>
              <div className="text-2xs text-ink-muted truncate">
                {e.student_names.slice(0, 3).join(', ')}
              </div>
            </div>
            <div className="text-xs text-ink-muted shrink-0">
              {e.session_count} · {formatMoney(e.total_cents, currency, { showZero: true })}
            </div>
          </li>
        ))}
      </ul>
      <div className="pt-4">
        <Link href={href} className="btn-primary text-sm inline-flex">
          {t('sections.invoicing.cta')}
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SECTION — Homework status
// ---------------------------------------------------------------------------

export function HomeworkStatusCard({ items }: { items: HomeworkPendingItem[] }) {
  if (items.length === 0) return null;
  const byStudent = new Map<string, { name: string; firstSessionId: string; firstSnippet: string | null; firstDue: string | null }>();
  for (const i of items) {
    if (!byStudent.has(i.student_id)) {
      byStudent.set(i.student_id, {
        name: i.student_name,
        firstSessionId: i.session_id,
        firstSnippet: i.homework_snippet,
        firstDue: i.homework_due_date,
      });
    }
  }
  const rows = Array.from(byStudent.entries()).slice(0, 5);
  const studentCount = byStudent.size;

  return (
    <Card padding="none" className="p-5 md:p-6">
      <HomeworkInner rows={rows} studentCount={studentCount} />
    </Card>
  );
}

function HomeworkInner({
  rows, studentCount,
}: {
  rows: Array<[string, { name: string; firstSessionId: string; firstSnippet: string | null; firstDue: string | null }]>;
  studentCount: number;
}) {
  const { t } = useTranslation('dashboard');
  const { formatDate } = useLocaleFormatters();
  return (
    <>
      <Kicker>{t('sections.homework.kicker')}</Kicker>
      <h2 className="font-display text-xl md:text-2xl tracking-tightest mb-1">
        {t('sections.homework.title', { count: studentCount })}
      </h2>
      <p className="text-sm text-ink-muted mb-4">
        {t('sections.homework.body')}
      </p>
      <ul className="divide-y divide-ruleSoft border-y border-ruleSoft">
        {rows.map(([studentId, r]) => {
          const overdue = r.firstDue ? new Date(r.firstDue) < new Date() : false;
          const dueLabel = r.firstDue
            ? formatDate(r.firstDue, { day: 'numeric', month: 'short' })
            : null;
          return (
            <li key={studentId} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-ink truncate">{r.name}</div>
                <div className="text-2xs text-ink-muted truncate">
                  {r.firstSnippet}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {dueLabel && (
                  <div className={`text-2xs ${overdue ? 'text-rust' : 'text-ink-muted'}`}>
                    {overdue ? t('sections.homework.overdue') : t('sections.homework.due_date', { date: dueLabel })}
                  </div>
                )}
                <Link href={`/app/students/${studentId}`} className="text-xs text-forest hover:text-forest-ink underline">
                  →
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {studentCount > rows.length && (
        <div className="pt-4">
          <Link href="/app/students?filter=homework_pending" className="text-xs text-forest hover:text-forest-ink underline">
            {t('sections.homework.see_all')}
          </Link>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SECTION 4 — Reschedule requests
// ---------------------------------------------------------------------------

export function RescheduleRequestsCard({
  requests, onChanged,
}: { requests: RescheduleRequest[]; onChanged: () => void }) {
  const { t } = useTranslation('dashboard');
  return (
    <Card padding="none" className="p-5 md:p-6 border-amber/50">
      <Kicker tone="warning">{t('sections.reschedules.kicker')}</Kicker>
      <h2 className="font-display text-xl md:text-2xl tracking-tightest mb-4">
        {t('sections.reschedules.title', { count: requests.length })}
      </h2>
      <ul className="space-y-4">
        {requests.map((r) => (
          <RescheduleRow key={r.session_id} req={r} onChanged={onChanged} />
        ))}
      </ul>
    </Card>
  );
}

function RescheduleRow({ req, onChanged }: { req: RescheduleRequest; onChanged: () => void }) {
  const router = useRouter();
  const { t } = useTranslation(['dashboard', 'common']);
  const { formatRelative } = useLocaleFormatters();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(decision: 'accept' | 'reject') {
    setBusy(decision); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError(t('common:errors.not_signed_in')); return; }
      const res = await fetch(`/api/sessions/${req.session_id}/respond-to-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ decision }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(payload?.error ?? t('common:errors.generic')); return; }
      onChanged();
    } finally { setBusy(null); }
  }

  const parentLabel = req.parent_name ?? t('dashboard:sections.reschedules.fallback_parent', { defaultValue: 'A parent' });
  const oldWhen = formatRelative(req.scheduled_at);
  const newWhen = req.proposed_new_start_time ? formatRelative(req.proposed_new_start_time) : null;

  return (
    <li className="border-b border-ruleSoft last:border-b-0 pb-4 last:pb-0">
      <div className="text-sm text-ink mb-1">
        {t('dashboard:sections.reschedules.row_description', { parent: parentLabel, student: req.student_name })}
      </div>
      <div className="text-xs text-ink-muted mb-1">
        {t('dashboard:sections.reschedules.row_original')} <span className="line-through">{oldWhen}</span>
        {newWhen && <> · {t('dashboard:sections.reschedules.row_proposed')} <span className="text-ink">{newWhen}</span></>}
      </div>
      {req.message && (
        <div className="text-xs text-ink-muted bg-ruleSoft/40 border border-rule rounded p-2 mb-2 whitespace-pre-wrap">
          {req.message.length > 240 ? req.message.slice(0, 240) + '…' : req.message}
        </div>
      )}
      {error && <div className="text-xs text-claret mb-2">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => respond('accept')} loading={busy === 'accept'} disabled={!!busy}>
          {t('dashboard:sections.reschedules.accept')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => respond('reject')} loading={busy === 'reject'} disabled={!!busy}>
          {t('dashboard:sections.reschedules.reject')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => router.push(`/app/sessions/${req.session_id}`)}>
          {t('dashboard:sections.reschedules.open')}
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// SECTION 5 — This week ahead
// ---------------------------------------------------------------------------

export function WeekAheadCard({
  items, excludeId,
}: { items: WeekAheadItem[]; excludeId?: string | null }) {
  const { t } = useTranslation('dashboard');
  const { formatRelativeDay, formatTimeOfDay, locale } = useLocaleFormatters();
  const filtered = excludeId ? items.filter((i) => i.id !== excludeId) : items;
  if (filtered.length === 0) return null;

  // Day-strip labels come from Intl — no hardcoded "M T W..." array.
  // Week starts Monday, so shift Sun-indexed Intl output.
  const narrowFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-AU' : locale, { weekday: 'narrow' });
  const dayLabels = (() => {
    // Seed with a known Monday (2024-01-01 is a Monday) and walk forward.
    const base = new Date(Date.UTC(2024, 0, 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + i);
      return narrowFmt.format(d);
    });
  })();
  const counts: Array<{ scheduled: number; completed: number; pending: number }> = Array.from(
    { length: 7 }, () => ({ scheduled: 0, completed: 0, pending: 0 }),
  );
  for (const s of filtered) {
    const d = new Date(s.scheduled_at);
    const dow = d.getDay(); // 0=Sun..6=Sat
    const idx = dow === 0 ? 6 : dow - 1;
    if (s.status === 'completed') counts[idx].completed++;
    else if (s.status === 'pending_change') counts[idx].pending++;
    else counts[idx].scheduled++;
  }

  return (
    <Card padding="none" className="p-5 md:p-6">
      <Kicker>{t('sections.week_ahead.kicker')}</Kicker>
      <h2 className="font-display text-xl md:text-2xl tracking-tightest mb-4">
        {t('sections.week_ahead.title', { count: filtered.length })}
      </h2>

      {/* Day-strip */}
      <div className="grid grid-cols-7 gap-1 mb-5">
        {dayLabels.map((l, i) => {
          const c = counts[i];
          const has = c.scheduled + c.completed + c.pending > 0;
          const dotColor =
            c.pending > 0 ? 'bg-amber' :
            c.completed > 0 && c.scheduled === 0 ? 'bg-forest' :
            'bg-ink-muted';
          return (
            <div key={i} className="text-center">
              <div className="text-2xs uppercase tracking-widest text-ink-soft">{l}</div>
              <div className="h-2 flex justify-center items-center mt-1">
                {has && <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />}
              </div>
            </div>
          );
        })}
      </div>

      <ul className="divide-y divide-ruleSoft border-y border-ruleSoft">
        {filtered.slice(0, 5).map((s) => (
          <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-ink truncate">{s.student_name}</div>
              <div className="text-2xs text-ink-muted truncate">
                {formatRelativeDay(s.scheduled_at)} · {formatTimeOfDay(s.scheduled_at)}
                {s.subject ? ` · ${s.subject}` : ''}
              </div>
            </div>
            <Link href={`/app/sessions/${s.id}`} className="text-xs text-ink-muted hover:text-ink shrink-0">
              →
            </Link>
          </li>
        ))}
      </ul>

      <div className="pt-4">
        <Link href="/app/calendar" className="btn-ghost text-sm inline-flex">
          {t('sections.week_ahead.open_calendar')}
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SECTION 6 — Empty state
// ---------------------------------------------------------------------------

export function EmptyStateCard() {
  const { t } = useTranslation('dashboard');
  return (
    <Card padding="none" className="p-8 md:p-12 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-forest-soft grid place-items-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-forest">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      </div>
      <h2 className="font-display text-2xl tracking-tightest text-ink mb-2">
        {t('sections.empty.title')}
      </h2>
      <p className="text-sm text-ink-muted mb-5 max-w-sm mx-auto">
        {t('sections.empty.body')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link href="/app/calendar" className="text-forest hover:text-forest-ink underline underline-offset-2">
          {t('sections.empty.schedule')}
        </Link>
        <span className="text-ink-soft">·</span>
        <Link href="/app/students/new" className="text-forest hover:text-forest-ink underline underline-offset-2">
          {t('sections.empty.add_student')}
        </Link>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function TodaySkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <Card key={i} padding="none" className="p-5 md:p-6">
          <div className="h-3 w-24 bg-ruleSoft rounded mb-4" />
          <div className="h-7 w-56 bg-ruleSoft rounded mb-2" />
          <div className="h-4 w-40 bg-ruleSoft rounded mb-5" />
          <div className="flex gap-2">
            <div className="h-9 w-20 bg-ruleSoft rounded" />
            <div className="h-9 w-24 bg-ruleSoft rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}
