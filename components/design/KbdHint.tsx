import { ReactNode } from 'react';

type Props = {
  /** Text or array of keys. Single chars get the kbd box; words go inline. */
  keys: string | string[];
  className?: string;
  children?: ReactNode;
};

// One or more keyboard hint chips. Used in the ⌘K hint row, in tooltips,
// and inline next to actions ("Save · ⌘S").
export function KbdHint({ keys, className, children }: Props) {
  const arr = Array.isArray(keys) ? keys : keys.split('+');
  return (
    <span className={['inline-flex items-center gap-1 text-2xs text-ink-soft', className ?? ''].join(' ')}>
      {arr.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="font-mono inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 border border-rule rounded text-2xs leading-none"
        >
          {k}
        </kbd>
      ))}
      {children && <span className="ml-1">{children}</span>}
    </span>
  );
}

export default KbdHint;
