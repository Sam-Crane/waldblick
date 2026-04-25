import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map } from 'maplibre-gl';
import { LAYERS, layerById } from './layers';
import { tilesTemplate } from './wms';

// Drawable MapLibre canvas. Each tap on the map appends a vertex to
// `vertices` (callback to parent so the parent owns the state). We render
// the in-progress polygon live:
//
//   - One LineString through the vertices (auto-closes once `closed` is true)
//   - A filled Polygon underneath, only when ≥3 vertices and `closed` is true
//   - A circular dot at every vertex; the most recent one is highlighted so
//     gloved-finger taps have visual feedback
//
// The closing duplicate point (GeoJSON polygons require ring[0] === ring[n])
// is NOT stored in `vertices` — it's only added at render time and at save
// time. Keeps state clean and undo predictable.

type Props = {
  vertices: [number, number][]; // [lng, lat], no closing duplicate
  onChange: (next: [number, number][]) => void;
  closed: boolean;
  initialCenter?: { lat: number; lng: number };
};

const DEFAULT_CENTER: [number, number] = [11.575, 48.137]; // Munich, Bavaria
const DEFAULT_ZOOM = 14; // closer than the overview map — owners draw at forest scale

const SAFETY = '#FF6B00';

export default function PlotDrawMap({ vertices, onChange, closed, initialCenter }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [ready, setReady] = useState(false);
  // Local basemap toggle — small subset (Sat / Topo) since the user is
  // focused on drawing, not exploring layers.
  const baseChoices = LAYERS.filter((l) => l.kind === 'base').slice(0, 3);
  const [baseId, setBaseId] = useState(baseChoices[0]?.id ?? 'base-satellite');

  // init once
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const center = initialCenter ? [initialCenter.lng, initialCenter.lat] : DEFAULT_CENTER;
    const base = layerById(baseId) ?? baseChoices[0];
    if (!base) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'base-src': {
            type: 'raster',
            tiles: tilesTemplate(base),
            tileSize: base.tileSize ?? 256,
            attribution: base.attribution,
          },
        },
        layers: [{ id: 'base-layer', type: 'raster', source: 'base-src' }],
      },
      center: center as [number, number],
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
        // Don't follow the user's heading: while they walk the boundary they
        // need to pan freely to add vertices. Tapping the locate button still
        // flies them to their position once.
        trackUserLocation: false,
        showUserLocation: true,
      }),
      'top-right',
    );
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
    map.on('load', () => setReady(true));
    map.on('error', (e) => {
      const msg = e.error?.message ?? '';
      if (msg.includes('could not be decoded') || msg.includes('AbortError')) return;
      console.warn('[plot-draw]', msg);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // basemap swap
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const def = layerById(baseId);
    if (!def || def.kind !== 'base') return;
    const src = map.getSource('base-src') as maplibregl.RasterTileSource | undefined;
    if (!src) return;
    if ('setTiles' in src && typeof (src as unknown as { setTiles: (t: string[]) => void }).setTiles === 'function') {
      (src as unknown as { setTiles: (t: string[]) => void }).setTiles(tilesTemplate(def));
    }
  }, [baseId, ready]);

  // Tap → append vertex. Re-attach when `closed` flips so we can lock the
  // map (no edits) once the user has hit Finish.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (closed) return; // stop accepting taps once closed; user must hit Continue to edit
    const handler = (e: maplibregl.MapMouseEvent) => {
      onChange([...vertices, [e.lngLat.lng, e.lngLat.lat]]);
    };
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [vertices, ready, onChange, closed]);

  // Render line + fill + vertex dots
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const lineSrc = 'draw-line-src';
    const lineLayer = 'draw-line-layer';
    const fillSrc = 'draw-fill-src';
    const fillLayer = 'draw-fill-layer';
    const dotSrc = 'draw-dot-src';
    const dotLayer = 'draw-dot-layer';

    // Vertex dots — one Point feature per vertex.
    const dotData = {
      type: 'FeatureCollection' as const,
      features: vertices.map((v, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: v },
        properties: {
          i,
          // Highlight the most recent vertex so the user sees their last tap.
          recent: i === vertices.length - 1 && !closed,
        },
      })),
    };

    if (!map.getSource(dotSrc)) {
      map.addSource(dotSrc, { type: 'geojson', data: dotData });
      map.addLayer({
        id: dotLayer,
        type: 'circle',
        source: dotSrc,
        paint: {
          'circle-radius': ['case', ['get', 'recent'], 8, 6],
          'circle-color': SAFETY,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
    } else {
      (map.getSource(dotSrc) as maplibregl.GeoJSONSource).setData(dotData);
    }

    // LineString through the vertices. Auto-close visually when `closed`.
    const ringCoords = closed && vertices.length >= 3 ? [...vertices, vertices[0]] : vertices;
    const lineData =
      ringCoords.length >= 2
        ? {
            type: 'Feature' as const,
            geometry: { type: 'LineString' as const, coordinates: ringCoords },
            properties: {},
          }
        : null;

    if (lineData) {
      if (!map.getSource(lineSrc)) {
        map.addSource(lineSrc, { type: 'geojson', data: lineData });
        map.addLayer({
          id: lineLayer,
          type: 'line',
          source: lineSrc,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': SAFETY, 'line-width': 3 },
        });
      } else {
        (map.getSource(lineSrc) as maplibregl.GeoJSONSource).setData(lineData);
      }
    } else {
      if (map.getLayer(lineLayer)) map.removeLayer(lineLayer);
      if (map.getSource(lineSrc)) map.removeSource(lineSrc);
    }

    // Fill — only meaningful once the polygon is closed and ≥3 vertices.
    const fillData =
      closed && vertices.length >= 3
        ? {
            type: 'Feature' as const,
            geometry: {
              type: 'Polygon' as const,
              coordinates: [[...vertices, vertices[0]]],
            },
            properties: {},
          }
        : null;

    if (fillData) {
      if (!map.getSource(fillSrc)) {
        map.addSource(fillSrc, { type: 'geojson', data: fillData });
        // Insert below the line layer so the line sits visually on top.
        map.addLayer(
          {
            id: fillLayer,
            type: 'fill',
            source: fillSrc,
            paint: { 'fill-color': SAFETY, 'fill-opacity': 0.18 },
          },
          map.getLayer(lineLayer) ? lineLayer : undefined,
        );
      } else {
        (map.getSource(fillSrc) as maplibregl.GeoJSONSource).setData(fillData);
      }
    } else {
      if (map.getLayer(fillLayer)) map.removeLayer(fillLayer);
      if (map.getSource(fillSrc)) map.removeSource(fillSrc);
    }
  }, [vertices, closed, ready]);

  // Fit map to polygon when transitioning to closed — gives the user a clean
  // overview of what they drew.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !closed || vertices.length < 3) return;
    const lngs = vertices.map((v) => v[0]);
    const lats = vertices.map((v) => v[1]);
    const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
    const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
    map.fitBounds([sw, ne], { padding: 80, duration: 600, maxZoom: 16 });
  }, [closed, vertices, ready]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="absolute inset-0" />
      {/* Basemap toggle, top-left, doesn't collide with NavigationControl on the right */}
      <div className="pointer-events-auto absolute left-3 top-3 flex gap-1 rounded-full bg-surface-container/95 p-1 shadow-lg backdrop-blur">
        {baseChoices.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setBaseId(l.id)}
            className={`rounded-full px-3 py-1.5 text-label-sm font-semibold ${
              baseId === l.id ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant'
            }`}
          >
            {l.id === 'base-satellite' ? 'Sat' : l.id === 'base-dtk500' ? 'Karte' : 'Topo'}
          </button>
        ))}
      </div>
    </div>
  );
}
