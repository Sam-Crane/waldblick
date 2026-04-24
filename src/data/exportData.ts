import { db } from './db';
import type { Observation, Task } from './types';

// Export the local Dexie state as CSV or JSON for import into ERPs /
// spreadsheets / external systems. Fully client-side, works offline.
//
// CSV is what Excel / LibreOffice / most forestry ERPs (DOKA, FGMS) expect.
// JSON is better for structured integrations (webhooks, custom imports).
// Both exports include only the fields the ERP cares about: location,
// category, priority, status, author, assignee, timestamps. Photos are
// referenced by their Supabase storage path if uploaded, else omitted.

type ObservationRow = {
  id: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  lat: number;
  lng: number;
  captured_at: string;
  forest_id: string;
  plot_id: string;
  author_id: string;
  photo_path: string;
  photo_width: string;
  photo_height: string;
};

async function buildObservationRows(): Promise<ObservationRow[]> {
  const obs = await db.observations.toArray();
  const rows: ObservationRow[] = [];
  for (const o of obs) {
    if (o.deletedAt) continue;
    const photo = await db.photos.where('observationId').equals(o.id).first();
    rows.push({
      id: o.id,
      category: o.category,
      priority: o.priority,
      status: o.status,
      description: o.description,
      lat: o.lat,
      lng: o.lng,
      captured_at: o.capturedAt,
      forest_id: o.forestId ?? '',
      plot_id: o.plotId ?? '',
      author_id: o.authorId ?? '',
      photo_path: photo?.storagePath ?? '',
      photo_width: photo?.width != null ? String(photo.width) : '',
      photo_height: photo?.height != null ? String(photo.height) : '',
    });
  }
  return rows;
}

async function buildTaskRows(): Promise<Task[]> {
  return db.tasks.toArray();
}

// RFC 4180-ish CSV. Fields are always quoted; embedded quotes become "".
// Newlines in description survive because each cell is wrapped in quotes.
function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? '')).join(','));
  }
  return lines.join('\r\n');
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoke on next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function exportObservationsCsv(): Promise<number> {
  const rows = await buildObservationRows();
  const csv = toCsv(rows);
  download(`waldblick-observations-${stamp()}.csv`, csv, 'text/csv');
  return rows.length;
}

export async function exportObservationsJson(): Promise<number> {
  const rows = await buildObservationRows();
  download(
    `waldblick-observations-${stamp()}.json`,
    JSON.stringify(rows, null, 2),
    'application/json',
  );
  return rows.length;
}

export async function exportTasksCsv(): Promise<number> {
  const rows = (await buildTaskRows()).map<Record<string, string>>((tk) => ({
    id: tk.id,
    observation_id: tk.observationId,
    assignee_id: tk.assigneeId,
    due_at: tk.dueAt ?? '',
    completed_at: tk.completedAt ?? '',
    created_at: tk.createdAt,
  }));
  download(`waldblick-tasks-${stamp()}.csv`, toCsv(rows), 'text/csv');
  return rows.length;
}

// Bundle everything into one JSON payload — observations + tasks + plots.
// Good for snapshot backups or one-shot ERP bulk imports.
export async function exportFullJson(): Promise<{ observations: number; tasks: number; plots: number }> {
  const observations = await buildObservationRows();
  const tasks = await buildTaskRows();
  const plots = await db.tasks.toCollection().primaryKeys().catch(() => [] as string[]);
  // Plots live on Supabase in production; Dexie doesn't mirror them yet.
  // In demo mode the bundle ships without plots. A future Dexie-backed
  // plot cache would go here.
  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    observations,
    tasks,
    plots: [],
  };
  download(
    `waldblick-export-${stamp()}.json`,
    JSON.stringify(bundle, null, 2),
    'application/json',
  );
  return { observations: observations.length, tasks: tasks.length, plots: plots.length };
}

function stamp(): string {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// Webhook integration. User configures a URL in Settings; on each new
// observation this fires a POST. Fire-and-forget, graceful on network
// failure (the user can re-trigger via "Resend to webhook" if needed).
const WEBHOOK_KEY = 'waldblick:erp:webhookUrl';

export function getWebhookUrl(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(WEBHOOK_KEY);
}

export function setWebhookUrl(url: string): void {
  if (typeof localStorage === 'undefined') return;
  if (url.trim()) localStorage.setItem(WEBHOOK_KEY, url.trim());
  else localStorage.removeItem(WEBHOOK_KEY);
}

export async function sendToWebhook(observation: Observation): Promise<boolean> {
  const url = getWebhookUrl();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'observation.created',
        observation,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
