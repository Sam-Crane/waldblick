import type { Route } from './directions';
import { useTranslation } from '@/i18n';

type Props = {
  state: 'loading' | 'error' | 'ready';
  route?: Route;
  error?: string;
  onClose: () => void;
};

export default function RouteCard({ state, route, error, onClose }: Props) {
  const t = useTranslation();
  return (
    <div className="fixed inset-x-0 bottom-4 z-20 mx-auto flex max-w-md justify-center px-margin-main">
      <div className="flex w-full items-center gap-3 rounded-xl bg-primary px-4 py-3 text-on-primary shadow-xl">
        <span className="material-symbols-outlined text-safety">navigation</span>
        <div className="min-w-0 flex-1">
          {state === 'loading' && (
            <p className="text-label-md font-semibold">{t('directions.loading')}</p>
          )}
          {state === 'error' && (
            <p className="text-label-md font-semibold text-error-container">
              {t(`directions.error.${error ?? 'unknown'}`)}
            </p>
          )}
          {state === 'ready' && route && (
            <>
              <p className="text-label-md font-bold">{route.distanceText}</p>
              <p className="text-label-sm text-primary-fixed-dim">
                {t('directions.eta', { eta: route.durationText })}
              </p>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="touch-safe flex items-center justify-center rounded-lg bg-primary-container text-on-primary active:scale-95"
          aria-label={t('common.back')}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
    </div>
  );
}
