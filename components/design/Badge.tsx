import { HTMLAttributes, ReactNode } from 'react';

type Variant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant;
  children: ReactNode;
};

const VARIANT: Record<Variant, string> = {
  neutral: 'badge-neutral',
  success: 'badge-forest',
  warning: 'badge-amber',
  danger: 'badge-claret',
  info: 'badge-forest',
};

export function Badge({ variant = 'neutral', className, children, ...rest }: Props) {
  return (
    <span className={[VARIANT[variant], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  );
}

export default Badge;
