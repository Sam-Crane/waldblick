import type { Category, Observation, Priority } from '@/data/types';
import { haversineMeters } from './geo';

export type DateRange = 'all' | 'today' | '7d' | '30d';

export type TaskFilters = {
  priorities: Set<Priority>; // empty = all
  categories: Set<Category>; // empty = all
  date: DateRange;
  byProximity: boolean; // if true, sort by distance to origin (requires origin)
};

export const ALL_PRIORITIES: Priority[] = ['critical', 'medium', 'low'];

export const ALL_CATEGORIES: Category[] = [
  'beetle',
  'thinning',
  'reforestation',
  'windthrow',
  'erosion',
  'machine',
  'other',
];

export const emptyFilters = (): TaskFilters => ({
  priorities: new Set(),
  categories: new Set(),
  date: 'all',
  byProximity: false,
});

export function filterActive(f: TaskFilters): number {
  return (
    (f.priorities.size > 0 ? 1 : 0) +
    (f.categories.size > 0 ? 1 : 0) +
    (f.date !== 'all' ? 1 : 0) +
    (f.byProximity ? 1 : 0)
  );
}

export function applyFilters(
  list: Observation[],
  filters: TaskFilters,
  origin?: { lat: number; lng: number },
): Observation[] {
  const now = Date.now();
  const windowMs = filters.date === 'today' ? 24 : filters.date === '7d' ? 24 * 7 : filters.date === '30d' ? 24 * 30 : 0;
  const cutoff = windowMs ? now - windowMs * 60 * 60 * 1000 : 0;

  const priorityOrder: Record<Priority, number> = { critical: 0, medium: 1, low: 2 };

  const filtered = list.filter((o) => {
    if (filters.priorities.size > 0 && !filters.priorities.has(o.priority)) return false;
    if (filters.categories.size > 0 && !filters.categories.has(o.category)) return false;
    if (cutoff > 0 && new Date(o.capturedAt).getTime() < cutoff) return false;
    return true;
  });

  if (filters.byProximity && origin) {
    return filtered.sort((a, b) => haversineMeters(origin, a) - haversineMeters(origin, b));
  }
  return filtered.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || b.capturedAt.localeCompare(a.capturedAt),
  );
}
