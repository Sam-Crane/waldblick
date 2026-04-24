import type { Priority } from '@/data/types';
import { useTranslation } from '@/i18n';

type Props = {
  active: Set<Priority>;
  onToggle: (p: Priority) => void;
};

const ALL: Priority[] = ['critical', 'medium', 'low'];

const dot: Record<Priority, string> = {
  critical: 'bg-error',
  medium: 'bg-tertiary',
  low: 'bg-primary-container',
};

export default function MapFilterBar({ active, onToggle }: Props) {
  const t = useTranslation();
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-surface-container-lowest/95 px-2 py-1.5 shadow-lg backdrop-blur-md">
      <span className="px-2 text-label-sm uppercase tracking-widest text-outline">{t('filters.priority')}</span>
      {ALL.map((p) => {
        const on = active.size === 0 || active.has(p);
        return (
          <button
            key={p}
            onClick={() => onToggle(p)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-label-sm font-semibold transition ${
              on ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant line-through'
            }`}
            aria-pressed={on}
          >
            <span className={`h-2 w-2 rounded-full ${dot[p]}`} />
            {t(`priority.${p}`)}
          </button>
        );
      })}
    </div>
  );
}
