import { Link } from 'react-router-dom';
import PriorityBadge from '@/components/PriorityBadge';
import { useTranslation } from '@/i18n';
import type { Observation } from '@/data/types';

type Props = {
  observations: Observation[];
  variant?: 'dark' | 'light';
  compact?: boolean;
};

export default function InventoryStats({ observations, variant = 'dark', compact = false }: Props) {
  const t = useTranslation();
  const critical = observations.filter((o) => o.priority === 'critical' && o.status !== 'resolved');
  const open = observations.filter((o) => o.status !== 'resolved');
  const resolved = observations.length - open.length;
  const healthPct = observations.length === 0 ? 100 : Math.round((resolved / observations.length) * 100);
  const recent = [...observations].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 5);

  const dark = variant === 'dark';

  return (
    <div className={`flex flex-col gap-gutter-grid ${dark ? 'text-on-primary' : 'text-on-surface'}`}>
      <div className="grid grid-cols-2 gap-gutter-grid">
        <div
          className={`col-span-2 flex flex-col gap-1 border-l-4 p-stack-md backdrop-blur-sm ${
            dark
              ? 'border-tertiary-fixed-dim bg-white/10'
              : 'border-tertiary bg-surface-container-low'
          }`}
        >
          <span
            className={`text-label-sm uppercase tracking-wider ${dark ? 'text-tertiary-fixed-dim' : 'text-outline'}`}
          >
            {t('dashboard.health')}
          </span>
          <span className="text-headline-lg font-black">{healthPct}%</span>
          <div className={`mt-1 h-1.5 w-full overflow-hidden rounded-full ${dark ? 'bg-white/20' : 'bg-surface-container'}`}>
            <div
              className={`h-full transition-[width] duration-500 ${dark ? 'bg-tertiary-fixed-dim' : 'bg-tertiary'}`}
              style={{ width: `${healthPct}%` }}
            />
          </div>
        </div>

        <StatCard
          icon="forest"
          value={observations.length}
          labelKey="dashboard.activeObservations"
          dark={dark}
          accent={dark ? 'text-tertiary-fixed-dim' : 'text-primary'}
        />
        <StatCard
          icon="report_problem"
          value={critical.length}
          labelKey="dashboard.urgent"
          dark={dark}
          accent={dark ? 'text-error-container' : 'text-error'}
        />
      </div>

      {!compact && (
        <section className="mt-2 flex flex-col gap-3">
          <h3 className={`text-label-md uppercase tracking-widest ${dark ? 'text-white/80' : 'text-outline'}`}>
            {t('dashboard.recent')}
          </h3>
          {recent.length === 0 ? (
            <div
              className={`rounded border p-4 text-center ${
                dark ? 'border-white/10 bg-white/5 text-white/70' : 'border-outline-variant bg-surface-container text-on-surface-variant'
              }`}
            >
              {t('dashboard.empty')}
            </div>
          ) : (
            recent.map((o) => (
              <Link
                key={o.id}
                to={`/observations/${o.id}`}
                className={`flex items-center justify-between p-stack-md shadow-md ${
                  dark ? 'bg-white text-on-surface' : 'bg-surface-container-lowest text-on-surface border border-outline-variant'
                }`}
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
                    <p className="text-label-sm text-outline">{new Date(o.capturedAt).toLocaleString()}</p>
                  </div>
                </div>
                <PriorityBadge priority={o.priority} />
              </Link>
            ))
          )}
        </section>
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  labelKey,
  accent,
  dark,
}: {
  icon: string;
  value: number | string;
  labelKey: string;
  accent: string;
  dark: boolean;
}) {
  const t = useTranslation();
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg p-stack-md ${
        dark ? 'border border-white/10 bg-white/5' : 'border border-outline-variant bg-surface-container-lowest'
      }`}
    >
      <span className={`material-symbols-outlined ${accent}`}>{icon}</span>
      <div className="flex flex-col">
        <span className="text-body-lg font-bold">{value}</span>
        <span
          className={`text-[10px] font-bold uppercase tracking-widest ${
            dark ? 'text-white/60' : 'text-outline'
          }`}
        >
          {t(labelKey)}
        </span>
      </div>
    </div>
  );
}
