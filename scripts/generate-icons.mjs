// Rasterizes the master SVGs in public/ into the PNGs the PWA manifest
// references. Run: `npm run icons` after editing icon.svg / icon-maskable.svg.
//
// Outputs:
//   public/icon-192.png            (standard, 192x192)
//   public/icon-512.png            (standard, 512x512)
//   public/icon-512-maskable.png   (maskable, 512x512)
//   public/apple-touch-icon.png    (180x180, iOS home screen)
//   public/favicon-32.png          (32x32, browser tab)

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = (f) => resolve(root, 'public', f);

const jobs = [
  { src: 'public/icon.svg', size: 192, dest: 'icon-192.png' },
  { src: 'public/icon.svg', size: 512, dest: 'icon-512.png' },
  { src: 'public/icon-maskable.svg', size: 512, dest: 'icon-512-maskable.png' },
  { src: 'public/icon.svg', size: 180, dest: 'apple-touch-icon.png' },
  { src: 'public/icon.svg', size: 32, dest: 'favicon-32.png' },
];

await mkdir(resolve(root, 'public'), { recursive: true });

for (const job of jobs) {
  const input = resolve(root, job.src);
  const output = out(job.dest);
  await sharp(input).resize(job.size, job.size).png({ compressionLevel: 9 }).toFile(output);
  console.log(`wrote ${job.dest} (${job.size}x${job.size})`);
}
