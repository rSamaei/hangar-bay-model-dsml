import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { NotificationList } from '../components/Notification';

export type ToastType = 'success' | 'error' | 'warning';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface NotificationContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

let _nextId = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'error') => {
    const id = _nextId++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 3000);
  }, [dismiss]);

  return (
    <NotificationContext.Provider value={{ showToast }}>
      {children}
      <NotificationList toasts={toasts} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
