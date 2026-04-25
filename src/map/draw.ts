// Geometry helpers for in-map plot drawing. Each function takes
// drag/tap inputs in [lng, lat] WGS84 coordinates and returns a closed
// polygon ring suitable for plotsRepo.create({ boundary: ... }).
//
// The "ring" we return matches GeoJSON's outer-ring contract: an array
// of [lng, lat] pairs where the first and last points are identical.
// (Repository code accepts an *open* ring and closes it on save, so we
// return the open form here and let the caller close it.)

export type LngLat = [number, number];

// Rectangle drag: two opposite corners → 4-vertex axis-aligned rectangle.
// The corners can be in any order (drag NW→SE, SE→NW, NE→SW, etc).
export function rectangleRing(a: LngLat, b: LngLat): LngLat[] {
  const [lngA, latA] = a;
  const [lngB, latB] = b;
  const w = Math.min(lngA, lngB);
  const e = Math.max(lngA, lngB);
  const s = Math.min(latA, latB);
  const n = Math.max(latA, latB);
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
}

// Circle drag: center + edge → N-sided polygon approximating a circle
// with radius equal to the great-circle distance between the two points.
//
// We do this on a local equirectangular projection (lng scaled by
// cos(lat) to compensate for meridian convergence) — at the scale of a
// forest plot (≤1 km radius) this is indistinguishable from a true
// great-circle ring and avoids the numerical drama of full geodesic
// computation. 32 sides is the visual sweet spot: looks like a circle,
// stays under the 100-vertex DB cap with a comfortable margin.
const CIRCLE_SIDES = 32;

export function circleRing(center: LngLat, edge: LngLat): LngLat[] {
  const [cx, cy] = center;
  const cosLat = Math.cos((cy * Math.PI) / 180);
  // Project both points to a local Cartesian frame (units: degrees lng,
  // scaled so that 1 degree lng at this latitude equals 1 degree lat).
  const dx = (edge[0] - cx) * cosLat;
  const dy = edge[1] - cy;
  const r = Math.sqrt(dx * dx + dy * dy); // radius in scaled-degrees
  if (r === 0) return [];
  const ring: LngLat[] = [];
  for (let i = 0; i < CIRCLE_SIDES; i++) {
    const a = (i / CIRCLE_SIDES) * 2 * Math.PI;
    const lng = cx + (Math.cos(a) * r) / cosLat;
    const lat = cy + Math.sin(a) * r;
    ring.push([lng, lat]);
  }
  return ring;
}

// Freehand sketch: dense list of pointer positions → simplified ring.
//
// Raw freehand input is hundreds of points, most clustered close together
// (every 16-32ms while the finger is moving). We thin it with a
// distance-based filter before saving — anything within ~8 metres of the
// last kept vertex is dropped. This:
//   - keeps the polygon under the DB vertex cap on long sketches
//   - speeds up rendering
//   - makes the shape less jittery
// 8m tolerance was picked because forestry boundaries don't need sub-tree
// precision, and the GPS accuracy floor on most phones is ~3-5m anyway.
const SKETCH_MIN_VERTEX_SEPARATION_M = 8;

export function simplifySketch(points: LngLat[]): LngLat[] {
  if (points.length <= 2) return points.slice();
  const out: LngLat[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    if (haversineMetres(prev, points[i]) >= SKETCH_MIN_VERTEX_SEPARATION_M) {
      out.push(points[i]);
    }
  }
  // Always include the last point so the user's intended end-vertex
  // doesn't get dropped by the filter.
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

// Standard haversine, returns metres. Inlined here so `draw.ts` stays
// self-contained — domain/geo.ts has the canonical version but importing
// it would create a soft cycle since this module is map-layer.
function haversineMetres(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
