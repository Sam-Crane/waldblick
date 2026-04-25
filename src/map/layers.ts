// Single source of truth for all map layer endpoints and attributions.
// Keep URLs here — code elsewhere references layers by id.

export type LayerKind = 'base' | 'overlay';

export type LayerDef = {
  id: string;
  kind: LayerKind;
  titleKey: `map.layer.${string}`; // i18n key
  url: string; // XYZ or WMS GetMap template (or a placeholder for edge-proxied)
  // 'xyz' → url is a slippy tile template with {z}/{x}/{y}
  // 'wms' → url is an OGC WMS endpoint we add GetMap params to
  // 'edge-wms' → url resolves at runtime to a Supabase Edge Function
  //            that proxies the request (OAuth kept server-side)
  // 'vector-style' → url is a Mapbox-GL style JSON document. MapLibre
  //                  loads it via setStyle() and renders the entire
  //                  styled vector basemap (e.g. BayernAtlas web_vektor).
  type: 'xyz' | 'wms' | 'edge-wms' | 'vector-style';
  layer?: string; // WMS layer param (for 'wms' and 'edge-wms')
  attribution: string;
  tileSize?: 256 | 512;
  // If true, only fetched when user explicitly downloads an offline area.
  offlineOnDemand?: boolean;
  // If set, the overlay is only shown/offered when the env flag is truthy.
  // Use this for features that require a server-side piece (edge function,
  // OAuth) so the UI doesn't advertise layers that can't actually load.
  enabledByEnv?: string;
  // Minimum zoom at which the WMS server actually renders content. The
  // BayernAtlas Parzellarkarte, for example, returns blank tiles below
  // z≈14 by design — the panel shows a hint and the MapLibre layer skips
  // tile requests below this threshold so the user isn't burning quota.
  minZoom?: number;
  // Maximum native zoom the upstream CDN ships tiles for. Past this
  // level we still want the layer to render (the user may zoom in for
  // detail), so MapLibre's source `maxzoom` makes it scale the
  // highest-available tile up rather than 400ing forever on requests
  // for non-existent z19/z20 tiles. LDBV's intergeo CDN tops out at
  // z18 for the ALKIS composite — past that the request returns
  // "Bad Request" because the tile pyramid simply doesn't go that
  // deep.
  maxZoom?: number;
  // WMS protocol version. Defaults to 1.3.0. Some legacy German WMS
  // services (LDBV BayernAtlas, LfU) return HTTP 400 against 1.3.0 due
  // to layer-name registration quirks but accept 1.1.1 cleanly. The
  // axis-order semantics for EPSG:3857 are identical between versions
  // (east,north) so switching is a clean fallback.
  wmsVersion?: '1.1.1' | '1.3.0';
};

// BayernAtlas raster tiles. URLs extracted from atlas.bayern.de's
// network tab — `intergeo{31..40}.bayernwolke.de/betty/<layer>/{z}/{x}/{y}`.
// The intergeo* hosts are LDBV's public CDN, returning
//   access-control-allow-origin: *
// so we can fetch them directly from the browser, no proxy or auth
// required. Confirmed via curl: PNG (parcel overlay, RGBA transparent)
// + JPEG (DOP20 aerial photo), both 256x256, status 200, no referer
// or cookie checks.
//
// MapLibre's {a-zA-Z} pattern doesn't expand integer ranges, so we
// pick a single replica server (35) — load is light enough that one
// host handles it. If we ever need round-robin, switch to the array
// form of `tiles` in the source spec.
const BAYERN_DOP_XYZ =
  'https://intergeo35.bayernwolke.de/betty/g_satdop20_komplett/{z}/{x}/{y}';
const BAYERN_PARZELLAR_XYZ =
  'https://intergeo35.bayernwolke.de/betty/c_g_atkishybrid_alkisinvers_parzellar/{z}/{x}/{y}';

