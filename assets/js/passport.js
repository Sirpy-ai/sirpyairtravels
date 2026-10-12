/* ==========================================================================
   Passport Fetcher — reads a passport photo in the browser and helps fill
   the traveller form (/book).

   • The photo is read on this computer (tesseract.js, loaded on first use).
     It is never uploaded or saved.
   • The machine-readable zone (the two lines of <<< at the bottom of the
     photo page) gives name, passport number, nationality, date of birth,
     sex and expiry. Check digits show which values are reliable.
   • Values appear as faint watermarks inside the empty fields: type over
     them, or press Fill auto. Confirm locks the values; Recheck reads the
     photo again and shows any differences.
   Needs booking.js (the Fetcher panel is part of each traveller block).
   ========================================================================== */
(function () {
  'use strict';

  const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const NATION = { IND: 'Indian', SGP: 'Singaporean', MYS: 'Malaysian', LKA: 'Sri Lankan' };
  const MRZ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
  const FIX = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };

  /* ---------- reader (loaded once) ---------- */
  let libPromise, workerPromise;
  function loadLib() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!libPromise) {
      libPromise = new Promise((ok, bad) => {
        const s = document.createElement('script');
        s.src = TESS_URL;
        s.onload = () => ok(window.Tesseract);
        s.onerror = () => { libPromise = null; bad(new Error('Could not load the reader. Check the internet connection and try again.')); };
        document.head.appendChild(s);
      });
    }
    return libPromise;
  }
  function getWorker(say) {
    if (!workerPromise) {
      say('Loading the reader (first time only, about 10 MB)…');
      workerPromise = loadLib().then((T) => T.createWorker('eng')).catch((e) => { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  function loadImage(file) {
    return new Promise((ok, bad) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(img.src); ok(img); };
      img.onerror = () => bad(new Error('That file is not an image. Use a JPG, PNG or photo of the passport.'));
      img.src = URL.createObjectURL(file);
    });
  }
  /* Whole photo, or only its bottom part (where the MRZ lines are), greyscale and enlarged. */
  function canvasFrom(img, fromTop) {
    const sy = Math.floor(img.naturalHeight * fromTop);
    const sh = img.naturalHeight - sy;
    const w = img.naturalWidth;
    const target = Math.min(2400, Math.max(w, 1200));
    const scale = target / w;
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(sh * scale);
    const ctx = c.getContext('2d');
    ctx.filter = 'grayscale(1) contrast(1.4)';
    ctx.drawImage(img, 0, sy, w, sh, 0, 0, c.width, c.height);
    return c;
  }

  /* ---------- MRZ (ICAO 9303, TD3 passports: two lines of 44 characters) ---------- */
  function mrzLines(text) {
    const cands = String(text || '').split(/\r?\n/)
      .map((l) => l.toUpperCase().replace(/[^A-Z0-9<]/g, ''))
      .filter((l) => l.length >= 30 && l.includes('<'));
    if (cands.length < 2) return null;
    const pad = (l) => (l + '<'.repeat(44)).slice(0, 44);
    return cands.slice(-2).map(pad);
  }
  const digitsOnly = (s) => s.replace(/[A-Z]/g, (c) => FIX[c] || c);
  const cval = (ch) => (ch === '<' ? 0 : /\d/.test(ch) ? +ch : ch.charCodeAt(0) - 55);
  const checkDigit = (s) => [...s].reduce((t, ch, i) => t + cval(ch) * [7, 3, 1][i % 3], 0) % 10;
  const isDigitAt = (ch, expected) => +digitsOnly(ch || '') === expected;

  function parseMrz([l1, l2]) {
    const out = { checks: {} };
    const names = l1.slice(5).split('<<');
    out.last = names[0].replace(/</g, ' ').replace(/\s+/g, ' ').trim();
    out.first = (names[1] || '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();

    const pno = l2.slice(0, 9);
    out.passport = pno.replace(/</g, '');
    out.checks.passport = isDigitAt(l2[9], checkDigit(pno));

    out.nationality = NATION[l2.slice(10, 13).replace(/</g, '')] || 'Other';

    const dob = digitsOnly(l2.slice(13, 19));
    const cy = new Date().getFullYear() % 100;
    const yy = +dob.slice(0, 2);
    out.dob = `${yy > cy ? '19' : '20'}${dob.slice(0, 2)}-${dob.slice(2, 4)}-${dob.slice(4, 6)}`;
    out.checks.dob = isDigitAt(l2[19], checkDigit(dob));

    out.gender = { M: 'Male', F: 'Female' }[l2[20]] || '';

    const exp = digitsOnly(l2.slice(21, 27));
    out.expiry = `20${exp.slice(0, 2)}-${exp.slice(2, 4)}-${exp.slice(4, 6)}`;
    out.checks.expiry = isDigitAt(l2[27], checkDigit(exp));
    return out;
  }

  async function readPassport(file, say) {
    const img = await loadImage(file);
    const w = await getWorker(say);
    say('Reading the photo…');
    let lines = mrzLines((await w.recognize(canvasFrom(img, 0))).data.text);
    if (!lines) {
      say('Reading the bottom lines…');
      await w.setParameters({ tessedit_char_whitelist: MRZ_CHARS, tessedit_pageseg_mode: '6' });
      lines = mrzLines((await w.recognize(canvasFrom(img, 0.6))).data.text);
      await w.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '3' });
    }
    if (!lines) throw new Error('Could not find the lines at the bottom of the passport. Use a straight, sharp photo of the photo page, or type the details.');
    return parseMrz(lines);
  }

  /* ---------- the traveller block ---------- */
  const block = (el) => el.closest('.pax-block');
  const field = (b, name) => b.querySelector(`[name=${name}]`);
  const LABELS = { last: 'Surname', first: 'Given names', passport: 'Passport no.', nationality: 'Nationality', gender: 'Sex', dob: 'Date of birth', expiry: 'Expiry' };

  function setValue(el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function ensureOption(sel, v) {
    if (![...sel.options].some((o) => o.value === v)) sel.add(new Option(v, v));
  }
  /* Trace: the read value sits faintly behind the box. Typing matches it letter by letter,
     so the rest of the value stays visible as a guide. Can be switched off. */
  function traceWrap(el) {
    if (el.parentElement.classList.contains('pf-wrap')) return el.parentElement;
    const w = document.createElement('span');
    w.className = 'pf-wrap';
    el.before(w);
    const tr = document.createElement('span');
    tr.className = 'pf-trace';
    tr.setAttribute('aria-hidden', 'true');
    w.append(tr, el);
    el.classList.add('pf-input');
    const cs = getComputedStyle(el);
    tr.style.font = cs.font;
    tr.style.padding = cs.padding;
    tr.style.lineHeight = cs.lineHeight;
    tr.style.letterSpacing = cs.letterSpacing;
    return w;
  }
  function updateTrace(el) {
    const w = traceWrap(el);
    const tr = w.querySelector('.pf-trace');
    const sug = el.dataset.trace || '';
    const typed = el.value || '';
    if (!sug || !sug.toUpperCase().startsWith(typed.toUpperCase())) { tr.textContent = ''; return; }
    tr.innerHTML = `<span class="pf-typed">${escapeHtml(typed)}</span>${escapeHtml(sug.slice(typed.length))}`;
  }
  function watermark(b, read) {
    ['first', 'last', 'passport'].forEach((n) => {
      const el = field(b, n);
      if (!el) return;
      el.dataset.trace = read[n] || '';
      updateTrace(el);
    });
  }
  /* Adults: Mr / Ms (female). Children and infants: Mstr / Miss. Sets the title from the passport sex. */
  function setTitleFromGender(b, gender) {
    const t = field(b, 'title');
    if (!t || !gender) return;
    const child = b.dataset.type !== 'Adult';
    const want = gender === 'Male' ? (child ? 'Mstr' : 'Mr') : (child ? 'Miss' : 'Ms');
    if ([...t.options].some((o) => o.value === want) && t.value !== want) setValue(t, want);
  }
  function summary(b, read, shown) {
    const box = b.querySelector('.pf-read');
    const rows = ['last', 'first', 'passport', 'nationality', 'gender', 'dob', 'expiry'].map((k) => {
      const v = read[k] || '—';
      const check = read.checks[k];
      const mark = check === undefined ? '' : check ? ' <span class="pf-ok-mark">✓ check digit OK</span>' : ' <span class="pf-bad-mark">⚠ check digit failed — look again</span>';
      const cur = field(b, k === 'gender' || k === 'nationality' ? k : k);
      const have = cur ? cur.value : '';
      const diff = shown && have && read[k] && have.toUpperCase() !== String(read[k]).toUpperCase() && k !== 'gender' && k !== 'nationality'
        ? ` <span class="pf-diff">· form has "${escapeHtml(have)}"</span>` : '';
      return `<dt>${LABELS[k]}</dt><dd>${escapeHtml(v)}${mark}${diff}</dd>`;
    });
    box.innerHTML = rows.join('');
    box.hidden = false;
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function setStatus(b, msg, bad) {
    const s = b.querySelector('.pf-status');
    s.textContent = msg;
    s.classList.toggle('bad', !!bad);
  }
  function showActions(b, { fill, confirm, recheck }) {
    b.querySelector('[data-pf-fill]').hidden = !fill;
    b.querySelector('[data-pf-confirm]').hidden = !confirm;
    b.querySelector('[data-pf-recheck]').hidden = !recheck;
  }

  async function run(b, file, mode) {
    const st = (b._pf = b._pf || {});
    setStatus(b, 'Reading passport…');
    showActions(b, {});
    try {
      const read = await readPassport(file, (m) => setStatus(b, m));
      st.read = read;
      st.confirmed = null;
      watermark(b, read);
      setTitleFromGender(b, read.gender);
      summary(b, read, mode === 'recheck');
      const missing = ['first', 'last', 'passport', 'dob', 'expiry'].filter((k) => !read[k]);
      const bad = Object.entries(read.checks).filter(([, ok]) => !ok).map(([k]) => LABELS[k].toLowerCase());
      if (mode === 'recheck') {
        setStatus(b, bad.length ? `Read again. Check: ${bad.join(', ')}.` : 'Read again. Compared with the form below.', !!bad.length);
      } else {
        setStatus(b, bad.length
          ? `Read, but ${bad.join(', ')} may be wrong. Check it against the passport before you confirm.`
          : 'Read. Type over the faint values, or press Fill auto.', !!bad.length || missing.length > 0);
      }
      showActions(b, { fill: true, confirm: true, recheck: !!st.confirmed });
    } catch (e) {
      st.read = null;
      setStatus(b, e.message || 'Could not read the passport.', true);
      showActions(b, {});
    }
  }

  document.addEventListener('change', (e) => {
    const input = e.target.closest && e.target.closest('[data-pf-file]');
    if (!input || !input.files[0]) return;
    const b = block(input);
    b._pf = { file: input.files[0] };
    b.querySelector('.pf-body').hidden = false;
    run(b, input.files[0], 'read');
    input.value = '';
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('button');
    if (!t) return;
    if (t.classList.contains('pf-open')) {
      const body = t.parentElement.querySelector('.pf-body');
      body.hidden = !body.hidden;
      t.setAttribute('aria-expanded', String(!body.hidden));
      return;
    }
    if (!t.matches('[data-pf-fill],[data-pf-confirm],[data-pf-recheck]')) return;
    const b = block(t);
    const st = b._pf || {};

    if (t.hasAttribute('data-pf-fill')) {
      if (!st.read) return;
      const r = st.read;
      let filled = 0;
      ['first', 'last', 'passport', 'dob', 'expiry'].forEach((k) => {
        const el = field(b, k);
        if (el && r[k] && !el.value) { setValue(el, r[k]); filled++; }
      });
      const nat = field(b, 'nationality');
      if (nat && r.nationality) { ensureOption(nat, r.nationality); if (!nat.dataset.touched) setValue(nat, r.nationality); }
      const g = field(b, 'gender');
      if (g && r.gender && g.value !== r.gender) { ensureOption(g, r.gender); setValue(g, r.gender); }
      setTitleFromGender(b, r.gender);
      watermark(b, r);
      setStatus(b, filled ? `Filled ${filled} field(s). Check them, then press Confirm.` : 'Nothing to fill: the fields already have values. Use Recheck to compare.');
      return;
    }

    if (t.hasAttribute('data-pf-confirm')) {
      if (!st.read) return;
      const snap = {};
      ['first', 'last', 'passport', 'nationality', 'gender', 'dob', 'expiry'].forEach((k) => {
        const el = field(b, k);
        if (el) snap[k] = el.value;
        if (el) el.classList.add('pf-ok');
      });
      st.confirmed = snap;
      setStatus(b, 'Confirmed. Press Recheck to read the photo again and compare.');
      showActions(b, { fill: false, confirm: false, recheck: true });
      return;
    }

    if (t.hasAttribute('data-pf-recheck')) {
      if (!st.file) return;
      run(b, st.file, 'recheck');
    }
  });

  /* Typing updates the trace. */
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.classList && el.classList.contains('pf-input') && el.dataset.trace !== undefined) updateTrace(el);
    if (el.matches && el.matches('select[name=nationality]')) el.dataset.touched = '1';
  });

  /* Trace on/off, remembered on this computer. */
  const TRACE_KEY = 'pf_trace';
  function applyTraceSetting(on) {
    document.body.classList.toggle('pf-trace-off', !on);
    document.querySelectorAll("[data-pf-trace-toggle]").forEach((c) => { c.checked = on; });
  }
  let traceOn = true;
  try { traceOn = localStorage.getItem(TRACE_KEY) !== 'off'; } catch { /* private mode */ }
  applyTraceSetting(traceOn);
  document.addEventListener('change', (e) => {
    if (!e.target.matches || !e.target.matches('[data-pf-trace-toggle]')) return;
    applyTraceSetting(e.target.checked);
    try { localStorage.setItem(TRACE_KEY, e.target.checked ? 'on' : 'off'); } catch { /* ignore */ }
  });
})();
