import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';

// Bright Sky is a free wrapper around DWD (Deutscher Wetterdienst) data.
// No API key required. Endpoint: https://brightsky.dev
type CurrentWeather = {
  timestamp: string;
  temperature: number; // °C
  condition: string | null;
  icon: string | null; // clear-day, partly-cloudy-night, rain, etc.
  wind_speed: number | null; // km/h
  wind_direction: number | null; // degrees
  precipitation: number | null; // mm
  relative_humidity: number | null;
};

type BrightSkyResponse = {
  weather: CurrentWeather;
  sources: Array<{ station_name?: string; distance?: number }>;
};

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: CurrentWeather; source?: string };

const ICON_MATERIAL: Record<string, string> = {
  'clear-day': 'wb_sunny',
  'clear-night': 'bedtime',
  'partly-cloudy-day': 'partly_cloudy_day',
  'partly-cloudy-night': 'partly_cloudy_night',
  cloudy: 'cloud',
  fog: 'foggy',
  rain: 'rainy',
  sleet: 'weather_mix',
  snow: 'ac_unit',
  wind: 'air',
  thunderstorm: 'thunderstorm',
  hail: 'grain',
};

export default function WeatherPanel({ lat, lng }: { lat: number; lng: number }) {
  const t = useTranslation();
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const url = `https://api.brightsky.dev/current_weather?lat=${lat}&lon=${lng}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`http_${r.status}`);
        return r.json() as Promise<BrightSkyResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setState({ status: 'ready', data: json.weather, source: json.sources?.[0]?.station_name });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: 'error', message: (e as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-label-sm uppercase tracking-widest text-outline">{t('weather.title')}</h3>
        <span className="text-label-sm text-outline">{t('weather.poweredBy')}</span>
      </div>

      {state.status === 'loading' && (
        <p className="flex items-center gap-2 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          {t('weather.loading')}
        </p>
      )}
      {state.status === 'error' && (
        <p className="text-on-surface-variant">{t('weather.error')}</p>
      )}
      {state.status === 'ready' && (
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-[42px] text-primary">
            {(state.data.icon && ICON_MATERIAL[state.data.icon]) || 'thermostat'}
          </span>
          <div className="flex-1">
            <p className="text-headline-md font-bold text-on-surface">
              {Math.round(state.data.temperature)}°C
            </p>
            <p className="text-label-md text-on-surface-variant">
              {state.data.condition ? t(`weather.condition.${state.data.condition}`) : '—'}
            </p>
            {state.data.wind_speed != null && (
              <p className="mt-1 flex items-center gap-1 text-label-sm text-outline">
                <span className="material-symbols-outlined text-[14px]">air</span>
                {Math.round(state.data.wind_speed)} km/h
              </p>
            )}
            {state.source && <p className="mt-1 text-[10px] uppercase tracking-widest text-outline">{state.source}</p>}
          </div>
        </div>
      )}

      {/* Copernicus Sentinel-2 link-out: recent canopy imagery for this coord.
          Full in-app preview needs OAuth — deferred. This opens the official
          Copernicus Browser at the observation coordinates in a new tab. */}
      <a
        href={`https://browser.dataspace.copernicus.eu/?zoom=14&lat=${lat}&lng=${lng}&datasetId=S2_L2A_CDAS`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-stack-md flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface hover:bg-surface-container"
      >
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary-container">satellite_alt</span>
          <div>
            <p className="text-label-md font-semibold">{t('weather.copernicus')}</p>
            <p className="text-label-sm text-outline">{t('weather.copernicusHint')}</p>
          </div>
        </div>
        <span className="material-symbols-outlined text-outline">open_in_new</span>
      </a>
    </section>
  );
}
