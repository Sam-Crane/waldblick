import { decodePolyline } from './polyline';
import { supabase, hasSupabase } from '@/data/supabase';

export type LatLng = { lat: number; lng: number };

export type Route = {
  coordinates: [number, number][]; // [lng, lat]
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
};

const clientKey = import.meta.env.VITE_GOOGLE_DIRECTIONS_KEY;
const useEdge = import.meta.env.VITE_USE_EDGE_DIRECTIONS === '1';

// Directions work when EITHER a client key is set (direct Google call) OR
// the Edge Function is enabled (server-side proxy). Prefer edge when both,
// because it keeps the key off the browser.
export const directionsEnabled = Boolean(useEdge ? hasSupabase : clientKey);

type GoogleResponse = {
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

export async function fetchRoute(origin: LatLng, destination: LatLng, mode = 'driving'): Promise<Route> {
  if (useEdge) {
    if (!hasSupabase || !supabase) throw new Error('directions_not_configured');
    const { data, error } = await supabase.functions.invoke<GoogleResponse>('directions', {
      body: { origin, destination, mode },
    });
    if (error) throw new Error(`directions_${error.name.toLowerCase()}`);
    if (!data) throw new Error('directions_empty');
    return unpack(data);
  }

  if (!clientKey) throw new Error('directions_not_configured');
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
  url.searchParams.set('mode', mode);
  url.searchParams.set('key', clientKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`directions_http_${res.status}`);
  const data = (await res.json()) as GoogleResponse;
  return unpack(data);
}

function unpack(data: GoogleResponse): Route {
  if (data.status !== 'OK' || !data.routes[0]) {
    throw new Error(`directions_${data.status.toLowerCase()}`);
  }
  const route = data.routes[0];
  const leg = route.legs[0];
  return {
    coordinates: decodePolyline(route.overview_polyline.points),
    distanceText: leg.distance.text,
    durationText: leg.duration.text,
    distanceMeters: leg.distance.value,
    durationSeconds: leg.duration.value,
  };
}
