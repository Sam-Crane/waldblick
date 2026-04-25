// Supabase Edge Function: proxies Sentinel Hub / Copernicus Data Space WMS
// tile requests with OAuth authentication.
//
// Why this exists: Copernicus Data Space uses client_credentials OAuth —
// the client_id + secret cannot live in the browser. This function holds
// them as function secrets, fetches a short-lived access token, caches it
// in memory for the ~10-minute token TTL, and proxies the tile request
// with the Authorization header attached.
//
// Deploy: `supabase functions deploy copernicus-tile --no-verify-jwt`
//
// JWT verification MUST be off — MapLibre fetches tile URLs as plain
// GETs with no Authorization header, so Supabase's default verify-jwt
// gate would 401 every tile request before our handler runs. The
// function is safe as a public endpoint: client_id/secret stay in
// function secrets, never exposed; the upstream is fixed; GET-only.
//
// Secrets (one-time):
//   supabase secrets set COPERNICUS_CLIENT_ID=...
//   supabase secrets set COPERNICUS_CLIENT_SECRET=...
//   supabase secrets set COPERNICUS_INSTANCE_ID=...     # from a Sentinel Hub configuration
//   supabase secrets set ALLOWED_ORIGIN=https://your.app
//
// Client usage: see src/map/layers.ts — the layer type 'copernicus' routes
// its tile URL through this function, which forwards the BBOX + WIDTH etc.
// query string to Sentinel Hub and streams the image back.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CLIENT_ID = Deno.env.get('COPERNICUS_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('COPERNICUS_CLIENT_SECRET');
const INSTANCE_ID = Deno.env.get('COPERNICUS_INSTANCE_ID');
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type Token = { accessToken: string; expiresAt: number };
let cached: Token | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.accessToken;
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('oauth_not_configured');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token_${res.status}: ${text.substring(0, 140)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cached.accessToken;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'GET') {
    return new Response('method_not_allowed', { status: 405, headers: CORS_HEADERS });
  }

  if (!INSTANCE_ID) {
    return new Response(JSON.stringify({ error: 'INSTANCE_ID not configured' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  // Pass every OGC WMS query param through unchanged. The upstream is a
  // Sentinel Hub WMS endpoint keyed on the instance id. The client fills
  // in BBOX / WIDTH / HEIGHT / LAYERS / FORMAT via MapLibre's raster source.
  const upstream = new URL(`https://sh.dataspace.copernicus.eu/ogc/wms/${INSTANCE_ID}`);
  url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

  let token: string;
  try {
    token = await getToken();
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch(upstream.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Stream whatever Sentinel Hub returned back to the client with CORS.
    const contentType = res.headers.get('Content-Type') ?? 'image/png';
    return new Response(res.body, {
      status: res.status,
      headers: { ...CORS_HEADERS, 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
