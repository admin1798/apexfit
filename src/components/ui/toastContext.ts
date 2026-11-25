import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'warning' | 'danger' | 'info';

export interface ToastApi {
  showToast: (message: string, tone?: ToastTone) => void;
}

export const ToastContext = createContext<ToastApi>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}
