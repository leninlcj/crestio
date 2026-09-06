import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { AGENCY, BEST_TIMES, YEAR_LEVELS, subjectsForYearLevel, type BestTimeKey, type SubjectKey, type SubjectTier } from '../../lib/agency';
import { EMAIL_RE, normalisePhone } from '../../lib/agencyForms';
import { callCopy, enquiryCopy, type EnquiryLang } from '../../lib/enquiryCopy';
import { classByKey, type ClassKey } from '../../lib/classes';
import { currentSource, sessionStorageOrNull } from '../../lib/attribution';

// The phone-first form. Name, mobile, year, a good time; everything else is
// optional and worked out on the call. Posts to /api/enquiries with
// preferred_contact = 'call'. Mirrors the EnquiryForm's look so the two feel
// like one system.

export type RequestCallFormProps = {
  lang?: EnquiryLang;
  initialYear?: string;
  initialSubjects?: SubjectKey[];
  /** Registering interest in a group class: fixes the year and names the class. */
  classKey?: ClassKey;
  compact?: boolean;
};

type State = {
  parent_name: string;
  phone: string;
  year_level: string;
  subjects: SubjectKey[];
  best_time: BestTimeKey;
  email: string;
  suburb: string;
  message: string;
  website: string; // honeypot
};

const TIER_ORDER: SubjectTier[] = ['core', 'request', 'ib'];

