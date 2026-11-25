import { AlertCircle, CheckCircle2, Info, RotateCcw, X } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { ToastContext, type ToastAction, type ToastTone } from './toastContext';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success', action?: ToastAction) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone, action }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, action ? 5500 : 3200);
    },
    []
  );

  const icons: Record<ToastTone, ReactNode> = {
    success: <CheckCircle2 className="h-4 w-4 text-[#75D69A]" />,
    warning: <AlertCircle className="h-4 w-4 text-[#EAB765]" />,
    danger: <AlertCircle className="h-4 w-4 text-[#E87979]" />,
    info: <Info className="h-4 w-4 text-[#79B8F5]" />,
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-[70] flex w-full max-w-[420px] -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border border-[#303832] bg-[#252B27] px-3.5 py-2.5 text-xs font-medium text-[#F3F5F2] shadow-xl"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0">{icons[t.tone]}</span>
              <span className="truncate">{t.message}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {t.action && (
                <button
                  type="button"
                  onClick={async () => {
                    await t.action?.onClick();
                    setToasts((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#B7F36B] px-2.5 py-1 text-[11px] font-bold text-[#101211]"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-[#727B74] hover:text-[#F3F5F2]"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
