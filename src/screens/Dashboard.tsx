import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TopBar from '@/components/Layout/TopBar';
import InventoryStats from '@/components/InventoryStats';
import { db } from '@/data/db';
import { useTranslation } from '@/i18n';

export default function Dashboard() {
  const t = useTranslation();
  const observations = useLiveQuery(() => db.observations.toArray(), []) ?? [];

  return (
    <div className="flex min-h-full flex-col bg-primary pb-24 text-on-primary">
      <TopBar title="Waldblick" variant="dark" />
      <div className="flex flex-col px-margin-main pt-stack-lg">
        <div className="mb-stack-lg flex items-center justify-between">
          <h2 className="text-headline-md font-semibold">{t('dashboard.title')}</h2>
          <div className="flex gap-2">
            <button
              className="touch-safe flex items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container shadow-sm active:scale-95"
              aria-label={t('dashboard.filter')}
            >
              <span className="material-symbols-outlined">filter_list</span>
            </button>
            <Link
              to="/record"
              className="touch-safe flex items-center justify-center rounded-lg bg-safety text-white shadow-sm active:scale-95"
              aria-label={t('dashboard.add')}
            >
              <span className="material-symbols-outlined">add</span>
            </Link>
          </div>
        </div>

        <InventoryStats observations={observations} variant="dark" />

        <Link
          to="/record"
          className="touch-safe mt-stack-lg mb-stack-lg flex w-full items-center justify-center gap-3 rounded-lg bg-tertiary-fixed-dim font-black uppercase tracking-widest text-on-tertiary-fixed shadow-xl active:scale-95"
        >
          <span className="material-symbols-outlined">add_a_photo</span>
          {t('dashboard.newObservation')}
        </Link>
      </div>
    </div>
  );
}
