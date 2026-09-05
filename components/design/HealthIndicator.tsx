import { Tooltip } from './Tooltip';

export type HealthState = 'strong' | 'cooling' | 'at_risk' | 'unknown';

type Props = {
  /** Days since last session. Pass null when there has never been one. */
  daysSinceLast: number | null;
  className?: string;
  /** When true, show the label inline next to the bar. Default true. */
  showLabel?: boolean;
};

const STATES: Record<HealthState, { label: string; color: string; tooltip: string; pos: number }> = {
  strong: {
    label: 'Strong',
    color: '#2F7D4F',
    tooltip: 'Session in the last 7 days.',
    pos: 90,
  },
  cooling: {
    label: 'Cooling',
    color: '#B8860B',
    tooltip: '8–21 days since last session.',
    pos: 50,
  },
  at_risk: {
    label: 'At risk',
    color: '#7A2233',
    tooltip: '22+ days since last session.',
    pos: 12,
  },
  unknown: {
    label: 'No sessions yet',
    color: '#70746F',
    tooltip: 'No sessions logged yet.',
    pos: 50,
  },
};

export function classifyHealth(daysSinceLast: number | null): HealthState {
  if (daysSinceLast === null) return 'unknown';
  if (daysSinceLast <= 7) return 'strong';
  if (daysSinceLast <= 21) return 'cooling';
  return 'at_risk';
}

// Small horizontal bar with a colored marker. Plain language only — no
// emoji, no jargon.
export function HealthIndicator({ daysSinceLast, className, showLabel = true }: Props) {
  const state = classifyHealth(daysSinceLast);
  const cfg = STATES[state];

  return (
    <Tooltip label={cfg.tooltip}>
      <span className={['inline-flex items-center gap-2', className ?? ''].join(' ')}>
        <span className="relative inline-block w-16 h-1 rounded-full bg-ruleSoft overflow-visible">
          <span
            className="absolute top-1/2 w-2 h-2 rounded-full"
            style={{
              left: `${cfg.pos}%`,
              background: cfg.color,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </span>
        {showLabel && (
          <span className="text-xs font-medium text-ink">{cfg.label}</span>
        )}
      </span>
    </Tooltip>
  );
}

export default HealthIndicator;
