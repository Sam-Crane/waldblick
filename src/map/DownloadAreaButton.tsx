import { useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { cacheArea, type Progress } from './tileCache';
import { useTranslation } from '@/i18n';

type Props = {
  getBounds: () => maplibregl.LngLatBounds | null;
  activeLayerIds: string[];
};

export default function DownloadAreaButton({ getBounds, activeLayerIds }: Props) {
  const t = useTranslation();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const start = async () => {
    const b = getBounds();
    if (!b) return;
    abortRef.current = new AbortController();
    setRunning(true);
    setProgress({ total: 0, done: 0, bytes: 0 });
    const result = await cacheArea(
      { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() },
      activeLayerIds,
      12,
      15,
      (p) => setProgress({ ...p }),
      abortRef.current.signal,
    );
    setProgress(result);
    setRunning(false);
  };

  const cancel = () => abortRef.current?.abort();

  const pct =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
      {progress && (
        <div className="rounded-lg bg-inverse-surface/90 px-3 py-2 text-inverse-on-surface shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-label-sm">
            <span className="material-symbols-outlined text-tertiary-fixed-dim">download_for_offline</span>
            <span className="font-semibold">{t('offline.progress', { pct })}</span>
          </div>
          <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-white/20">
            <div className="h-full bg-tertiary-fixed-dim transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-white/70">
            {progress.done}/{progress.total} · {Math.round(progress.bytes / (1024 * 1024))} MB
            {progress.aborted && <span> · {t('offline.aborted')}</span>}
          </div>
        </div>
      )}
      {running ? (
        <button
          onClick={cancel}
          className="touch-safe flex items-center gap-2 rounded-full bg-error px-4 text-on-error shadow-xl active:scale-95"
        >
          <span className="material-symbols-outlined">stop_circle</span>
          <span className="text-label-sm font-bold uppercase tracking-widest">{t('common.back')}</span>
        </button>
      ) : (
        <button
          onClick={start}
          className="touch-safe flex items-center gap-2 rounded-full bg-primary px-4 text-on-primary shadow-xl active:scale-95"
        >
          <span className="material-symbols-outlined">download_for_offline</span>
          <span className="text-label-sm font-bold uppercase tracking-widest">
            {t('offline.downloadArea')}
          </span>
        </button>
      )}
    </div>
  );
}
