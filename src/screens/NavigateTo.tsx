import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import TopBar from '@/components/Layout/TopBar';
import { db } from '@/data/db';
import { compassLabel, haversineMeters, initialBearing } from '@/domain/geo';
import { useTranslation } from '@/i18n';

// Full-screen "walk me to the tree" mode. Works offline, no external APIs,
// no hardware beyond the phone.
//
// What we show, from most trustworthy to least:
//   1. Distance (haversine from live GPS → stored observation lat/lng)
//      — always shown. Never lies.
//   2. Bearing in degrees + compass label ("NE · 42°")
//      — always shown. Tells you which way to face.
//   3. An arrow. Rotated by:
//       - GPS heading when walking (accurate above ~1 m/s)
//       - Device compass when stationary (only if permission granted)
//       - Otherwise: arrow points straight up (= "true north"); read the
//         bearing number and face that direction manually.
//
// A deliberate design choice: when compass data is unreliable, we don't
// pretend. The arrow dims and we surface the bearing number prominently.

const ARRIVED_M = 10;
const CLOSE_M = 50;

type State =
  | { phase: 'waiting' }
  | { phase: 'error'; message: string }
  | {
      phase: 'tracking';
      distanceM: number;
      bearingDeg: number;
      myHeading: number | null;
      accuracyM: number;
    };

