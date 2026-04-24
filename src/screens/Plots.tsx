import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '@/components/Layout/TopBar';
import { useSession } from '@/data/session';
import { plotsRepo } from '@/data/plotsRepo';
import { cacheAllPlots } from '@/map/autoCache';
import type { Plot } from '@/data/types';
import { useToast } from '@/components/Toast';
import { useTranslation } from '@/i18n';

export default function Plots() {
  const t = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { isDemoMode } = useSession();
  const [plots, setPlots] = useState<Plot[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [prefetch, setPrefetch] = useState<{ done: number; total: number } | null>(null);

  const load = async () => {
    setLoading(true);
    const list = await plotsRepo.list();
    setPlots(list);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const downloadForest = async () => {
    if (plots.length === 0) return;
    setPrefetch({ done: 0, total: plots.length });
    await cacheAllPlots(plots, (done, total) => setPrefetch({ done, total }));
    setPrefetch(null);
    toast.success(t('plots.downloadDone'));
  };

  const remove = async (p: Plot) => {
    if (!confirm(t('plots.deleteConfirm', { name: p.name }))) return;
    setDeleting(p.id);
    const ok = await plotsRepo.delete(p.id);
    setDeleting(null);
    if (ok) {
      setPlots((list) => list.filter((x) => x.id !== p.id));
      toast.success(t('plots.deleted', { name: p.name }));
    } else {
      toast.error(t('plots.deleteFailed'));
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-background pb-24">
      <TopBar
        title={t('plots.title')}
        leading={
          <button
            onClick={() => navigate(-1)}
            className="touch-safe flex items-center justify-center rounded-full hover:bg-surface-container"
            aria-label={t('common.back')}
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
        }
        trailing={
          !isDemoMode ? (
            <Link
              to="/plots/new"
              className="touch-safe flex items-center gap-1 rounded-lg bg-primary-container px-3 text-on-primary active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span className="hidden text-label-sm font-semibold uppercase tracking-wider sm:inline">
                {t('plots.new')}
              </span>
            </Link>
          ) : undefined
        }
        showProfile={false}
      />

      <div className="mx-auto w-full max-w-2xl px-margin-main py-stack-lg">
        {isDemoMode && (
          <p className="mb-stack-md rounded-lg border border-outline-variant bg-surface-container-low p-3 text-label-md text-on-surface-variant">
            {t('plots.demoNote')}
          </p>
        )}

        {!isDemoMode && !loading && plots.length > 0 && (
          <button
            onClick={downloadForest}
            disabled={prefetch !== null}
            className="touch-safe mb-stack-md flex w-full items-center justify-center gap-2 rounded-lg border-2 border-primary-container text-primary-container active:scale-95 disabled:opacity-60"
          >
            <span
              className={`material-symbols-outlined ${prefetch ? 'animate-spin' : ''}`}
            >
              {prefetch ? 'sync' : 'download_for_offline'}
            </span>
            <span className="text-label-md font-semibold uppercase tracking-widest">
              {prefetch
                ? t('plots.downloading', { done: prefetch.done, total: prefetch.total })
                : t('plots.downloadForest')}
            </span>
          </button>
        )}

        {loading ? (
          <p className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
            {t('plots.loading')}
          </p>
        ) : plots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-on-surface-variant">
            <span className="material-symbols-outlined mb-2 text-4xl">crop_square</span>
            <p className="mb-3">{t('plots.empty')}</p>
            {!isDemoMode && (
              <Link
                to="/plots/new"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-on-primary"
              >
                <span className="material-symbols-outlined">add</span>
                {t('plots.new')}
              </Link>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {plots.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
              >
                <button
                  onClick={() => navigate('/map', { state: { focusPlotId: p.id } })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99]"
                  aria-label={t('plots.viewOnMap')}
                >
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded border-2"
                    style={{ borderColor: p.color ?? '#173124', backgroundColor: (p.color ?? '#173124') + '22' }}
                  >
                    <span className="material-symbols-outlined" style={{ color: p.color ?? '#173124' }}>
                      crop_square
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label-md font-semibold">{p.name}</p>
                    <p className="truncate text-label-sm text-outline">
                      {p.boundary.coordinates[0]?.length ?? 0} {t('plots.vertices')} · {t('plots.viewOnMap')}
                    </p>
                  </div>
                </button>
                {!isDemoMode && (
                  <button
                    onClick={() => remove(p)}
                    disabled={deleting === p.id}
                    className="touch-safe flex items-center justify-center rounded-full text-error hover:bg-error-container/40 disabled:opacity-50"
                    aria-label={t('plots.delete')}
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
