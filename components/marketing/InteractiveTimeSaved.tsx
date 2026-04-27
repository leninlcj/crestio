import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function InteractiveTimeSaved() {
  const { t } = useTranslation('marketing');
  const [students, setStudents] = useState(8);
  const [adminHours, setAdminHours] = useState(4);
  const [hourlyRate, setHourlyRate] = useState(80);

  const hoursSavedPerWeek = Math.max(0, Math.round(adminHours * 0.6 * 10) / 10);
  const hoursSavedPerMonth = Math.round(hoursSavedPerWeek * 4.33 * 10) / 10;
  const dollarsSavedPerMonth = Math.round(hoursSavedPerMonth * hourlyRate);

  return (
    <section className="px-6 md:px-12 py-16 md:py-20 max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="font-display text-2xl md:text-3xl tracking-tighter text-ink mb-3 text-balance">
          {t('time_saved.heading')}
        </h2>
        <p className="text-sm text-ink-muted max-w-prose mx-auto">
          {t('time_saved.sub')}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8 items-center">
        <div className="space-y-5">
          <Field
            label={t('time_saved.students')}
            value={students}
            min={1} max={100}
            unit={t('time_saved.unit_students')}
            onChange={setStudents}
          />
          <Field
            label={t('time_saved.admin_hours')}
            value={adminHours}
            min={0} max={20} step={0.5}
            unit={t('time_saved.unit_hours_per_week')}
            onChange={setAdminHours}
          />
          <Field
            label={t('time_saved.hourly_rate')}
            value={hourlyRate}
            min={20} max={300} step={5}
            unit={t('time_saved.unit_per_hour')}
            onChange={setHourlyRate}
            prefix="$"
          />
        </div>

        <div className="rounded-md border border-forest bg-forest/[0.04] p-6 md:p-8">
          <div className="text-2xs uppercase tracking-widest text-forest-ink mb-2">
            {t('time_saved.estimate')}
          </div>
          <div className="font-display text-4xl md:text-5xl tracking-tightest text-forest-ink mb-2 tabular-nums">
            {hoursSavedPerMonth}h
          </div>
          <div className="text-sm text-forest-ink/80 mb-6">
            {t('time_saved.per_month')}
          </div>
          <div className="pt-5 border-t border-forest/20 space-y-2 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-forest-ink/80">{t('time_saved.per_week')}</span>
              <span className="text-forest-ink font-mono tabular-nums">{hoursSavedPerWeek}h</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-forest-ink/80">{t('time_saved.value_per_month')}</span>
              <span className="text-forest-ink font-mono tabular-nums">${dollarsSavedPerMonth.toLocaleString()}</span>
            </div>
          </div>
          <div className="mt-5 text-2xs text-forest-ink/60 leading-relaxed">
            {t('time_saved.disclaimer')}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  prefix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
  prefix?: string;
}) {
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
        className="w-full h-1 bg-rule rounded-full appearance-none cursor-pointer accent-forest"
        style={{
          background: `linear-gradient(to right, var(--color-forest) 0%, var(--color-forest) ${((value - min) / (max - min)) * 100}%, var(--color-rule) ${((value - min) / (max - min)) * 100}%, var(--color-rule) 100%)`,
        }}
      />
    </div>
  );
}
