import Dexie, { type EntityTable } from 'dexie';
import type { Observation, ObservationAudio, ObservationPhoto, SyncOp, Task } from './types';

class WaldblickDb extends Dexie {
  observations!: EntityTable<Observation, 'id'>;
  photos!: EntityTable<ObservationPhoto, 'id'>;
  audio!: EntityTable<ObservationAudio, 'id'>;
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
    // v3: index updatedAt so realtime pull-since-local can orderBy it.
    this.version(3).stores({
      observations: 'id, capturedAt, updatedAt, priority, category, status, plotId, deletedAt',
      photos: 'id, observationId, capturedAt',
      syncOps: 'id, createdAt, entity, kind',
      tasks: 'id, observationId, assigneeId, completedAt',
    });
    // v4: add audio table for voice notes on observations.
    this.version(4).stores({
      observations: 'id, capturedAt, updatedAt, priority, category, status, plotId, deletedAt',
      photos: 'id, observationId, capturedAt',
      audio: 'id, observationId, capturedAt',
      syncOps: 'id, createdAt, entity, kind',
      tasks: 'id, observationId, assigneeId, completedAt',
    });
  }
}

export const db = new WaldblickDb();
