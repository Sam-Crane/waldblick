import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TopBar from '@/components/Layout/TopBar';
import InventoryStats from '@/components/InventoryStats';
import MapCanvas, { type MapCanvasHandle } from '@/map/MapCanvas';
import LayerPanel from '@/map/LayerPanel';
import ObservationSheet from '@/map/ObservationSheet';
import RouteCard from '@/map/RouteCard';
import MapFilterBar from '@/map/MapFilterBar';
import GeoDebugPill from '@/map/GeoDebugPill';
import DownloadAreaButton from '@/map/DownloadAreaButton';
import { useMachines } from '@/data/useMachines';
import { useCurrentUser } from '@/data/currentUser';
import { db } from '@/data/db';
import { plotsRepo } from '@/data/plotsRepo';
import type { Plot, Priority } from '@/data/types';
import { useTranslation } from '@/i18n';
import { directionsEnabled, fetchRoute, type Route } from '@/map/directions';

const LAYERS_STORAGE_KEY = 'waldblick:map:layers:v2';

type StoredLayerState = {
  baseLayerId: string;
  activeOverlayIds: string[];
  showPlots: boolean;
  showObservations: boolean;
  showMachines: boolean;
};

const DEFAULT_STATE: StoredLayerState = {
  baseLayerId: 'base-satellite',
  activeOverlayIds: ['overlay-alkis-parzellar'],
  showPlots: true,
  showObservations: true,
  showMachines: true,
};

