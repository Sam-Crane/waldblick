import { useEffect } from 'react';
import { supabase, hasSupabase } from './supabase';
import { useSession } from './session';
import { db } from './db';
import { mergeRemoteObservation, mergeRemotePhoto } from './syncEngine';

// Subscribes the current user to live changes on observations + observation_photos.
// Conflict resolution: newer `updated_at` wins (handled in mergeRemoteObservation).
// Soft deletes: `deleted_at` is preserved in Dexie; screens filter it out.
export function useRealtimeSync(): void {
  const { user, loading, isDemoMode } = useSession();
  useEffect(() => {
    if (loading || isDemoMode || !hasSupabase || !supabase || !user) return;

    // Initial pull of anything changed since we last synced locally.
    void pullSinceLocal();

    const channel = supabase
      .channel('observations-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'observations' }, (payload) => {
        const row = payload.new as Record<string, unknown> | null;
        if (!row) return;
        void mergeRemoteObservation(row);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'observation_photos' }, (payload) => {
        const row = payload.new as Record<string, unknown> | null;
        if (!row) return;
        void mergeRemotePhoto(row);
      })
      .subscribe();

    return () => {
      if (supabase) void supabase.removeChannel(channel);
    };
  }, [user, loading, isDemoMode]);
}

async function pullSinceLocal() {
  if (!supabase) return;
  try {
    // Defensive: on older Dexie schemas updatedAt may not be indexed — fall
    // back to in-memory sort rather than crash the whole app.
    let sinceIso: string;
    try {
      const latest = await db.observations.orderBy('updatedAt').last();
      sinceIso = latest?.updatedAt ?? new Date(0).toISOString();
    } catch {
      const all = await db.observations.toArray();
      sinceIso = all.reduce<string>(
        (acc, o) => (o.updatedAt > acc ? o.updatedAt : acc),
        new Date(0).toISOString(),
      );
    }

    const { data, error } = await supabase
      .from('observations')
      .select('*')
      .gt('updated_at', sinceIso)
      .order('updated_at', { ascending: true })
      .limit(500);
    if (error || !data) return;
    for (const row of data) await mergeRemoteObservation(row as Record<string, unknown>);

    const { data: photos } = await supabase
      .from('observation_photos')
      .select('*')
      .gt('captured_at', sinceIso)
      .limit(500);
    if (photos) for (const row of photos) await mergeRemotePhoto(row as Record<string, unknown>);
  } catch (err) {
    console.warn('pullSinceLocal failed', err);
  }
}