export function RequestCallForm({ lang = 'en', initialYear, initialSubjects, classKey, compact = false }: RequestCallFormProps) {
  const c = callCopy(lang);
  const ec = enquiryCopy(lang);
  const groupClass = classByKey(classKey);
  const [state, setState] = useState<State>({
    parent_name: '', phone: '', year_level: groupClass?.enquiryYear ?? initialYear ?? '', subjects: initialSubjects ?? [], best_time: 'any', email: '', suburb: '', message: '', website: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showSubjects, setShowSubjects] = useState(!compact && !groupClass);

  const options = useMemo(() => (state.year_level ? subjectsForYearLevel(state.year_level) : []), [state.year_level]);

  function set<K extends keyof State>(key: K, value: State[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setErrors((e) => { const { [key]: _drop, ...rest } = e; return rest; });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (state.parent_name.trim().length < 2) e.parent_name = c.nameError;
    if (!normalisePhone(state.phone)) e.phone = c.phoneError;
    if (!state.year_level) e.year_level = c.yearError;
    if (state.email.trim() && !EMAIL_RE.test(state.email.trim())) e.email = c.emailError;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    try {
      const allowed = new Set(options.map((o) => o.key));
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_contact: 'call',
          who: 'my_child',
          parent_name: state.parent_name,
          phone: state.phone,
          email: state.email.trim() || null,
          year_level: state.year_level,
          subjects: state.subjects.filter((k) => allowed.has(k)),
          best_time: state.best_time,
          suburb: state.suburb,
          mode: 'either',
          message: state.message,
          class_key: groupClass?.key ?? null,
          website: state.website,
          source: typeof window === 'undefined' ? null : currentSource(window, sessionStorageOrNull(), lang),
          page_path: typeof window !== 'undefined' ? window.location.pathname : null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload?.fields) {
          const map: Record<string, string> = { parent_name: c.nameError, phone: c.phoneError, year_level: c.yearError, email: c.emailError };
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(payload.fields as Record<string, string>)) out[k] = lang === 'en' ? v : (map[k] ?? v);
          setErrors(out);
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

  const label = 'block text-xs font-medium text-ink-muted mb-1.5';
  const hint = 'mt-1.5 text-2xs text-ink-soft';
  const err = 'mt-1.5 text-xs text-claret';
  const chip = (active: boolean) =>
    `px-3 py-2 rounded-md border text-sm transition-colors duration-100 text-left ${active ? 'bg-forest text-cream border-forest' : 'bg-surface border-rule text-ink hover:bg-ruleSoft'}`;
  const yearLabel = (y: string) => (y === 'University' ? ec.year.university : y === 'Other' ? ec.year.other : lang === 'es' ? y.replace('Year ', 'Año ') : y);
  const consentParts = c.consent.split(c.privacyLink);

  if (done) {
    const first = state.parent_name.trim().split(/\s+/)[0] || '';
    return (
      <div className="rounded-md border border-rule bg-surface p-6 md:p-8" role="status">
        <div className="text-2xs uppercase tracking-widest text-forest mb-3">{c.done.kicker}</div>
        <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-3">{c.done.heading(first)}</h2>
        <p className="text-sm text-ink leading-relaxed mb-2">{c.done.body(state.phone.trim())}</p>
        {state.email.trim() && <p className="text-sm text-ink-muted leading-relaxed mb-2">{c.done.emailNote(state.email.trim())}</p>}
        {groupClass && <p className="text-sm text-ink-muted leading-relaxed">{c.done.classNote(groupClass.title)}</p>}
        <div className="mt-6"><Link href={lang === 'es' ? '/es' : '/'} className="btn-secondary">{c.done.home}</Link></div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-rule bg-surface p-6 md:p-8" noValidate lang={lang} aria-label={c.kicker}>
      {!compact && (
        <div className="mb-6">
          <div className="text-2xs uppercase tracking-widest text-forest mb-2">{c.kicker}</div>
          <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-2">{c.heading}</h2>
          <p className="text-sm text-ink-muted leading-relaxed">{groupClass ? c.classLead(groupClass.title) : c.lead}</p>
        </div>
      )}
      {compact && groupClass && <p className="text-sm text-ink-muted leading-relaxed mb-5">{c.classLead(groupClass.title)}</p>}

      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="hidden" aria-hidden>
        <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={state.website} onChange={(e) => set('website', e.target.value)} /></label>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="call-name" className={label}>{c.name}</label>
          <input id="call-name" className="input" value={state.parent_name} onChange={(e) => set('parent_name', e.target.value)} autoComplete="name" />
          {errors.parent_name && <p className={err}>{errors.parent_name}</p>}
        </div>
        <div>
          <label htmlFor="call-phone" className={label}>{c.phone}</label>
          <input id="call-phone" className="input num tabular" type="tel" inputMode="tel" value={state.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="04" />
          {errors.phone ? <p className={err}>{errors.phone}</p> : <p className={hint}>{c.phoneHint}</p>}
        </div>
      </div>

      <div className="mt-5">
        <label className={label} id="call-year-label">{c.year}</label>
        {groupClass ? (
          <div className="text-sm text-ink" aria-labelledby="call-year-label">{groupClass.level}</div>
        ) : (
          <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="call-year-label">
            {YEAR_LEVELS.map((y) => (
              <button key={y} type="button" className={chip(state.year_level === y)} aria-pressed={state.year_level === y} onClick={() => set('year_level', y)}>{yearLabel(y)}</button>
            ))}
          </div>
        )}
        {errors.year_level && <p className={err}>{errors.year_level}</p>}
      </div>

      {!groupClass && state.year_level && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-4">
            <label className={label} id="call-subjects-label">{c.subjects}</label>
            {!showSubjects && (
              <button type="button" className="text-xs text-forest underline underline-offset-2 mb-1.5" onClick={() => setShowSubjects(true)}>{lang === 'es' ? 'Elegir materias' : 'Choose subjects'}</button>
            )}
          </div>
          {showSubjects ? (
            <div role="group" aria-labelledby="call-subjects-label">
              {TIER_ORDER.map((tier) => {
                const group = options.filter((s) => s.tier === tier);
                if (group.length === 0) return null;
                const showHeading = options.some((s) => s.tier !== tier);
                return (
                  <div key={tier} className={showHeading ? 'mb-3' : ''}>
                    {showHeading && <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">{ec.subjects.tiers[tier]}</div>}
                    <div className="flex flex-wrap gap-2">
                      {group.map((s) => {
                        const active = state.subjects.includes(s.key);
                        return (
                          <button key={s.key} type="button" className={chip(active)} aria-pressed={active} onClick={() => set('subjects', active ? state.subjects.filter((k) => k !== s.key) : [...state.subjects, s.key])}>
                            {ec.subjects.labels[s.key]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <p className={hint}>{c.subjectsHint}</p>
            </div>
          ) : (
            <p className={hint}>{c.subjectsHint}</p>
          )}
        </div>
      )}

      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="call-best-time" className={label}>{c.bestTime}</label>
          <select id="call-best-time" className="input" value={state.best_time} onChange={(e) => set('best_time', e.target.value as BestTimeKey)}>
            {BEST_TIMES.map((b) => <option key={b.key} value={b.key}>{c.bestTimes[b.key]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="call-email" className={label}>{c.email}</label>
          <input id="call-email" className="input" type="email" inputMode="email" value={state.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
          {errors.email ? <p className={err}>{errors.email}</p> : <p className={hint}>{c.emailHint}</p>}
        </div>
      </div>

      {!compact && (
        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="call-suburb" className={label}>{c.suburb}</label>
            <input id="call-suburb" className="input" value={state.suburb} onChange={(e) => set('suburb', e.target.value)} placeholder={AGENCY.serviceArea.homeSuburb} autoComplete="address-level2" />
            <p className={hint}>{c.suburbHint}</p>
          </div>
          <div>
            <label htmlFor="call-message" className={label}>{c.message}</label>
            <textarea id="call-message" className="input" rows={2} value={state.message} onChange={(e) => set('message', e.target.value)} placeholder={c.messagePlaceholder} />
          </div>
        </div>
      )}

      {serverError && <p className="mt-5 text-sm text-claret" role="alert">{serverError}</p>}

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <button type="submit" className="btn-primary px-6 w-full sm:w-auto" disabled={submitting}>{submitting ? c.sending : c.send}</button>
        <p className="text-2xs text-ink-soft leading-relaxed">
          {consentParts[0]}<Link href="/privacy" className="underline underline-offset-2">{c.privacyLink}</Link>{consentParts[1]}
        </p>
      </div>
      {!compact && (
        <p className="mt-5 text-xs text-ink-muted">
          {c.writeInstead} <Link href={lang === 'es' ? '/es#consulta-completa' : '/enquire'} className="text-forest underline underline-offset-2">{c.writeInsteadLink}</Link>
        </p>
      )}
    </form>
  );
}
