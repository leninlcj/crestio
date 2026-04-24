import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

type FieldProps = {
  label?: string;
  hint?: string;
  error?: string;
  labelSuffix?: ReactNode;
};

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldProps;
type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps;
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldProps & { children: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, labelSuffix, className, id, ...rest }, ref,
) {
  const inputId = id ?? (label ? `f-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor={inputId} className="label mb-0">{label}</label>
          {labelSuffix}
        </div>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={['input', error ? 'border-claret' : '', className].filter(Boolean).join(' ')}
        {...rest}
      />
      {error ? (
        <p className="mt-1.5 text-xs text-claret">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, labelSuffix, className, id, rows = 4, ...rest }, ref,
) {
  const inputId = id ?? (label ? `f-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor={inputId} className="label mb-0">{label}</label>
          {labelSuffix}
        </div>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={['input', error ? 'border-claret' : '', className].filter(Boolean).join(' ')}
        {...rest}
      />
      {error ? (
        <p className="mt-1.5 text-xs text-claret">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, labelSuffix, className, id, children, ...rest }, ref,
) {
  const inputId = id ?? (label ? `f-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor={inputId} className="label mb-0">{label}</label>
          {labelSuffix}
        </div>
      )}
      <select
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={['input', error ? 'border-claret' : '', className].filter(Boolean).join(' ')}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className="mt-1.5 text-xs text-claret">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
});

export default Input;
