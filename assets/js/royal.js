/* ==========================================================================
   Sirpy Air Travels — Royal Theme behaviour
   Vanilla ES2019+, no dependencies. Every block guards for a missing element
   so the same file can be shared by every page.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Shared constants ---------- */
  var WA_NUMBER = '919344020864';
  var PHONE_TRICHY = '+919344020864';

  /** Build a wa.me deep link with a pre-filled enquiry message. */
  function waLink(message) {
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(message);
  }
  window.sirpyWaLink = waLink;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* ---------- Focus trapping ---------- */
  var FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

  function trapFocus(container, event) {
    var items = $$(FOCUSABLE, container).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---------- Body scroll lock (reference counted) ---------- */
  var lockCount = 0;
  function lockScroll() {
    if (lockCount === 0) {
      var bar = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (bar > 0) document.body.style.paddingRight = bar + 'px';
    }
    lockCount++;
  }
  function unlockScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  }

  /* ---------- 1. Header: compact on scroll, measure panel offset ---------- */
  function initHeader() {
    var header = $('.site-header');
    if (!header) return;

    function measure() {
      var rect = header.getBoundingClientRect();
      document.documentElement.style.setProperty('--panel-top', Math.max(0, rect.bottom) + 'px');
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        header.classList.toggle('is-compact', window.scrollY > 90);
        measure();
        ticking = false;
      });
    }

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
  }

  /* ---------- 2. Tours side flyout ----------
     Opens sideways from the left edge on hover (desktop) or tap (touch).
     Deliberately not a downward dropdown. */
  var TOUR_CATEGORIES = [
    {
      id: 'domestic',
      name: 'Domestic Tours',
      blurb: 'Kashmir houseboats, Kerala backwaters, Himachal hills and Golden Triangle circuits across India.',
      tags: ['Kashmir', 'Kerala', 'Rajasthan', 'Himachal'],
      img: 'https://images.unsplash.com/photo-1598091383021-15ddea10925d?auto=format&fit=crop&w=520&q=72',
      href: '/tours#domestic',
      enquiry: 'Hi Sirpy Air Travels, I would like details on your Domestic (India) tour packages.'
    },
    {
      id: 'international',
      name: 'International Tours',
      blurb: 'Singapore, Malaysia, Thailand, Bali and Dubai holidays with visas, hotels and transfers handled.',
      tags: ['Singapore', 'Malaysia', 'Bali', 'Dubai'],
      img: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=520&q=72',
      href: '/tours#international',
      enquiry: 'Hi Sirpy Air Travels, I would like details on your International tour packages.'
    },
    {
      id: 'pilgrimage',
      name: 'Temple & Pilgrimage',
      blurb: 'Srirangam, Tanjore, Madurai and Rameshwaram trails with special darshan and archana support.',
      tags: ['Madurai', 'Rameshwaram', 'Tanjore', 'Trichy'],
      img: 'https://images.unsplash.com/photo-1609946727707-42284ec66453?auto=format&fit=crop&w=520&q=72',
      href: '/tours#pilgrimage',
      enquiry: 'Hi Sirpy Air Travels, I would like details on your Temple & Pilgrimage tour packages.'
    },
    {
      id: 'cruise',
      name: 'Cruise Holidays',
      blurb: 'Domestic and international cruise reservations, cabin upgrades and shore excursion planning.',
      tags: ['Singapore Sailings', 'Cabin Upgrades', 'Shore Tours'],
      img: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=520&q=72',
      href: '/tours#cruise',
      enquiry: 'Hi Sirpy Air Travels, I would like details on your Cruise booking packages.'
    },
    {
      id: 'honeymoon',
      name: 'Honeymoon Escapes',
      blurb: 'Private pool villas, floating breakfasts and island excursions curated for newly-weds.',
      tags: ['Bali', 'Maldives', 'Pool Villas'],
      img: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=520&q=72',
      href: '/tours#honeymoon',
      enquiry: 'Hi Sirpy Air Travels, I would like details on your Honeymoon tour packages.'
    },
    {
      id: 'group',
      name: 'Group & Corporate',
      blurb: 'Bulk fares from 10 passengers, temple groups, MICE travel and corporate offsite planning.',
      tags: ['10+ Pax', 'Bulk Fares', 'MICE'],
      img: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=520&q=72',
      href: '/tours#group',
      enquiry: 'Hi Sirpy Air Travels, I would like a quote for a Group / Corporate booking.'
    }
  ];

  function initToursPanel() {
    var panel = $('#toursPanel');
    var trigger = $('#toursTrigger');
    if (!panel) return;

    var list = $('#toursList', panel);
    var preview = $('#toursPreview', panel);
    var closeBtn = $('.panel-close', panel);
    var scrim = $('#scrim');
    var drawerTrigger = $('#drawerToursTrigger');
    var openTimer = null;
    var closeTimer = null;
    var lastFocus = null;

    /* Build the category list once */
    TOUR_CATEGORIES.forEach(function (cat, i) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tours-item' + (i === 0 ? ' is-active' : '');
      btn.dataset.cat = cat.id;
      btn.innerHTML =
        '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
        '<path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>' +
        '<span>' + cat.name + '</span>' +
        '<svg class="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      btn.addEventListener('mouseenter', function () { showCategory(cat.id); });
      btn.addEventListener('focus', function () { showCategory(cat.id); });
      btn.addEventListener('click', function () {
        showCategory(cat.id);
        window.location.href = cat.href;
      });
      li.appendChild(btn);
      list.appendChild(li);
    });

    function showCategory(id) {
      var cat = TOUR_CATEGORIES.filter(function (c) { return c.id === id; })[0];
      if (!cat) return;
      $$('.tours-item', list).forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.cat === id);
      });
      preview.innerHTML =
        '<article class="tours-preview-card">' +
        '<img src="' + cat.img + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' +
        '<h3>' + cat.name + '</h3>' +
        '<p>' + cat.blurb + '</p>' +
        '<div class="tours-preview-tags">' +
        cat.tags.map(function (t) { return '<span>' + t + '</span>'; }).join('') +
        '</div>' +
        '<div class="tours-preview-actions">' +
        '<a class="btn btn-wa btn-sm" href="' + waLink(cat.enquiry) + '" target="_blank" rel="noopener">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-2.9-1.3-4.8-4.3-5-4.5-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2 1.3.3.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l2 .9c.2.1.4.2.4.3.1.2.1.7 0 1.3z"/></svg>' +
        'Enquire on WhatsApp</a>' +
        '<a class="btn btn-outline btn-sm" href="' + cat.href + '">View packages</a>' +
        '</div></article>';
    }

    function open() {
      window.clearTimeout(closeTimer);
      if (panel.classList.contains('is-open')) return;
      lastFocus = document.activeElement;
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      if (scrim) scrim.classList.add('is-open');
    }

    function close(restoreFocus) {
      window.clearTimeout(openTimer);
      if (!panel.classList.contains('is-open')) return;
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (scrim && !document.body.classList.contains('drawer-open')) scrim.classList.remove('is-open');
      if (restoreFocus && lastFocus && lastFocus.focus) lastFocus.focus();
    }

    panel.close = close;
    panel.openPanel = open;

    /* Hover with a short intent delay; pointer-based so touch never fires it */
    if (trigger) {
      trigger.addEventListener('pointerenter', function (e) {
        if (e.pointerType === 'touch') return;
        openTimer = window.setTimeout(open, 120);
      });
      trigger.addEventListener('pointerleave', function (e) {
        if (e.pointerType === 'touch') return;
        window.clearTimeout(openTimer);
        closeTimer = window.setTimeout(function () { close(false); }, 260);
      });
      /* Tap / click / Enter toggles — the only path on touch devices */
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        if (panel.classList.contains('is-open')) close(true); else open();
      });
    }

    panel.addEventListener('pointerenter', function () { window.clearTimeout(closeTimer); });
    panel.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'touch') return;
      closeTimer = window.setTimeout(function () { close(false); }, 260);
    });

    if (closeBtn) closeBtn.addEventListener('click', function () { close(true); });
    if (scrim) scrim.addEventListener('click', function () { close(false); });

    if (drawerTrigger) {
      drawerTrigger.addEventListener('click', function () {
        var drawer = $('#drawer');
        if (drawer && drawer.closeDrawer) drawer.closeDrawer(false);
        window.setTimeout(open, 180);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (!panel.classList.contains('is-open')) return;
      if (e.key === 'Escape') { close(true); return; }
      if (e.key === 'Tab' && panel.contains(document.activeElement)) trapFocus(panel, e);
    });

    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('is-open')) return;
      if (panel.contains(e.target) || (trigger && trigger.contains(e.target))) return;
      close(false);
    });

    showCategory(TOUR_CATEGORIES[0].id);
  }

  /* ---------- 3. Mobile drawer ---------- */
  function initDrawer() {
    var drawer = $('#drawer');
    var burger = $('#burger');
    var scrim = $('#scrim');
    if (!drawer || !burger) return;
    var closeBtn = $('.panel-close', drawer);
    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      burger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('drawer-open');
      if (scrim) scrim.classList.add('is-open');
      lockScroll();
      var first = $(FOCUSABLE, drawer);
      if (first) first.focus();
    }

    function close(restoreFocus) {
      if (!drawer.classList.contains('is-open')) return;
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      burger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('drawer-open');
      if (scrim) scrim.classList.remove('is-open');
      unlockScroll();
      if (restoreFocus && lastFocus && lastFocus.focus) lastFocus.focus();
    }

    drawer.closeDrawer = close;

    burger.addEventListener('click', function () {
      if (drawer.classList.contains('is-open')) close(true); else open();
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { close(true); });
    if (scrim) scrim.addEventListener('click', function () { close(false); });
    $$('a', drawer).forEach(function (a) {
      a.addEventListener('click', function () { close(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (!drawer.classList.contains('is-open')) return;
      if (e.key === 'Escape') { close(true); return; }
      if (e.key === 'Tab') trapFocus(drawer, e);
    });

    /* Leaving the mobile breakpoint should not strand an open drawer */
    window.matchMedia('(min-width: 1025px)').addEventListener('change', function (e) {
      if (e.matches) close(false);
    });
  }

  /* ---------- 4. Language switcher ---------- */
  function initLang() {
    var lang = $('#langSwitch');
    if (!lang) return;
    var btn = $('.lang-btn', lang);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = lang.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', function (e) {
      if (lang.contains(e.target)) return;
      lang.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      lang.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  /* ---------- 5. Hero banner slider ---------- */
  function initSlider() {
    var slider = $('#heroSlider');
    if (!slider) return;
    var slides = $$('.slide', slider);
    var dotsWrap = $('#sliderDots');
    var prev = $('.slider-arrow.prev', slider);
    var next = $('.slider-arrow.next', slider);
    if (slides.length < 2) return;

    var index = 0;
    var timer = null;
    var DELAY = 5000;

    var dots = slides.map(function (slide, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Show banner ' + (i + 1) + ' of ' + slides.length);
      b.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () { go(i); restart(); });
      li.appendChild(b);
      dotsWrap.appendChild(li);
      return b;
    });

    function go(n) {
      index = (n + slides.length) % slides.length;
      slides.forEach(function (s, i) {
        var active = i === index;
        s.classList.toggle('is-active', active);
        s.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach(function (d, i) {
        d.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
    }

    function start() {
      if (reduceMotion.matches) return;
      timer = window.setInterval(function () { go(index + 1); }, DELAY);
    }
    function stop() { window.clearInterval(timer); }
    function restart() { stop(); start(); }

    if (prev) prev.addEventListener('click', function () { go(index - 1); restart(); });
    if (next) next.addEventListener('click', function () { go(index + 1); restart(); });

    slider.addEventListener('pointerenter', stop);
    slider.addEventListener('pointerleave', start);
    slider.addEventListener('focusin', stop);
    slider.addEventListener('focusout', start);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else restart();
    });

    /* Swipe — only commits past 45px so taps still open the WhatsApp link */
    var startX = 0, startY = 0, tracking = false;
    slider.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      startX = e.clientX; startY = e.clientY; tracking = true;
    }, { passive: true });
    slider.addEventListener('pointerup', function (e) {
      if (!tracking) return;
      tracking = false;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      e.preventDefault();
      go(index + (dx < 0 ? 1 : -1));
      restart();
    });
    slider.addEventListener('pointercancel', function () { tracking = false; });

    /* Arrow keys when the slider has focus */
    slider.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { go(index - 1); restart(); }
      if (e.key === 'ArrowRight') { go(index + 1); restart(); }
    });

    go(0);
    start();
    reduceMotion.addEventListener('change', function () { stop(); start(); });
  }

  /* ---------- 6. Enquiry / newsletter forms -> WhatsApp ---------- */
  function initForms() {
    $$('form[data-wa-form]').forEach(function (form) {
      var status = $('.form-status', form);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!form.reportValidity()) return;

        var data = new FormData(form);
        var lines = [form.dataset.waIntro || 'New enquiry from the Sirpy Air Travels website:'];
        $$('[name]', form).forEach(function (el) {
          var value = (data.get(el.name) || '').toString().trim();
          if (!value) return;
          var label = el.dataset.waLabel || el.name;
          lines.push(label + ': ' + value);
        });

        if (status) {
          status.classList.add('is-shown');
          status.querySelector('.msg').textContent = 'Thank you! Opening WhatsApp so you can send this to our team…';
        }

        var url = waLink(lines.join('\n'));
        window.setTimeout(function () {
          window.open(url, '_blank', 'noopener');
          form.reset();
          if (status) {
            window.setTimeout(function () { status.classList.remove('is-shown'); }, 6000);
          }
        }, 500);
      });
    });
  }

  /* ---------- 7. Special-offer pop-up ---------- */
  function initOfferModal() {
    var modal = $('#offerModal');
    if (!modal) return;
    var STORAGE_KEY = 'sirpy.offerDismissedAt';
    var SUPPRESS_MS = 24 * 60 * 60 * 1000;
    var DELAY = 3500;
    var lastFocus = null;

    function dismissedRecently() {
      try {
        var at = window.localStorage.getItem(STORAGE_KEY);
        return !!at && (Date.now() - Number(at)) < SUPPRESS_MS;
      } catch (err) {
        return false; /* private mode — just show it */
      }
    }

    function remember() {
      try { window.localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (err) { /* ignore */ }
    }

    function open() {
      lastFocus = document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      lockScroll();
      var target = $('.modal-close', modal);
      if (target) target.focus();
    }

    function close() {
      if (!modal.classList.contains('is-open')) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      unlockScroll();
      remember();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    $$('[data-modal-close]', modal).forEach(function (el) {
      el.addEventListener('click', close);
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    document.addEventListener('keydown', function (e) {
      if (!modal.classList.contains('is-open')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') trapFocus(modal, e);
    });
    /* Booking through the offer also counts as handled */
    var book = $('[data-modal-book]', modal);
    if (book) book.addEventListener('click', function () { window.setTimeout(close, 120); });

    /* Any page can re-open it, e.g. the "View today's offer" button */
    $$('[data-open-offer]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); open(); });
    });

    if (!dismissedRecently()) window.setTimeout(open, DELAY);
  }

  /* ---------- 8. Visitor counter ----------
     A static site has no server, so this is an honest per-browser visit count
     shown over a seeded launch figure. It is labelled as such in the footer. */
  function initCounter() {
    var el = $('#hitCounter');
    if (!el) return;
    var SEED = 48213;
    var KEY = 'sirpy.visits';
    var count = SEED;
    try {
      var stored = Number(window.localStorage.getItem(KEY) || 0);
      var sessionKey = 'sirpy.counted';
      if (!window.sessionStorage.getItem(sessionKey)) {
        stored += 1;
        window.localStorage.setItem(KEY, String(stored));
        window.sessionStorage.setItem(sessionKey, '1');
      }
      count = SEED + stored;
    } catch (err) { /* storage blocked — show the seed */ }

    el.innerHTML = String(count).split('').map(function (d) {
      return '<i>' + d + '</i>';
    }).join('');
  }

  /* ---------- 9. Package filters (tours page) ---------- */
  function initFilters() {
    var bar = $('#pkgFilters');
    if (!bar) return;
    var cards = $$('[data-category]');
    var empty = $('#pkgEmpty');

    $$('.filter', bar).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var want = btn.dataset.filter;
        $$('.filter', bar).forEach(function (b) {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        var shown = 0;
        cards.forEach(function (card) {
          var match = want === 'all' || card.dataset.category === want;
          card.hidden = !match;
          if (match) shown++;
        });
        if (empty) empty.hidden = shown > 0;
      });
    });

    /* Deep links like tours.html#pilgrimage pre-select a filter. This also
       has to run on hashchange: following such a link while already on this
       page updates the hash without reloading, so boot alone would miss it. */
    function applyHash() {
      var hash = window.location.hash.replace('#', '');
      if (!hash) return;
      var match = $('.filter[data-filter="' + hash + '"]', bar);
      if (match) match.click();
    }

    window.addEventListener('hashchange', applyHash);
    applyHash();
  }

  /* ---------- 10. Small helpers ---------- */
  function initMisc() {
    $$('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });

    /* Mark the current page in the nav (clean, extensionless URLs) */
    var path = window.location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    if (path.length > 1) path = path.replace(/\/$/, '');
    $$('.nav-link[href]').forEach(function (a) {
      var href = (a.getAttribute('href') || '').split('#')[0];
      if (!href || href.charAt(0) !== '/') return;
      var target = href.length > 1 ? href.replace(/\/$/, '') : '/';
      if (target === path) a.classList.add('is-active');
    });

    /* Share-this-page buttons on the article template */
    $$('[data-share-wa]').forEach(function (a) {
      a.href = waLink(document.title + ' — ' + window.location.href);
    });

    /* Expose the call number for any "call us" button rendered by JS */
    $$('[data-tel-primary]').forEach(function (a) { a.href = 'tel:' + PHONE_TRICHY; });
  }

  /* ---------- Boot ---------- */
  function boot() {
    initHeader();
    initToursPanel();
    initDrawer();
    initLang();
    initSlider();
    initForms();
    initOfferModal();
    initCounter();
    initFilters();
    initMisc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
