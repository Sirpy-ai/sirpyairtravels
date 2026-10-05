/**
 * Sirpy Air Travels — fare data converter.
 *
 * Turns the scraped Google Flights CSVs (flights_SIN_to_TRZ_*.csv etc.) into
 * assets/data/fares.json, which the flight search, weekly fares and top-10
 * pages read in the browser.
 *
 *   npm run fares                      # uses the default folder below
 *   npm run fares -- "D:\path\to\csvs" # or point it at another folder
 *
 * Every file named flights_<FROM>_to_<TO>_<anything>.csv in the folder is read.
 * When several files cover the same route and day, the most recently modified
 * file wins for that day, so dropping a fresh scrape next to the old ones is
 * enough.
 */
import { readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const DEFAULT_DIR = 'D:\\AI_ORGANIZED\\01_MAIN\\01_SIRPY_AIR_TRAVELS\\2026-09_Flight_Fare_Scrapers\\flights\\fare_matrix';
const SRC = process.argv[2] || DEFAULT_DIR;
const OUT = join(SITE, 'assets', 'data', 'fares.json');

/* Only these sectors are sold on the site. */
const AIRPORTS = ['SIN', 'TRZ', 'MAA', 'CJB'];

const AIRLINE_CODES = {
  'Scoot': 'TR',
  'IndiGo': '6E',
  'Air India Express': 'IX',
  'Air India': 'AI',
  'Singapore Airlines': 'SQ',
  'Malaysia Airlines': 'MH',
  'AirAsia': 'AK',
  'Batik Air': 'OD',
  'SriLankan': 'UL',
  'Vistara': 'UK'
};

/* "10:50 PM" -> "22:50" */
function to24(t) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t.trim());
  if (!m) return null;
  let h = +m[1] % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/* "4 hr 10 min" -> 250 */
function toMinutes(d) {
  const h = /(\d+)\s*hr/.exec(d);
  const m = /(\d+)\s*min/.exec(d);
  return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
}

/* Minimal CSV line split that respects quoted fields. */
function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const names = (await readdir(SRC)).filter((n) => /^flights_[A-Z]{3}_to_[A-Z]{3}_.*\.csv$/i.test(n));
const files = await Promise.all(names.map(async (n) => ({ n, mtime: (await stat(join(SRC, n))).mtimeMs })));
files.sort((a, b) => a.mtime - b.mtime); // oldest first, so newer files overwrite

const flights = new Map();
let newest = 0;
const unknownAirlines = new Set();

for (const { n, mtime } of files) {
  const [, from, to] = /^flights_([A-Z]{3})_to_([A-Z]{3})_/i.exec(n).map((s) => s.toUpperCase());
  if (!AIRPORTS.includes(from) || !AIRPORTS.includes(to)) continue;
  newest = Math.max(newest, mtime);

  const lines = (await readFile(join(SRC, n), 'utf8')).split(/\r?\n/).filter(Boolean);
  const head = splitCsv(lines.shift()).map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  const iDate = col('Date'), iAir = col('Airline'), iDur = col('Duration'),
        iDep = col('Start Time'), iArr = col('End Time'), iPrice = col('Price');

  /* A newer file replaces every flight of the route-days it covers, so a flight
     that has since been cancelled does not linger from an older scrape. */
  const days = new Set(lines.map((l) => splitCsv(l)[iDate]));
  for (const k of flights.keys()) {
    const [d, f, t] = k.split('|');
    if (f === from && t === to && days.has(d)) flights.delete(k);
  }

  for (const line of lines) {
    const c = splitCsv(line);
    const price = parseFloat(String(c[iPrice]).replace(/[^\d.]/g, ''));
    const dep = to24(c[iDep] || ''), arr = to24(c[iArr] || '');
    if (!c[iDate] || !price || !dep || !arr) continue;
    const airline = c[iAir].trim();
    const code = AIRLINE_CODES[airline];
    if (!code) { unknownAirlines.add(airline); continue; }
    const plus = /\+(\d+)/.exec(c[iArr]);
    const key = `${c[iDate]}|${from}|${to}|${code}|${dep}`;
    flights.set(key, [c[iDate], from, to, code, dep, arr, plus ? +plus[1] : 0, toMinutes(c[iDur] || ''), Math.round(price)]);
  }
}

/* Departed flights are dead weight; the browser hides them anyway. */
const today = new Date().toISOString().slice(0, 10);
const rows = [...flights.values()].filter((r) => r[0] >= today).sort((a, b) =>
  a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[4].localeCompare(b[4]));

const usedCodes = new Set(rows.map((r) => r[3]));
const airlines = Object.fromEntries(Object.entries(AIRLINE_CODES).filter(([, c]) => usedCodes.has(c)).map(([n, c]) => [c, n]));

const data = {
  updated: new Date(newest).toISOString().slice(0, 10),
  source: 'Google Flights scrape',
  currency: 'SGD',
  fields: ['date', 'from', 'to', 'airline', 'dep', 'arr', 'arrDayOffset', 'durationMin', 'priceSGD'],
  airlines,
  flights: rows
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data));

const byRoute = {};
for (const r of rows) byRoute[`${r[1]}-${r[2]}`] = (byRoute[`${r[1]}-${r[2]}`] || 0) + 1;
console.log(`Read ${files.length} files from ${SRC}`);
console.log(`Wrote ${rows.length} flights (${rows[0]?.[0]} .. ${rows.at(-1)?.[0]}) to ${OUT}`);
console.log(byRoute);
if (unknownAirlines.size) console.warn('Skipped unknown airlines (add them to AIRLINE_CODES):', [...unknownAirlines]);
