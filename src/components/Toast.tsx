import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

function getToastStyle(type: ToastType) {
  if (type === 'success') {
    return {
      icon: <CheckCircle2 className="w-4 h-4" />,
      box: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
    };
  }

  if (type === 'error') {
    return {
      icon: <AlertCircle className="w-4 h-4" />,
      box: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
    };
  }

  return {
    icon: <Info className="w-4 h-4" />,
    box: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
  };
}

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 pointer-events-none">
      {toasts.map((toast) => {
        const style = getToastStyle(toast.type);
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto min-w-[280px] max-w-[360px] rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${style.box}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{style.icon}</div>
              <div className="text-sm leading-6">{toast.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
