import { defineConfig, type ServerOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';
import path from 'node:path';

const httpsEnabled = process.env.VITE_HTTPS === '1';

// If the user has run mkcert into ./certs/, use those (trusted by Safari).
// Otherwise fall back to @vitejs/plugin-basic-ssl (Chrome-only).
const keyPath = path.resolve(__dirname, 'certs/key.pem');
const certPath = path.resolve(__dirname, 'certs/cert.pem');
const hasMkcert = fs.existsSync(keyPath) && fs.existsSync(certPath);

const httpsConfig: ServerOptions['https'] | undefined = httpsEnabled && hasMkcert
  ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
  : undefined;

export default defineConfig({
  plugins: [
    react(),
    // Only use basic-ssl when HTTPS is on and no mkcert certs were found.
    ...(httpsEnabled && !hasMkcert ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Waldblick',
        short_name: 'Waldblick',
        description: 'Waldblick — field observations, mapped and shared.',
        theme_color: '#173124',
        background_color: '#f9f9ff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'basemap-satellite',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/geoservices\.bayern\.de\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'bayernatlas-wms',
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
          {
            urlPattern: /^https:\/\/www\.lfu\.bayern\.de\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lfu-wms',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: true,
    port: 5173,
    https: httpsConfig,
    // Permit ngrok / cloudflared tunnel hostnames when forwarding to this dev server.
    allowedHosts: ['.ngrok.dev', '.ngrok-free.app', '.trycloudflare.com', '.ngrok.io'],
    // Dev-time proxies for tile services that don't send CORS headers.
    // BayernAtlas's vector tile CDN (vt{1,2,3}.bayernwolke.de) is one
    // such — they serve .pbf tiles without Access-Control-Allow-Origin,
    // so the browser blocks the response when we fetch directly. Routing
    // through Vite's dev proxy gives MapLibre a same-origin URL.
    //
    // The same problem exists in prod; for that we'll need a Supabase
    // Edge Function (or Cloudflare Worker) sitting on /bayern-vt that
    // mirrors this proxy. For now we ship dev-only and document the
    // production path in bayernVectorStyle.ts.
    proxy: {
      // bayernwolke.de uses Referer-based hotlink protection — requests
      // without a Referer matching atlas.bayern.de get 400 Bad Request
      // even though the URL is valid. The proxy rewrites Referer + Origin
      // to spoof a request from the atlas.bayern.de viewer so the
      // upstream serves the tile. This is dev-only; the same trick will
      // be needed in the production proxy (Edge Function) when we wire it.
      '/bayern-vt/1': {
        target: 'https://vt1.bayernwolke.de',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/bayern-vt\/1/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://atlas.bayern.de/');
            proxyReq.setHeader('Origin', 'https://atlas.bayern.de');
          });
        },
      },
      '/bayern-vt/2': {
        target: 'https://vt2.bayernwolke.de',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/bayern-vt\/2/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://atlas.bayern.de/');
            proxyReq.setHeader('Origin', 'https://atlas.bayern.de');
          });
        },
      },
      '/bayern-vt/3': {
        target: 'https://vt3.bayernwolke.de',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/bayern-vt\/3/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Referer', 'https://atlas.bayern.de/');
            proxyReq.setHeader('Origin', 'https://atlas.bayern.de');
          });
        },
      },
    },
  },
});
