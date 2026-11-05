import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface BaseProps { label?: ReactNode; hint?: ReactNode; error?: ReactNode; help?: ReactNode; size?: 'sm' | 'md'; className?: string }

function Wrapper({ id, label, hint, error, help, className, children }: BaseProps & { id: string; children: ReactNode }) {
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}{hint && <span className="field__label-hint">({hint})</span>}
        </label>
      )}
      {children}
      {error ? <div className="field__error" id={`${id}-err`} role="alert">{error}</div> : help ? <div className="field__help">{help}</div> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>>(function Input({ label, hint, error, help, size, className, id: givenId, ...rest }, ref) {
  const auto = useId(); const id = givenId ?? auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} help={help} className={className}>
      <input ref={ref} id={id} className={['field__control', size === 'sm' && 'field__control--sm'].filter(Boolean).join(' ')} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...rest} />
    </Wrapper>
  );
});

export function Select({ label, hint, error, help, size, className, id: givenId, children, ...rest }: BaseProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>) {
  const auto = useId(); const id = givenId ?? auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} help={help} className={className}>
      <select id={id} className={['field__control', size === 'sm' && 'field__control--sm'].filter(Boolean).join(' ')} aria-invalid={!!error} {...rest}>{children}</select>
    </Wrapper>
  );
}

export function Textarea({ label, hint, error, help, className, id: givenId, ...rest }: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId(); const id = givenId ?? auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} help={help} className={className}>
      <textarea id={id} className="field__control" aria-invalid={!!error} {...rest} />
    </Wrapper>
  );
}

/** Label + any custom control (a Segmented, a toggle) in the Field layout. */
export function Labelled({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <span className="field__label">{label}</span>
      {children}
    </div>
  );
}

export function Checkbox({ label, className, id: givenId, ...rest }: { label: ReactNode; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId(); const id = givenId ?? auto;
  return (
    <div className={['field field--inline', className].filter(Boolean).join(' ')}>
      <input id={id} type="checkbox" className="checkbox" {...rest} />
      <label className="field__label" htmlFor={id}>{label}</label>
    </div>
  );
}
