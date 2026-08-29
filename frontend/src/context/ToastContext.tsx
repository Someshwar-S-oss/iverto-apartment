import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  durationMs: number;
}

export interface ToastContextType {
  showToast: (message: string, type?: ToastType, durationMs?: number) => string;
  dismissToast: (id: string) => void;
  success: (message: string, durationMs?: number) => string;
  error: (message: string, durationMs?: number) => string;
  info: (message: string, durationMs?: number) => string;
  warning: (message: string, durationMs?: number) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const existingTimeout = timeoutsRef.current.get(id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', durationMs: number = 4000): string => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, message, type, durationMs };

      setToasts((prev) => [...prev.slice(-4), newToast]); // keep max 5 active toasts

      if (durationMs > 0) {
        const timeout = setTimeout(() => {
          dismissToast(id);
        }, durationMs);
        timeoutsRef.current.set(id, timeout);
      }

      return id;
    },
    [dismissToast],
  );

  const success = useCallback(
    (message: string, durationMs?: number) => showToast(message, 'success', durationMs),
    [showToast],
  );
  const error = useCallback(
    (message: string, durationMs?: number) => showToast(message, 'error', durationMs),
    [showToast],
  );
  const info = useCallback(
    (message: string, durationMs?: number) => showToast(message, 'info', durationMs),
    [showToast],
  );
  const warning = useCallback(
    (message: string, durationMs?: number) => showToast(message, 'warning', durationMs),
    [showToast],
  );

  useEffect(() => {
    const activeTimeouts = timeoutsRef.current;
    return () => {
      activeTimeouts.forEach((timeout) => clearTimeout(timeout));
      activeTimeouts.clear();
    };
  }, []);

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
          bg: 'bg-emerald-50/95 border-emerald-200 text-emerald-950',
          indicator: 'bg-emerald-500',
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />,
          bg: 'bg-rose-50/95 border-rose-200 text-rose-950',
          indicator: 'bg-rose-500',
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />,
          bg: 'bg-amber-50/95 border-amber-200 text-amber-950',
          indicator: 'bg-amber-500',
        };
      case 'info':
      default:
        return {
          icon: <Info className="w-5 h-5 text-[#cd0447] shrink-0" />,
          bg: 'bg-pink-50/95 border-pink-200 text-gray-900',
          indicator: 'bg-[#cd0447]',
        };
    }
  };

  return (
    <ToastContext.Provider
      value={{
        showToast,
        dismissToast,
        success,
        error,
        info,
        warning,
      }}
    >
      {children}

      {/* Floating toast portal container */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0"
      >
        {toasts.map((toast) => {
          const styles = getToastStyles(toast.type);
          return (
            <div
              key={toast.id}
              role="alert"
              className={`animate-slide-in-right pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-md shadow-lg transition-all ${styles.bg}`}
            >
              <div className="pt-0.5">{styles.icon}</div>
              <div className="flex-1 text-sm font-medium leading-snug break-words">
                {toast.message}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-gray-400 hover:text-gray-700 p-0.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 cursor-pointer"
                aria-label="Dismiss toast notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastContext;
