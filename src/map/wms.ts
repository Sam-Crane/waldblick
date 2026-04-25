import type { LayerDef } from './layers';

// Build MapLibre raster source tiles[] template for a LayerDef.
//
//  xyz      → url used verbatim (must already have {z}/{x}/{y}).
//  wms      → GetMap params appended + EPSG:3857 bbox substitution token.
//  edge-wms → same WMS params, but the upstream URL resolves to a Supabase
//             Edge Function URL so OAuth/secret-bearing layers don't expose
//             credentials in the browser.
export function tilesTemplate(def: LayerDef): string[] {
  if (def.type === 'xyz') return [def.url];

  const size = def.tileSize ?? 256;
  const version = def.wmsVersion ?? '1.3.0';
  // WMS uses different parameter names for the spatial reference between
  // versions: 1.1.1 → SRS, 1.3.0 → CRS. The axis-order semantics for
  // EPSG:3857 are east,north in both versions, so the {bbox-epsg-3857}
  // template works unchanged.
  const baseParams: Record<string, string> = {
    SERVICE: 'WMS',
    VERSION: version,
    REQUEST: 'GetMap',
    LAYERS: def.layer ?? '',
    STYLES: '',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    WIDTH: String(size),
    HEIGHT: String(size),
  };
  if (version === '1.1.1') baseParams.SRS = 'EPSG:3857';
  else baseParams.CRS = 'EPSG:3857';
  const params = new URLSearchParams(baseParams);

  const baseUrl = def.type === 'edge-wms' ? resolveEdgeUrl(def.url) : def.url;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return [`${baseUrl}${sep}${params.toString()}&BBOX={bbox-epsg-3857}`];
}

// Edge-WMS layer URLs are stored as short paths like '/copernicus-tile'.
// Resolve to the project's Edge Functions origin at request time using the
// VITE_SUPABASE_URL env. Falls back to a relative URL (fine during local dev
// when a proxy is in place).
function resolveEdgeUrl(path: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return path;
  // https://<project-ref>.supabase.co  →  https://<project-ref>.functions.supabase.co
  const host = supabaseUrl.replace('.supabase.co', '.functions.supabase.co');
  return host.replace(/\/$/, '') + (path.startsWith('/') ? path : `/${path}`);
}
