// Compass / device orientation. On native the Capacitor Motion plugin's
// permission is granted once at install and persists across app launches —
// the user does NOT see an "Enable compass" button every time. On web
// we fall back to `deviceorientation` + the iOS Safari one-off permission
// request (see NavigateTo.tsx).

import { isNative } from './index';

// Subscribe to compass heading updates. Returns an unsubscribe function.
// The heading is in degrees clockwise from north (0 = north, 90 = east).
export async function watchCompass(
  onHeading: (deg: number) => void,
): Promise<() => void> {
  if (isNative()) {
    const { Motion } = await import('@capacitor/motion');
    const handle = await Motion.addListener('orientation', (event) => {
      // Capacitor gives alpha = rotation around Z axis counter-clockwise
      // from north; invert to match compass-heading convention.
      if (typeof event.alpha === 'number') {
        onHeading((360 - event.alpha) % 360);
      }
    });
    return () => {
      handle.remove();
    };
  }

  // Web path — identical to NavigateTo's logic; the screen still uses
  // that directly for the iOS permission flow. Exposed here so other
  // screens (a future compass mode on the map) can share the plumbing.
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return () => {};
  }
  const onOrient = (e: DeviceOrientationEvent) => {
    const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
      .webkitCompassHeading;
    if (typeof webkit === 'number') onHeading(webkit);
    else if (typeof e.alpha === 'number') onHeading((360 - e.alpha) % 360);
  };
  window.addEventListener('deviceorientation', onOrient, true);
  return () => window.removeEventListener('deviceorientation', onOrient, true);
}
