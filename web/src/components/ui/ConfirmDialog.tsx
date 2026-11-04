import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { useT } from '@/i18n';

interface Props { open: boolean; title: ReactNode; message: ReactNode; confirmLabel?: ReactNode; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }

export function ConfirmDialog({ open, title, message, confirmLabel, danger = true, loading, onConfirm, onClose }: Props) {
  const t = useT();
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel ?? t('common.confirm')}</Button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
