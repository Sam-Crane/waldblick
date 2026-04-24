import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ToastTone = 'error' | 'warning' | 'success' | 'info';

type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
};

type ToastCtx = {
  show: (message: string, opts?: { tone?: ToastTone; durationMs?: number }) => void;
  error: (message: string) => void;
  success: (message: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, opts?: { tone?: ToastTone; durationMs?: number }) => {
      const id = ++idCounter;
      const tone = opts?.tone ?? 'info';
      setToasts((list) => [...list, { id, tone, message }]);
      const ms = opts?.durationMs ?? (tone === 'error' ? 6000 : 4000);
      window.setTimeout(() => remove(id), ms);
    },
    [remove],
  );

  const value = useMemo<ToastCtx>(
    () => ({
      show,
      error: (m) => show(m, { tone: 'error' }),
      success: (m) => show(m, { tone: 'success' }),
    }),
    [show],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-margin-main"
        role="region"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    /* life cycle handled by provider timeout */
  }, []);
  const classes =
    toast.tone === 'error'
      ? 'bg-safety text-white'
      : toast.tone === 'warning'
        ? 'bg-secondary-container text-on-secondary-container'
        : toast.tone === 'success'
          ? 'bg-primary-container text-on-primary'
          : 'bg-inverse-surface text-inverse-on-surface';
  const icon =
    toast.tone === 'error'
      ? 'error'
      : toast.tone === 'warning'
        ? 'warning'
        : toast.tone === 'success'
          ? 'check_circle'
          : 'info';
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg px-4 py-3 shadow-xl ${classes}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <span className="material-symbols-outlined shrink-0">{icon}</span>
      <p className="flex-1 text-label-md font-semibold">{toast.message}</p>
      <button
        onClick={onClose}
        className="shrink-0 rounded-full opacity-80 hover:opacity-100"
        aria-label="Dismiss"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
