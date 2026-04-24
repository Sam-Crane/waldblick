import { db } from './db';
import type { Category, Observation, Priority } from './types';

type CreateInput = {
  category: Category;
  priority: Priority;
  description: string;
  lat: number;
  lng: number;
  photo?: Blob;
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

    await db.transaction('rw', db.observations, db.photos, db.syncOps, async () => {
      await db.observations.add(observation);
      if (input.photo) {
        await db.photos.add({
          id: uuid(),
          observationId: id,
          blob: input.photo,
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

    return id;
  },

  async get(id: string) {
    return db.observations.get(id);
  },

  async list() {
    return db.observations.where('deletedAt').equals('').or('deletedAt').equals(undefined as never).toArray();
  },
};
