import { supabase, hasSupabase } from './supabase';
import type { Machine, MachineKind } from './types';

// Machines are ephemeral: not mirrored to Dexie. Source of truth is the
// Supabase table + a realtime subscription. When Supabase is absent we
// return an empty list gracefully so the map still renders.
//
// Trails are the last few hours of positions per machine, kept in a
// separate machine_positions table pruned to 4h on every insert.

export type Subscription = { unsubscribe: () => void };

export type TrailPoint = { lat: number; lng: number; recordedAt: string };
export type Trails = Record<string, TrailPoint[]>; // keyed by machine id

type RemoteRow = {
  id: string;
  user_id: string;
  forest_id: string | null;
  kind: MachineKind;
  label: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  last_seen_at: string;
};

function toDomain(r: RemoteRow): Machine {
  return {
    id: r.id,
    userId: r.user_id,
    forestId: r.forest_id ?? undefined,
    kind: r.kind,
    label: r.label ?? undefined,
    lat: r.lat,
    lng: r.lng,
    heading: r.heading ?? undefined,
    lastSeenAt: r.last_seen_at,
  };
}

export const machinesRepo = {
  async upsertSelf(input: {
    forestId?: string;
    kind: MachineKind;
    label?: string;
    lat: number;
    lng: number;
    heading?: number;
  }): Promise<void> {
    if (!hasSupabase || !supabase) return;
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;

    // Upsert the current-position row. The returning id lets us then
    // write into machine_positions with the correct FK reference.
    const { data, error } = await supabase
      .from('machines')
      .upsert(
        {
          user_id: userId,
          forest_id: input.forestId ?? null,
          kind: input.kind,
          label: input.label ?? null,
          lat: input.lat,
          lng: input.lng,
          heading: input.heading ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,forest_id' },
      )
      .select()
      .single();
    if (error || !data) {
      if (error) console.warn('machines.upsert failed', error.message);
      return;
    }

    // Append to trail. Pruner trigger keeps the table bounded at 4h.
    const { error: posErr } = await supabase.from('machine_positions').insert({
      machine_id: data.id,
      user_id: userId,
      forest_id: input.forestId ?? null,
      lat: input.lat,
      lng: input.lng,
      heading: input.heading ?? null,
    });
    if (posErr) console.warn('machine_positions.insert failed', posErr.message);
  },

  async clearSelf(forestId?: string): Promise<void> {
    if (!hasSupabase || !supabase) return;
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return;
    await supabase
      .from('machines')
      .delete()
      .eq('user_id', userId)
      .is('forest_id', forestId ?? null);
  },

  async list(): Promise<Machine[]> {
    if (!hasSupabase || !supabase) return [];
    const { data, error } = await supabase.from('machines').select('*');
    if (error || !data) return [];
    return (data as RemoteRow[]).map(toDomain);
  },

  // Last few hours of positions per machine, grouped by machine id and
  // sorted oldest → newest so MapLibre can draw the LineString in order.
  async listTrails(sinceMinutes = 60): Promise<Trails> {
    if (!hasSupabase || !supabase) return {};
    const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
    const { data, error } = await supabase
      .from('machine_positions')
      .select('machine_id, lat, lng, recorded_at')
      .gt('recorded_at', since)
      .order('recorded_at', { ascending: true })
      .limit(5000);
    if (error || !data) return {};
    const out: Trails = {};
    for (const row of data as Array<{
      machine_id: string;
      lat: number;
      lng: number;
      recorded_at: string;
    }>) {
      (out[row.machine_id] ||= []).push({ lat: row.lat, lng: row.lng, recordedAt: row.recorded_at });
    }
    return out;
  },

  subscribeTrails(onAppend: (machineId: string, point: TrailPoint) => void): Subscription {
    if (!hasSupabase || !supabase) return { unsubscribe: () => {} };
    const channel = supabase
      .channel('machine-positions-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'machine_positions' },
        (payload) => {
          const row = payload.new as { machine_id: string; lat: number; lng: number; recorded_at: string } | null;
          if (!row) return;
          onAppend(row.machine_id, {
            lat: row.lat,
            lng: row.lng,
            recordedAt: row.recorded_at,
          });
        },
      )
      .subscribe();
    return {
      unsubscribe: () => {
        if (supabase) void supabase.removeChannel(channel);
      },
    };
  },

  subscribe(onChange: (machines: Machine[]) => void): Subscription {
    if (!hasSupabase || !supabase) {
      return { unsubscribe: () => {} };
    }
    let current: Map<string, Machine> = new Map();

    // Initial fetch, then keep live via realtime.
    void this.list().then((list) => {
      current = new Map(list.map((m) => [m.id, m]));
      onChange([...current.values()]);
    });

    const channel = supabase
      .channel('machines-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as RemoteRow | null;
          if (old?.id) current.delete(old.id);
        } else {
          const row = payload.new as RemoteRow | null;
          if (row) current.set(row.id, toDomain(row));
        }
        onChange([...current.values()]);
      })
      .subscribe();

    return {
      unsubscribe: () => {
        if (supabase) void supabase.removeChannel(channel);
      },
    };
  },
};

// "Stale" when a machine hasn't pinged in > 5 minutes. The map fades these.
export function isStale(m: Machine): boolean {
  return Date.now() - new Date(m.lastSeenAt).getTime() > 5 * 60 * 1000;
}
