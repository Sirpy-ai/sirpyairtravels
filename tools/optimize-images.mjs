/**
 * Sirpy Air Travels — royal site image build.
 *
 * Reads the untouched originals in ../../Banner and ../../public/assets and
 * writes web-sized derivatives into ../assets/img. Safe to re-run: it only
 * ever writes into royal/assets/img and never modifies a source file.
 *
 *   node royal/tools/optimize-images.mjs
 */
import sharp from 'sharp';
import { mkdir, stat, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The full-resolution originals (~19 MB of 2752x1536 JPEGs) are deliberately
 * NOT committed to this repository — only the web-sized derivatives are.
 * By default we look one level above the repo, which is where they sit in the
 * working folder. Override with SIRPY_SOURCE_DIR when working from a clone:
 *
 *   SIRPY_SOURCE_DIR="/path/to/Website" node tools/optimize-images.mjs
 */
const ROOT = process.env.SIRPY_SOURCE_DIR
  ? resolve(process.env.SIRPY_SOURCE_DIR)
  : resolve(HERE, '..', '..');
const BANNER_SRC = join(ROOT, 'Banner');
const LOGO_SRC = join(ROOT, 'public', 'assets');
const IMG_OUT = resolve(HERE, '..', 'assets', 'img');
const BANNER_OUT = join(IMG_OUT, 'banners');

// Original filename -> web slug. Order here is the hero slider order.
const BANNERS = [
  ['Air_India_travel_banner_design_202608200107.jpeg', 'air-india-special-fare'],
  ['Indigo_travel_banner_design_2K_202608200108.jpeg', 'indigo-special-offer'],
  ['Scoot_promotional_banner_design_2K_202608200111.jpeg', 'scoot-boarding-pass'],
  ['Aircraft_promotional_banner_design_2K_202608200108.jpeg', 'scoot-routes-offer'],
  ['Travel_banner_for_Sirpy_Air_202608200110.jpeg', 'travel-together-group'],
  ['Scoot_promotional_banner_design_2K_202608200108.jpeg', 'scoot-promo-offer'],
];

const WIDTHS = [1600, 1000, 640];

const kb = (n) => `${Math.round(n / 1024)} KB`;

async function sizeOf(p) {
  try { return (await stat(p)).size; } catch { return 0; }
}

async function buildBanner(file, slug) {
  const src = join(BANNER_SRC, file);
  if (!(await sizeOf(src))) {
    console.warn(`  ! missing source, skipped: ${file}`);
    return 0;
  }
  let written = 0;
  for (const w of WIDTHS) {
    const base = sharp(src).resize({ width: w, withoutEnlargement: true });
    const webp = join(BANNER_OUT, `${slug}-${w}.webp`);
    await base.clone().webp({ quality: 78, effort: 5 }).toFile(webp);
    written += await sizeOf(webp);
  }
  // One JPEG fallback for browsers without WebP.
  const jpg = join(BANNER_OUT, `${slug}-1600.jpg`);
  await sharp(src)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 76, mozjpeg: true, progressive: true })
    .toFile(jpg);
  written += await sizeOf(jpg);

  const from = await sizeOf(src);
  console.log(`  ${slug.padEnd(24)} ${kb(from).padStart(8)} -> ${kb(written).padStart(8)} (4 files)`);
  return written;
}

async function buildPopup() {
  const src = join(BANNER_SRC, 'pop up.jpeg');
  if (!(await sizeOf(src))) {
    console.warn('  ! missing source, skipped: pop up.jpeg');
    return;
  }
  for (const w of [900, 600]) {
    await sharp(src).resize({ width: w }).webp({ quality: 80, effort: 5 })
      .toFile(join(IMG_OUT, `popup-${w}.webp`));
  }
  await sharp(src).resize({ width: 900 })
    .jpeg({ quality: 78, mozjpeg: true, progressive: true })
    .toFile(join(IMG_OUT, 'popup-900.jpg'));
  const out = (await sizeOf(join(IMG_OUT, 'popup-900.webp')))
    + (await sizeOf(join(IMG_OUT, 'popup-600.webp')))
    + (await sizeOf(join(IMG_OUT, 'popup-900.jpg')));
  console.log(`  ${'popup'.padEnd(24)} ${kb(await sizeOf(src)).padStart(8)} -> ${kb(out).padStart(8)} (3 files)`);
}

/**
 * The source logos are print-resolution (the roundel is 1254x1254 / ~987 KB)
 * but render at 52 px in the header plaque, so they are resized rather than
 * copied. Alpha is preserved for the wordmark.
 */
async function buildLogos() {
  const jobs = [
    ['logo-icon.png', 'logo-icon.png', 160],
    ['logo.png', 'logo.png', 640]
  ];
  for (const [srcName, outName, width] of jobs) {
    const src = join(LOGO_SRC, srcName);
    const from = await sizeOf(src);
    if (!from) {
      console.warn(`  ! logo not found: ${srcName}`);
      continue;
    }
    const out = join(IMG_OUT, outName);
    await sharp(src)
      .resize({ width, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toFile(out);
    console.log(`  ${outName.padEnd(24)} ${kb(from).padStart(8)} -> ${kb(await sizeOf(out)).padStart(8)}`);
  }
}

async function main() {
  if (!(await sizeOf(join(BANNER_SRC, BANNERS[0][0])))) {
    console.error('Source artwork not found in: ' + BANNER_SRC);
    console.error('The originals are not committed to this repo. Point at them with:');
    console.error('  SIRPY_SOURCE_DIR="/path/to/Website" node tools/optimize-images.mjs');
    console.error('
The images already in assets/img are up to date — you only need');
    console.error('this script when adding or replacing banner artwork.');
    process.exit(1);
  }
  await mkdir(BANNER_OUT, { recursive: true });
  console.log('Banners:');
  let total = 0;
  for (const [file, slug] of BANNERS) total += await buildBanner(file, slug);
  console.log('Pop-up:');
  await buildPopup();
  console.log('Logos:');
  await buildLogos();

  const all = await readdir(BANNER_OUT);
  console.log(`\nDone. ${all.length} banner files in royal/assets/img/banners.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
