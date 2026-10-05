/* ==========================================================================
   Sirpy Air Travels — shared behaviour
   Settings, live SGD→INR rate, fare data, the sector search box, and the
   home / offers / weekly fares / top-10 pages. Flight results and booking
   live in booking.js.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Settings: change these, then commit ---------- */
  const SIRPY = {
    WA_NUMBER: '919344020864',
    MARKUP_INR: 1000,          // added to every adult/child seat
    FALLBACK_RATE: 75.22,      // SGD→INR, used only if the live rate cannot load
    RATE_URL: 'https://open.er-api.com/v6/latest/SGD',
    EMAIL_ENDPOINT: 'https://formsubmit.co/ajax/Sirpytravels@gmail.com',
    FARES_URL: '/assets/data/fares.json',

    AIRPORTS: {
      SIN: { city: 'Singapore', name: 'Changi Airport' },
      TRZ: { city: 'Trichy', name: 'Tiruchirappalli Intl' },
      MAA: { city: 'Chennai', name: 'Chennai Intl' },
      CJB: { city: 'Coimbatore', name: 'Coimbatore Intl' }
    },

    /* The only sectors offered in the search box. */
    ROUTES: {
      'TN-SIN': { label: 'Tamil Nadu → Singapore (all airports)', short: 'TN → Singapore', from: ['TRZ', 'MAA', 'CJB'], to: ['SIN'] },
      'SIN-TN': { label: 'Singapore → Tamil Nadu (all airports)', short: 'Singapore → TN', from: ['SIN'], to: ['TRZ', 'MAA', 'CJB'] },
      'TRZ-SIN': { label: 'Trichy (TRZ) → Singapore (SIN)', short: 'Trichy → Singapore', from: ['TRZ'], to: ['SIN'] },
      'SIN-TRZ': { label: 'Singapore (SIN) → Trichy (TRZ)', short: 'Singapore → Trichy', from: ['SIN'], to: ['TRZ'] },
      'MAA-SIN': { label: 'Chennai (MAA) → Singapore (SIN)', short: 'Chennai → Singapore', from: ['MAA'], to: ['SIN'] },
      'SIN-MAA': { label: 'Singapore (SIN) → Chennai (MAA)', short: 'Singapore → Chennai', from: ['SIN'], to: ['MAA'] },
      'CJB-SIN': { label: 'Coimbatore (CJB) → Singapore (SIN)', short: 'Coimbatore → Singapore', from: ['CJB'], to: ['SIN'] },
      'SIN-CJB': { label: 'Singapore (SIN) → Coimbatore (CJB)', short: 'Singapore → Coimbatore', from: ['SIN'], to: ['CJB'] }
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
  const today = () => ymd(new Date());
  const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
    parseYmd(s).toLocaleDateString('en-GB', opts);
  const fmt12 = (t) => {
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const fmtDur = (min) => `${Math.floor(min / 60)}h ${pad(min % 60)}m`;
  const nf = new Intl.NumberFormat('en-IN');

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
  const logoImg = (code, size = 40) =>
    `<img src="${logoUrl(code)}" data-airline="${esc(code)}" alt="${esc(airlineName(code))} logo" width="${size}" height="${size}" loading="lazy">`;
  const airlineName = (code) => (SIRPY.AIRLINES[code] && SIRPY.AIRLINES[code].name) || code;

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

  /* Selling price for one adult/child seat: scraped fare + markup. */
  function sellPrice(fareSgd, rate) {
    return {
      sgd: Math.ceil(fareSgd + SIRPY.MARKUP_INR / rate),
      inr: Math.round((fareSgd * rate + SIRPY.MARKUP_INR) / 10) * 10
    };
  }
  const money = {
    sgd: (n) => `S$${nf.format(n)}`,
    inr: (n) => `₹${nf.format(n)}`
  };

  /* ---------- Fare data ---------- */
  let faresPromise;
  function loadFares() {
    if (faresPromise) return faresPromise;
    faresPromise = fetch(SIRPY.FARES_URL).then((r) => {
      if (!r.ok) throw new Error('fares ' + r.status);
      return r.json();
    }).then((data) => {
      const t = today();
      const flights = data.flights
        .filter((f) => f[0] >= t)
        .map(([date, from, to, airline, dep, arr, plus, dur, fare]) =>
          ({ date, from, to, airline, dep, arr, plus, dur, fare, id: `${date}|${from}|${to}|${airline}|${dep}` }));
      return { updated: data.updated, flights };
    });
    return faresPromise;
  }
  const inRoute = (f, key) => {
    const r = SIRPY.ROUTES[key];
    return r && r.from.includes(f.from) && r.to.includes(f.to);
  };
  const cheapest = (list) => list.reduce((a, b) => (!a || b.fare < a.fare ? b : a), null);

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

  /* ---------- Sector search box (home + flights page) ---------- */
  function initSearchForm(form) {
    const routeSel = $('[name=route]', form);
    const dateIn = $('[name=date]', form);
    const hint = $('[data-route-hint]', form);
    const paxBtn = $('.pax-btn', form);
    const pop = $('.pax-pop', form);
    const params = new URLSearchParams(location.search);

    routeSel.innerHTML = Object.entries(SIRPY.ROUTES)
      .map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join('');
    routeSel.value = SIRPY.ROUTES[params.get('route')] ? params.get('route') : (form.dataset.defaultRoute || 'TN-SIN');

    dateIn.min = today();
    dateIn.value = params.get('date') && params.get('date') >= today() ? params.get('date') : addDays(today(), 1);

    /* Passenger counts */
    const pax = {
      ad: clamp(+params.get('ad') || 1, 1, 9),
      ch: clamp(+params.get('ch') || 0, 0, 8),
      inf: clamp(+params.get('inf') || 0, 0, 9)
    };
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
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

    /* "Fares from" hint under the sector, from the data. */
    async function updateHint() {
      if (!hint) return;
      try {
        const [{ flights }, rate] = await Promise.all([loadFares(), getRate()]);
        const list = flights.filter((f) => inRoute(f, routeSel.value));
        if (!list.length) { hint.textContent = 'Fare on request'; return; }
        const best = cheapest(list.filter((f) => f.date <= addDays(today(), 30))) || cheapest(list);
        const p = sellPrice(best.fare, rate);
        hint.innerHTML = `From <b>${money.sgd(p.sgd)}</b> · ${money.inr(p.inr)} on ${fmtDate(best.date, { day: 'numeric', month: 'short' })}`;
        dateIn.max = list[list.length - 1].date;
      } catch { hint.textContent = ''; }
    }
    routeSel.addEventListener('change', updateHint);
    updateHint();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = new URLSearchParams({ route: routeSel.value, date: dateIn.value || addDays(today(), 1), ad: pax.ad, ch: pax.ch, inf: pax.inf });
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
    let timer = setInterval(next, 5000);
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

  /* ---------- Live numbers on the home page ---------- */
  async function initHomeDeals() {
    const chips = $('#quickRoutes');
    const liveEls = $$('[data-live]');
    if (!chips && !liveEls.length) return;
    try {
      const [{ flights }, rate] = await Promise.all([loadFares(), getRate()]);
      const week = flights.filter((f) => f.date <= addDays(today(), 7));
      if (chips) {
        chips.innerHTML = ['TRZ-SIN', 'SIN-TRZ', 'MAA-SIN', 'SIN-MAA', 'CJB-SIN', 'SIN-CJB'].map((k) => {
          const best = cheapest(week.filter((f) => inRoute(f, k))) || cheapest(flights.filter((f) => inRoute(f, k)));
          if (!best) return '';
          const p = sellPrice(best.fare, rate);
          return `<a class="chip" href="/flights?route=${k}&date=${best.date}">${esc(SIRPY.ROUTES[k].short)} <b>${money.sgd(p.sgd)}</b></a>`;
        }).join('');
      }
      liveEls.forEach((el) => {
        const kind = el.dataset.live;
        let best;
        if (kind === 'week') best = cheapest(week);
        else if (kind === 'all') best = cheapest(flights);
        else best = cheapest(flights.filter((f) => inRoute(f, kind) && (!el.dataset.airline || f.airline === el.dataset.airline)));
        if (best) el.textContent = `from ${money.sgd(sellPrice(best.fare, rate).sgd)}`;
        else el.textContent = 'fare on request';
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

  /* ---------- Special Fares This Week (/weekly-fares) ---------- */
  async function initWeekly() {
    const box = $('#weekTable');
    if (!box) return;
    try {
      const [{ flights, updated }, rate] = await Promise.all([loadFares(), getRate()]);
      const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i + 1));
      const keys = ['TRZ-SIN', 'SIN-TRZ', 'MAA-SIN', 'SIN-MAA', 'CJB-SIN', 'SIN-CJB'];
      const rows = keys.map((k) => {
        const cells = days.map((d) => cheapest(flights.filter((f) => f.date === d && inRoute(f, k))));
        const low = cheapest(cells.filter(Boolean));
        const tds = cells.map((c) => {
          if (!c) return '<td><small>—</small></td>';
          const p = sellPrice(c.fare, rate);
          return `<td${c === low ? ' class="low"' : ''}><a href="/flights?route=${k}&date=${c.date}" aria-label="${esc(SIRPY.ROUTES[k].short)} on ${fmtDate(c.date)} from ${money.sgd(p.sgd)}"><b>${money.sgd(p.sgd)}</b><small>${esc(airlineName(c.airline))}</small></a></td>`;
        }).join('');
        return `<tr><th scope="row">${esc(SIRPY.ROUTES[k].short)}<small>${SIRPY.ROUTES[k].from[0]} → ${SIRPY.ROUTES[k].to[0]}</small></th>${tds}</tr>`;
      }).join('');
      box.innerHTML = `<table class="week-table"><thead><tr><th scope="col">Route</th>${days.map((d) => `<th scope="col">${fmtDate(d, { weekday: 'short' })}<small>${fmtDate(d, { day: 'numeric', month: 'short' })}</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
      const up = $('#faresUpdated');
      if (up) up.textContent = fmtDate(updated, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { box.innerHTML = '<p class="loading">Fares could not load. Please WhatsApp us for this week’s fares.</p>'; }
  }
  initWeekly();

  /* ---------- Top 10 Lowest Fares (/top-fares) ---------- */
  async function initTop10() {
    const box = $('#topList');
    if (!box) return;
    try {
      const [{ flights, updated }, rate] = await Promise.all([loadFares(), getRate()]);
      const dirSel = $('#topDir');
      const render = () => {
        const dir = dirSel ? dirSel.value : 'all';
        const pool = flights.filter((f) => dir === 'all' || inRoute(f, dir));
        /* One entry per route and day, so the list is not ten copies of one date. */
        const best = new Map();
        for (const f of pool) {
          const k = `${f.from}${f.to}${f.date}`;
          if (!best.has(k) || f.fare < best.get(k).fare) best.set(k, f);
        }
        const top = [...best.values()].sort((a, b) => a.fare - b.fare || a.date.localeCompare(b.date)).slice(0, 10);
        box.innerHTML = top.map((f, i) => {
          const p = sellPrice(f.fare, rate);
          const q = new URLSearchParams({ route: `${f.from}-${f.to}`, date: f.date });
          return `<a class="card top-item" href="/flights?${q}">
            <span class="rank">${i + 1}</span>
            ${logoImg(f.airline, 44)}
            <span><b>${esc(SIRPY.AIRPORTS[f.from].city)} → ${esc(SIRPY.AIRPORTS[f.to].city)}</b>
              <small>${fmtDate(f.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${esc(airlineName(f.airline))} · ${fmt12(f.dep)}</small></span>
            <span class="pr"><b>${money.sgd(p.sgd)}</b><small>${money.inr(p.inr)}</small></span>
          </a>`;
        }).join('') || '<p class="loading">No fares in the data for this direction yet.</p>';
      };
      if (dirSel) dirSel.addEventListener('change', render);
      render();
      const up = $('#faresUpdated');
      if (up) up.textContent = fmtDate(updated, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { box.innerHTML = '<p class="loading">Fares could not load. Please WhatsApp us for the lowest fares.</p>'; }
  }
  initTop10();

  /* Shared with booking.js */
  window.SirpySite = {
    SIRPY, $, $$, esc, store, wa, ymd, parseYmd, addDays, today, fmtDate, fmt12, fmtDur, nf,
    logoImg, logoUrl, airlineName, getRate, sellPrice, money, loadFares, inRoute, cheapest
  };
})();
