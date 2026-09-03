import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AGENCY, ENQUIRY_MODES, NEEDS, SUBJECTS, YEAR_LEVELS, type SubjectKey } from '../../lib/agency';
import { EMAIL_RE } from '../../lib/agencyForms';

type Who = 'my_child' | 'me' | 'someone_else';

type State = {
  who: Who | '';
  year_level: string;
  subjects: SubjectKey[];
  mode: 'online' | 'in_home' | 'either' | '';
  suburb: string;
  need: string;
  parent_name: string;
  email: string;
  phone: string;
  student_first_name: string;
  message: string;
  website: string; // honeypot
};

const EMPTY: State = {
  who: '', year_level: '', subjects: [], mode: '', suburb: '', need: '',
  parent_name: '', email: '', phone: '', student_first_name: '', message: '', website: '',
};

const STEPS = ['Who', 'Year', 'Subjects', 'Lessons', 'Focus', 'Contact'] as const;

function subjectsForYear(year: string): typeof SUBJECTS[number][] {
  if (/^Year (7|8|9|10)$/.test(year)) return SUBJECTS.filter((s) => s.key === 'maths_7_10');
  if (year === 'Year 11') return SUBJECTS.filter((s) => ['maths_standard', 'maths_advanced', 'maths_ext1', 'physics'].includes(s.key));
  if (year === 'Year 12') return SUBJECTS.filter((s) => s.key !== 'maths_7_10');
  return [...SUBJECTS];
}

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

