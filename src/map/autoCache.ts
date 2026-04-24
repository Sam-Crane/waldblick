// Write-behind tile prefetcher. Called after saving an observation or plot
// so the area around them is cached for offline revisits — no user prompt,
// no blocking, no surprise mobile-data usage (respects navigator.onLine
// and the cacheArea size cap).
//
// Strategy:
//   - observation: ~1 km² around the pin at zoom 14–17 (high detail)
//   - plot:        the plot bbox at zoom 12–15 (broader coverage)
//
// Only the active base layer + active overlays are fetched so we don't
// fill the cache with layers the user doesn't have toggled on.

import { cacheArea } from './tileCache';
import { availableLayers } from './layers';

const OBSERVATION_RADIUS_KM = 0.7; // ~1 km² square (1.4 km × 1.4 km)

type Bounds = { west: number; east: number; south: number; north: number };

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

// Which layers should be prefetched. For now: the current default base
// ("overlay-alkis-parzellar" + "base-satellite" from the persisted map
// state if we had access to it). Keep it conservative: just the satellite
// basemap + parcel overlay, which are the two the map renders by default.
// Users with other overlays toggled on will get those cached normally via
// Workbox when they next open the map.
function defaultLayerIds(): string[] {
  const layers = availableLayers();
  const satellite = layers.find((l) => l.id === 'base-satellite');
  const parzellar = layers.find((l) => l.id === 'overlay-alkis-parzellar');
  return [satellite?.id, parzellar?.id].filter(Boolean) as string[];
}

// Squares a point into a bounding box. ~111km per degree latitude;
// longitude scales with cos(lat). Keep the math cheap and approximate —
// tile edges are coarse anyway.
function pointToBounds(lat: number, lng: number, radiusKm: number): Bounds {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    west: lng - dLng,
    east: lng + dLng,
    south: lat - dLat,
    north: lat + dLat,
  };
}

function polygonToBounds(coords: [number, number][]): Bounds {
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  for (const [lng, lat] of coords) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, east, south, north };
}

// Fire-and-forget prefetch around a single point. Safe to await or void-call.
export async function cacheAroundPoint(lat: number, lng: number): Promise<void> {
  if (!isOnline()) return;
  const bounds = pointToBounds(lat, lng, OBSERVATION_RADIUS_KM);
  try {
    await cacheArea(bounds, defaultLayerIds(), 14, 17);
  } catch {
    /* silent — Workbox will pick these up on next actual viewing */
  }
}

export async function cacheAroundBounds(
  polygonOuterRing: [number, number][],
): Promise<void> {
  if (!isOnline()) return;
  if (polygonOuterRing.length < 3) return;
  try {
    await cacheArea(polygonToBounds(polygonOuterRing), defaultLayerIds(), 12, 15);
  } catch {
    /* silent */
  }
}

// Cache every plot's bbox in one go. Used by the "Download this forest"
// button on /plots. Returns combined progress so the UI can show it.
export async function cacheAllPlots(
  plots: Array<{ boundary: { coordinates: [number, number][][] } }>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (!isOnline()) return;
  const ids = defaultLayerIds();
  for (let i = 0; i < plots.length; i++) {
    const outer = plots[i].boundary.coordinates[0];
    if (!outer || outer.length < 3) continue;
    try {
      await cacheArea(polygonToBounds(outer), ids, 12, 15);
    } catch {
      /* skip this plot and move on */
    }
    onProgress?.(i + 1, plots.length);
  }
}
