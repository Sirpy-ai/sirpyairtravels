/**
 * Sirpy Air Travels — royal site page builder.
 *
 * index.html is the source of truth for the shared chrome (top bar, header,
 * tours flyout, mobile drawer, footer, WhatsApp button, offer pop-up). This
 * script lifts those blocks out of index.html and stamps the inner pages so
 * every page stays identical.
 *
 *   node royal/tools/build-pages.mjs
 *
 * The output files are plain standalone HTML — edit them directly if you like.
 * Just remember that re-running this script rewrites their header and footer
 * from index.html (page content below is what this file controls).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, '..');

const SITE_URL = 'https://sirpyairtravels.com';

/* Vercel serves these with cleanUrls, so links and canonicals stay extensionless. */
const CLEAN_PATH = {
  'index.html': '/',
  'tours.html': '/tours',
  'news.html': '/news',
  'article.html': '/article',
  'contact.html': '/contact',
  'privacy.html': '/privacy',
  'terms.html': '/terms'
};

const WA = 'https://wa.me/919344020864?text=';
const wa = (msg) => WA + encodeURIComponent(msg);

/* ---------- Lift the shared chrome out of index.html ---------- */
const index = await readFile(join(SITE, 'index.html'), 'utf8');

function between(source, startMark, endMark, label) {
  const a = source.indexOf(startMark);
  const b = source.indexOf(endMark, a + startMark.length);
  if (a === -1 || b === -1) throw new Error('Could not locate ' + label + ' in index.html');
  return source.slice(a + startMark.length, b).trim();
}

const CHROME_TOP = between(index, '<body>', '<main id="main">', 'header chrome');
const CHROME_BOTTOM = between(index, '</main>', '<script src="/assets/js/royal.js"', 'footer chrome');

/* Inner pages need absolute in-site anchors for the home-page sections. */
const topFor = (isHome) => isHome ? CHROME_TOP : CHROME_TOP
  .replace(/href="#offers"/g, 'href="#offers"')
  .replace(/href="#enquiry"/g, 'href="#enquiry"');

const DIVIDER =
  '<div class="divider" aria-hidden="true">' +
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4 4 5-7 5 7 4-4v10H3z"/></svg>' +
  '</div>';

const WA_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-2.9-1.3-4.8-4.3-5-4.5-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2 1.3.3.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l2 .9c.2.1.4.2.4.3.1.2.1.7 0 1.3z"/></svg>';

const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/></svg>';
const CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>';

function pageHead(title, intro, crumb) {
  return `  <section class="page-head">
    <div class="wrap">
      <h1 class="gold-text">${title}</h1>
      <p>${intro}</p>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/">Home</a><span>/</span><span>${crumb}</span>
      </nav>
    </div>
  </section>
`;
}