export function EnquiryForm({ initialYear, initialSubjects }: { initialYear?: string; initialSubjects?: SubjectKey[] }) {
  const [state, setState] = useState<State>({
    ...EMPTY,
    year_level: initialYear ?? '',
    subjects: initialSubjects ?? [],
  });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const options = useMemo(() => subjectsForYear(state.year_level), [state.year_level]);

  // Drop subjects that no longer apply when the year changes.
  useEffect(() => {
    const allowed = new Set(options.map((o) => o.key));
    setState((s) => (s.subjects.every((k) => allowed.has(k)) ? s : { ...s, subjects: s.subjects.filter((k) => allowed.has(k)) }));
  }, [options]);

  function set<K extends keyof State>(key: K, value: State[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setErrors((e) => { const { [key]: _drop, ...rest } = e; return rest; });
  }

  function validateStep(i: number): boolean {
    const e: Record<string, string> = {};
    if (i === 0 && !state.who) e.who = 'Choose one.';
    if (i === 1 && !state.year_level) e.year_level = 'Choose a year level.';
    if (i === 2 && state.subjects.length === 0) e.subjects = 'Choose at least one subject.';
    if (i === 3) {
      if (!state.mode) e.mode = 'Choose online, in-home, or either.';
      if (state.mode && state.mode !== 'online' && !state.suburb.trim()) e.suburb = 'Tell us the suburb for in-home lessons.';
    }
    if (i === 5) {
      if (state.parent_name.trim().length < 2) e.parent_name = 'Enter your name.';
      if (!EMAIL_RE.test(state.email.trim())) e.email = 'Enter a valid email address.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!validateStep(5)) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          who: state.who,
          year_level: state.year_level,
          subjects: state.subjects,
          mode: state.mode,
          suburb: state.suburb,
          need: state.need || null,
          parent_name: state.parent_name,
          email: state.email,
          phone: state.phone,
          student_first_name: state.who === 'me' ? null : state.student_first_name,
          message: state.message,
          website: state.website,
          source: readSource(),
          page_path: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload?.fields) {
          setErrors(payload.fields);
          // Jump to the first step with an error.
          const order: Array<[string, number]> = [['who', 0], ['year_level', 1], ['subjects', 2], ['mode', 3], ['suburb', 3], ['parent_name', 5], ['email', 5], ['phone', 5]];
          const first = order.find(([k]) => payload.fields[k]);
          if (first) setStep(first[1]);
        }
        setServerError(
          res.status >= 500 || !payload?.error
            ? `Something went wrong on our side. Please email ${AGENCY.email} and we will sort it out.`
            : payload.error,
        );
        return;
      }
      setDone(true);
    } catch {
      setServerError(`Something went wrong. Please email ${AGENCY.email} instead.`);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-rule bg-surface p-6 md:p-8" role="status">
        <div className="text-2xs uppercase tracking-widest text-forest mb-3">Enquiry sent</div>
        <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-3">Thanks, {state.parent_name.split(' ')[0]}.</h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-2">
          A confirmation is on its way to {state.email}. {AGENCY.founder.firstName} will reply within {AGENCY.policies.replyWithinHours} hours with a suggested tutor and next steps.
        </p>
        <p className="text-sm text-ink-muted leading-relaxed">
          Prefer to talk sooner? Email <a className="text-forest underline underline-offset-2" href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>.
        </p>
        <div className="mt-6"><Link href="/" className="btn-secondary">Back to home</Link></div>
      </div>
    );
  }

  const label = 'block text-xs font-medium text-ink-muted mb-1.5';
  const chip = (active: boolean) =>
    `px-4 py-2.5 rounded-md border text-sm transition-colors duration-100 text-left ${active ? 'bg-forest text-cream border-forest' : 'bg-surface border-rule text-ink hover:bg-ruleSoft'}`;

  return (
    <form onSubmit={submit} className="rounded-md border border-rule bg-surface p-6 md:p-8" noValidate>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 mb-6 text-2xs uppercase tracking-widest" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'text-forest' : i < step ? 'text-ink-muted' : 'text-ink-soft'}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {/* Honeypot — hidden from people, filled by bots. */}
      <div className="hidden" aria-hidden>
        <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={state.website} onChange={(e) => set('website', e.target.value)} /></label>
      </div>

      {step === 0 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-4">Who needs tutoring?</legend>
          <div className="grid sm:grid-cols-3 gap-2">
            {([['my_child', 'My child'], ['me', 'Me'], ['someone_else', 'Someone else']] as Array<[Who, string]>).map(([k, l]) => (
              <button key={k} type="button" className={chip(state.who === k)} onClick={() => set('who', k)} aria-pressed={state.who === k}>{l}</button>
            ))}
          </div>
          {errors.who && <p className="mt-2 text-xs text-claret">{errors.who}</p>}
        </fieldset>
      )}

      {step === 1 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-4">Which year level?</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {YEAR_LEVELS.map((y) => (
              <button key={y} type="button" className={chip(state.year_level === y)} onClick={() => set('year_level', y)} aria-pressed={state.year_level === y}>{y}</button>
            ))}
          </div>
          {errors.year_level && <p className="mt-2 text-xs text-claret">{errors.year_level}</p>}
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-1">Which subjects?</legend>
          <p className="text-xs text-ink-soft mb-4">Choose all that apply.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {options.map((s) => {
              const active = state.subjects.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  className={chip(active)}
                  aria-pressed={active}
                  onClick={() => set('subjects', active ? state.subjects.filter((k) => k !== s.key) : [...state.subjects, s.key])}
                >
                  <span className="block">{s.label}</span>
                  <span className={`block text-2xs mt-0.5 ${active ? 'text-cream/70' : 'text-ink-soft'}`}>{s.years}</span>
                </button>
              );
            })}
          </div>
          {errors.subjects && <p className="mt-2 text-xs text-claret">{errors.subjects}</p>}
          <p className="mt-4 text-xs text-ink-soft">Need something not listed? Mention it on the last step and we will tell you honestly whether we can help.</p>
        </fieldset>
      )}

      {step === 3 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-4">Online or in-home?</legend>
          <div className="grid sm:grid-cols-3 gap-2">
            {ENQUIRY_MODES.map((m) => (
              <button key={m.key} type="button" className={chip(state.mode === m.key)} onClick={() => set('mode', m.key)} aria-pressed={state.mode === m.key}>{m.label}</button>
            ))}
          </div>
          {errors.mode && <p className="mt-2 text-xs text-claret">{errors.mode}</p>}
          {state.mode && state.mode !== 'online' && (
            <div className="mt-5 max-w-sm">
              <label htmlFor="enq-suburb" className={label}>Suburb for in-home lessons</label>
              <input id="enq-suburb" className="input" value={state.suburb} onChange={(e) => set('suburb', e.target.value)} placeholder={AGENCY.serviceArea.homeSuburb} autoComplete="address-level2" />
              {errors.suburb ? <p className="mt-1.5 text-xs text-claret">{errors.suburb}</p> : <p className="mt-1.5 text-2xs text-ink-soft">In-home covers Sydney. {AGENCY.serviceArea.inHomeFocus} are best covered.</p>}
            </div>
          )}
        </fieldset>
      )}

      {step === 4 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-1">What is the main goal?</legend>
          <p className="text-xs text-ink-soft mb-4">Optional, but it helps us pick the right tutor.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {NEEDS.map((n) => (
              <button key={n.key} type="button" className={chip(state.need === n.key)} onClick={() => set('need', state.need === n.key ? '' : n.key)} aria-pressed={state.need === n.key}>{n.label}</button>
            ))}
          </div>
        </fieldset>
      )}

      {step === 5 && (
        <fieldset className="space-y-4">
          <legend className="font-display text-2xl tracking-tighter text-ink mb-2">How do we reach you?</legend>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="enq-name" className={label}>Your name</label>
              <input id="enq-name" className="input" value={state.parent_name} onChange={(e) => set('parent_name', e.target.value)} autoComplete="name" required />
              {errors.parent_name && <p className="mt-1.5 text-xs text-claret">{errors.parent_name}</p>}
            </div>
            {state.who !== 'me' && (
              <div>
                <label htmlFor="enq-student" className={label}>Student's first name <span className="text-ink-soft">(optional)</span></label>
                <input id="enq-student" className="input" value={state.student_first_name} onChange={(e) => set('student_first_name', e.target.value)} autoComplete="off" />
              </div>
            )}
            <div>
              <label htmlFor="enq-email" className={label}>Email</label>
              <input id="enq-email" type="email" className="input" value={state.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" inputMode="email" required />
              {errors.email && <p className="mt-1.5 text-xs text-claret">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="enq-phone" className={label}>Phone <span className="text-ink-soft">(optional)</span></label>
              <input id="enq-phone" type="tel" className="input" value={state.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" inputMode="tel" />
              {errors.phone && <p className="mt-1.5 text-xs text-claret">{errors.phone}</p>}
            </div>
          </div>
          <div>
            <label htmlFor="enq-message" className={label}>Anything else <span className="text-ink-soft">(optional)</span></label>
            <textarea id="enq-message" className="input" rows={4} value={state.message} onChange={(e) => set('message', e.target.value)} placeholder="Current marks, what is going wrong, preferred days and times, anything that helps us choose well." />
          </div>
          <p className="text-2xs text-ink-soft leading-relaxed">
            By sending, you agree to our <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>. We never share your details beyond your matched tutor.
          </p>
        </fieldset>
      )}

      {serverError && <p className="mt-4 text-sm text-claret" role="alert">{serverError}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" onClick={back} disabled={step === 0} className="btn-ghost text-sm disabled:opacity-0">← Back</button>
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className="btn-primary px-6">Continue →</button>
        ) : (
          <button type="submit" disabled={submitting} className="btn-primary px-6">{submitting ? 'Sending…' : 'Send enquiry →'}</button>
        )}
      </div>
    </form>
  );
}
