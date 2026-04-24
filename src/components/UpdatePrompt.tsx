import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';

// Toast shown when vite-plugin-pwa installs a new service worker.
// User taps Refresh → skipWaiting → page reloads with new assets.
export default function UpdatePrompt() {
  const t = useTranslation();
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) return;
        const updateFn = registerSW({
          immediate: true,
          onNeedRefresh() {
            setNeedRefresh(true);
          },
          onOfflineReady() {
            setOfflineReady(true);
            window.setTimeout(() => setOfflineReady(false), 4000);
          },
        });
        setUpdate(() => async () => {
          await updateFn(true);
        });
      })
      .catch(() => {
        /* SW unavailable (dev mode); ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[72px] z-50 flex justify-center px-margin-main">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-on-primary shadow-xl">
        <span className="material-symbols-outlined text-tertiary-fixed-dim">
          {needRefresh ? 'download' : 'cloud_done'}
        </span>
        <p className="text-label-md">
          {needRefresh ? t('update.needRefresh') : t('update.offlineReady')}
        </p>
        {needRefresh && update && (
          <button
            onClick={() => {
              void update();
            }}
            className="rounded-lg bg-safety px-3 py-1.5 text-label-sm font-bold uppercase tracking-widest text-white active:scale-95"
          >
            {t('update.refresh')}
          </button>
        )}
      </div>
    </div>
  );
}
