import { createPortal } from 'react-dom';
import type { Toast, ToastType } from '../context/NotificationContext';

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-600/95 border-emerald-500/40',
  error:   'bg-red-600/95 border-red-500/40',
  warning: 'bg-amber-600/95 border-amber-500/40',
};

const TYPE_ICON_PATH: Record<ToastType, string> = {
  success: 'M5 13l4 4L19 7',
  error:   'M6 18L18 6M6 6l12 12',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
};

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function NotificationList({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          role="alert"
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-white text-sm font-medium pointer-events-auto ${TYPE_STYLES[toast.type]}`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TYPE_ICON_PATH[toast.type]} />
          </svg>
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
            className="opacity-60 hover:opacity-100 transition-opacity ml-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
