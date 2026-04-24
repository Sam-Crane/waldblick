import type { Category, Priority } from '@/data/types';

export const CATEGORY_DEFAULT_PRIORITY: Record<Category, Priority> = {
  beetle: 'critical',
  erosion: 'critical',
  windthrow: 'critical',
  thinning: 'medium',
  reforestation: 'medium',
  machine: 'low',
  other: 'low',
};

// Bumps medium → critical when clustered near an existing critical observation (v1 rule).
export const CRITICAL_CLUSTER_RADIUS_M = 50;

// Unresolved criticals older than this get a `stale` flag server-side.
export const STALE_CRITICAL_AGE_HOURS = 48;

export function defaultPriorityFor(category: Category): Priority {
  return CATEGORY_DEFAULT_PRIORITY[category];
}
