import Dexie, { type EntityTable } from 'dexie';
import type { Observation, ObservationPhoto, SyncOp, Task } from './types';

class WaldblickDb extends Dexie {
  observations!: EntityTable<Observation, 'id'>;
  photos!: EntityTable<ObservationPhoto, 'id'>;
  syncOps!: EntityTable<SyncOp, 'id'>;
  tasks!: EntityTable<Task, 'id'>;

  constructor() {
    super('waldblick');
    this.version(1).stores({
      observations: 'id, capturedAt, priority, category, status, plotId, deletedAt',
      photos: 'id, observationId, capturedAt',
      syncOps: 'id, createdAt, entity, kind',
    });
    this.version(2).stores({
      observations: 'id, capturedAt, priority, category, status, plotId, deletedAt',
      photos: 'id, observationId, capturedAt',
      syncOps: 'id, createdAt, entity, kind',
      tasks: 'id, observationId, assigneeId, completedAt',
    });
  }
}

export const db = new WaldblickDb();
