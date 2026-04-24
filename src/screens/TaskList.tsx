import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TopBar from '@/components/Layout/TopBar';
import PriorityBadge from '@/components/PriorityBadge';
import FilterChip, { FilterSheet, ToggleRow } from '@/components/FilterChip';
import { ObservationCardSkeleton } from '@/components/Skeleton';
import { db } from '@/data/db';
import { useCurrentUser } from '@/data/currentUser';
import type { Category, Priority } from '@/data/types';
import { useTranslation } from '@/i18n';
import {
  ALL_CATEGORIES,
  ALL_PRIORITIES,
  applyFilters,
  emptyFilters,
  filterActive,
  type DateRange,
  type TaskFilters,
} from '@/domain/filters';

type OpenSheet = 'none' | 'priority' | 'category' | 'date';

export default function TaskList() {
  const t = useTranslation();
  const me = useCurrentUser();
  const observationsRaw = useLiveQuery(() => db.observations.toArray(), []);
  const loading = observationsRaw === undefined;
  const observations = observationsRaw ?? [];
  const myTasks = useLiveQuery(
    () => db.tasks.where('assigneeId').equals(me.id).toArray(),
    [me.id],
  ) ?? [];

  const [filters, setFilters] = useState<TaskFilters>(emptyFilters);
  const [sheet, setSheet] = useState<OpenSheet>('none');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | undefined>();
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    if (!filters.byProximity || origin) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [filters.byProximity, origin]);

  const mineIds = useMemo(() => new Set(myTasks.map((tk) => tk.observationId)), [myTasks]);
  const scoped = mineOnly ? observations.filter((o) => mineIds.has(o.id)) : observations;
  const results = useMemo(() => applyFilters(scoped, filters, origin), [scoped, filters, origin]);

  const togglePriority = (p: Priority) => {
    const next = new Set(filters.priorities);
    next.has(p) ? next.delete(p) : next.add(p);
    setFilters({ ...filters, priorities: next });
  };
  const toggleCategory = (c: Category) => {
    const next = new Set(filters.categories);
    next.has(c) ? next.delete(c) : next.add(c);
    setFilters({ ...filters, categories: next });
  };
  const setDate = (d: DateRange) => setFilters({ ...filters, date: d });
  const toggleProximity = () => setFilters({ ...filters, byProximity: !filters.byProximity });
  const clearAll = () => setFilters(emptyFilters());

  return (
    <div className="flex h-full flex-col pb-24">
      <TopBar
        title={t('tasks.title')}
        trailing={
          filterActive(filters) > 0 ? (
            <button
              onClick={clearAll}
              className="rounded-md px-2 py-1 text-label-sm font-semibold text-primary-container hover:bg-surface-container"
            >
              {t('tasks.clear')}
            </button>
          ) : null
        }
      />
      <main className="mx-auto w-full max-w-2xl px-margin-main py-stack-lg">
        <section className="mb-stack-lg">
          <div className="mb-stack-sm flex items-center justify-between">
            <span className="text-label-md uppercase text-on-surface-variant">{t('tasks.filter')}</span>
            <span className="text-label-sm text-outline">{t('tasks.count', { n: results.length })}</span>
          </div>
          <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
            <FilterChip
              active={mineOnly}
              icon="assignment_ind"
              label={t('filters.mine')}
              onClick={() => setMineOnly((v) => !v)}
              count={mineOnly ? myTasks.length : undefined}
            />
            <FilterChip
              active={filters.priorities.size > 0}
              icon="priority_high"
              label={t('filters.priority')}
              count={filters.priorities.size}
              onClick={() => setSheet('priority')}
            />
            <FilterChip
              active={filters.categories.size > 0}
              icon="category"
              label={t('filters.category')}
              count={filters.categories.size}
              onClick={() => setSheet('category')}
            />
            <FilterChip
              active={filters.date !== 'all'}
              icon="calendar_today"
              label={t(`filters.date.${filters.date}`)}
              onClick={() => setSheet('date')}
            />
            <FilterChip
              active={filters.byProximity}
              icon="near_me"
              label={t('filters.proximity')}
              onClick={toggleProximity}
            />
          </div>
          {filters.byProximity && !origin && (
            <p className="mt-2 text-label-sm text-error">{t('filters.needsGps')}</p>
          )}
        </section>

        {loading ? (
          <ul className="flex flex-col gap-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <ObservationCardSkeleton />
              </li>
            ))}
          </ul>
        ) : results.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-on-surface-variant">
            <span className="material-symbols-outlined mb-2 text-4xl">forest</span>
            <p>{observations.length === 0 ? t('tasks.empty') : t('tasks.noMatch')}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {results.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/observations/${o.id}`}
                  className="relative flex min-h-[120px] items-stretch overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-sm"
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 ${
                      o.priority === 'critical'
                        ? 'bg-error'
                        : o.priority === 'medium'
                          ? 'bg-tertiary'
                          : 'bg-primary-container'
                    }`}
                  />
                  <div className="flex flex-grow flex-col justify-between p-4 pl-5">
                    <div>
                      <div className="mb-1 flex items-start justify-between">
                        <PriorityBadge priority={o.priority} />
                        <span className="flex items-center gap-1 text-label-sm text-outline">
                          <span className="material-symbols-outlined text-[14px]">location_on</span>
                          {o.lat.toFixed(3)}, {o.lng.toFixed(3)}
                        </span>
                      </div>
                      <h3 className="text-body-md font-bold leading-tight text-on-surface">
                        {t(`category.${o.category}`)}
                      </h3>
                      {o.description && (
                        <p className="mt-1 line-clamp-2 text-label-md text-on-surface-variant">{o.description}</p>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <FilterSheet open={sheet === 'priority'} title={t('filters.priority')} onClose={() => setSheet('none')}>
        {ALL_PRIORITIES.map((p) => (
          <ToggleRow
            key={p}
            label={t(`priority.${p}`)}
            active={filters.priorities.has(p)}
            onClick={() => togglePriority(p)}
          />
        ))}
      </FilterSheet>

      <FilterSheet open={sheet === 'category'} title={t('filters.category')} onClose={() => setSheet('none')}>
        {ALL_CATEGORIES.map((c) => (
          <ToggleRow
            key={c}
            label={t(`category.${c}`)}
            active={filters.categories.has(c)}
            onClick={() => toggleCategory(c)}
          />
        ))}
      </FilterSheet>

      <FilterSheet open={sheet === 'date'} title={t('filters.dateTitle')} onClose={() => setSheet('none')}>
        {(['all', 'today', '7d', '30d'] as DateRange[]).map((d) => (
          <ToggleRow
            key={d}
            label={t(`filters.date.${d}`)}
            active={filters.date === d}
            onClick={() => {
              setDate(d);
              setSheet('none');
            }}
          />
        ))}
      </FilterSheet>
    </div>
  );
}
