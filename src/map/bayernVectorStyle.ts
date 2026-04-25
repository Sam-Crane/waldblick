import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

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
// LDBV's font endpoint is hidden behind the same cookie-too-large 400
// the rest of bayernwolke serves, AND its fontstack list ('Open Sans
// Regular,Arial Unicode MS Regular') doesn't actually exist on disk
// at /fonts/<stack>/0-255.pbf — the upstream returns 404 even with
// the cookie strip in place. The MapLibre demo glyph server hosts a
// public Noto Sans Regular set under a CC-BY licence, which is what
// every MapLibre example/sample style uses. Point glyphs there and
// rewrite every symbol layer's `text-font` to match (any font name
// referenced by a layer must exist at that glyph endpoint, otherwise
// MapLibre falls back to a 404 spam loop).
const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
const FALLBACK_FONT_STACK = ['Noto Sans Regular'];

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

  // Every symbol layer in LDBV's style references the upstream
  // 'Open Sans Regular,Arial Unicode MS Regular' fontstack, which the
  // demotiles glyph server doesn't have. Rewrite each layer's
  // text-font to the one stack we know works — Noto Sans Regular —
  // so MapLibre stops spraying 404s for every label range.
  if (Array.isArray(style.layers)) {
    for (const layer of style.layers as LayerSpecification[]) {
      if (
        layer.type === 'symbol' &&
        layer.layout &&
        'text-font' in layer.layout
      ) {
        layer.layout['text-font'] = FALLBACK_FONT_STACK;
      }
    }
  }

  cachedStyle = style;
  return style;
}
