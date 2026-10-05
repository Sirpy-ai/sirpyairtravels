/* ==========================================================================
   Sirpy Air Travels — flight results (/flights) and booking request (/book)
   Needs site.js (window.SirpySite) loaded first.
   ========================================================================== */
(function () {
  'use strict';
  const S = window.SirpySite;
  if (!S) return;
  const { SIRPY, $, $$, esc, wa, addDays, today, fmtDate, fmt12, fmtDur, logoImg, airlineName,
          getRate, sellPrice, money, loadFares, inRoute, cheapest, parseYmd } = S;

  const params = new URLSearchParams(location.search);
  const paxFromParams = () => ({
    ad: Math.min(9, Math.max(1, +params.get('ad') || 1)),
    ch: Math.min(8, Math.max(0, +params.get('ch') || 0)),
    inf: Math.min(9, Math.max(0, +params.get('inf') || 0))
  });

  const SLOTS = {
    early: { label: 'Before 6 AM', test: (h) => h < 6 },
    morning: { label: '6 AM – 12 PM', test: (h) => h >= 6 && h < 12 },
    afternoon: { label: '12 PM – 6 PM', test: (h) => h >= 12 && h < 18 },
    night: { label: 'After 6 PM', test: (h) => h >= 18 }
  };

  /* ======================================================================
     /flights
     ====================================================================== */
  async function initResults() {
    const list = $('#results');
    if (!list) return;

    const routeKey = SIRPY.ROUTES[params.get('route')] ? params.get('route') : 'TN-SIN';
    const route = SIRPY.ROUTES[routeKey];
    const pax = paxFromParams();
    pax.inf = Math.min(pax.inf, pax.ad);
    let date = params.get('date') && params.get('date') >= today() ? params.get('date') : addDays(today(), 1);
    let sort = 'price';
    const filters = { airlines: new Set(), origins: new Set(), slots: new Set() };

    let data, rate;
    try {
      [data, rate] = await Promise.all([loadFares(), getRate()]);
    } catch {
      list.innerHTML = `<div class="card empty"><h3>Fares could not load</h3><p>Please refresh, or send us your dates on WhatsApp.</p><a class="btn btn-wa" href="${wa('Hi Sirpy Air Travels, please share fares for ' + route.short + ' on ' + date)}" target="_blank" rel="noopener">WhatsApp us</a></div>`;
      return;
    }
    const routeFlights = data.flights.filter((f) => inRoute(f, routeKey));
    const lastDate = routeFlights.length ? routeFlights[routeFlights.length - 1].date : today();
    $('#faresUpdated').textContent = fmtDate(data.updated, { day: 'numeric', month: 'short', year: 'numeric' });

    /* ----- filter panel options (built once per route) ----- */
    const airlines = [...new Set(routeFlights.map((f) => f.airline))];
    $('#fAirlines').innerHTML = airlines.map((c) =>
      `<label class="check"><input type="checkbox" value="${esc(c)}" data-f="airlines">${logoImg(c, 22)}<span>${esc(airlineName(c))}</span><small data-min="${esc(c)}"></small></label>`).join('');
    const multiOrigin = route.from.length > 1 || route.to.length > 1;
    const portSide = route.from.length > 1 ? 'from' : 'to';
    const ports = multiOrigin ? (route.from.length > 1 ? route.from : route.to) : [];
    $('#fOriginsGroup').hidden = !multiOrigin;
    if (multiOrigin) {
      $('#fOriginsTitle').textContent = portSide === 'from' ? 'Departure airport' : 'Arrival airport';
      $('#fOrigins').innerHTML = ports.map((p) =>
        `<label class="check"><input type="checkbox" value="${p}" data-f="origins"><span>${esc(SIRPY.AIRPORTS[p].city)} (${p})</span><small data-min-port="${p}"></small></label>`).join('');
    }
    $('#fSlots').innerHTML = Object.entries(SLOTS).map(([k, s]) =>
      `<button type="button" class="time-slot" data-slot="${k}" aria-pressed="false"><b>${k[0].toUpperCase() + k.slice(1)}</b>${s.label}</button>`).join('');

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

    /* ----- date strip ----- */
    let stripStart;
    function renderStrip() {
      if (!stripStart || date < stripStart || date > addDays(stripStart, 6)) {
        stripStart = addDays(date, -3);
        if (stripStart < today()) stripStart = today();
      }
      const days = Array.from({ length: 7 }, (_, i) => addDays(stripStart, i));
      const mins = days.map((d) => cheapest(routeFlights.filter((f) => f.date === d)));
      const low = cheapest(mins.filter(Boolean));
      $('#dates').innerHTML = days.map((d, i) => {
        const m = mins[i];
        const price = m ? `<span>${money.sgd(sellPrice(m.fare, rate).sgd)}</span>` : '<span class="na">—</span>';
        return `<button type="button" class="date-cell${d === date ? ' active' : ''}${m && m === low ? ' cheapest' : ''}" data-date="${d}" aria-pressed="${d === date}"><b>${fmtDate(d, { weekday: 'short' })}, ${fmtDate(d, { day: 'numeric', month: 'short' })}</b>${price}</button>`;
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
      history.replaceState(null, '', `${location.pathname}?${params}`);
      const di = $('#sDate');
      if (di) di.value = d;
      render();
    }

    /* ----- results ----- */
    function render() {
      renderStrip();
      const day = routeFlights.filter((f) => f.date === date);
      const shown = day.filter((f) =>
        (!filters.airlines.size || filters.airlines.has(f.airline)) &&
        (!filters.origins.size || filters.origins.has(portSide === 'from' ? f.from : f.to)) &&
        (!filters.slots.size || [...filters.slots].some((s) => SLOTS[s].test(+f.dep.slice(0, 2)))));

      /* per-airline / per-airport minimums for the filter panel */
      $$('[data-min]').forEach((el) => {
        const m = cheapest(day.filter((f) => f.airline === el.dataset.min));
        el.textContent = m ? money.sgd(sellPrice(m.fare, rate).sgd) : '—';
      });
      $$('[data-min-port]').forEach((el) => {
        const p = el.dataset.minPort;
        const m = cheapest(day.filter((f) => (portSide === 'from' ? f.from : f.to) === p));
        el.textContent = m ? money.sgd(sellPrice(m.fare, rate).sgd) : '—';
      });

      const byPrice = [...shown].sort((a, b) => a.fare - b.fare || a.dep.localeCompare(b.dep));
      const byDep = [...shown].sort((a, b) => a.dep.localeCompare(b.dep));
      const byDur = [...shown].sort((a, b) => a.dur - b.dur || a.fare - b.fare);
      const sorted = sort === 'dep' ? byDep : sort === 'dur' ? byDur : byPrice;
      const cheapestF = byPrice[0], fastestF = byDur[0];

      const tab = (k, f, extra) => {
        const el = $(`[data-sort="${k}"] small`);
        if (el) el.textContent = f ? extra(f) : '—';
      };
      tab('price', cheapestF, (f) => money.sgd(sellPrice(f.fare, rate).sgd));
      tab('dep', byDep[0], (f) => fmt12(f.dep));
      tab('dur', fastestF, (f) => fmtDur(f.dur));

      $('#resultsTitle').textContent = `${route.short} · ${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`;
      const n = pax.ad + pax.ch + pax.inf;
      $('#resultsMeta').textContent = `${shown.length} flight${shown.length === 1 ? '' : 's'} · ${n} traveller${n > 1 ? 's' : ''} · prices per adult incl. service fee`;

      if (!day.length) {
        const next = routeFlights.find((f) => f.date > date);
        list.innerHTML = `<div class="card empty">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'}
          <h3>No saved fares for this date</h3>
          <p>We may still have seats — our team can check live availability for you.</p>
          <p>${next ? `<button class="btn btn-yellow" type="button" data-goto="${next.date}">See ${fmtDate(next.date)}</button> ` : ''}<a class="btn btn-wa" href="${wa(`Hi Sirpy Air Travels, please check fares for ${route.short} on ${fmtDate(date)} for ${n} traveller(s).`)}" target="_blank" rel="noopener">Ask on WhatsApp</a></p></div>`;
        const g = $('[data-goto]', list);
        if (g) g.addEventListener('click', () => setDate(g.dataset.goto));
        return;
      }
      if (!shown.length) {
        list.innerHTML = '<div class="card empty"><h3>No flights match these filters</h3><p>Try clearing a filter.</p></div>';
        return;
      }

      list.innerHTML = sorted.map((f) => {
        const p = sellPrice(f.fare, rate);
        const q = new URLSearchParams({ f: f.id, ad: pax.ad, ch: pax.ch, inf: pax.inf });
        const tags = [];
        if (f === cheapestF) tags.push('<span class="best">Cheapest</span>');
        if (f === fastestF && day.length > 1) tags.push('<span>Fastest</span>');
        tags.push('<span>Economy</span>', '<span>Fare reconfirmed before ticketing</span>');
        return `<article class="card flight">
          <div class="fl-air">${logoImg(f.airline, 40)}<div><b>${esc(airlineName(f.airline))}</b><small>${esc(f.airline)} · Economy</small></div></div>
          <div class="fl-times">
            <div class="fl-t"><b>${fmt12(f.dep)}</b><small>${f.from} · ${esc(SIRPY.AIRPORTS[f.from].city)}</small></div>
            <div class="fl-line">${fmtDur(f.dur)}<div class="ln"></div><span class="stop">Non-stop</span></div>
            <div class="fl-t end"><b>${fmt12(f.arr)}${f.plus ? `<sup>+${f.plus}</sup>` : ''}</b><small>${f.to} · ${esc(SIRPY.AIRPORTS[f.to].city)}</small></div>
          </div>
          <div class="fl-price">
            <div><div class="p">${money.sgd(p.sgd)}</div><div class="inr">${money.inr(p.inr)}</div><small>per adult</small></div>
            <a class="btn btn-yellow" href="/book?${q}">Book Now</a>
          </div>
          <div class="fl-tags">${tags.join('')}</div>
        </article>`;
      }).join('');
    }
    render();
  }

  /* ======================================================================
     /book
     ====================================================================== */
  async function initBooking() {
    const root = $('#bookApp');
    if (!root) return;
    const id = params.get('f') || '';
    const pax = paxFromParams();
    pax.inf = Math.min(pax.inf, pax.ad);

    let data, rate;
    try { [data, rate] = await Promise.all([loadFares(), getRate()]); } catch { data = null; }
    const flight = data && data.flights.find((f) => f.id === id);
    if (!flight) {
      root.innerHTML = `<div class="card empty" style="grid-column:1/-1"><h3>This fare is no longer available</h3>
        <p>The flight may have departed or our fare list has been refreshed. Please search again or ask our team.</p>
        <p><a class="btn btn-yellow" href="/flights">Search flights</a> <a class="btn btn-wa" href="${wa('Hi Sirpy Air Travels, I would like to book a flight.')}" target="_blank" rel="noopener">WhatsApp us</a></p></div>`;
      return;
    }

    const p = sellPrice(flight.fare, rate);
    const seats = pax.ad + pax.ch;
    const total = { sgd: p.sgd * seats, inr: p.inr * seats };
    const route = `${SIRPY.AIRPORTS[flight.from].city} (${flight.from}) → ${SIRPY.AIRPORTS[flight.to].city} (${flight.to})`;
    const when = fmtDate(flight.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const arrDate = flight.plus ? fmtDate(addDays(flight.date, flight.plus), { day: 'numeric', month: 'short' }) : '';

    /* ----- trip summary + fare box ----- */
    $('#tripSummary').innerHTML = `
      <div class="trip-sum">${logoImg(flight.airline, 48)}
        <div>
          <div class="trip-row">
            <div class="fl-t"><b>${fmt12(flight.dep)}</b><small>${flight.from}</small></div>
            <div class="fl-line">${fmtDur(flight.dur)}<div class="ln"></div><span class="stop">Non-stop</span></div>
            <div class="fl-t end"><b>${fmt12(flight.arr)}${flight.plus ? `<sup>+${flight.plus}</sup>` : ''}</b><small>${flight.to}</small></div>
          </div>
          <div class="trip-meta"><span><b>${esc(airlineName(flight.airline))}</b> (${esc(flight.airline)})</span><span>${when}</span>${arrDate ? `<span>Arrives ${arrDate}</span>` : ''}<span>Economy</span></div>
        </div>
      </div>`;
    const lines = [];
    lines.push(`<div class="fare-line"><span>Adult × ${pax.ad}<br><small>${money.sgd(p.sgd)} each</small></span><b>${money.sgd(p.sgd * pax.ad)}</b></div>`);
    if (pax.ch) lines.push(`<div class="fare-line"><span>Child × ${pax.ch}<br><small>${money.sgd(p.sgd)} each</small></span><b>${money.sgd(p.sgd * pax.ch)}</b></div>`);
    if (pax.inf) lines.push(`<div class="fare-line"><span>Infant × ${pax.inf}<br><small>airline infant charge</small></span><b>On request</b></div>`);
    $('#fareBox').innerHTML = `${lines.join('')}
      <div class="fare-total"><span>Total</span><span>${money.sgd(total.sgd)}<span class="inr">${money.inr(total.inr)}</span></span></div>
      <p class="fare-note">Includes taxes and our service fee. Fare saved on ${fmtDate(data.updated, { day: 'numeric', month: 'short' })}; our team reconfirms the live fare before ticketing. Nothing is charged online.</p>`;
    $('#bookTitle').textContent = route;

    /* ----- passenger forms ----- */
    const types = [
      ...Array.from({ length: pax.ad }, (_, i) => ({ type: 'Adult', n: i + 1, titles: ['Mr', 'Ms', 'Mrs'] })),
      ...Array.from({ length: pax.ch }, (_, i) => ({ type: 'Child', n: i + 1, titles: ['Mstr', 'Miss'] })),
      ...Array.from({ length: pax.inf }, (_, i) => ({ type: 'Infant', n: i + 1, titles: ['Mstr', 'Miss'] }))
    ];
    const ageHint = { Adult: '12 years or older', Child: '2–11 years on travel date', Infant: 'Under 2 years on travel date' };
    const NATIONS = ['Indian', 'Singaporean', 'Malaysian', 'Sri Lankan', 'Other'];
    $('#paxForms').innerHTML = types.map((t, i) => `
      <fieldset class="pax-block" data-i="${i}" data-type="${t.type}" style="border:1px solid var(--line)">
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
          <div class="f c-6"><label for="p${i}x">Passport expiry <span class="opt">(optional)</span></label><input id="p${i}x" name="expiry" type="date" min="${flight.date}"><span class="err"></span></div>
        </div>
      </fieldset>`).join('');
    /* Title suggests gender */
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
          const age = ageOn(dob.value, flight.date);
          if (type === 'Adult' && age < 12) msg = 'Adults must be 12 or older';
          if (type === 'Child' && (age < 2 || age > 11)) msg = 'Child must be 2–11 on the travel date';
          if (type === 'Infant' && age >= 2) msg = 'Infant must be under 2 on the travel date';
        }
        mark(dob, msg);
        const exp = $('[name=expiry]', b);
        mark(exp, exp.value && exp.value < addDays(flight.date, 180) ? 'Passport should be valid 6 months beyond travel' : '');
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

    $('#bookForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate()) return;
      booking = collect();
      const tr = booking.travellers.map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t.type)}</td><td>${esc(`${t.title} ${t.first} ${t.last}`)}</td><td>${esc(fmtDate(t.dob, { day: 'numeric', month: 'short', year: 'numeric' }))}</td><td>${esc(t.nationality)}</td><td>${esc(t.passport || '—')}</td></tr>`).join('');
      $('#reviewBody').innerHTML = `
        <dl>
          <dt>Flight</dt><dd>${esc(airlineName(flight.airline))} · ${esc(route)}</dd>
          <dt>Departure</dt><dd>${esc(when)}, ${fmt12(flight.dep)}</dd>
          <dt>Arrival</dt><dd>${fmt12(flight.arr)}${flight.plus ? ` (+${flight.plus} day)` : ''}</dd>
          <dt>Indicative total</dt><dd>${money.sgd(total.sgd)} · ${money.inr(total.inr)}${pax.inf ? ' + infant charge' : ''}</dd>
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
      const msg = `*New booking request ${ref}*
Flight: ${airlineName(flight.airline)} (${flight.airline})
Route: ${route}
Date: ${when}
Time: ${fmt12(flight.dep)} → ${fmt12(flight.arr)}${flight.plus ? ` (+${flight.plus})` : ''}
Travellers: ${pax.ad} Adult${pax.ch ? `, ${pax.ch} Child` : ''}${pax.inf ? `, ${pax.inf} Infant` : ''}
Indicative total: ${money.sgd(total.sgd)} / ${money.inr(total.inr)}${pax.inf ? ' + infant charge' : ''}

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
            _subject: `Booking request ${ref} — ${route}, ${flight.date}`,
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
        ? `A copy has also been emailed to our team.`
        : `If WhatsApp did not open, tap the button below to send it.`;
      $('#doneWa').href = wa(msg);
      $('#stepDone').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  initResults();
  initBooking();
})();
