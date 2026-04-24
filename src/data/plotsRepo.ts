import { supabase, hasSupabase } from './supabase';
import { PLOTS as MOCK_PLOTS } from './mocks';
import type { Plot } from './types';

type RemotePlot = {
  id: string;
  forest_id: string;
  name: string;
  color: string | null;
  boundary: Plot['boundary'];
  created_at: string;
  updated_at: string;
};

function toDomain(r: RemotePlot): Plot {
  return {
    id: r.id,
    forestId: r.forest_id,
    name: r.name,
    color: r.color ?? undefined,
    boundary: r.boundary,
  };
}

export const plotsRepo = {
  // Resolve the current user's primary forest (first membership). Used when
  // creating a plot — the plot attaches to that forest. Returns null if the
  // user has no forest yet; the caller should surface "create a forest first".
  async primaryForestId(): Promise<string | null> {
    if (!hasSupabase || !supabase) return null;
    const { data: session } = await supabase.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return null;
    const { data } = await supabase
      .from('memberships')
      .select('forest_id')
      .eq('user_id', me)
      .order('created_at', { ascending: true })
      .limit(1);
    return (data?.[0]?.forest_id as string) ?? null;
  },

  async list(): Promise<Plot[]> {
    if (!hasSupabase || !supabase) return MOCK_PLOTS;
    const { data, error } = await supabase.from('plots').select('*').order('created_at', { ascending: true });
    if (error || !data) return [];
    return (data as RemotePlot[]).map(toDomain);
  },

  async get(id: string): Promise<Plot | null> {
    if (!hasSupabase || !supabase) return MOCK_PLOTS.find((p) => p.id === id) ?? null;
    const { data, error } = await supabase.from('plots').select('*').eq('id', id).single();
    if (error || !data) return null;
    return toDomain(data as RemotePlot);
  },

  async create(input: {
    name: string;
    color?: string;
    boundary: Plot['boundary'];
    forestId?: string;
  }): Promise<{ ok: true; plot: Plot } | { ok: false; error: string }> {
    if (!hasSupabase || !supabase) return { ok: false, error: 'supabase_missing' };
    const forestId = input.forestId ?? (await this.primaryForestId());
    if (!forestId) return { ok: false, error: 'no_forest' };
    const { data, error } = await supabase
      .from('plots')
      .insert({
        forest_id: forestId,
        name: input.name,
        color: input.color ?? null,
        boundary: input.boundary,
      })
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'insert_failed' };
    const plot = toDomain(data as RemotePlot);
    // Write-behind: prefetch tiles across the plot bbox for offline use.
    void import('@/map/autoCache').then((m) =>
      m.cacheAroundBounds(plot.boundary.coordinates[0] ?? []),
    );
    return { ok: true, plot };
  },

  async delete(id: string): Promise<boolean> {
    if (!hasSupabase || !supabase) return false;
    const { error } = await supabase.from('plots').delete().eq('id', id);
    return !error;
  },
};

// Normalize a raw GeoJSON paste into the Plot.boundary shape. Accepts:
//   - a raw Polygon geometry: { type: "Polygon", coordinates: [...] }
//   - a Feature wrapping a Polygon
//   - a FeatureCollection — takes the first Polygon feature
//   - a MultiPolygon Feature — takes the first polygon of its coordinates
//     (we're a simple-polygon domain for v1)
// Throws with a user-facing message on any other shape.
export function parseBoundary(text: string): Plot['boundary'] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('empty');
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('not_json');
  }
  const geom = extractGeometry(parsed);
  if (!geom) throw new Error('no_polygon');
  if (geom.type !== 'Polygon') throw new Error('not_polygon');
  validatePolygon(geom);
  return geom as Plot['boundary'];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGeometry(node: any): { type: string; coordinates: unknown } | null {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'FeatureCollection' && Array.isArray(node.features)) {
    for (const f of node.features) {
      const g = extractGeometry(f);
      if (g?.type === 'Polygon') return g;
    }
    return null;
  }
  if (node.type === 'Feature' && node.geometry) return extractGeometry(node.geometry);
  if (node.type === 'MultiPolygon' && Array.isArray(node.coordinates) && node.coordinates[0]) {
    return { type: 'Polygon', coordinates: node.coordinates[0] };
  }
  if (node.type === 'Polygon' && Array.isArray(node.coordinates)) return node;
  return null;
}

function validatePolygon(geom: { coordinates: unknown }): void {
  const rings = geom.coordinates as unknown;
  if (!Array.isArray(rings) || rings.length === 0) throw new Error('no_rings');
  const outer = rings[0];
  if (!Array.isArray(outer) || outer.length < 4) throw new Error('too_few_vertices');
  for (const pt of outer) {
    if (!Array.isArray(pt) || pt.length < 2) throw new Error('bad_vertex');
    const [lng, lat] = pt;
    if (typeof lng !== 'number' || typeof lat !== 'number') throw new Error('non_numeric');
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) throw new Error('out_of_range');
  }
}
