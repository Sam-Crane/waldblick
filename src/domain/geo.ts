// WGS84 / EPSG:4326 helpers. Distances in meters.
const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Forward azimuth from a to b in degrees (0 = north, 90 = east). Great-circle
// initial bearing — what a compass needle would read at the start of the walk.
// Used by NavigateTo for the direction-arrow UI.
export function initialBearing(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Compact compass label ("NE", "SSW", …). 16-wind used because 8 is too coarse
// at short range and anything finer is unreadable at a glance.
export function compassLabel(bearing: number): string {
  const labels = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];
  return labels[Math.round(bearing / 22.5) % 16];
}
