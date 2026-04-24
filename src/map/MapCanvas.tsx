import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl, { type Map, type Marker } from 'maplibre-gl';
import type { Machine, MachineKind, Observation, Plot, Priority } from '@/data/types';
import { isStale } from '@/data/machinesRepo';
import { LAYERS, layerById } from './layers';
import { tilesTemplate } from './wms';

export type MapCanvasHandle = {
  getBounds: () => maplibregl.LngLatBounds | null;
  fitBounds: (bounds: [[number, number], [number, number]], padding?: number) => void;
  flyTo: (latlng: { lat: number; lng: number }, zoom?: number) => void;
};

type Props = {
  observations: Observation[];
  plots?: Plot[];
  machines?: Machine[];
  baseLayerId: string;
  activeOverlayIds: string[];
  showPlots?: boolean;
  showObservations?: boolean;
  showMachines?: boolean;
  onMarkerTap: (id: string) => void;
  onLongPress?: (latlng: { lat: number; lng: number }) => void;
  onGeolocateError?: (code: number, message: string) => void;
  onGeolocateSuccess?: (accuracy: number) => void;
  routeCoords?: [number, number][]; // [lng, lat][]
  initialCenter?: { lat: number; lng: number };
};

const MACHINE_ICON: Record<MachineKind, string> = {
  harvester: 'construction',
  forwarder: 'local_shipping',
  maintenance: 'build',
  other: 'agriculture',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DEFAULT_CENTER: [number, number] = [11.575, 48.137]; // Munich, Bavaria
const DEFAULT_ZOOM = 10;

const priorityColor: Record<Priority, string> = {
  critical: '#ba1a1a',
  medium: '#4f1c00',
  low: '#2d4739',
};

// All layer ids get a stable prefix in MapLibre's internal registry so we can
// add/remove by toggle without clobbering the basemap or marker layers.
const BASE_PREFIX = 'base-';
const OVERLAY_PREFIX = 'overlay-';

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  {
    observations,
    plots = [],
    machines = [],
    baseLayerId,
    activeOverlayIds,
    showPlots = true,
    showObservations = true,
    showMachines = true,
    onMarkerTap,
    onLongPress,
    onGeolocateError,
    onGeolocateSuccess,
    routeCoords,
    initialCenter,
  },
  handleRef,
) {
  useImperativeHandle(handleRef, () => ({
    getBounds: () => mapRef.current?.getBounds() ?? null,
    fitBounds: (bounds, padding = 60) => {
      mapRef.current?.fitBounds(bounds, { padding, duration: 600, maxZoom: 15 });
    },
    flyTo: (latlng, zoom = 14) => {
      mapRef.current?.flyTo({ center: [latlng.lng, latlng.lat], zoom, duration: 800 });
    },
  }));
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const machineMarkersRef = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);

  // Init once
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const center = initialCenter ? [initialCenter.lng, initialCenter.lat] : DEFAULT_CENTER;

    const base = layerById(baseLayerId) ?? LAYERS.find((l) => l.kind === 'base')!;

    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          [`${BASE_PREFIX}src`]: {
            type: 'raster',
            tiles: tilesTemplate(base),
            tileSize: base.tileSize ?? 256,
            attribution: base.attribution,
          },
        },
        layers: [
          {
            id: `${BASE_PREFIX}layer`,
            type: 'raster',
            source: `${BASE_PREFIX}src`,
          },
        ],
      },
      center: center as [number, number],
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    const geolocate = new maplibregl.GeolocateControl({
      // Explicit timeout + maximumAge so the control can't hang indefinitely.
      // enableHighAccuracy=true asks for GPS; if it's slow (indoors, weak signal)
      // the 15s ceiling kicks in and the error event fires so the UI can recover.
      positionOptions: { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      trackUserLocation: true,
      showAccuracyCircle: true,
      showUserLocation: true,
    });
    map.addControl(geolocate, 'top-right');
    if (onGeolocateError) {
      geolocate.on('error', (e) => {
        const err = e as GeolocationPositionError;
        onGeolocateError(err.code ?? 0, err.message ?? 'geolocation failed');
      });
    }
    if (onGeolocateSuccess) {
      geolocate.on('geolocate', (e) => {
        const pos = e as GeolocationPosition;
        onGeolocateSuccess(pos.coords.accuracy);
      });
    }
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      setReady(true);
    });

    // Downgrade WMS tile-decode errors (empty / HTML responses for tiles
    // outside a WMS's coverage area) from noisy uncaught rejections to
    // quiet warnings. Other errors still surface for debugging.
    map.on('error', (e) => {
      const msg = e.error?.message ?? '';
      if (msg.includes('could not be decoded') || msg.includes('AbortError')) return;
      console.warn('[map]', msg);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap basemap on toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const def = layerById(baseLayerId);
    if (!def || def.kind !== 'base') return;
    const src = map.getSource(`${BASE_PREFIX}src`) as maplibregl.RasterTileSource | undefined;
    if (!src) return;
    // Reset tiles via the private `setTiles` when available; fall back to remove+add.
    if ('setTiles' in src && typeof (src as unknown as { setTiles: (t: string[]) => void }).setTiles === 'function') {
      (src as unknown as { setTiles: (t: string[]) => void }).setTiles(tilesTemplate(def));
    } else {
      map.removeLayer(`${BASE_PREFIX}layer`);
      map.removeSource(`${BASE_PREFIX}src`);
      map.addSource(`${BASE_PREFIX}src`, {
        type: 'raster',
        tiles: tilesTemplate(def),
        tileSize: def.tileSize ?? 256,
        attribution: def.attribution,
      });
      map.addLayer({ id: `${BASE_PREFIX}layer`, type: 'raster', source: `${BASE_PREFIX}src` }, undefined);
    }
  }, [baseLayerId, ready]);

  // Reconcile overlay layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const style = map.getStyle();
    const existing = new Set(
      (style?.layers ?? [])
        .filter((l) => l.id.startsWith(OVERLAY_PREFIX + 'layer-'))
        .map((l) => l.id.replace(OVERLAY_PREFIX + 'layer-', '')),
    );
    const wanted = new Set(activeOverlayIds);

    for (const id of existing) {
      if (wanted.has(id)) continue;
      const layerId = `${OVERLAY_PREFIX}layer-${id}`;
      const srcId = `${OVERLAY_PREFIX}src-${id}`;
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(srcId)) map.removeSource(srcId);
    }

    for (const id of wanted) {
      if (existing.has(id)) continue;
      const def = layerById(id);
      if (!def || def.kind !== 'overlay') continue;
      const srcId = `${OVERLAY_PREFIX}src-${id}`;
      const layerId = `${OVERLAY_PREFIX}layer-${id}`;
      map.addSource(srcId, {
        type: 'raster',
        tiles: tilesTemplate(def),
        tileSize: def.tileSize ?? 256,
        attribution: def.attribution,
      });
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: srcId,
        paint: { 'raster-opacity': 0.8 },
      });
    }
  }, [activeOverlayIds, ready]);

  // Long-press: desktop contextmenu + mobile touch hold
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !onLongPress) return;

    const ctx = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      onLongPress({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    map.on('contextmenu', ctx);

    let timer: number | null = null;
    let startLL: maplibregl.LngLat | null = null;
    const onTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length !== 1) return;
      startLL = e.lngLat;
      timer = window.setTimeout(() => {
        if (startLL) onLongPress({ lat: startLL.lat, lng: startLL.lng });
        timer = null;
        startLL = null;
      }, 550);
    };
    const cancel = () => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
      startLL = null;
    };
    map.on('touchstart', onTouchStart);
    map.on('touchmove', cancel);
    map.on('touchend', cancel);
    map.on('touchcancel', cancel);

    return () => {
      map.off('contextmenu', ctx);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', cancel);
      map.off('touchend', cancel);
      map.off('touchcancel', cancel);
      cancel();
    };
  }, [onLongPress, ready]);

  // Route line source+layer reconciliation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = 'route-src';
    const layerId = 'route-layer';
    const casingId = 'route-casing';

    const geojson = routeCoords?.length
      ? {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: routeCoords },
          properties: {},
        }
      : null;

    if (geojson) {
      if (!map.getSource(srcId)) {
        map.addSource(srcId, { type: 'geojson', data: geojson });
        map.addLayer({
          id: casingId,
          type: 'line',
          source: srcId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.85 },
        });
        map.addLayer({
          id: layerId,
          type: 'line',
          source: srcId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#FF6B00', 'line-width': 5 },
        });
      } else {
        (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(geojson);
      }
    } else {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getLayer(casingId)) map.removeLayer(casingId);
      if (map.getSource(srcId)) map.removeSource(srcId);
    }
  }, [routeCoords, ready]);

  // Plots GeoJSON layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = 'plots-src';
    const fillId = 'plots-fill';
    const lineId = 'plots-line';

    const collection = {
      type: 'FeatureCollection' as const,
      features: plots.map((p) => ({
        type: 'Feature' as const,
        geometry: p.boundary,
        properties: { id: p.id, name: p.name, color: p.color ?? '#173124' },
      })),
    };

    if (showPlots && collection.features.length > 0) {
      if (!map.getSource(srcId)) {
        map.addSource(srcId, { type: 'geojson', data: collection });
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: srcId,
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
        });
        map.addLayer({
          id: lineId,
          type: 'line',
          source: srcId,
          paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
        });
      } else {
        (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(collection);
      }
    } else {
      if (map.getLayer(lineId)) map.removeLayer(lineId);
      if (map.getLayer(fillId)) map.removeLayer(fillId);
      if (map.getSource(srcId)) map.removeSource(srcId);
    }
  }, [plots, showPlots, ready]);

  // Reconcile markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const m of markersRef.current) m.remove();
    if (!showObservations) {
      markersRef.current = [];
      return;
    }
    const fresh: Marker[] = observations.map((o) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('aria-label', o.description || o.category);
      el.className =
        'group flex flex-col items-center -translate-y-1/2 transition-transform active:scale-95 focus:outline-none';
      el.innerHTML = `
        <span class="h-3 w-3 rounded-full border-2 border-white shadow-md" style="background:${priorityColor[o.priority]}"></span>
        <span class="mt-0.5 h-3 w-px bg-white/70"></span>
      `;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onMarkerTap(o.id);
      });
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([o.lng, o.lat]).addTo(map);
    });
    markersRef.current = fresh;
  }, [observations, ready, onMarkerTap, showObservations]);

  // Machine markers — separate from observations so they can toggle independently
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const m of machineMarkersRef.current) m.remove();
    if (!showMachines) {
      machineMarkersRef.current = [];
      return;
    }
    const fresh: Marker[] = machines.map((m) => {
      const stale = isStale(m);
      const el = document.createElement('div');
      el.className = `flex flex-col items-center ${stale ? 'opacity-50' : ''}`;
      el.innerHTML = `
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-on-secondary shadow-lg border-2 border-white">
          <span class="material-symbols-outlined text-[18px]">${MACHINE_ICON[m.kind]}</span>
        </span>
        ${m.label ? `<span class="mt-0.5 rounded bg-inverse-surface/80 px-1.5 py-0.5 text-[10px] font-bold text-inverse-on-surface backdrop-blur-md">${escapeHtml(m.label)}</span>` : ''}
      `;
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([m.lng, m.lat]).addTo(map);
    });
    machineMarkersRef.current = fresh;
  }, [machines, ready, showMachines]);

  return <div ref={ref} className="absolute inset-0" />;
});

export default MapCanvas;
