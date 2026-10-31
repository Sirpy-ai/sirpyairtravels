/* Lowest fare per airline, from the saved price history (assets/data/history.json).
   Shows only data that was saved; the history grows each day. */
(function () {
  'use strict';
  const S = window.SirpySite;
  if (!S) return;
  const { SIRPY, $, $$, esc, fmtDate, fmt12, money, logoImg, airlineName, getRate, priceOf } = S;
  const CITY = (c) => SIRPY.AIRPORTS[c].city;
  const ROUTE_LABEL = (k) => { const [a, b] = k.split('-'); return `${CITY(a)} → ${CITY(b)}`; };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const state = { airline: 'all', month: '', route: '', rt: false, rtMode: 'same' };
  const params = new URLSearchParams(location.search);
  if (params.get('airline')) state.airline = params.get('airline');

  let rows = [];
  let snapshots = [];

  function setActive(btns, val, attr) {
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === val)));
  }

  function fillSelects() {
    const months = [...new Set(rows.map((r) => r.d.slice(0, 7)))].sort();
    $('#alMonth').insertAdjacentHTML('beforeend', months.map((m) => {
      const [y, mm] = m.split('-');
      return `<option value="${m}">${MONTHS[+mm - 1]} ${y}</option>`;
    }).join(''));
    const routes = [...new Set(rows.map((r) => `${r.f}-${r.t}`))].sort();
    $('#alRoute').insertAdjacentHTML('beforeend', routes.map((k) => `<option value="${k}">${esc(ROUTE_LABEL(k))}</option>`).join(''));
  }

  function filtered() {
    const today = new Date().toLocaleDateString('en-CA');
    return rows.filter((r) =>
      r.d >= today &&
      (state.airline === 'all' || r.a === state.airline) &&
      (!state.month || r.d.startsWith(state.month)) &&
      (!state.route || `${r.f}-${r.t}` === state.route));
  }

  function bookLink(r) {
    const q = new URLSearchParams({ route: `${r.f}-${r.t}`, date: r.d });
    return `/flights?${q}`;
  }

  const dayChip = (d) => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
  const TN = ['TRZ', 'MAA', 'CJB'];
  const SHOW = 8;

  /* Same airline, same route and same price become one fare with all its dates. */
  function groupFares(list) {
    const map = new Map();
    for (const x of list) {
      const key = `${x.r.a}|${x.r.f}-${x.r.t}|${x.p.sgd}`;
      if (!map.has(key)) map.set(key, { r: x.r, p: x.p, dates: new Map(), first: x.r.first, last: x.r.last });
      const g = map.get(key);
      if (!g.dates.has(x.r.d)) g.dates.set(x.r.d, x.r);
      if (x.r.first < g.first) g.first = x.r.first;
      if (x.r.last > g.last) g.last = x.r.last;
    }
    return [...map.values()].map((g) => ({ ...g, dates: [...g.dates.values()].sort((a, b) => a.d.localeCompare(b.d)) }))
      .sort((a, b) => a.p.sgd - b.p.sgd || a.dates[0].d.localeCompare(b.dates[0].d));
  }
  function chipsHtml(items, hrefOf, extra) {
    const chip = (i, hidden) => `<a class="rt-date"${hidden ? ' hidden data-more' : ''} href="${esc(hrefOf(i))}"${extra || ''}>${esc(i.label)}</a>`;
    const more = items.length > SHOW ? `<button type="button" class="rt-more-btn" data-expand>+${items.length - SHOW} more</button>` : '';
    return `<div class="rt-dates">${items.map((i, n) => chip(i, n >= SHOW)).join('')}${more}</div>`;
  }

  function renderOneWay(list) {
    const groups = groupFares(list).slice(0, 40);
    $('#alBody').innerHTML = groups.length ? groups.map((g) => {
      const r = g.r;
      const items = g.dates.map((x) => ({ d: x.d, label: dayChip(x.d), r: x }));
      return `<tr>
        <td>${logoImg(r.a, 28)} ${esc(airlineName(r.a))}</td>
        <td class="nowrap">${esc(ROUTE_LABEL(`${r.f}-${r.t}`))}</td>
        <td class="nowrap"><b>${money.sgd(g.p.sgd)}</b> <span class="muted small">${money.inr(g.p.inr)}</span></td>
        <td>${chipsHtml(items, (i) => bookLink(i.r))}</td>
        <td class="hide-m small muted">${esc(fmtDate(g.first, { day: 'numeric', month: 'short' }))}${g.last !== g.first ? ` – ${esc(fmtDate(g.last, { day: 'numeric', month: 'short' }))}` : ''}</td>
        <td><a class="btn btn-ghost btn-sm" href="${bookLink(g.dates[0])}">Book</a></td>
      </tr>`;
    }).join('')
      : '<tr><td colspan="6" class="loading">No fares for this filter in the saved data.</td></tr>';
  }

  /* Round trips from the saved fares: cheapest flight per date and sector, return 2–5 days later. */
  function renderTrips(rate) {
    const today = new Date().toLocaleDateString('en-CA');
    const best = new Map();
    for (const r of rows) {
      if (r.d < today || (state.airline !== 'all' && r.a !== state.airline)) continue;
      const f = { date: r.d, from: r.f, to: r.t, airline: r.a, dep: r.dep, arr: r.arr, plus: r.plus, dur: r.dur, fare: r.fare, id: '' };
      const p = priceOf(f, rate);
      const k = `${r.d}|${r.f}|${r.t}`;
      if (!best.has(k) || p.sgd < best.get(k).p.sgd) best.set(k, { r, p });
    }
    const byDate = new Map();
    for (const x of best.values()) { if (!byDate.has(x.r.d)) byDate.set(x.r.d, []); byDate.get(x.r.d).push(x); }
    const groups = new Map();
    for (const o of best.values()) {
      if (state.month && !o.r.d.startsWith(state.month)) continue;
      if (state.route && `${o.r.f}-${o.r.t}` !== state.route) continue;
      const fromSin = o.r.f === 'SIN';
      if (!(fromSin ? TN.includes(o.r.t) : TN.includes(o.r.f) && o.r.t === 'SIN')) continue;
      for (let gap = 2; gap <= 5; gap++) {
        const rd = new Date(o.r.d + 'T00:00:00'); rd.setDate(rd.getDate() + gap);
        for (const x of byDate.get(rd.toLocaleDateString('en-CA')) || []) {
          if (fromSin ? !(x.r.t === 'SIN' && TN.includes(x.r.f)) : !(x.r.f === 'SIN' && TN.includes(x.r.t))) continue;
          const same = fromSin ? x.r.f === o.r.t : x.r.t === o.r.f;
          if (state.rtMode === 'same' && !same) continue;
          const sgd = o.p.sgd + x.p.sgd, inr = o.p.inr + x.p.inr;
          const key = `${o.r.f}-${o.r.t}|${x.r.f}-${x.r.t}|${o.r.a}|${x.r.a}|${sgd}`;
          if (!groups.has(key)) groups.set(key, { o, x, same, sgd, inr, trips: [] });
          groups.get(key).trips.push({ out: o.r.d, ret: x.r.d, gap });
        }
      }
    }
    const list = [...groups.values()].sort((a, b) => a.sgd - b.sgd || a.trips[0].out.localeCompare(b.trips[0].out)).slice(0, 15);
    $('#alTrips').innerHTML = list.length ? list.map((g) => {
      const { o, x } = g;
      const items = g.trips.sort((a, b) => a.out.localeCompare(b.out) || a.gap - b.gap).map((t) => ({ ...t, label: `${dayChip(t.out)} → ${dayChip(t.ret)} · ${t.gap}d` }));
      const href = (t) => g.same
        ? `/flights?${new URLSearchParams({ route: `${o.r.f}-${o.r.t}`, date: t.out, trip: 'rt', ret: t.ret })}`
        : S.wa(`Hi Sirpy Air Travels, please book this round trip:\n${CITY(o.r.f)} → ${CITY(o.r.t)} on ${dayChip(t.out)} (${airlineName(o.r.a)})\n${CITY(x.r.f)} → ${CITY(x.r.t)} on ${dayChip(t.ret)} (${airlineName(x.r.a)})\nFare shown: ${money.sgd(g.sgd)} per adult`);
      const names = o.r.a === x.r.a ? esc(airlineName(o.r.a)) : `${esc(airlineName(o.r.a))} + ${esc(airlineName(x.r.a))}`;
      return `<div class="card rt-card">
        <div class="rt-top">
          <span class="rt-logos">${logoImg(o.r.a, 32)}${x.r.a !== o.r.a ? logoImg(x.r.a, 32) : ''}</span>
          <span class="rt-route"><b>${esc(CITY(o.r.f))} → ${esc(CITY(o.r.t))} → ${esc(CITY(x.r.t))}</b><small>${g.same ? 'Same city return' : 'Different city return'} · ${names}</small></span>
          <span class="rt-price"><b>${money.sgd(g.sgd)}</b><small>${money.inr(g.inr)} · round trip per adult</small></span>
        </div>
        <p class="rt-count">${g.trips.length === 1 ? 'Available on 1 date:' : `Same fare on ${g.trips.length} dates:`}</p>
        ${chipsHtml(items, href, g.same ? '' : ' target="_blank" rel="noopener"')}
      </div>`;
    }).join('') : '<p class="loading">No round trips with a 2–5 day return for this filter in the saved data.</p>';
    return list.length;
  }

  async function render() {
    const rate = await getRate();
    const list = filtered().map((r) => {
      const f = { date: r.d, from: r.f, to: r.t, airline: r.a, dep: r.dep, arr: r.arr, plus: r.plus, dur: r.dur, fare: r.fare, id: '' };
      return { r, p: priceOf(f, rate) };
    }).sort((x, y) => x.p.sgd - y.p.sgd);

    /* one card per airline: its lowest fare under the current filters */
    const airlines = ['TR', '6E', 'IX', 'SQ'].filter((a) => state.airline === 'all' || a === state.airline);
    $('#alCards').innerHTML = airlines.map((a) => {
      const best = list.find((x) => x.r.a === a);
      return `<article class="card al-card">
        <div class="al-head">${logoImg(a, 40)}<b>${esc(airlineName(a))}</b></div>
        ${best ? `<p class="al-price">${money.sgd(best.p.sgd)}</p>
          <p class="muted small">${money.inr(best.p.inr)} · ${esc(ROUTE_LABEL(`${best.r.f}-${best.r.t}`))}</p>
          <p class="small">${fmtDate(best.r.d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${fmt12(best.r.dep)}</p>
          <a class="btn btn-yellow btn-sm" href="${bookLink(best.r)}">Check this fare</a>`
          : '<p class="muted small">No fares saved for this filter yet.</p>'}
      </article>`;
    }).join('');

    $('.al-table-wrap').hidden = state.rt;
    $('#alTrips').hidden = !state.rt;
    $('#alRtModeWrap').hidden = !state.rt;
    if (state.rt) renderTrips(rate); else renderOneWay(list);

    $('#alNote').textContent = `Based on saved fare data from ${snapshots.map((s) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' })).join(' and ')}. ${state.rt ? 'Showing the cheapest round trips.' : `${list.length} fares match.`} The history grows every day.`;
  }
  async function init() {
    if (!$('#alCards')) return;
    try {
      const res = await fetch('/assets/data/history.json');
      if (!res.ok) throw new Error('history ' + res.status);
      const data = await res.json();
      rows = data.flights;
      snapshots = data.snapshots || [];
    } catch {
      $('#alNote').textContent = 'Fare history could not load. Please refresh the page.';
      return;
    }
    fillSelects();
    setActive($$('#alAirlines .filter'), state.airline, 'airline');
    $('#alAirlines').addEventListener('click', (e) => {
      const b = e.target.closest('[data-airline]');
      if (!b) return;
      state.airline = b.dataset.airline;
      setActive($$('#alAirlines .filter'), state.airline, 'airline');
      render();
    });
    $('#alMonth').addEventListener('change', (e) => { state.month = e.target.value; render(); });
    $('#alRoute').addEventListener('change', (e) => { state.route = e.target.value; render(); });
    $('#alRt').addEventListener('change', (e) => { state.rt = e.target.checked; render(); });
    $('#alRtMode').addEventListener('change', (e) => { state.rtMode = e.target.value; render(); });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-expand]');
      if (!b) return;
      $$('[data-more]', b.parentElement).forEach((x) => { x.hidden = false; });
      b.remove();
    });
    render();
  }
  init();
})();
