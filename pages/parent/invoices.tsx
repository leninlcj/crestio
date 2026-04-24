import { useEffect, useState } from 'react';
import Link from 'next/link';
import AuthGuardParent from '../../components/AuthGuardParent';
import { supabase } from '../../lib/supabase';

type InvoiceRow = {
  id: string;
  number: string;
  issued_on: string;
  due_on: string | null;
  total_cents: number;
  status: string;
  student_id: string | null;
  student_name: string | null;
  household_id: string | null;
  household_name: string | null;
  is_batch_generated: boolean;
};

function formatAud(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

function InvoicesInner() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  useEffect(() => {
    (async () => {
      // Parent RLS lets us SELECT invoices whose student is linked to us OR
      // whose household we're a member of (post-13H.5 RLS extension).
      const { data } = await supabase
        .from('invoices')
        .select('id, number, issued_on, due_on, total_cents, status, student_id, household_id, is_batch_generated, student:students(name), household:households(display_name)')
        .order('issued_on', { ascending: false });
      setInvoices(((data ?? []) as any[]).map((i) => ({
        id: i.id,
        number: i.number,
        issued_on: i.issued_on,
        due_on: i.due_on,
        total_cents: i.total_cents,
        status: i.status,
        student_id: i.student_id,
        student_name: i.student?.name ?? null,
        household_id: i.household_id,
        household_name: i.household?.display_name ?? null,
        is_batch_generated: !!i.is_batch_generated,
      })));
      setLoading(false);
    })();
  }, []);

  const unpaidTotal = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((a, i) => a + (i.total_cents ?? 0), 0);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <nav className="px-6 md:px-12 py-6 flex items-center justify-between border-b border-rule">
        <Link href="/parent/dashboard" className="font-display text-2xl tracking-tightest">
          crest<span className="italic text-forest">io</span>
        </Link>
        <Link href="/parent/dashboard" className="text-sm text-ink-muted hover:text-ink">← Dashboard</Link>
      </nav>

      <main className="px-6 md:px-12 py-10 max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-2">Invoices</div>
          <h1 className="font-display text-4xl tracking-tightest">Your invoices</h1>
        </div>

        {loading ? (
          <div className="card p-6 text-sm text-ink-muted">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="card p-6 text-sm text-ink-muted">No invoices yet.</div>
        ) : (
          <>
            {unpaidTotal > 0 && (
              <div className="card p-5 mb-6 bg-claret/5 border-claret/30">
                <div className="text-2xs uppercase tracking-widest text-claret/80 mb-1">Outstanding</div>
                <div className="font-display text-3xl tracking-tightest text-claret">{formatAud(unpaidTotal)}</div>
                <div className="text-2xs text-ink-soft mt-2">
                  To pay, follow the instructions on each invoice from your tutor.
                </div>
              </div>
            )}

            <div className="space-y-3">
              {invoices.map((inv) => {
                const overdue = inv.due_on && inv.status !== 'paid' && inv.status !== 'void'
                  && new Date(inv.due_on) < new Date();
                const badge = inv.status === 'paid' ? 'badge-forest'
                  : overdue ? 'badge-claret' : 'badge-rust';
                return (
                  <Link
                    key={inv.id}
                    href={`/parent/invoices/${inv.id}`}
                    className="card p-5 flex flex-wrap items-center justify-between gap-3 hover:shadow-lift transition-shadow"
                  >
                    <div>
                      <div className="font-mono text-sm">
                        {inv.number}
                        {inv.is_batch_generated && (
                          <span className="ml-2 badge-neutral text-2xs">FAMILY</span>
                        )}
                      </div>
                      <div className="text-2xs text-ink-muted">
                        {inv.household_name ? <>{inv.household_name} · </> : inv.student_name ? <>{inv.student_name} · </> : null}
                        Issued {new Date(inv.issued_on).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {inv.due_on ? ` · Due ${new Date(inv.due_on).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">{formatAud(inv.total_cents)}</span>
                      <span className={badge}>{inv.status === 'paid' ? 'Paid' : overdue ? 'Overdue' : inv.status}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function ParentInvoices() {
  return <AuthGuardParent><InvoicesInner /></AuthGuardParent>;
}
