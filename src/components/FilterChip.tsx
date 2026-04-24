import type { ReactNode } from 'react';

export default function FilterChip({
  active,
  icon,
  label,
  onClick,
  count,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-label-md font-semibold transition active:scale-95 ${
        active
          ? 'border-primary-container bg-primary-container text-on-primary'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant'
      }`}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1 rounded-full bg-white/20 px-2 text-[10px] font-bold">{count}</span>
      )}
    </button>
  );
}

export function FilterSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface-container-lowest p-margin-main shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" />
        <h2 className="mb-stack-md text-label-md uppercase tracking-widest text-outline">{title}</h2>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}

export function ToggleRow({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-label-md transition ${
        active
          ? 'border-primary-container bg-primary-fixed text-primary'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface'
      }`}
    >
      <span className="flex items-center gap-3">
        {icon && <span className="material-symbols-outlined text-[18px]">{icon}</span>}
        {label}
      </span>
      {active && <span className="material-symbols-outlined text-primary">check</span>}
    </button>
  );
}