export default function NavigateTo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useTranslation();
  const observation = useLiveQuery(() => (id ? db.observations.get(id) : undefined), [id]);

  const [state, setState] = useState<State>({ phase: 'waiting' });
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  // Only iOS 13+ Safari actually gates `deviceorientation` on an explicit
  // user-gesture permission. Everywhere else (Android, desktop) the events
  // stream as soon as we attach the listener. Detecting that up-front lets
  // us avoid showing an "Enable compass" button where it isn't needed.
  const needsIosPermission =
    typeof window !== 'undefined' &&
    typeof (
      window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      }
    )?.requestPermission === 'function';
  const [iosPermission, setIosPermission] = useState<'granted' | 'denied' | 'unknown'>(
    needsIosPermission ? 'unknown' : 'granted',
  );

  // Live GPS. watchPosition gives us accuracy + heading (when moving).
  useEffect(() => {
    if (!observation) return;
    if (!navigator.geolocation) {
      setState({ phase: 'error', message: t('navigate.err.noGeolocation') });
      return;
    }
    const target = { lat: observation.lat, lng: observation.lng };
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const distanceM = haversineMeters(me, target);
        const bearingDeg = initialBearing(me, target);
        setState({
          phase: 'tracking',
          distanceM,
          bearingDeg,
          // heading is reliable only when moving
          myHeading:
            pos.coords.speed != null && pos.coords.speed > 0.3 && pos.coords.heading != null
              ? pos.coords.heading
              : null,
          accuracyM: pos.coords.accuracy,
        });

        // Haptic cues intentionally omitted: Chrome blocks
        // navigator.vibrate from async callbacks unless the user tapped
        // within the last ~5 seconds (User Activation policy). Holding
        // the phone while walking doesn't count, so vibration from
        // watchPosition fires the "Intervention" warning and usually
        // no-ops. Visual state (green "arrived" ring) is the primary
        // cue. If the user needs audible feedback later, we can add a
        // beep via Web Audio that plays only after a user gesture.
      },
      (err) => {
        const key =
          err.code === 1
            ? 'navigate.err.permissionDenied'
            : err.code === 3
              ? 'navigate.err.timeout'
              : 'navigate.err.unavailable';
        setState({ phase: 'error', message: t(key) });
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [observation, t]);

  // Device compass. Attach the listener eagerly: on Android/desktop the
  // events just stream, no permission needed. On iOS 13+ Safari the events
  // are silently filtered until requestPermission() has been called from
  // a user gesture, but attaching the listener before permission is
  // harmless. If we get at least one tick within 2s we mark permission
  // as effectively 'granted' so the UI doesn't show the button.
  useEffect(() => {
    let alive = true;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (!alive) return;
      const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (typeof webkit === 'number') {
        setCompassHeading(webkit);
      } else if (typeof e.alpha === 'number') {
        setCompassHeading((360 - e.alpha) % 360);
      }
      // First event fired → permission was already live for this session
      // (either granted on this tab, or platform doesn't need it).
      setIosPermission('granted');
    };
    window.addEventListener('deviceorientation', onOrient, true);
    return () => {
      alive = false;
      window.removeEventListener('deviceorientation', onOrient, true);
    };
  }, []);

  const requestCompass = async () => {
    const ctor = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof ctor?.requestPermission !== 'function') {
      setIosPermission('granted');
      return;
    }
    try {
      const r = await ctor.requestPermission();
      setIosPermission(r);
    } catch {
      setIosPermission('denied');
    }
  };

  if (!observation && id) {
    return (
      <div className="flex h-full flex-col">
        <TopBar title={t('navigate.title')} />
        <p className="p-margin-main text-on-surface-variant">{t('details.notFound')}</p>
      </div>
    );
  }

  const arrowAngle =
    state.phase === 'tracking'
      ? state.myHeading != null
        ? // Walking: rotate so arrow points to target relative to direction of travel
          normalize(state.bearingDeg - state.myHeading)
        : compassHeading != null
          ? // Stationary with compass: rotate relative to compass heading
            normalize(state.bearingDeg - compassHeading)
          : // No orientation data: point to true north so user can read bearing number
            state.bearingDeg
      : 0;

  const compassTrustworthy =
    state.phase === 'tracking' && (state.myHeading != null || compassHeading != null);

  const proximity =
    state.phase === 'tracking'
      ? state.distanceM <= ARRIVED_M
        ? 'arrived'
        : state.distanceM <= CLOSE_M
          ? 'close'
          : 'far'
      : 'far';

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <TopBar
        title={t('navigate.title')}
        leading={
          <button
            onClick={() => navigate(-1)}
            className="touch-safe flex items-center justify-center rounded-full hover:bg-surface-container"
            aria-label={t('common.back')}
          >
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
        }
        showProfile={false}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-stack-lg px-margin-main">
        {state.phase === 'waiting' && (
          <div className="flex flex-col items-center gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            <p>{t('navigate.acquiring')}</p>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="max-w-sm rounded-lg border border-error bg-error-container/60 p-4 text-center text-on-error-container">
            <span className="material-symbols-outlined mb-2 text-4xl">error</span>
            <p>{state.message}</p>
          </div>
        )}

        {state.phase === 'tracking' && (
          <>
            <div
              className={`flex h-64 w-64 items-center justify-center rounded-full border-8 ${
                proximity === 'arrived'
                  ? 'border-primary bg-primary-fixed'
                  : proximity === 'close'
                    ? 'border-safety bg-tertiary-fixed-dim/40'
                    : 'border-outline-variant bg-surface-container-low'
              }`}
            >
              {proximity === 'arrived' ? (
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-7xl text-primary">check_circle</span>
                  <p className="text-headline-md font-black text-primary">
                    {t('navigate.arrived')}
                  </p>
                </div>
              ) : (
                <div
                  className="transition-transform duration-300 ease-out"
                  style={{ transform: `rotate(${arrowAngle}deg)` }}
                >
                  <span
                    className={`material-symbols-outlined text-[140px] ${
                      compassTrustworthy ? 'text-safety' : 'text-outline'
                    }`}
                    style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}
                  >
                    navigation
                  </span>
                </div>
              )}
            </div>

            {/* Distance — always trustworthy */}
            <div className="text-center">
              <p className="text-[48px] font-black leading-none text-on-surface">
                {formatDistance(state.distanceM)}
              </p>
              <p className="mt-1 text-label-md uppercase tracking-widest text-outline">
                {compassLabel(state.bearingDeg)} · {Math.round(state.bearingDeg)}°
              </p>
              <p className="mt-1 text-label-sm text-outline">
                {t('navigate.accuracy', { m: Math.round(state.accuracyM) })}
              </p>
            </div>

            {/* Orientation hint — help the user understand the arrow */}
            {!compassTrustworthy && (
              <div className="max-w-sm rounded-lg border border-outline-variant bg-surface-container-low p-3 text-center text-label-sm text-on-surface-variant">
                {needsIosPermission && iosPermission !== 'granted' ? (
                  // iOS 13+ — permission prompt is per-session and requires a gesture.
                  <button
                    onClick={requestCompass}
                    className="inline-flex items-center gap-2 font-semibold text-primary-container underline"
                  >
                    <span className="material-symbols-outlined text-[18px]">explore</span>
                    {t('navigate.enableCompass')}
                  </button>
                ) : (
                  // Non-iOS, or iOS after permission grant: compass events just
                  // haven't arrived yet. Usually means the device is still or
                  // the user hasn't moved the phone at all.
                  <p>{t('navigate.startWalking')}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Photo hint — "here's what to look for" */}
      {observation?.description && (
        <div className="border-t border-outline-variant bg-surface-container-lowest p-margin-main">
          <p className="text-label-sm uppercase tracking-widest text-outline">
            {t('navigate.target')}
          </p>
          <p className="text-body-md text-on-surface">{observation.description}</p>
        </div>
      )}
    </div>
  );
}

function normalize(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function formatDistance(m: number): string {
  if (m < 10) return `${m.toFixed(1)} m`;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

