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
  // WMS protocol version. Defaults to 1.3.0. Some legacy German WMS
  // services (LDBV BayernAtlas, LfU) return HTTP 400 against 1.3.0 due
  // to layer-name registration quirks but accept 1.1.1 cleanly. The
  // axis-order semantics for EPSG:3857 are identical between versions
  // (east,north) so switching is a clean fallback.
  wmsVersion?: '1.1.1' | '1.3.0';
};

// BayernAtlas raster tiles. The official atlas.bayern.de viewer uses
// LDBV's WMTS service for these — but the exact URL pattern (service
// path + layer ID + tilematrixset name) is *not* documented publicly
// and varies between LDBV deployments. Verified URLs need to be copied
// from the BayernAtlas viewer's network tab:
//
//   1. Open https://atlas.bayern.de/ with the desired layer active
//   2. Open browser DevTools → Network → filter by "wmts" or "tile"
//   3. Copy the templated URL (z/y/x or BBOX form) into a VITE_BAYERN_*
//      env var, then re-enable the layer in availableLayers().
//
// Earlier attempts at /od/wmts/{service}/v1/{layer}/webmercator/{z}/{y}/{x}
// returned HTTP 404 — the path structure is wrong. Until a verified
// URL is provided we fall back to the Esri satellite basemap (which
// gives the same imagery, just without the German cadastre overlay).
const BAYERN_DOP_XYZ = import.meta.env.VITE_BAYERN_DOP_XYZ as string | undefined;
const BAYERN_DTK_XYZ = import.meta.env.VITE_BAYERN_DTK_XYZ as string | undefined;
const BAYERN_PARZELLAR_XYZ = import.meta.env.VITE_BAYERN_PARZELLAR_XYZ as string | undefined;
const BAYERN_TN_XYZ = import.meta.env.VITE_BAYERN_TN_XYZ as string | undefined;

// LfU (soil + hydro) opendata WMS — works against 1.1.1 with EPSG:3857.
// Kept as opt-in offline-on-demand overlays.
const LFU_BUEK200 = 'https://www.lfu.bayern.de/gdi/wms/boden/buek200by';
const LFU_UEBK25 = 'https://www.lfu.bayern.de/gdi/wms/boden/uebk25';
const LFU_HK100 = 'https://www.lfu.bayern.de/gdi/wms/geologie/hk100';

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
    // BayernAtlas official vector basemap. Same style-document the
    // atlas.bayern.de viewer loads — full Bavarian topo + cadastre +
    // road network rendered as Mapbox vector tiles. URL was lifted
    // from BayernAtlas's network tab (services.atlas.bayern.de hosts
    // the style, vt2.bayernwolke.de hosts the .pbf tiles it points at).
    id: 'base-bayern-vector',
    kind: 'base',
    titleKey: 'map.layer.bayernVector',
    url: 'https://services.atlas.bayern.de/vt/tiles/web_vektor_by.json',
    type: 'vector-style',
    attribution: '© Bayerische Vermessungsverwaltung (LDBV) — BayernAtlas',
  },
  {
    id: 'base-luftbild',
    kind: 'base',
    titleKey: 'map.layer.luftbild',
    url: BAYERN_DOP_XYZ ?? '',
    type: 'xyz',
    attribution: '© Bayerische Vermessungsverwaltung (LDBV) — DOP20',
    enabledByEnv: 'VITE_BAYERN_DOP_XYZ',
  },
  {
    id: 'base-dtk500',
    kind: 'base',
    titleKey: 'map.layer.dtk500',
    url: BAYERN_DTK_XYZ ?? '',
    type: 'xyz',
    attribution: '© Bayerische Vermessungsverwaltung (LDBV) — DTK',
    enabledByEnv: 'VITE_BAYERN_DTK_XYZ',
  },
  {
    id: 'overlay-alkis-parzellar',
    kind: 'overlay',
    titleKey: 'map.layer.alkisParzellar',
    url: BAYERN_PARZELLAR_XYZ ?? '',
    type: 'xyz',
    attribution: '© LDBV — ALKIS Parzellarkarte',
    minZoom: 13,
    enabledByEnv: 'VITE_BAYERN_PARZELLAR_XYZ',
  },
  {
    id: 'overlay-alkis-tn',
    kind: 'overlay',
    titleKey: 'map.layer.alkisTn',
    url: BAYERN_TN_XYZ ?? '',
    type: 'xyz',
    attribution: '© LDBV — ALKIS Tatsächliche Nutzung',
    minZoom: 12,
    enabledByEnv: 'VITE_BAYERN_TN_XYZ',
  },
  {
    id: 'overlay-lfu-uebk25',
    kind: 'overlay',
    titleKey: 'map.layer.uebk25',
    url: LFU_UEBK25,
    type: 'wms',
    attribution: '© Bayerisches Landesamt für Umwelt (LfU)',
    offlineOnDemand: true,
    wmsVersion: '1.1.1',
  },
  {
    id: 'overlay-lfu-buek200',
    kind: 'overlay',
    titleKey: 'map.layer.buek200',
    url: LFU_BUEK200,
    type: 'wms',
    attribution: '© LfU — BÜK200',
    offlineOnDemand: true,
    wmsVersion: '1.1.1',
  },
  {
    id: 'overlay-lfu-hk100',
    kind: 'overlay',
    titleKey: 'map.layer.hk100',
    url: LFU_HK100,
    type: 'wms',
    attribution: '© LfU — HK100',
    offlineOnDemand: true,
    wmsVersion: '1.1.1',
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
