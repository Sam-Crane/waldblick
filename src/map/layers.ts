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
};

const BAYERN_DTK500 = 'https://geoservices.bayern.de/od/wms/dtk/v1/dtk500';
const BAYERN_DOK = 'https://geoservices.bayern.de/od/wms/dtk/v1/dok';
const BAYERN_ALKIS_PARZELLAR = 'https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte';
const BAYERN_ALKIS_TN = 'https://geoservices.bayern.de/od/wms/alkis/v1/tn';
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
    id: 'base-dtk500',
    kind: 'base',
    titleKey: 'map.layer.dtk500',
    url: BAYERN_DTK500,
    type: 'wms',
    layer: 'by_dtk500',
    attribution: '© Bayerische Vermessungsverwaltung (LDBV)',
  },
  {
    id: 'base-dok',
    kind: 'base',
    titleKey: 'map.layer.dok',
    url: BAYERN_DOK,
    type: 'wms',
    layer: 'by_dok',
    attribution: '© Bayerische Vermessungsverwaltung (LDBV)',
  },
  {
    id: 'overlay-alkis-parzellar',
    kind: 'overlay',
    titleKey: 'map.layer.alkisParzellar',
    url: BAYERN_ALKIS_PARZELLAR,
    type: 'wms',
    layer: 'by_parzellarkarte',
    attribution: '© LDBV — ALKIS Parzellarkarte',
  },
  {
    id: 'overlay-alkis-tn',
    kind: 'overlay',
    titleKey: 'map.layer.alkisTn',
    url: BAYERN_ALKIS_TN,
    type: 'wms',
    layer: 'by_tn',
    attribution: '© LDBV — ALKIS Tatsächliche Nutzung',
  },
  {
    id: 'overlay-lfu-uebk25',
    kind: 'overlay',
    titleKey: 'map.layer.uebk25',
    url: LFU_UEBK25,
    type: 'wms',
    attribution: '© Bayerisches Landesamt für Umwelt (LfU)',
    offlineOnDemand: true,
  },
  {
    id: 'overlay-lfu-buek200',
    kind: 'overlay',
    titleKey: 'map.layer.buek200',
    url: LFU_BUEK200,
    type: 'wms',
    attribution: '© LfU — BÜK200',
    offlineOnDemand: true,
  },
  {
    id: 'overlay-lfu-hk100',
    kind: 'overlay',
    titleKey: 'map.layer.hk100',
    url: LFU_HK100,
    type: 'wms',
    attribution: '© LfU — HK100',
    offlineOnDemand: true,
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
