import { supabase, hasSupabase } from './supabase';
import type { Machine, MachineKind } from './types';

// Machines are ephemeral: not mirrored to Dexie. Source of truth is the
// Supabase table + a realtime subscription. When Supabase is absent we
// return an empty list gracefully so the map still renders.

export type Subscription = { unsubscribe: () => void };

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
    const { error } = await supabase.from('machines').upsert(
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
    );
    if (error) console.warn('machines.upsert failed', error.message);
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
