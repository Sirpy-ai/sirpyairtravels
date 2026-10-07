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
  let faresPromise;
  function loadFares() {
    if (faresPromise) return faresPromise;
    faresPromise = Promise.all([
      fetch(SIRPY.FARES_URL).then((r) => { if (!r.ok) throw new Error('fares ' + r.status); return r.json(); }),
      getRate()
    ]).then(([data, rate]) => {
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
    function setTrip(t) {
      trip = t;
      tripInputs.forEach((i) => { i.checked = i.value === t; });
      retField.classList.toggle('off', t !== 'rt');
      retIn.required = t === 'rt';
      retIn.tabIndex = t === 'rt' ? 0 : -1;
    }
    tripInputs.forEach((i) => i.addEventListener('change', () => setTrip(i.value)));
    retField.addEventListener('click', () => { if (trip !== 'rt') { setTrip('rt'); retIn.focus(); } });
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
          return `<div class="card top-item">
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
    return `<article class="card combo">
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

  /* Shared with booking.js */
  window.SirpySite = {
    SIRPY, $, $$, esc, store, wa, ymd, parseYmd, addDays, daysBetween, today, fmtDate, fmt12, fmtDur, nf,
    logoImg, logoUrl, airlineName, getRate, money, loadFares, inRoute, reverseKey, cheapest,
    roundTrips, priceHtml, sumPrices, baggageFor, bagLabel, comboHtml
  };
})();
