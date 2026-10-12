/**
 * Price history for the "lowest fares per airline" page.
 *
 *   node tools/build-history.mjs <folder of daily snapshots>
 *
 * The folder holds one fare file per day, named YYYY-MM-DD.json (the same
 * format as assets/data/fares.json). The script keeps, for every flight,
 * the lowest fare seen across all snapshots, and writes
 * assets/data/history.json. It only uses data that was actually saved.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const SRC = process.argv[2];
if (!SRC) { console.error('Usage: node tools/build-history.mjs <folder>'); process.exit(1); }

const files = (await readdir(SRC)).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
if (!files.length) { console.error(`No YYYY-MM-DD.json snapshots in ${SRC}`); process.exit(1); }

const rows = new Map();
const snapshots = [];
for (const name of files) {
  const seenOn = name.slice(0, 10);
  const data = JSON.parse(await readFile(join(SRC, name), 'utf8'));
  snapshots.push(seenOn);
  for (const r of data.flights) {
    const [date, from, to, airline, dep, arr, plus, dur, fare] = r;
    const key = `${date}|${from}|${to}|${airline}|${dep}`;
    const cur = rows.get(key);
    if (!cur) {
      rows.set(key, { d: date, f: from, t: to, a: airline, dep, arr, plus, dur, fare, first: seenOn, last: seenOn, seen: 1 });
    } else {
      if (fare < cur.fare) { cur.fare = fare; cur.arr = arr; cur.plus = plus; cur.dur = dur; }
      cur.last = seenOn;
      cur.seen += 1;
    }
  }
}

const out = {
  generated: new Date().toISOString(),
  snapshots,
  note: 'Lowest base fare seen per flight across the saved daily snapshots. Prices are the airline fare before our markup and baggage.',
  flights: [...rows.values()].sort((a, b) => a.d.localeCompare(b.d) || a.f.localeCompare(b.f) || a.t.localeCompare(b.t))
};
await writeFile(join(SITE, 'assets', 'data', 'history.json'), JSON.stringify(out));
console.log(`Snapshots: ${snapshots.join(', ')} · ${out.flights.length} flights → assets/data/history.json`);
