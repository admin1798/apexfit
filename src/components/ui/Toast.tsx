import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { ToastContext, type ToastTone } from './toastContext';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const icons: Record<ToastTone, ReactNode> = {
    success: <CheckCircle2 className="h-4 w-4 text-[#75D69A]" />,
    warning: <AlertCircle className="h-4 w-4 text-[#EAB765]" />,
    danger: <AlertCircle className="h-4 w-4 text-[#E87979]" />,
    info: <Info className="h-4 w-4 text-[#79B8F5]" />,
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-[70] flex w-full max-w-[400px] -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border border-[#303832] bg-[#252B27] px-3.5 py-2.5 text-xs font-medium text-[#F3F5F2] shadow-xl"
          >
            <div className="flex items-center gap-2">
              {icons[t.tone]}
              <span>{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-[#727B74] hover:text-[#F3F5F2]"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
