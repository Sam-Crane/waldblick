import { db } from './db';
import { supabase, hasSupabase } from './supabase';
import type { Task } from './types';

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const taskRepo = {
  async assign(observationId: string, assigneeId: string, dueAt?: string): Promise<string> {
    const now = new Date().toISOString();
    const task: Task = {
      id: uuid(),
      observationId,
      assigneeId,
      dueAt,
      createdAt: now,
    };
    await db.tasks.add(task);

    // Best-effort remote insert. Sync engine drains nothing for tasks yet;
    // remote write happens inline. If offline / no Supabase, row stays local
    // and can be re-sent on reconnect via a future sync_op kind.
    if (hasSupabase && supabase && typeof navigator !== 'undefined' && navigator.onLine) {
      const { error } = await supabase.from('tasks').insert({
        id: task.id,
        observation_id: task.observationId,
        assignee_id: task.assigneeId,
        due_at: task.dueAt ?? null,
        created_at: task.createdAt,
      });
      if (error) {
        // soft-fail: the local row is still correct; surface to caller via
        // an error log rather than blocking the UI.
        console.warn('tasks.insert failed', error.message);
      }
    }

    return task.id;
  },

  async complete(id: string): Promise<void> {
    const now = new Date().toISOString();
    await db.tasks.update(id, { completedAt: now });
    if (hasSupabase && supabase && navigator.onLine) {
      await supabase.from('tasks').update({ completed_at: now }).eq('id', id);
    }
  },

  async forObservation(observationId: string) {
    return db.tasks.where('observationId').equals(observationId).toArray();
  },

  async forAssignee(assigneeId: string) {
    return db.tasks.where('assigneeId').equals(assigneeId).toArray();
  },
};
