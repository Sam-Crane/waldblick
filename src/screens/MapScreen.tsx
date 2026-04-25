import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TopBar from '@/components/Layout/TopBar';
import InventoryStats from '@/components/InventoryStats';
import MapCanvas, { type MapCanvasHandle } from '@/map/MapCanvas';
import LayerPanel from '@/map/LayerPanel';
import ObservationSheet from '@/map/ObservationSheet';
import RouteCard from '@/map/RouteCard';
import MapDrawTools, { DRAW_COLORS, type DrawTool } from '@/map/MapDrawTools';
import GeoDebugPill from '@/map/GeoDebugPill';
import DownloadAreaButton from '@/map/DownloadAreaButton';
import { combinedBounds } from '@/map/bbox';
import type { LngLat } from '@/map/draw';
import { useMachines } from '@/data/useMachines';
import { useCurrentUser } from '@/data/currentUser';
import { useToast } from '@/components/Toast';
import { db } from '@/data/db';
import { plotsRepo } from '@/data/plotsRepo';
import type { Plot } from '@/data/types';
import { useTranslation } from '@/i18n';
import { directionsEnabled, fetchRoute, type Route } from '@/map/directions';

// Bumped when defaults change in a way that requires invalidating users'
// stored layer preferences. v3 dropped the (broken) BayernAtlas WMTS URLs
// I'd guessed at — anyone whose localStorage still pointed at them would
// otherwise keep hammering 404 endpoints on every map load.
const LAYERS_STORAGE_KEY = 'waldblick:map:layers:v3';

type StoredLayerState = {
  baseLayerId: string;
  activeOverlayIds: string[];
  showPlots: boolean;
  showObservations: boolean;
  showMachines: boolean;
};

