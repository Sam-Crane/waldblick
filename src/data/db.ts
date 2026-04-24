import Dexie, { type EntityTable } from 'dexie';
import type { Observation, ObservationPhoto, SyncOp } from './types';

class WaldblickDb extends Dexie {
  observations!: EntityTable<Observation, 'id'>;
  photos!: EntityTable<ObservationPhoto, 'id'>;
  syncOps!: EntityTable<SyncOp, 'id'>;

  constructor() {
    super('waldblick');
    this.version(1).stores({
      observations: 'id, capturedAt, priority, category, status, plotId, deletedAt',
      photos: 'id, observationId, capturedAt',
      syncOps: 'id, createdAt, entity, kind',
    });
  }
}

export const db = new WaldblickDb();
