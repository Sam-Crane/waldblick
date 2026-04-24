import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.unterreiner.waldblick',
  appName: 'Waldblick',
  // `vite build` writes to dist/. `npx cap sync` copies this directory
  // into the native shells.
  webDir: 'dist',
  server: {
    // In dev the native build can point at the Vite dev server instead of
    // copying dist/. Uncomment to debug live against `npm run dev`.
    // url: 'http://192.168.4.128:5173',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    // Splash screen: mirrors the PWA manifest background_color
    // (Forest Green) so the native launch doesn't flash white.
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#173124',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
