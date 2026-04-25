import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl, { type Map, type Marker } from 'maplibre-gl';
import type { Machine, MachineKind, Observation, Plot, Priority } from '@/data/types';
import { isStale, type Trails } from '@/data/machinesRepo';
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
  machineTrails?: Trails;
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
  // Fired when an overlay's WMS endpoint returns repeated 4xx errors
  // (typical signal that the layer name / CRS / version is wrong on the
  // server). The parent should drop the overlay from `activeOverlayIds`
  // and surface a toast — leaving it active just makes MapLibre retry
  // the broken endpoint on every pan/zoom forever.
  onOverlayFailed?: (id: string, reason: string) => void;
  // Fired when the active *basemap* WMS keeps failing. Parent should
  // swap baseLayerId back to a known-good basemap (typically satellite).
  onBaseFailed?: (id: string, reason: string) => void;
};

// Threshold of consecutive failures per overlay before we declare it
// broken and notify the parent to disable it. Picked high enough that a
// single transient timeout doesn't kill the layer, low enough that a
// genuinely-broken endpoint doesn't spam the console for long.
const OVERLAY_FAIL_THRESHOLD = 4;

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
    machineTrails = {},
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
    onOverlayFailed,
    onBaseFailed,
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
  // Per-overlay consecutive failure counts. Reset when the overlay is
  // re-enabled or removed. Lives in a ref because we don't want the
  // counter to trigger re-renders.
  // Use the global Map constructor explicitly — the file's `Map` import
  // from maplibre-gl shadows the built-in.
  const overlayFailsRef = useRef<globalThis.Map<string, number>>(new globalThis.Map());
  // Set of overlay ids we've already given up on. Prevents repeated
  // onOverlayFailed callbacks for the same dead endpoint.
  const overlayDeadRef = useRef<Set<string>>(new Set());
  // Same tracking for the active basemap.
  const baseFailsRef = useRef<{ id: string | null; n: number }>({ id: null, n: 0 });
  const baseDeadRef = useRef<Set<string>>(new Set());
  // Latest callback refs so the long-lived MapLibre `error` listener
  // (set up once at init) reads current values rather than stale closure
  // captures.
  const onOverlayFailedRef = useRef(onOverlayFailed);
  const onBaseFailedRef = useRef(onBaseFailed);
  useEffect(() => {
    onOverlayFailedRef.current = onOverlayFailed;
    onBaseFailedRef.current = onBaseFailed;
  }, [onOverlayFailed, onBaseFailed]);

  // Init once
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const center = initialCenter ? [initialCenter.lng, initialCenter.lat] : DEFAULT_CENTER;

    const base = layerById(baseLayerId) ?? LAYERS.find((l) => l.kind === 'base')!;
    baseFailsRef.current = { id: base.id, n: 0 };

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

    // Map errors come in three flavours we want to handle differently:
    //
    //   1. Tile decode / abort errors → silent (normal during pan/zoom).
    //   2. AJAXError 4xx for a specific overlay source → count failures
    //      per overlay; after OVERLAY_FAIL_THRESHOLD, fire onOverlayFailed
    //      so the parent can disable the layer. Logs the *first* failure
    //      per overlay only — MapLibre re-fetches tiles aggressively and
    //      otherwise floods the console with hundreds of identical 400s.
    //   3. Anything else → warn once.
    map.on('error', (e) => {
      const errAny = e.error as unknown as { status?: number; message?: string } | undefined;
      const msg = errAny?.message ?? '';
      if (msg.includes('could not be decoded') || msg.includes('AbortError')) return;

      // Identify the offending overlay by matching the error's source against
      // the OVERLAY_PREFIX-prefixed sources we manage. The MapLibre event
      // includes a `sourceId` on the source-data error variants.
      const sourceId =
        (e as unknown as { sourceId?: string }).sourceId ??
        // AJAXError carries a url; we can map it back via the source's
        // tile template, but we already prefix layer ids in the source id
        // so the sourceId field is the cheap path.
        '';
      const overlayPrefix = `${OVERLAY_PREFIX}src-`;
      const isHttp4xx = /4\d\d|status code 4\d\d|Bad Request|Not Found/i.test(msg);

      if (sourceId.startsWith(overlayPrefix) && isHttp4xx) {
        const overlayId = sourceId.slice(overlayPrefix.length);
        if (overlayDeadRef.current.has(overlayId)) return; // already given up
        const next = (overlayFailsRef.current.get(overlayId) ?? 0) + 1;
        overlayFailsRef.current.set(overlayId, next);
        if (next === 1) {
          // First failure: log once with full detail so it's debuggable
          // without being a console flood.
          console.warn('[map]', `overlay ${overlayId} failed:`, msg);
        }
        if (next >= OVERLAY_FAIL_THRESHOLD) {
          overlayDeadRef.current.add(overlayId);
          onOverlayFailedRef.current?.(overlayId, msg);
        }
        return;
      }

      // Base layer failure → ask parent to fall back. Same dedupe rules.
      if (sourceId === `${BASE_PREFIX}src` && isHttp4xx) {
        const baseId = baseFailsRef.current.id ?? '<unknown>';
        if (baseDeadRef.current.has(baseId)) return;
        baseFailsRef.current.n += 1;
        if (baseFailsRef.current.n === 1) {
          console.warn('[map]', `basemap ${baseId} failed:`, msg);
        }
        if (baseFailsRef.current.n >= OVERLAY_FAIL_THRESHOLD) {
          baseDeadRef.current.add(baseId);
          onBaseFailedRef.current?.(baseId, msg);
        }
        return;
      }

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
    // Reset failure tracking on swap — give the new basemap a clean budget.
    baseFailsRef.current = { id: baseLayerId, n: 0 };
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
        // Don't request WMS tiles below the layer's minZoom — the server
        // returns blank tiles by design and we'd just waste quota + battery.
        ...(def.minZoom != null ? { minzoom: def.minZoom } : {}),
      });
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: srcId,
        paint: { 'raster-opacity': 0.8 },
        ...(def.minZoom != null ? { minzoom: def.minZoom } : {}),
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

  // Plots GeoJSON layer. The user's hand-drawn plots are surfaced here as
  // soft fill + crisp outline + a centroid label so the owner can read
  // "Plot B-14" at a glance even when zoomed out. We keep the fill opacity
  // low (0.22) so it doesn't drown out the satellite imagery, but the line
  // is heavy (3px) so the boundary stays readable on busy backgrounds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = 'plots-src';
    const fillId = 'plots-fill';
    const lineId = 'plots-line';
    const labelId = 'plots-label';

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
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
        });
        map.addLayer({
          id: lineId,
          type: 'line',
          source: srcId,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 3,
            // White casing via line-blur gives the boundary a soft halo
            // so it reads against both light and dark satellite tiles.
            'line-blur': 0.5,
          },
        });
        // Labels render at the centroid of each polygon. MapLibre's
        // 'symbol-placement': 'point' on a Polygon source automatically
        // places at the visual centre.
        map.addLayer({
          id: labelId,
          type: 'symbol',
          source: srcId,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 13,
            'text-letter-spacing': 0.05,
            'text-allow-overlap': false,
            'text-ignore-placement': false,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': ['get', 'color'],
            'text-halo-width': 2,
          },
        });
      } else {
        (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(collection);
      }
    } else {
      if (map.getLayer(labelId)) map.removeLayer(labelId);
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

  // Machine trails — one LineString per machine, gradient-faded from
  // transparent at the oldest point to solid at the current position.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = 'machine-trails-src';
    const layerId = 'machine-trails-layer';

    const features = Object.entries(machineTrails)
      .filter(([, pts]) => pts.length >= 2 && showMachines)
      .map(([machineId, pts]) => ({
        type: 'Feature' as const,
        properties: { machineId },
        geometry: {
          type: 'LineString' as const,
          coordinates: pts.map((p) => [p.lng, p.lat] as [number, number]),
        },
      }));

    const collection = { type: 'FeatureCollection' as const, features };

    if (features.length > 0) {
      if (!map.getSource(srcId)) {
        map.addSource(srcId, { type: 'geojson', data: collection, lineMetrics: true });
        map.addLayer({
          id: layerId,
          type: 'line',
          source: srcId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': 4,
            // Gradient along the line: transparent at the oldest end (0),
            // Earthy Brown at the current-position end (1).
            'line-gradient': [
              'interpolate',
              ['linear'],
              ['line-progress'],
              0,
              'rgba(118, 88, 64, 0)',
              0.7,
              'rgba(118, 88, 64, 0.55)',
              1,
              '#765840',
            ],
          },
        });
      } else {
        (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(collection);
      }
    } else {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(srcId)) map.removeSource(srcId);
    }
  }, [machineTrails, showMachines, ready]);

  return <div ref={ref} className="absolute inset-0" />;
});

export default MapCanvas;
