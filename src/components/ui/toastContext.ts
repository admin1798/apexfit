import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'warning' | 'danger' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastApi {
  showToast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}

export const ToastContext = createContext<ToastApi>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}
