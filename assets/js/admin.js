/* ==========================================================================
   Sirpy Air Travels — admin portal (/admin)
   Login (email link or code) → Dashboard, Bookings, Enquiries, Subscribers,
   Blog posts and manual Fare upload. Data lives in Supabase; row-level
   security only lets emails in the `admins` table read or change anything.
   Needs: supabase-js (CDN), site.js (settings + helpers), md.js.
   ========================================================================== */
(function () {
  'use strict';
  const S = window.SirpySite;
  const { SIRPY, $, $$, esc, fmtDate, today, addDays } = S;
  const db = window.supabase.createClient(SIRPY.SUPABASE_URL, SIRPY.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  /* ---------- small helpers ---------- */
  const show = (id) => ['loginView', 'deniedView', 'appView'].forEach((v) => { $('#' + v).hidden = v !== id; });
  let toastTimer;
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  const fail = (e) => { console.error(e); toast(e.message || String(e), true); };
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
  const day = (ymd) => (ymd ? fmtDate(ymd, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const pill = (s) => `<span class="pill st-${esc(s)}">${esc(s)}</span>`;
  const sgd = (n) => (n == null ? '' : 'S$' + Number(n).toLocaleString('en-SG', { maximumFractionDigits: 0 }));
  const inr = (n) => (n == null ? '' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  const waLink = (phone, text) => {
    const raw = String(phone || '').trim();
    let d = raw.replace(/\D/g, '');
    if (!raw.startsWith('+') && !d.startsWith('00')) {
      if (d.length === 10) d = '91' + d;    // Indian mobile without country code
      if (d.length === 8) d = '65' + d;     // Singapore mobile without country code
    }
    d = d.replace(/^00/, '');
    return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  };
  const dueCls = (ymd) => (ymd && ymd <= today() ? 'due' : '');
  function csvDownload(name, rows) {
    if (!rows.length) return toast('Nothing to export');
    const cols = Object.keys(rows[0]);
    const cell = (v) => {
      const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${name}-${today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- drawer ---------- */
  function openDrawer(html) {
    $('#drawerBody').innerHTML = html;
    $('#drawer').hidden = false;
    $('#drawerBg').hidden = false;
    $('#drawer').scrollTop = 0;
  }
  function closeDrawer() { $('#drawer').hidden = true; $('#drawerBg').hidden = true; }
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerBg').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  /* ======================================================================
     Login
     ====================================================================== */
  let me = null;
  let loginEmail = '';

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#loginMsg');
    loginEmail = $('#loginEmail').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) { msg.textContent = 'Enter your admin email.'; return; }
    const btn = $('button', e.target);
    btn.disabled = true;
    msg.className = 'msg';
    msg.textContent = 'Sending…';
    const { error } = await db.auth.signInWithOtp({
      email: loginEmail,
      options: { emailRedirectTo: location.origin + '/admin', shouldCreateUser: true }
    });
    btn.disabled = false;
    if (error) { msg.textContent = error.message; return; }
    msg.textContent = '';
    $('#loginForm').hidden = true;
    $('#codeForm').hidden = false;
    $('#codeHint').innerHTML = `We emailed <b>${esc(loginEmail)}</b>. Open the email on this device and tap the login link.`;
  });
  $('#codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('#loginCode').value.replace(/\s/g, '');
    if (!token) return;
    const { error } = await db.auth.verifyOtp({ email: loginEmail, token, type: 'email' });
    if (error) { $('#loginMsg').textContent = error.message; return; }
  });
  $('#loginBack').addEventListener('click', () => {
    $('#codeForm').hidden = true;
    $('#loginForm').hidden = false;
    $('#loginMsg').textContent = '';
  });
  $$('[data-signout]').forEach((b) => b.addEventListener('click', async () => {
    await db.auth.signOut();
    location.hash = '';
    location.reload();
  }));

  async function onSession(session) {
    if (!session) { me = null; show('loginView'); return; }
    if (me && me.email === session.user.email) return;
    const { data: isAdmin, error } = await db.rpc('is_admin');
    if (error || !isAdmin) {
      $('#deniedEmail').textContent = session.user.email;
      show('deniedView');
      return;
    }
    me = session.user;
    $('#whoEmail').textContent = me.email;
    show('appView');
    // Clean the login tokens out of the address bar.
    if (/access_token|code=|error_description/.test(location.href)) history.replaceState(null, '', '/admin' + (location.hash.startsWith('#access') ? '' : location.hash));
    route();
    refreshBadges();
  }
  db.auth.onAuthStateChange((_event, session) => { setTimeout(() => onSession(session), 0); });
  db.auth.getSession().then(({ data }) => onSession(data.session));

  /* ======================================================================
     Navigation
     ====================================================================== */
  const TABS = { dashboard, bookings, enquiries, subscribers, posts, fares };
  function route() {
    if (!me) return;
    const name = (location.hash.slice(1).split('/')[0]) || 'dashboard';
    const tab = TABS[name] ? name : 'dashboard';
    $$('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    $('#sideNav').classList.remove('open');
    closeDrawer();
    $('#main').innerHTML = '<p class="muted">Loading…</p>';
    TABS[tab]().catch(fail);
  }
  window.addEventListener('hashchange', route);
  $('#navToggle').addEventListener('click', () => $('#sideNav').classList.toggle('open'));

  async function refreshBadges() {
    const count = async (table) => {
      const { count } = await db.from(table).select('id', { count: 'exact', head: true }).eq('status', 'new');
      return count || '';
    };
    const [b, e] = await Promise.all([count('bookings'), count('enquiries')]);
    $('[data-count=bookings]').textContent = b;
    $('[data-count=enquiries]').textContent = e;
  }

  /* ======================================================================
     Dashboard
     ====================================================================== */
  async function dashboard() {
    const week = new Date(Date.now() - 7 * 864e5).toISOString();
    const head = (q) => q.then((r) => r.count || 0);
    const [newB, weekB, newE, subs, live, recent, fares] = await Promise.all([
      head(db.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'new')),
      head(db.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', week)),
      head(db.from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new')),
      head(db.from('subscribers').select('id', { count: 'exact', head: true }).eq('status', 'active')),
      head(db.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'published')),
      db.from('bookings').select('id,ref,created_at,route,depart_date,contact_name,status,total_sgd').order('created_at', { ascending: false }).limit(6),
      currentFares()
    ]);
    const follow = await db.from('bookings').select('id,ref,contact_name,follow_up,status')
      .lte('follow_up', today()).not('status', 'in', '(travelled,cancelled)').order('follow_up').limit(10);
    $('#main').innerHTML = `
      <div class="page-head"><h1>Dashboard</h1><span class="muted">${esc(fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long' }))}</span></div>
      <div class="stats">
        <a class="stat" href="#bookings"><b>${newB}</b><span>New booking requests</span></a>
        <a class="stat" href="#bookings"><b>${weekB}</b><span>Bookings in the last 7 days</span></a>
        <a class="stat" href="#enquiries"><b>${newE}</b><span>New enquiries</span></a>
        <a class="stat" href="#subscribers"><b>${subs}</b><span>Sign-ins &amp; subscribers</span></a>
        <a class="stat" href="#posts"><b>${live}</b><span>Published blog posts</span></a>
        <a class="stat" href="#fares"><b>${fares.best ? esc(fmtDate(fares.best.updated, { day: 'numeric', month: 'short' })) : '—'}</b><span>Fares on site (${fares.best === fares.manual ? 'manual upload' : 'daily auto'})</span></a>
      </div>
      <div class="grid-2">
        <section class="card"><h2>Latest booking requests</h2>${recent.data && recent.data.length ? `<table><tbody>${recent.data.map((b) => `
          <tr data-open="${b.id}"><td><b>${esc(b.contact_name || '—')}</b><div class="small muted">${esc(b.ref || '')} · ${esc(when(b.created_at))}</div></td>
          <td class="nowrap">${esc(b.route || '')}<div class="small muted">${esc(day(b.depart_date))}</div></td><td>${pill(b.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No booking requests yet. They appear here when customers send one from the website.</p>'}</section>
        <section class="card"><h2>Follow-ups due</h2>${follow.data && follow.data.length ? `<table><tbody>${follow.data.map((b) => `
          <tr data-open="${b.id}"><td><b>${esc(b.contact_name || '—')}</b><div class="small muted">${esc(b.ref || '')}</div></td><td class="due nowrap">${esc(day(b.follow_up))}</td><td>${pill(b.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing due. Set a follow-up date on a booking to see it here.</p>'}</section>
      </div>`;
    $$('[data-open]', $('#main')).forEach((tr) => tr.addEventListener('click', () => openBooking(tr.dataset.open)));
  }

  /* ======================================================================
     Bookings (CRM)
     ====================================================================== */
  const B_STATUS = ['new', 'quoted', 'confirmed', 'ticketed', 'travelled', 'cancelled'];
  let bookingRows = [];
  async function bookings() {
    $('#main').innerHTML = `
      <div class="page-head"><h1>Booking requests</h1>
        <button class="btn btn-ghost btn-sm" type="button" id="bExport">Export Excel (CSV)</button></div>
      <div class="toolbar">
        <input type="search" id="bSearch" placeholder="Search name, phone, email, ref…">
        <select id="bStatus"><option value="">All statuses</option>${B_STATUS.map((s) => `<option>${s}</option>`).join('')}</select>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Received</th><th>Customer</th><th>Trip</th><th class="hide-m">Travellers</th><th>Total</th><th>Status</th><th class="hide-m">Follow-up</th></tr></thead>
      <tbody id="bBody"><tr><td colspan="7" class="empty">Loading…</td></tr></tbody></table></div>`;
    const { data, error } = await db.from('bookings').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    bookingRows = data;
    const draw = () => {
      const q = $('#bSearch').value.trim().toLowerCase();
      const st = $('#bStatus').value;
      const rows = bookingRows.filter((b) => (!st || b.status === st) &&
        (!q || [b.ref, b.contact_name, b.phone, b.email, b.route].join(' ').toLowerCase().includes(q)));
      $('#bBody').innerHTML = rows.length ? rows.map((b) => `
        <tr data-id="${b.id}">
          <td class="nowrap">${esc(when(b.created_at))}<div class="small muted">${esc(b.ref || '')}</div></td>
          <td><b>${esc(b.contact_name || '—')}</b><div class="small muted">${esc(b.phone || '')}</div></td>
          <td class="nowrap">${esc(b.route || '')}${b.trip === 'rt' ? ' ⇄' : ''}<div class="small muted">${esc(day(b.depart_date))}${b.return_date ? ' – ' + esc(day(b.return_date)) : ''}</div></td>
          <td class="hide-m">${b.adults}A${b.children ? ` ${b.children}C` : ''}${b.infants ? ` ${b.infants}I` : ''}</td>
          <td class="nowrap">${esc(sgd(b.total_sgd))}</td>
          <td>${pill(b.status)}</td>
          <td class="hide-m nowrap ${dueCls(b.follow_up)}">${esc(day(b.follow_up))}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="empty">No booking requests match.</td></tr>';
      $$('#bBody tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openBooking(tr.dataset.id)));
    };
    $('#bSearch').addEventListener('input', draw);
    $('#bStatus').addEventListener('change', draw);
    $('#bExport').addEventListener('click', () => csvDownload('bookings', bookingRows.map((b) => ({
      ref: b.ref, received: b.created_at, status: b.status, name: b.contact_name, phone: b.phone, email: b.email,
      trip: b.trip, route: b.route, depart: b.depart_date, return: b.return_date, adults: b.adults, children: b.children,
      infants: b.infants, total_sgd: b.total_sgd, total_inr: b.total_inr, follow_up: b.follow_up, notes: b.notes,
      passengers: (b.passengers || []).map((p) => `${p.title || ''} ${p.first || ''} ${p.last || ''}`.trim()).join('; ')
    }))));
    draw();
  }

  async function openBooking(id) {
    const { data: b, error } = await db.from('bookings').select('*').eq('id', id).single();
    if (error) return fail(error);
    const legs = (b.flights || []).map((f, i) => `<div class="leg"><b>${b.trip === 'rt' ? (i ? 'Return' : 'Depart') : 'Flight'}:</b>
      ${esc(f.airline || '')} ${esc(f.from || '')} → ${esc(f.to || '')} · ${esc(day(f.date))} · ${esc(f.dep || '')} → ${esc(f.arr || '')}${f.plus ? ` (+${esc(f.plus)})` : ''}
      <div class="small muted">${esc(sgd(f.sgd))} / ${esc(inr(f.inr))} per seat · ${esc(f.bag || '')}</div></div>`).join('');
    const pax = (b.passengers || []).map((p, i) => `<tr><td>${i + 1}</td><td>${esc(`${p.title || ''} ${p.first || ''} ${p.last || ''}`)}<div class="small muted">${esc(p.type || '')} · ${esc(p.gender || '')}</div></td>
      <td class="nowrap">${esc(p.dob || '')}</td><td>${esc(p.nationality || '')}</td><td>${esc(p.passport || '—')}${p.expiry ? `<div class="small muted">exp ${esc(p.expiry)}</div>` : ''}</td></tr>`).join('');
    const hello = `Hi ${b.contact_name || ''}, this is Sirpy Air Travels about your booking request ${b.ref || ''}.`;
    openDrawer(`
      <h2>${esc(b.contact_name || 'Booking request')} ${pill(b.status)}</h2>
      <p class="muted small">${esc(b.ref || '')} · received ${esc(when(b.created_at))} · from ${esc(b.source)}</p>
      <div class="actions" style="margin:0 0 14px">
        ${b.phone ? `<a class="btn btn-wa btn-sm" href="${esc(waLink(b.phone, hello))}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn btn-ghost btn-sm" href="tel:${esc(String(b.phone).replace(/[^\d+]/g, ''))}">Call</a>` : ''}
        ${b.email ? `<a class="btn btn-ghost btn-sm" href="mailto:${esc(b.email)}?subject=${encodeURIComponent('Your booking request ' + (b.ref || ''))}">Email</a>` : ''}
      </div>
      <dl class="kv">
        <dt>Phone</dt><dd>${esc(b.phone || '—')}</dd>
        <dt>Email</dt><dd>${esc(b.email || '—')}</dd>
        <dt>Trip</dt><dd>${b.trip === 'rt' ? 'Round trip' : 'One way'} · ${esc(b.route || '')}</dd>
        <dt>Travellers</dt><dd>${b.adults} adult${b.children ? `, ${b.children} child` : ''}${b.infants ? `, ${b.infants} infant` : ''}</dd>
        <dt>Total</dt><dd><b>${esc(sgd(b.total_sgd))}</b> / ${esc(inr(b.total_inr))} (with baggage)</dd>
        ${b.message ? `<dt>Customer note</dt><dd>${esc(b.message)}</dd>` : ''}
      </dl>
      ${legs ? `<div class="section-title">Flights</div>${legs}` : ''}
      ${pax ? `<div class="section-title">Passengers</div><div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>DOB</th><th>Nation.</th><th>Passport</th></tr></thead><tbody>${pax}</tbody></table></div>` : ''}
      <div class="section-title">Follow-up</div>
      <form id="bForm" class="form-grid">
        <div><label for="fStatus">Status</label><select id="fStatus">${B_STATUS.map((s) => `<option${s === b.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
        <div><label for="fFollow">Follow-up date</label><input id="fFollow" type="date" value="${esc(b.follow_up || '')}"></div>
        <div class="full"><label for="fNotes">Notes (only admins see these)</label><textarea id="fNotes" rows="5" placeholder="Quoted S$..., PNR..., called on...">${esc(b.notes || '')}</textarea></div>
        <div class="full actions"><button class="btn btn-yellow" type="submit">Save</button>
          <button class="btn btn-danger" type="button" id="bDelete">Delete</button></div>
      </form>`);
    $('#bForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error: err } = await db.from('bookings').update({
        status: $('#fStatus').value, follow_up: $('#fFollow').value || null, notes: $('#fNotes').value.trim() || null
      }).eq('id', b.id);
      if (err) return fail(err);
      toast('Saved');
      closeDrawer();
      refreshBadges();
      route();
    });
    $('#bDelete').addEventListener('click', async () => {
      if (!confirm(`Delete booking request ${b.ref || ''} from ${b.contact_name || ''}? This cannot be undone.`)) return;
      const { error: err } = await db.from('bookings').delete().eq('id', b.id);
      if (err) return fail(err);
      toast('Deleted');
      closeDrawer();
      refreshBadges();
      route();
    });
  }

  /* ======================================================================
     Enquiries
     ====================================================================== */
  const E_STATUS = ['new', 'replied', 'closed'];
  async function enquiries() {
    $('#main').innerHTML = `
      <div class="page-head"><h1>Enquiries</h1><button class="btn btn-ghost btn-sm" type="button" id="eExport">Export Excel (CSV)</button></div>
      <div class="toolbar"><input type="search" id="eSearch" placeholder="Search…">
        <select id="eStatus"><option value="">All statuses</option>${E_STATUS.map((s) => `<option>${s}</option>`).join('')}</select></div>
      <div class="table-wrap"><table><thead><tr><th>Received</th><th>Name</th><th>Subject</th><th>Status</th><th class="hide-m">Follow-up</th></tr></thead>
      <tbody id="eBody"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody></table></div>`;
    const { data, error } = await db.from('enquiries').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    const draw = () => {
      const q = $('#eSearch').value.trim().toLowerCase();
      const st = $('#eStatus').value;
      const rows = data.filter((r) => (!st || r.status === st) && (!q || [r.name, r.phone, r.email, r.subject, r.message].join(' ').toLowerCase().includes(q)));
      $('#eBody').innerHTML = rows.length ? rows.map((r) => `<tr data-id="${r.id}">
        <td class="nowrap">${esc(when(r.created_at))}</td><td><b>${esc(r.name || '—')}</b><div class="small muted">${esc(r.phone || r.email || '')}</div></td>
        <td>${esc(r.subject || '')}<div class="small muted">${esc((r.message || '').slice(0, 80))}</div></td><td>${pill(r.status)}</td>
        <td class="hide-m nowrap ${dueCls(r.follow_up)}">${esc(day(r.follow_up))}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">No enquiries yet. Messages sent from the Contact page appear here.</td></tr>';
      $$('#eBody tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openEnquiry(data.find((r) => r.id === tr.dataset.id))));
    };
    $('#eSearch').addEventListener('input', draw);
    $('#eStatus').addEventListener('change', draw);
    $('#eExport').addEventListener('click', () => csvDownload('enquiries', data.map(({ id, updated_at, ...r }) => r)));
    draw();
  }
  function openEnquiry(r) {
    openDrawer(`
      <h2>${esc(r.name || 'Enquiry')} ${pill(r.status)}</h2>
      <p class="muted small">Received ${esc(when(r.created_at))} · ${esc(r.source)}</p>
      <div class="actions" style="margin:0 0 14px">
        ${r.phone ? `<a class="btn btn-wa btn-sm" href="${esc(waLink(r.phone, `Hi ${r.name || ''}, this is Sirpy Air Travels replying to your enquiry.`))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${r.email ? `<a class="btn btn-ghost btn-sm" href="mailto:${esc(r.email)}">Email</a>` : ''}
      </div>
      <dl class="kv"><dt>Phone</dt><dd>${esc(r.phone || '—')}</dd><dt>Email</dt><dd>${esc(r.email || '—')}</dd>
        <dt>Subject</dt><dd>${esc(r.subject || '—')}</dd><dt>Message</dt><dd>${esc(r.message || '—')}</dd></dl>
      <form id="eForm" class="form-grid">
        <div><label for="eSt">Status</label><select id="eSt">${E_STATUS.map((s) => `<option${s === r.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
        <div><label for="eFollow">Follow-up date</label><input id="eFollow" type="date" value="${esc(r.follow_up || '')}"></div>
        <div class="full"><label for="eNotes">Notes</label><textarea id="eNotes" rows="4">${esc(r.notes || '')}</textarea></div>
        <div class="full actions"><button class="btn btn-yellow" type="submit">Save</button><button class="btn btn-danger" type="button" id="eDel">Delete</button></div>
      </form>`);
    $('#eForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await db.from('enquiries').update({ status: $('#eSt').value, follow_up: $('#eFollow').value || null, notes: $('#eNotes').value.trim() || null }).eq('id', r.id);
      if (error) return fail(error);
      toast('Saved'); refreshBadges(); route();
    });
    $('#eDel').addEventListener('click', async () => {
      if (!confirm('Delete this enquiry? This cannot be undone.')) return;
      const { error } = await db.from('enquiries').delete().eq('id', r.id);
      if (error) return fail(error);
      toast('Deleted'); refreshBadges(); route();
    });
  }

  /* ======================================================================
     Subscribers
     ====================================================================== */
  async function subscribers() {
    $('#main').innerHTML = `
      <div class="page-head"><h1>Sign-ins &amp; subscribers</h1>
        <button class="btn btn-ghost btn-sm" type="button" id="sCopy">Copy active emails</button>
        <button class="btn btn-ghost btn-sm" type="button" id="sExport">Export Excel (CSV)</button></div>
      <p class="muted small">Visitors who signed in on the website (email or WhatsApp) or used the "Get special fare alerts" box in the footer.</p>
      <div class="toolbar"><input type="search" id="sSearch" placeholder="Search name, email or number…">
        <select id="sMethod"><option value="">Email &amp; WhatsApp</option><option value="email">Email only</option><option value="whatsapp">WhatsApp only</option></select></div>
      <div class="table-wrap"><table><thead><tr><th>Contact</th><th>Signed up</th><th class="hide-m">Where</th><th>Status</th><th></th></tr></thead>
      <tbody id="sBody"></tbody></table></div>`;
    const { data, error } = await db.from('subscribers').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) throw error;
    const draw = () => {
      const q = $('#sSearch').value.trim().toLowerCase();
      const mth = $('#sMethod').value;
      const rows = data.filter((r) => (!mth || r.method === mth) && (!q || [r.email, r.phone, r.name].join(' ').toLowerCase().includes(q)));
      $('#sBody').innerHTML = rows.length ? rows.map((r) => `<tr data-id="${r.id}"><td><b>${esc(r.email || r.phone || '')}</b>
        <div class="small muted">${r.method === 'whatsapp' ? `💬 <a href="${esc(waLink(r.phone, `Hi${r.name ? ' ' + r.name : ''}, this is Sirpy Air Travels with today's special fares.`))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">WhatsApp</a>` : '✉️ Email'}${r.name ? ' · ' + esc(r.name) : ''}</div></td><td class="nowrap">${esc(when(r.created_at))}</td>
        <td class="hide-m">${esc(r.source)}</td><td>${pill(r.status)}</td>
        <td class="nowrap"><button class="btn btn-ghost btn-sm" data-toggle="${r.id}">${r.status === 'active' ? 'Unsubscribe' : 'Re-activate'}</button></td></tr>`).join('')
        : '<tr><td colspan="5" class="empty">No subscribers yet.</td></tr>';
      $$('[data-toggle]').forEach((b) => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const r = data.find((x) => x.id === b.dataset.toggle);
        const status = r.status === 'active' ? 'unsubscribed' : 'active';
        const { error: err } = await db.from('subscribers').update({ status }).eq('id', r.id);
        if (err) return fail(err);
        r.status = status;
        draw();
      }));
    };
    $('#sSearch').addEventListener('input', draw);
    $('#sMethod').addEventListener('change', draw);
    $('#sExport').addEventListener('click', () => csvDownload('subscribers', data.map(({ id, ...r }) => r)));
    $('#sCopy').addEventListener('click', async () => {
      const list = data.filter((r) => r.status === 'active' && r.email).map((r) => r.email).join(', ');
      try { await navigator.clipboard.writeText(list); toast('Emails copied — paste into Gmail BCC'); } catch { prompt('Copy these emails:', list); }
    });
    draw();
  }

  /* ======================================================================
     Blog posts
     ====================================================================== */
  const CATS = { offer: 'Special Offer', weekly: 'Weekly Fares', tips: 'Travel Tip', news: 'News' };
  const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

  async function posts() {
    const sub = location.hash.split('/')[1];
    if (sub) return postEditor(sub === 'new' ? null : sub);
    $('#main').innerHTML = `
      <div class="page-head"><h1>Blog posts</h1><a class="btn btn-yellow" href="#posts/new">+ New post</a></div>
      <p class="muted small">Published posts show on <a href="/blog" target="_blank" rel="noopener">/blog</a> and the home page "Latest Fare News &amp; Offers" strip.</p>
      <div class="table-wrap"><table><thead><tr><th></th><th>Title</th><th>Category</th><th>Status</th><th class="hide-m">Updated</th></tr></thead><tbody id="pBodyList"></tbody></table></div>`;
    const { data, error } = await db.from('posts').select('id,slug,title,category,status,cover_url,updated_at,published_at').order('updated_at', { ascending: false });
    if (error) throw error;
    $('#pBodyList').innerHTML = data.length ? data.map((p) => `<tr data-id="${p.id}">
      <td>${p.cover_url ? `<img class="thumb" src="${esc(p.cover_url)}" alt="">` : '<span class="thumb"></span>'}</td>
      <td><b>${esc(p.title)}</b><div class="small muted">/post?slug=${esc(p.slug)}</div></td><td>${esc(CATS[p.category])}</td><td>${pill(p.status)}</td>
      <td class="hide-m nowrap">${esc(when(p.updated_at))}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">No posts yet — click <b>+ New post</b>.</td></tr>';
    $$('#pBodyList tr[data-id]').forEach((tr) => tr.addEventListener('click', () => { location.hash = 'posts/' + tr.dataset.id; }));
  }

  async function uploadImage(file) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Use a JPG, PNG, WEBP or GIF image');
    if (file.size > 5 * 1024 * 1024) throw new Error('Image is over 5 MB — please resize it');
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${today().slice(0, 7)}/${Date.now().toString(36)}-${slugify(file.name.replace(/\.\w+$/, '')) || 'image'}.${ext}`;
    const { error } = await db.storage.from('post-images').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    if (error) throw error;
    return db.storage.from('post-images').getPublicUrl(path).data.publicUrl;
  }

  async function postEditor(id) {
    let p = { title: '', slug: '', category: 'offer', excerpt: '', body: '', cover_url: '', status: 'draft' };
    if (id) {
      const { data, error } = await db.from('posts').select('*').eq('id', id).single();
      if (error) throw error;
      p = data;
    }
    let slugTouched = !!p.slug;
    $('#main').innerHTML = `
      <div class="page-head"><h1>${id ? 'Edit post' : 'New post'}</h1>${p.status === 'published' ? `<a class="btn btn-ghost btn-sm" href="/post?slug=${esc(p.slug)}" target="_blank" rel="noopener">View on site</a>` : ''}<a class="btn btn-ghost btn-sm" href="#posts">← All posts</a></div>
      <div class="editor">
        <form class="card" id="postForm" novalidate>
          <div class="form-grid">
            <div class="full"><label for="pTitle">Title</label><input id="pTitle" value="${esc(p.title)}" required maxlength="140" placeholder="Scoot sale: Singapore → Trichy from S$199"></div>
            <div><label for="pSlug">Web address</label><input id="pSlug" value="${esc(p.slug)}" pattern="[a-z0-9-]+" placeholder="scoot-sale-trichy"></div>
            <div><label for="pCat">Category</label><select id="pCat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}"${k === p.category ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="full"><label for="pExcerpt">Short summary (shown on cards)</label><textarea id="pExcerpt" rows="2" maxlength="240">${esc(p.excerpt || '')}</textarea></div>
            <div class="full"><label for="pCover">Cover image</label>
              <div class="toolbar" style="margin:0"><input id="pCover" value="${esc(p.cover_url || '')}" placeholder="https://… or upload →">
              <label class="btn btn-ghost btn-sm" style="margin:0">Upload<input type="file" id="pCoverFile" accept="image/*" hidden></label></div></div>
            <div class="full"><label for="pBody">Post text</label>
              <div class="toolbar" style="margin-bottom:6px">
                <button class="btn btn-ghost btn-sm" type="button" data-md="## ">Heading</button>
                <button class="btn btn-ghost btn-sm" type="button" data-md="**bold**">Bold</button>
                <button class="btn btn-ghost btn-sm" type="button" data-md="- ">List</button>
                <button class="btn btn-ghost btn-sm" type="button" data-md="[Book now](/flights?route=SIN-TRZ)">Link</button>
                <label class="btn btn-ghost btn-sm" style="margin:0">Image<input type="file" id="pImgFile" accept="image/*" hidden></label>
              </div>
              <textarea id="pBody">${esc(p.body || '')}</textarea>
              <p class="md-help">Blank line = new paragraph · ## Heading · **bold** · *italic* · - list item · [link text](https://…) · ![photo](image-url)</p></div>
          </div>
          <div class="actions">
            ${p.status === 'published'
              ? '<button class="btn btn-yellow" type="submit" data-status="published">Update</button><button class="btn btn-ghost" type="submit" data-status="draft">Unpublish (make draft)</button>'
              : '<button class="btn btn-yellow" type="submit" data-status="published">Publish</button><button class="btn btn-ghost" type="submit" data-status="draft">Save draft</button>'}
            ${id ? '<button class="btn btn-danger" type="button" id="pDelete">Delete</button>' : ''}
          </div>
        </form>
        <section class="card preview" aria-label="Preview"><p class="section-title" style="margin-top:0">Preview</p><div id="pPreview"></div></section>
      </div>`;

    const preview = () => {
      const cover = $('#pCover').value.trim();
      $('#pPreview').innerHTML = `${cover ? `<img class="cover" src="${esc(cover)}" alt="">` : ''}
        <span class="pill">${esc(CATS[$('#pCat').value])}</span><h2 style="margin-top:8px">${esc($('#pTitle').value || 'Post title')}</h2>
        ${$('#pExcerpt').value ? `<p class="muted">${esc($('#pExcerpt').value)}</p>` : ''}<div class="body">${window.SirpyMd($('#pBody').value)}</div>`;
    };
    $('#pTitle').addEventListener('input', () => { if (!slugTouched) $('#pSlug').value = slugify($('#pTitle').value); });
    $('#pSlug').addEventListener('input', () => { slugTouched = true; });
    $('#postForm').addEventListener('input', preview);
    preview();

    const insert = (text) => {
      const ta = $('#pBody');
      const [a, b] = [ta.selectionStart, ta.selectionEnd];
      ta.value = ta.value.slice(0, a) + text + ta.value.slice(b);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = a + text.length;
      preview();
    };
    $$('[data-md]').forEach((b) => b.addEventListener('click', () => insert(b.dataset.md)));
    $('#pCoverFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { toast('Uploading…'); $('#pCover').value = await uploadImage(f); preview(); toast('Cover uploaded'); } catch (err) { fail(err); }
      e.target.value = '';
    });
    $('#pImgFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { toast('Uploading…'); insert(`\n\n![${f.name.replace(/\.\w+$/, '')}](${await uploadImage(f)})\n\n`); toast('Image added'); } catch (err) { fail(err); }
      e.target.value = '';
    });

    let wantStatus = 'draft';
    $$('#postForm [data-status]').forEach((b) => b.addEventListener('click', () => { wantStatus = b.dataset.status; }));
    $('#postForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('#pTitle').value.trim();
      const slug = slugify($('#pSlug').value || title);
      if (!title) { $('#pTitle').focus(); return toast('Add a title', true); }
      if (!slug) { $('#pSlug').focus(); return toast('Add a web address', true); }
      const row = {
        title, slug, category: $('#pCat').value, excerpt: $('#pExcerpt').value.trim() || null,
        cover_url: $('#pCover').value.trim() || null, body: $('#pBody').value, status: wantStatus,
        published_at: wantStatus === 'published' ? (p.published_at || new Date().toISOString()) : p.published_at,
        author_email: me.email
      };
      const q = id ? db.from('posts').update(row).eq('id', id).select('id').single() : db.from('posts').insert(row).select('id').single();
      const { data, error } = await q;
      if (error) return fail(/duplicate key/.test(error.message) ? new Error('That web address is already used by another post') : error);
      toast(wantStatus === 'published' ? 'Published — live on the website now' : 'Saved as draft');
      location.hash = 'posts/' + data.id;
      if (id) route();
    });
    if (id) {
      $('#pDelete').addEventListener('click', async () => {
        if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
        const { error } = await db.from('posts').delete().eq('id', id);
        if (error) return fail(error);
        toast('Post deleted');
        location.hash = 'posts';
      });
    }
  }

  /* ======================================================================
     Fares: manual upload
     ====================================================================== */
  const AIRLINE_CODES = {
    'Scoot': 'TR', 'IndiGo': '6E', 'Air India Express': 'IX', 'Air India': 'AI', 'Singapore Airlines': 'SQ',
    'Malaysia Airlines': 'MH', 'AirAsia': 'AK', 'Batik Air': 'OD', 'SriLankan': 'UL', 'Vistara': 'UK'
  };
  const AIRPORTS = ['SIN', 'TRZ', 'MAA', 'CJB'];
  const ROUTES = ['SIN-TRZ', 'TRZ-SIN', 'SIN-MAA', 'MAA-SIN', 'SIN-CJB', 'CJB-SIN'];
  const fetchJson = (url) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const stamp = (d) => (d && (d.generatedAt || (d.updated && d.updated + 'T00:00:00+08:00'))) || '';

  async function currentFares() {
    const [auto, manual] = await Promise.all([
      fetchJson(SIRPY.FARES_URL + '?t=' + Date.now()),
      fetchJson(S.sb.publicFile('site-data', 'fares.json?t=' + Date.now()))
    ]);
    const m = manual && manual.flights ? manual : null;
    const best = m && (!auto || stamp(m) > stamp(auto)) ? m : auto;
    return { auto, manual: m, best };
  }

  /* "10:55 PM" / "22:55" / "12:30 AM+1" -> ["22:55", plusDays] */
  function parseTime(v) {
    const s = String(v || '').trim();
    const plus = /\+(\d)/.exec(s);
    let m = /^(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(s);
    if (m) {
      let h = +m[1] % 12;
      if (m[3].toUpperCase() === 'PM') h += 12;
      return [`${String(h).padStart(2, '0')}:${m[2]}`, plus ? +plus[1] : 0];
    }
    m = /^(\d{1,2}):(\d{2})/.exec(s);
    return m ? [`${m[1].padStart(2, '0')}:${m[2]}`, plus ? +plus[1] : 0] : [null, 0];
  }
  /* Excel serial, Date, 2026-10-20, 20/10/2026, 20 Oct 2026 -> "2026-10-20" */
  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return S.ymd(v);
    if (typeof v === 'number' && v > 40000 && v < 60000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    const s = String(v || '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; // day first (India / Singapore)
    const d = new Date(s);
    return isNaN(d) ? null : S.ymd(d);
  }
  const toMinutes = (d) => {
    const h = /(\d+)\s*hr/.exec(d || ''), m = /(\d+)\s*min/.exec(d || '');
    return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
  };
  function splitCsv(line) {
    const out = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  }
  let xlsxReady;
  const loadXlsx = () => xlsxReady || (xlsxReady = new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX); s.onerror = () => bad(new Error('Could not load the Excel reader'));
    document.head.appendChild(s);
  }));

  /* One file -> list of sheets {name, rows: [[cells]]} */
  async function readTables(file) {
    if (/\.csv$/i.test(file.name)) {
      const text = (await file.text()).replace(/^﻿/, '');
      return [{ name: file.name, rows: text.split(/\r?\n/).filter(Boolean).map(splitCsv) }];
    }
    const XLSX = await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    return wb.SheetNames.map((n) => ({ name: `${file.name} › ${n}`, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
  }
  const routeFromName = (s) => {
    const m = /\b(SIN|TRZ|MAA|CJB)[\s_-]*(?:to|-|_)[\s_-]*(SIN|TRZ|MAA|CJB)\b/i.exec(s);
    return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null;
  };
  /* Same columns as the scraper CSVs: Date, Airline, Origin to Destination,
     Duration, Start Time, End Time, Price (SGD). */
  function tableToFlights(table, problems) {
    const hi = table.rows.findIndex((r) => r.some((c) => /^date$/i.test(String(c).trim())) && r.some((c) => /^airline$/i.test(String(c).trim())));
    if (hi < 0) { problems.push(`${table.name}: no "Date" and "Airline" header row — skipped`); return []; }
    const head = table.rows[hi].map((h) => String(h).trim().toLowerCase());
    const col = (...names) => head.findIndex((h) => names.includes(h));
    const c = {
      date: col('date'), air: col('airline'), od: col('origin to destination', 'route', 'sector'),
      dur: col('duration'), dep: col('start time', 'departure', 'dep'), arr: col('end time', 'arrival', 'arr'), price: col('price', 'price (sgd)', 'fare', 'sgd')
    };
    if (c.dep < 0 || c.arr < 0 || c.price < 0) { problems.push(`${table.name}: needs Start Time, End Time and Price columns — skipped`); return []; }
    const nameRoute = routeFromName(table.name);
    const out = [];
    let bad = 0;
    for (const r of table.rows.slice(hi + 1)) {
      if (!r.some((x) => String(x).trim())) continue;
      const date = parseDate(r[c.date]);
      const route = (c.od >= 0 && routeFromName(String(r[c.od]))) || nameRoute;
      const airline = String(r[c.air] || '').trim();
      const code = AIRLINE_CODES[airline] || Object.entries(AIRLINE_CODES).find(([n]) => airline.startsWith(n))?.[1];
      const [dep] = parseTime(r[c.dep]);
      const [arr, plus] = parseTime(r[c.arr]);
      const price = typeof r[c.price] === 'number' ? r[c.price] : parseFloat(String(r[c.price]).replace(/[^\d.]/g, ''));
      if (!date || !route || !code || !dep || !arr || !price || !AIRPORTS.includes(route[0]) || !AIRPORTS.includes(route[1])) { bad++; continue; }
      out.push([date, route[0], route[1], code, dep, arr, plus, c.dur >= 0 ? toMinutes(String(r[c.dur])) : 0, Math.round(price)]);
    }
    if (bad) problems.push(`${table.name}: ${bad} row(s) could not be read (missing date, route, airline, time or price) — skipped`);
    return out;
  }

  /* Same rules as tools/check-fares.mjs */
  function checkFares(oldRows, newRows) {
    const t = today();
    const up = (rows) => rows.filter((r) => r[0] >= t);
    const countBy = (rows, key) => rows.reduce((m, r) => (m[key(r)] = (m[key(r)] || 0) + 1, m), {});
    const oldF = up(oldRows), newF = up(newRows);
    const routes = countBy(newF, (r) => r[1] + '-' + r[2]);
    const oldAir = countBy(oldF, (r) => r[3]), newAir = countBy(newF, (r) => r[3]);
    const res = [];
    const missing = ROUTES.filter((k) => !routes[k]);
    res.push(missing.length ? ['bad', `No flights for ${missing.join(', ')}`] : ['ok', 'All 6 routes have flights']);
    const gone = Object.keys(oldAir).filter((a) => !newAir[a]);
    if (gone.length > 1) res.push(['bad', `Airlines missing compared with the site now: ${gone.join(', ')}`]);
    else if (gone.length) res.push(['warn', `${gone[0]} is missing (${oldAir[gone[0]]} flights on the site now)`]);
    const kept = oldF.filter((r) => newAir[r[3]]).length;
    if (newF.length < kept * 0.7) res.push(['bad', `Only ${newF.length} flights vs ${kept} on the site for the same airlines (under 70%)`]);
    else res.push(['ok', `${newF.length} upcoming flights (site has ${oldF.length})`]);
    return { res, routes, airlines: newAir, failed: res.some(([k]) => k === 'bad') };
  }

  async function fares() {
    const cur = await currentFares();
    const desc = (d, label) => (d ? `<b>${esc(label)}</b>: ${esc(d.flights.length)} flights, dated ${esc(day(d.updated))}${d.generatedAt ? ` (${esc(when(d.generatedAt))})` : ''}` : `<b>${esc(label)}</b>: none`);
    const log = await db.from('fare_uploads').select('*').order('created_at', { ascending: false }).limit(10);
    $('#main').innerHTML = `
      <div class="page-head"><h1>Fares</h1></div>
      <section class="card">
        <h2>On the website now</h2>
        <ul class="checks">
          <li>${desc(cur.auto, 'Daily automatic update')} ${cur.best === cur.auto ? '<span class="pill st-active">in use</span>' : ''}</li>
          <li>${desc(cur.manual, 'Manual upload')} ${cur.manual && cur.best === cur.manual ? '<span class="pill st-active">in use</span>' : ''}</li>
        </ul>
        <p class="muted small">The website always uses whichever is newer. A manual upload stays in use until the next daily automatic update (6 AM Singapore time).</p>
        ${cur.manual ? '<button class="btn btn-ghost btn-sm" type="button" id="fRevert">Remove manual upload (use automatic fares)</button>' : ''}
      </section>
      <section class="card">
        <h2>Upload fares</h2>
        <p class="muted small">Excel (.xlsx) or CSV files with the columns <b>Date, Airline, Origin to Destination, Duration, Start Time, End Time, Price</b> (SGD, airline fare before our ₹1,000 and baggage) — the same as the scraper files (e.g. <code>flights_SIN_to_TRZ_….csv</code>). Several files at once is fine. Route-days in your files replace those on the site; everything else is kept.</p>
        <label class="drop" id="fDrop"><input type="file" id="fFiles" accept=".csv,.xlsx,.xls" multiple hidden>
          <b>Click to choose files</b> or drop them here</label>
        <div id="fResult"></div>
      </section>
      <section class="card"><h2>Upload history</h2>${log.data && log.data.length ? `<table><tbody>${log.data.map((u) => `<tr><td class="nowrap">${esc(when(u.created_at))}</td><td>${esc(u.uploaded_by || '')}</td>
        <td>${esc(u.flights)} flights · ${esc(day(u.date_from))} – ${esc(day(u.date_to))}<div class="small muted">${esc((u.file_names || []).join(', '))}</div></td></tr>`).join('')}</tbody></table>` : '<p class="muted">No manual uploads yet.</p>'}</section>`;

    if (cur.manual) $('#fRevert').addEventListener('click', async () => {
      if (!confirm('Remove the manual fares? The website goes back to the daily automatic fares.')) return;
      const { error } = await db.storage.from('site-data').remove(['fares.json']);
      if (error) return fail(error);
      toast('Manual fares removed'); route();
    });

    const drop = $('#fDrop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files], cur));
    $('#fFiles').addEventListener('change', (e) => handleFiles([...e.target.files], cur));
  }

  async function handleFiles(files, cur) {
    if (!files.length) return;
    const box = $('#fResult');
    box.innerHTML = '<p class="muted">Reading files…</p>';
    const problems = [];
    let rows = [];
    try {
      for (const f of files) for (const t of await readTables(f)) rows = rows.concat(tableToFlights(t, problems));
    } catch (e) { box.innerHTML = ''; return fail(e); }
    if (!rows.length) {
      box.innerHTML = `<ul class="checks">${problems.map((p) => `<li class="bad">${esc(p)}</li>`).join('')}<li class="bad">No flights found in these files.</li></ul>`;
      return;
    }
    /* Merge: uploaded route-days replace the site's; the rest is kept. */
    const base = (cur.best && cur.best.flights) || [];
    const covered = new Set(rows.map((r) => `${r[0]}|${r[1]}|${r[2]}`));
    const map = new Map();
    for (const r of base) if (!covered.has(`${r[0]}|${r[1]}|${r[2]}`)) map.set(`${r[0]}|${r[1]}|${r[2]}|${r[3]}|${r[4]}`, r);
    for (const r of rows) map.set(`${r[0]}|${r[1]}|${r[2]}|${r[3]}|${r[4]}`, r);
    const t = today();
    const merged = [...map.values()].filter((r) => r[0] >= t).sort((a, b) =>
      a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[4].localeCompare(b[4]));
    const check = checkFares(base, merged);
    const dates = rows.map((r) => r[0]).sort();
    const names = Object.fromEntries(Object.entries(AIRLINE_CODES).map(([n, c]) => [c, n]));
    box.innerHTML = `
      <div class="section-title">Preview</div>
      <p>Read <b>${rows.length}</b> flights from ${files.length} file(s), ${esc(day(dates[0]))} – ${esc(day(dates.at(-1)))}. After merging, the site will have <b>${merged.length}</b> upcoming flights.</p>
      <div class="grid-2">
        <table><thead><tr><th>Route</th><th>Flights</th></tr></thead><tbody>${ROUTES.map((k) => `<tr><td>${k}</td><td>${check.routes[k] || 0}</td></tr>`).join('')}</tbody></table>
        <table><thead><tr><th>Airline</th><th>Flights</th></tr></thead><tbody>${Object.entries(check.airlines).map(([c, n]) => `<tr><td>${esc(names[c] || c)}</td><td>${n}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="section-title">Checks</div>
      <ul class="checks">${check.res.map(([k, m]) => `<li class="${k}">${k === 'ok' ? '✓' : k === 'warn' ? '⚠' : '✕'} ${esc(m)}</li>`).join('')}
        ${problems.map((p) => `<li class="warn">⚠ ${esc(p)}</li>`).join('')}</ul>
      ${check.failed ? '<label class="small"><input type="checkbox" id="fForce" style="width:auto"> Publish anyway — I checked the files</label>' : ''}
      <div class="actions"><button class="btn btn-yellow" type="button" id="fPublish"${check.failed ? ' disabled' : ''}>Publish to website</button></div>`;
    if (check.failed) $('#fForce').addEventListener('change', (e) => { $('#fPublish').disabled = !e.target.checked; });
    $('#fPublish').addEventListener('click', async () => {
      const btn = $('#fPublish');
      btn.disabled = true;
      btn.textContent = 'Publishing…';
      const used = new Set(merged.map((r) => r[3]));
      const data = {
        updated: today(), generatedAt: new Date().toISOString(), source: `Manual upload by ${me.email}`, currency: 'SGD',
        fields: ['date', 'from', 'to', 'airline', 'dep', 'arr', 'arrDayOffset', 'durationMin', 'priceSGD'],
        airlines: Object.fromEntries(Object.entries(names).filter(([c]) => used.has(c))),
        flights: merged
      };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const { error } = await db.storage.from('site-data').upload('fares.json', blob, { upsert: true, contentType: 'application/json', cacheControl: '60' });
      if (error) { btn.disabled = false; btn.textContent = 'Publish to website'; return fail(error); }
      await db.from('fare_uploads').insert({
        uploaded_by: me.email, file_names: files.map((f) => f.name).slice(0, 20), flights: merged.length,
        date_from: merged[0] && merged[0][0], date_to: merged.at(-1) && merged.at(-1)[0], airlines: check.airlines
      });
      toast('Fares published — the website uses them within a minute');
      route();
    });
  }
})();
