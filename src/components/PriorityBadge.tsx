import type { Priority } from '@/data/types';
import { useTranslation } from '@/i18n';

const classes: Record<Priority, string> = {
  critical: 'bg-error text-on-error',
  medium: 'bg-tertiary text-on-tertiary',
  low: 'bg-primary-container text-on-primary',
};

export default function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useTranslation();
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${classes[priority]}`}
    >
      {t(`priority.${priority}`)}
    </span>
  );
}