export const LAYERS: LayerDef[] = [
  {
    id: 'base-satellite',
    kind: 'base',
    titleKey: 'map.layer.satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    type: 'xyz',
    attribution: 'Tiles © Esri — World Imagery',
  },
  {
    // BayernAtlas vector basemap. Backed by LDBV's `web_vektor_by`
    // tile set (Bavarian topographic data: roads, water, vegetation,
    // buildings, place names). The forest-themed rendering rules
    // live in bayernVectorStyle.ts — MapCanvas detects this layer's
    // id at swap time and uses the hand-built style spec instead of
    // fetching `url` (which is just the data-manifest TileJSON).
    //
    // NB: this basemap does NOT include parcel boundaries
    // (Parzellarkarte / Flurstücke). Those live in a separate LDBV
    // vector tile service whose URL we don't have yet — the user
    // would need to enable the cadastre overlay in BayernAtlas's
    // network tab and copy a tile URL from there.
    id: 'base-bayern-vector',
    kind: 'base',
    titleKey: 'map.layer.bayernVector',
    url: 'https://services.atlas.bayern.de/vt/tiles/web_vektor_by.json',
    type: 'vector-style',
    attribution: '© Bayerische Vermessungsverwaltung (LDBV) — BayernAtlas',
  },
  {
    // BayernAtlas DOP20 — high-resolution aerial photography (20cm
    // pixel) covering all of Bavaria. Same imagery shown when you
    // toggle "Luftbild" in atlas.bayern.de. Public CDN, sends CORS
    // headers, fetches direct from the browser without proxy.
    id: 'base-luftbild',
    kind: 'base',
    titleKey: 'map.layer.luftbild',
    url: BAYERN_DOP_XYZ,
    type: 'xyz',
    attribution: '© Bayerische Vermessungsverwaltung (LDBV) — DOP20',
  },
  {
    // BayernAtlas Parzellarkarte — the yellow parcel boundary grid
    // that's the most visually distinctive feature of atlas.bayern.de's
    // luftbild_parz preset. Transparent PNG overlay so it composes
    // cleanly over any aerial basemap (DOP20 or Esri satellite).
    //
    // Layer name on LDBV's CDN: c_g_atkishybrid_alkisinvers_parzellar
    // — this is a composite of ATKIS hybrid + ALKIS inverse +
    // parcel boundaries. The composite gives us cadastre lines AND
    // road labels AND building outlines in one tile, all transparent
    // over the basemap.
    id: 'overlay-alkis-parzellar',
    kind: 'overlay',
    titleKey: 'map.layer.alkisParzellar',
    url: BAYERN_PARZELLAR_XYZ,
    type: 'xyz',
    attribution: '© LDBV — ALKIS Parzellarkarte',
    // Parcel boundaries don't appear in the LDBV composite tiles
    // until z ≥ 16 — at lower zoom they only contain place names +
    // road labels. We set minZoom 14 (not 16) so the layer panel
    // shows it as "Visible from zoom 14+" — close enough to where
    // it's useful, without confusing users by silently disabling
    // the layer when they're slightly zoomed out.
    minZoom: 14,
    // LDBV's CDN doesn't ship tiles past z18 for this composite —
    // requesting z19/z20 returns 400 Bad Request. Cap maxzoom at 18
    // so MapLibre overzoom-renders (scales the z18 tile up) instead
    // of hammering the upstream with 4xx for every wheel tick.
    maxZoom: 18,
  },
  // Copernicus Sentinel-2 L2A layers. All share the same edge-function
  // endpoint; the LAYERS query param differentiates them. The upstream
  // is sh.dataspace.copernicus.eu/ogc/wms/<INSTANCE_ID>; wms.ts appends
  // OAuth via the Supabase Edge Function at /copernicus-tile.
  //
  // Layer IDs must match what's configured in the Sentinel Hub instance
  // exactly. Default Sentinel-2 L2A template ships: TRUE-COLOR,
  // FALSE-COLOR, NDVI, NDMI, NDWI, TRUE-COLOR-HIGHLIGHT-OPTIMIZED.
  {
    id: 'overlay-copernicus-true-color',
    kind: 'overlay',
    titleKey: 'map.layer.copernicusTrueColor',
    url: '/copernicus-tile',
    type: 'edge-wms',
    layer: 'TRUE-COLOR',
    attribution: '© Copernicus Data Space — Sentinel-2 L2A',
    enabledByEnv: 'VITE_USE_COPERNICUS',
    offlineOnDemand: true,
  },
  {
    id: 'overlay-copernicus-ndvi',
    kind: 'overlay',
    titleKey: 'map.layer.copernicusNdvi',
    url: '/copernicus-tile',
    type: 'edge-wms',
    layer: 'NDVI',
    attribution: '© Copernicus Data Space — Sentinel-2 L2A · NDVI',
    enabledByEnv: 'VITE_USE_COPERNICUS',
    offlineOnDemand: true,
  },
  {
    id: 'overlay-copernicus-ndmi',
    kind: 'overlay',
    titleKey: 'map.layer.copernicusNdmi',
    url: '/copernicus-tile',
    type: 'edge-wms',
    layer: 'NDMI',
    attribution: '© Copernicus Data Space — Sentinel-2 L2A · NDMI',
    enabledByEnv: 'VITE_USE_COPERNICUS',
    offlineOnDemand: true,
  },
];

// Convenience: filter LAYERS for ones that should be offered in the UI.
// Respects the `enabledByEnv` guard so layers gated on a feature flag
// (Copernicus '1' switch) or a URL-bearing env var only appear when the
// user has actually configured them.
export function availableLayers(): LayerDef[] {
  return LAYERS.filter((l) => {
    if (!l.enabledByEnv) return true;
    const v = import.meta.env[l.enabledByEnv];
    if (typeof v !== 'string') return false;
    // Accept '1' (boolean-style flags) or any non-empty URL-shaped value.
    return v === '1' || v.length > 0;
  });
}

export function layerById(id: string): LayerDef | undefined {
  return LAYERS.find((l) => l.id === id);
}