function shell({ file, title, description, body }) {
  const isHome = file === 'index.html';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#1B0F3B">
<link rel="icon" href="/assets/img/logo-icon.png">
<link rel="canonical" href="${SITE_URL}${CLEAN_PATH[file] || '/'}">
<meta property="og:url" content="${SITE_URL}${CLEAN_PATH[file] || '/'}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Marcellus&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/royal.css">
</head>
<body>
${topFor(isHome)}
<main id="main">
${body}
</main>

${CHROME_BOTTOM}

<script src="/assets/js/royal.js" defer></script>
</body>
</html>
`;
}

/* ---------- Tour package catalogue ---------- */
const PACKAGES = [
  {
    cat: 'international', badge: 'Bestseller', name: 'Singapore &amp; Malaysia Twin Wonder',
    place: 'Singapore &amp; Kuala Lumpur', days: '6N / 7D', price: '₹42,500', was: '₹49,999',
    hl: ['Universal Studios Singapore', 'Gardens by the Bay &amp; Sentosa', 'Batu Caves &amp; Genting Highlands'],
    img: 'photo-1525625293386-3f8f99389edd', alt: 'Marina Bay skyline in Singapore'
  },
  {
    cat: 'honeymoon', badge: 'Trending', name: 'Enchanting Bali &amp; Nusa Penida',
    place: 'Bali, Indonesia', days: '5N / 6D', price: '₹34,999', was: '₹41,000',
    hl: ['Private pool villa stay', 'Nusa Penida speedboat tour', 'Ubud jungle swing'],
    img: 'photo-1537996194471-e657df975ab4', alt: 'Tropical beach in Bali, Indonesia'
  },
  {
    cat: 'domestic', badge: 'Popular', name: 'Majestic Kashmir &amp; Dal Lake',
    place: 'Srinagar, Gulmarg &amp; Pahalgam', days: '6N / 7D', price: '₹22,500', was: '₹27,999',
    hl: ['Deluxe houseboat on Dal Lake', 'Gulmarg gondola cable car', 'Betaab Valley &amp; Sonamarg'],
    img: 'photo-1598091383021-15ddea10925d', alt: 'Snow-covered valley in Kashmir'
  },
  {
    cat: 'pilgrimage', badge: 'Spiritual', name: 'Sacred South India Temple Trail',
    place: 'Trichy, Tanjore, Madurai &amp; Rameshwaram', days: '5N / 6D', price: '₹18,500', was: '₹22,000',
    hl: ['Srirangam Ranganathaswamy', 'Tanjore UNESCO Chola temple', 'Rameshwaram 22 theerthams'],
    img: 'photo-1609946727707-42284ec66453', alt: 'South Indian temple gopuram'
  },
  {
    cat: 'international', badge: 'Luxury', name: 'Grand Dubai Future City &amp; Desert',
    place: 'Dubai, UAE', days: '4N / 5D', price: '₹48,000', was: '₹56,000',
    hl: ['Burj Khalifa At The Top', 'Museum of the Future', 'Dune bashing with BBQ dinner'],
    img: 'photo-1512453979798-5ea266f8880c', alt: 'Dubai skyline at dusk'
  },
  {
    cat: 'international', badge: 'Island Deal', name: 'Thailand Islands &amp; Bangkok',
    place: 'Phuket, Krabi &amp; Bangkok', days: '5N / 6D', price: '₹31,500', was: '₹37,000',
    hl: ['Phi Phi island speedboat day', 'James Bond Island canoeing', 'Bangkok city &amp; temple tour'],
    img: 'photo-1552465011-b4e21bf6e79a', alt: 'Limestone islands in the Andaman Sea'
  },
  {
    cat: 'cruise', badge: 'Cruise', name: 'Singapore Short Sailing Cruise',
    place: 'Departs Singapore', days: '3N / 4D', price: 'On request', was: '',
    hl: ['Interior to balcony cabin options', 'Full-board dining on ship', 'Shore excursion planning'],
    img: 'photo-1552465011-b4e21bf6e79a', alt: 'Open sea and islands from a ship deck'
  },
  {
    cat: 'cruise', badge: 'Cruise', name: 'India Coastal Cruise Getaway',
    place: 'West &amp; East coast sailings', days: '2N / 3D', price: 'On request', was: '',
    hl: ['Weekend sailing options', 'Family and group cabins', 'Onboard entertainment included'],
    img: 'photo-1525625293386-3f8f99389edd', alt: 'Harbour view at sunset'
  },
  {
    cat: 'domestic', badge: 'Backwaters', name: 'Kerala Backwaters &amp; Munnar Hills',
    place: 'Munnar, Thekkady &amp; Alleppey', days: '5N / 6D', price: '₹19,900', was: '₹24,500',
    hl: ['Alleppey houseboat overnight', 'Munnar tea garden drive', 'Periyar wildlife boat safari'],
    img: 'photo-1598091383021-15ddea10925d', alt: 'Green hills and water in Kerala'
  },
  {
    cat: 'pilgrimage', badge: 'Darshan', name: 'Tirupati &amp; Kanchipuram Darshan',
    place: 'Tirupati &amp; Kanchipuram', days: '2N / 3D', price: '₹9,800', was: '₹12,000',
    hl: ['Darshan assistance arranged', 'Kanchi Kamakshi &amp; Ekambareswarar', 'AC transport throughout'],
    img: 'photo-1609946727707-42284ec66453', alt: 'Temple tower against the sky'
  },
  {
    cat: 'honeymoon', badge: 'Romance', name: 'Maldives Overwater Escape',
    place: 'Maldives', days: '4N / 5D', price: 'On request', was: '',
    hl: ['Overwater or beach villa', 'Speedboat / seaplane transfer', 'Candlelight dinner arrangement'],
    img: 'photo-1537996194471-e657df975ab4', alt: 'Turquoise lagoon and palm trees'
  },
  {
    cat: 'group', badge: '10+ Pax', name: 'Group &amp; Corporate Travel Desk',
    place: 'Any sector, India &amp; abroad', days: 'Custom', price: 'Bulk fares', was: '',
    hl: ['Bulk airfare from 10 passengers', 'Temple groups &amp; wedding parties', 'MICE and corporate offsites'],
    img: 'photo-1512453979798-5ea266f8880c', alt: 'City skyline for corporate travel'
  }
];

function packageCard(p) {
  const price = p.was
    ? `<b>${p.price}</b><s>${p.was}</s><small>per person</small>`
    : `<b>${p.price}</b><small>ask for a quote</small>`;
  const plain = p.name.replace(/&amp;/g, 'and');
  return `        <article class="pkg" data-category="${p.cat}">
          <div class="pkg-img">
            <span class="pkg-badge">${p.badge}</span>
            <img src="https://images.unsplash.com/${p.img}?auto=format&amp;fit=crop&amp;w=640&amp;q=72" alt="${p.alt}" loading="lazy" decoding="async">
          </div>
          <div class="pkg-body">
            <h3>${p.name}</h3>
            <div class="pkg-meta">
              <span>${PIN}${p.place}</span>
              <span>${CAL}${p.days}</span>
            </div>
            <ul class="pkg-hl">
${p.hl.map((h) => `              <li>${h}</li>`).join('\n')}
            </ul>
            <div class="pkg-foot">
              <span class="pkg-price">${price}</span>
              <a class="btn btn-wa btn-sm" href="${wa('Hi Sirpy Air Travels, I would like details on the ' + plain + ' package.')}" target="_blank" rel="noopener">Enquire</a>
            </div>
          </div>
        </article>`;
}

/* ---------- Page bodies ---------- */

const toursBody = pageHead(
  'Tour Packages',
  'Domestic circuits, international holidays, temple trails, cruises and group departures — every itinerary planned, priced and supported by our own team.',
  'Tours'
) + `
  <section>
    <div class="wrap">
      <div class="filters" id="pkgFilters" role="group" aria-label="Filter packages by category">
        <button class="filter" type="button" data-filter="all" aria-pressed="true">All Packages</button>
        <button class="filter" type="button" data-filter="domestic" aria-pressed="false">Domestic</button>
        <button class="filter" type="button" data-filter="international" aria-pressed="false">International</button>
        <button class="filter" type="button" data-filter="pilgrimage" aria-pressed="false">Temple &amp; Pilgrimage</button>
        <button class="filter" type="button" data-filter="cruise" aria-pressed="false">Cruise</button>
        <button class="filter" type="button" data-filter="honeymoon" aria-pressed="false">Honeymoon</button>
        <button class="filter" type="button" data-filter="group" aria-pressed="false">Group &amp; Corporate</button>
      </div>

      <div class="grid-3">
${PACKAGES.map(packageCard).join('\n')}
      </div>

      <p id="pkgEmpty" hidden style="text-align:center;color:var(--ink-soft);margin-top:28px">
        Nothing listed in this category yet — message us on WhatsApp and we will build an itinerary for you.
      </p>
    </div>
  </section>

  <section class="section-royal">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Can't See What You Want?</p>
        <h2 class="gold-text">We Build Custom Itineraries</h2>
        ${DIVIDER}
        <p>Tell us your dates, budget and who is travelling. We will put together a day-by-day plan with flights, hotels, transfers and sightseeing, and send it to you on WhatsApp.</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:22px">
          <a class="btn btn-wa" href="${wa('Hi Sirpy Air Travels, I would like a custom tour itinerary. Destination: , Dates: , Travellers: ')}" target="_blank" rel="noopener">${WA_ICON}Plan My Trip</a>
          <a class="btn btn-outline" href="/contact">Send a Detailed Enquiry</a>
        </div>
      </div>
    </div>
  </section>
`;

const NEWS_ITEMS = [
  { tag: 'Route Update', title: 'Extra Trichy–Singapore frequencies released for the season', img: 'photo-1525625293386-3f8f99389edd', alt: 'Aircraft at a Singapore airport gate', text: 'Additional weekly services have opened on the Trichy–Singapore sector, easing peak-period availability for family and group travel.' },
  { tag: 'Visa Desk', title: 'What changed in tourist visa documentation this quarter', img: 'photo-1512453979798-5ea266f8880c', alt: 'Dubai skyline at dusk', text: 'A short guide to the paperwork our visa desk is currently seeing queried most often, and how to prepare it before you apply.' },
  { tag: 'Seasonal Offer', title: 'Temple trail departures open for the festival season', img: 'photo-1609946727707-42284ec66453', alt: 'South Indian temple tower', text: 'Our Srirangam–Tanjore–Madurai–Rameshwaram circuit is taking bookings, with special darshan assistance arranged in advance.' },
  { tag: 'Group Travel', title: 'How bulk airfares work for groups of ten or more', img: 'photo-1552465011-b4e21bf6e79a', alt: 'Islands seen from the air', text: 'Group fares are quoted separately from public inventory. Here is what we need from you to lock a rate and hold the seats.' },
  { tag: 'Holiday Ideas', title: 'Bali or Thailand — picking the right island holiday', img: 'photo-1537996194471-e657df975ab4', alt: 'Tropical beach with palm trees', text: 'Both are close, affordable and visa-friendly. The difference comes down to pace, budget and what you want your evenings to look like.' },
  { tag: 'Travel Tips', title: 'Packing and paperwork checklist before you fly', img: 'photo-1598091383021-15ddea10925d', alt: 'Mountain valley landscape', text: 'The documents, timings and small preparations that prevent almost every avoidable problem at the airport counter.' }
];

const newsBody = pageHead(
  'News &amp; Updates',
  'Fare movements, new route announcements, visa rule changes and seasonal offers for travellers between India and Singapore.',
  'News'
) + `
  <section>
    <div class="wrap">
      <div class="grid-3">
${NEWS_ITEMS.map((n) => `        <article class="news">
          <div class="news-img"><img src="https://images.unsplash.com/${n.img}?auto=format&amp;fit=crop&amp;w=640&amp;q=72" alt="${n.alt}" loading="lazy" decoding="async"></div>
          <div class="news-body">
            <span class="news-tag">${n.tag}</span>
            <p class="news-date">Latest update</p>
            <h3>${n.title}</h3>
            <p>${n.text}</p>
            <a class="news-more" href="/article">Read the full update
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </a>
          </div>
        </article>`).join('\n')}
      </div>
    </div>
  </section>

  <section class="section-royal">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Never Miss a Fare Drop</p>
        <h2 class="gold-text">Get Updates on WhatsApp</h2>
        ${DIVIDER}
        <p>We send route changes and seasonal offers to our travellers first. Message us and we will add you to the alert list.</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:22px">
          <a class="btn btn-wa" href="${wa('Hi Sirpy Air Travels, please add me to your offer and route update alerts.')}" target="_blank" rel="noopener">${WA_ICON}Add Me to Alerts</a>
          <a class="btn btn-outline" href="#enquiry">Use the Signup Form</a>
        </div>
      </div>
    </div>
  </section>
`;

const articleBody = `  <section class="page-head">
    <div class="wrap">
      <p class="eyebrow" style="color:var(--gold-400)">Route Update</p>
      <h1 class="gold-text">Extra Trichy–Singapore frequencies released for the season</h1>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/">Home</a><span>/</span><a href="/news">News</a><span>/</span><span>Route Update</span>
      </nav>
    </div>
  </section>

  <section>
    <div class="wrap">
      <article class="prose">
        <img class="article-hero" src="https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&amp;fit=crop&amp;w=1200&amp;q=74" alt="Aircraft parked at a Singapore airport gate" loading="lazy" decoding="async">

        <div class="article-meta">
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>Latest update</span>
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Sirpy Air Travels Desk</span>
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>3 min read</span>
        </div>

        <p class="lead">This is the article template for the Sirpy Air Travels newsroom. Replace this text with the real story — the layout, typography and sharing controls below are already in place and will hold any length of copy you write.</p>

        <p>Demand on the Trichy–Singapore sector rises sharply around school holidays and the festival season, and availability at sensible fares disappears earlier each year. When extra frequencies are released, the useful window for booking is short.</p>

        <h2>What this means for travellers</h2>
        <p>More frequencies mean more seats in the lower fare buckets, but those buckets still empty first. If your dates are fixed, it is worth confirming early rather than waiting to see whether prices soften closer to departure — on this sector, they usually do not.</p>

        <ul>
          <li>Fixed dates: book as soon as the schedule opens.</li>
          <li>Flexible dates: mid-week departures are consistently cheaper.</li>
          <li>Groups of ten or more: ask us for a bulk fare rather than booking seat by seat.</li>
        </ul>

        <div class="pull-quote">
          <p>Group fares are quoted outside public inventory. Send us the passenger count and rough dates and we will hold a rate for you.</p>
        </div>

        <h2>Planning around the peak</h2>
        <p>If you are travelling with elderly parents or small children, tell us at the time of booking. Seat allocation, meal preferences and wheelchair assistance all need to be requested in advance, and it is far easier to arrange them at ticketing than afterwards.</p>

        <h3>Before you confirm</h3>
        <p>Check that the name on the booking matches your passport exactly, that your passport has at least six months of validity remaining, and that any visa or entry permit for your destination is either in hand or in process. Our desk reviews all three for every ticket we issue.</p>

        <p>For current fares on this route, or to have us watch it and tell you when it moves, message our team directly.</p>

        <div class="share-row">
          <strong>Share this</strong>
          <a class="btn btn-wa btn-sm" data-share-wa href="https://wa.me/919344020864" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>
          <a class="btn btn-outline-dark btn-sm" href="mailto:?subject=Sirpy%20Air%20Travels%20update">Email</a>
          <a class="btn btn-outline-dark btn-sm" href="/news">Back to News</a>
        </div>
      </article>
    </div>
  </section>

  <section class="section-parchment">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Keep Reading</p>
        <h2>Related Updates</h2>
        ${DIVIDER}
      </div>
      <div class="grid-3" style="margin-top:28px">
${NEWS_ITEMS.slice(1, 4).map((n) => `        <article class="news">
          <div class="news-img"><img src="https://images.unsplash.com/${n.img}?auto=format&amp;fit=crop&amp;w=640&amp;q=72" alt="${n.alt}" loading="lazy" decoding="async"></div>
          <div class="news-body">
            <span class="news-tag">${n.tag}</span>
            <h3>${n.title}</h3>
            <p>${n.text}</p>
            <a class="news-more" href="/article">Read the full update
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </a>
          </div>
        </article>`).join('\n')}
      </div>
    </div>
  </section>
`;

const contactBody = pageHead(
  'Contact Us',
  'Talk to our Trichy counter or Singapore desk, or send an enquiry and we will reply on WhatsApp — usually within the hour during working hours.',
  'Contact'
) + `
  <section>
    <div class="wrap">
      <div class="split">

        <form class="cartouche form-light" data-wa-form data-wa-intro="New enquiry from the Sirpy Air Travels contact page:" style="background:#fff;border-color:var(--gold-500)" novalidate>
          <h2 style="color:var(--royal-800);margin-bottom:.2em">Send an Enquiry</h2>
          <p style="color:var(--ink-soft);font-size:.88rem;margin-bottom:22px">Fill this in and we will open WhatsApp with your details ready to send to our team.</p>

          <div class="form-row cols-2">
            <div class="field">
              <label for="cName">Your Name</label>
              <input id="cName" name="name" data-wa-label="Name" type="text" autocomplete="name" placeholder="e.g. Rajesh Kumar" required>
            </div>
            <div class="field">
              <label for="cPhone">Mobile / WhatsApp</label>
              <input id="cPhone" name="phone" data-wa-label="Phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+91 90000 00000" required>
            </div>
          </div>

          <div class="form-row cols-2" style="margin-top:12px">
            <div class="field">
              <label for="cEmail">Email Address</label>
              <input id="cEmail" name="email" data-wa-label="Email" type="email" autocomplete="email" placeholder="you@example.com">
            </div>
            <div class="field">
              <label for="cService">Service Needed</label>
              <select id="cService" name="service" data-wa-label="Service">
                <option>Flight booking</option>
                <option>Group booking</option>
                <option>Domestic tour package</option>
                <option>International tour package</option>
                <option>Temple / pilgrimage tour</option>
                <option>Visa processing</option>
                <option>Passport assistance</option>
                <option>Cruise booking</option>
                <option>Car rental / airport transfer</option>
              </select>
            </div>
          </div>

          <div class="form-row cols-2" style="margin-top:12px">
            <div class="field">
              <label for="cDate">Travel Date</label>
              <input id="cDate" name="date" data-wa-label="Travel date" type="date">
            </div>
            <div class="field">
              <label for="cPax">Travellers</label>
              <input id="cPax" name="pax" data-wa-label="Travellers" type="number" inputmode="numeric" min="1" max="200" placeholder="2">
            </div>
          </div>

          <div class="field" style="margin-top:12px">
            <label for="cMsg">Your Message</label>
            <textarea id="cMsg" name="message" data-wa-label="Message" placeholder="Tell us your route, dates and anything we should know."></textarea>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:18px">
            <button class="btn btn-wa" type="submit">${WA_ICON}Send on WhatsApp</button>
            <a class="btn btn-outline-dark" href="mailto:Sirpytravels@gmail.com?subject=Travel%20enquiry%20from%20website">Email Us Instead</a>
          </div>

          <p class="form-note">By sending this you agree to our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms &amp; Conditions</a>.</p>

          <div class="form-status" role="status" aria-live="polite">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>
            <span class="msg"></span>
          </div>
        </form>

        <div style="display:grid;gap:14px">
          <div class="info-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>
            <div>
              <strong>Trichy Head Office</strong>
              <p>JR Complex, Near MIET College, Guntur,<br>Trichy to Pudukottai Main Road,<br>Tamil Nadu, India</p>
            </div>
          </div>

          <div class="info-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
            <div>
              <strong>Phone Hotlines</strong>
              <a href="tel:+919344020864">Trichy: +91 93440 20864</a>
              <a href="tel:+919047454335">Trichy: +91 90474 54335</a>
              <a href="tel:+6582602446">Singapore Desk: +65 8260 2446</a>
            </div>
          </div>

          <div class="info-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>
            <div>
              <strong>Email</strong>
              <a href="mailto:Sirpytravels@gmail.com">Sirpytravels@gmail.com</a>
            </div>
          </div>

          <div class="info-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <div>
              <strong>Working Hours</strong>
              <p>Monday to Sunday<br>9:00 AM – 9:00 PM (IST)</p>
            </div>
          </div>

          <a class="btn btn-wa btn-block" href="${wa('Hi Sirpy Air Travels, I would like to speak to someone about a booking.')}" target="_blank" rel="noopener">${WA_ICON}Chat With Us Now</a>
        </div>

      </div>
    </div>
  </section>

  <section class="section-parchment">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Find Us</p>
        <h2>Visit Our Trichy Counter</h2>
        ${DIVIDER}
      </div>
      <div class="map-frame" style="margin-top:26px">
        <iframe
          src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d15678.65387334891!2d78.71224746998405!3d10.760398492906502!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sin!4v1665132413068!5m2!1sen!2sin"
          title="Map showing the Sirpy Air Travels office in Trichy"
          loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
      </div>
    </div>
  </section>
`;

const privacyBody = pageHead(
  'Privacy Policy',
  'How Sirpy Air Travels collects, uses and protects the information you share with us.',
  'Privacy Policy'
) + `
  <section>
    <div class="wrap">
      <article class="prose">
        <p class="lead">This policy explains what information Sirpy Air Travels collects when you use this website or contact us, why we collect it, and what we do with it. It applies to this website and to enquiries you send us through it.</p>

        <h2>Information we collect</h2>
        <p>We only collect what we need in order to answer your enquiry and arrange your travel:</p>
        <ul>
          <li><strong>Details you give us</strong> — your name, mobile or WhatsApp number, email address, travel dates, passenger count and any notes you include in an enquiry form.</li>
          <li><strong>Booking documents</strong> — where you engage us for ticketing, visa or passport services, the identity and travel documents required for that service.</li>
          <li><strong>Basic site data</strong> — your browser stores a small visit count and your dismissal of our offer pop-up on your own device. This stays in your browser and is not sent to us.</li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>To respond to your enquiry and prepare quotations.</li>
          <li>To issue tickets and process visa, passport, cruise, hotel and transport bookings.</li>
          <li>To send you fare alerts and offers, where you have asked us to.</li>
          <li>To meet legal, airline and immigration record-keeping requirements.</li>
        </ul>

        <h2>Who we share it with</h2>
        <p>We share your details only with the parties needed to deliver the service you have asked for — airlines, hotels, cruise lines, transport operators, visa and consular processing agents, and government authorities where required by law. We do not sell your personal information, and we do not share it for unrelated marketing.</p>

        <h2>Enquiries sent through WhatsApp</h2>
        <p>The enquiry forms on this site open WhatsApp with your details written into a message. Nothing is transmitted until you press send inside WhatsApp. Once sent, that message is handled under WhatsApp's own terms and privacy policy in addition to ours.</p>

        <h2>Third-party content</h2>
        <p>This site loads fonts from Google Fonts, some photographs from Unsplash and an embedded Google Map on the contact page. Those providers may receive your IP address as a normal part of serving that content.</p>

        <h2>How long we keep it</h2>
        <p>Enquiry correspondence is kept while your travel plan is active and for a reasonable period afterwards for reference. Booking and ticketing records are kept for as long as airline, tax and regulatory rules require.</p>

        <h2>Your choices</h2>
        <ul>
          <li>Ask us for a copy of the information we hold about you.</li>
          <li>Ask us to correct anything inaccurate.</li>
          <li>Ask us to stop sending offer alerts at any time — just reply asking to be removed.</li>
          <li>Ask us to delete information we are not legally required to keep.</li>
        </ul>

        <h2>Security</h2>
        <p>We take reasonable steps to protect the information you give us. Please note that this website does not take payments and never asks for card, bank or password details. If you receive a request like that claiming to be from us, do not respond to it — contact us on the numbers listed on this site.</p>

        <h2>Contact us about privacy</h2>
        <p>
          Sirpy Air Travels<br>
          JR Complex, Near MIET College, Guntur, Trichy to Pudukottai Main Road, Tamil Nadu, India<br>
          Email: <a href="mailto:Sirpytravels@gmail.com">Sirpytravels@gmail.com</a><br>
          Phone: <a href="tel:+919344020864">+91 93440 20864</a>
        </p>

        <p style="color:var(--ink-soft);font-size:.86rem;margin-top:34px">
          We may update this policy from time to time. The version published on this page is the one that applies.
        </p>
      </article>
    </div>
  </section>
`;

const termsBody = pageHead(
  'Terms &amp; Conditions',
  'The terms on which Sirpy Air Travels provides travel booking and related services.',
  'Terms &amp; Conditions'
) + `
  <section>
    <div class="wrap">
      <article class="prose">
        <p class="lead">These terms apply when you book flights, tours, cruises, visa assistance or any other service through Sirpy Air Travels. Please read them before confirming a booking.</p>

        <h2>1. Our role</h2>
        <p>Sirpy Air Travels acts as a travel agent. We arrange services that are actually delivered by third parties — airlines, hotels, cruise lines, transport operators, consulates and local ground handlers. Those services are governed by each supplier's own terms and conditions of carriage or supply, which apply to you in addition to these terms.</p>

        <h2>2. Quotations and prices</h2>
        <ul>
          <li>All fares, package prices and offers displayed on this website are indicative and subject to availability at the time of booking.</li>
          <li>Airfares, taxes and currency rates change frequently. A price is only confirmed once the booking is ticketed or the package is confirmed in writing.</li>
          <li>Package prices are per person on the basis stated, and exclude anything not expressly listed as included.</li>
        </ul>

        <h2>3. Booking and payment</h2>
        <p>A booking is confirmed only when we have received the agreed payment and issued a confirmation or ticket. Payments are made directly to Sirpy Air Travels through the channels our office advises. This website does not process payments and will never ask you for card or bank details.</p>

        <h2>4. Travel documents</h2>
        <p>You are responsible for holding a valid passport, visa, permit and any health documentation required for your journey. We will advise and assist, but requirements are set by airlines and by the authorities of the countries you travel to and through, and they can change at short notice.</p>
        <ul>
          <li>Names on tickets must match your passport exactly.</li>
          <li>Most destinations require at least six months of passport validity from your date of entry.</li>
          <li>Visa assistance is a support service. The granting or refusal of a visa is entirely the decision of the issuing authority, and fees paid to that authority are not refundable by us.</li>
        </ul>

        <h2>5. Changes and cancellations</h2>
        <p>Changes and cancellations are governed by the fare rules or supplier terms applicable to your booking. Airline, hotel and cruise penalties apply, and our service charge for handling the change or cancellation is separate from those penalties. Refunds, where due, are released only after the supplier releases them to us, and are paid through the same route as the original payment.</p>

        <h2>6. Circumstances beyond our control</h2>
        <p>We are not liable for loss or disruption caused by events outside our reasonable control — including weather, natural events, strikes, technical faults, airline schedule changes or cancellations, airspace or border closures, civil disturbance, and government or health directives.</p>

        <h2>7. Liability</h2>
        <p>Our liability is limited to the service we ourselves provide as an agent. We are not liable for the acts, omissions, delays or defaults of any airline, hotel, cruise line, transport operator or other supplier. We strongly recommend that every traveller holds appropriate travel insurance.</p>

        <h2>8. Travel insurance</h2>
        <p>Travel insurance is not included in our package prices unless specifically stated. We recommend cover for medical treatment, trip cancellation, delay and baggage on every international journey.</p>

        <h2>9. Conduct and itinerary changes</h2>
        <p>On group and escorted tours, itineraries may be adjusted where local conditions require it. We will always aim to provide a comparable alternative. Travellers whose conduct endangers or seriously disrupts others may be required to leave a tour, without refund.</p>

        <h2>10. Website content</h2>
        <p>Package descriptions, photographs and promotional banners on this site are for illustration. Images may be representative rather than of the exact hotel, aircraft, cabin or location supplied. Airline names and logos shown in promotional banners refer to the carriers whose fares we sell as an agent.</p>

        <h2>11. Governing law</h2>
        <p>These terms are governed by the laws of India, and disputes are subject to the jurisdiction of the courts at Tiruchirappalli, Tamil Nadu.</p>

        <h2>12. Contact</h2>
        <p>
          Sirpy Air Travels<br>
          JR Complex, Near MIET College, Guntur, Trichy to Pudukottai Main Road, Tamil Nadu, India<br>
          Email: <a href="mailto:Sirpytravels@gmail.com">Sirpytravels@gmail.com</a><br>
          Phone: <a href="tel:+919344020864">+91 93440 20864</a> &middot; <a href="tel:+6582602446">+65 8260 2446</a>
        </p>

        <p style="color:var(--ink-soft);font-size:.86rem;margin-top:34px">
          These terms may be updated. The version published on this page applies to bookings made after it is posted.
        </p>
      </article>
    </div>
  </section>
`;

/* ---------- Emit ---------- */
const PAGES = [
  {
    file: 'tours.html',
    title: 'Tour Packages | Sirpy Air Travels — Domestic, International, Pilgrimage &amp; Cruise',
    description: 'Browse Sirpy Air Travels holiday packages — Singapore, Malaysia, Bali, Dubai, Thailand, Kashmir, Kerala, temple trails, cruises and group departures.',
    body: toursBody
  },
  {
    file: 'news.html',
    title: 'News &amp; Updates | Sirpy Air Travels',
    description: 'Route additions, fare movements, visa rule changes and seasonal travel offers from the Sirpy Air Travels desk in Trichy and Singapore.',
    body: newsBody
  },
  {
    file: 'article.html',
    title: 'Extra Trichy–Singapore frequencies released for the season | Sirpy Air Travels',
    description: 'Additional weekly services have opened on the Trichy–Singapore sector. What it means for fares, group travel and booking timing.',
    body: articleBody
  },
  {
    file: 'contact.html',
    title: 'Contact Us | Sirpy Air Travels — Trichy &amp; Singapore',
    description: 'Call our Trichy counter or Singapore desk, email us, or send an enquiry and we will reply on WhatsApp. Open Monday to Sunday, 9 AM to 9 PM.',
    body: contactBody
  },
  {
    file: 'privacy.html',
    title: 'Privacy Policy | Sirpy Air Travels',
    description: 'How Sirpy Air Travels collects, uses, shares and protects the information you provide through this website.',
    body: privacyBody
  },
  {
    file: 'terms.html',
    title: 'Terms &amp; Conditions | Sirpy Air Travels',
    description: 'The terms on which Sirpy Air Travels provides flight booking, tour package, visa, passport, cruise and car rental services.',
    body: termsBody
  }
];

for (const page of PAGES) {
  await writeFile(join(SITE, page.file), shell(page), 'utf8');
  console.log('  wrote ' + page.file);
}
console.log('\nDone. ' + PAGES.length + ' pages built from the index.html chrome.');
