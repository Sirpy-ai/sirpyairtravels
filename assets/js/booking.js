/* ==========================================================================
   Sirpy Air Travels — flight results (/flights) and booking request (/book)
   One way and round trip. Prices include checked baggage (see BAGGAGE in
   site.js). Needs site.js (window.SirpySite) loaded first.
   ========================================================================== */
(function () {
  'use strict';
  const S = window.SirpySite;
  if (!S) return;
  const { SIRPY, $, $$, esc, wa, addDays, daysBetween, today, fmtDate, fmt12, fmtDur, logoImg, airlineName,
          money, loadFares, inRoute, reverseKey, cheapest, roundTrips, priceHtml, sumPrices, bagLabel, parseYmd, shareBtn } = S;

  const params = new URLSearchParams(location.search);
  const paxFromParams = () => {
    const p = {
      ad: Math.min(9, Math.max(1, +params.get('ad') || 1)),
      ch: Math.min(8, Math.max(0, +params.get('ch') || 0)),
      inf: Math.min(9, Math.max(0, +params.get('inf') || 0))
    };
    p.inf = Math.min(p.inf, p.ad);
    return p;
  };
  const paxQuery = (pax) => `&ad=${pax.ad}&ch=${pax.ch}&inf=${pax.inf}`;

  const SLOTS = {
    early: { label: 'Before 6 AM', test: (h) => h < 6 },
    morning: { label: '6 AM – 12 PM', test: (h) => h >= 6 && h < 12 },
    afternoon: { label: '12 PM – 6 PM', test: (h) => h >= 12 && h < 18 },
    night: { label: 'After 6 PM', test: (h) => h >= 18 }
  };

  const legHtml = (f, dir) => `<div class="leg">
    ${dir ? `<span class="leg-dir">${dir}</span>` : ''}
    <div class="fl-air">${logoImg(f.airline, 40)}<div><b>${esc(airlineName(f.airline))}</b><small>${esc(f.airline)} · ${fmtDate(f.date, { weekday: 'short', day: 'numeric', month: 'short' })}</small></div></div>
    <div class="fl-times">
      <div class="fl-t"><b>${fmt12(f.dep)}</b><small>${f.from} · ${esc(SIRPY.AIRPORTS[f.from].city)}</small></div>
      <div class="fl-line">${fmtDur(f.dur)}<div class="ln"></div><span class="stop">Non-stop</span></div>
      <div class="fl-t end"><b>${fmt12(f.arr)}${f.plus ? `<sup>+${f.plus}</sup>` : ''}</b><small>${f.to} · ${esc(SIRPY.AIRPORTS[f.to].city)}</small></div>
    </div>
  </div>`;

  /* ======================================================================
     /flights
     ====================================================================== */
  async function initResults() {
    const list = $('#results');
    if (!list) return;

    const routeKey = SIRPY.ROUTES[params.get('route')] ? params.get('route') : SIRPY.DEFAULT_ROUTE;
    const route = SIRPY.ROUTES[routeKey];
    const backKey = reverseKey(routeKey);
    const rt = params.get('trip') === 'rt';
    const pax = paxFromParams();
    let date = params.get('date') && params.get('date') >= today() ? params.get('date') : addDays(today(), 1);
    let ret = rt ? (params.get('ret') && params.get('ret') >= date ? params.get('ret') : addDays(date, 3)) : null;
    const tripLen = rt ? daysBetween(date, ret) : 0;
    let sort = 'price';
    const filters = { airlines: new Set(), origins: new Set(), slots: new Set() };

    /* Phones: the search form collapses into a one-line summary with Edit. */
    const msBtn = $('.modify-summary');
    const msMeta = () => {
      const n = pax.ad + pax.ch + pax.inf;
      $('#msRoute').textContent = `${route.short}${rt ? ' · Return' : ''}`;
      $('#msMeta').textContent = `${fmtDate(date, { day: 'numeric', month: 'short' })}${rt ? ` – ${fmtDate(ret, { day: 'numeric', month: 'short' })}` : ''} · ${n} traveller${n > 1 ? 's' : ''}`;
    };
    if (msBtn) {
      msMeta();
      msBtn.addEventListener('click', () => {
        const open = $('.modify-bar').classList.toggle('open');
        msBtn.setAttribute('aria-expanded', String(open));
      });
    }

    let data;
    try {
      data = await loadFares();
    } catch {
      list.innerHTML = `<div class="card empty"><h3>Fares could not load</h3><p>Please refresh, or send us your dates on WhatsApp.</p><a class="btn btn-wa" href="${wa('Hi Sirpy Air Travels, please share fares for ' + route.short + ' on ' + date)}" target="_blank" rel="noopener">WhatsApp us</a></div>`;
      return;
    }
    const routeFlights = data.flights.filter((f) => inRoute(f, routeKey));
    const backFlights = rt ? data.flights.filter((f) => inRoute(f, backKey)) : [];
    const lastDate = routeFlights.length ? routeFlights[routeFlights.length - 1].date : today();
    $('#faresUpdated').textContent = fmtDate(data.updated, { day: 'numeric', month: 'short', year: 'numeric' });

    /* ----- filter panel options ----- */
    const airlines = [...new Set([...routeFlights, ...backFlights].map((f) => f.airline))];
    $('#fAirlines').innerHTML = airlines.map((c) =>
      `<label class="check"><input type="checkbox" value="${esc(c)}" data-f="airlines">${logoImg(c, 22)}<span>${esc(airlineName(c))}<br><small class="muted">${esc(bagLabel(S.baggageFor({ airline: c, from: 'SIN' })))}</small></span><small data-min="${esc(c)}"></small></label>`).join('');
    const multi = route.from.length > 1 || route.to.length > 1;
    const portSide = route.from.length > 1 ? 'from' : 'to';
    const ports = multi ? (route.from.length > 1 ? route.from : route.to) : [];
    $('#fOriginsGroup').hidden = !multi;
    if (multi) {
      $('#fOriginsTitle').textContent = 'Tamil Nadu airport';
      $('#fOrigins').innerHTML = ports.map((p) =>
        `<label class="check"><input type="checkbox" value="${p}" data-f="origins"><span>${esc(SIRPY.AIRPORTS[p].city)} (${p})</span><small data-min-port="${p}"></small></label>`).join('');
    }
    $('#fSlots').innerHTML = Object.entries(SLOTS).map(([k, s]) =>
      `<button type="button" class="time-slot" data-slot="${k}" aria-pressed="false"><b>${k[0].toUpperCase() + k.slice(1)}</b>${s.label}</button>`).join('');
    $('#slotTitle').textContent = rt ? 'Departure time (outbound)' : 'Departure time';

    $('#filters').addEventListener('change', (e) => {
      const t = e.target;
      if (!t.dataset.f) return;
      filters[t.dataset.f][t.checked ? 'add' : 'delete'](t.value);
      render();
    });
    $$('[data-slot]').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      filters.slots[on ? 'add' : 'delete'](b.dataset.slot);
      render();
    }));
    $('#resetFilters').addEventListener('click', () => {
      Object.values(filters).forEach((s) => s.clear());
      $$('#filters input[type=checkbox]').forEach((i) => { i.checked = false; });
      $$('[data-slot]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      render();
    });
    const ft = $('#filterToggle');
    ft.addEventListener('click', () => {
      const open = $('#filters').classList.toggle('open');
      ft.setAttribute('aria-expanded', String(open));
    });
    $$('[data-sort]').forEach((b) => b.addEventListener('click', () => {
      sort = b.dataset.sort;
      $$('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    }));

    /* ----- date strip (outbound date; round trip keeps the same trip length) ----- */
    const cheapestOn = (d) => {
      if (!rt) return cheapest(routeFlights.filter((f) => f.date === d));
      const c = roundTrips(data.flights, routeKey, d, addDays(d, tripLen))[0];
      return c ? { p: c.p } : null;
    };
    let stripStart;
    function renderStrip() {
      if (!stripStart || date < stripStart || date > addDays(stripStart, 6)) {
        stripStart = addDays(date, -3);
        if (stripStart < today()) stripStart = today();
      }
      const days = Array.from({ length: 7 }, (_, i) => addDays(stripStart, i));
      const mins = days.map(cheapestOn);
      const lowVal = Math.min(...mins.filter(Boolean).map((m) => m.p.sgd));
      $('#dates').innerHTML = days.map((d, i) => {
        const m = mins[i];
        const price = m ? `<span>${money.sgd(m.p.sgd)}</span>` : '<span class="na">—</span>';
        return `<button type="button" class="date-cell${d === date ? ' active' : ''}${m && m.p.sgd === lowVal ? ' cheapest' : ''}" data-date="${d}" aria-pressed="${d === date}"><b>${fmtDate(d, { weekday: 'short' })}, ${fmtDate(d, { day: 'numeric', month: 'short' })}</b>${price}</button>`;
      }).join('');
      /* On narrow screens the strip scrolls; keep the chosen day in view. */
      const strip = $('#dates'), active = $('.date-cell.active', strip);
      if (active && strip.scrollWidth > strip.clientWidth) {
        strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
      }
      $('#stripPrev').disabled = stripStart <= today();
      $('#stripNext').disabled = addDays(stripStart, 7) > lastDate;
    }
    $('#dates').addEventListener('click', (e) => {
      const b = e.target.closest('[data-date]');
      if (b) setDate(b.dataset.date);
    });
    $('#stripPrev').addEventListener('click', () => { stripStart = addDays(stripStart, -7); if (stripStart < today()) stripStart = today(); renderStrip(); });
    $('#stripNext').addEventListener('click', () => { stripStart = addDays(stripStart, 7); renderStrip(); });

    function setDate(d) {
      date = d;
      params.set('date', d);
      if (rt) { ret = addDays(d, tripLen); params.set('ret', ret); }
      history.replaceState(null, '', `${location.pathname}?${params}`);
      const di = $('#sDate'); if (di) di.value = d;
      const ri = $('#sRet'); if (ri && rt) ri.value = ret;
      if (msBtn) msMeta();
      render();
    }

    /* ----- shared filter tests ----- */
    const portOf = (f) => (portSide === 'from' ? f.from : f.to);
    const okAirline = (f) => !filters.airlines.size || filters.airlines.has(f.airline);
    const okPort = (f) => !filters.origins.size || filters.origins.has(portOf(f));
    const okSlot = (f) => !filters.slots.size || [...filters.slots].some((s) => SLOTS[s].test(+f.dep.slice(0, 2)));

    function emptyState(msg, next) {
      const n = pax.ad + pax.ch + pax.inf;
      const ask = rt ? `${route.short} ${fmtDate(date)}, return ${fmtDate(ret)}` : `${route.short} on ${fmtDate(date)}`;
      list.innerHTML = `<div class="card empty"><h3>${msg}</h3>
        <p>We may still have seats — our team can check live availability for you.</p>
        <p>${next ? `<button class="btn btn-yellow" type="button" data-goto="${next}">See ${fmtDate(next)}</button> ` : ''}<a class="btn btn-wa" href="${wa(`Hi Sirpy Air Travels, please check fares for ${ask} for ${n} traveller(s).`)}" target="_blank" rel="noopener">Ask on WhatsApp</a></p></div>`;
      const g = $('[data-goto]', list);
      if (g) g.addEventListener('click', () => setDate(g.dataset.goto));
    }

    function render() {
      renderStrip();
      const n = pax.ad + pax.ch + pax.inf;
      $('#resultsTitle').textContent = rt
        ? `${route.short} · ${fmtDate(date, { day: 'numeric', month: 'short' })} – return ${fmtDate(ret, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : `${route.short} · ${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`;
      rt ? renderRoundTrip(n) : renderOneWay(n);
    }

    /* ----- one way ----- */
    function renderOneWay(n) {
      const day = routeFlights.filter((f) => f.date === date);
      const shown = day.filter((f) => okAirline(f) && okPort(f) && okSlot(f));
      $$('[data-min]').forEach((el) => { const m = cheapest(day.filter((f) => f.airline === el.dataset.min)); el.textContent = m ? money.sgd(m.p.sgd) : '—'; });
      $$('[data-min-port]').forEach((el) => { const m = cheapest(day.filter((f) => portOf(f) === el.dataset.minPort)); el.textContent = m ? money.sgd(m.p.sgd) : '—'; });

      const byPrice = [...shown].sort((a, b) => a.p.sgd - b.p.sgd || a.dep.localeCompare(b.dep));
      const byDep = [...shown].sort((a, b) => a.dep.localeCompare(b.dep));
      const byDur = [...shown].sort((a, b) => a.dur - b.dur || a.p.sgd - b.p.sgd);
      const sorted = sort === 'dep' ? byDep : sort === 'dur' ? byDur : byPrice;
      setTab('price', byPrice[0] && money.sgd(byPrice[0].p.sgd));
      setTab('dep', byDep[0] && fmt12(byDep[0].dep));
      setTab('dur', byDur[0] && fmtDur(byDur[0].dur));
      $('#resultsMeta').textContent = `${shown.length} flight${shown.length === 1 ? '' : 's'} · ${n} traveller${n > 1 ? 's' : ''} · prices per adult incl. baggage & service fee`;

      if (!day.length) return emptyState('No saved fares for this date', (routeFlights.find((f) => f.date > date) || {}).date);
      if (!shown.length) { list.innerHTML = '<div class="card empty"><h3>No flights match these filters</h3><p>Try clearing a filter.</p></div>'; return; }

      list.innerHTML = sorted.map((f) => {
        const tags = [];
        if (f === byPrice[0]) tags.push('<span class="best">Cheapest</span>');
        if (f === byDur[0] && day.length > 1) tags.push('<span>Fastest</span>');
        return `<article class="card flight has-share">
          ${shareBtn({ legs: [f], p: f.p, per: 'per adult' })}
          ${legHtml(f)}
          <div class="fl-price">${priceHtml(f.p)}<a class="btn btn-yellow" href="/book?f=${encodeURIComponent(f.id)}${paxQuery(pax)}">Book Now</a></div>
          <div class="fl-tags">${tags.join('')}</div>
        </article>`;
      }).join('');
    }

    /* ----- round trip: same-airline pairs first, then mixed ----- */
    function renderRoundTrip(n) {
      const all = roundTrips(data.flights, routeKey, date, ret);
      const shown = all.filter((c) => okAirline(c.out) && okAirline(c.ret) && okPort(c.out) && okSlot(c.out));
      $$('[data-min]').forEach((el) => { const m = all.find((c) => c.same && c.out.airline === el.dataset.min); el.textContent = m ? money.sgd(m.p.sgd) : '—'; });
      $$('[data-min-port]').forEach((el) => { const m = all.find((c) => portOf(c.out) === el.dataset.minPort); el.textContent = m ? money.sgd(m.p.sgd) : '—'; });

      const dur = (c) => c.out.dur + c.ret.dur;
      const order = sort === 'dep' ? (a, b) => a.out.dep.localeCompare(b.out.dep) || a.p.sgd - b.p.sgd
        : sort === 'dur' ? (a, b) => dur(a) - dur(b) || a.p.sgd - b.p.sgd
        : (a, b) => a.p.sgd - b.p.sgd;
      const same = shown.filter((c) => c.same).sort(order);
      const mixed = shown.filter((c) => !c.same).sort(order);
      const byPrice = [...shown].sort((a, b) => a.p.sgd - b.p.sgd);
      const byDep = [...shown].sort((a, b) => a.out.dep.localeCompare(b.out.dep));
      const byDur = [...shown].sort((a, b) => dur(a) - dur(b));
      setTab('price', byPrice[0] && money.sgd(byPrice[0].p.sgd));
      setTab('dep', byDep[0] && fmt12(byDep[0].out.dep));
      setTab('dur', byDur[0] && fmtDur(dur(byDur[0])));
      $('#resultsMeta').textContent = `${shown.length} round-trip combination${shown.length === 1 ? '' : 's'} · ${n} traveller${n > 1 ? 's' : ''} · total per adult incl. baggage & service fee`;

      if (!all.length) {
        const nextOut = routeFlights.find((f) => f.date > date);
        return emptyState('No saved round-trip fares for these dates', nextOut && nextOut.date);
      }
      if (!shown.length) { list.innerHTML = '<div class="card empty"><h3>No combinations match these filters</h3><p>Try clearing a filter.</p></div>'; return; }

      const card = (c) => {
        const q = new URLSearchParams({ f: c.out.id, r: c.ret.id });
        const tags = [c.same ? `<span class="best">Same airline · ${esc(airlineName(c.out.airline))}</span>` : '<span>Mixed airlines</span>'];
        if (c === byPrice[0]) tags.unshift('<span class="best">Cheapest</span>');
        return `<article class="card flight rt has-share">
          ${shareBtn({ legs: [c.out, c.ret], p: c.p, per: 'return, per adult' })}
          <div class="rt-legs">${legHtml(c.out, 'Depart')}${legHtml(c.ret, 'Return')}</div>
          <div class="fl-price">${priceHtml(c.p, { per: 'return, per adult' })}<a class="btn btn-yellow" href="/book?${q}${paxQuery(pax)}">Book Now</a></div>
          <div class="fl-tags">${tags.join('')}</div>
        </article>`;
      };
      const group = (title, sub, items) => {
        if (!items.length) return '';
        const first = items.slice(0, 12).map(card).join('');
        const rest = items.slice(12);
        return `<h2 class="rt-group">${title} <small>${sub}</small></h2>${first}
          ${rest.length ? `<details class="more-combos"><summary>Show ${rest.length} more</summary>${rest.map(card).join('')}</details>` : ''}`;
      };
      list.innerHTML = group('Same airline both ways', 'Scoot + Scoot, IndiGo + IndiGo, Air India Express + Air India Express', same)
        + group('Mixed airlines', 'Different airline each way — sometimes cheaper', mixed);
    }

    function setTab(k, val) {
      const el = $(`[data-sort="${k}"] small`);
      if (el) el.textContent = val || '—';
    }
    render();
  }

  /* ======================================================================
     /book
     ====================================================================== */
  async function initBooking() {
    const root = $('#bookApp');
    if (!root) return;
    const pax = paxFromParams();

    let data;
    try { data = await loadFares(); } catch { data = null; }
    const find = (id) => data && id && data.flights.find((f) => f.id === id);
    const out = find(params.get('f'));
    const back = params.get('r') ? find(params.get('r')) : null;
    if (!out || (params.get('r') && !back)) {
      root.innerHTML = `<div class="card empty" style="grid-column:1/-1"><h3>This fare is no longer available</h3>
        <p>The flight may have departed or our fare list has been refreshed. Please search again or ask our team.</p>
        <p><a class="btn btn-yellow" href="/flights">Search flights</a> <a class="btn btn-wa" href="${wa('Hi Sirpy Air Travels, I would like to book a flight.')}" target="_blank" rel="noopener">WhatsApp us</a></p></div>`;
      return;
    }
    const legs = back ? [out, back] : [out];
    const p = back ? sumPrices(out.p, back.p) : out.p;
    const seats = pax.ad + pax.ch;
    const total = { sgd: p.sgd * seats, inr: p.inr * seats, noBagSgd: p.noBagSgd * seats };
    const city = (c) => SIRPY.AIRPORTS[c].city;
    const routeText = `${city(out.from)} (${out.from}) → ${city(out.to)} (${out.to})${back ? ' · round trip' : ''}`;
    const when = (f) => fmtDate(f.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const lastDate = (back || out).date;

    /* ----- trip summary + fare box ----- */
    $('#tripSummary').innerHTML = legs.map((f, i) => `
      <div class="trip-sum${i ? ' trip-sum-2' : ''}">${logoImg(f.airline, 48)}
        <div>
          ${back ? `<span class="leg-dir">${i ? 'Return' : 'Depart'}</span>` : ''}
          <div class="trip-row">
            <div class="fl-t"><b>${fmt12(f.dep)}</b><small>${f.from}</small></div>
            <div class="fl-line">${fmtDur(f.dur)}<div class="ln"></div><span class="stop">Non-stop</span></div>
            <div class="fl-t end"><b>${fmt12(f.arr)}${f.plus ? `<sup>+${f.plus}</sup>` : ''}</b><small>${f.to}</small></div>
          </div>
          <div class="trip-meta"><span><b>${esc(airlineName(f.airline))}</b> (${esc(f.airline)})</span><span>${when(f)}</span><span>Economy</span><span>${esc(bagLabel(f.p.bag))}</span></div>
        </div>
      </div>`).join('');

    const legLines = legs.map((f) => {
      const lp = f.p;
      const lines = [`<div class="fare-line"><span>${esc(airlineName(f.airline))} ${f.from} → ${f.to}<br><small>Fare ${money.sgd(lp.noBagSgd)} × ${seats}</small></span><b>${money.sgd(lp.noBagSgd * seats)}</b></div>`];
      if (lp.bag.inr > 0) lines.push(`<div class="fare-line"><span>Baggage ${lp.bag.kg} kg<br><small>${money.inr(lp.bag.inr)} (${money.sgd(lp.bagSgd)}) × ${seats}</small></span><b>${money.sgd(lp.bagSgd * seats)}</b></div>`);
      else if (lp.bag.included) lines.push(`<div class="fare-line"><span>Baggage ${lp.bag.kg} kg</span><b>Included</b></div>`);
      return lines.join('');
    }).join('');
    $('#fareBox').innerHTML = `<p class="fare-pax">${pax.ad} Adult${pax.ad > 1 ? 's' : ''}${pax.ch ? `, ${pax.ch} Child` : ''}${pax.inf ? `, ${pax.inf} Infant (charge on request)` : ''}</p>
      ${legLines}
      <div class="fare-total"><span>Total</span><span>${money.sgd(total.sgd)}<span class="inr">${money.inr(total.inr)}</span></span></div>
      <p class="fare-nobag">Without baggage: ${money.sgd(total.noBagSgd)}</p>
      <p class="fare-note">Includes taxes, baggage and our service fee. Fares saved on ${fmtDate(data.updated, { day: 'numeric', month: 'short' })}; our team reconfirms the live fare before ticketing. Nothing is charged online.</p>`;
    $('#bookTitle').textContent = routeText;

    /* ----- passenger forms ----- */
    const types = [
      ...Array.from({ length: pax.ad }, (_, i) => ({ type: 'Adult', n: i + 1, titles: ['Mr', 'Ms', 'Mrs'] })),
      ...Array.from({ length: pax.ch }, (_, i) => ({ type: 'Child', n: i + 1, titles: ['Mstr', 'Miss'] })),
      ...Array.from({ length: pax.inf }, (_, i) => ({ type: 'Infant', n: i + 1, titles: ['Mstr', 'Miss'] }))
    ];
    const ageHint = { Adult: '12 years or older', Child: '2–11 years on travel date', Infant: 'Under 2 years on travel date' };
    const NATIONS = ['Indian', 'Singaporean', 'Malaysian', 'Sri Lankan', 'Other'];
    $('#paxForms').innerHTML = types.map((t, i) => `
      <fieldset class="pax-block" data-i="${i}" data-type="${t.type}">
        <legend class="sr-only">${t.type} ${t.n}</legend>
        <h3>${t.type} ${t.n} <span>${ageHint[t.type]}</span></h3>
        <div class="form-grid">
          <div class="f c-2 keep"><label for="p${i}t">Title</label><select id="p${i}t" name="title" required>${t.titles.map((x) => `<option>${x}</option>`).join('')}</select></div>
          <div class="f c-5"><label for="p${i}f">First &amp; middle name</label><input id="p${i}f" name="first" autocomplete="given-name" required placeholder="As on passport"><span class="err"></span></div>
          <div class="f c-5"><label for="p${i}l">Last name / Surname</label><input id="p${i}l" name="last" autocomplete="family-name" required placeholder="As on passport"><span class="err"></span></div>
          <div class="f c-4"><label for="p${i}d">Date of birth</label><input id="p${i}d" name="dob" type="date" required max="${today()}"><span class="err"></span></div>
          <div class="f c-4"><label for="p${i}n">Nationality</label><select id="p${i}n" name="nationality" required>${NATIONS.map((x) => `<option>${x}</option>`).join('')}</select></div>
          <div class="f c-4"><label for="p${i}g">Gender</label><select id="p${i}g" name="gender"><option>Male</option><option>Female</option></select></div>
          <div class="f c-6"><label for="p${i}p">Passport number <span class="opt">(optional)</span></label><input id="p${i}p" name="passport" autocomplete="off" placeholder="e.g. Z1234567"><span class="hint">Speeds up ticketing — or share it later on WhatsApp.</span></div>
          <div class="f c-6"><label for="p${i}x">Passport expiry <span class="opt">(optional)</span></label><input id="p${i}x" name="expiry" type="date" min="${lastDate}"><span class="err"></span></div>
        </div>
      </fieldset>`).join('');
    $$('.pax-block').forEach((b) => {
      const t = $('[name=title]', b), g = $('[name=gender]', b);
      const sync = () => { g.value = /^(Mr|Mstr)$/.test(t.value) ? 'Male' : 'Female'; };
      t.addEventListener('change', sync); sync();
    });

    /* ----- validation ----- */
    const ageOn = (dob, on) => {
      const b = parseYmd(dob), d = parseYmd(on);
      let a = d.getFullYear() - b.getFullYear();
      if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
      return a;
    };
    function setErr(input, msg) {
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const box = input.closest('.f');
      const e = box && box.querySelector('.err');
      if (e) e.textContent = msg || '';
      return !msg;
    }
    function validate() {
      let first = null;
      const mark = (input, msg) => { if (!setErr(input, msg) && !first) first = input; };
      $$('.pax-block').forEach((b) => {
        const type = b.dataset.type;
        ['first', 'last'].forEach((n) => {
          const el = $(`[name=${n}]`, b);
          const v = el.value.trim();
          mark(el, !v ? 'Required' : !/^[A-Za-z][A-Za-z .'-]*$/.test(v) ? 'English letters only, as on passport' : '');
        });
        const dob = $('[name=dob]', b);
        let msg = '';
        if (!dob.value) msg = 'Required';
        else {
          const age = ageOn(dob.value, out.date);
          if (type === 'Adult' && age < 12) msg = 'Adults must be 12 or older';
          if (type === 'Child' && (age < 2 || age > 11)) msg = 'Child must be 2–11 on the travel date';
          if (type === 'Infant' && age >= 2) msg = 'Infant must be under 2 on the travel date';
        }
        mark(dob, msg);
        const exp = $('[name=expiry]', b);
        mark(exp, exp.value && exp.value < addDays(lastDate, 180) ? 'Passport should be valid 6 months beyond travel' : '');
      });
      const phone = $('#cPhone'), email = $('#cEmail'), name = $('#cName');
      mark(name, name.value.trim() ? '' : 'Required');
      mark(phone, /^[0-9 ]{7,14}$/.test(phone.value.trim()) ? '' : 'Enter a valid mobile number');
      mark(email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? '' : 'Enter a valid email');
      const agree = $('#cAgree');
      if (!agree.checked && !first) first = agree;
      $('#agreeErr').textContent = agree.checked ? '' : 'Please tick to continue';
      if (first) { first.focus(); return false; }
      return true;
    }
    $('#bookForm').addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid') === 'true') setErr(e.target, ''); });

    /* ----- collect + review ----- */
    function collect() {
      const travellers = $$('.pax-block').map((b) => {
        const v = (n) => $(`[name=${n}]`, b).value.trim();
        return {
          type: b.dataset.type, title: v('title'), first: v('first').toUpperCase(), last: v('last').toUpperCase(),
          dob: v('dob'), gender: v('gender'), nationality: v('nationality'),
          passport: v('passport').toUpperCase(), expiry: v('expiry')
        };
      });
      return {
        travellers,
        contact: {
          name: $('#cName').value.trim(),
          phone: `${$('#cCode').value} ${$('#cPhone').value.trim()}`,
          email: $('#cEmail').value.trim(),
          notes: $('#cNotes').value.trim()
        }
      };
    }
    let booking;
    const setStep = (n) => $$('.step').forEach((s, i) => {
      s.classList.toggle('done', i < n);
      s.classList.toggle('current', i === n);
    });
    const legText = (f) => `${airlineName(f.airline)} ${f.from} → ${f.to}, ${when(f)}, ${fmt12(f.dep)} → ${fmt12(f.arr)}${f.plus ? ` (+${f.plus})` : ''}, ${bagLabel(f.p.bag)}`;

    $('#bookForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate()) return;
      booking = collect();
      const tr = booking.travellers.map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t.type)}</td><td>${esc(`${t.title} ${t.first} ${t.last}`)}</td><td>${esc(fmtDate(t.dob, { day: 'numeric', month: 'short', year: 'numeric' }))}</td><td>${esc(t.nationality)}</td><td>${esc(t.passport || '—')}</td></tr>`).join('');
      $('#reviewBody').innerHTML = `
        <dl>
          ${legs.map((f, i) => `<dt>${back ? (i ? 'Return' : 'Depart') : 'Flight'}</dt><dd>${esc(legText(f))}</dd>`).join('')}
          <dt>Total (with baggage)</dt><dd>${money.sgd(total.sgd)} · ${money.inr(total.inr)}${pax.inf ? ' + infant charge' : ''}</dd>
          <dt>Without baggage</dt><dd>${money.sgd(total.noBagSgd)}</dd>
          <dt>Contact</dt><dd>${esc(booking.contact.name)} · ${esc(booking.contact.phone)} · ${esc(booking.contact.email)}</dd>
          ${booking.contact.notes ? `<dt>Notes</dt><dd>${esc(booking.contact.notes)}</dd>` : ''}
        </dl>
        <div class="table-scroll"><table><thead><tr><th>#</th><th>Type</th><th>Name</th><th>DOB</th><th>Nationality</th><th>Passport</th></tr></thead><tbody>${tr}</tbody></table></div>`;
      $('#stepDetails').hidden = true;
      $('#stepReview').hidden = false;
      setStep(2);
      $('#stepReview').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#stepReview h2').focus();
    });
    $('#editBtn').addEventListener('click', () => {
      $('#stepReview').hidden = true;
      $('#stepDetails').hidden = false;
      setStep(1);
      $('#stepDetails').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    /* ----- send ----- */
    $('#sendBtn').addEventListener('click', async () => {
      if (!booking) return;
      const d = new Date();
      const ref = `SPY${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const paxLines = booking.travellers.map((t, i) =>
        `${i + 1}. ${t.title} ${t.first} ${t.last} (${t.type}) · DOB ${t.dob} · ${t.gender} · ${t.nationality}${t.passport ? ` · PP ${t.passport}` : ''}${t.expiry ? ` exp ${t.expiry}` : ''}`).join('\n');
      const msg = `*New booking request ${ref}*${back ? ' (round trip)' : ''}
${legs.map((f, i) => `${back ? (i ? 'Return' : 'Depart') : 'Flight'}: ${legText(f)}`).join('\n')}
Travellers: ${pax.ad} Adult${pax.ch ? `, ${pax.ch} Child` : ''}${pax.inf ? `, ${pax.inf} Infant` : ''}
Total with baggage: ${money.sgd(total.sgd)} / ${money.inr(total.inr)}${pax.inf ? ' + infant charge' : ''}
Without baggage: ${money.sgd(total.noBagSgd)}

${paxLines}

Contact: ${booking.contact.name}, ${booking.contact.phone}, ${booking.contact.email}${booking.contact.notes ? `\nNotes: ${booking.contact.notes}` : ''}`;

      /* Open WhatsApp first, while we still have the click gesture. */
      window.open(wa(msg), '_blank', 'noopener');

      const btn = $('#sendBtn');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      let emailed = false;
      try {
        const r = await fetch(SIRPY.EMAIL_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            _subject: `Booking request ${ref} — ${routeText}, ${out.date}${back ? ` to ${back.date}` : ''}`,
            _template: 'box',
            _captcha: 'false',
            _replyto: booking.contact.email,
            Reference: ref,
            Booking: msg.replace(/\*/g, '')
          })
        });
        const j = await r.json().catch(() => ({}));
        emailed = r.ok && String(j.success) === 'true';
      } catch { /* WhatsApp copy is enough */ }

      $('#stepReview').hidden = true;
      $('#stepDone').hidden = false;
      setStep(3);
      $('#doneRef').textContent = ref;
      $('#doneEmail').textContent = emailed
        ? 'A copy has also been emailed to our team.'
        : 'If WhatsApp did not open, tap the button below to send it.';
      $('#doneWa').href = wa(msg);
      $('#stepDone').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  initResults();
  initBooking();
})();
