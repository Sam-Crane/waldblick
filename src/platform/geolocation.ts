// Cross-platform geolocation. Prefers the Capacitor plugin when running
// native — which gets us:
//   - Background-geolocation updates with the screen locked (machine
//     tracking), via the @capacitor-community/background-geolocation
//     plugin, which survives app backgrounding on both iOS and Android.
//   - Persistent permission (one iOS permission grant survives app
//     relaunches, unlike Safari which resets per tab reload).
//
// Web fallback uses navigator.geolocation directly.

import { isNative, platform } from './index';

export type LatLng = { lat: number; lng: number };
export type PositionSample = {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  at: number;
};

// Thin watchPosition wrapper. Returns an unsubscribe function. On native
// uses Capacitor Geolocation; on web, navigator.geolocation.
export async function watchPosition(
  onSample: (s: PositionSample) => void,
  onError?: (err: Error) => void,
  options: { highAccuracy?: boolean; timeoutMs?: number } = {},
): Promise<() => void> {
  const highAccuracy = options.highAccuracy ?? true;
  const timeout = options.timeoutMs ?? 15_000;

  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    // Permissions: prompt once; a granted iOS / Android native permission
    // persists across app launches, unlike Safari which reprompts per tab.
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted') {
      const req = await Geolocation.requestPermissions();
      if (req.location !== 'granted') {
        onError?.(new Error('permission_denied'));
        return () => {};
      }
    }
    const watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 2_000 },
      (pos, err) => {
        if (err) {
          onError?.(new Error(err.message));
          return;
        }
        if (!pos) return;
        onSample({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed ?? null,
          at: pos.timestamp,
        });
      },
    );
    return async () => {
      await Geolocation.clearWatch({ id: watchId });
    };
  }

  // Web path.
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError?.(new Error('no_geolocation'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      onSample({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading ?? null,
        speed: pos.coords.speed ?? null,
        at: pos.timestamp,
      }),
    (err) => onError?.(new Error(`geolocation_${err.code}`)),
    { enableHighAccuracy: highAccuracy, timeout, maximumAge: 2_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

// Background geolocation (native only). Keeps posting samples to the
// callback even when the app is backgrounded / screen is locked. Critical
// for scenario #4 — machines leave a trail while the operator's phone is
// in their pocket. No web equivalent; returns a no-op unsubscribe.
export async function startBackgroundTracking(
  onSample: (s: PositionSample) => void,
): Promise<() => Promise<void>> {
  if (!isNative()) return async () => {};
  // The package ships only TypeScript definitions — the runtime side is
  // wired through Capacitor's registerPlugin() bridge. Resolve lazily so
  // the web bundle doesn't pull in the native plugin types eagerly.
  const { registerPlugin } = await import('@capacitor/core');
  type BgGeoPlugin = import('@capacitor-community/background-geolocation').BackgroundGeolocationPlugin;
  const BackgroundGeolocation = registerPlugin<BgGeoPlugin>('BackgroundGeolocation');
  const watcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: platform() === 'ios'
        ? 'Waldblick tracks your position so others on the crew can see it.'
        : undefined,
      backgroundTitle: 'Waldblick',
      requestPermissions: true,
      stale: false,
      distanceFilter: 10, // metres — don't over-sample when the operator is parked
    },
    (location, err) => {
      if (err) return;
      if (!location) return;
      void err; // referenced above; keep param for plugin callback signature
      onSample({
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy ?? 0,
        heading: location.bearing ?? null,
        speed: location.speed ?? null,
        at: location.time ?? Date.now(),
      });
    },
  );
  return async () => {
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
  };
}
