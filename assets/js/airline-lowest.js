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

  const state = { airline: 'all', month: '', route: '' };
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

    const top = list.slice(0, 40);
    $('#alBody').innerHTML = top.length ? top.map(({ r, p }) => `<tr>
        <td>${logoImg(r.a, 28)} ${esc(airlineName(r.a))}</td>
        <td class="nowrap">${esc(ROUTE_LABEL(`${r.f}-${r.t}`))}</td>
        <td class="nowrap">${esc(fmtDate(r.d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</td>
        <td class="nowrap">${esc(fmt12(r.dep))}</td>
        <td class="nowrap"><b>${money.sgd(p.sgd)}</b> <span class="muted small">${money.inr(p.inr)}</span></td>
        <td class="hide-m small muted">${esc(fmtDate(r.first, { day: 'numeric', month: 'short' }))}${r.last !== r.first ? ` – ${esc(fmtDate(r.last, { day: 'numeric', month: 'short' }))}` : ''}</td>
        <td><a class="btn btn-ghost btn-sm" href="${bookLink(r)}">Book</a></td>
      </tr>`).join('')
      : '<tr><td colspan="7" class="loading">No fares for this filter in the saved data.</td></tr>';

    $('#alNote').textContent = `Based on saved fare data from ${snapshots.map((s) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' })).join(' and ')}. ${list.length} fares match. The history grows every day.`;
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
    render();
  }
  init();
})();
