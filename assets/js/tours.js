/* ==========================================================================
   Tour packages: "View 4-day plan" pop-up.
   Plans are DRAFTS for review. Edit the text below; the card key must match
   the data-plan attribute in src/pages/tours.html.
   Each day: [title, [bullet, bullet, bullet]].
   ========================================================================== */
(function () {
  'use strict';
  const S = window.SirpySite;
  if (!S) return;
  const { $, $$, esc, wa } = S;

  const PLANS = {
    'sg-my': {
      title: 'Singapore & Malaysia Twin Wonder',
      sub: '4-day sample plan · Singapore and Kuala Lumpur',
      days: [
        ['Day 1 · Arrive Singapore', ['Airport pickup and transfer to hotel in Little India', 'Evening at Gardens by the Bay Supertree Grove light show', 'Dinner at Lau Pa Sat hawker centre']],
        ['Day 2 · Universal Studios', ['Full day at Universal Studios Singapore', 'Sentosa beach and S.E.A. Aquarium in the afternoon', 'Night: Marina Bay Sands sky park view']],
        ['Day 3 · Travel to Kuala Lumpur', ['Morning Singapore to KL coach or flight (with transfer)', 'Petronas Twin Towers and KLCC park', 'Batu Caves temple visit at sunset']],
        ['Day 4 · Genting Highlands & return', ['Cable car to Genting Highlands for the view', 'Free time for shopping and lunch', 'Transfer to KL airport for return flight']]
      ]
    },
    'bali': {
      title: 'Enchanting Bali & Nusa Penida',
      sub: '4-day sample plan · Ubud and Nusa Penida',
      days: [
        ['Day 1 · Arrive Bali', ['Airport pickup and drive to Ubud', 'Check in to villa with pool', 'Sunset at Ubud rice terraces']],
        ['Day 2 · Ubud culture', ['Monkey Forest and Tegallalang rice terraces', 'Balinese cooking class', 'Jungle swing and waterfall visit']],
        ['Day 3 · Nusa Penida island', ['Early speedboat to Nusa Penida', 'Kelingking Beach viewpoint and Angel’s Billabong', 'Return to Bali in the evening']],
        ['Day 4 · Beach and departure', ['Free morning at the hotel pool', 'Transfer to airport for return flight']]
      ]
    },
    'kashmir': {
      title: 'Majestic Kashmir & Dal Lake',
      sub: '4-day sample plan · Srinagar and Gulmarg',
      days: [
        ['Day 1 · Srinagar arrival', ['Pickup from Srinagar airport', 'Check in to Dal Lake houseboat', 'Shikara ride on Dal Lake at sunset']],
        ['Day 2 · Mughal gardens', ['Shalimar Bagh and Nishat Bagh', 'Chashme Shahi spring visit', 'Evening Kashmiri dinner on the houseboat']],
        ['Day 3 · Gulmarg', ['Drive to Gulmarg (about 2 hours)', 'Gulmarg gondola cable car ride', 'Return to Srinagar in the evening']],
        ['Day 4 · Pahalgam and departure', ['Betaab Valley and Lidder river', 'Transfer to Srinagar airport for return flight']]
      ]
    },
    'temple-trail': {
      title: 'Sacred South India Temple Trail',
      sub: '4-day sample plan · Trichy, Tanjore, Madurai and Rameshwaram',
      days: [
        ['Day 1 · Trichy & Srirangam', ['Pickup from Trichy airport', 'Srirangam Ranganathaswamy temple darshan', 'Rockfort Temple at dusk']],
        ['Day 2 · Tanjore', ['Brihadeeswarar Temple (UNESCO Chola temple)', 'Royal Palace museum visit', 'Return to Trichy']],
        ['Day 3 · Madurai', ['Meenakshi Amman Temple darshan', 'Thirumalai Nayak Palace', 'Evening aarti']],
        ['Day 4 · Rameshwaram', ['Ramanathaswamy Temple and the 22 theerthams', 'Dhanushkodi visit', 'Transfer to Madurai or Trichy for return flight']]
      ]
    },
    'dubai': {
      title: 'Grand Dubai Future City & Desert',
      sub: '4-day sample plan · Dubai',
      days: [
        ['Day 1 · Arrive Dubai', ['Airport pickup and hotel check-in', 'Dubai Marina evening walk', 'Dhow cruise dinner']],
        ['Day 2 · Downtown Dubai', ['Burj Khalifa At The Top (day or sunset slot)', 'Dubai Mall and Dubai Fountain show', 'Old Dubai, Gold & Spice Souk']],
        ['Day 3 · Museum of the Future & desert', ['Museum of the Future visit', 'Afternoon desert safari with dune bashing', 'BBQ dinner and cultural show in the desert']],
        ['Day 4 · Departure', ['Free morning and shopping', 'Transfer to airport for return flight']]
      ]
    },
    'thailand': {
      title: 'Thailand Islands & Bangkok',
      sub: '4-day sample plan · Phuket and Bangkok',
      days: [
        ['Day 1 · Arrive Phuket', ['Airport pickup and hotel check-in', 'Patong Beach evening', 'Thai street food dinner']],
        ['Day 2 · Phi Phi islands', ['Speedboat tour of Phi Phi islands', 'Maya Bay and snorkelling', 'Return to Phuket']],
        ['Day 3 · James Bond Island & Krabi', ['James Bond Island by longtail boat and canoeing', 'Panyi village visit', 'Evening return to hotel']],
        ['Day 4 · Bangkok', ['Flight or transfer to Bangkok', 'Grand Palace and Wat Pho temples', 'Return transfer or onward flight']]
      ]
    },
    'kerala': {
      title: 'Kerala Backwaters & Munnar Hills',
      sub: '4-day sample plan · Alleppey, Munnar and Thekkady',
      days: [
        ['Day 1 · Alleppey houseboat', ['Pickup from Cochin airport', 'Board Alleppey houseboat', 'Backwater lunch and sunset']],
        ['Day 2 · Drive to Munnar', ['Scenic drive through Western Ghats', 'Tea garden visit and Eravikulam trail', 'Evening at hill resort']],
        ['Day 3 · Thekkady wildlife', ['Periyar lake boat safari', 'Spice plantation walk', 'Kathakali performance in the evening']],
        ['Day 4 · Departure', ['Transfer to Cochin or Madurai airport for return flight']]
      ]
    },
    'tirupati': {
      title: 'Tirupati & Kanchipuram Darshan',
      sub: '3-day sample plan · Tirupati and Kanchipuram (4 days with transfers)',
      days: [
        ['Day 1 · Trichy to Tirupati', ['AC transport from Trichy with darshan assistance', 'Check in at Tirupati', 'Evening rest']],
        ['Day 2 · Tirumala darshan', ['Early Tirumala Venkateswara darshan (arranged)', 'Padmavathi Temple visit', 'Return to hotel']],
        ['Day 3 · Kanchipuram', ['Kanchi Kamakshi Amman Temple', 'Ekambareswarar Temple and silk weaving visit', 'Evening return to Chennai or Tirupati']],
        ['Day 4 · Return', ['Transfer to airport or station for return']]
      ]
    },
    'maldives': {
      title: 'Maldives Overwater Escape',
      sub: '4-day sample plan · Maldives',
      days: [
        ['Day 1 · Arrive Malé', ['Speedboat or seaplane transfer to resort', 'Check in to overwater villa', 'Sunset cocktail']],
        ['Day 2 · Island life', ['Snorkelling with reef and marine life', 'Spa treatment (optional)', 'Candlelight dinner on the beach']],
        ['Day 3 · Excursion', ['Dolphin cruise or sandbank picnic', 'Free afternoon at the villa', 'Stargazing evening']],
        ['Day 4 · Departure', ['Transfer back to Malé airport for return flight']]
      ]
    },
    'sg-cruise': {
      title: 'Singapore Short Sailing Cruise',
      sub: '4-day sample plan · Singapore cruise and city stay',
      days: [
        ['Day 1 · Embark Singapore', ['Arrival and hotel check-in', 'Embarkation at cruise terminal', 'Welcome dinner and show']],
        ['Day 2 · At sea', ['Full day on board', 'Pool, dining and entertainment', 'Evening show']],
        ['Day 3 · Port stop', ['Shore excursion (selected ports)', 'Free time to explore', 'Return on board']],
        ['Day 4 · Disembark', ['Breakfast on board', 'Disembarkation and transfer to airport or hotel']]
      ]
    },
    'india-cruise': {
      title: 'India Coastal Cruise Getaway',
      sub: '4-day sample plan · coastal cruise',
      days: [
        ['Day 1 · Board', ['Pickup and boarding at the port', 'Cabin check-in', 'Welcome dinner']],
        ['Day 2 · Sea day', ['Onboard entertainment and dining', 'Pool and spa time', 'Evening show']],
        ['Day 3 · Port stop', ['Shore visit to temples or beaches', 'Local lunch', 'Return on board']],
        ['Day 4 · Disembark', ['Breakfast and disembarkation', 'Transfer to station or airport']]
      ]
    }
  };

  /* ---------- modal ---------- */
  let modal;
  function build() {
    modal = document.createElement('div');
    modal.className = 'plan-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="plan-backdrop" data-plan-close></div>
      <div class="plan-card" role="dialog" aria-modal="true" aria-labelledby="planTitle">
        <button class="plan-x" type="button" aria-label="Close" data-plan-close>&times;</button>
        <p class="plan-sub" id="planSub"></p>
        <h2 id="planTitle"></h2>
        <ol class="plan-days" id="planDays"></ol>
        <p class="plan-note">Sample plan. Hotels, transfers and exact timings are confirmed when you enquire.</p>
        <a class="btn btn-wa btn-block" id="planWa" target="_blank" rel="noopener">Enquire on WhatsApp</a>
      </div>`;
    document.body.appendChild(modal);
    $$('[data-plan-close]', modal).forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  }
  function open(key) {
    const p = PLANS[key];
    if (!p) return;
    if (!modal) build();
    $('#planSub', modal).textContent = p.sub;
    $('#planTitle', modal).textContent = p.title;
    $('#planDays', modal).innerHTML = p.days.map(([t, items]) =>
      `<li><b>${esc(t)}</b><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></li>`).join('');
    $('#planWa', modal).href = wa(`Hi Sirpy Air Travels, I would like the 4-day plan and quote for the ${p.title} package.`);
    modal.hidden = false;
    document.body.classList.add('modal-open');
    $('.plan-x', modal).focus();
  }
  function close() {
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  $$('[data-plan]').forEach((card) => {
    const btn = card.querySelector('[data-plan-open]');
    if (btn) btn.addEventListener('click', () => open(card.dataset.plan));
  });
})();
