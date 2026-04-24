import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AuthGuardParent from '../../../components/AuthGuardParent';
import { supabase } from '../../../lib/supabase';

type LineItem = {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  scheduled_at: string | null;
  duration_minutes: number;
  subject: string | null;
  topic: string | null;
  amount_cents: number;
};

type InvoiceData = {
  id: string;
  number: string;
  issued_on: string;
  due_on: string | null;
  total_cents: number;
  status: string;
  notes: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  is_batch_generated: boolean;
  household_id: string | null;
  student_id: string | null;
  household: { id: string; display_name: string } | null;
  student: { id: string; name: string } | null;
};

function formatAud(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function ParentInvoiceDetailInner() {
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [legacySessions, setLegacySessions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    (async () => {
      setLoading(true);
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .select('id, number, issued_on, due_on, total_cents, status, notes, billing_period_start, billing_period_end, is_batch_generated, household_id, student_id, household:households(id, display_name), student:students(id, name)')
        .eq('id', id)
        .maybeSingle();
      if (invErr || !inv) { setError('Invoice not found.'); setLoading(false); return; }
      setInvoice(inv as any);

      if ((inv as any).household_id) {
        const { data: lines } = await supabase
          .from('invoice_sessions')
          .select('id, session_id, student_id, duration_minutes, amount_cents, line_item_description')
          .eq('invoice_id', id);
        const sessionIds = ((lines ?? []) as any[]).map((l) => l.session_id);
        const studentIds = Array.from(new Set(((lines ?? []) as any[]).map((l) => l.student_id)));
        const [{ data: sess }, { data: studs }] = await Promise.all([
          sessionIds.length > 0
            ? supabase.from('sessions').select('id, scheduled_at, subject, topic').in('id', sessionIds)
            : Promise.resolve({ data: [] as any[] }),
          studentIds.length > 0
            ? supabase.from('students').select('id, name').in('id', studentIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const sessionById = new Map<string, any>();
        for (const s of (sess ?? []) as any[]) sessionById.set(s.id, s);
        const studentById = new Map<string, any>();
        for (const s of (studs ?? []) as any[]) studentById.set(s.id, s);
        const items: LineItem[] = ((lines ?? []) as any[]).map((l) => ({
          id: l.id,
          session_id: l.session_id,
          student_id: l.student_id,
          student_name: studentById.get(l.student_id)?.name ?? '—',
          scheduled_at: sessionById.get(l.session_id)?.scheduled_at ?? null,
          duration_minutes: l.duration_minutes,
          subject: sessionById.get(l.session_id)?.subject ?? null,
          topic: sessionById.get(l.session_id)?.topic ?? null,
          amount_cents: l.amount_cents,
        }));
        items.sort((a, b) => {
          if (a.student_name !== b.student_name) return a.student_name.localeCompare(b.student_name);
          return new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime();
        });
        setLineItems(items);
      } else {
        const { data: sess } = await supabase
          .from('sessions')
          .select('id, scheduled_at, subject, topic, duration_minutes, charge_rate_cents, pay_rate_cents')
          .eq('invoice_id', id)
          .order('scheduled_at');
        setLegacySessions((sess ?? []) as any[]);
      }
      setLoading(false);
    })();
  }, [id]);

  const grouped = useMemo(() => {
    const map = new Map<string, LineItem[]>();
    for (const l of lineItems) {
      const arr = map.get(l.student_id) ?? [];
      arr.push(l);
      map.set(l.student_id, arr);
    }
    return Array.from(map.entries()).map(([sid, items]) => ({
      student_id: sid,
      student_name: items[0]?.student_name ?? '—',
      items,
      subtotal: items.reduce((a, i) => a + i.amount_cents, 0),
    }));
  }, [lineItems]);

  const overdue =
    invoice?.due_on && invoice.status !== 'paid' && invoice.status !== 'void' &&
    new Date(invoice.due_on) < new Date();

  return (
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/invoices" className="text-sm text-ink-muted hover:text-ink">← Invoices</Link>
      </nav>

      <main className="px-6 md:px-12 py-10 max-w-3xl mx-auto">
        {loading ? (
          <div className="card p-6 text-sm text-ink-muted">Loading…</div>
        ) : error || !invoice ? (
          <div className="card p-6 text-sm text-claret">{error ?? 'Invoice not found.'}</div>
        ) : (
          <>
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">
                  Invoice {invoice.number}
                </div>
                <h1 className="font-display text-3xl tracking-tightest">
                  {invoice.household?.display_name ?? invoice.student?.name ?? 'Invoice'}
                </h1>
              </div>
              <div className="text-right">
                <div className="font-display text-3xl tracking-tightest num font-mono">
                  {formatAud(invoice.total_cents)}
                </div>
                <div className="text-2xs uppercase tracking-widest mt-1">
                  <span className={
                    invoice.status === 'paid' ? 'badge-forest' :
                    overdue ? 'badge-claret' :
                    invoice.status === 'sent' ? 'badge-rust' :
                    invoice.status === 'draft' ? 'badge-neutral' :
                    'badge-neutral'
                  }>
                    {invoice.status === 'paid' ? 'Paid' : overdue ? 'Overdue' : invoice.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="card p-5 mb-6 grid grid-cols-2 gap-6 text-sm">
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Issued</div>
                <div>{fmtDate(invoice.issued_on)}</div>
              </div>
              <div>
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Due</div>
                <div>{fmtDate(invoice.due_on)}</div>
              </div>
              {invoice.billing_period_start && invoice.billing_period_end && (
                <div className="col-span-2">
                  <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">Period</div>
                  <div>{fmtDate(invoice.billing_period_start)} – {fmtDate(invoice.billing_period_end)}</div>
                </div>
              )}
            </div>

            <div className="card p-5 mb-6">
              <div className="text-2xs uppercase tracking-widest text-ink-muted mb-3">Sessions</div>
              {invoice.household_id ? (
                grouped.length === 0 ? (
                  <div className="text-sm text-ink-muted">No line items.</div>
                ) : (
                  <div className="space-y-5">
                    {grouped.map((g) => (
                      <div key={g.student_id}>
                        <div className="text-sm font-medium text-ink mb-2">{g.student_name}</div>
                        <ul className="divide-y divide-ruleSoft">
                          {g.items.map((l) => (
                            <li key={l.id} className="py-2 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-ink">
                                  {fmtDateTime(l.scheduled_at)}
                                  <span className="text-ink-soft text-2xs"> · {l.duration_minutes} min</span>
                                </div>
                                <div className="text-2xs text-ink-muted">
                                  {[l.subject, l.topic].filter(Boolean).join(' · ') || 'Tutoring session'}
                                </div>
                              </div>
                              <div className="font-mono text-sm shrink-0">{formatAud(l.amount_cents)}</div>
                            </li>
                          ))}
                        </ul>
                        <div className="text-right text-2xs text-ink-muted mt-2">
                          Subtotal: <span className="font-mono text-sm text-ink">{formatAud(g.subtotal)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : legacySessions.length === 0 ? (
                <div className="text-sm text-ink-muted">No sessions on this invoice.</div>
              ) : (
                <ul className="divide-y divide-ruleSoft">
                  {legacySessions.map((s: any) => {
                    const amount = Math.round(((s.charge_rate_cents ?? 0) * s.duration_minutes) / 60);
                    return (
                      <li key={s.id} className="py-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm text-ink">
                            {fmtDateTime(s.scheduled_at)}
                            <span className="text-ink-soft text-2xs"> · {s.duration_minutes} min</span>
                          </div>
                          <div className="text-2xs text-ink-muted">
                            {[s.subject, s.topic].filter(Boolean).join(' · ') || 'Tutoring session'}
                          </div>
                        </div>
                        <div className="font-mono text-sm shrink-0">{formatAud(amount)}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {invoice.notes && (
              <div className="card p-5 mb-6">
                <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Notes</div>
                <p className="text-sm text-ink whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => window.print()} className="btn-secondary text-sm">Download / print</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function ParentInvoiceDetailPage() {
  return <AuthGuardParent><ParentInvoiceDetailInner /></AuthGuardParent>;
}
