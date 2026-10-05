/**
 * Sirpy Air Travels — page builder.
 *
 *   npm run build
 *
 * Wraps every fragment in src/pages/*.html with the shared <head>, top bar,
 * header, mobile drawer, footer and WhatsApp button, and writes the finished
 * page to the site root (src/pages/flights.html -> /flights.html).
 *
 * Each fragment starts with a JSON comment describing the page:
 *   <!-- {"title": "...", "description": "...", "nav": "flights", "scripts": ["booking"]} -->
 *
 * The output is ordinary static HTML that Vercel serves as-is; there is still
 * no build step at deploy time. Run this locally after editing src/ and commit
 * both src/ and the generated pages.
 *
 * Inside a fragment, {{icon:name}} expands to an inline SVG icon and
 * {{wa:message}} to a WhatsApp link with that message pre-filled.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');
const PAGES = join(SITE, 'src', 'pages');
const SITE_URL = 'https://sirpyairtravels.com';
/* Cache-busting query string: changes only when the CSS or JS changes. */
const ASSET_VERSION = createHash('sha1')
  .update(await readFile(join(SITE, 'assets/css/site.css')))
  .update(await readFile(join(SITE, 'assets/js/site.js')))
  .update(await readFile(join(SITE, 'assets/js/booking.js')))
  .digest('hex').slice(0, 8);

const WA_NUMBER = '919344020864';
export const wa = (msg) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;

/* ---------- Icons (Lucide-style strokes) ---------- */
const ICONS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
  pin: '<path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  palm: '<path d="M13 8c0-2.8-2.2-5-5-5-1.7 0-3.2.8-4 2M13 8c2-2.5 5.5-3 8-1M13 8c-1 3-1 8 1 13M13 8c3 0 6 2 7 5M13 8c-3-.5-6 1-7 4"/><path d="M8 21h10"/>',
  passport: '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/>',
  ship: '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.4 17 21 12 12 9 3 12l1.6 5M12 9V3M8 5h8"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  wa: '<path d="M20.5 3.5A11.8 11.8 0 0 0 1.9 17.7L.3 23.6l6-1.6A11.8 11.8 0 0 0 23.8 12a11.7 11.7 0 0 0-3.3-8.5zM12.1 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.6.9 1-3.5-.2-.4a9.8 9.8 0 1 1 8.2 4.6zm5.4-7.3c-.3-.2-1.8-.9-2-1s-.5-.2-.7.1-.8 1-1 1.2-.4.2-.7.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.5-.3z" fill="currentColor" stroke="none"/>',
  fb: '<path d="M14 8h3V4h-3a5 5 0 0 0-5 5v3H6v4h3v6h4v-6h3l1-4h-4V9a1 1 0 0 1 1-1z"/>',
  ig: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/>',
  yt: '<path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.2.4-2.5.4-3.8s-.1-2.6-.4-3.8z"/><path d="m10 15 5-3-5-3z" fill="currentColor"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  bag: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4h6v3M9 12v4M15 12v4"/>',
  ticket: '<path d="M3 8V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v0a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a2 2 0 0 0 0-4z"/><path d="M14 5v14" stroke-dasharray="2 2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  headset: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="14" width="5" height="7" rx="2"/><rect x="17" y="14" width="5" height="7" rx="2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sunrise: '<path d="M12 2v6M5 10l1.4 1.4M19 10l-1.4 1.4M2 18h20M7 18a5 5 0 0 1 10 0M9 5l3-3 3 3"/>',
  sunset: '<path d="M12 9V3M5 10l1.4 1.4M19 10l-1.4 1.4M2 18h20M7 18a5 5 0 0 1 10 0M9 6l3 3 3-3"/>'
};
export const icon = (name, cls = '') =>
  `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ---------- Navigation ---------- */
const NAV = [
  ['home', '/', 'Home'],
  ['flights', '/flights', 'Flights'],
  ['offers', '/offers', 'Special Offers'],
  ['tours', '/tours', 'Tour Packages'],
  ['pnr', '/#pnr', 'Check PNR'],
  ['tips', '/travel-tips', 'Travel Tips'],
  ['contact', '/contact', 'Contact']
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function head(meta, path) {
  const url = SITE_URL + (path === '/' ? '/' : path);
  const title = meta.title.includes('Sirpy') ? meta.title : `${meta.title} | Sirpy Air Travels`;
  const image = SITE_URL + (meta.image || '/assets/img/offers/scoot-sin-trz.jpg');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${url}">
${meta.noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta name="theme-color" content="#111111">
<link rel="icon" href="/assets/img/logo-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Sirpy Air Travels">
<meta property="og:locale" content="en_IN">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css?v=${ASSET_VERSION}">
${meta.preload || ''}${path === '/' ? SCHEMA : ''}</head>`;
}

