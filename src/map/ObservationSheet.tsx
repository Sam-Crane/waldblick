import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '@/data/db';
import PriorityBadge from '@/components/PriorityBadge';
import { useTranslation } from '@/i18n';

export default function ObservationSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslation();
  const obs = useLiveQuery(() => (id ? db.observations.get(id) : undefined), [id]);
  const photo = useLiveQuery(
    () => (id ? db.photos.where('observationId').equals(id).first() : undefined),
    [id],
  );

  if (!id) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl rounded-t-2xl bg-surface-container-lowest pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
      role="dialog"
    >
      <div className="flex items-center justify-center py-2">
        <div className="h-1 w-10 rounded-full bg-outline-variant" />
      </div>
      <div className="px-margin-main pb-stack-md">
        {!obs ? (
          <p className="py-4 text-on-surface-variant">{t('details.notFound')}</p>
        ) : (
          <div className="flex gap-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-container">
              {photo?.blob ? (
                <img src={URL.createObjectURL(photo.blob)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-outline">
                  <span className="material-symbols-outlined">image</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-start justify-between">
                <h3 className="truncate text-body-md font-bold">{t(`category.${obs.category}`)}</h3>
                <PriorityBadge priority={obs.priority} />
              </div>
              <p className="mb-1 line-clamp-2 text-label-md text-on-surface-variant">
                {obs.description || t('dashboard.empty')}
              </p>
              <p className="text-label-sm text-outline">
                {obs.lat.toFixed(4)}° N, {obs.lng.toFixed(4)}° E
              </p>
            </div>
          </div>
        )}
        <div className="mt-stack-md flex gap-2">
          <button
            onClick={onClose}
            className="touch-safe flex-1 rounded-lg border border-outline-variant text-label-md font-semibold uppercase tracking-widest text-on-surface-variant"
          >
            {t('common.back')}
          </button>
          {obs && (
            <Link
              to={`/observations/${obs.id}`}
              className="touch-safe flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-on-primary"
            >
              <span className="material-symbols-outlined">open_in_new</span>
              <span className="font-semibold uppercase tracking-widest">{t('details.takeAction')}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
