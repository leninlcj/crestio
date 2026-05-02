import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  polish,
  POLISH_DEMO_PLACEHOLDER,
  POLISH_TYPING_DELAY_MS,
  POLISH_TYPING_CHAR_MS,
  type PolishStyle,
} from '../../lib/marketing/polish-demo';

type Phase = 'idle' | 'pending' | 'typing' | 'done' | 'invalid';

const STYLES: PolishStyle[] = ['warm', 'concise', 'detailed'];

export default function PolishDemo() {
  const { t } = useTranslation('marketing');
  const [input, setInput] = useState<string>(POLISH_DEMO_PLACEHOLDER);
  const [style, setStyle] = useState<PolishStyle>('warm');
  const [phase, setPhase] = useState<Phase>('idle');
  const [output, setOutput] = useState<string>('');
  const [shown, setShown] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [seed, setSeed] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup any pending timers when unmounting or restarting.
  useEffect(() => {
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);

  function reset() {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    setShown('');
    setOutput('');
    setErrorMsg('');
    setCopied(false);
  }

  function startTyping(full: string) {
    setShown('');
    setPhase('typing');
    let i = 0;
    const tick = () => {
      i += 1;
      setShown(full.slice(0, i));
      if (i < full.length) {
        typingTimer.current = setTimeout(tick, POLISH_TYPING_CHAR_MS);
      } else {
        setPhase('done');
      }
    };
    typingTimer.current = setTimeout(tick, POLISH_TYPING_CHAR_MS);
  }

  function runPolish(nextSeed?: number) {
    reset();
    const result = polish(input, style, nextSeed ?? seed);
    if (!result.ok) {
      setPhase('invalid');
      setErrorMsg(result.message);
      return;
    }
    setOutput(result.output);
    setPhase('pending');
    pendingTimer.current = setTimeout(() => startTyping(result.output), POLISH_TYPING_DELAY_MS);
  }

  function handlePolish() {
    runPolish();
  }

  function handleRegenerate() {
    const next = seed + 1;
    setSeed(next);
    runPolish(next);
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — copy not supported / blocked
    }
  }

  const isBusy = phase === 'pending' || phase === 'typing';

  return (
    <section className="px-6 md:px-12 py-16 md:py-24 max-w-6xl mx-auto" aria-labelledby="polish-demo-heading">
      <div className="text-center mb-10 md:mb-12 max-w-prose mx-auto">
        <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">{t('polish_demo.eyebrow')}</div>
        <h2 id="polish-demo-heading" className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-3 text-balance">
          {t('polish_demo.heading')}
        </h2>
        <p className="text-sm md:text-base text-ink-muted leading-relaxed">
          {t('polish_demo.sub')}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        {/* Input column */}
        <div className="rounded-xl border border-rule bg-surface p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <label htmlFor="polish-demo-input" className="text-2xs uppercase tracking-widest text-ink-soft">
              {t('polish_demo.input_label')}
            </label>
          </div>
          <textarea
            id="polish-demo-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={POLISH_DEMO_PLACEHOLDER}
            rows={6}
            spellCheck={false}
            aria-label={t('polish_demo.input_label')}
            className="w-full text-sm md:text-base text-ink leading-relaxed bg-cream rounded-md border border-rule p-3 md:p-4 resize-y focus:outline-none focus:ring-2 focus:ring-forest/40 focus:border-forest/40 transition-colors min-h-[140px]"
          />

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-2xs uppercase tracking-widest text-ink-soft mb-1.5">
                {t('polish_demo.style_label')}
              </div>
              <div role="radiogroup" aria-label={t('polish_demo.style_label')} className="inline-flex rounded-md border border-rule overflow-hidden bg-cream">
                {STYLES.map((s) => {
                  const labelKey = `polish_demo.style_${s}` as const;
                  const active = s === style;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setStyle(s)}
                      className={[
                        'px-3 h-9 min-h-[36px] text-xs md:text-sm transition-colors border-r border-rule last:border-r-0',
                        active ? 'bg-forest text-cream' : 'text-ink-muted hover:text-ink hover:bg-ruleSoft/60',
                      ].join(' ')}
                    >
                      {t(labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={handlePolish}
              disabled={isBusy}
              className="btn-primary text-sm font-medium px-5 h-11 min-h-[44px] inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isBusy ? (
                <>
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-cream border-t-transparent animate-spin" aria-hidden />
                  {t('polish_demo.polishing')}
                </>
              ) : (
                t('polish_demo.polish_button')
              )}
            </button>
          </div>
        </div>

        {/* Output column */}
        <div className="rounded-xl border border-rule bg-cream p-5 md:p-6 flex flex-col min-h-[260px]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-2xs uppercase tracking-widest text-ink-soft">
              {t('polish_demo.output_label')}
            </div>
            {phase === 'done' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="text-2xs text-ink-muted hover:text-ink transition-colors"
                >
                  ↻ {t('polish_demo.regenerate')}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-live="polite"
                  className="text-2xs text-ink-muted hover:text-ink transition-colors"
                >
                  {copied ? t('polish_demo.copied') : t('polish_demo.copy')}
                </button>
              </div>
            )}
          </div>

          <div
            className="flex-1 text-sm md:text-base text-ink leading-relaxed whitespace-pre-wrap"
            aria-live="polite"
            role="status"
          >
            {phase === 'idle' && (
              <span className="text-ink-soft italic">{t('polish_demo.empty_state')}</span>
            )}
            {phase === 'invalid' && (
              <span className="text-ink-soft">{errorMsg}</span>
            )}
            {phase === 'pending' && (
              <span className="inline-flex items-center gap-1.5 text-ink-soft">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-soft animate-pulse" />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-soft animate-pulse" style={{ animationDelay: '120ms' }} />
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-ink-soft animate-pulse" style={{ animationDelay: '240ms' }} />
              </span>
            )}
            {(phase === 'typing' || phase === 'done') && (
              <span>
                {shown}
                {phase === 'typing' && (
                  <span aria-hidden className="inline-block w-[2px] h-[1em] -mb-[2px] bg-forest ml-0.5 align-middle animate-pulse" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-2xs text-ink-soft">
        <div className="leading-relaxed max-w-prose">
          {t('polish_demo.disclaimer')}{' '}
          <Link href="/how-polish-works" className="text-forest hover:underline">
            {t('polish_demo.how_link')}
          </Link>
        </div>
        <Link
          href="/sandbox"
          className="inline-flex items-center gap-1.5 text-forest hover:underline shrink-0"
        >
          <span>{t('polish_demo.try_own_label')}:</span>
          <span>{t('polish_demo.try_own_cta')}</span>
        </Link>
      </div>
    </section>
  );
}
