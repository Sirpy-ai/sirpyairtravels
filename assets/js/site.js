/* ==========================================================================
   Sirpy Air Travels — shared behaviour
   Settings, live SGD→INR rate, fare data (with baggage), the airport search
   box, round-trip combinations, and the home / offers / weekly fares /
   top-10 / Diwali pages. Flight results and booking live in booking.js.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Settings: change these, then commit ---------- */
  const SIRPY = {
    WA_NUMBER: '919344020864',
    MARKUP_INR: 1000,          // added to every adult/child seat, each flight
    FALLBACK_RATE: 75.22,      // SGD→INR, used only if the live rate cannot load
    RATE_URL: 'https://open.er-api.com/v6/latest/SGD',
    EMAIL_ENDPOINT: 'https://formsubmit.co/ajax/Sirpytravels@gmail.com',
    FARES_URL: '/assets/data/fares.json',
    FARES_PREV_URL: '/assets/data/fares-prev.json',
    DEFAULT_ROUTE: 'SIN-TRZ',

    /* Supabase (CRM, blog posts, manually uploaded fares). The anon key is
       public by design: row-level security only lets visitors SEND bookings,
       enquiries and signups and READ published posts. Never put the
       service_role key here. */
    SUPABASE_URL: 'https://lvbdtqefyyfzmxrurrgd.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2YmR0cWVmeXlmem14cnVycmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2NTA0MjAsImV4cCI6MjEwNzIyNjQyMH0.uZkLEY-omAavmhwQlpyfqheOBmW1bd4s8NfECoDImNM',

    /* Checked baggage added to the shown fare, in INR per passenger per flight.
       fromSIN = Singapore → Tamil Nadu, toSIN = Tamil Nadu → Singapore.
       included: true means the fare already has it (nothing added). */
    BAGGAGE: {
      TR: { kg: 20, fromSIN: 3600, toSIN: 3100 },
      IX: { kg: 30, fromSIN: 1000, toSIN: 1000 },
      '6E': { kg: 30, included: true },
      SQ: { kg: 30, included: true }
    },

    /* Diwali 2026: the busiest travel window. */
    DIWALI: {
      out: '2026-11-07',
      ret: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'],
      airports: ['TRZ', 'MAA', 'CJB']
    },

    AIRPORTS: {
      SIN: { city: 'Singapore', name: 'Changi Airport' },
      TRZ: { city: 'Trichy', name: 'Tiruchirappalli Intl' },
      MAA: { city: 'Chennai', name: 'Chennai Intl' },
      CJB: { city: 'Coimbatore', name: 'Coimbatore Intl' }
    },

    /* Search box airport choices, in display order (Trichy first). */
    PLACES: {
      SIN: { label: 'Singapore (SIN)', codes: ['SIN'] },
      TRZ: { label: 'Trichy (TRZ)', codes: ['TRZ'] },
      TN: { label: 'All Tamil Nadu (TRZ · MAA · CJB)', codes: ['TRZ', 'MAA', 'CJB'] },
      MAA: { label: 'Chennai (MAA)', codes: ['MAA'] },
      CJB: { label: 'Coimbatore (CJB)', codes: ['CJB'] }
    },

    /* Sectors, Trichy first. */
    ROUTES: {
      'SIN-TRZ': { short: 'Singapore → Trichy', from: ['SIN'], to: ['TRZ'] },
      'TRZ-SIN': { short: 'Trichy → Singapore', from: ['TRZ'], to: ['SIN'] },
      'SIN-TN': { short: 'Singapore → Tamil Nadu', from: ['SIN'], to: ['TRZ', 'MAA', 'CJB'] },
      'TN-SIN': { short: 'Tamil Nadu → Singapore', from: ['TRZ', 'MAA', 'CJB'], to: ['SIN'] },
      'SIN-MAA': { short: 'Singapore → Chennai', from: ['SIN'], to: ['MAA'] },
      'MAA-SIN': { short: 'Chennai → Singapore', from: ['MAA'], to: ['SIN'] },
      'SIN-CJB': { short: 'Singapore → Coimbatore', from: ['SIN'], to: ['CJB'] },
      'CJB-SIN': { short: 'Coimbatore → Singapore', from: ['CJB'], to: ['SIN'] }
    },

    AIRLINES: {
      TR: { name: 'Scoot', pnr: 'https://www.flyscoot.com/en/manage-booking' },
      '6E': { name: 'IndiGo', pnr: 'https://www.goindigo.in/edit-booking.html' },
      IX: { name: 'Air India Express', pnr: 'https://www.airindiaexpress.com/manage-booking' },
      AI: { name: 'Air India', pnr: 'https://www.airindia.com/in/en/manage/booking.html' },
      SQ: { name: 'Singapore Airlines', pnr: 'https://www.singaporeair.com/en_UK/sg/home#/managebooking' }
    }
  };

  /* ---------- Small helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
  };
  const wa = (msg) => `https://wa.me/${SIRPY.WA_NUMBER}?text=${encodeURIComponent(msg)}`;

  /* Dates are handled as plain YYYY-MM-DD strings in local time. */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
  const today = () => ymd(new Date());
  const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
    parseYmd(s).toLocaleDateString('en-GB', opts);
  const fmt12 = (t) => {
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const fmtDur = (min) => `${Math.floor(min / 60)}h ${pad(min % 60)}m`;
  const nf = new Intl.NumberFormat('en-IN');
  const money = {
    sgd: (n) => `S$${nf.format(n)}`,
    inr: (n) => `₹${nf.format(n)}`
  };

  /* ---------- Airline logos (cloud) ---------- */
  const logoUrl = (code) => `https://www.gstatic.com/flights/airline_logos/70px/dark/${encodeURIComponent(code)}.png`;
  const logoFallback = (code) => `https://dhiz4uvf5rpaq.cloudfront.net/images/airline-logos/${encodeURIComponent(code)}.jpg?V2`;
  /* Any <img data-airline="6E"> switches to the second logo source if the first fails. */
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.airline) return;
    if (!img.dataset.fellBack) { img.dataset.fellBack = '1'; img.src = logoFallback(img.dataset.airline); }
    else img.style.visibility = 'hidden';
  }, true);
  const airlineName = (code) => (SIRPY.AIRLINES[code] && SIRPY.AIRLINES[code].name) || code;
  const logoImg = (code, size = 40) =>
    `<img src="${logoUrl(code)}" data-airline="${esc(code)}" alt="${esc(airlineName(code))} logo" width="${size}" height="${size}" loading="lazy">`;

  /* ---------- Live SGD→INR rate ---------- */
  let ratePromise;
  function getRate() {
    if (ratePromise) return ratePromise;
    ratePromise = (async () => {
      const cached = store.get('sirpy.rate');
      if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.rate;
      try {
        const r = await fetch(SIRPY.RATE_URL, { cache: 'no-store' });
        const j = await r.json();
        const rate = j && j.rates && j.rates.INR;
        if (rate > 30 && rate < 200) { store.set('sirpy.rate', { rate, at: Date.now() }); return rate; }
      } catch { /* offline or blocked: use the fallback */ }
      return (cached && cached.rate) || SIRPY.FALLBACK_RATE;
    })();
    return ratePromise;
  }

  /* ---------- Pricing (per adult/child, one flight) ----------
     Final shown price = scraped fare + service markup + checked baggage. */
  function baggageFor(f) {
    const b = SIRPY.BAGGAGE[f.airline];
    if (!b) return { kg: 0, inr: 0, included: false, known: false };
    if (b.included) return { kg: b.kg, inr: 0, included: true, known: true };
    return { kg: b.kg, inr: f.from === 'SIN' ? b.fromSIN : b.toSIN, included: false, known: true };
  }
  const round10 = (n) => Math.round(n / 10) * 10;
  function priceOf(f, rate) {
    const bag = baggageFor(f);
    const baseInr = f.fare * rate + SIRPY.MARKUP_INR;
    return {
      sgd: Math.ceil(f.fare + (SIRPY.MARKUP_INR + bag.inr) / rate),
      inr: round10(baseInr + bag.inr),
      noBagSgd: Math.ceil(f.fare + SIRPY.MARKUP_INR / rate),
      noBagInr: round10(baseInr),
      bagSgd: Math.ceil(bag.inr / rate),
      bag,
      legs: [{ f, bag }]
    };
  }
  /* Two flights (round trip) priced together. */
  function sumPrices(a, b) {
    return {
      sgd: a.sgd + b.sgd, inr: a.inr + b.inr,
      noBagSgd: a.noBagSgd + b.noBagSgd, noBagInr: a.noBagInr + b.noBagInr,
      bagSgd: a.bagSgd + b.bagSgd,
      legs: [...a.legs, ...b.legs],
      parts: [a, b]
    };
  }
  const bagLabel = (bag) => !bag.known ? 'Baggage on request'
    : bag.included ? `${bag.kg} kg baggage included` : `Incl. ${bag.kg} kg baggage`;

  /* Price block with the "without baggage" popup. Used on every fare card. */
  let popId = 0;
  function priceHtml(p, { per = 'per adult', big = true } = {}) {
    const id = `bp${++popId}`;
    const anyAdded = p.legs.some((l) => l.bag.inr > 0);
    const rows = (p.parts || [p]).map((part) => {
      const leg = part.legs[0];
      const route = `${leg.f.from} → ${leg.f.to}`;
      const lines = [`<tr><td>${esc(airlineName(leg.f.airline))} ${route} fare</td><td>${money.sgd(part.noBagSgd)}</td></tr>`];
      if (leg.bag.inr > 0) lines.push(`<tr><td>Baggage ${leg.bag.kg} kg (${money.inr(leg.bag.inr)})</td><td>${money.sgd(part.bagSgd)}</td></tr>`);
      else if (leg.bag.included) lines.push(`<tr><td>Baggage ${leg.bag.kg} kg</td><td>Included</td></tr>`);
      return lines.join('');
    }).join('');
    const tags = [...new Set(p.legs.map((l) => bagLabel(l.bag)))].join(' · ');
    return `<div class="pb${big ? '' : ' pb-sm'}">
      <div class="p">${money.sgd(p.sgd)}</div><div class="inr">${money.inr(p.inr)}</div>
      <small class="per">${esc(per)} · ${esc(tags)}</small>
      ${anyAdded ? `<button type="button" class="nobag" aria-expanded="false" aria-controls="${id}">${money.sgd(p.noBagSgd)} without baggage <span aria-hidden="true">ⓘ</span></button>` : ''}
      <div class="bag-pop" id="${id}" role="dialog" aria-label="Fare breakdown" hidden>
        <table>${rows}<tr class="tot"><td>Total with baggage</td><td>${money.sgd(p.sgd)}</td></tr>
        ${anyAdded ? `<tr><td>Without baggage</td><td>${money.sgd(p.noBagSgd)} · ${money.inr(p.noBagInr)}</td></tr>` : ''}</table>
        <small>Fares include taxes and our service fee.</small>
      </div>
    </div>`;
  }
  /* One popup open at a time; click elsewhere or Esc closes it. */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.nobag');
    $$('.bag-pop:not([hidden])').forEach((pop) => {
      if (!btn || pop.id !== btn.getAttribute('aria-controls')) {
        if (!pop.contains(e.target)) { pop.hidden = true; const b = $(`[aria-controls="${pop.id}"]`); if (b) b.setAttribute('aria-expanded', 'false'); }
      }
    });
    if (btn) {
      e.preventDefault();
      const pop = document.getElementById(btn.getAttribute('aria-controls'));
      if (pop) { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); }
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.bag-pop:not([hidden])').forEach((p) => { p.hidden = true; });
  });

  /* ---------- Fare data ---------- */
  const toFlight = ([date, from, to, airline, dep, arr, plus, dur, fare]) =>
    ({ date, from, to, airline, dep, arr, plus, dur, fare, id: `${date}|${from}|${to}|${airline}|${dep}` });
  /* ---------- Supabase (plain REST, no library on public pages) ---------- */
  const sb = {
    headers: (extra) => ({ apikey: SIRPY.SUPABASE_KEY, Authorization: `Bearer ${SIRPY.SUPABASE_KEY}`, ...extra }),
    /* Visitors can insert but never read back, so ask for no response body. */
    async insert(table, row) {
      const r = await fetch(`${SIRPY.SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: sb.headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(row)
      });
      if (!r.ok && r.status !== 409) throw new Error(`${table} ${r.status}`); // 409 = already subscribed
      return true;
    },
    async select(table, query) {
      const r = await fetch(`${SIRPY.SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sb.headers() });
      if (!r.ok) throw new Error(`${table} ${r.status}`);
      return r.json();
    },
    publicFile: (bucket, path) => `${SIRPY.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
  };

  /* Fares come from the daily automatic update (in the repo) or a manual upload
     from the admin portal (Supabase storage). Whichever was generated later wins. */
  const stamp = (d) => (d && (d.generatedAt || (d.updated && d.updated + 'T00:00:00+08:00'))) || '';
  const fetchJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  async function newestFares() {
    const hour = Math.floor(Date.now() / 3.6e6);
    const [auto, manual] = await Promise.all([
      fetchJson(SIRPY.FARES_URL),
      fetchJson(sb.publicFile('site-data', `fares.json?h=${hour}`))
    ]);
    const best = manual && manual.flights && (!auto || stamp(manual) > stamp(auto)) ? manual : auto;
    if (!best) throw new Error('fares unavailable');
    return best;
  }

  let faresPromise;
  function loadFares() {
    if (faresPromise) return faresPromise;
    faresPromise = Promise.all([newestFares(), getRate()]).then(([data, rate]) => {
      const t = today();
      const flights = data.flights.filter((f) => f[0] >= t).map(toFlight);
      flights.forEach((f) => { f.p = priceOf(f, rate); });
      return { updated: data.updated, flights, rate };
    });
    return faresPromise;
  }
  let prevPromise;
  function loadPrevFares() {
    if (!prevPromise) {
      prevPromise = fetch(SIRPY.FARES_PREV_URL).then((r) => (r.ok ? r.json() : null))
        .then((d) => d && { updated: d.updated, flights: d.flights.map(toFlight) }).catch(() => null);
    }
    return prevPromise;
  }
  const inRoute = (f, key) => {
    const r = SIRPY.ROUTES[key];
    return r && r.from.includes(f.from) && r.to.includes(f.to);
  };
  const reverseKey = (key) => key.split('-').reverse().join('-');
  const cheapest = (list) => list.reduce((a, b) => (!a || b.p.sgd < a.p.sgd ? b : a), null);

  /* Round-trip combinations: outbound on outDate, return on retDate, returning
     from the same Tamil Nadu airport. Sorted by total price. */
  function roundTrips(flights, outKey, outDate, retDate) {
    const outs = flights.filter((f) => f.date === outDate && inRoute(f, outKey));
    const rets = flights.filter((f) => f.date === retDate && inRoute(f, reverseKey(outKey)));
    const combos = [];
    for (const o of outs) {
      for (const r of rets) {
        if (r.from !== o.to || r.to !== o.from) continue;
        combos.push({ out: o, ret: r, same: o.airline === r.airline, p: sumPrices(o.p, r.p),
          id: `${o.id}~${r.id}` });
      }
    }
    return combos.sort((a, b) => a.p.sgd - b.p.sgd || a.out.dep.localeCompare(b.out.dep));
  }

  /* ---------- Header: mobile drawer ---------- */
  const drawer = $('#drawer');
  const openBtn = $('[data-drawer-open]');
  function setDrawer(open) {
    if (!drawer) return;
    drawer.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    if (openBtn) openBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) $('.close', drawer).focus();
  }
  if (openBtn) openBtn.addEventListener('click', () => setDrawer(true));
  $$('[data-drawer-close]').forEach((el) => el.addEventListener('click', () => setDrawer(false)));
  $$('#drawer a').forEach((a) => a.addEventListener('click', () => setDrawer(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

  /* ---------- Airport search box (home + flights page) ---------- */
  function initSearchForm(form) {
    const fromSel = $('[name=from]', form);
    const toSel = $('[name=to]', form);
    const dateIn = $('[name=date]', form);
    const retIn = $('[name=ret]', form);
    const retField = retIn.closest('.field');
    const hint = $('[data-route-hint]', form);
    const paxBtn = $('.pax-btn', form);
    const pop = $('.pax-pop', form);
    const params = new URLSearchParams(location.search);

    /* From / To */
    const opt = (k) => `<option value="${k}">${esc(SIRPY.PLACES[k].label)}</option>`;
    fromSel.innerHTML = ['SIN', 'TRZ', 'TN', 'MAA', 'CJB'].map(opt).join('');
    function fillTo(keep) {
      const list = fromSel.value === 'SIN' ? ['TRZ', 'TN', 'MAA', 'CJB'] : ['SIN'];
      toSel.innerHTML = list.map(opt).join('');
      toSel.value = list.includes(keep) ? keep : list[0];
    }
    const startRoute = SIRPY.ROUTES[params.get('route')] ? params.get('route') : SIRPY.DEFAULT_ROUTE;
    const [f0, t0] = startRoute.split('-');
    fromSel.value = f0;
    fillTo(t0);
    fromSel.addEventListener('change', () => { fillTo(toSel.value); updateHint(); });
    toSel.addEventListener('change', updateHint);
    $('[data-swap]', form).addEventListener('click', () => {
      const a = fromSel.value, b = toSel.value;
      fromSel.value = b;
      fillTo(a);
      updateHint();
    });
    const routeKey = () => `${fromSel.value}-${toSel.value}`;

    /* Trip type + dates */
    const tripInputs = $$('[name=trip]', form);
    let trip = params.get('trip') === 'rt' ? 'rt' : 'ow';
    dateIn.min = today();
    dateIn.value = params.get('date') && params.get('date') >= today() ? params.get('date') : addDays(today(), 1);
    retIn.min = dateIn.value;
    retIn.value = params.get('ret') && params.get('ret') >= dateIn.value ? params.get('ret') : addDays(dateIn.value, 3);
    /* One way hides the return box completely; Round trip shows it. */
    function setTrip(t) {
      trip = t;
      tripInputs.forEach((i) => { i.checked = i.value === t; });
      retField.hidden = t !== 'rt';
      retIn.required = t === 'rt';
      form.classList.toggle('is-rt', t === 'rt');
    }
    tripInputs.forEach((i) => i.addEventListener('change', () => setTrip(i.value)));
    dateIn.addEventListener('change', () => {
      retIn.min = dateIn.value;
      if (retIn.value < dateIn.value) retIn.value = addDays(dateIn.value, 3);
    });
    setTrip(trip);

    /* Passenger counts */
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const pax = {
      ad: clamp(+params.get('ad') || 1, 1, 9),
      ch: clamp(+params.get('ch') || 0, 0, 8),
      inf: clamp(+params.get('inf') || 0, 0, 9)
    };
    function renderPax() {
      pax.inf = Math.min(pax.inf, pax.ad);
      if (pax.ad + pax.ch > 9) pax.ch = 9 - pax.ad;
      $$('[data-pax]', form).forEach((row) => {
        const k = row.dataset.pax;
        $('output', row).textContent = pax[k];
        const [minus, plus] = $$('button', row);
        minus.disabled = pax[k] <= (k === 'ad' ? 1 : 0);
        plus.disabled = k === 'inf' ? pax.inf >= pax.ad : pax.ad + pax.ch >= 9;
      });
      const n = pax.ad + pax.ch + pax.inf;
      paxBtn.textContent = `${n} Traveller${n > 1 ? 's' : ''}`;
      $('[data-pax-detail]', form).textContent =
        `${pax.ad} Adult${pax.ad > 1 ? 's' : ''}${pax.ch ? `, ${pax.ch} Child` : ''}${pax.inf ? `, ${pax.inf} Infant` : ''} · Economy`;
    }
    $$('[data-pax]', form).forEach((row) => {
      const k = row.dataset.pax;
      const [minus, plus] = $$('button', row);
      minus.addEventListener('click', () => { pax[k]--; renderPax(); });
      plus.addEventListener('click', () => { pax[k]++; renderPax(); });
    });
    paxBtn.addEventListener('click', () => {
      const open = !pop.classList.contains('open');
      pop.classList.toggle('open', open);
      paxBtn.setAttribute('aria-expanded', String(open));
    });
    $('[data-pax-done]', form).addEventListener('click', () => { pop.classList.remove('open'); paxBtn.setAttribute('aria-expanded', 'false'); paxBtn.focus(); });
    document.addEventListener('click', (e) => { if (!pop.contains(e.target) && e.target !== paxBtn) pop.classList.remove('open'); });
    renderPax();

    /* "Fares from" hint under the destination, from the data. */
    async function updateHint() {
      if (!hint) return;
      try {
        const { flights } = await loadFares();
        const list = flights.filter((f) => inRoute(f, routeKey()));
        if (!list.length) { hint.textContent = 'Fare on request'; return; }
        const best = cheapest(list.filter((f) => f.date <= addDays(today(), 30))) || cheapest(list);
        hint.innerHTML = `From <b>${money.sgd(best.p.sgd)}</b> on ${fmtDate(best.date, { day: 'numeric', month: 'short' })}`;
        dateIn.max = retIn.max = list[list.length - 1].date;
      } catch { hint.textContent = ''; }
    }
    updateHint();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new URLSearchParams({ route: routeKey(), date: dateIn.value || addDays(today(), 1) });
      if (trip === 'rt') { q.set('trip', 'rt'); q.set('ret', retIn.value || addDays(dateIn.value, 3)); }
      q.set('ad', pax.ad); q.set('ch', pax.ch); q.set('inf', pax.inf);
      location.href = `/flights?${q}`;
    });
  }
  $$('form[data-search]').forEach(initSearchForm);

  /* ---------- Offer slider ---------- */
  $$('[data-slider]').forEach((slider) => {
    const track = $('.slides', slider.closest('section') || slider);
    const step = () => (track.firstElementChild ? track.firstElementChild.getBoundingClientRect().width + 18 : 300);
    $$('[data-slide]', slider.closest('section')).forEach((btn) =>
      btn.addEventListener('click', () => track.scrollBy({ left: step() * +btn.dataset.slide, behavior: 'smooth' })));
    const timer = setInterval(next, 5000);
    function next() {
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + step(), behavior: 'smooth' });
    }
    ['pointerenter', 'focusin', 'touchstart'].forEach((ev) => track.addEventListener(ev, () => clearInterval(timer), { passive: true }));
  });

  /* ---------- Tour package filters (/tours, /tours#cruise) ---------- */
  const filterBtns = $$('.filter[data-filter]');
  if (filterBtns.length) {
    const apply = (cat) => {
      filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === cat)));
      $$('.pkg[data-category]').forEach((p) => { p.hidden = cat !== 'all' && p.dataset.category !== cat; });
    };
    filterBtns.forEach((b) => b.addEventListener('click', () => {
      apply(b.dataset.filter);
      history.replaceState(null, '', b.dataset.filter === 'all' ? location.pathname : `#${b.dataset.filter}`);
    }));
    const fromHash = location.hash.slice(1);
    if (filterBtns.some((b) => b.dataset.filter === fromHash)) apply(fromHash);
  }

  /* ---------- Live numbers on the home page and offers ---------- */
  async function initHomeDeals() {
    const chips = $('#quickRoutes');
    const liveEls = $$('[data-live]');
    if (!chips && !liveEls.length) return;
    try {
      const { flights } = await loadFares();
      const week = flights.filter((f) => f.date <= addDays(today(), 7));
      if (chips) {
        chips.innerHTML = ['SIN-TRZ', 'TRZ-SIN', 'SIN-MAA', 'MAA-SIN', 'SIN-CJB', 'CJB-SIN'].map((k) => {
          const best = cheapest(week.filter((f) => inRoute(f, k))) || cheapest(flights.filter((f) => inRoute(f, k)));
          if (!best) return '';
          return `<a class="chip" href="/flights?route=${k}&date=${best.date}">${esc(SIRPY.ROUTES[k].short)} <b>${money.sgd(best.p.sgd)}</b></a>`;
        }).join('');
      }
      liveEls.forEach((el) => {
        const kind = el.dataset.live;
        let best;
        if (kind === 'week') best = cheapest(week);
        else if (kind === 'all') best = cheapest(flights);
        else if (kind === 'diwali') {
          const d = SIRPY.DIWALI;
          const c = roundTrips(flights, 'SIN-TRZ', d.out, d.ret[0])[0];
          el.textContent = c ? `from ${money.sgd(c.p.sgd)} return` : 'fare on request';
          return;
        } else best = cheapest(flights.filter((f) => inRoute(f, kind) && (!el.dataset.airline || f.airline === el.dataset.airline)));
        el.textContent = best ? `from ${money.sgd(best.p.sgd)}` : 'fare on request';
      });
    } catch { if (chips) chips.innerHTML = ''; }
  }
  initHomeDeals();

  /* ---------- PNR quick form ---------- */
  const pnrForm = $('#pnrForm');
  if (pnrForm) {
    pnrForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const code = pnrForm.airline.value;
      const pnr = pnrForm.pnr.value.trim().toUpperCase();
      const name = pnrForm.lastname.value.trim();
      const a = SIRPY.AIRLINES[code];
      if (!a) return;
      /* Airlines do not accept the PNR in the URL, so copy it for a quick paste. */
      if (pnr && navigator.clipboard) navigator.clipboard.writeText(pnr).catch(() => {});
      const note = $('#pnrNote');
      if (note) note.textContent = pnr ? `Opening ${a.name}… your PNR ${pnr} is copied — paste it with surname ${name || '(as on ticket)'}.` : `Opening ${a.name} Manage Booking…`;
      window.open(a.pnr, '_blank', 'noopener');
    });
  }

  /* ---------- Contact enquiry → WhatsApp ---------- */
  const enq = $('#enquiryForm');
  if (enq) {
    enq.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = (n) => enq.elements[n].value.trim();
      if (!v('name') || !v('phone')) {
        const missing = !v('name') ? enq.elements.name : enq.elements.phone;
        missing.setAttribute('aria-invalid', 'true');
        missing.focus();
        return;
      }
      const msg = `Hi Sirpy Air Travels,\nName: ${v('name')}\nPhone: ${v('phone')}\nService: ${v('service')}${v('date') ? `\nTravel date: ${v('date')}` : ''}${v('message') ? `\n\n${v('message')}` : ''}`;
      window.open(wa(msg), '_blank', 'noopener');
      sb.insert('enquiries', {
        name: v('name').slice(0, 120), phone: v('phone').slice(0, 40),
        subject: [v('service'), v('date') && `travel ${v('date')}`].filter(Boolean).join(' · ').slice(0, 200),
        message: v('message').slice(0, 4000) || null, source: 'contact page'
      }).catch(() => { /* WhatsApp copy is enough */ });
    });
    enq.addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));
  }

  const setUpdated = (updated) => {
    $$('#faresUpdated, [data-fares-updated]').forEach((el) => {
      el.textContent = fmtDate(updated, { day: 'numeric', month: 'long', year: 'numeric' });
    });
  };

  /* ---------- Special Fares This Week (/weekly-fares) ---------- */
  async function initWeekly() {
    const box = $('#weekTable');
    if (!box) return;
    try {
      const { flights, updated } = await loadFares();
      const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i + 1));
      const keys = ['SIN-TRZ', 'TRZ-SIN', 'SIN-MAA', 'MAA-SIN', 'SIN-CJB', 'CJB-SIN'];
      const rows = keys.map((k) => {
        const cells = days.map((d) => cheapest(flights.filter((f) => f.date === d && inRoute(f, k))));
        const low = cheapest(cells.filter(Boolean));
        const tds = cells.map((c) => {
          if (!c) return '<td><small>—</small></td>';
          return `<td${c === low ? ' class="low"' : ''}><a href="/flights?route=${k}&date=${c.date}" aria-label="${esc(SIRPY.ROUTES[k].short)} on ${fmtDate(c.date)} from ${money.sgd(c.p.sgd)}"><b>${money.sgd(c.p.sgd)}</b><small>${esc(airlineName(c.airline))}</small></a></td>`;
        }).join('');
        const r = SIRPY.ROUTES[k];
        return `<tr><th scope="row">${esc(r.short)}<small>${r.from[0]} → ${r.to[0]}</small></th>${tds}</tr>`;
      }).join('');
      box.innerHTML = `<table class="week-table"><thead><tr><th scope="col">Route</th>${days.map((d) => `<th scope="col">${fmtDate(d, { weekday: 'short' })}<small>${fmtDate(d, { day: 'numeric', month: 'short' })}</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
      setUpdated(updated);
    } catch { box.innerHTML = '<p class="loading">Fares could not load. Please WhatsApp us for this week’s fares.</p>'; }
  }
  initWeekly();

  /* ---------- Biggest fare increases / drops vs the previous update ---------- */
  async function initChanges() {
    const box = $('#fareChanges');
    if (!box) return;
    try {
      const [{ flights }, prev] = await Promise.all([loadFares(), loadPrevFares()]);
      if (!prev) { box.innerHTML = '<p class="loading">Price changes will appear after the next fare update.</p>'; return; }
      $$('[data-prev-updated]').forEach((el) => { el.textContent = fmtDate(prev.updated, { day: 'numeric', month: 'long' }); });

      /* Match each flight to the previous snapshot: same date, route and
         airline, departing within 45 minutes (schedules drift a little). */
      const byKey = new Map();
      for (const f of prev.flights) {
        const k = `${f.date}|${f.from}|${f.to}|${f.airline}`;
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(f);
      }
      const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
      const changes = [];
      for (const f of flights) {
        const cands = byKey.get(`${f.date}|${f.from}|${f.to}|${f.airline}`);
        if (!cands) continue;
        const old = cands.reduce((a, b) => (Math.abs(mins(b.dep) - mins(f.dep)) < Math.abs(mins(a.dep) - mins(f.dep)) ? b : a));
        if (Math.abs(mins(old.dep) - mins(f.dep)) > 45) continue;
        const diff = f.fare - old.fare;
        if (Math.abs(diff) < 1) continue;
        changes.push({ f, oldSgd: f.p.sgd - diff, diff, pct: Math.round((diff / old.fare) * 100) });
      }

      const tabs = $('#changeTabs');
      let filter = 'TRZ';
      const render = () => {
        const pool = changes.filter((c) => filter === 'all' || c.f.from === filter || c.f.to === filter);
        const up = [...pool].sort((a, b) => b.diff - a.diff).filter((c) => c.diff > 0).slice(0, 10);
        const down = [...pool].sort((a, b) => a.diff - b.diff).filter((c) => c.diff < 0).slice(0, 10);
        const row = (c) => {
          const q = new URLSearchParams({ route: `${c.f.from}-${c.f.to}`, date: c.f.date });
          return `<a class="chg-row" href="/flights?${q}">
            ${logoImg(c.f.airline, 32)}
            <span class="chg-main"><b>${esc(SIRPY.AIRPORTS[c.f.from].city)} → ${esc(SIRPY.AIRPORTS[c.f.to].city)}</b>
              <small>${fmtDate(c.f.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(airlineName(c.f.airline))} ${fmt12(c.f.dep)}</small></span>
            <span class="chg-price"><s>${money.sgd(c.oldSgd)}</s> <b>${money.sgd(c.f.p.sgd)}</b>
              <small class="${c.diff > 0 ? 'up' : 'down'}">${c.diff > 0 ? '▲ +' : '▼ −'}${money.sgd(Math.abs(Math.round(c.diff)))} (${c.diff > 0 ? '+' : ''}${c.pct}%)</small></span>
          </a>`;
        };
        const empty = '<p class="loading">No changes for this airport.</p>';
        box.innerHTML = `<div class="grid-2">
          <div class="card chg-col"><h3 class="chg-h down">▼ Biggest price drops</h3>${down.map(row).join('') || empty}</div>
          <div class="card chg-col"><h3 class="chg-h up">▲ Biggest price increases</h3>${up.map(row).join('') || empty}</div>
        </div>`;
      };
      if (tabs) {
        tabs.addEventListener('click', (e) => {
          const b = e.target.closest('[data-chg]');
          if (!b) return;
          filter = b.dataset.chg;
          $$('[data-chg]', tabs).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          render();
        });
      }
      render();
    } catch { box.innerHTML = '<p class="loading">Price changes could not load.</p>'; }
  }
  initChanges();

  /* ---------- Top 10 Lowest Fares (/top-fares) ---------- */
  async function initTop10() {
    const box = $('#topList');
    if (!box) return;
    try {
      const { flights, updated } = await loadFares();
      const dirSel = $('#topDir');
      const render = () => {
        const dir = dirSel ? dirSel.value : 'all';
        const pool = flights.filter((f) => dir === 'all' || inRoute(f, dir));
        /* One entry per route and day, so the list is not ten copies of one date. */
        const best = new Map();
        for (const f of pool) {
          const k = `${f.from}${f.to}${f.date}`;
          if (!best.has(k) || f.p.sgd < best.get(k).p.sgd) best.set(k, f);
        }
        const top = [...best.values()].sort((a, b) => a.p.sgd - b.p.sgd || a.date.localeCompare(b.date)).slice(0, 10);
        box.innerHTML = top.map((f, i) => {
          const q = new URLSearchParams({ route: `${f.from}-${f.to}`, date: f.date });
          return `<div class="card top-item has-share">
            ${shareBtn({ legs: [f], p: f.p, per: 'per adult', badge: 'TOP 10 LOW FARE' })}
            <span class="rank">${i + 1}</span>
            ${logoImg(f.airline, 44)}
            <a class="top-main" href="/flights?${q}"><b>${esc(SIRPY.AIRPORTS[f.from].city)} → ${esc(SIRPY.AIRPORTS[f.to].city)}</b>
              <small>${fmtDate(f.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(airlineName(f.airline))} · ${fmt12(f.dep)}</small></a>
            <div class="pr">${priceHtml(f.p, { per: 'per adult', big: false })}</div>
          </div>`;
        }).join('') || '<p class="loading">No fares in the data for this direction yet.</p>';
      };
      if (dirSel) dirSel.addEventListener('change', render);
      render();
      setUpdated(updated);
    } catch { box.innerHTML = '<p class="loading">Fares could not load. Please WhatsApp us for the lowest fares.</p>'; }
  }
  initTop10();

  /* ---------- Diwali Fares (/diwali-fares) ---------- */
  function comboHtml(c, { pax = '', label = '' } = {}) {
    const leg = (f, dir) => `<div class="leg">
      <span class="leg-dir">${dir}</span>
      ${logoImg(f.airline, 32)}
      <span class="leg-main"><b>${fmt12(f.dep)} → ${fmt12(f.arr)}${f.plus ? `<sup>+${f.plus}</sup>` : ''}</b>
        <small>${esc(airlineName(f.airline))} · ${f.from} → ${f.to} · ${fmtDate(f.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtDur(f.dur)}</small></span>
    </div>`;
    const q = new URLSearchParams({ f: c.out.id, r: c.ret.id, ad: 1, ch: 0, inf: 0 });
    return `<article class="card combo has-share">
      ${shareBtn({ legs: [c.out, c.ret], p: c.p, per: 'return, per adult', badge: 'DIWALI FARE' })}
      <div class="combo-legs">
        ${label ? `<span class="combo-tag">${label}</span>` : ''}
        <span class="combo-tag ${c.same ? 'same' : 'mixed'}">${c.same ? `Same airline · ${esc(airlineName(c.out.airline))}` : 'Mixed airlines'}</span>
        ${leg(c.out, 'Depart')}${leg(c.ret, 'Return')}
      </div>
      <div class="combo-price">${priceHtml(c.p, { per: 'return, per adult' })}<a class="btn btn-yellow" href="/book?${q}${pax}">Book Now</a></div>
    </article>`;
  }

  async function initDiwali() {
    const app = $('#diwaliApp');
    if (!app) return;
    try {
      const { flights, updated } = await loadFares();
      setUpdated(updated);
      const D = SIRPY.DIWALI;
      const all = {};
      for (const ap of D.airports) {
        all[ap] = {};
        for (const r of D.ret) all[ap][r] = roundTrips(flights, `SIN-${ap}`, D.out, r);
      }

      /* Summary: cheapest return trip per airport and return date. */
      $('#diwaliSummary').innerHTML = `<table class="week-table diwali-table">
        <thead><tr><th scope="col">Depart Sat 7 Nov from Singapore</th>${D.ret.map((r, i) =>
          `<th scope="col">Return ${fmtDate(r, { weekday: 'short' })}<small>${fmtDate(r, { day: 'numeric', month: 'short' })}${i === 0 ? ' · most popular' : ''}</small></th>`).join('')}</tr></thead>
        <tbody>${D.airports.map((ap) => `<tr><th scope="row">${esc(SIRPY.AIRPORTS[ap].city)} (${ap})</th>${D.ret.map((r) => {
          const c = all[ap][r][0];
          return c ? `<td class="${r === D.ret[0] ? 'low' : ''}"><a href="#d-${ap}" data-goto="${ap}"><b>${money.sgd(c.p.sgd)}</b><small>${c.same ? esc(airlineName(c.out.airline)) : 'Mixed'}</small></a></td>` : '<td><small>—</small></td>';
        }).join('')}</tr>`).join('')}</tbody></table>`;

      let ap = 'TRZ';
      let sameOnly = false;
      const tabs = $('#diwaliTabs');
      const list = $('#diwaliList');
      const render = () => {
        $$('[data-ap]', tabs).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ap === ap)));
        list.innerHTML = D.ret.map((r, i) => {
          const combos = all[ap][r].filter((c) => !sameOnly || c.same);
          const head = `<h3 class="dw-h">${esc(SIRPY.AIRPORTS[ap].city)}: Sat 7 Nov → ${fmtDate(r, { weekday: 'short', day: 'numeric', month: 'short' })}
            ${i === 0 ? '<span class="combo-tag hot">Most popular dates</span>' : `<span class="combo-tag">+${i} day${i > 1 ? 's' : ''}</span>`}
            <small>${combos.length} combination${combos.length === 1 ? '' : 's'} · lowest to highest</small></h3>`;
          if (!combos.length) return `${head}<p class="loading">No saved fares for these dates — <a href="${wa(`Hi Sirpy Air Travels, please share Diwali fares Singapore → ${SIRPY.AIRPORTS[ap].city} 7 Nov, return ${fmtDate(r)}.`)}" target="_blank" rel="noopener">ask on WhatsApp</a>.</p>`;
          const first = combos.slice(0, 6).map((c, n) => comboHtml(c, { label: n === 0 ? 'Lowest' : '' })).join('');
          const rest = combos.slice(6);
          return `<section class="dw-group" id="d-${ap}-${r}">${head}${first}
            ${rest.length ? `<details class="more-combos"><summary>Show ${rest.length} more combinations</summary>${rest.map((c) => comboHtml(c)).join('')}</details>` : ''}</section>`;
        }).join('');
      };
      tabs.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ap]');
        if (b) { ap = b.dataset.ap; render(); }
      });
      $('#diwaliSummary').addEventListener('click', (e) => {
        const a = e.target.closest('[data-goto]');
        if (!a) return;
        e.preventDefault();
        ap = a.dataset.goto;
        render();
        tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const so = $('#sameOnly');
      if (so) so.addEventListener('change', () => { sameOnly = so.checked; render(); });
      render();
    } catch { app.innerHTML = '<p class="loading">Diwali fares could not load. Please WhatsApp us for Diwali fares.</p>'; }
  }
  initDiwali();

  /* ---------- Share a fare as an image (for WhatsApp) ----------
     Every fare card gets a corner button. It draws a branded image of the fare
     with the website link, then: phones open the share sheet (WhatsApp etc.)
     with the image + link; computers copy the image to paste into WhatsApp. */
  const SHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>';
  const WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.5 3.5A11.8 11.8 0 0 0 1.9 17.7L.3 23.6l6-1.6A11.8 11.8 0 0 0 23.8 12a11.7 11.7 0 0 0-3.3-8.5zM12.1 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.6.9 1-3.5-.2-.4a9.8 9.8 0 1 1 8.2 4.6zm5.4-7.3c-.3-.2-1.8-.9-2-1s-.5-.2-.7.1-.8 1-1 1.2-.4.2-.7.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.5-.3z"/></svg>';
  const shareReg = new Map();
  let shareSeq = 0;
  function shareBtn(data) {
    const id = `sh${++shareSeq}`;
    shareReg.set(id, data);
    return `<button type="button" class="share-btn" data-share="${id}" aria-label="Share this fare as an image" title="Share as image">${SHARE_SVG}</button>`;
  }
  const fareUrl = (legs) => {
    const [a, b] = legs;
    const q = new URLSearchParams({ route: `${a.from}-${a.to}`, date: a.date });
    if (b) { q.set('trip', 'rt'); q.set('ret', b.date); }
    /* Shared links always point at the live site, even from a local preview. */
    const origin = /sirpyairtravels\.com$/.test(location.hostname) ? location.origin : 'https://sirpyairtravels.com';
    return `${origin}/flights?${q}`;
  };
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function roundRect(x, X, Y, w, h, r) {
    if (!x.roundRect) { x.fillRect(X, Y, w, h); return; }
    x.beginPath(); x.roundRect(X, Y, w, h, r); x.fill();
  }

  async function drawFareImage(d) {
    const W = 1080, H = 1080;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    try { await Promise.all(['400', '600', '700', '800'].map((w) => document.fonts.load(`${w} 40px Poppins`))); } catch { /* system font */ }
    const font = (w, s) => `${w} ${s}px Poppins, "Segoe UI", Arial, sans-serif`;
    const legs = d.legs;
    const rt = legs.length > 1;
    const city = (code) => SIRPY.AIRPORTS[code].city;

    x.fillStyle = '#f5f5f2'; x.fillRect(0, 0, W, H);
    /* header */
    x.fillStyle = '#111111'; x.fillRect(0, 0, W, 170);
    x.fillStyle = '#ffffff'; roundRect(x, 40, 30, 330, 110, 16);
    try { const logo = await loadImg('/assets/img/logo.png'); x.drawImage(logo, 55, 40, 300, 98); } catch { /* text only */ }
    x.textAlign = 'right';
    x.fillStyle = '#ffc61a'; x.font = font(800, 40); x.fillText(d.badge || 'SPECIAL FARE', W - 50, 88);
    x.fillStyle = '#d9d9d9'; x.font = font(500, 26); x.fillText('Tamil Nadu ⇄ Singapore flights', W - 50, 128);
    x.textAlign = 'left';

    /* route */
    x.fillStyle = '#111111'; x.font = font(800, 60);
    x.fillText(`${city(legs[0].from)} ${rt ? '⇄' : '→'} ${city(legs[0].to)}`, 60, 255);
    x.fillStyle = '#ffc61a'; roundRect(x, 60, 278, rt ? 190 : 160, 46, 23);
    x.fillStyle = '#111111'; x.font = font(700, 24); x.fillText(rt ? 'Round trip' : 'One way', 80, 309);

    /* flights */
    let y = 350;
    legs.forEach((f, i) => {
      x.fillStyle = '#ffffff'; roundRect(x, 60, y, 960, 150, 18);
      x.fillStyle = '#e8ad00'; x.font = font(700, 22);
      x.fillText(rt ? (i ? 'RETURN' : 'DEPART') : 'FLIGHT', 90, y + 40);
      x.fillStyle = '#333333'; x.font = font(600, 28);
      x.fillText(`${airlineName(f.airline)} · ${fmtDate(f.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · Non-stop`, 90, y + 82);
      x.fillStyle = '#111111'; x.font = font(800, 38);
      x.fillText(`${fmt12(f.dep)} ${f.from}  →  ${fmt12(f.arr)} ${f.to}${f.plus ? ` (+${f.plus})` : ''}`, 90, y + 130);
      y += 166;
    });

    /* price */
    const p = d.p;
    x.fillStyle = '#ffc61a'; roundRect(x, 60, y + 4, 960, 200, 22);
    x.fillStyle = '#111111'; x.font = font(800, 104);
    x.fillText(money.sgd(p.sgd), 95, y + 128);
    x.font = font(600, 26);
    x.fillText(`${d.per || 'per adult'} · ${[...new Set(p.legs.map((l) => bagLabel(l.bag)))].join(' · ')}`, 97, y + 176);
    x.textAlign = 'right'; x.font = font(700, 40);
    x.fillText(money.inr(p.inr), 985, y + 92);
    if (p.noBagSgd !== p.sgd) { x.font = font(500, 24); x.fillText(`${money.sgd(p.noBagSgd)} without baggage`, 985, y + 132); }
    x.textAlign = 'left';

    /* footer */
    x.fillStyle = '#111111'; x.fillRect(0, H - 150, W, 150);
    x.fillStyle = '#ffc61a'; x.font = font(700, 36);
    x.fillText('Book: sirpyairtravels.com', 60, H - 88);
    x.fillStyle = '#ffffff'; x.font = font(500, 28);
    x.fillText('WhatsApp +91 93440 20864  ·  SG +65 8260 2446', 60, H - 42);
    x.textAlign = 'right'; x.fillStyle = '#9a9a9a'; x.font = font(400, 20);
    x.fillText(`Fare as of ${d.updated ? fmtDate(d.updated, { day: 'numeric', month: 'short' }) : 'today'} · subject to availability`, W - 40, H - 92);
    x.textAlign = 'left';
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }

  let shareModal;
  function openShare(d) {
    if (!shareModal) {
      shareModal = document.createElement('div');
      shareModal.className = 'share-modal';
      shareModal.innerHTML = `<div class="share-box" role="dialog" aria-modal="true" aria-label="Share this fare">
        <button type="button" class="share-close" aria-label="Close">&times;</button>
        <h3>Share this fare</h3>
        <div class="share-img"><p class="loading">Creating image…</p></div>
        <div class="share-acts">
          <button type="button" class="btn btn-wa" data-act="share">${WA_SVG}Share on WhatsApp</button>
          <button type="button" class="btn btn-dark" data-act="copy">Copy image</button>
          <button type="button" class="btn btn-ghost" data-act="download">Download</button>
        </div>
        <p class="share-note" aria-live="polite"></p>
        <div class="share-link"><input type="text" readonly aria-label="Fare link"><button type="button" class="btn btn-sm btn-ghost" data-act="link">Copy link</button></div>
      </div>`;
      document.body.appendChild(shareModal);
      shareModal.addEventListener('click', (e) => { if (e.target === shareModal || e.target.closest('.share-close')) closeShare(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeShare(); });
    }
    const note = $('.share-note', shareModal);
    const imgBox = $('.share-img', shareModal);
    const link = fareUrl(d.legs);
    const legsTxt = d.legs.map((f) => `${f.from}→${f.to} ${fmtDate(f.date, { day: 'numeric', month: 'short' })} ${airlineName(f.airline)} ${fmt12(f.dep)}`).join(' / ');
    const text = `✈️ ${SIRPY.AIRPORTS[d.legs[0].from].city} ${d.legs.length > 1 ? '⇄' : '→'} ${SIRPY.AIRPORTS[d.legs[0].to].city} special fare ${money.sgd(d.p.sgd)} (${money.inr(d.p.inr)}) ${d.per || 'per adult'}, baggage included\n${legsTxt}\nBook: ${link}\nSirpy Air Travels · WhatsApp +91 93440 20864`;
    $('.share-link input', shareModal).value = link;
    note.textContent = '';
    imgBox.innerHTML = '<p class="loading">Creating image…</p>';
    shareModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    $('.share-close', shareModal).focus();

    let blob = null;
    const ready = drawFareImage(d).then((b) => {
      blob = b;
      imgBox.innerHTML = `<img src="${URL.createObjectURL(b)}" alt="Fare image preview">`;
      return b;
    });
    const file = () => new File([blob], `sirpy-fare-${d.legs[0].from}-${d.legs[0].to}-${d.legs[0].date}.png`, { type: 'image/png' });

    $('.share-acts', shareModal).onclick = async (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      await ready;
      if (act.dataset.act === 'share') {
        if (navigator.canShare && navigator.canShare({ files: [file()] })) {
          try { await navigator.share({ files: [file()], text }); note.textContent = 'Shared.'; return; }
          catch (err) { if (err && err.name === 'AbortError') return; }
        }
        /* Computer: copy the image, then open WhatsApp with the link text. */
        const copied = await copyImage(blob, text);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        note.textContent = copied ? 'Image copied — paste it (Ctrl+V) into the WhatsApp chat. The link is already in the message.' : 'WhatsApp opened with the fare link. Use Download to attach the image.';
      } else if (act.dataset.act === 'copy') {
        note.textContent = (await copyImage(blob, text)) ? 'Image copied — paste it into WhatsApp.' : 'Your browser cannot copy images. Use Download instead.';
      } else if (act.dataset.act === 'download') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = file().name; a.click();
        note.textContent = 'Image downloaded.';
      }
    };
    $('[data-act="link"]', shareModal).onclick = async () => {
      try { await navigator.clipboard.writeText(text); note.textContent = 'Fare text and link copied.'; }
      catch { $('.share-link input', shareModal).select(); note.textContent = 'Press Ctrl+C to copy the link.'; }
    };
  }
  async function copyImage(blob, text) {
    if (!navigator.clipboard || !window.ClipboardItem) return false;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob, 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return true;
    } catch {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); return true; } catch { return false; }
    }
  }
  function closeShare() {
    if (!shareModal || !shareModal.classList.contains('open')) return;
    shareModal.classList.remove('open');
    document.body.style.overflow = '';
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.share-btn');
    if (!b) return;
    e.preventDefault();
    const d = shareReg.get(b.dataset.share);
    if (d) loadFares().then(({ updated }) => openShare({ ...d, updated })).catch(() => openShare(d));
  });

  /* Shared with booking.js */
  /* ---------- Fare alerts signup (footer) ---------- */
  $$('[data-subscribe]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.elements.email.value.trim().toLowerCase();
      const note = $('[data-subscribe-note]', form);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { note.textContent = 'Please enter a valid email.'; form.elements.email.focus(); return; }
      const btn = $('button', form);
      btn.disabled = true;
      try {
        await sb.insert('subscribers', { email, source: location.pathname.slice(0, 40) || '/' });
        form.reset();
        note.textContent = 'Thank you! We will email you our special fares.';
      } catch {
        note.textContent = 'Could not sign you up right now. Please WhatsApp us instead.';
      }
      btn.disabled = false;
    });
  });

  /* ---------- Blog: /blog list and /post?slug= page ---------- */
  const POST_CATS = { offer: 'Special Offer', weekly: 'Weekly Fares', tips: 'Travel Tip', news: 'News' };
  const postFields = 'slug,title,category,excerpt,cover_url,published_at';
  const postDate = (p) => (p.published_at ? fmtDate(ymd(new Date(p.published_at)), { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const postCard = (p) => `<a class="card blog-card" href="/post?slug=${encodeURIComponent(p.slug)}">
      <div class="img"><span class="tag">${esc(POST_CATS[p.category] || 'News')}</span>${p.cover_url ? `<img src="${esc(p.cover_url)}" alt="" loading="lazy">` : ''}</div>
      <div class="body"><h3>${esc(p.title)}</h3>${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}<span class="more">${esc(postDate(p))} · Read more <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></div>
    </a>`;

  async function initBlogList() {
    const grid = $('#postGrid');
    if (!grid) return;
    const tabs = $$('[data-cat]');
    let posts = [];
    const render = (cat) => {
      tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.cat === cat)));
      const list = cat === 'all' ? posts : posts.filter((p) => p.category === cat);
      grid.innerHTML = list.length ? list.map(postCard).join('')
        : '<p class="empty-note">No posts here yet — check our <a href="/offers">Special Offers</a> and <a href="/travel-tips">Travel Tips</a>.</p>';
    };
    tabs.forEach((t) => t.addEventListener('click', () => render(t.dataset.cat)));
    try {
      posts = await sb.select('posts', `select=${postFields}&status=eq.published&order=published_at.desc&limit=60`);
      render('all');
    } catch {
      grid.innerHTML = '<p class="empty-note">Posts could not load. Please refresh the page.</p>';
    }
  }
  initBlogList();

  /* Latest posts strip on any page with #latestPosts (hidden if there are none). */
  async function initLatestPosts() {
    const box = $('#latestPosts');
    if (!box) return;
    try {
      const posts = await sb.select('posts', `select=${postFields}&status=eq.published&order=published_at.desc&limit=4`);
      if (!posts.length) return;
      $('.grid-4', box).innerHTML = posts.map(postCard).join('');
      box.hidden = false;
    } catch { /* stays hidden */ }
  }
  initLatestPosts();

  async function initPost() {
    const box = $('#postBody');
    if (!box) return;
    const slug = new URLSearchParams(location.search).get('slug') || '';
    const notFound = () => {
      $('#postTitle').textContent = 'Post not found';
      box.innerHTML = '<p>This post may have been removed. See all <a href="/blog">blog posts</a>.</p>';
    };
    if (!/^[a-z0-9-]+$/.test(slug)) return notFound();
    try {
      const [p] = await sb.select('posts', `select=${postFields},body&slug=eq.${slug}&status=eq.published&limit=1`);
      if (!p) return notFound();
      document.title = `${p.title} — Sirpy Air Travels`;
      const desc = $('meta[name=description]');
      if (desc && p.excerpt) desc.setAttribute('content', p.excerpt);
      $('#postTitle').textContent = p.title;
      $('#postCrumb').textContent = p.title;
      $('#postMeta').textContent = `${POST_CATS[p.category] || 'News'} · ${postDate(p)}`;
      if (p.cover_url) { const img = $('#postCover'); img.src = p.cover_url; img.alt = p.title; img.hidden = false; }
      box.innerHTML = window.SirpyMd ? window.SirpyMd(p.body) : esc(p.body);
    } catch {
      box.innerHTML = '<p>The post could not load. Please refresh the page.</p>';
    }
  }
  initPost();

  window.SirpySite = {
    SIRPY, $, $$, esc, store, wa, ymd, parseYmd, addDays, daysBetween, today, fmtDate, fmt12, fmtDur, nf,
    logoImg, logoUrl, airlineName, getRate, money, loadFares, inRoute, reverseKey, cheapest,
    roundTrips, priceHtml, sumPrices, baggageFor, bagLabel, comboHtml, shareBtn, sb
  };
})();
