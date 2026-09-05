import { useState } from 'react';
import Link from 'next/link';
import AuthGuard from '../../../components/AuthGuard';
import Layout from '../../../components/Layout';
import SettingsTabs from '../../../components/SettingsTabs';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../components/design/Toast';

// Data — export and account deletion. Self-serve, calm copy, clear consequences.
function DataInner() {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  async function exportSessions() {
    const { data: rows } = await supabase
      .from('sessions')
      .select('scheduled_at, duration_minutes, subject, status, paid, charge_rate_cents, notes_internal, notes_parent_facing, student:students(name)')
      .order('scheduled_at', { ascending: false });
    const csv = toCsv(rows ?? []);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `crestio-sessions-${Date.now()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.show({ message: 'Sessions exported.', tone: 'success' });
  }

  async function deleteAccount() {
    if (confirmText !== 'DELETE') {
      toast.show({ message: 'Type DELETE to confirm.', tone: 'warning' });
      return;
    }
    setDeleting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setDeleting(false); return; }
    await fetch('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setDeleting(false);
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <Layout pageTitle="Data" title="Data" subtitle="Settings">
      <SettingsTabs />
      <div className="max-w-2xl space-y-4">
        <section className="card p-5 md:p-6">
          <h2 className="text-[16px] font-display font-semibold tracking-tightest mb-1">Export your data</h2>
          <p className="text-sm text-ink-muted leading-relaxed mb-4">
            Download a CSV of every session you've logged. Perfect for tax season or moving to another tool.
          </p>
          <button type="button" onClick={exportSessions} className="btn-secondary text-sm">
            Export sessions (CSV)
          </button>
        </section>

        <section className="card p-5 md:p-6 border-claret/30">
          <h2 className="text-[16px] font-display font-semibold tracking-tightest mb-1">Delete your account</h2>
          <p className="text-sm text-ink-muted leading-relaxed mb-4">
            This permanently removes your profile, sessions, students, invoices, files, and messages.
            Anything paid via Stripe stays in Stripe; you'll keep access there. There is no undo.
          </p>
          <label className="label">Type DELETE to confirm</label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="input mb-3 max-w-sm"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={deleteAccount}
              disabled={deleting || confirmText !== 'DELETE'}
              className="btn-danger text-sm bg-claret text-cream hover:opacity-90"
              style={{ height: 36, minHeight: 36 }}
            >
              {deleting ? 'Deleting…' : 'Delete my account'}
            </button>
            <Link href="/app/settings/account" className="btn-ghost text-sm" style={{ height: 36, minHeight: 36 }}>
              Cancel
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}

function toCsv(rows: any[]): string {
  if (rows.length === 0) return 'No data\n';
  const headers = ['Date', 'Student', 'Subject', 'Duration (min)', 'Status', 'Paid', 'Rate (cents)', 'Internal notes', 'Parent-facing notes'];
  const escape = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.scheduled_at,
      r.student?.name ?? '',
      r.subject ?? '',
      r.duration_minutes,
      r.status,
      r.paid ? 'yes' : '',
      r.charge_rate_cents ?? '',
      r.notes_internal ?? '',
      r.notes_parent_facing ?? '',
    ].map(escape).join(','));
  }
  return lines.join('\n');
}

export default function Page() {
  return <AuthGuard><DataInner /></AuthGuard>;
}
