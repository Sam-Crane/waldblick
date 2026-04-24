# Copernicus tile Edge Function

Serves Sentinel-2 satellite imagery from Copernicus Data Space Ecosystem as a MapLibre-compatible WMS, with OAuth credentials kept server-side.

## One-time setup

### 1. Register a Copernicus OAuth client

- Sign up at <https://dataspace.copernicus.eu/>.
- Go to <https://shapps.dataspace.copernicus.eu/dashboard/> → **User settings → OAuth clients**.
- Create a new client. Save the `client_id` and `client_secret`.

### 2. Create a Sentinel Hub configuration (instance)

- In the same Dashboard, go to **Configuration Utility**.
- Create a new configuration (e.g. "Waldblick S2-L2A"). Pick the "Sentinel-2 L2A" data source and the "True Color" (or "Cloud cover + NDVI") preset.
- Save. Copy the **Instance ID**.

### 3. Deploy the function

```bash
supabase link --project-ref <your-project-ref>

supabase secrets set COPERNICUS_CLIENT_ID=...
supabase secrets set COPERNICUS_CLIENT_SECRET=...
supabase secrets set COPERNICUS_INSTANCE_ID=...
supabase secrets set ALLOWED_ORIGIN=https://your.production.url   # or http://localhost:5173 in dev

supabase functions deploy copernicus-tile
```

Function URL becomes `https://<project-ref>.functions.supabase.co/copernicus-tile`.

### 4. Enable the overlay on the client

Add to `.env`:

```
VITE_USE_COPERNICUS=1
```

Restart `npm run dev`. The Copernicus Sentinel-2 overlay now appears in the map's Layer Panel. Toggle it on; the client routes tile requests through this function, which attaches the OAuth token and forwards to Sentinel Hub.

## How it works

1. Client's MapLibre raster source asks for a tile: `GET /copernicus-tile?SERVICE=WMS&…&BBOX=…&WIDTH=…&HEIGHT=…`
2. Function gets/reuses a cached OAuth token (~10 min TTL).
3. Copies every query-string param onto the upstream URL at `sh.dataspace.copernicus.eu/ogc/wms/{INSTANCE_ID}`.
4. Fetches with `Authorization: Bearer <token>` and streams the image back with CORS + `Cache-Control: public, max-age=3600`.

## Local testing

```bash
supabase functions serve copernicus-tile --env-file .env.local
```

Then hit:

```
http://localhost:54321/functions/v1/copernicus-tile?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=TRUE_COLOR&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=512&HEIGHT=512&BBOX=1200000,6100000,1300000,6200000
```

## Tuning

- The Cloud-Aware presets (LAYERS=`TRUE-COLOR-S2-L2A`) return only recent cloud-free scenes. Check the Sentinel Hub documentation for your configuration's available layer names.
- For fresher imagery, set a `TIME` query param: `&TIME=2024-06-01/2024-06-30` to restrict the search window.
