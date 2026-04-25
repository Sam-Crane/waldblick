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
    proxy: (() => {
      // Helper: build identical proxy config for each BayernAtlas
      // backend. Cookie-strip (the actual fix for the persistent 400s)
      // + Referer/Origin spoof are uniform across all targets.
      const make = (segment: string, target: string) => ({
        target,
        changeOrigin: true,
        rewrite: (p: string) => p.replace(new RegExp(`^/bayern-vt/${segment}`), ''),
        configure: (proxy: import('http-proxy').Server) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Spoof headers as if request came from atlas.bayern.de.
            proxyReq.setHeader('Referer', 'https://atlas.bayern.de/');
            proxyReq.setHeader('Origin', 'https://atlas.bayern.de');
            // Strip cookies + auth before forwarding upstream. Without
            // this the browser's localhost cookies (Supabase session,
            // Vite HMR token, etc.) plus Vite's own dev-server cookies
            // pile up to >8KB, which trips bayernwolke.de's nginx
            // default header-buffer limit:
            //   400 Bad Request — Request Header Or Cookie Too Large
            // bayernwolke.de doesn't authenticate via cookies anyway;
            // tile requests should be totally unauth'd.
            proxyReq.removeHeader('cookie');
            proxyReq.removeHeader('authorization');
            // Same idea for fetch metadata headers — some CDNs reject
            // requests marked as cross-site by the browser. Strip to
            // make the request look like a server-to-server fetch.
            proxyReq.removeHeader('sec-fetch-site');
            proxyReq.removeHeader('sec-fetch-mode');
            proxyReq.removeHeader('sec-fetch-dest');
            proxyReq.removeHeader('sec-fetch-user');
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            const status = proxyRes.statusCode ?? 0;
            if (status >= 400) {
              const chunks: Buffer[] = [];
              proxyRes.on('data', (chunk: Buffer) => {
                if (chunks.length < 5) chunks.push(chunk); // cap captured body
              });
              proxyRes.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8').slice(0, 400);
                // eslint-disable-next-line no-console
                console.warn(
                  `[bayern-vt/${segment}] ${status} ${proxyRes.statusMessage} for ${req.url}\n` +
                    `  body (first 400 chars): ${body || '<empty>'}`,
                );
              });
            }
          });
          proxy.on('error', (err, req) => {
            // eslint-disable-next-line no-console
            console.warn(`[bayern-vt/${segment}] proxy error for ${req.url}:`, err.message);
          });
        },
      });
      return {
        // Tile CDN backends. Same web_vektor_by tiles, three replicas.
        '/bayern-vt/1': make('1', 'https://vt1.bayernwolke.de'),
        '/bayern-vt/2': make('2', 'https://vt2.bayernwolke.de'),
        '/bayern-vt/3': make('3', 'https://vt3.bayernwolke.de'),
        // Style + TileJSON service. Hosts:
        //   /vt/styles/by_style_*.json    (Mapbox-GL style documents)
        //   /vt/tiles/web_vektor_by.json  (TileJSON for the source above)
        '/bayern-vt/services': make('services', 'https://services.atlas.bayern.de'),
      };
    })(),
  },
});
