// Query the LfU soil WMS at a given coord via GetFeatureInfo, parse the
// returned HTML/text for the soil class, and cache per rounded parcel in
// Dexie so the recommendation keeps working offline after the first fetch.
//
// ÜBK25 (1:25k) is more precise; BÜK200 (1:200k) is the coarser fallback.
// Both services return HTML by default — we parse defensively: any readable
// mention of a soil-class keyword is enough to drive the species matrix.

import { db } from './db';
import type { SoilProfile } from '@/domain/species';

// How finely we cache; ~100m grid at mid-latitudes.
const CACHE_PRECISION = 3;

const ENDPOINTS = [
  {
    name: 'uebk25',
    url: 'https://www.lfu.bayern.de/gdi/wms/boden/uebk25',
    layer: 'uebk25',
  },
  {
    name: 'buek200',
    url: 'https://www.lfu.bayern.de/gdi/wms/boden/buek200by',
    layer: 'buek200',
  },
];

// Keyword catalog used to extract a soil class from a free-text WMS response.
// Matches are case-insensitive. First hit wins; order = preference.
const SOIL_KEYWORDS = [
  'Parabraunerde',
  'Braunerde',
  'Pseudogley',
  'Gley',
  'Rendzina',
  'Pelosol',
  'Regosol',
  'Ranker',
  'Podsol',
  'Auenboden',
  'Terra fusca',
  'Kalkmarsch',
];

const SUBSTRATE_KEYWORDS = ['Kalkstein', 'Sandstein', 'Löss', 'Mergel', 'Ton', 'Sand'];

type CacheEntry = {
  key: string;
  profile: SoilProfile;
  source: string;
  fetchedAt: string;
};

export async function getSoilProfile(lat: number, lng: number): Promise<{ profile: SoilProfile; source: string } | null> {
  const key = cacheKey(lat, lng);
  const cached = (await readCache(key)) as CacheEntry | undefined;
  if (cached) return { profile: cached.profile, source: cached.source };

  for (const ep of ENDPOINTS) {
    try {
      const text = await getFeatureInfoHtml(ep.url, ep.layer, lat, lng);
      const parsed = parseSoil(text);
      if (parsed) {
        await writeCache({ key, profile: parsed, source: ep.name, fetchedAt: new Date().toISOString() });
        return { profile: parsed, source: ep.name };
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(CACHE_PRECISION)},${lng.toFixed(CACHE_PRECISION)}`;
}

async function readCache(key: string): Promise<unknown> {
  // We reuse the Dexie `photos` trick isn't appropriate; add a tiny KV via
  // a dedicated cache table using localStorage is cleanest for v1.
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`soil:${key}`) : null;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return undefined;
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`soil:${entry.key}`, JSON.stringify(entry));
  } catch {
    /* quota full; ignore */
  }
  // Keep db import so repo surface stays consistent; unused at the moment.
  void db;
}

async function getFeatureInfoHtml(baseUrl: string, layer: string, lat: number, lng: number): Promise<string> {
  // Build a 1x1 pixel GetFeatureInfo query centered on the point (small bbox).
  const d = 0.0005;
  const bbox = mercatorBbox(lat - d, lng - d, lat + d, lng + d);
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: layer,
    QUERY_LAYERS: layer,
    STYLES: '',
    CRS: 'EPSG:3857',
    WIDTH: '101',
    HEIGHT: '101',
    I: '50',
    J: '50',
    FORMAT: 'image/png',
    INFO_FORMAT: 'text/html',
    FEATURE_COUNT: '1',
    BBOX: bbox.join(','),
  });
  const url = `${baseUrl}?${params.toString()}`;
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`soil_wms_${res.status}`);
  return res.text();
}

function parseSoil(text: string): SoilProfile | null {
  const lower = text.toLowerCase();
  const soilClass = SOIL_KEYWORDS.find((k) => lower.includes(k.toLowerCase()));
  if (!soilClass) return null;
  const substrate = SUBSTRATE_KEYWORDS.find((k) => lower.includes(k.toLowerCase()));

  // Very rough moisture hint from keywords — WMS descriptions often include
  // water-balance terms. If nothing hits, leave undefined.
  let moisture: SoilProfile['moisture'];
  if (/feucht|nass|staun|hydromorph/.test(lower)) moisture = 'wet';
  else if (/mäßig\s+frisch|frisch/.test(lower)) moisture = 'moist';
  else if (/trocken|mäßig\s+trocken/.test(lower)) moisture = 'dry';
  else moisture = 'moderate';

  return { soilClass, substrate, moisture };
}

// EPSG:3857 bbox for a lat/lng rectangle (for WMS GetMap/GetFeatureInfo BBOX).
function mercatorBbox(minLat: number, minLng: number, maxLat: number, maxLng: number): [number, number, number, number] {
  const R = 6378137;
  const x = (lng: number) => (lng * Math.PI * R) / 180;
  const y = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x(minLng), y(minLat), x(maxLng), y(maxLat)];
}
