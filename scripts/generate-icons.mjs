// Rasterizes the master SVGs in public/ into all PNG assets the PWA
// manifest + iOS Safari require. Run: `npm run icons` after editing any
// of: public/icon.svg, public/icon-maskable.svg, public/splash.svg.
//
// Icon outputs:
//   public/icon-192.png            (standard, 192x192)
//   public/icon-512.png            (standard, 512x512)
//   public/icon-512-maskable.png   (maskable, 512x512)
//   public/apple-touch-icon.png    (180x180, iOS home screen)
//   public/favicon-32.png          (32x32, browser tab)
//
// Splash outputs (iOS PWA launch screens). Sizes cover modern iPhones
// + common iPads; older devices degrade gracefully to the theme_color.

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = (f) => resolve(root, 'public', f);

const iconJobs = [
  { src: 'public/icon.svg', size: 192, dest: 'icon-192.png' },
  { src: 'public/icon.svg', size: 512, dest: 'icon-512.png' },
  { src: 'public/icon-maskable.svg', size: 512, dest: 'icon-512-maskable.png' },
  { src: 'public/icon.svg', size: 180, dest: 'apple-touch-icon.png' },
  { src: 'public/icon.svg', size: 32, dest: 'favicon-32.png' },
];

// iOS splash sizes (portrait). width × height in PNG pixels.
const splashJobs = [
  { w: 1179, h: 2556, dest: 'splash-1179x2556.png' }, // iPhone 15/14 Pro
  { w: 1290, h: 2796, dest: 'splash-1290x2796.png' }, // iPhone 15/14 Pro Max
  { w: 1170, h: 2532, dest: 'splash-1170x2532.png' }, // iPhone 13/12
  { w: 1284, h: 2778, dest: 'splash-1284x2778.png' }, // iPhone 13/12 Pro Max
  { w: 828,  h: 1792, dest: 'splash-828x1792.png'  }, // iPhone XR/11
  { w: 750,  h: 1334, dest: 'splash-750x1334.png'  }, // iPhone SE/8
  { w: 1536, h: 2048, dest: 'splash-1536x2048.png' }, // iPad 9.7"
  { w: 1668, h: 2388, dest: 'splash-1668x2388.png' }, // iPad Pro 11"
  { w: 2048, h: 2732, dest: 'splash-2048x2732.png' }, // iPad Pro 12.9"
];

await mkdir(resolve(root, 'public'), { recursive: true });

for (const job of iconJobs) {
  const input = resolve(root, job.src);
  await sharp(input).resize(job.size, job.size).png({ compressionLevel: 9 }).toFile(out(job.dest));
  console.log(`wrote ${job.dest} (${job.size}x${job.size})`);
}

// Splash: composite the 2048-square splash.svg onto a device-sized canvas,
// with the Forest Green extending to fill the portrait rectangle.
const splashSrc = resolve(root, 'public/splash.svg');
for (const job of splashJobs) {
  await sharp(splashSrc)
    .resize(job.w, job.h, {
      fit: 'contain',
      background: { r: 0x17, g: 0x31, b: 0x24, alpha: 1 },
    })
    .png({ compressionLevel: 9 })
    .toFile(out(job.dest));
  console.log(`wrote ${job.dest} (${job.w}x${job.h})`);
}
