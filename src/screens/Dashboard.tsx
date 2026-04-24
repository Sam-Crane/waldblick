import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TopBar from '@/components/Layout/TopBar';
import PriorityBadge from '@/components/PriorityBadge';
import { db } from '@/data/db';
import { useTranslation } from '@/i18n';

export default function Dashboard() {
  const t = useTranslation();
  const observations = useLiveQuery(() => db.observations.toArray(), []) ?? [];
  const critical = observations.filter((o) => o.priority === 'critical' && o.status !== 'resolved');
  const open = observations.filter((o) => o.status !== 'resolved');
  const resolved = observations.length - open.length;
  const healthPct = observations.length === 0 ? 100 : Math.round((resolved / observations.length) * 100);
  const recent = [...observations].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 5);

  return (
    <div className="flex min-h-full flex-col bg-primary pb-24 text-on-primary">
      <TopBar title="Waldblick" variant="dark" />
      <div className="flex flex-col px-margin-main pt-stack-lg">
        <div className="mb-stack-lg flex items-center justify-between">
          <h2 className="text-headline-md font-semibold">{t('dashboard.title')}</h2>
          <div className="flex gap-2">
            <button
              className="touch-safe flex items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container shadow-sm active:scale-95"
              aria-label={t('dashboard.filter')}
            >
              <span className="material-symbols-outlined">filter_list</span>
            </button>
            <Link
              to="/record"
              className="touch-safe flex items-center justify-center rounded-lg bg-safety text-white shadow-sm active:scale-95"
              aria-label={t('dashboard.add')}
            >
              <span className="material-symbols-outlined">add</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-gutter-grid">
          {/* Operational Health (full width) */}
          <div className="col-span-2 flex flex-col gap-1 border-l-4 border-tertiary-fixed-dim bg-white/10 p-stack-md backdrop-blur-sm">
            <span className="text-label-sm uppercase tracking-wider text-tertiary-fixed-dim">
              {t('dashboard.health')}
            </span>
            <span className="text-headline-lg font-black">{healthPct}%</span>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full bg-tertiary-fixed-dim transition-[width] duration-500"
                style={{ width: `${healthPct}%` }}
              />
            </div>
          </div>

          <StatCard icon="forest" value={observations.length} labelKey="dashboard.activeObservations" />
          <StatCard
            icon="report_problem"
            value={critical.length}
            labelKey="dashboard.urgent"
            accent="text-error-container"
          />
        </div>

        <section className="mt-stack-lg flex flex-col gap-3">
          <h3 className="text-label-md uppercase tracking-widest text-white/80">{t('dashboard.recent')}</h3>
          {recent.length === 0 ? (
            <div className="rounded border border-white/10 bg-white/5 p-4 text-center text-white/70">
              {t('dashboard.empty')}
            </div>
          ) : (
            recent.map((o) => (
              <Link
                key={o.id}
                to={`/observations/${o.id}`}
                className="flex items-center justify-between bg-white p-stack-md text-on-surface shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-1 ${
                      o.priority === 'critical'
                        ? 'bg-error'
                        : o.priority === 'medium'
                          ? 'bg-tertiary'
                          : 'bg-primary'
                    }`}
                  />
                  <div>
                    <p className="text-label-md font-bold">{t(`category.${o.category}`)}</p>
                    <p className="text-label-sm text-outline">
                      {new Date(o.capturedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <PriorityBadge priority={o.priority} />
              </Link>
            ))
          )}
        </section>

        <Link
          to="/record"
          className="touch-safe mb-stack-lg mt-auto flex w-full items-center justify-center gap-3 rounded-lg bg-tertiary-fixed-dim font-black uppercase tracking-widest text-on-tertiary-fixed shadow-xl active:scale-95"
        >
          <span className="material-symbols-outlined">add_a_photo</span>
          {t('dashboard.newObservation')}
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  labelKey,
  accent = 'text-tertiary-fixed-dim',
}: {
  icon: string;
  value: number | string;
  labelKey: string;
  accent?: string;
}) {
  const t = useTranslation();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-stack-md">
      <span className={`material-symbols-outlined ${accent}`}>{icon}</span>
      <div className="flex flex-col">
        <span className="text-body-lg font-bold">{value}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">{t(labelKey)}</span>
      </div>
    </div>
  );
}
