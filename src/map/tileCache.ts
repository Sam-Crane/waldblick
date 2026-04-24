import { layerById } from './layers';
import { tilesTemplate } from './wms';

// Primes the browser cache (and Workbox StaleWhileRevalidate) with tiles
// covering a bbox at zoom levels [minZoom..maxZoom].
// Fetches tiles one by one with a small concurrency pool; aborts on size cap.
//
// 256 is the default tile size; WMS sources with tileSize 512 will still be
// fetched via MapLibre's {bbox-epsg-3857} template which we inline here.

const CONCURRENCY = 6;
const SIZE_CAP_BYTES = 200 * 1024 * 1024; // 200 MB

export type Progress = {
  total: number;
  done: number;
  bytes: number;
  aborted?: boolean;
  error?: string;
};

type Bounds = { west: number; east: number; south: number; north: number };

export async function cacheArea(
  bounds: Bounds,
  layerIds: string[],
  minZoom = 12,
  maxZoom = 15,
  onProgress?: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<Progress> {
  const urls: string[] = [];
  for (const id of layerIds) {
    const def = layerById(id);
    if (!def) continue;
    if (def.type === 'xyz') {
      for (let z = minZoom; z <= maxZoom; z++) {
        const { x0, x1, y0, y1 } = tileRange(bounds, z);
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            urls.push(def.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
          }
        }
      }
    } else {
      // WMS: pre-compute a GetMap URL per tile by substituting the bbox manually.
      for (let z = minZoom; z <= maxZoom; z++) {
        const { x0, x1, y0, y1 } = tileRange(bounds, z);
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const [template] = tilesTemplate(def);
            const url = template.replace('{bbox-epsg-3857}', tileBboxMercator(x, y, z).join(','));
            urls.push(url);
          }
        }
      }
    }
  }

  const progress: Progress = { total: urls.length, done: 0, bytes: 0 };
  onProgress?.(progress);

  let idx = 0;
  const workers: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (idx < urls.length) {
          if (signal?.aborted) {
            progress.aborted = true;
            return;
          }
          if (progress.bytes >= SIZE_CAP_BYTES) {
            progress.aborted = true;
            progress.error = 'size_cap_reached';
            return;
          }
          const url = urls[idx++];
          try {
            const res = await fetch(url, { signal, mode: 'cors' });
            if (res.ok) {
              const len = Number(res.headers.get('content-length')) || 0;
              progress.bytes += len;
            }
          } catch {
            // swallow individual tile errors; workbox will retry on next view
          }
          progress.done++;
          onProgress?.(progress);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return progress;
}

// Slippy-map tile range for a bbox at a given zoom. [x0..x1] x [y0..y1].
function tileRange(b: Bounds, z: number) {
  const n = 2 ** z;
  const x0 = Math.floor(((b.west + 180) / 360) * n);
  const x1 = Math.floor(((b.east + 180) / 360) * n);
  const y0 = Math.floor(((1 - Math.log(Math.tan(rad(b.north)) + 1 / Math.cos(rad(b.north))) / Math.PI) / 2) * n);
  const y1 = Math.floor(((1 - Math.log(Math.tan(rad(b.south)) + 1 / Math.cos(rad(b.south))) / Math.PI) / 2) * n);
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
}

// Bbox for an x/y/z tile in EPSG:3857 meters (for WMS GetMap).
function tileBboxMercator(x: number, y: number, z: number): [number, number, number, number] {
  const size = 2 * Math.PI * 6378137;
  const resolution = size / 2 ** z;
  const origin = -size / 2;
  const minX = origin + x * resolution;
  const maxX = origin + (x + 1) * resolution;
  const maxY = -origin - y * resolution;
  const minY = -origin - (y + 1) * resolution;
  return [minX, minY, maxX, maxY];
}

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}
