import { db } from './db';
import { processPhoto } from './imagePipeline';
import type { Category, Observation, Priority } from './types';

type CreateInput = {
  category: Category;
  priority: Priority;
  description: string;
  lat: number;
  lng: number;
  photo?: Blob;
  audio?: { blob: Blob; mimeType: string; durationMs: number };
  plotId?: string;
};

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const observationRepo = {
  async create(input: CreateInput): Promise<string> {
    const now = new Date().toISOString();
    const id = uuid();

    const observation: Observation = {
      id,
      category: input.category,
      priority: input.priority,
      status: 'open',
      description: input.description,
      lat: input.lat,
      lng: input.lng,
      plotId: input.plotId,
      capturedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const processed = input.photo ? await processPhoto(input.photo) : undefined;

    await db.transaction('rw', db.observations, db.photos, db.audio, db.syncOps, async () => {
      await db.observations.add(observation);
      if (processed) {
        await db.photos.add({
          id: uuid(),
          observationId: id,
          blob: processed.blob,
          width: processed.width,
          height: processed.height,
          capturedAt: now,
        });
      }
      if (input.audio) {
        await db.audio.add({
          id: uuid(),
          observationId: id,
          blob: input.audio.blob,
          mimeType: input.audio.mimeType,
          durationMs: input.audio.durationMs,
          capturedAt: now,
        });
      }
      await db.syncOps.add({
        id: uuid(),
        kind: 'create',
        entity: 'observation',
        payload: { id },
        createdAt: now,
        attempts: 0,
      });
    });

    // Kick off a sync attempt. If offline or Supabase unset, it no-ops safely.
    void import('./syncEngine').then((m) => m.syncNow());
    // Write-behind: prefetch map tiles around this observation so the user
    // can revisit the area offline. No-op when offline.
    void import('@/map/autoCache').then((m) => m.cacheAroundPoint(input.lat, input.lng));
    // ERP webhook fanout — POSTs the new observation to a URL set in
    // Settings. Silent on failure; the user can trigger a full re-export
    // via Settings if something goes wrong.
    void import('./exportData').then((m) => m.sendToWebhook(observation));
    return id;
  },

  async get(id: string) {
    return db.observations.get(id);
  },

  async list() {
    return db.observations.where('deletedAt').equals('').or('deletedAt').equals(undefined as never).toArray();
  },

  // Soft-delete: stamps deletedAt on the local row immediately so live
  // queries hide it, then queues a sync op the engine will turn into a
  // remote `update set deleted_at = now()` (see syncEngine.runOp).
  // Idempotent — calling on an already-deleted observation is a no-op.
  async softDelete(id: string): Promise<void> {
    const existing = await db.observations.get(id);
    if (!existing || existing.deletedAt) return;
    const now = new Date().toISOString();

    await db.transaction('rw', db.observations, db.syncOps, async () => {
      await db.observations.update(id, { deletedAt: now, updatedAt: now });
      await db.syncOps.add({
        id: uuid(),
        kind: 'delete',
        entity: 'observation',
        payload: { id },
        createdAt: now,
        attempts: 0,
      });
    });

    void import('./syncEngine').then((m) => m.syncNow());
  },
};