function loadLayers(): StoredLayerState {
  if (typeof localStorage === 'undefined') return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(LAYERS_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<StoredLayerState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

type RouteState =
  | { kind: 'idle' }
  | { kind: 'loading'; dest: { lat: number; lng: number } }
  | { kind: 'ready'; route: Route }
  | { kind: 'error'; message: string };

export default function MapScreen() {
  const t = useTranslation();
  const me = useCurrentUser();
  const observations = useLiveQuery(() => db.observations.toArray(), []) ?? [];

  const [layerState, setLayerState] = useState<StoredLayerState>(loadLayers);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteState>({ kind: 'idle' });
  const [priorityFilter, setPriorityFilter] = useState<Set<Priority>>(new Set());
  const [broadcasting, setBroadcasting] = useState(false);
  const [plots, setPlots] = useState<Plot[]>([]);
  const mapRef = useRef<MapCanvasHandle>(null);

  useEffect(() => {
    let cancelled = false;
    void plotsRepo.list().then((list) => {
      if (!cancelled) setPlots(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Broadcast interval: derive machine kind from user role.
  const machineKind = me.role === 'operator' ? 'harvester' : 'other';
  const machines = useMachines(
    broadcasting ? { kind: machineKind, label: me.name } : null,
  );

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify(layerState));
    }
  }, [layerState]);

  const toggleOverlay = (id: string) =>
    setLayerState((s) => ({
      ...s,
      activeOverlayIds: s.activeOverlayIds.includes(id)
        ? s.activeOverlayIds.filter((x) => x !== id)
        : [...s.activeOverlayIds, id],
    }));

  const togglePriority = (p: Priority) => {
    const next = new Set(priorityFilter);
    next.has(p) ? next.delete(p) : next.add(p);
    setPriorityFilter(next);
  };

  const visibleObservations = useMemo(
    () =>
      priorityFilter.size === 0
        ? observations
        : observations.filter((o) => priorityFilter.has(o.priority)),
    [observations, priorityFilter],
  );

  const onLongPress = (dest: { lat: number; lng: number }) => {
    if (!directionsEnabled) {
      setRoute({ kind: 'error', message: 'not_configured' });
      return;
    }
    setRoute({ kind: 'loading', dest });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetchRoute({ lat: pos.coords.latitude, lng: pos.coords.longitude }, dest);
          setRoute({ kind: 'ready', route: r });
        } catch (e) {
          const code = (e as Error).message?.replace(/^directions_/, '') ?? 'unknown';
          setRoute({ kind: 'error', message: code });
        }
      },
      () => setRoute({ kind: 'error', message: 'no_location' }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="relative flex h-full flex-col">
      <TopBar
        title="Waldblick"
        trailing={
          <button
            onClick={() => setPanelOpen(true)}
            className="touch-safe flex items-center justify-center rounded-lg text-primary-container hover:bg-surface-container"
            aria-label={t('mapPanel.title')}
          >
            <span className="material-symbols-outlined">layers</span>
          </button>
        }
      />
      {/* Split-view on tablet+: map left, inventory panel right */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <MapCanvas
            ref={mapRef}
            observations={visibleObservations}
            plots={plots}
            machines={machines}
            baseLayerId={layerState.baseLayerId}
            activeOverlayIds={layerState.activeOverlayIds}
            showPlots={layerState.showPlots}
            showObservations={layerState.showObservations}
            showMachines={layerState.showMachines}
            onMarkerTap={setSelectedId}
            onLongPress={onLongPress}
            routeCoords={route.kind === 'ready' ? route.route.coordinates : undefined}
          />

          {/* Mobile-only: Inventory Scan pill linking to Dashboard */}
          <Link
            to="/dashboard"
            className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded-lg bg-primary px-3 py-2 text-on-primary shadow-lg active:scale-95 md:hidden"
          >
            <span className="material-symbols-outlined">space_dashboard</span>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary-fixed-dim">
                {t('map.inventoryScan')}
              </span>
              <span className="text-label-md font-bold">
                {t('map.inventoryCounts', {
                  total: observations.length,
                  critical: observations.filter((o) => o.priority === 'critical' && o.status !== 'resolved').length,
                })}
              </span>
            </div>
            <span className="material-symbols-outlined text-primary-fixed-dim">chevron_right</span>
          </Link>

          {/* Priority filter bar — below the pill on mobile, centered top on tablet+ */}
          <div className="pointer-events-none absolute left-4 top-[72px] z-10 md:left-1/2 md:top-4 md:-translate-x-1/2">
            <MapFilterBar active={priorityFilter} onToggle={togglePriority} />
          </div>

          <GeoDebugPill />

          <DownloadAreaButton
            getBounds={() => mapRef.current?.getBounds() ?? null}
            activeLayerIds={[layerState.baseLayerId, ...layerState.activeOverlayIds]}
          />

          {directionsEnabled && route.kind === 'idle' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-0 flex justify-center">
              <p className="pointer-events-auto rounded-full bg-inverse-surface/80 px-3 py-1 text-label-sm text-inverse-on-surface backdrop-blur-md">
                {t('directions.hint')}
              </p>
            </div>
          )}
        </div>

        {/* Tablet+: inventory side panel */}
        <aside className="hidden w-80 shrink-0 overflow-y-auto bg-primary px-margin-main py-stack-lg text-on-primary md:block">
          <h2 className="mb-stack-md text-headline-md font-semibold">{t('map.inventoryScan')}</h2>
          <InventoryStats observations={observations} variant="dark" />
          <Link
            to="/record"
            className="touch-safe mt-stack-lg flex w-full items-center justify-center gap-3 rounded-lg bg-tertiary-fixed-dim font-black uppercase tracking-widest text-on-tertiary-fixed shadow-xl active:scale-95"
          >
            <span className="material-symbols-outlined">add_a_photo</span>
            {t('dashboard.newObservation')}
          </Link>
        </aside>
      </div>

      <LayerPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        baseLayerId={layerState.baseLayerId}
        onBaseChange={(id) => setLayerState((s) => ({ ...s, baseLayerId: id }))}
        activeOverlayIds={layerState.activeOverlayIds}
        onOverlayToggle={toggleOverlay}
        showPlots={layerState.showPlots}
        onShowPlotsChange={(v) => setLayerState((s) => ({ ...s, showPlots: v }))}
        showObservations={layerState.showObservations}
        onShowObservationsChange={(v) => setLayerState((s) => ({ ...s, showObservations: v }))}
        showMachines={layerState.showMachines}
        onShowMachinesChange={(v) => setLayerState((s) => ({ ...s, showMachines: v }))}
        broadcasting={broadcasting}
        onBroadcastChange={setBroadcasting}
      />
      <ObservationSheet id={selectedId} onClose={() => setSelectedId(null)} />

      {route.kind !== 'idle' && (
        <RouteCard
          state={route.kind === 'loading' ? 'loading' : route.kind === 'ready' ? 'ready' : 'error'}
          route={route.kind === 'ready' ? route.route : undefined}
          error={route.kind === 'error' ? route.message : undefined}
          onClose={() => setRoute({ kind: 'idle' })}
        />
      )}
    </div>
  );
}
