import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import useCountUp from '../../lib/useCountUp';
import { Trans, useTranslation } from 'react-i18next';

type Currency = 'AUD' | 'USD' | 'GBP' | 'EUR' | 'NZD' | 'CAD' | 'INR' | 'BRL' | 'IDR' | 'MXN' | 'JPY' | 'SGD' | 'HKD';

const CURRENCIES: { code: Currency; flag: string; label: string }[] = [
  { code: 'AUD', flag: '🇦🇺', label: 'AUD' },
  { code: 'USD', flag: '🇺🇸', label: 'USD' },
  { code: 'GBP', flag: '🇬🇧', label: 'GBP' },
  { code: 'EUR', flag: '🇪🇺', label: 'EUR' },
  { code: 'NZD', flag: '🇳🇿', label: 'NZD' },
  { code: 'CAD', flag: '🇨🇦', label: 'CAD' },
  { code: 'INR', flag: '🇮🇳', label: 'INR' },
  { code: 'BRL', flag: '🇧🇷', label: 'BRL' },
  { code: 'IDR', flag: '🇮🇩', label: 'IDR' },
  { code: 'MXN', flag: '🇲🇽', label: 'MXN' },
  { code: 'JPY', flag: '🇯🇵', label: 'JPY' },
  { code: 'SGD', flag: '🇸🇬', label: 'SGD' },
  { code: 'HKD', flag: '🇭🇰', label: 'HKD' },
];

const CRESTIO_ANNUAL_AUD = 240;

// Rough conversions from AUD. Used for "Crestio cost vs value" display only.
const RATES: Record<Currency, number> = {
  AUD: 1, USD: 0.66, GBP: 0.52, EUR: 0.61, NZD: 1.10, CAD: 0.90,
  INR: 55, BRL: 3.4, IDR: 10500, MXN: 11.4, JPY: 100, SGD: 0.89, HKD: 5.1,
};

type Props = {
  initialStudents?: number;
  initialHours?: number;
  initialRate?: number;
  initialCurrency?: Currency;
  embed?: boolean;
};

