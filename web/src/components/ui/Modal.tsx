import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { useT } from '@/i18n';

interface ModalProps { open: boolean; title: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean; children: ReactNode }

/** Native <dialog>: focus trapping, Escape and backdrop come from the platform. */
export function Modal({ open, title, onClose, footer, wide, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={['modal', wide && 'modal--wide'].filter(Boolean).join(' ')}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby={titleId}
    >
      {open && (
        <div onClick={(e) => e.stopPropagation()}>
          <header className="modal__header">
            <h2 id={titleId}>{title}</h2>
            <Button variant="ghost" iconOnly icon={<X size={18} />} onClick={onClose}>{t('common.close')}</Button>
          </header>
          <div className="modal__body">{children}</div>
          {footer && <footer className="modal__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