const SCHEMA = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"TravelAgency","name":"Sirpy Air Travels","url":"${SITE_URL}/","logo":"${SITE_URL}/assets/img/logo-icon.png","image":"${SITE_URL}/assets/img/offers/scoot-sin-trz.jpg","telephone":"+91-93440-20864","email":"Sirpytravels@gmail.com","priceRange":"₹₹","address":{"@type":"PostalAddress","streetAddress":"JR Complex, Near MIET College, Guntur, Trichy to Pudukottai Main Road","addressLocality":"Tiruchirappalli","addressRegion":"Tamil Nadu","addressCountry":"IN"},"openingHours":"Mo-Su 09:00-21:00","sameAs":["https://www.facebook.com/sirpyairtravels/","https://www.instagram.com/sirpyairtravels/","https://www.youtube.com/@sirpyairtravels"]}
</script>
`;

function header(active) {
  const links = NAV.map(([k, href, label]) =>
    `<li><a href="${href}"${k === active ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  const drawerLinks = NAV.map(([, href, label]) => `<a class="dl" href="${href}">${label}</a>`).join('');
  return `<body>
<a class="skip" href="#main">Skip to content</a>
<div class="topbar">
  <div class="wrap">
    <div class="topbar-left">
      <a href="tel:+919344020864">${icon('phone')}+91 93440 20864</a>
      <a class="hide-sm" href="tel:+6582602446">${icon('phone')}SG +65 8260 2446</a>
      <a class="hide-sm" href="mailto:Sirpytravels@gmail.com">${icon('mail')}Sirpytravels@gmail.com</a>
    </div>
    <div class="topbar-right">
      <a href="/#pnr">${icon('ticket')}Check PNR</a>
      <span class="social">
        <a href="https://www.facebook.com/sirpyairtravels/" target="_blank" rel="noopener" aria-label="Facebook">${icon('fb')}</a>
        <a href="https://www.instagram.com/sirpyairtravels/" target="_blank" rel="noopener" aria-label="Instagram">${icon('ig')}</a>
        <a href="https://www.youtube.com/@sirpyairtravels" target="_blank" rel="noopener" aria-label="YouTube">${icon('yt')}</a>
      </span>
    </div>
  </div>
</div>
<header class="header">
  <div class="wrap">
    <a class="brand" href="/" aria-label="Sirpy Air Travels home"><img src="/assets/img/logo.png" alt="Sirpy Air Travels" width="140" height="46"></a>
    <nav class="nav" aria-label="Main"><ul>${links}</ul></nav>
    <a class="btn btn-yellow header-cta" href="tel:+919344020864">${icon('phone')}93440 20864</a>
    <button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer" data-drawer-open>${icon('menu')}</button>
  </div>
</header>
<div class="drawer" id="drawer" aria-hidden="true">
  <div class="drawer-backdrop" data-drawer-close></div>
  <div class="drawer-panel" role="dialog" aria-modal="true" aria-label="Menu">
    <button class="close" type="button" aria-label="Close menu" data-drawer-close>&times;</button>
    ${drawerLinks}
    <a class="btn btn-yellow" href="tel:+919344020864">${icon('phone')}Call 93440 20864</a>
    <a class="btn btn-wa" href="${wa('Hi Sirpy Air Travels, I need help with a booking.')}" target="_blank" rel="noopener">${icon('wa')}WhatsApp us</a>
  </div>
</div>
`;
}