export default function ROICalculator({
  initialStudents,
  initialHours,
  initialRate,
  initialCurrency,
  embed = false,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation('marketing');
  const [students, setStudents] = useState<number>(initialStudents ?? 8);
  const [hours, setHours] = useState<number>(initialHours ?? 6);
  const [rate, setRate] = useState<number>(initialRate ?? 60);
  const [currency, setCurrency] = useState<Currency>(initialCurrency ?? 'AUD');
  const [copied, setCopied] = useState(false);

  // Auto-detect currency from /api/onboarding/detect-region on first mount
  // when the user hasn't passed an initialCurrency. Stores user override
  // in localStorage and respects it forever after.
  useEffect(() => {
    if (initialCurrency) return;
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('crestio.currency');
    if (stored && (CURRENCIES as readonly { code: string }[]).some((c) => c.code === stored)) {
      setCurrency(stored as Currency);
      return;
    }
    fetch('/api/onboarding/detect-region', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public: true }) })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.currency && (CURRENCIES as readonly { code: string }[]).some((c) => c.code === data.currency)) {
          setCurrency(data.currency);
        }
      })
      .catch(() => { /* keep default */ });
  }, [initialCurrency]);

  // Persist explicit currency choices.
  function setCurrencyExplicit(c: Currency) {
    setCurrency(c);
    if (typeof window !== 'undefined') window.localStorage.setItem('crestio.currency', c);
  }

  // Crestio reduces admin ~70%; cap at 80%, floor at 1 hour saved.
  const hoursSavedPerWeek = useMemo(() => {
    const raw = hours * 0.7;
    return Math.max(1, Math.min(hours * 0.8, raw));
  }, [hours]);
  const hoursSavedPerYear = Math.round(hoursSavedPerWeek * 48);
  const moneyValue = Math.round(hoursSavedPerYear * rate);
  const crestioCost = Math.round(CRESTIO_ANNUAL_AUD * RATES[currency]);

  const animatedHoursWeek = useCountUp(Math.round(hoursSavedPerWeek * 10) / 10, 380);
  const animatedHoursYear = useCountUp(hoursSavedPerYear, 380);
  const animatedMoney = useCountUp(moneyValue, 420);
  const animatedCost = useCountUp(crestioCost, 380);

  function shareLink(): string {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams({
      students: String(students),
      hours: String(hours),
      rate: String(rate),
      currency,
    });
    return `${window.location.origin}/roi?${params.toString()}`;
  }
  async function copy() {
    const url = shareLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* */ }
  }

  const formatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 });
    } catch {
      return null;
    }
  }, [currency]);

  function formatMoney(value: number): string {
    if (formatter) return formatter.format(value);
    return `${currency} ${value.toLocaleString()}`;
  }

  return (
    <section className={embed ? '' : 'px-6 md:px-12 py-16 md:py-24 max-w-5xl mx-auto'}>
      {!embed && (
        <div className="text-center mb-10 md:mb-12">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-3">{t('roi.eyebrow')}</div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tighter text-ink mb-3 text-balance">
            {t('roi.heading')}
          </h2>
          <p className="text-sm text-ink-muted max-w-prose mx-auto">
            {t('roi.subheading')}
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 md:gap-10">
        <div className="space-y-6">
          <Field
            label={t('roi.label_students')}
            value={students}
            min={1} max={50}
            unit={students === 1 ? t('roi.unit_student') : t('roi.unit_students')}
            onChange={(v) => setStudents(Math.round(v))}
          />
          <Field
            label={t('roi.label_hours')}
            value={hours}
            min={0} max={20} step={0.5}
            unit={hours === 1 ? t('roi.unit_hour') : t('roi.unit_hours')}
            onChange={setHours}
          />
          <Field
            label={t('roi.label_rate')}
            value={rate}
            min={20} max={300} step={5}
            unit={t('roi.per_hour')}
            prefix={currency === 'JPY' || currency === 'INR' || currency === 'IDR' ? `${currency} ` : '$'}
            onChange={(v) => setRate(Math.round(v))}
          />
          <div>
            <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1.5 font-medium">{t('roi.currency_label')}</div>
            <div className="flex flex-wrap gap-1.5">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCurrencyExplicit(c.code)}
                  className={[
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-2xs transition-colors border',
                    currency === c.code
                      ? 'bg-forest text-cream border-forest'
                      : 'bg-surface text-ink-muted border-rule hover:border-ink-soft hover:text-ink',
                  ].join(' ')}
                  aria-pressed={currency === c.code}
                  aria-label={c.label}
                >
                  <span aria-hidden>{c.flag}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-rule bg-surface p-6 md:p-8 flex flex-col">
          <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{t('roi.switched_today')}</div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5 mt-4">
            <Stat label={t('roi.hours_week')} value={`${animatedHoursWeek}h`} />
            <Stat label={t('roi.hours_year')} value={`${animatedHoursYear}h`} />
            <Stat label={t('roi.money_recovered')} value={formatMoney(animatedMoney)} bold />
            <Stat label={t('roi.crestio_costs')} value={`${formatMoney(animatedCost)}/yr`} muted />
          </div>

          <div className="mt-6 pt-5 border-t border-rule text-sm text-ink leading-relaxed">
            <Trans
              i18nKey="roi.summary"
              ns="marketing"
              values={{
                cost: formatMoney(crestioCost),
                value: formatMoney(moneyValue),
                multiple: Math.round(moneyValue / Math.max(1, crestioCost)),
              }}
              components={{ b: <strong className="num tabular" /> }}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/auth/signup" className="btn-primary text-sm px-5">{t('roi.cta_start')}</Link>
            <button type="button" onClick={copy} className="btn-secondary text-sm px-5 inline-flex items-center gap-2">
              {copied ? (
                <>
                  <CheckIcon /> {t('roi.copied')}
                </>
              ) : (
                <>
                  <ShareIcon /> {t('roi.share')}
                </>
              )}
            </button>
          </div>

          <div className="mt-5 text-2xs text-ink-muted leading-relaxed">
            {t('roi.disclaimer')}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label, value, min, max, step = 1, unit, prefix, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  prefix?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <label className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-sm text-ink-muted tabular-nums">
          {prefix}{value}
          <span className="text-ink-soft ml-1">{unit}</span>
        </span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        className="w-full h-2 bg-rule rounded-full appearance-none cursor-pointer accent-forest focus-visible:ring-2 focus-visible:ring-forest/20"
        style={{
          background: `linear-gradient(to right, var(--color-forest) 0%, var(--color-forest) ${pct}%, var(--color-rule) ${pct}%, var(--color-rule) 100%)`,
        }}
      />
    </div>
  );
}

function Stat({ label, value, bold = false, muted = false }: { label: string; value: string | number; bold?: boolean; muted?: boolean }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-widest text-ink-muted mb-1">{label}</div>
      <div className={[
        'tabular-nums leading-none',
        bold ? 'font-display text-3xl md:text-4xl tracking-tightest text-forest-ink' :
        muted ? 'text-base text-ink-muted' :
        'font-display text-2xl md:text-3xl tracking-tightest text-forest-ink',
      ].join(' ')}>
        {value}
      </div>
    </div>
  );
}

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ShareIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>;
}
