import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TopBar from '@/components/Layout/TopBar';
import { db } from '@/data/db';
import { useTranslation } from '@/i18n';

// Phase 2 will mount MapLibre here with the layer stack from src/map/layers.ts,
// and surface the Inventory Scan stats as a bottom sheet on mobile / right pane on tablet+.
export default function MapScreen() {
  const t = useTranslation();
  const observations = useLiveQuery(() => db.observations.toArray(), []) ?? [];
  const critical = observations.filter((o) => o.priority === 'critical' && o.status !== 'resolved').length;

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Waldblick" />
      <div className="relative flex-1 bg-surface-container">
        <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant">
          <div className="max-w-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-center">
            <span className="material-symbols-outlined mb-2 text-4xl text-primary">map</span>
            <p className="text-body-md">{t('map.placeholder')}</p>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-lg bg-inverse-surface/80 px-3 py-1.5 text-inverse-on-surface backdrop-blur-md">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
              {t('map.coordinates')}
            </span>
            <span className="text-label-sm">48.137° N, 11.575° E</span>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <span className="material-symbols-outlined">explore</span>
        </div>

        {/* Inventory Scan preview — Phase 2 will expand this into a bottom sheet / side panel. */}
        <Link
          to="/dashboard"
          className="absolute right-4 top-4 flex items-center gap-3 rounded-lg bg-primary px-3 py-2 text-on-primary shadow-lg active:scale-95"
        >
          <span className="material-symbols-outlined">space_dashboard</span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-fixed-dim">
              {t('map.inventoryScan')}
            </span>
            <span className="text-label-md font-bold">
              {t('map.inventoryCounts', { total: observations.length, critical })}
            </span>
          </div>
          <span className="material-symbols-outlined text-primary-fixed-dim">chevron_right</span>
        </Link>
      </div>
    </div>
  );
}
