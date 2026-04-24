import { useSession } from '@/data/session';
import { useTranslation } from '@/i18n';

export default function DemoBanner() {
  const { isDemoMode } = useSession();
  const t = useTranslation();
  if (!isDemoMode) return null;
  return (
    <div className="flex items-center gap-2 bg-tertiary-container px-4 py-1.5 text-on-tertiary-container">
      <span className="material-symbols-outlined text-[18px]">info</span>
      <span className="text-label-sm font-semibold uppercase tracking-wider">{t('auth.demoMode')}</span>
    </div>
  );
}