function footer() {
  const year = new Date().getFullYear();
  return `
<section class="cta-band">
  <div class="wrap">
    <div>
      <h2>Need a fare for a date not listed?</h2>
      <p>Our Trichy and Singapore desks quote any TN ⇄ Singapore date within the hour.</p>
    </div>
    <div class="acts">
      <a class="btn btn-dark" href="tel:+919344020864">${icon('phone')}Call Trichy</a>
      <a class="btn btn-wa" href="${wa('Hi Sirpy Air Travels, please share the best fare for my travel date.')}" target="_blank" rel="noopener">${icon('wa')}WhatsApp a fare request</a>
    </div>
  </div>
</section>
<footer class="footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <a class="footer-logo" href="/"><img src="/assets/img/logo.png" alt="Sirpy Air Travels" width="122" height="40" loading="lazy"></a>
        <p>Flights between Tamil Nadu and Singapore, tour packages, visa and passport help — from our counters in Trichy and Singapore.</p>
        <div class="social">
          <a href="https://www.facebook.com/sirpyairtravels/" target="_blank" rel="noopener" aria-label="Facebook">${icon('fb')}</a>
          <a href="https://www.instagram.com/sirpyairtravels/" target="_blank" rel="noopener" aria-label="Instagram">${icon('ig')}</a>
          <a href="https://www.youtube.com/@sirpyairtravels" target="_blank" rel="noopener" aria-label="YouTube">${icon('yt')}</a>
        </div>
      </div>
      <div>
        <h4>Flights</h4>
        <ul>
          <li><a href="/flights?route=TN-SIN">Tamil Nadu → Singapore</a></li>
          <li><a href="/flights?route=SIN-TN">Singapore → Tamil Nadu</a></li>
          <li><a href="/flights?route=TRZ-SIN">Trichy → Singapore</a></li>
          <li><a href="/flights?route=SIN-MAA">Singapore → Chennai</a></li>
          <li><a href="/flights?route=CJB-SIN">Coimbatore → Singapore</a></li>
        </ul>
      </div>
      <div>
        <h4>Explore</h4>
        <ul>
          <li><a href="/offers">Special Offers</a></li>
          <li><a href="/weekly-fares">Special Fares This Week</a></li>
          <li><a href="/top-fares">Top 10 Lowest Fares</a></li>
          <li><a href="/travel-tips">Travel Tips</a></li>
          <li><a href="/tours">Tour Packages</a></li>
          <li><a href="/#pnr">Check PNR</a></li>
        </ul>
      </div>
      <div>
        <h4>Contact</h4>
        <ul class="footer-contact">
          <li>${icon('pin')}<span>JR Complex, Near MIET College, Guntur, Trichy–Pudukottai Main Road, Tamil Nadu</span></li>
          <li>${icon('phone')}<span><a href="tel:+919344020864">+91 93440 20864</a> · <a href="tel:+919047454335">+91 90474 54335</a></span></li>
          <li>${icon('phone')}<span>Singapore <a href="tel:+6582602446">+65 8260 2446</a></span></li>
          <li>${icon('mail')}<a href="mailto:Sirpytravels@gmail.com">Sirpytravels@gmail.com</a></li>
          <li>${icon('clock')}<span>Mon–Sun, 9:00 AM – 9:00 PM</span></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${year} Sirpy Air Travels. All rights reserved.</span>
      <span><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms &amp; Conditions</a></span>
    </div>
  </div>
</footer>
<a class="fab" href="${wa('Hi Sirpy Air Travels, I have a question about travel booking.')}" target="_blank" rel="noopener" aria-label="Chat with Sirpy Air Travels on WhatsApp">${icon('wa')}</a>
`;
}

/* ---------- Build ---------- */
const files = (await readdir(PAGES)).filter((f) => f.endsWith('.html'));
for (const file of files) {
  const src = await readFile(join(PAGES, file), 'utf8');
  const m = /^<!--\s*(\{[\s\S]*?\})\s*-->\s*/.exec(src);
  if (!m) throw new Error(`${file}: missing JSON header comment`);
  const meta = JSON.parse(m[1]);
  const body = src.slice(m[0].length)
    .replace(/\{\{icon:([\w]+)\}\}/g, (_, n) => icon(n))
    .replace(/\{\{wa:([^}]+)\}\}/g, (_, msg) => wa(msg));
  const path = file === 'index.html' ? '/' : '/' + file.replace(/\.html$/, '');
  const scripts = ['site', ...(meta.scripts || [])]
    .map((s) => `<script src="/assets/js/${s}.js?v=${ASSET_VERSION}" defer></script>`).join('\n');

  const html = `${head(meta, path)}
${header(meta.nav)}<main id="main">
${body.trim()}
</main>
${meta.nofooterCta ? footer().replace(/<section class="cta-band">[\s\S]*?<\/section>\n/, '') : footer()}${scripts}
</body>
</html>
`;
  await writeFile(join(SITE, file), html);
  console.log('built', file);
}
