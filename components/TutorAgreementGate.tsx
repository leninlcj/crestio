import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { authFetch } from '../lib/authFetch';
import { TUTOR_AGREEMENT, CODE_OF_CONDUCT, TUTOR_AGREEMENT_VERSION } from '../lib/agencyLegal';
import { LegalDocBody } from './agency/LegalDoc';

// Shown to a tutor on sign-in until they have accepted the current Tutor
// Agreement and Code of Conduct. Blocks the app underneath; acceptance is
// recorded on their tutors row with the version and time.

type Me = { found: boolean; agreement_accepted_at: string | null; agreement_version: string | null; conduct_accepted_at: string | null };

export default function TutorAgreementGate() {
  const [me, setMe] = useState<Me | null>(null);
  const [agree, setAgree] = useState(false);
  const [conduct, setConduct] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/tutors/me');
        const payload = await res.json();
        if (!cancelled && res.ok) setMe(payload);
      } catch { /* leave closed */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const needs = !!me && me.found && (!me.agreement_accepted_at || me.agreement_version !== TUTOR_AGREEMENT_VERSION || !me.conduct_accepted_at);
  if (!mounted || !needs) return null;

  async function accept() {
    setBusy(true); setError(null);
    try {
      const res = await authFetch('/api/tutors/accept-agreement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: TUTOR_AGREEMENT_VERSION }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Could not record your acceptance.');
      setMe((m) => (m ? { ...m, agreement_accepted_at: payload.agreement_accepted_at, agreement_version: payload.agreement_version, conduct_accepted_at: payload.conduct_accepted_at } : m));
    } catch (e: any) {
      setError(e?.message ?? 'Could not record your acceptance.');
    } finally { setBusy(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-ink/60 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="tutor-agreement-title">
      <div className="bg-surface w-full sm:max-w-3xl max-h-[92vh] sm:rounded-md border border-rule flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-rule">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1">Before you start</div>
          <h2 id="tutor-agreement-title" className="font-display text-2xl tracking-tighter text-ink">Read and accept the tutor agreement and code of conduct.</h2>
          <p className="text-sm text-ink-muted mt-1">Version {TUTOR_AGREEMENT_VERSION}. Takes about ten minutes. You can read them again any time at crestio.ai/tutors/agreement.</p>
        </div>
        <div className="overflow-y-auto px-6 py-5 space-y-8">
          <section>
            <h3 className="font-display text-xl tracking-tighter text-ink mb-3">{TUTOR_AGREEMENT.title}</h3>
            <LegalDocBody doc={TUTOR_AGREEMENT} compact />
          </section>
          <section>
            <h3 className="font-display text-xl tracking-tighter text-ink mb-3">{CODE_OF_CONDUCT.title}</h3>
            <LegalDocBody doc={CODE_OF_CONDUCT} compact />
          </section>
        </div>
        <div className="px-6 py-4 border-t border-rule space-y-3">
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I have read the Tutor Agreement and I accept it. I am an independent tutor, 18 or older, and I hold or will hold a NSW Working With Children Check for paid work before my first lesson.</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={conduct} onChange={(e) => setConduct(e.target.checked)} />
            <span>I have read the Code of Conduct and I will follow it.</span>
          </label>
          {error && <p className="text-sm text-claret" role="alert">{error}</p>}
          <button type="button" disabled={!agree || !conduct || busy} onClick={accept} className="btn-primary w-full sm:w-auto px-6">{busy ? 'Recording…' : 'Accept and continue'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
