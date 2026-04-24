# Directions Edge Function

Proxies Google Directions API so the browser never sees the API key.

## Deploy

Prereq: [Supabase CLI](https://supabase.com/docs/guides/cli) installed and logged in.

```bash
# From the repo root:
supabase login            # one-time
supabase link --project-ref <your-project-ref>

# Set the upstream secrets (one-time):
supabase secrets set GOOGLE_DIRECTIONS_KEY=AIza...your-key...
supabase secrets set ALLOWED_ORIGIN=https://your.production.url   # or http://localhost:5173 in dev

# Deploy the function:
supabase functions deploy directions
```

Function URL becomes `https://<project-ref>.functions.supabase.co/directions`. The Supabase client auto-resolves this when you use `supabase.functions.invoke('directions', …)`.

## Enable on the client

Add to `.env`:

```
VITE_USE_EDGE_DIRECTIONS=1
```

Restart `npm run dev`. The client's directions call will route through the Edge Function instead of hitting Google directly. `VITE_GOOGLE_DIRECTIONS_KEY` in `.env` can be dropped.

## Tighten the Google API key

Once the Edge Function is the only thing calling Google, swap the API key restriction in GCP from **HTTP referrers** to **IP addresses** and paste in Supabase's Edge Function egress IPs (or leave it as "None" if you trust the key is only on the server — the Deno runtime doesn't leak it).

## Local testing

```bash
supabase functions serve directions --env-file .env.local
```

Then POST to `http://localhost:54321/functions/v1/directions` with body:

```json
{ "origin": { "lat": 48.137, "lng": 11.575 }, "destination": { "lat": 48.150, "lng": 11.600 } }
```
