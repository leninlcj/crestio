import { ReactNode, useRef, useState } from 'react';

type Props = {
  question: string;
  children: ReactNode;
};

export default function FaqItem({ question, children }: Props) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentHeight = contentRef.current?.scrollHeight ?? 0;

  return (
    <div className="border-b border-rule last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-6 py-5 md:py-6 px-3 -mx-3 rounded text-left transition-colors duration-200 ease-out hover:bg-ruleSoft/50"
      >
        <span className="font-display text-lg md:text-xl tracking-tightest text-ink">
          {question}
        </span>
        <span
          className={[
            'text-ink-soft text-2xl leading-none mt-0.5 select-none shrink-0 transition-transform duration-200 ease-out',
            open ? 'rotate-45 text-forest' : '',
          ].join(' ')}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
        style={{
          maxHeight: open ? `${contentHeight + 32}px` : '0px',
          opacity: open ? 1 : 0,
        }}
        aria-hidden={!open}
      >
        <div
          ref={contentRef}
          className="pb-6 pr-8 text-sm md:text-base text-ink-muted leading-relaxed max-w-prose"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
