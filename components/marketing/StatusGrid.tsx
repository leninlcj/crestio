import { useEffect, useState } from 'react';

type Component = {
  key: string;
  label: string;
  uptime_30d_pct: number;
  history: number[];
};

type Props = {
  components: Component[];
};

type HealthState = Record<string, 'up' | 'down' | 'unknown'>;

export default function StatusGrid({ components }: Props) {
  const [health, setHealth] = useState<HealthState>(() =>
    Object.fromEntries(components.map((c) => [c.key, 'unknown'] as const))
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const next: HealthState = {};
        for (const c of components) {
          let ok = true;
          if (c.key === 'web') ok = true;
          else if (c.key === 'api') ok = !!data.ok;
          else if (c.key === 'db') ok = !!data.supabase_configured;
          else if (c.key === 'email') ok = !!data.resend_configured;
          else if (c.key === 'ai') ok = !!data.anthropic_configured;
          else if (c.key === 'stripe') ok = !!data.stripe_configured;
          next[c.key] = ok ? 'up' : 'down';
        }
        setHealth(next);
      })
      .catch(() => {
        if (cancelled) return;
        const next: HealthState = {};
        for (const c of components) next[c.key] = 'down';
        setHealth(next);
      });
    return () => { cancelled = true; };
  }, [components]);

  const allUp = components.every((c) => health[c.key] === 'up');

  return (
    <div>
      <div className="rounded-md border border-rule bg-surface p-5 md:p-6 mb-6 flex items-center gap-3">
        <span
          className={[
            'w-2.5 h-2.5 rounded-full shrink-0',
            allUp ? 'bg-success' : 'bg-amber',
          ].join(' ')}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm md:text-base text-ink font-medium">
            {allUp ? 'All systems operational' : 'Some systems are degraded'}
          </div>
          <div className="text-2xs text-ink-soft mt-0.5">
            Updated just now · checks every page load
          </div>
        </div>
      </div>

      <div className="rounded-md border border-rule bg-surface overflow-hidden">
        {components.map((c, i) => (
          <div
            key={c.key}
            className={[
              'px-5 md:px-6 py-4 flex items-center gap-4',
              i < components.length - 1 ? 'border-b border-ruleSoft' : '',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 w-32 md:w-40 shrink-0">
              <span
                className={[
                  'w-2 h-2 rounded-full',
                  health[c.key] === 'up'
                    ? 'bg-success'
                    : health[c.key] === 'down'
                    ? 'bg-claret'
                    : 'bg-ink-soft',
                ].join(' ')}
                aria-hidden
              />
              <span className="text-sm text-ink font-medium">{c.label}</span>
            </div>
            <UptimeBars history={c.history} />
            <div className="text-2xs num tabular text-ink-muted shrink-0 w-16 text-right">
              {c.uptime_30d_pct.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>

      <div className="text-2xs text-ink-soft mt-3 text-right">
        30-day rolling uptime
      </div>
    </div>
  );
}

function UptimeBars({ history }: { history: number[] }) {
  return (
    <div className="flex items-end gap-[2px] flex-1 h-6">
      {history.map((day, i) => {
        const tone = day >= 100 ? 'bg-success/70' : day >= 99 ? 'bg-amber/70' : 'bg-claret/70';
        const height = day >= 100 ? '100%' : day >= 99 ? '75%' : '50%';
        return (
          <div
            key={i}
            className={['flex-1 max-w-[8px] rounded-sm', tone].join(' ')}
            style={{ height }}
            title={`Day -${history.length - i}: ${day}%`}
            aria-label={`Day -${history.length - i}: ${day}% uptime`}
          />
        );
      })}
    </div>
  );
}
