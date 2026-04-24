import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  link: 'inline-flex items-center gap-1.5 text-sm text-forest hover:text-forest-ink underline underline-offset-2',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'text-xs px-3 py-2 min-h-[36px]',
  md: '',
  lg: 'text-base px-5 py-3 min-h-[48px]',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    disabled,
    leftIcon,
    rightIcon,
    children,
    fullWidth,
    className,
    type = 'button',
    ...rest
  },
  ref,
) {
  const base = variant === 'link'
    ? VARIANT_CLASS.link
    : [VARIANT_CLASS[variant], SIZE_CLASS[size], fullWidth ? 'w-full' : ''].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[base, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading
        ? <span className="inline-flex items-center gap-2"><Spinner /> {children}</span>
        : <>{leftIcon}{children}{rightIcon}</>}
    </button>
  );
});

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default Button;
