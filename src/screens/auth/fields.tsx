import type { ReactNode } from 'react';

export function Field({
  label,
  icon,
  children,
  hint,
}: {
  label: string;
  icon: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-stack-sm">
      <span className="flex items-center gap-2 text-label-md text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
        {label}
      </span>
      {children}
      {hint && <span className="text-label-sm text-outline">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-md border-b-2 border-outline-variant bg-surface-container-lowest p-4 text-body-md outline-none focus:border-primary-container';

export function SubmitButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg bg-safety font-bold uppercase tracking-widest text-white shadow-lg transition active:scale-95 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function ErrorText({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-2 rounded bg-error-container px-3 py-2 text-label-md text-on-error-container">
      <span className="material-symbols-outlined text-[18px]">error</span>
      {message}
    </p>
  );
}
