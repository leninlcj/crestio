import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AGENCY, SUBJECTS, YEAR_LEVELS, NEEDS, subjectsForYearLevel, type Subject, type SubjectKey, type SubjectTier } from '../../lib/agency';
import { EMAIL_RE } from '../../lib/agencyForms';
import { enquiryCopy, type EnquiryLang } from '../../lib/enquiryCopy';
import { currentSource, sessionStorageOrNull } from '../../lib/attribution';

type Who = 'my_child' | 'me' | 'someone_else';
type Mode = 'online' | 'in_home' | 'either';

type State = {
  who: Who | '';
  year_level: string;
  subjects: SubjectKey[];
  mode: Mode | '';
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

function subjectsForYear(year: string): Subject[] {
  return year ? subjectsForYearLevel(year) : [...SUBJECTS];
}

const TIER_ORDER: SubjectTier[] = ['core', 'request', 'ib'];

export type EnquiryFormProps = {
  initialYear?: string;
  initialSubjects?: SubjectKey[];
  initialMode?: Mode;
  initialSuburb?: string;
  initialMessage?: string;   // e.g. the name of a program the family is asking about
  lang?: EnquiryLang;
};

export function EnquiryForm({ initialYear, initialSubjects, initialMode, initialSuburb, initialMessage, lang = 'en' }: EnquiryFormProps) {
  const c = enquiryCopy(lang);
  const [state, setState] = useState<State>({
    ...EMPTY,
    year_level: initialYear ?? '',
    subjects: initialSubjects ?? [],
    mode: initialMode ?? '',
    suburb: initialSuburb ?? '',
    message: initialMessage ?? '',
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
    if (i === 0 && !state.who) e.who = c.who.error;
    if (i === 1 && !state.year_level) e.year_level = c.year.error;
    if (i === 2 && state.subjects.length === 0) e.subjects = c.subjects.error;
    if (i === 3) {
      if (!state.mode) e.mode = c.lessons.error;
      if (state.mode && state.mode !== 'online' && !state.suburb.trim()) e.suburb = c.lessons.suburbError;
    }
    if (i === 5) {
      if (state.parent_name.trim().length < 2) e.parent_name = c.contact.nameError;
      if (!EMAIL_RE.test(state.email.trim())) e.email = c.contact.emailError;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, c.steps.length - 1));
  }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  // Server-side field errors arrive in English; show the local wording for the
  // fields we know, and the server's text for anything else.
  function localiseFieldErrors(fields: Record<string, string>): Record<string, string> {
    const map: Record<string, string> = {
      who: c.who.error, year_level: c.year.error, subjects: c.subjects.error, mode: c.lessons.error, suburb: c.lessons.suburbError,
      parent_name: c.contact.nameError, email: c.contact.emailError, phone: c.contact.phoneError,
    };
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) out[k] = lang === 'en' ? v : (map[k] ?? v);
    return out;
  }

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
          source: typeof window === 'undefined' ? null : currentSource(window, sessionStorageOrNull(), lang),
          page_path: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload?.fields) {
          setErrors(localiseFieldErrors(payload.fields));
          // Jump to the first step with an error.
          const order: Array<[string, number]> = [['who', 0], ['year_level', 1], ['subjects', 2], ['mode', 3], ['suburb', 3], ['parent_name', 5], ['email', 5], ['phone', 5]];
          const first = order.find(([k]) => payload.fields[k]);
          if (first) setStep(first[1]);
        }
        setServerError(res.status >= 500 || !payload?.error ? c.serverError : (lang === 'en' ? payload.error : c.serverError));
        return;
      }
      setDone(true);
    } catch {
      setServerError(c.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-md border border-rule bg-surface p-6 md:p-8" role="status">
        <div className="text-2xs uppercase tracking-widest text-forest mb-3">{c.done.kicker}</div>
        <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-3">{c.done.heading(state.parent_name.split(' ')[0])}</h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-2">{c.done.body(state.email)}</p>
        <p className="text-sm text-ink-muted leading-relaxed">
          {c.done.sooner} <a className="text-forest underline underline-offset-2" href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>.
        </p>
        <div className="mt-6"><Link href={lang === 'es' ? '/es' : '/'} className="btn-secondary">{c.buttons.home}</Link></div>
      </div>
    );
  }

  const label = 'block text-xs font-medium text-ink-muted mb-1.5';
  const chip = (active: boolean) =>
    `px-4 py-2.5 rounded-md border text-sm transition-colors duration-100 text-left ${active ? 'bg-forest text-cream border-forest' : 'bg-surface border-rule text-ink hover:bg-ruleSoft'}`;
  const yearLabel = (y: string) => (y === 'University' ? c.year.university : y === 'Other' ? c.year.other : lang === 'es' ? y.replace('Year ', 'Año ') : y);
  const yearsLabel = (years: string) => (lang === 'es' ? years.replace('Years ', 'Años ').replace('Year ', 'Año ') : years);
  const consentParts = c.contact.consent.split(c.contact.privacyLink);

  return (
    <form onSubmit={submit} className="rounded-md border border-rule bg-surface p-6 md:p-8" noValidate lang={lang}>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 mb-6 text-2xs uppercase tracking-widest" aria-label="Progress">
        {c.steps.map((s, i) => (
          <li key={s} className={i === step ? 'text-forest' : i < step ? 'text-ink-muted' : 'text-ink-soft'}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="hidden" aria-hidden>
        <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={state.website} onChange={(e) => set('website', e.target.value)} /></label>
      </div>

      {step === 0 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-4">{c.who.legend}</legend>
          <div className="grid sm:grid-cols-3 gap-2">
            {c.who.options.map(([k, l]) => (
              <button key={k} type="button" className={chip(state.who === k)} onClick={() => set('who', k)} aria-pressed={state.who === k}>{l}</button>
            ))}
          </div>
          {errors.who && <p className="mt-2 text-xs text-claret">{errors.who}</p>}
        </fieldset>
      )}

      {step === 1 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-4">{c.year.legend}</legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {YEAR_LEVELS.map((y) => (
              <button key={y} type="button" className={chip(state.year_level === y)} onClick={() => set('year_level', y)} aria-pressed={state.year_level === y}>{yearLabel(y)}</button>
            ))}
          </div>
          {errors.year_level && <p className="mt-2 text-xs text-claret">{errors.year_level}</p>}
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-1">{c.subjects.legend}</legend>
          <p className="text-xs text-ink-soft mb-4">{c.subjects.hint}</p>
          {TIER_ORDER.map((tier) => {
            const group = options.filter((s) => s.tier === tier);
            if (group.length === 0) return null;
            const showHeading = options.some((s) => s.tier !== tier);
            return (
              <div key={tier} className={showHeading ? 'mb-5' : ''}>
                {showHeading && <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">{c.subjects.tiers[tier]}</div>}
                <div className="grid sm:grid-cols-2 gap-2">
                  {group.map((s) => {
                    const active = state.subjects.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        className={chip(active)}
                        aria-pressed={active}
                        onClick={() => set('subjects', active ? state.subjects.filter((k) => k !== s.key) : [...state.subjects, s.key])}
                      >
                        <span className="block">{c.subjects.labels[s.key]}</span>
                        <span className={`block text-2xs mt-0.5 ${active ? 'text-cream/70' : 'text-ink-soft'}`}>{yearsLabel(s.years)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {errors.subjects && <p className="mt-2 text-xs text-claret">{errors.subjects}</p>}
          <p className="mt-4 text-xs text-ink-soft">{c.subjects.notListed}</p>
        </fieldset>
      )}

      {step === 3 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-4">{c.lessons.legend}</legend>
          <div className="grid sm:grid-cols-3 gap-2">
            {c.lessons.modes.map(([k, l]) => (
              <button key={k} type="button" className={chip(state.mode === k)} onClick={() => set('mode', k)} aria-pressed={state.mode === k}>{l}</button>
            ))}
          </div>
          {errors.mode && <p className="mt-2 text-xs text-claret">{errors.mode}</p>}
          {state.mode && state.mode !== 'online' && (
            <div className="mt-5 max-w-sm">
              <label htmlFor="enq-suburb" className={label}>{c.lessons.suburbLabel}</label>
              <input id="enq-suburb" className="input" value={state.suburb} onChange={(e) => set('suburb', e.target.value)} placeholder={AGENCY.serviceArea.homeSuburb} autoComplete="address-level2" />
              {errors.suburb ? <p className="mt-1.5 text-xs text-claret">{errors.suburb}</p> : <p className="mt-1.5 text-2xs text-ink-soft">{c.lessons.suburbHint}</p>}
            </div>
          )}
        </fieldset>
      )}

      {step === 4 && (
        <fieldset>
          <legend className="font-display text-2xl tracking-tighter text-ink mb-1">{c.focus.legend}</legend>
          <p className="text-xs text-ink-soft mb-4">{c.focus.hint}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {NEEDS.map((n) => (
              <button key={n.key} type="button" className={chip(state.need === n.key)} onClick={() => set('need', state.need === n.key ? '' : n.key)} aria-pressed={state.need === n.key}>{c.focus.labels[n.key]}</button>
            ))}
          </div>
        </fieldset>
      )}

      {step === 5 && (
        <fieldset className="space-y-4">
          <legend className="font-display text-2xl tracking-tighter text-ink mb-2">{c.contact.legend}</legend>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="enq-name" className={label}>{c.contact.name}</label>
              <input id="enq-name" className="input" value={state.parent_name} onChange={(e) => set('parent_name', e.target.value)} autoComplete="name" required />
              {errors.parent_name && <p className="mt-1.5 text-xs text-claret">{errors.parent_name}</p>}
            </div>
            {state.who !== 'me' && (
              <div>
                <label htmlFor="enq-student" className={label}>{c.contact.student} <span className="text-ink-soft">{c.contact.optional}</span></label>
                <input id="enq-student" className="input" value={state.student_first_name} onChange={(e) => set('student_first_name', e.target.value)} autoComplete="off" />
              </div>
            )}
            <div>
              <label htmlFor="enq-email" className={label}>{c.contact.email}</label>
              <input id="enq-email" type="email" className="input" value={state.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" inputMode="email" required />
              {errors.email && <p className="mt-1.5 text-xs text-claret">{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="enq-phone" className={label}>{c.contact.phone} <span className="text-ink-soft">{c.contact.optional}</span></label>
              <input id="enq-phone" type="tel" className="input" value={state.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" inputMode="tel" />
              {errors.phone && <p className="mt-1.5 text-xs text-claret">{errors.phone}</p>}
            </div>
          </div>
          <div>
            <label htmlFor="enq-message" className={label}>{c.contact.message} <span className="text-ink-soft">{c.contact.optional}</span></label>
            <textarea id="enq-message" className="input" rows={4} value={state.message} onChange={(e) => set('message', e.target.value)} placeholder={c.contact.messagePlaceholder} />
          </div>
          <p className="text-2xs text-ink-soft leading-relaxed">
            {consentParts[0]}<Link href="/privacy" className="underline underline-offset-2">{c.contact.privacyLink}</Link>{consentParts[1] ?? ''}
          </p>
        </fieldset>
      )}

      {serverError && <p className="mt-4 text-sm text-claret" role="alert">{serverError}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" onClick={back} disabled={step === 0} className="btn-ghost text-sm disabled:opacity-0">← {c.buttons.back}</button>
        {step < c.steps.length - 1 ? (
          <button type="button" onClick={next} className="btn-primary px-6">{c.buttons.next} →</button>
        ) : (
          <button type="submit" disabled={submitting} className="btn-primary px-6">{submitting ? `${c.buttons.sending}…` : `${c.buttons.send} →`}</button>
        )}
      </div>
    </form>
  );
}
