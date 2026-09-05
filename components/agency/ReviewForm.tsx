import { useEffect, useState, type FormEvent } from 'react';
import { REVIEW_COPY, type ReviewLang } from '../../lib/reviewCopy';
import { AGENCY } from '../../lib/agency';

type Info = {
  state: 'open' | 'done';
  language: ReviewLang;
  student_first_name: string | null;
  tutor_first_name: string | null;
  google_review_url: string | null;
};

type Phase = 'loading' | 'invalid' | 'already' | 'open' | 'thanks';

// The family's review form at /review/[token]. Copy comes from lib/reviews.ts
// in the family's language. The token is the only credential; the API
// validates it and refuses a second submission.
export function ReviewForm({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [consent, setConsent] = useState(true);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/review/${encodeURIComponent(token)}`);
        if (!alive) return;
        if (res.status === 404) { setPhase('invalid'); return; }
        const payload = (await res.json()) as Info;
        setInfo(payload);
        setPhase(payload.state === 'open' ? 'open' : 'already');
      } catch {
        if (alive) setPhase('invalid');
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const lang: ReviewLang = info?.language === 'es' ? 'es' : 'en';
  const c = REVIEW_COPY[lang];

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    if (rating < 1) { setError(c.errors.rating); return; }
    if (body.trim().length < 12) { setError(c.errors.body); return; }
    if (consent && name.trim().length < 2) { setError(c.errors.name); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/review/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, body, reviewer_name: name, reviewer_suburb: suburb, consent_public: consent, website }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 409) { setPhase('already'); return; }
      if (!res.ok) { setError(payload?.error ?? (lang === 'es' ? 'Algo salió mal. Escríbenos a ' : 'Something went wrong. Email ') + AGENCY.email); return; }
      setGoogleUrl(payload?.google_review_url ?? null);
      setPhase('thanks');
    } catch {
      setError((lang === 'es' ? 'Algo salió mal. Escríbenos a ' : 'Something went wrong. Email ') + AGENCY.email);
    } finally {
      setSubmitting(false);
    }
  }

  const box = 'rounded-md border border-rule bg-surface p-6 md:p-8';
  const label = 'block text-xs font-medium text-ink-muted mb-1.5';
  const heading = (
    <>
      <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">{c.kicker}</div>
      <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-8">{c.title}</h1>
    </>
  );

  if (phase === 'loading') {
    return <div className={box} role="status" aria-busy="true"><div className="h-3 w-1/3 bg-ruleSoft rounded-sm mb-3" /><div className="h-3 w-2/3 bg-ruleSoft rounded-sm" /></div>;
  }
  if (phase === 'invalid') {
    return (
      <>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter text-ink text-balance leading-[1.05] mb-8">{REVIEW_COPY.en.title}</h1>
        <div className={box} role="status"><p className="text-sm text-ink-muted leading-relaxed">{REVIEW_COPY.en.invalid}</p><p className="mt-3 text-sm text-ink-muted leading-relaxed">{REVIEW_COPY.es.invalid}</p></div>
      </>
    );
  }
  if (phase === 'already') {
    return <>{heading}<div className={box} role="status"><p className="text-sm text-ink-muted leading-relaxed">{c.already}</p></div></>;
  }
  if (phase === 'thanks') {
    return (
      <>
      {heading}
      <div className={box} role="status">
        <h2 className="font-display text-2xl tracking-tighter text-ink mb-3">{c.thanksTitle}</h2>
        <p className="text-sm text-ink-muted leading-relaxed">{c.thanksBody}</p>
        {googleUrl && (
          <div className="mt-6 pt-6 border-t border-rule">
            <div className="text-2xs uppercase tracking-widest text-ink-soft mb-2">{c.googleTitle}</div>
            <p className="text-sm text-ink-muted leading-relaxed mb-4">{c.googleBody}</p>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex">{c.googleCta}</a>
          </div>
        )}
      </div>
      </>
    );
  }

  return (
    <>
    {heading}
    <form onSubmit={submit} className={`${box} space-y-6`} noValidate>
      <div className="hidden" aria-hidden><label>Website<input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label></div>
      <p className="text-sm text-ink-muted leading-relaxed">{c.intro(info?.student_first_name ?? null, info?.tutor_first_name ?? null)}</p>

      <fieldset>
        <legend className={label}>{c.ratingLabel}</legend>
        <div className="flex gap-2" role="radiogroup" aria-label={c.ratingLabel}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}`}
              onClick={() => setRating(n)}
              className={`h-11 w-11 rounded-md border text-sm font-medium transition-colors duration-100 ${rating === n ? 'bg-forest text-cream border-forest' : rating > n ? 'bg-forest-soft border-forest/30 text-forest-ink' : 'bg-surface border-rule text-ink hover:bg-ruleSoft'}`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-2xs text-ink-soft">{c.ratingHint}</p>
      </fieldset>

      <div>
        <label htmlFor="review-body" className={label}>{c.bodyLabel}</label>
        <textarea id="review-body" className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder={c.bodyPlaceholder} maxLength={2000} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="review-name" className={label}>{c.nameLabel}</label>
          <input id="review-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={c.namePlaceholder} maxLength={80} />
          <p className="mt-1.5 text-2xs text-ink-soft">{c.nameHint}</p>
        </div>
        <div>
          <label htmlFor="review-suburb" className={label}>{c.suburbLabel}</label>
          <input id="review-suburb" className="input" value={suburb} onChange={(e) => setSuburb(e.target.value)} maxLength={60} />
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-forest" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{c.consentLabel}<span className="block text-2xs text-ink-soft mt-0.5">{c.consentHint}</span></span>
      </label>

      {error && <p className="text-sm text-claret" role="alert">{error}</p>}

      <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? c.sending : c.submit}</button>
    </form>
    </>
  );
}
