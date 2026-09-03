import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Renders a top-of-page banner when the signed-in tutor has sample data
// seeded. Banner copy switches when the tutor has added their first real
// student (so the prompt to clear becomes more pointed).
export default function SampleDataBanner() {
  const [show, setShow] = useState(false);
  const [hasReal, setHasReal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setShow(false); return; }

    const { data: profile } = await supabase
      .from('profiles').select('has_sample_data').eq('id', session.user.id).maybeSingle();
    if (!profile?.has_sample_data) { setShow(false); return; }
    setShow(true);

    // Has the user added any real (non-sample) students yet?
    const { data: real } = await supabase
      .from('students').select('id').eq('is_sample', false).limit(1);
    setHasReal((real?.length ?? 0) > 0);
  }

  useEffect(() => { load(); }, []);

  async function clear() {
    if (!window.confirm('Clear sample data and start fresh? This deletes the sample students, sessions, and invoices.')) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/onboarding/clear-sample-data', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setShow(false);
        // Reload to refresh lists.
        if (typeof window !== 'undefined') window.location.reload();
      }
    } finally { setBusy(false); }
  }

  if (!show) return null;

  return (
    <div className={
      'flex items-center justify-between gap-3 p-3 rounded text-sm border ' +
      (hasReal ? 'bg-amber-soft border-amber/40 text-amber-ink' : 'bg-forest-soft border-forest/20 text-forest-ink')
    }>
      <span>
        {hasReal
          ? 'Mixing sample data with real data?'
          : 'This is sample data so you can explore Crestio.'}
      </span>
      <button
        onClick={clear}
        disabled={busy}
        className="btn-secondary"
      >
        {busy ? 'Clearing…' : 'Clear sample data'}
      </button>
    </div>
  );
}
