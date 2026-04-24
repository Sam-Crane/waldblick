// Supabase Edge Function: proxies Google Directions API.
//
// Why this exists: keeps the Google API key off the browser. With the
// referrer-restricted client key (our Phase 2 setup) anyone who opens
// DevTools can read the key; Google's referrer check is a soft guardrail.
// Running through this function instead puts the key behind Supabase auth:
// the client sends its user JWT, we attach the Google key server-side.
//
// Deploy: `supabase functions deploy directions --no-verify-jwt=false`
// Config: set the secrets once in the Supabase project:
//   supabase secrets set GOOGLE_DIRECTIONS_KEY=AIza...
//   supabase secrets set ALLOWED_ORIGIN=https://your.app
//
// Client: set VITE_USE_EDGE_DIRECTIONS=1 in .env. The client will call
// this function instead of api.google.com/maps/api/directions/json.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GOOGLE_KEY = Deno.env.get('GOOGLE_DIRECTIONS_KEY');
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type LatLng = { lat: number; lng: number };
type Body = {
  origin: LatLng;
  destination: LatLng;
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function validLatLng(p: unknown): p is LatLng {
  if (!p || typeof p !== 'object') return false;
  const q = p as Record<string, unknown>;
  return (
    typeof q.lat === 'number' &&
    typeof q.lng === 'number' &&
    q.lat >= -90 && q.lat <= 90 &&
    q.lng >= -180 && q.lng <= 180
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  if (!GOOGLE_KEY) {
    return json({ status: 'NOT_CONFIGURED', error: 'GOOGLE_DIRECTIONS_KEY not set on function' }, 500);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ status: 'INVALID_REQUEST', error: 'invalid JSON' }, 400);
  }

  if (!validLatLng(body.origin) || !validLatLng(body.destination)) {
    return json({ status: 'INVALID_REQUEST', error: 'origin/destination missing or out of range' }, 400);
  }

  const mode = body.mode ?? 'driving';
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', `${body.origin.lat},${body.origin.lng}`);
  url.searchParams.set('destination', `${body.destination.lat},${body.destination.lng}`);
  url.searchParams.set('mode', mode);
  url.searchParams.set('key', GOOGLE_KEY);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return json({ status: 'UPSTREAM_ERROR', error: (err as Error).message }, 502);
  }
});
