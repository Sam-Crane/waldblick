import { useEffect } from 'react';
import { supabase, hasSupabase } from './supabase';
import { useSession } from './session';
import { db } from './db';
import { mergeRemoteObservation, mergeRemotePhoto } from './syncEngine';

// Subscribes the current user to live changes on observations +
// observation_photos. On sign-in, does a full server-authoritative
// reconcile so the Dexie cache can't hold rows the server has since
// stopped serving (e.g. after an RLS tightening). Incremental realtime
// updates then stream on top.
export function useRealtimeSync(): void {
  const { user, loading, isDemoMode } = useSession();
  useEffect(() => {
    if (loading || isDemoMode || !hasSupabase || !supabase || !user) return;

    void fullResync();

    const channel = supabase
      .channel('observations-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'observations' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as { id?: string } | null;
          if (old?.id) void db.observations.delete(old.id);
          return;
        }
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

// Replaces Dexie's observations + photos with the server-authoritative set
// minus any local-only pending rows that haven't synced yet (so we don't
// delete observations the user just captured offline).
export async function fullResync(): Promise<{ removed: number; kept: number } | null> {
  if (!hasSupabase || !supabase) return null;
  try {
    const { data: rows, error } = await supabase
      .from('observations')
      .select('*')
      .order('updated_at', { ascending: true })
      .limit(1000);
    if (error || !rows) return null;

    const serverIds = new Set((rows as Array<{ id: string }>).map((r) => r.id));

    // Preserve local rows that are queued for upload (never dropped).
    const pendingOps = await db.syncOps
      .where('entity')
      .equals('observation')
      .toArray();
    const pendingIds = new Set(
      pendingOps.map((op) => (op.payload as { id?: string }).id).filter(Boolean) as string[],
    );

    let removed = 0;
    let kept = 0;
    await db.transaction('rw', db.observations, db.photos, async () => {
      const all = await db.observations.toArray();
      for (const o of all) {
        if (!serverIds.has(o.id) && !pendingIds.has(o.id)) {
          await db.observations.delete(o.id);
          await db.photos.where('observationId').equals(o.id).delete();
          removed++;
        } else {
          kept++;
        }
      }
      for (const row of rows) {
        await mergeRemoteObservation(row as Record<string, unknown>);
      }
    });

    // Pull photos for everything we now show.
    const { data: photos } = await supabase
      .from('observation_photos')
      .select('*')
      .limit(2000);
    if (photos) {
      for (const row of photos) await mergeRemotePhoto(row as Record<string, unknown>);
    }

    return { removed, kept };
  } catch (err) {
    console.warn('fullResync failed', err);
    return null;
  }
}
