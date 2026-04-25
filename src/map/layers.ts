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
  type: 'xyz' | 'wms' | 'edge-wms';
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

// BayernAtlas WMTS XYZ tile URLs. These are the same endpoints the
// official `atlas.bayern.de` viewer uses under the hood — slippy tiles
// in EPSG:3857 (WebMercatorQuad), no CRS / version negotiation, no 400
// errors. Layer names and the path structure follow LDBV's documented
// open-data WMTS pattern. Confirmed paths:
//
//   /od/wmts/{service}/v1/{layer}/webmercator/{z}/{y}/{x}
//
// If a future LDBV redeploy moves these, the layer-failure auto-disable
// in MapCanvas will catch it and fall back to satellite.
const BAYERN_DOP_XYZ = 'https://geoservices.bayern.de/od/wmts/dop/v1/by_dop20c/webmercator/{z}/{y}/{x}.png';
const BAYERN_DTK_XYZ = 'https://geoservices.bayern.de/od/wmts/dtk/v1/by_dtk500/webmercator/{z}/{y}/{x}.png';
const BAYERN_PARZELLAR_XYZ = 'https://geoservices.bayern.de/od/wmts/parzellarkarte/v1/by_parzellarkarte/webmercator/{z}/{y}/{x}.png';
const BAYERN_TN_XYZ = 'https://geoservices.bayern.de/od/wmts/tn/v1/by_tn/webmercator/{z}/{y}/{x}.png';

// Legacy WMS endpoints — kept as fallbacks but not wired to the UI by
// default since they've been returning HTTP 400 for layer registrations
// inconsistent with current LDBV deployment.
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
    id: 'base-luftbild',
    kind: 'base',
    titleKey: 'map.layer.luftbild',
    url: BAYERN_DOP_XYZ,
    type: 'xyz',
    attribution: '© Bayerische Vermessungsverwaltung (LDBV) — DOP20',
  },
  {
    id: 'base-dtk500',
    kind: 'base',
    titleKey: 'map.layer.dtk500',
    url: BAYERN_DTK_XYZ,
    type: 'xyz',
    attribution: '© Bayerische Vermessungsverwaltung (LDBV) — DTK',
  },
  {
    id: 'overlay-alkis-parzellar',
    kind: 'overlay',
    titleKey: 'map.layer.alkisParzellar',
    url: BAYERN_PARZELLAR_XYZ,
    type: 'xyz',
    attribution: '© LDBV — ALKIS Parzellarkarte',
    // Cadastre lines only render at high zoom on the LDBV WMTS.
    minZoom: 13,
  },
  {
    id: 'overlay-alkis-tn',
    kind: 'overlay',
    titleKey: 'map.layer.alkisTn',
    url: BAYERN_TN_XYZ,
    type: 'xyz',
    attribution: '© LDBV — ALKIS Tatsächliche Nutzung',
    minZoom: 12,
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
// Respects the `enabledByEnv` guard so edge-proxied layers only appear
// when their server-side piece is deployed and the flag is flipped.
export function availableLayers(): LayerDef[] {
  return LAYERS.filter((l) => !l.enabledByEnv || import.meta.env[l.enabledByEnv] === '1');
}

export function layerById(id: string): LayerDef | undefined {
  return LAYERS.find((l) => l.id === id);
}
