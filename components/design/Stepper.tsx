import { Tooltip } from './Tooltip';

export type Step = {
  key: string;
  label: string;
  /** Filled = done, "current" = active step, otherwise empty. */
  state: 'done' | 'current' | 'todo';
  /** Optional click → e.g. scroll a section into view. */
  onClick?: () => void;
};

type Props = {
  steps: Step[];
  className?: string;
};

// Pipeline indicator. Each step is a small dot connected by a 1px line.
// Filled = done, current = ring, empty = pending. Click filled steps to
// jump to that section. Used at the top of detail panes for sessions
// and invoices.
export function Stepper({ steps, className }: Props) {
  return (
    <div className={['flex items-center gap-1.5', className ?? ''].join(' ')}>
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <Tooltip label={s.label} side="top">
            <button
              type="button"
              aria-label={`${s.label} (${s.state})`}
              onClick={s.onClick}
              disabled={!s.onClick}
              className={[
                'block rounded-full transition-colors duration-100',
                s.state === 'done'
                  ? 'bg-forest hover:bg-forest-ink'
                  : s.state === 'current'
                  ? 'bg-surface border-2 border-forest'
                  : 'bg-surface border border-rule',
                s.onClick ? 'cursor-pointer' : 'cursor-default',
              ].join(' ')}
              style={{ width: 9, height: 9 }}
            />
          </Tooltip>
          {i < steps.length - 1 && (
            <span
              className={[
                'block h-px w-6',
                s.state === 'done' ? 'bg-forest/50' : 'bg-rule',
              ].join(' ')}
              aria-hidden="true"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default Stepper;
