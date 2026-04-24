// Platform layer — the only place in the app that knows whether we're
// running in a Capacitor native shell or in a plain browser.
//
// Every feature that has a native-capability upgrade routes through here.
// Web fallback remains first-class: the PWA works on its own, the native
// shell just gets better behaviour for a handful of things.
//
//   import { isNative, platform } from '@/platform';
//   if (isNative()) { ... } else { ... }

import { Capacitor } from '@capacitor/core';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function platform(): 'web' | 'ios' | 'android' {
  const p = Capacitor.getPlatform();
  return p === 'ios' ? 'ios' : p === 'android' ? 'android' : 'web';
}
