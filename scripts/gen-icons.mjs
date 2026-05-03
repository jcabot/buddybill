// Generates PWA icons + iOS splash screens from client/public/favicon.svg.
// Run once after install: `node scripts/gen-icons.mjs`. Requires `sharp`.
//
// We don't ship PNGs in the repo — running this script populates them.
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = path.join(root, 'client', 'public', 'favicon.svg');
const outDir = path.join(root, 'client', 'public', 'icons');

const ICON_SIZES = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512, padding: 0.18 },
  { name: 'apple-touch-icon-180.png', size: 180 },
];

const SPLASH_SIZES = [
  { name: 'splash-1290x2796.png', w: 1290, h: 2796 },
  { name: 'splash-1179x2556.png', w: 1179, h: 2556 },
  { name: 'splash-1170x2532.png', w: 1170, h: 2532 },
  { name: 'splash-1125x2436.png', w: 1125, h: 2436 },
  { name: 'splash-828x1792.png', w: 828, h: 1792 },
  { name: 'splash-750x1334.png', w: 750, h: 1334 },
  { name: 'splash-640x1136.png', w: 640, h: 1136 },
];

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const svg = await fs.readFile(src);

  for (const { name, size, padding } of ICON_SIZES) {
    const inner = padding ? Math.round(size * (1 - padding * 2)) : size;
    const buf = await sharp(svg).resize(inner, inner).png().toBuffer();
    let img = sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 255, g: 250, b: 243, alpha: 1 },
      },
    });
    img = img.composite([{ input: buf, gravity: 'center' }]);
    await img.png().toFile(path.join(outDir, name));
    console.log('wrote', name);
  }

  for (const { name, w, h } of SPLASH_SIZES) {
    const logoSize = Math.round(Math.min(w, h) * 0.35);
    const buf = await sharp(svg).resize(logoSize, logoSize).png().toBuffer();
    const img = sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 255, g: 250, b: 243, alpha: 1 },
      },
    });
    await img
      .composite([{ input: buf, gravity: 'center' }])
      .png()
      .toFile(path.join(outDir, name));
    console.log('wrote', name);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
