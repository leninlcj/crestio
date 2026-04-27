type Props = {
  current: 1 | 2 | 3;
};

const STEPS = [
  { n: 1, label: 'About you' },
  { n: 2, label: 'Your work' },
  { n: 3, label: 'Try it' },
];

// Three-step progress indicator at the top of the onboarding flow.
export function OnboardingSteps({ current }: Props) {
  return (
    <ol className="flex items-center gap-2 text-xs text-ink-muted" aria-label="Onboarding progress">
      {STEPS.map((step, i) => {
        const isActive = step.n === current;
        const isComplete = step.n < current;
        return (
          <li key={step.n} className="flex items-center gap-2">
            <span
              className={[
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-2xs font-semibold transition-colors duration-100',
                isComplete
                  ? 'bg-forest text-white'
                  : isActive
                    ? 'bg-forest text-white'
                    : 'bg-ruleSoft text-ink-muted',
              ].join(' ')}
            >
              {isComplete ? '✓' : step.n}
            </span>
            <span className={isActive ? 'text-ink font-medium' : ''}>{step.label}</span>
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="text-ink-soft mx-1">·</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default OnboardingSteps;
