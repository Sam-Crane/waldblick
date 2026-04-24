import type { LayerDef } from './layers';

// Build MapLibre raster source tiles[] template for a LayerDef.
// For WMS layers we construct a GetMap request with EPSG:3857 bbox substitution.
// For XYZ we just use the URL as-is.
export function tilesTemplate(def: LayerDef): string[] {
  if (def.type === 'xyz') return [def.url];

  const size = def.tileSize ?? 256;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: def.layer ?? '',
    STYLES: '',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    CRS: 'EPSG:3857',
    WIDTH: String(size),
    HEIGHT: String(size),
  });
  // MapLibre substitutes {bbox-epsg-3857} at request time.
  const sep = def.url.includes('?') ? '&' : '?';
  return [`${def.url}${sep}${params.toString()}&BBOX={bbox-epsg-3857}`];
}
