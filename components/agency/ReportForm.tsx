import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AGENCY } from '../../lib/agency';
import { INCIDENT_CATEGORIES } from '../../lib/incidentForms';
import { EMAIL_RE } from '../../lib/agencyForms';

type State = {
  reporter_name: string; reporter_email: string; reporter_phone: string;
  reporter_role: 'parent' | 'tutor' | 'student' | 'public' | '';
  category: string; occurred_at: string; who: string; description: string; website: string;
};
const EMPTY: State = { reporter_name: '', reporter_email: '', reporter_phone: '', reporter_role: '', category: '', occurred_at: '', who: '', description: '', website: '' };

export function ReportForm() {
  const [s, setS] = useState<State>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function set<K extends keyof State>(k: K, v: State[K]) {
    setS((p) => ({ ...p, [k]: v }));
    setErrors((e) => { const { [k]: _d, ...rest } = e; return rest; });
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (s.reporter_name.trim().length < 2) e.reporter_name = 'Enter your name.';
    if (!EMAIL_RE.test(s.reporter_email.trim())) e.reporter_email = 'Enter a valid email address so we can reply.';
    if (!s.category) e.category = 'Choose what this is about.';
    if (s.description.trim().length < 10) e.description = 'Tell us what happened.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSubmitting(true); setServerError(null);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...s, reporter_role: s.reporter_role || 'public', occurred_at: s.occurred_at || null }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload?.fields) setErrors(payload.fields);
        setServerError(res.status >= 500 || !payload?.error ? `Something went wrong on our side. Please email ${AGENCY.email}.` : payload.error);
        return;
      }
      setDone(true);
    } catch {
      setServerError(`Something went wrong. Please email ${AGENCY.email}.`);
    } finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <div className="rounded-md border border-rule bg-surface p-6 md:p-8" role="status">
        <div className="text-2xs uppercase tracking-widest text-forest mb-3">Report received</div>
        <h2 className="font-display text-2xl tracking-tighter text-ink mb-3">Thank you for telling us.</h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-2">Your report has gone directly to {AGENCY.founder.name}, who will reply within one business day at {s.reporter_email}.</p>
        <p className="text-sm text-ink-muted leading-relaxed">If a child is in immediate danger, call 000. The NSW Child Protection Helpline is 132 111.</p>
      </div>
    );
  }

  const label = 'block text-xs font-medium text-ink-muted mb-1.5';
  const err = (k: keyof State) => (errors[k] ? <p className="mt-1.5 text-xs text-claret">{errors[k]}</p> : null);
  const chip = (active: boolean) => `px-4 py-2.5 rounded-md border text-sm text-left transition-colors duration-100 ${active ? 'bg-forest text-cream border-forest' : 'bg-surface border-rule text-ink hover:bg-ruleSoft'}`;

  return (
    <form onSubmit={submit} className="rounded-md border border-rule bg-surface p-6 md:p-8 space-y-6" noValidate>
      <div className="hidden" aria-hidden><label>Website<input type="text" tabIndex={-1} autoComplete="off" value={s.website} onChange={(e) => set('website', e.target.value)} /></label></div>
      <fieldset>
        <legend className="font-display text-xl tracking-tighter text-ink mb-3">What is this about?</legend>
        <div className="grid sm:grid-cols-2 gap-2">
          {INCIDENT_CATEGORIES.map((c) => (
            <button key={c.key} type="button" className={chip(s.category === c.key)} aria-pressed={s.category === c.key} onClick={() => set('category', c.key)}>{c.label}</button>
          ))}
        </div>
        {err('category')}
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="font-display text-xl tracking-tighter text-ink mb-3">What happened?</legend>
        <div>
          <label htmlFor="rp-desc" className={label}>Describe it in your own words</label>
          <textarea id="rp-desc" className="input" rows={6} value={s.description} onChange={(e) => set('description', e.target.value)} placeholder="Who, what, where. As much or as little as you want to share now. We will follow up." />
          {err('description')}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rp-who" className={label}>Who is it about <span className="text-ink-soft">(optional)</span></label>
            <input id="rp-who" className="input" value={s.who} onChange={(e) => set('who', e.target.value)} placeholder="Tutor or student name" />
          </div>
          <div>
            <label htmlFor="rp-when" className={label}>When <span className="text-ink-soft">(optional)</span></label>
            <input id="rp-when" type="date" className="input" value={s.occurred_at} onChange={(e) => set('occurred_at', e.target.value)} />
            {err('occurred_at')}
          </div>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="font-display text-xl tracking-tighter text-ink mb-3">How do we reach you?</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rp-name" className={label}>Your name</label>
            <input id="rp-name" className="input" value={s.reporter_name} onChange={(e) => set('reporter_name', e.target.value)} autoComplete="name" />
            {err('reporter_name')}
          </div>
          <div>
            <label htmlFor="rp-email" className={label}>Email</label>
            <input id="rp-email" type="email" className="input" value={s.reporter_email} onChange={(e) => set('reporter_email', e.target.value)} autoComplete="email" />
            {err('reporter_email')}
          </div>
          <div>
            <label htmlFor="rp-phone" className={label}>Phone <span className="text-ink-soft">(optional)</span></label>
            <input id="rp-phone" type="tel" className="input" value={s.reporter_phone} onChange={(e) => set('reporter_phone', e.target.value)} autoComplete="tel" />
            {err('reporter_phone')}
          </div>
          <div>
            <span className={label}>You are</span>
            <div className="grid grid-cols-2 gap-2">
              {([['parent', 'A parent'], ['student', 'A student'], ['tutor', 'A tutor'], ['public', 'Someone else']] as Array<[State['reporter_role'], string]>).map(([k, l]) => (
                <button key={k} type="button" className={chip(s.reporter_role === k)} aria-pressed={s.reporter_role === k} onClick={() => set('reporter_role', k)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </fieldset>
      {serverError && <p className="text-sm text-claret" role="alert">{serverError}</p>}
      <div className="pt-2 border-t border-rule">
        <button type="submit" disabled={submitting} className="btn-primary px-6 w-full sm:w-auto">{submitting ? 'Sending…' : 'Send report'}</button>
        <p className="mt-3 text-2xs text-ink-soft">Reports go straight to the founder and are kept confidential. See the <Link href="/child-safe" className="underline underline-offset-2">Child Safe Policy</Link>.</p>
      </div>
    </form>
  );
}
