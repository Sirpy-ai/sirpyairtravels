/**
 * Safety check before publishing a fresh scrape.
 *
 *   node tools/check-fares.mjs <old fares.json> <new fares.json>
 *
 * Fails (exit 1) when:
 *   - a route has no flights at all, or
 *   - more than one airline vanished (looks like the scraper broke), or
 *   - the airlines that are still listed have under 70% of their old flights.
 * A single airline disappearing (e.g. Google Flights stopped listing IndiGo
 * in Oct 2026) is only a warning, so the other airlines keep updating.
 */
import { readFileSync } from 'node:fs';

const ROUTES = ['SIN-TRZ', 'TRZ-SIN', 'SIN-MAA', 'MAA-SIN', 'SIN-CJB', 'CJB-SIN'];
const today = new Date().toLocaleDateString('en-CA');
const upcoming = (f) => JSON.parse(readFileSync(f, 'utf8')).flights.filter((r) => r[0] >= today);
const countBy = (rows, key) => rows.reduce((m, r) => (m[key(r)] = (m[key(r)] || 0) + 1, m), {});

const oldF = upcoming(process.argv[2]), newF = upcoming(process.argv[3]);
const routes = countBy(newF, (r) => r[1] + '-' + r[2]);
const oldAir = countBy(oldF, (r) => r[3]), newAir = countBy(newF, (r) => r[3]);
console.log('old upcoming:', oldF.length, oldAir);
console.log('new upcoming:', newF.length, newAir, routes);

const fail = (msg) => { console.error(msg); process.exit(1); };

const missing = ROUTES.filter((k) => !routes[k]);
if (missing.length) fail('No flights scraped for: ' + missing.join(', '));

const gone = Object.keys(oldAir).filter((a) => !newAir[a]);
if (gone.length > 1) fail('Several airlines vanished (' + gone.join(', ') + ') - scraper probably broken. Not publishing.');
if (gone.length) console.warn(`WARNING: no ${gone[0]} flights any more (${oldAir[gone[0]]} before). Publishing the other airlines.`);

const oldKept = oldF.filter((r) => newAir[r[3]]).length;
if (newF.length < oldKept * 0.7) fail(`Scrape looks incomplete (${newF.length} vs ${oldKept} for the same airlines, under 70%). Not publishing.`);
console.log('Sanity check passed.');
