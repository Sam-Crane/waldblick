import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl, { type Map, type Marker } from 'maplibre-gl';
import type { Machine, MachineKind, Observation, Plot, Priority } from '@/data/types';
import { isStale, type Trails } from '@/data/machinesRepo';
import { LAYERS, layerById } from './layers';
import { tilesTemplate } from './wms';
import { circleRing, rectangleRing, simplifySketch, type LngLat } from './draw';
import type { DrawTool } from './MapDrawTools';
import { buildBayernVectorStyle } from './bayernVectorStyle';

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

  // ---- Plot drawing ----
  // Active drawing tool. 'idle' disables all draw gestures (the map
  // behaves normally for pan/zoom/observation taps).
  drawTool?: DrawTool;
  // Stroke / fill colour for the in-progress shape.
  drawColor?: string;
  // The parent owns the polygon vertices for the polygon mode (so it
  // can show the running count, drive the Finish button, and undo).
  // For drag-based modes (rect, circle, sketch), MapCanvas tracks the
  // gesture internally and emits the final ring via onShapeComplete.
  polygonVertices?: LngLat[];
  onPolygonVertexAdded?: (v: LngLat) => void;
  // Fired with the closed ring (open form — first point != last) when
  // a drag-based shape commits or the user finishes a polygon.
  onShapeComplete?: (ring: LngLat[]) => void;
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
    drawTool = 'idle',
    drawColor = '#FF6B00',
    polygonVertices = [],
    onPolygonVertexAdded,
    onShapeComplete,
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

    // Always boot with a raster basemap we know how to template — the
    // swap effect below picks up vector-style or anything else once
    // `ready` flips true. Avoids needing tilesTemplate to handle every
    // layer kind for the very first paint.
    const requestedBase = layerById(baseLayerId);
    const base =
      requestedBase && (requestedBase.type === 'xyz' || requestedBase.type === 'wms')
        ? requestedBase
        : LAYERS.find((l) => l.kind === 'base' && (l.type === 'xyz' || l.type === 'wms'))!;
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

  // Swap basemap on toggle. Two paths:
  //
  //   - Raster basemap (xyz / wms): swap tiles on the existing
  //     `${BASE_PREFIX}src` source. Cheap, no style reload, our app
  //     layers (observations / plots / draw progress) stay alive.
  //
  //   - Vector-style basemap (Mapbox-GL JSON style URL): we have to
  //     call map.setStyle(url), which clears every source + layer on
  //     the map. We bump `ready` back to false during the load and
  //     true again on 'style.load' — this re-runs all the reconcile
  //     effects below, which re-add observations / plots / overlays
  //     on top of the new style.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const def = layerById(baseLayerId);
    if (!def || def.kind !== 'base') return;
    baseFailsRef.current = { id: baseLayerId, n: 0 };

    if (def.type === 'vector-style') {
      // setStyle wipes all sources + layers. Mark ourselves not-ready
      // so the reconcile effects below skip until 'style.load' fires,
      // then they all re-run because `ready` flips true again.
      //
      // The TileJSON URL we have for BayernAtlas (web_vektor_by.json)
      // is a *data* manifest, not a Mapbox-GL style. So we hand-build
      // the style at runtime in bayernVectorStyle.ts, with our own
      // forest-themed rendering rules. If we ever add a different
      // vector basemap, dispatch on def.id here.
      setReady(false);
      const styleSpec =
        def.id === 'base-bayern-vector' ? buildBayernVectorStyle() : def.url;
      map.setStyle(styleSpec, { diff: false });
      const onStyleLoad = () => {
        setReady(true);
        map.off('style.load', onStyleLoad);
      };
      map.on('style.load', onStyleLoad);
      return;
    }

    // Raster path: if the current map style has the BASE_PREFIX source
    // we own, just swap its tiles. Otherwise (we're switching FROM a
    // vector-style basemap), we have to add it from scratch.
    const existing = map.getSource(`${BASE_PREFIX}src`) as maplibregl.RasterTileSource | undefined;
    if (existing) {
      if ('setTiles' in existing && typeof (existing as unknown as { setTiles: (t: string[]) => void }).setTiles === 'function') {
        (existing as unknown as { setTiles: (t: string[]) => void }).setTiles(tilesTemplate(def));
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
    } else {
      // No raster source = we were on a vector style. Switch back to a
      // minimal raster style and re-add. setStyle resets ready.
      setReady(false);
      map.setStyle({
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          [`${BASE_PREFIX}src`]: {
            type: 'raster',
            tiles: tilesTemplate(def),
            tileSize: def.tileSize ?? 256,
            attribution: def.attribution,
          },
        },
        layers: [{ id: `${BASE_PREFIX}layer`, type: 'raster', source: `${BASE_PREFIX}src` }],
      });
      const onStyleLoad = () => {
        setReady(true);
        map.off('style.load', onStyleLoad);
      };
      map.on('style.load', onStyleLoad);
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

  // ---- Plot drawing ----
  //
  // Three gesture flavours, all driven off the `drawTool` prop:
  //
  //   polygon  — single tap adds a vertex. Parent-owned vertex array;
  //              we emit via onPolygonVertexAdded so the parent can
  //              show the running count and drive Undo.
  //   rect     — pointerdown anchors corner A, pointermove updates a
  //              live preview, pointerup commits a 4-vertex ring.
  //   circle   — pointerdown anchors centre, pointermove updates the
  //              radius, pointerup commits a 32-side approximation.
  //   sketch   — every pointermove between down and up appends a
  //              point; on up the path is simplified and committed.
  //
  // For all drag-based tools we disable map.dragPan during the gesture
  // (re-enabled on pointerup or tool-change cleanup) so the map doesn't
  // pan while the user is drawing.
  const dragGestureRef = useRef<{ kind: 'rectangle' | 'circle' | 'sketch'; start: LngLat; trail: LngLat[] } | null>(null);
  const [dragPreview, setDragPreview] = useState<LngLat[] | null>(null);

  // Stable refs to the latest callbacks — the gesture handlers stay
  // attached for the lifetime of a tool change, but we want them to
  // read the current `onPolygonVertexAdded` / `onShapeComplete` /
  // `polygonVertices` without re-binding on every parent state update.
  const onPolygonVertexAddedRef = useRef(onPolygonVertexAdded);
  const onShapeCompleteRef = useRef(onShapeComplete);
  useEffect(() => {
    onPolygonVertexAddedRef.current = onPolygonVertexAdded;
    onShapeCompleteRef.current = onShapeComplete;
  }, [onPolygonVertexAdded, onShapeComplete]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (drawTool === 'idle') return;

    // Polygon: tap-to-add. Single click on the map (no drag) appends
    // a vertex. Click on an existing observation marker is suppressed
    // by stopPropagation in the marker's click handler, so we don't
    // accidentally add a vertex when picking a marker.
    if (drawTool === 'polygon') {
      const onClick = (e: maplibregl.MapMouseEvent) => {
        const v: LngLat = [e.lngLat.lng, e.lngLat.lat];
        onPolygonVertexAddedRef.current?.(v);
      };
      map.on('click', onClick);
      return () => {
        map.off('click', onClick);
      };
    }

    // Drag-based tools share a pointerdown/move/up state machine.
    const startDrag = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      // Disable map pan for the duration of this gesture — we don't
      // want the map sliding under the user's finger while they draw.
      // Re-enabled in endDrag and in the cleanup return below.
      map.dragPan.disable();
      const ll: LngLat = [e.lngLat.lng, e.lngLat.lat];
      dragGestureRef.current = { kind: drawTool, start: ll, trail: [ll] };
      setDragPreview([ll]);
    };
    const moveDrag = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      const g = dragGestureRef.current;
      if (!g) return;
      const ll: LngLat = [e.lngLat.lng, e.lngLat.lat];
      if (g.kind === 'sketch') {
        g.trail.push(ll);
        // Live preview: render the in-progress trail. We update on
        // every move event — the trail is also what becomes the final
        // ring on commit.
        setDragPreview([...g.trail]);
      } else if (g.kind === 'rectangle') {
        setDragPreview(rectangleRing(g.start, ll));
      } else if (g.kind === 'circle') {
        setDragPreview(circleRing(g.start, ll));
      }
    };
    const endDrag = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      const g = dragGestureRef.current;
      dragGestureRef.current = null;
      map.dragPan.enable();
      if (!g) return;
      const ll: LngLat = [e.lngLat.lng, e.lngLat.lat];
      let ring: LngLat[] = [];
      if (g.kind === 'rectangle') {
        ring = rectangleRing(g.start, ll);
      } else if (g.kind === 'circle') {
        ring = circleRing(g.start, ll);
      } else if (g.kind === 'sketch') {
        // Last point may not be in trail (touchend without a final move
        // event); push it just in case, then simplify.
        if (g.trail[g.trail.length - 1] !== ll) g.trail.push(ll);
        ring = simplifySketch(g.trail);
      }
      setDragPreview(null);
      // A polygon needs ≥3 distinct vertices to be valid. Anything
      // smaller is almost certainly a stray tap — drop it silently.
      if (ring.length >= 3) onShapeCompleteRef.current?.(ring);
    };

    map.on('mousedown', startDrag);
    map.on('mousemove', moveDrag);
    map.on('mouseup', endDrag);
    map.on('touchstart', startDrag);
    map.on('touchmove', moveDrag);
    map.on('touchend', endDrag);

    return () => {
      map.off('mousedown', startDrag);
      map.off('mousemove', moveDrag);
      map.off('mouseup', endDrag);
      map.off('touchstart', startDrag);
      map.off('touchmove', moveDrag);
      map.off('touchend', endDrag);
      // If the tool changes mid-gesture, make sure pan is re-enabled
      // and we don't leak a stuck preview.
      map.dragPan.enable();
      dragGestureRef.current = null;
      setDragPreview(null);
    };
  }, [drawTool, ready]);

  // Render the in-progress shape on the map. We unify all four tools
  // here: whatever vertices exist (polygon-from-parent or drag-preview),
  // draw them as a coloured outline + soft fill + corner dots.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const srcId = 'draw-progress-src';
    const fillId = 'draw-progress-fill';
    const lineId = 'draw-progress-line';
    const dotsSrcId = 'draw-progress-dots-src';
    const dotsId = 'draw-progress-dots';

    const verts: LngLat[] = drawTool === 'polygon' ? polygonVertices : dragPreview ?? [];
    const visible = drawTool !== 'idle' && verts.length > 0;

    if (!visible) {
      if (map.getLayer(dotsId)) map.removeLayer(dotsId);
      if (map.getSource(dotsSrcId)) map.removeSource(dotsSrcId);
      if (map.getLayer(lineId)) map.removeLayer(lineId);
      if (map.getLayer(fillId)) map.removeLayer(fillId);
      if (map.getSource(srcId)) map.removeSource(srcId);
      return;
    }

    // Close the ring visually if we have ≥3 vertices, so the user sees
    // the shape they're committing. Sketch and rect/circle previews are
    // already closed by their generators.
    const closed = verts.length >= 3 ? [...verts, verts[0]] : verts;

    const lineFeature = {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: closed },
      properties: {},
    };
    const fillFeature =
      verts.length >= 3
        ? {
            type: 'Feature' as const,
            geometry: { type: 'Polygon' as const, coordinates: [closed] },
            properties: {},
          }
        : null;
    const dotsCollection = {
      type: 'FeatureCollection' as const,
      features: verts.map((v, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: v },
        properties: { recent: i === verts.length - 1 },
      })),
    };

    if (!map.getSource(srcId)) {
      map.addSource(srcId, { type: 'geojson', data: lineFeature });
      if (fillFeature) {
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: srcId,
          paint: { 'fill-color': drawColor, 'fill-opacity': 0.18 },
        });
      }
      map.addLayer({
        id: lineId,
        type: 'line',
        source: srcId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': drawColor, 'line-width': 3 },
      });
    } else {
      // Updating: swap to fill geometry if we just crossed the
      // 3-vertex threshold (or back to line-only if undone below it).
      const data = fillFeature ?? lineFeature;
      (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(data);
      if (fillFeature && !map.getLayer(fillId)) {
        map.addLayer(
          {
            id: fillId,
            type: 'fill',
            source: srcId,
            paint: { 'fill-color': drawColor, 'fill-opacity': 0.18 },
          },
          map.getLayer(lineId) ? lineId : undefined,
        );
      } else if (!fillFeature && map.getLayer(fillId)) {
        map.removeLayer(fillId);
      }
      // Keep paint in sync with the active colour.
      if (map.getLayer(lineId)) map.setPaintProperty(lineId, 'line-color', drawColor);
      if (map.getLayer(fillId)) map.setPaintProperty(fillId, 'fill-color', drawColor);
    }

    // Vertex dots — only meaningful for polygon mode. For drag tools
    // they'd flicker on every move, so we skip them.
    if (drawTool === 'polygon') {
      if (!map.getSource(dotsSrcId)) {
        map.addSource(dotsSrcId, { type: 'geojson', data: dotsCollection });
        map.addLayer({
          id: dotsId,
          type: 'circle',
          source: dotsSrcId,
          paint: {
            'circle-radius': ['case', ['get', 'recent'], 8, 6],
            'circle-color': drawColor,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
      } else {
        (map.getSource(dotsSrcId) as maplibregl.GeoJSONSource).setData(dotsCollection);
        if (map.getLayer(dotsId)) map.setPaintProperty(dotsId, 'circle-color', drawColor);
      }
    } else {
      if (map.getLayer(dotsId)) map.removeLayer(dotsId);
      if (map.getSource(dotsSrcId)) map.removeSource(dotsSrcId);
    }
  }, [drawTool, drawColor, polygonVertices, dragPreview, ready]);

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
