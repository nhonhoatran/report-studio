import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  iconOnly?: boolean;
  active?: boolean;
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, iconOnly, active, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, size === 'sm' && 'btn--sm', iconOnly && 'btn--icon', active && 'btn--active', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-pressed={active} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner__ring" aria-hidden /> : icon}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </button>
  );
}
