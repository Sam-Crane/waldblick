import type { StyleSpecification } from 'maplibre-gl';

// BayernAtlas vector basemap.
//
// Until commit 23daa0d we hand-rolled an 8-layer style here as a
// placeholder. Now that the proxy actually works, we fetch LDBV's
// real style document — `by_style_luftbild_overlay` — and use that
// directly. ~400 layers professionally tuned for the BayernAtlas
// viewer (proper road hierarchy, water fills, building outlines,
// administrative borders, place name labels with the right zoom
// thresholds, the lot).
//
// The fetched style references three sets of URLs we have to rewrite
// before passing to map.setStyle(), all of which go through the
// dev-only Vite proxy in vite.config.ts:
//
//   sources.by         → vector tiles at vt{1,2,3}.bayernwolke.de
//   sprite             → sprite atlas at  vt1.bayernwolke.de/sprites
//   glyphs             → font PBFs at     vt1.bayernwolke.de/fonts
//
// Without rewriting, MapLibre would request the upstream URLs directly
// and run into the same cookie-too-large 400 we already fought. The
// proxy applies the cookie strip + Referer spoof on every request.
//
// Production caveat: the same proxy needs to be replicated in a
// Supabase Edge Function before this basemap can ship. See the
// note in vite.config.ts.

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const STYLE_PATH = '/bayern-vt/services/vt/styles/by_style_luftbild_overlay.json';
const STYLE_URL = `${ORIGIN}${STYLE_PATH}`;
const TILE_URLS = [1, 2, 3].map(
  (n) => `${ORIGIN}/bayern-vt/${n}/tiles/web_vektor_by/{z}/{x}/{y}.pbf`,
);
const SPRITE_URL = `${ORIGIN}/bayern-vt/1/sprites/sprites_by`;
const GLYPHS_URL = `${ORIGIN}/bayern-vt/1/fonts/{fontstack}/{range}.pbf`;

// LDBV's TileJSON for web_vektor_by declares minzoom 5 / maxzoom 15.
// We hardcode here so we don't have to do a second fetch — the values
// are part of the data contract and won't change unannounced.
const SOURCE_MINZOOM = 5;
const SOURCE_MAXZOOM = 15;

const ATTRIBUTION =
  '© Bayerische Vermessungsverwaltung (LDBV) — BayernAtlas · CC BY 4.0';

// Cache the fetched style so swapping back to BayernAtlas Vector
// after switching to satellite doesn't re-hit the network.
let cachedStyle: StyleSpecification | null = null;

export async function fetchBayernVectorStyle(): Promise<StyleSpecification> {
  if (cachedStyle) return cachedStyle;

  const res = await fetch(STYLE_URL);
  if (!res.ok) {
    throw new Error(
      `BayernAtlas style fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  const style = (await res.json()) as StyleSpecification & {
    sources: Record<string, unknown>;
  };

  // Rewrite the vector source. Official document points at a TileJSON
  // URL (sources.by.url), which would trigger an extra fetch and a
  // separate set of upstream tile URLs MapLibre would try to hit
  // directly. Inline the tile URLs from our proxy instead — one
  // fewer round-trip, and we know what we're rendering.
  if (style.sources?.by) {
    style.sources.by = {
      type: 'vector',
      tiles: TILE_URLS,
      minzoom: SOURCE_MINZOOM,
      maxzoom: SOURCE_MAXZOOM,
      attribution: ATTRIBUTION,
    };
  }

  // Sprite atlas (icons used by symbol layers — POIs, road shields,
  // etc.) and glyph PBFs (text-rendering for symbol/text layers).
  // Both live on vt1.bayernwolke.de, which the same cookie-strip
  // proxy already handles.
  style.sprite = SPRITE_URL;
  style.glyphs = GLYPHS_URL;

  cachedStyle = style;
  return style;
}
