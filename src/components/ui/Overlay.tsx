import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, IconButton } from './primitives';

interface ModalShellProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'fullscreen' | 'sheet';
}

export function ModalShell({
  isOpen,
  title,
  subtitle,
  onClose,
  children,
  footer,
  variant = 'fullscreen',
}: ModalShellProps) {
  if (!isOpen) return null;

  if (variant === 'sheet') {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4">
        <div className="flex max-h-[88dvh] w-full max-w-[460px] flex-col rounded-t-3xl border border-[#303832] bg-[#171A18] md:rounded-3xl">
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#303832] md:hidden" />
          <div className="flex items-center justify-between border-b border-[#252B28] px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-[#F3F5F2]">{title}</h2>
              {subtitle && <p className="truncate text-xs text-[#A1AAA3]">{subtitle}</p>}
            </div>
            <IconButton label="Close" onClick={onClose}>
              <X className="h-5 w-5" />
            </IconButton>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer && (
            <div className="border-t border-[#252B28] px-4 py-3 pb-safe">{footer}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#101211]/98 backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-[560px] flex-col pt-safe">
        <div className="flex items-center justify-between border-b border-[#252B28] px-4 pb-3 pt-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-[#F3F5F2]">{title}</h2>
            {subtitle && <p className="truncate text-xs text-[#A1AAA3]">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-safe">{children}</div>
        {footer && (
          <div className="border-t border-[#252B28] px-4 py-3 pb-safe">{footer}</div>
        )}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-[360px] rounded-3xl border border-[#303832] bg-[#1D221F] p-5 shadow-2xl">
        <h3 className="text-base font-bold text-[#F3F5F2]">{title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-[#A1AAA3]">{description}</p>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