const DEFAULT_STATE: StoredLayerState = {
  // Default basemap is Esri World Imagery — works everywhere, no external
  // configuration needed. BayernAtlas Luftbild + Parzellarkarte are
  // available as opt-in layers once VITE_BAYERN_*_XYZ env vars are set
  // (see layers.ts header for the discovery procedure).
  baseLayerId: 'base-satellite',
  activeOverlayIds: [],
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
  const toast = useToast();
  const location = useLocation() as { state?: { focusPlotId?: string } };
  const observations = useLiveQuery(() => db.observations.toArray(), []) ?? [];

  const [layerState, setLayerState] = useState<StoredLayerState>(loadLayers);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteState>({ kind: 'idle' });
  const [broadcasting, setBroadcasting] = useState(false);
  const [plots, setPlots] = useState<Plot[]>([]);
  const mapRef = useRef<MapCanvasHandle>(null);

  // ---- Plot drawing ----
  // Drawing UX is in three states:
  //   1. Tool not picked → toolbar visible, user picks a tool/colour
  //   2. Tool active, mid-shape → vertices accumulate (polygon) or drag
  //      gesture is live (rect/circle/sketch); preview rendered on map
  //   3. Shape committed → naming sheet opens, on submit the plot is
  //      saved + the toolbar resets to idle
  const [drawTool, setDrawTool] = useState<DrawTool>('idle');
  const [drawColor, setDrawColor] = useState<string>(DRAW_COLORS[0]);
  const [polygonVertices, setPolygonVertices] = useState<LngLat[]>([]);
  const [pendingShape, setPendingShape] = useState<LngLat[] | null>(null);
  const [savingName, setSavingName] = useState('');
  const [savingBusy, setSavingBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void plotsRepo.list().then((list) => {
      if (!cancelled) setPlots(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fit the map to whatever the user actually has data on — priority order:
  //   1. focusPlotId from navigation state (e.g. after saving a plot)
  //   2. combined bbox of plots + observations
  // Done once per mount; we don't refit on every observation change so
  // users can pan freely without snapping back.
  const fittedRef = useRef(false);
  useEffect(() => {
    const handle = mapRef.current;
    if (!handle || fittedRef.current) return;
    if (plots.length === 0 && observations.length === 0) return;

    if (location.state?.focusPlotId) {
      const p = plots.find((x) => x.id === location.state!.focusPlotId);
      if (p) {
        const singleBounds = combinedBounds([p], []);
        if (singleBounds) {
          handle.fitBounds(singleBounds);
          fittedRef.current = true;
          return;
        }
      }
    }

    const b = combinedBounds(plots, observations);
    if (b) {
      handle.fitBounds(b);
      fittedRef.current = true;
    }
  }, [plots, observations, location.state]);

  // Broadcast interval: derive machine kind from user role.
  const machineKind = me.role === 'operator' ? 'harvester' : 'other';
  const { machines, trails } = useMachines(
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

  // Reset polygon vertices whenever the user switches *away* from polygon
  // mode (e.g. picks rectangle, or hits Cancel) — otherwise the next time
  // they re-enter polygon mode, the old half-finished shape would still
  // be there.
  useEffect(() => {
    if (drawTool !== 'polygon') setPolygonVertices([]);
  }, [drawTool]);

  const cancelDrawing = () => {
    setDrawTool('idle');
    setPolygonVertices([]);
    setPendingShape(null);
  };

  // Polygon Finish: commit the in-flight vertex array as a pending shape
  // and open the naming sheet. Drag-based tools commit directly via
  // onShapeComplete.
  const finishPolygon = () => {
    if (polygonVertices.length < 3) return;
    setPendingShape(polygonVertices);
    setPolygonVertices([]);
    setDrawTool('idle');
  };

  const handleShapeComplete = (ring: LngLat[]) => {
    setPendingShape(ring);
    // Drag-based tools auto-leave the tool after commit so the user can
    // tap a marker / pan / zoom while they're naming. Polygon stays
    // active until Finish, handled separately above.
    if (drawTool !== 'polygon') setDrawTool('idle');
  };

  const savePlot = async () => {
    if (!pendingShape || !savingName.trim()) return;
    setSavingBusy(true);
    const ring = [...pendingShape, pendingShape[0]];
    const result = await plotsRepo.create({
      name: savingName.trim(),
      color: drawColor,
      boundary: { type: 'Polygon', coordinates: [ring] },
    });
    setSavingBusy(false);
    if (!result.ok) {
      toast.error(t(`plots.createErr.${result.error}`));
      return;
    }
    toast.success(t('plots.created', { name: result.plot.name }));
    setPlots((list) => [...list, result.plot]);
    setPendingShape(null);
    setSavingName('');
  };

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
            observations={observations}
            plots={plots}
            machines={machines}
            machineTrails={trails}
            baseLayerId={layerState.baseLayerId}
            activeOverlayIds={layerState.activeOverlayIds}
            showPlots={layerState.showPlots}
            showObservations={layerState.showObservations}
            showMachines={layerState.showMachines}
            onMarkerTap={setSelectedId}
            onLongPress={onLongPress}
            onGeolocateError={(code, message) => {
              // 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT.
              // Each gets a distinct i18n key so the user knows exactly what
              // to fix (settings vs signal vs retry).
              const key =
                code === 1
                  ? 'geolocate.permissionDenied'
                  : code === 2
                    ? 'geolocate.positionUnavailable'
                    : code === 3
                      ? 'geolocate.timeout'
                      : 'geolocate.unknown';
              toast.error(`${t(key)}${code ? ` (${message})` : ''}`);
            }}
            onGeolocateSuccess={(accuracy) => {
              if (accuracy > 500) toast.show(t('geolocate.lowAccuracy', { m: Math.round(accuracy) }), { tone: 'warning' });
            }}
            routeCoords={route.kind === 'ready' ? route.route.coordinates : undefined}
            onOverlayFailed={(id) => {
              // The overlay's WMS endpoint returned repeated 4xx — drop it
              // from the active set so MapLibre stops hammering it, and
              // tell the user why their parcel grid disappeared.
              setLayerState((s) => ({
                ...s,
                activeOverlayIds: s.activeOverlayIds.filter((x) => x !== id),
              }));
              toast.show(t('map.layerFailed'), { tone: 'warning' });
            }}
            onBaseFailed={(id) => {
              // Active basemap WMS is broken — fall back to the satellite
              // layer (always available, no licensing). Don't loop if the
              // user is *already* on satellite.
              if (id === 'base-satellite') return;
              setLayerState((s) => ({ ...s, baseLayerId: 'base-satellite' }));
              toast.show(t('map.basemapFailed'), { tone: 'warning' });
            }}
            drawTool={drawTool}
            drawColor={drawColor}
            polygonVertices={polygonVertices}
            onPolygonVertexAdded={(v) => setPolygonVertices((vs) => [...vs, v])}
            onShapeComplete={handleShapeComplete}
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

          {/* Plot drawing toolbar — same slot the priority filter used to
              occupy (below inventory pill on mobile, centred-top on tablet). */}
          <div className="pointer-events-none absolute left-4 top-[72px] z-10 md:left-1/2 md:top-4 md:-translate-x-1/2">
            <MapDrawTools
              tool={drawTool}
              color={drawColor}
              onToolChange={setDrawTool}
              onColorChange={setDrawColor}
              hasInProgress={drawTool === 'polygon' && polygonVertices.length > 0}
              vertexCount={polygonVertices.length}
              onCancel={cancelDrawing}
              onFinish={finishPolygon}
            />
          </div>

          {/* Naming sheet — appears once a shape is committed, asks the
              user for a plot name, then writes through plotsRepo. */}
          {pendingShape && (
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 border-t border-outline-variant bg-surface-container-lowest p-margin-main pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void savePlot();
                }}
                className="mx-auto flex max-w-xl flex-col gap-stack-md"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-6 w-6 shrink-0 rounded-full border-2"
                    style={{ backgroundColor: drawColor + '40', borderColor: drawColor }}
                    aria-hidden
                  />
                  <p className="flex-1 text-label-md font-semibold text-on-surface">
                    {t('draw.savePrompt', { n: pendingShape.length })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPendingShape(null)}
                    className="text-label-sm font-semibold text-outline underline"
                  >
                    {t('draw.cancel')}
                  </button>
                </div>
                <input
                  required
                  autoFocus
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  placeholder={t('plots.namePlaceholder')}
                  className="rounded-md border-b-2 border-outline-variant bg-surface-container-lowest p-3 text-body-md outline-none focus:border-primary-container"
                />
                <button
                  type="submit"
                  disabled={savingBusy || !savingName.trim()}
                  className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg bg-safety font-bold uppercase tracking-widest text-white shadow-lg active:scale-95 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined">save</span>
                  {savingBusy ? t('plots.saving') : t('plots.save')}
                </button>
              </form>
            </div>
          )}

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
