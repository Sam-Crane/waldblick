import type { Observation, Plot } from '@/data/types';

// Combined bounding box of all given features in [sw, ne] form suitable
// for maplibregl.Map.fitBounds. Returns null if nothing to fit.
export function combinedBounds(
  plots: Plot[],
  observations: Observation[],
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let any = false;

  for (const p of plots) {
    const outer = p.boundary.coordinates[0] ?? [];
    for (const [lng, lat] of outer) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      any = true;
    }
  }
  for (const o of observations) {
    minLng = Math.min(minLng, o.lng);
    maxLng = Math.max(maxLng, o.lng);
    minLat = Math.min(minLat, o.lat);
    maxLat = Math.max(maxLat, o.lat);
    any = true;
  }
  if (!any) return null;

  // Degenerate case (single point): pad 0.01° so fitBounds doesn't reject it.
  if (minLng === maxLng && minLat === maxLat) {
    minLng -= 0.01;
    maxLng += 0.01;
    minLat -= 0.01;
    maxLat += 0.01;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
