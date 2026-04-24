import { useEffect, useState } from 'react';
import { getSoilProfile } from '@/data/soilInfo';
import { recommendSpecies, type SoilProfile, type SpeciesRecommendation } from '@/domain/species';
import { useTranslation } from '@/i18n';

// Shown on ObservationDetails when the category is 'reforestation'.
// Fetches soil class from the LfU soil WMS via GetFeatureInfo, caches per
// rough grid cell in localStorage, and runs the in-app species matrix.

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no_soil' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: SoilProfile; source: string; recs: SpeciesRecommendation[] };

export default function SpeciesRecommendations({ lat, lng }: { lat: number; lng: number }) {
  const t = useTranslation();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getSoilProfile(lat, lng)
      .then((hit) => {
        if (cancelled) return;
        if (!hit) return setState({ status: 'no_soil' });
        const recs = recommendSpecies(hit.profile);
        setState({ status: 'ready', profile: hit.profile, source: hit.source, recs });
      })
      .catch((e) => !cancelled && setState({ status: 'error', message: (e as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-label-sm uppercase tracking-widest text-outline">{t('species.title')}</h3>
        <span className="text-label-sm text-outline">{t('species.poweredBy')}</span>
      </div>

      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          {t('species.loading')}
        </p>
      )}

      {state.status === 'error' && <p className="text-on-surface-variant">{t('species.error')}</p>}
      {state.status === 'no_soil' && <p className="text-on-surface-variant">{t('species.noSoil')}</p>}

      {state.status === 'ready' && (
        <>
          <div className="mb-stack-md rounded-lg bg-surface-container-low p-3">
            <p className="text-label-sm uppercase tracking-widest text-outline">{t('species.soil')}</p>
            <p className="text-body-md font-semibold">
              {state.profile.soilClass}
              {state.profile.substrate && <span className="text-outline"> · {state.profile.substrate}</span>}
            </p>
            <p className="text-label-sm text-outline">
              {t('species.source', { source: state.source.toUpperCase() })}
            </p>
          </div>

          {state.recs.length === 0 ? (
            <p className="text-on-surface-variant">{t('species.noMatch')}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {state.recs.slice(0, 3).map((r, i) => (
                <li
                  key={r.species}
                  className="flex items-start justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-label-md font-bold">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] text-on-primary">
                        {i + 1}
                      </span>
                      {r.species}
                      <span className="text-label-sm italic text-outline">· {r.latin}</span>
                    </p>
                    {r.contraindications && r.contraindications.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-label-sm text-on-surface-variant">
                        {r.contraindications.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="ml-3 shrink-0">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        r.confidence >= 0.8
                          ? 'bg-primary-container text-on-primary'
                          : r.confidence >= 0.6
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {Math.round(r.confidence * 100)}%
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
