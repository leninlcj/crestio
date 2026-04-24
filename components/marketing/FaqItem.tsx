import { ReactNode } from 'react';

type Props = {
  question: string;
  children: ReactNode;
};

export default function FaqItem({ question, children }: Props) {
  return (
    <details className="group border-b border-rule py-6 last:border-b-0">
      <summary className="cursor-pointer list-none flex items-start justify-between gap-6">
        <span className="font-display text-lg md:text-xl tracking-tightest text-ink">
          {question}
        </span>
        <span
          className="text-ink-soft text-2xl leading-none mt-0.5 transition-transform group-open:rotate-45 select-none"
          aria-hidden="true"
        >
          +
        </span>
      </summary>
      <div className="pt-4 text-sm md:text-base text-ink-muted leading-relaxed max-w-prose">
        {children}
      </div>
    </details>
  );
}
