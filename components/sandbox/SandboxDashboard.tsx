import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { getSandboxData, SANDBOX_POLISH_SAMPLES, type SandboxSession, type SandboxInvoice } from '../../lib/sandbox-data';

type Toast = { id: string; tone: 'success' | 'info' | 'error'; message: string };

export default function SandboxDashboard() {
  const initial = useMemo(() => getSandboxData(), []);
  const [sessions, setSessions] = useState(initial.sessions);
  const [invoices, setInvoices] = useState(initial.invoices);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [polishingId, setPolishingId] = useState<string | null>(null);
  const [openPolishId, setOpenPolishId] = useState<string | null>(null);

  function pushToast(t: Omit<Toast, 'id'>) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((p) => p.id !== id)), 4500);
  }

  // Today's sessions (just today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const todaySessions = sessions
    .filter((s) => {
      const d = new Date(s.scheduled_at);
      return d >= today && d < tomorrow;
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const polishQueue = sessions.filter((s) => s.status === 'completed' && !s.is_polished);
  const completedToday = todaySessions.filter((s) => s.status === 'completed').length;
  const scheduledToday = todaySessions.length;
  const unpaid = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
  const unpaidTotal = unpaid.reduce((acc, i) => acc + i.total_cents, 0);
  const draft = invoices.find((i) => i.status === 'draft');

  function nextSession() {
    const now = Date.now();
    return todaySessions.find((s) => new Date(s.scheduled_at).getTime() > now);
  }
  const next = nextSession();
  const studentName = (id: string) => initial.students.find((s) => s.id === id)?.name ?? id;

  function startPolish(id: string) {
    setPolishingId(id);
    setOpenPolishId(id);
    setTimeout(() => {
      const sample = SANDBOX_POLISH_SAMPLES[id];
      if (sample) {
        setSessions((prev) => prev.map((s) => s.id === id ? { ...s, is_polished: true, notes_polished: sample.polished } : s));
      }
      setPolishingId(null);
      pushToast({ tone: 'success', message: 'Polished. Read like you wrote it on a good day.' });
    }, 1700);
  }

  function sendToParent(id: string) {
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, is_sent_to_parent: true } : s));
    setOpenPolishId(null);
    const stu = sessions.find((s) => s.id === id);
    pushToast({ tone: 'success', message: `Sent to ${stu ? studentName(stu.student_id) + '\'s parent' : 'parent'}.` });
  }

  function sendInvoice(invId: string) {
    setInvoices((prev) => prev.map((i) => i.id === invId ? { ...i, status: 'sent' } : i));
    pushToast({ tone: 'success', message: 'Invoice sent. Parent gets a card payment link by email.' });
  }

  return (
    <div className="px-4 md:px-8 pt-6 md:pt-10 pb-12 max-w-[1200px] mx-auto" id="home">
      <header className="mb-6 md:mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[28px] md:text-[32px] font-display font-semibold tracking-tighter leading-tight m-0">
            Good morning, Sarah.
          </h1>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-forest-soft text-forest-ink text-2xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-forest" />
            12 days running
          </div>
        </div>
        <div className="text-sm text-ink-muted mt-1">
          {today.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          {' · '}
          {scheduledToday} {scheduledToday === 1 ? 'session' : 'sessions'} · {scheduledToday * 60} min
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8 md:mb-10">
        <StatCard
          label="Today"
          value={scheduledToday}
          sub={next ? `Next: ${studentName(next.student_id)} at ${formatTime(next.scheduled_at)}` : completedToday > 0 ? 'All done for today' : 'Free this afternoon'}
          tone="default"
        />
        <StatCard
          label="This week"
          value={sessions.filter((s) => isThisWeek(new Date(s.scheduled_at))).length}
          sub="Scheduled"
          tone="default"
        />
        <StatCard
          label="Polish queue"
          value={polishQueue.length}
          sub={polishQueue.length > 0 ? 'Oldest is from yesterday' : 'Caught up'}
          tone={polishQueue.length > 0 ? 'amber' : 'default'}
        />
        <StatCard
          label="Unpaid invoices"
          value={unpaid.length > 0 ? `$${(unpaidTotal / 100).toFixed(0)}` : '$0'}
          sub={unpaid.length > 0 ? `${unpaid.length} open` : 'All paid up'}
          tone={unpaid.length > 0 ? 'amber' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 md:gap-8">
        <section>
          <h2 className="text-[15px] font-display font-semibold tracking-tighter mb-3">Today</h2>
          <div className="card p-3 md:p-4">
            {todaySessions.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-ink-muted">No sessions today.</div>
            ) : (
              <div className="space-y-0.5">
                {todaySessions.map((s) => (
                  <TodayRow key={s.id} session={s} studentName={studentName(s.student_id)} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[15px] font-display font-semibold tracking-tighter mb-3">Needs attention</h2>
          <div className="space-y-3">
            {polishQueue.length > 0 && (
              <NudgeCard
                tone="amber"
                title={`${polishQueue.length} session${polishQueue.length === 1 ? '' : 's'} ready to polish`}
                description={`Oldest: ${studentName(polishQueue[polishQueue.length - 1].student_id)}`}
                action={polishQueue[0] ? { label: 'Polish first', onClick: () => startPolish(polishQueue[0].id) } : undefined}
              />
            )}
            {draft && (
              <NudgeCard
                tone="forest"
                title={`${invoices.filter((i) => i.status === 'draft').length} draft invoice ready to send`}
                description={`${draft.parent_name} · $${(draft.total_cents / 100).toFixed(0)}`}
                action={{ label: 'Send invoice', onClick: () => sendInvoice(draft.id) }}
              />
            )}
            {unpaid.some((i) => isOverdue(i)) && (
              <NudgeCard
                tone="claret"
                title="1 invoice overdue"
                description={`Diego R. · ${overdueDays(unpaid.find(isOverdue)!)} days past due`}
                action={{ label: 'Nudge parent', onClick: () => pushToast({ tone: 'info', message: 'Sent a friendly reminder. (Real app sends email + SMS.)' }) }}
              />
            )}
            {polishQueue.length === 0 && !draft && !unpaid.some(isOverdue) && (
              <div className="card p-5 flex items-center gap-3">
                <div className="w-8 h-8 grid place-items-center rounded-full bg-success-soft text-success-ink shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                </div>
                <div className="text-sm text-ink">All caught up.</div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Polish queue inline section */}
      <section id="sessions" className="mt-12 scroll-mt-24">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[15px] font-display font-semibold tracking-tighter">Polish queue</h2>
          <div className="text-2xs text-ink-soft uppercase tracking-widest">
            {polishQueue.length} {polishQueue.length === 1 ? 'session' : 'sessions'}
          </div>
        </div>
        <div className="space-y-3">
          {polishQueue.length === 0 ? (
            <div className="card p-6 text-sm text-ink-muted">No sessions waiting. You're all caught up.</div>
          ) : (
            polishQueue.map((s) => (
              <PolishCard
                key={s.id}
                session={s}
                studentName={studentName(s.student_id)}
                isPolishing={polishingId === s.id}
                isOpen={openPolishId === s.id}
                onToggle={() => setOpenPolishId(openPolishId === s.id ? null : s.id)}
                onPolish={() => startPolish(s.id)}
                onSend={() => sendToParent(s.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* Invoices */}
      <section id="money" className="mt-12 scroll-mt-24">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[15px] font-display font-semibold tracking-tighter">Invoices</h2>
          <div className="text-2xs text-ink-soft uppercase tracking-widest">
            {invoices.length} this month
          </div>
        </div>
        <div className="rounded-md border border-rule overflow-hidden bg-surface">
          {invoices.map((inv, i) => (
            <InvoiceRow
              key={inv.id}
              invoice={inv}
              studentName={studentName(inv.student_id)}
              isLast={i === invoices.length - 1}
              onSend={() => sendInvoice(inv.id)}
            />
          ))}
        </div>
      </section>

      {/* Try the trial CTA at bottom */}
      <section className="mt-16 rounded-md border border-forest bg-forest/[0.04] p-6 md:p-8 text-center">
        <h2 className="font-display text-2xl tracking-tighter text-forest-ink mb-2 text-balance">
          That's the loop. Log, polish, send, get paid.
        </h2>
        <p className="text-sm text-forest-ink/85 mb-5 max-w-prose mx-auto">
          The real version connects to your students, your parents, and your bank. 7-day trial — no card.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/auth/signup" className="btn-primary text-sm px-6">Start free trial</Link>
          <Link href="/pricing" className="btn-secondary text-sm px-6">See pricing</Link>
        </div>
      </section>

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={[
                'rounded-md border bg-surface shadow-lift px-4 py-3 text-sm flex items-start gap-3 pointer-events-auto animate-slide-up',
                t.tone === 'success' ? 'border-forest/30' : t.tone === 'error' ? 'border-claret/30' : 'border-rule',
              ].join(' ')}
            >
              <span className="shrink-0 mt-0.5">
                {t.tone === 'success' ? <CheckIcon /> : <DotIcon />}
              </span>
              <span className="text-ink leading-snug">{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone: 'default' | 'amber' | 'claret' }) {
  return (
    <div className="card p-5">
      <div className="text-2xs uppercase tracking-widest text-ink-muted font-medium mb-2">{label}</div>
      <div className={[
        'display-num leading-none mb-3',
        tone === 'amber' ? 'text-amber-ink' :
        tone === 'claret' ? 'text-claret' : 'text-ink',
      ].join(' ')}>
        {value}
      </div>
      <div className="text-xs text-ink-muted truncate">{sub}</div>
    </div>
  );
}

function TodayRow({ session, studentName }: { session: SandboxSession; studentName: string }) {
  const start = new Date(session.scheduled_at).getTime();
  const end = start + session.duration_minutes * 60_000;
  const now = Date.now();
  const isCurrent = start <= now && now <= end;
  const isPast = end < now || session.status === 'completed';

  return (
    <div className={[
      'relative flex items-center gap-3 px-3 py-2.5 rounded transition-colors duration-100 hover:bg-ruleSoft/50',
      isCurrent ? 'bg-forest-soft/30' : '',
    ].join(' ')}>
      {isCurrent && <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-forest rounded session-now-pulse" />}
      <span className="text-xs text-ink-muted num tabular w-12 shrink-0">
        {formatTime(session.scheduled_at)}
      </span>
      <div className="w-7 h-7 rounded-full bg-forest-soft text-forest-ink grid place-items-center text-2xs font-display tracking-tighter shrink-0">
        {studentName.split(/\s/).map((p) => p[0]).slice(0, 2).join('')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink font-medium truncate">{studentName}</div>
        <div className="text-2xs text-ink-soft truncate">{session.subject} · {session.duration_minutes} min</div>
      </div>
      {isCurrent ? (
        <span className="px-2 py-0.5 rounded-full bg-forest text-cream text-2xs font-medium uppercase tracking-widest">In session</span>
      ) : isPast ? (
        <span className="px-2 py-0.5 rounded-full bg-success-soft text-success-ink text-2xs font-medium uppercase tracking-widest">Logged</span>
      ) : (
        <span className="px-2 py-0.5 rounded-full bg-ruleSoft text-ink-muted text-2xs font-medium uppercase tracking-widest">Upcoming</span>
      )}
    </div>
  );
}

function NudgeCard({ tone, title, description, action }: { tone: 'amber' | 'claret' | 'forest'; title: string; description?: string; action?: { label: string; onClick: () => void } }) {
  const toneCx =
    tone === 'amber' ? 'border-amber/30 bg-amber-soft/40' :
    tone === 'claret' ? 'border-claret/30 bg-claret/5' :
    'border-forest/30 bg-forest-soft/30';
  const dotCx =
    tone === 'amber' ? 'bg-amber' :
    tone === 'claret' ? 'bg-claret' : 'bg-forest';
  return (
    <div className={['rounded-md border p-4 flex items-start gap-3', toneCx].join(' ')}>
      <span className={['w-1.5 h-1.5 rounded-full mt-2 shrink-0', dotCx].join(' ')} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink font-medium leading-snug">{title}</div>
        {description && <div className="text-2xs text-ink-muted mt-0.5">{description}</div>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 text-2xs font-medium px-3 py-1.5 rounded-full bg-surface border border-rule hover:border-ink-soft transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function PolishCard({
  session, studentName, isPolishing, isOpen, onToggle, onPolish, onSend,
}: {
  session: SandboxSession;
  studentName: string;
  isPolishing: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onPolish: () => void;
  onSend: () => void;
}) {
  const sample = SANDBOX_POLISH_SAMPLES[session.id];
  const polishedText = session.notes_polished ?? sample?.polished ?? '';
  const roughText = session.notes_internal ?? sample?.rough ?? '';

  return (
    <article className="rounded-md border border-rule bg-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-ruleSoft/40 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-full bg-forest-soft text-forest-ink grid place-items-center text-2xs font-display tracking-tighter shrink-0">
          {studentName.split(/\s/).map((p) => p[0]).slice(0, 2).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink font-medium truncate">{studentName} · {session.subject}</div>
          <div className="text-2xs text-ink-soft truncate">{formatRelative(new Date(session.scheduled_at))} · {session.duration_minutes} min</div>
        </div>
        {session.is_polished ? (
          <span className="px-2 py-0.5 rounded-full bg-forest-soft text-forest-ink text-2xs font-medium uppercase tracking-widest">Polished</span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-amber-soft text-amber-ink text-2xs font-medium uppercase tracking-widest">Needs polish</span>
        )}
        <span aria-hidden className={['text-ink-soft transition-transform duration-150', isOpen ? 'rotate-180' : ''].join(' ')}>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4.5L6 7.5L9 4.5" /></svg>
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-rule p-4 md:p-5 grid md:grid-cols-2 gap-4 md:gap-5 animate-fade-in">
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">Your rough notes</div>
            <div className="text-2xs text-ink-muted leading-relaxed whitespace-pre-line border border-dashed border-rule rounded p-3 bg-cream">
              {roughText}
            </div>
          </div>
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2 flex items-center gap-1.5">
              {session.is_polished ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-forest" />
                  Polished — ready for parent
                </>
              ) : isPolishing ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
                  Polishing…
                </>
              ) : (
                <>Polished version</>
              )}
            </div>
            {isPolishing ? (
              <div className="border border-rule rounded p-3 bg-surface space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton-shimmer h-3" style={{ width: `${[80, 95, 70, 85][i]}%`, animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            ) : session.is_polished ? (
              <div className="text-2xs text-ink leading-relaxed whitespace-pre-line border border-rule rounded p-3 bg-surface">
                {polishedText}
              </div>
            ) : (
              <div className="text-2xs text-ink-soft italic border border-dashed border-rule rounded p-3 bg-surface">
                Click "Polish" — Crestio rewrites this in your voice in about 2 seconds.
              </div>
            )}
          </div>

          <div className="md:col-span-2 flex flex-wrap items-center gap-2 pt-2 border-t border-rule">
            {!session.is_polished ? (
              <button
                type="button"
                onClick={onPolish}
                disabled={isPolishing}
                className="btn-primary text-2xs px-4"
                style={{ height: 32, minHeight: 32 }}
              >
                {isPolishing ? 'Polishing…' : 'Polish notes'}
              </button>
            ) : !session.is_sent_to_parent ? (
              <>
                <button
                  type="button"
                  onClick={onSend}
                  className="btn-primary text-2xs px-4"
                  style={{ height: 32, minHeight: 32 }}
                >
                  Send to parent
                </button>
                <span className="text-2xs text-ink-soft">Will email {studentName}'s parent · view in portal link included.</span>
              </>
            ) : (
              <span className="text-2xs text-forest-ink inline-flex items-center gap-1.5">
                <CheckIcon /> Sent. Parent gets it as an email + portal entry.
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function InvoiceRow({ invoice, studentName, isLast, onSend }: { invoice: SandboxInvoice; studentName: string; isLast: boolean; onSend: () => void }) {
  const [showSentDetail, setShowSentDetail] = useState(false);
  const total = `$${(invoice.total_cents / 100).toFixed(0)}`;

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3.5 hover:bg-ruleSoft/40 transition-colors',
        isLast ? '' : 'border-b border-ruleSoft',
      ].join(' ')}
    >
      <div className="w-32 shrink-0">
        <div className="text-sm text-ink font-medium num tabular">{invoice.number}</div>
        <div className="text-2xs text-ink-soft num tabular">{invoice.issued_on}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink truncate">{studentName} <span className="text-ink-soft">·</span> {invoice.parent_name}</div>
        <div className="text-2xs text-ink-soft">{invoice.session_count} {invoice.session_count === 1 ? 'session' : 'sessions'}</div>
      </div>
      <div className="text-sm text-ink num tabular w-20 text-right shrink-0">{total}</div>
      <div className="w-28 shrink-0 text-right">
        <StatusPill status={invoice.status} overdue={isOverdue(invoice)} />
      </div>
      <div className="w-24 shrink-0 text-right">
        {invoice.status === 'draft' ? (
          <button
            type="button"
            onClick={onSend}
            className="text-2xs font-medium text-forest hover:underline"
          >
            Send →
          </button>
        ) : invoice.status === 'paid' ? (
          <button
            type="button"
            onClick={() => setShowSentDetail(!showSentDetail)}
            className="text-2xs text-ink-soft hover:text-ink"
          >
            View receipt
          </button>
        ) : isOverdue(invoice) ? (
          <button type="button" className="text-2xs font-medium text-claret hover:underline">Nudge</button>
        ) : (
          <span className="text-2xs text-ink-soft">Sent</span>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, overdue }: { status: SandboxInvoice['status']; overdue: boolean }) {
  if (overdue) return <span className="px-2 py-0.5 rounded-full bg-claret/10 text-claret text-2xs font-medium uppercase tracking-widest">Overdue</span>;
  if (status === 'paid') return <span className="px-2 py-0.5 rounded-full bg-success-soft text-success-ink text-2xs font-medium uppercase tracking-widest">Paid</span>;
  if (status === 'sent') return <span className="px-2 py-0.5 rounded-full bg-forest-soft text-forest-ink text-2xs font-medium uppercase tracking-widest">Sent</span>;
  return <span className="px-2 py-0.5 rounded-full bg-ruleSoft text-ink-muted text-2xs font-medium uppercase tracking-widest">Draft</span>;
}

function CheckIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-forest" /></svg>;
}
function DotIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="currentColor" className="text-ink-muted" /></svg>;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, '0')}${period}`;
}

function isThisWeek(d: Date): boolean {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const dow = start.getDay();
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}

function isOverdue(inv: SandboxInvoice): boolean {
  if (inv.status !== 'sent') return false;
  return new Date(inv.due_on) < new Date();
}

function overdueDays(inv: SandboxInvoice): number {
  return Math.floor((Date.now() - new Date(inv.due_on).getTime()) / 86_400_000);
}

function formatRelative(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
