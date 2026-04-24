import { decodePolyline } from './polyline';

export type LatLng = { lat: number; lng: number };

export type Route = {
  coordinates: [number, number][]; // [lng, lat]
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
};

const key = import.meta.env.VITE_GOOGLE_DIRECTIONS_KEY;
export const directionsEnabled = Boolean(key);

export async function fetchRoute(origin: LatLng, destination: LatLng, mode = 'driving'): Promise<Route> {
  if (!key) throw new Error('directions_not_configured');
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  url.searchParams.set('mode', mode);
  url.searchParams.set('key', key);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`directions_http_${res.status}`);
  const json = (await res.json()) as {
    status: string;
    error_message?: string;
    routes: Array<{
      overview_polyline: { points: string };
      legs: Array<{
        distance: { text: string; value: number };
        duration: { text: string; value: number };
      }>;
    }>;
  };

  if (json.status !== 'OK' || !json.routes[0]) {
    throw new Error(`directions_${json.status.toLowerCase()}`);
  }

  const route = json.routes[0];
  const leg = route.legs[0];
  return {
    coordinates: decodePolyline(route.overview_polyline.points),
    distanceText: leg.distance.text,
    durationText: leg.duration.text,
    distanceMeters: leg.distance.value,
    durationSeconds: leg.duration.value,
  };
}
