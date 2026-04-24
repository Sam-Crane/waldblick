import { useEffect, useSyncExternalStore } from 'react';
import { db } from './db';
import { supabase, hasSupabase } from './supabase';
import type { Observation, ObservationPhoto, SyncOp } from './types';

// Pending-op queue drainer. Runs when:
// - module loads (if online)
// - window `online` event
// - document `visibilitychange` to visible
// - manually via syncNow()
// - after a local observation create
//
// Each op is retried on failure with increasing backoff stored on the row.
// Offline + no-Supabase fall back is a no-op; queue stays for later.

export type SyncStatus = 'idle' | 'running' | 'error';
export type SyncState = {
  status: SyncStatus;
  pending: number;
  lastRunAt?: string;
  lastError?: string;
};

let state: SyncState = { status: 'idle', pending: 0 };
const listeners = new Set<() => void>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function snapshot(): SyncState {
  return state;
}

async function refreshPending() {
  setState({ pending: await db.syncOps.count() });
}

let running = false;
export async function syncNow(): Promise<void> {
  if (running) return;
  if (!hasSupabase || !supabase) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  running = true;
  setState({ status: 'running', lastError: undefined });
  try {
    const ops = await db.syncOps.orderBy('createdAt').toArray();
    setState({ pending: ops.length });
    for (const op of ops) {
      try {
        await runOp(op);
        await db.syncOps.delete(op.id);
        await refreshPending();
      } catch (err) {
        const message = (err as Error).message ?? 'unknown';
        await db.syncOps.update(op.id, { attempts: op.attempts + 1, lastError: message });
        // Stop draining on first persistent error — next trigger will retry.
        throw err;
      }
    }
    setState({ status: 'idle', lastRunAt: new Date().toISOString() });
  } catch (err) {
    setState({ status: 'error', lastError: (err as Error).message });
  } finally {
    running = false;
    await refreshPending();
  }
}

async function runOp(op: SyncOp): Promise<void> {
  if (op.entity !== 'observation') return; // v1: only observations flow through sync queue
  const payload = op.payload as { id: string };
  const observation = await db.observations.get(payload.id);
  if (!observation) return; // observation was deleted locally before sync; drop the op

  if (op.kind === 'create' || op.kind === 'update') {
    await upsertObservation(observation);
    await uploadPhotosFor(observation.id);
  } else if (op.kind === 'delete') {
    // soft delete: mark deleted_at
    if (!supabase) throw new Error('supabase_missing');
    const { error } = await supabase
      .from('observations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', observation.id);
    if (error) throw new Error(error.message);
  }
}

async function upsertObservation(o: Observation): Promise<void> {
  if (!supabase) throw new Error('supabase_missing');
  const { data: session } = await supabase.auth.getSession();
  const authorId = session.session?.user.id ?? o.authorId ?? null;

  const row = {
    id: o.id,
    forest_id: o.forestId ?? null,
    plot_id: o.plotId ?? null,
    author_id: authorId,
    category: o.category,
    priority: o.priority,
    status: o.status,
    description: o.description,
    lat: o.lat,
    lng: o.lng,
    captured_at: o.capturedAt,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    deleted_at: o.deletedAt ?? null,
  };

  const { error } = await supabase.from('observations').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`observations.upsert: ${error.message}`);
}

async function uploadPhotosFor(observationId: string): Promise<void> {
  if (!supabase) throw new Error('supabase_missing');
  const pending = await db.photos.where('observationId').equals(observationId).toArray();
  for (const photo of pending) {
    if (photo.storagePath) continue; // already uploaded
    const path = `${observationId}/${photo.id}.jpg`;
    const { error: upErr } = await supabase.storage
      .from('observation-photos')
      .upload(path, photo.blob, { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' });
    if (upErr) throw new Error(`storage.upload: ${upErr.message}`);

    const { error: rowErr } = await supabase.from('observation_photos').upsert(
      {
        id: photo.id,
        observation_id: photo.observationId,
        storage_path: path,
        width: photo.width ?? null,
        height: photo.height ?? null,
        captured_at: photo.capturedAt,
      },
      { onConflict: 'id' },
    );
    if (rowErr) throw new Error(`observation_photos.upsert: ${rowErr.message}`);

    await db.photos.update(photo.id, { storagePath: path });
  }
}

// External hooks --------------------------------------------------------------

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// Mount once at app root to wire up online/visibility triggers + initial drain.
export function useSyncDriver(): void {
  useEffect(() => {
    refreshPending();
    if (!hasSupabase) return;
    void syncNow();

    const onOnline = () => void syncNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

// Resolve a signed read URL for an uploaded photo. Used to display remote
// photos on devices that didn't capture them locally.
export async function signedPhotoUrl(storagePath: string): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.storage
    .from('observation-photos')
    .createSignedUrl(storagePath, 60 * 60);
  if (error) return undefined;
  return data.signedUrl;
}

// Helpers used by realtimeSync ------------------------------------------------
export async function mergeRemoteObservation(remote: Record<string, unknown>): Promise<void> {
  const id = String(remote.id);
  const existing = await db.observations.get(id);
  const remoteUpdated = new Date(String(remote.updated_at ?? remote.updatedAt ?? 0)).getTime();
  if (existing && new Date(existing.updatedAt).getTime() > remoteUpdated) return;

  const next: Observation = {
    id,
    forestId: (remote.forest_id as string) ?? undefined,
    plotId: (remote.plot_id as string) ?? undefined,
    authorId: (remote.author_id as string) ?? undefined,
    category: remote.category as Observation['category'],
    priority: remote.priority as Observation['priority'],
    status: remote.status as Observation['status'],
    description: (remote.description as string) ?? '',
    lat: Number(remote.lat),
    lng: Number(remote.lng),
    capturedAt: String(remote.captured_at),
    createdAt: String(remote.created_at),
    updatedAt: String(remote.updated_at),
    deletedAt: (remote.deleted_at as string) ?? undefined,
  };
  await db.observations.put(next);
}

export async function mergeRemotePhoto(remote: Record<string, unknown>): Promise<void> {
  const id = String(remote.id);
  const existing = await db.photos.get(id);
  if (existing && existing.blob) {
    // Preserve local blob, just attach storagePath.
    await db.photos.update(id, { storagePath: String(remote.storage_path) });
    return;
  }
  const storagePath = String(remote.storage_path);
  const url = await signedPhotoUrl(storagePath);
  if (!url) return;
  const res = await fetch(url);
  if (!res.ok) return;
  const blob = await res.blob();
  const row: ObservationPhoto = {
    id,
    observationId: String(remote.observation_id),
    blob,
    storagePath,
    width: (remote.width as number | null) ?? undefined,
    height: (remote.height as number | null) ?? undefined,
    capturedAt: String(remote.captured_at),
  };
  await db.photos.put(row);
}
