import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AGENCY, SUBJECTS, TUTOR_MODES, WWCC_STATUSES, type SubjectKey } from '../../lib/agency';
import { EMAIL_RE } from '../../lib/agencyForms';

type State = {
  full_name: string;
  email: string;
  phone: string;
  suburb: string;
  subjects: SubjectKey[];
  qualifications: string;
  wwcc_status: string;
  wwcc_number: string;
  abn: string;
  mode: string;
  availability: string;
  has_transport: '' | 'yes' | 'no';
  experience: string;
  cv_url: string;
  message: string;
  website: string; // honeypot
};

const EMPTY: State = {
  full_name: '', email: '', phone: '', suburb: '', subjects: [], qualifications: '', wwcc_status: '', wwcc_number: '',
  abn: '', mode: '', availability: '', has_transport: '', experience: '', cv_url: '', message: '', website: '',
};

function readSource(): string | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const utm = p.get('utm_source') || p.get('src') || p.get('ref');
  if (utm) return utm.slice(0, 120);
  try {
    const ref = document.referrer ? new URL(document.referrer).hostname : '';
    if (ref && !ref.endsWith('crestio.ai')) return `referrer:${ref}`.slice(0, 120);
  } catch { /* ignore */ }
  return 'direct';
}

export function TutorApplicationForm() {
  const [s, setS] = useState<State>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function set<K extends keyof State>(key: K, value: State[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
    setErrors((e) => { const { [key]: _drop, ...rest } = e; return rest; });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (s.full_name.trim().length < 2) e.full_name = 'Enter your full name.';
    if (!EMAIL_RE.test(s.email.trim())) e.email = 'Enter a valid email address.';
    if (s.phone.replace(/\D/g, '').length < 8) e.phone = 'Enter a valid phone number.';
    if (!s.suburb.trim()) e.suburb = 'Enter your suburb.';
    if (s.subjects.length === 0) e.subjects = 'Choose at least one subject you can tutor.';
    if (s.qualifications.trim().length < 3) e.qualifications = 'Tell us your ATAR, HSC results or university course.';
    if (!s.wwcc_status) e.wwcc_status = 'Tell us about your Working With Children Check.';
    if (!s.mode) e.mode = 'Choose online, in-home or both.';
    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = document.querySelector('[data-error="true"]') as HTMLElement | null;
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return Object.keys(e).length === 0;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch('/api/tutor-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: s.full_name,
          email: s.email,
          phone: s.phone,
          suburb: s.suburb,
          subjects: s.subjects,
          qualifications: s.qualifications,
          wwcc_status: s.wwcc_status,
          wwcc_number: s.wwcc_number,
          abn: s.abn,
          mode: s.mode,
          availability: s.availability,
          has_transport: s.has_transport === '' ? null : s.has_transport === 'yes',
          experience: s.experience,
          cv_url: s.cv_url,
          message: s.message,
          website: s.website,
          source: readSource(),
          page_path: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload?.fields) setErrors(payload.fields);
        setServerError(
          res.status >= 500 || !payload?.error
            ? `Something went wrong on our side. Please email ${AGENCY.email} and we will sort it out.`
            : payload.error,
        );
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setServerError(`Something went wrong. Please email ${AGENCY.email} instead.`);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-rule bg-surface p-6 md:p-8" role="status">
        <div className="text-2xs uppercase tracking-widest text-forest mb-3">Application sent</div>
        <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-3">Thanks, {s.full_name.split(' ')[0]}.</h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-2">
          A confirmation is on its way to {s.email}. {AGENCY.founder.firstName} reads every application personally. If your subjects and results are a match, you will hear back within a week with a time for a short video call.
        </p>
        <p className="text-sm text-ink-muted leading-relaxed">
          What happens next: a 15-minute call, a short subject test, a Working With Children Check we verify, and a 20-minute practice lesson.
        </p>
        <div className="mt-6"><Link href="/tutors" className="btn-secondary">Back to tutoring with Crestio</Link></div>
      </div>
    );
  }

  const label = 'block text-xs font-medium text-ink-muted mb-1.5';
  const err = (k: keyof State) => (errors[k] ? <p className="mt-1.5 text-xs text-claret">{errors[k]}</p> : null);
  const chip = (active: boolean) =>
    `px-4 py-2.5 rounded-md border text-sm transition-colors duration-100 text-left ${active ? 'bg-forest text-cream border-forest' : 'bg-surface border-rule text-ink hover:bg-ruleSoft'}`;

  return (
    <form onSubmit={submit} className="rounded-md border border-rule bg-surface p-6 md:p-8 space-y-8" noValidate>
      <div className="hidden" aria-hidden>
        <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={s.website} onChange={(e) => set('website', e.target.value)} /></label>
      </div>

      <fieldset className="space-y-4">
        <legend className="font-display text-2xl tracking-tighter text-ink mb-2">About you</legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <div data-error={!!errors.full_name}>
            <label htmlFor="ta-name" className={label}>Full name</label>
            <input id="ta-name" className="input" value={s.full_name} onChange={(e) => set('full_name', e.target.value)} autoComplete="name" required />
            {err('full_name')}
          </div>
          <div data-error={!!errors.email}>
            <label htmlFor="ta-email" className={label}>Email</label>
            <input id="ta-email" type="email" className="input" value={s.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" inputMode="email" required />
            {err('email')}
          </div>
          <div data-error={!!errors.phone}>
            <label htmlFor="ta-phone" className={label}>Phone</label>
            <input id="ta-phone" type="tel" className="input" value={s.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" inputMode="tel" required />
            {err('phone')}
          </div>
          <div data-error={!!errors.suburb}>
            <label htmlFor="ta-suburb" className={label}>Suburb</label>
            <input id="ta-suburb" className="input" value={s.suburb} onChange={(e) => set('suburb', e.target.value)} autoComplete="address-level2" required />
            {err('suburb')}
          </div>
        </div>
      </fieldset>

      <fieldset data-error={!!errors.subjects}>
        <legend className="font-display text-2xl tracking-tighter text-ink mb-1">What can you tutor?</legend>
        <p className="text-xs text-ink-soft mb-4">Choose every subject you could teach to a strong standard.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {SUBJECTS.map((sub) => {
            const active = s.subjects.includes(sub.key);
            return (
              <button key={sub.key} type="button" className={chip(active)} aria-pressed={active}
                onClick={() => set('subjects', active ? s.subjects.filter((k) => k !== sub.key) : [...s.subjects, sub.key])}>
                <span className="block">{sub.label}</span>
                <span className={`block text-2xs mt-0.5 ${active ? 'text-cream/70' : 'text-ink-soft'}`}>{sub.years}</span>
              </button>
            );
          })}
        </div>
        {err('subjects')}
        <div className="mt-4" data-error={!!errors.qualifications}>
          <label htmlFor="ta-quals" className={label}>Your results — ATAR, HSC marks, university course and year</label>
          <textarea id="ta-quals" className="input" rows={3} value={s.qualifications} onChange={(e) => set('qualifications', e.target.value)} placeholder="e.g. ATAR 96.4 (2024). Maths Ext 1: 92, Physics: 89. 2nd-year Electrical Engineering, Macquarie." required />
          {err('qualifications')}
        </div>
        <div className="mt-4">
          <label htmlFor="ta-exp" className={label}>Tutoring or teaching experience <span className="text-ink-soft">(optional)</span></label>
          <textarea id="ta-exp" className="input" rows={3} value={s.experience} onChange={(e) => set('experience', e.target.value)} placeholder="Where, how long, which subjects. None is fine — say so." />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-2xl tracking-tighter text-ink mb-2">Checks</legend>
        <div data-error={!!errors.wwcc_status}>
          <span className={label}>Do you have a NSW Working With Children Check (paid-worker type)?</span>
          <div className="grid sm:grid-cols-3 gap-2">
            {WWCC_STATUSES.map((w) => (
              <button key={w.key} type="button" className={chip(s.wwcc_status === w.key)} onClick={() => set('wwcc_status', w.key)} aria-pressed={s.wwcc_status === w.key}>{w.label}</button>
            ))}
          </div>
          {err('wwcc_status')}
          <p className="mt-2 text-2xs text-ink-soft">You must be {AGENCY.policies.minimumTutorAge} or older. A volunteer WWCC is not valid for paid tutoring; the paid-worker check costs $112 for five years through Service NSW.</p>
        </div>
        {s.wwcc_status === 'current' && (
          <div className="max-w-sm" data-error={!!errors.wwcc_number}>
            <label htmlFor="ta-wwcc" className={label}>WWCC number <span className="text-ink-soft">(optional now, required before your first student)</span></label>
            <input id="ta-wwcc" className="input" value={s.wwcc_number} onChange={(e) => set('wwcc_number', e.target.value)} placeholder="WWC1234567E" autoComplete="off" />
            {err('wwcc_number')}
          </div>
        )}
        <div className="max-w-sm" data-error={!!errors.abn}>
          <label htmlFor="ta-abn" className={label}>ABN <span className="text-ink-soft">(optional — tutors are engaged as contractors; we can help you get one)</span></label>
          <input id="ta-abn" className="input" value={s.abn} onChange={(e) => set('abn', e.target.value)} inputMode="numeric" autoComplete="off" />
          {err('abn')}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-display text-2xl tracking-tighter text-ink mb-2">Availability</legend>
        <div data-error={!!errors.mode}>
          <span className={label}>Online or in-home?</span>
          <div className="grid sm:grid-cols-3 gap-2">
            {TUTOR_MODES.map((m) => (
              <button key={m.key} type="button" className={chip(s.mode === m.key)} onClick={() => set('mode', m.key)} aria-pressed={s.mode === m.key}>{m.label}</button>
            ))}
          </div>
          {err('mode')}
        </div>
        {s.mode && s.mode !== 'online' && (
          <div>
            <span className={label}>Do you have your own transport for in-home lessons?</span>
            <div className="grid grid-cols-2 gap-2 max-w-sm">
              <button type="button" className={chip(s.has_transport === 'yes')} onClick={() => set('has_transport', 'yes')} aria-pressed={s.has_transport === 'yes'}>Yes</button>
              <button type="button" className={chip(s.has_transport === 'no')} onClick={() => set('has_transport', 'no')} aria-pressed={s.has_transport === 'no'}>No, public transport</button>
            </div>
          </div>
        )}
        <div>
          <label htmlFor="ta-avail" className={label}>When are you generally available? <span className="text-ink-soft">(optional)</span></label>
          <textarea id="ta-avail" className="input" rows={2} value={s.availability} onChange={(e) => set('availability', e.target.value)} placeholder="e.g. Weekday afternoons after 4pm, Saturday mornings. Free from mid-November." />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div data-error={!!errors.cv_url}>
            <label htmlFor="ta-cv" className={label}>Link to a CV or LinkedIn <span className="text-ink-soft">(optional)</span></label>
            <input id="ta-cv" type="url" className="input" value={s.cv_url} onChange={(e) => set('cv_url', e.target.value)} placeholder="https://" autoComplete="url" />
            {err('cv_url')}
          </div>
          <div>
            <label htmlFor="ta-msg" className={label}>Anything else <span className="text-ink-soft">(optional)</span></label>
            <input id="ta-msg" className="input" value={s.message} onChange={(e) => set('message', e.target.value)} />
          </div>
        </div>
      </fieldset>

      {serverError && <p className="text-sm text-claret" role="alert">{serverError}</p>}

      <div className="pt-2 border-t border-rule">
        <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto px-6">{submitting ? 'Sending…' : 'Send application →'}</button>
        <p className="mt-3 text-2xs text-ink-soft leading-relaxed">
          By sending, you agree to our <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>. We verify Working With Children Checks with the NSW Office of the Children's Guardian.
        </p>
      </div>
    </form>
  );
}
