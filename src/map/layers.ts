// Single source of truth for all map layer endpoints and attributions.
// Keep URLs here — code elsewhere references layers by id.

export type LayerKind = 'base' | 'overlay';

export type LayerDef = {
  id: string;
  kind: LayerKind;
  titleKey: `map.layer.${string}`; // i18n key
  url: string; // XYZ or WMS GetMap template
  type: 'xyz' | 'wms';
  layer?: string; // WMS layer param
  attribution: string;
  tileSize?: 256 | 512;
  // If true, only fetched when user explicitly downloads an offline area.
  offlineOnDemand?: boolean;
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
];

export function layerById(id: string): LayerDef | undefined {
  return LAYERS.find((l) => l.id === id);
}
