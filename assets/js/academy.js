// iContact Academy — public catalogue (academy.html) and course pages (course.html?slug=…).
// Reads published courses and lesson titles through public database functions;
// lesson content stays locked to enrolled students (row-level security).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../portal/js/config.js';
import { ACADEMY_PAYMENT as PAY } from './academy-config.js';
import { videoEmbed } from './academy-video.js';

const configured = !SUPABASE_URL.includes('YOUR-PROJECT-REF');
const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, cur = 'USD') => (cur === 'USD' ? `$${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}` : `${cur} ${Number(n).toFixed(2)}`);
const CAT = { marketing: 'Digital marketing', web: 'Website development' };
const LEVEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const hours = (min) => (!min ? '' : min < 60 ? `${min} min` : `${Math.round((min / 60) * 10) / 10} hours`);

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

async function rpc(name, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const icon = (cat) => (cat === 'web'
  ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>'
  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>');

function courseCard(c) {
  const meta = [LEVEL[c.level], c.duration_text || hours(c.total_minutes), c.lesson_count ? plural(c.lesson_count, 'lesson') : ''].filter(Boolean).join(' · ');
  return `<a class="course-card" href="course.html?slug=${encodeURIComponent(c.slug)}" data-cat="${esc(c.category)}">
    <div class="course-cover cat-${esc(c.category)}">${c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" loading="lazy">` : `<span class="course-cover-icon">${icon(c.category)}</span>`}
      <span class="course-cat">${esc(CAT[c.category] || c.category)}</span></div>
    <div class="course-body">
      <h3>${esc(c.title)}</h3>
      ${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ''}
      <p class="course-meta">${esc(meta)}</p>
      <div class="course-foot"><span class="course-price">${money(c.price, c.currency)}</span><span class="course-go">View course <span aria-hidden="true">→</span></span></div>
    </div></a>`;
}

// ---------- Catalogue ------------------------------------------------------------------
const grid = document.getElementById('course-grid');
if (grid) {
  (async () => {
    let courses = [];
    try { courses = configured ? await rpc('course_catalog') : []; } catch { courses = null; }
    const empty = document.getElementById('courses-empty');
    if (!courses || !courses.length) {
      grid.hidden = true; empty.hidden = false;
      if (courses === null) empty.querySelector('p').textContent = 'We couldn’t load the courses just now. Please refresh, or WhatsApp us and we’ll send you the list.';
      document.getElementById('course-filters')?.setAttribute('hidden', '');
      return;
    }
    grid.innerHTML = courses.map(courseCard).join('');
    const counts = { all: courses.length };
    courses.forEach((c) => { counts[c.category] = (counts[c.category] || 0) + 1; });
    document.querySelectorAll('#course-filters [data-filter]').forEach((b) => {
      const n = counts[b.dataset.filter] || 0;
      b.querySelector('.count').textContent = n;
      if (!n && b.dataset.filter !== 'all') b.hidden = true;
      b.addEventListener('click', () => {
        document.querySelectorAll('#course-filters [data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        grid.querySelectorAll('.course-card').forEach((card) => { card.hidden = b.dataset.filter !== 'all' && card.dataset.cat !== b.dataset.filter; });
      });
    });
  })();
}

// ---------- Course page -----------------------------------------------------------------
const page = document.getElementById('course-page');
if (page) {
  const slug = new URLSearchParams(location.search).get('slug') || '';
  const notFound = () => {
    page.innerHTML = `<div class="container"><div class="blog-empty" style="margin:60px auto"><h2>Course not found</h2><p>It may have moved or isn’t open for enrolment yet.</p><a class="btn btn-primary" href="academy.html">See all courses</a></div></div>`;
    document.title = 'Course not found — iContact Academy';
  };
  (async () => {
    if (!configured || !/^[a-z0-9-]{1,80}$/.test(slug)) return notFound();
    let course; let lessons = [];
    try {
      const all = await rpc('course_catalog');
      course = all.find((c) => c.slug === slug);
      if (!course) return notFound();
      lessons = await rpc('course_curriculum', { p_slug: slug });
    } catch { return notFound(); }
    render(course, lessons);
  })();

  function render(c, lessons) {
    const url = new URL(`course.html?slug=${c.slug}`, location.href).href;
    document.title = `${c.title} — iContact Academy | Online course`;
    const desc = c.subtitle || `${c.title}: a self-paced online course from iContact Academy.`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${c.title} — iContact Academy`);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);
    const ld = document.createElement('script'); ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Course', name: c.title, description: desc, url,
      provider: { '@type': 'Organization', name: 'iContact Africa Solutions', sameAs: new URL('index.html', location.href).href },
      offers: { '@type': 'Offer', category: 'Paid', price: Number(c.price), priceCurrency: c.currency },
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Online', courseWorkload: c.total_minutes ? `PT${c.total_minutes}M` : undefined } });
    document.head.appendChild(ld);

    const modules = [];
    lessons.forEach((l) => {
      let m = modules.find((x) => x.title === l.module_title);
      if (!m) { m = { title: l.module_title, items: [] }; modules.push(m); }
      m.items.push(l);
    });
    const meta = [LEVEL[c.level], c.duration_text || hours(c.total_minutes), plural(lessons.length, 'lesson'), 'Self-paced', 'Lifetime access'].filter(Boolean);
    page.innerHTML = `
      <section class="page-hero course-hero" data-scene="academy">
        <div class="container">
          <p class="crumbs"><a href="index.html">Home</a> / <a href="academy.html">Academy</a> / ${esc(c.title)}</p>
          <p class="eyebrow">${esc(CAT[c.category] || 'Course')}</p>
          <h1>${esc(c.title)}</h1>
          ${c.subtitle ? `<p class="lead">${esc(c.subtitle)}</p>` : ''}
          <ul class="course-badges">${meta.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
          <div class="btn-row" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:26px"><a href="#enrol" class="btn btn-lime">Enrol for ${money(c.price, c.currency)}</a><a href="#curriculum" class="btn btn-ghost-light">See the curriculum</a></div>
        </div>
      </section>
      <section class="section">
        <div class="container course-layout">
          <div>
            ${trailerBlock(c)}
            ${c.outcomes?.length ? `<div class="course-block"><h2>What you’ll learn</h2><ul class="course-outcomes">${c.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
            ${c.description ? `<div class="course-block"><h2>About this course</h2>${c.description.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
            ${c.who_for ? `<div class="course-block"><h2>Who it’s for</h2><p>${esc(c.who_for)}</p></div>` : ''}
            <div class="course-block" id="curriculum"><h2>Curriculum</h2>
              <p class="muted">${plural(lessons.length, 'lesson')}${c.total_minutes ? ` · ${esc(hours(c.total_minutes))} of video` : ''}${c.preview_count ? ' · free previews marked' : ''}</p>
              <div class="curriculum">${modules.map((m, i) => `
                <details class="module"${i === 0 ? ' open' : ''}><summary><span>${esc(m.title)}</span><small>${plural(m.items.length, 'lesson')}</small></summary>
                  <ol>${m.items.map((l) => `<li><span class="lesson-title">${esc(l.title)}</span>
                    ${l.is_preview && l.lesson_id ? `<button type="button" class="preview-btn" data-preview="${esc(l.lesson_id)}">Free preview</button>` : '<span class="lock" aria-label="For enrolled students">🔒</span>'}
                    ${l.duration_min ? `<span class="lesson-min">${l.duration_min} min</span>` : ''}</li>`).join('')}</ol>
                </details>`).join('') || '<p class="muted">The lesson list is being finalised.</p>'}</div>
            </div>
          </div>
          <aside class="course-aside" id="enrol">
            <div class="enrol-card">
              <p class="price-label">One-off payment</p>
              <div class="price-big"><b>${money(c.price, c.currency)}</b><span>lifetime access</span></div>
              <div class="enrol-slot">${enrolForm(c)}</div>
            </div>
          </aside>
        </div>
      </section>`;
    bindEnrol(c);
    setupPaynow(c);
    page.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', () => openPreview(b.dataset.preview)));
    window.dispatchEvent(new Event('scenes:refresh'));
  }

  // Course trailer (courses.trailer_url). For an MP4, "<name>-poster.jpg", "<name>-vertical.mp4" and
  // "<name>-vertical-poster.jpg" next to it are used when present (the vertical cut on phones).
  function trailerBlock(c) {
    const url = c.trailer_url;
    if (!url) return '';
    const head = `<h2>Watch the trailer</h2>`;
    if (!/\.mp4(\?|$)/i.test(url)) return `<div class="course-block course-trailer">${head}${videoEmbed(url, `${c.title}: trailer`)}</div>`;
    const base = url.replace(/\.mp4(\?.*)?$/i, '');
    const phone = matchMedia('(max-width: 640px)').matches;
    return `<div class="course-block course-trailer">${head}
      <figure class="video-card${phone ? ' is-vertical' : ''}">
        <video controls playsinline preload="none" poster="${esc(base + (phone ? '-vertical-poster.jpg' : '-poster.jpg'))}" aria-label="${esc(c.title)}: course trailer">
          ${phone ? `<source src="${esc(base)}-vertical.mp4" type="video/mp4">` : ''}<source src="${esc(url)}" type="video/mp4">
          <a href="${esc(url)}">Download the trailer (MP4)</a>
        </video>
        <figcaption class="video-note">About a minute &middot; narrated by Nyasha, iContact&rsquo;s AI assistant &middot; captions are shown in the video &middot; the voice is AI-generated and the screens are examples</figcaption>
      </figure></div>`;
  }

  function payBlock() {
    const lines = [];
    if (PAY.ecocashNumber) lines.push(`<li><b>EcoCash:</b> ${esc(PAY.ecocashNumber)}${PAY.ecocashName ? ` (${esc(PAY.ecocashName)})` : ''}</li>`);
    if (PAY.paynowLink) lines.push(`<li><b>Paynow:</b> <a href="${esc(PAY.paynowLink)}" target="_blank" rel="noopener">pay online (EcoCash, OneMoney, cards)</a></li>`);
    if (PAY.bankLines?.length) lines.push(`<li><b>Bank transfer:</b><br>${PAY.bankLines.map(esc).join('<br>')}</li>`);
    return lines.length
      ? `<div class="pay-box"><p><b>How to pay</b></p><ul>${lines.join('')}</ul><p class="muted small">Use your name as the reference, then enter the transaction ID below.</p></div>`
      : '<div class="pay-box"><p><b>How to pay</b></p><p class="muted small">Send your enrolment request and we’ll WhatsApp you EcoCash, Paynow and bank details straight away.</p></div>';
  }

  function enrolForm(c) {
    return `${payBlock()}
      <form class="enrol-form" novalidate>
        <label class="field"><span>Full name</span><input name="full_name" required minlength="2" maxlength="120" autocomplete="name"></label>
        <label class="field"><span>Email <small>(your login)</small></span><input type="email" name="email" required maxlength="200" autocomplete="email"></label>
        <label class="field"><span>WhatsApp number</span><input type="tel" name="phone" maxlength="40" autocomplete="tel" placeholder="077 123 4567"></label>
        <label class="field"><span>How you’ll pay</span><select name="pay_method" required><option value="ecocash">EcoCash</option><option value="paynow">Paynow (EcoCash, OneMoney or card)</option><option value="bank">Bank transfer</option></select></label>
        <label class="field"><span>Transaction ID <small>(if you’ve already paid)</small></span><input name="pay_reference" maxlength="120" placeholder="e.g. MP2411.1234.A12345"></label>
        <input class="hp" type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn btn-primary btn-block" type="submit">Request my place</button>
        <p class="muted small">We confirm your payment, then send your Academy login by WhatsApp or email, usually the same day.</p>
        <div class="form-status" role="status" aria-live="polite"></div>
      </form>`;
  }

  function bindEnrol(c) {
    const form = page.querySelector('.enrol-slot .enrol-form');
    const status = form.querySelector('.form-status');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.company_website.value) return; // bot
      if (!form.full_name.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim())) {
        status.className = 'form-status error'; status.textContent = 'Please add your name and a valid email address.'; return;
      }
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
      const row = { course_id: c.id, full_name: form.full_name.value.trim(), email: form.email.value.trim().toLowerCase(),
        phone: form.phone.value.trim() || null, pay_method: form.pay_method.value, pay_reference: form.pay_reference.value.trim() || null };
      let ok = false;
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/academy_orders`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
        ok = res.ok;
      } catch { ok = false; }
      const wa = `https://wa.me/${PAY.whatsapp}?text=${encodeURIComponent(`Hi iContact, I'd like to enrol in "${c.title}". Name: ${row.full_name}, email: ${row.email}. Payment: ${row.pay_method}${row.pay_reference ? `, transaction ID ${row.pay_reference}` : ''}.`)}`;
      if (ok) {
        form.innerHTML = `<div class="enrol-done"><h3>Request received ✓</h3><p>Thanks, ${esc(row.full_name.split(' ')[0])}. ${row.pay_reference ? 'We’ll confirm your payment' : 'We’ll send you payment details'} and then your login for <b>${esc(c.title)}</b>.</p>
          <a class="btn btn-primary btn-block" href="${wa}" target="_blank" rel="noopener">Send proof of payment on WhatsApp</a></div>`;
      } else {
        btn.disabled = false; btn.textContent = 'Request my place';
        status.className = 'form-status error';
        status.innerHTML = `We couldn’t send that just now. <a href="${wa}" target="_blank" rel="noopener">Enrol on WhatsApp instead</a>.`;
      }
    });
  }

  // ---------- Paynow checkout (instant access) ---------------------------------------------
  const PAYNOW_FN = `${SUPABASE_URL}/functions/v1/paynow`;
  async function paynow(body) {
    const res = await fetch(PAYNOW_FN, { method: 'POST', headers, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok && !out.error) out.error = `HTTP ${res.status}`;
    return out;
  }

  async function setupPaynow(c) {
    const slot = page.querySelector('.enrol-slot');
    const paymentId = new URLSearchParams(location.search).get('payment');
    if (paymentId) { showStatus(c, paymentId, null); return; }
    if (PAY.paynowCheckout === false) return;
    let cfg = {};
    try { cfg = await paynow({ action: 'config' }); } catch { return; }
    if (!cfg.enabled || cfg.currency !== c.currency) return; // keep the request form
    slot.innerHTML = checkoutForm(c);
    bindCheckout(c);
  }

  function checkoutForm(c) {
    const opt = (v, label, sub, checked) => `<label class="pay-opt"><input type="radio" name="pay_with" value="${v}"${checked ? ' checked' : ''}><span><b>${label}</b><small>${sub}</small></span></label>`;
    return `
      <form class="enrol-form checkout-form" novalidate>
        <label class="field"><span>Full name</span><input name="full_name" required minlength="2" maxlength="120" autocomplete="name"></label>
        <label class="field"><span>Email <small>(your login)</small></span><input type="email" name="email" required maxlength="200" autocomplete="email"></label>
        <label class="field"><span>WhatsApp number</span><input type="tel" name="phone" maxlength="40" autocomplete="tel" placeholder="077 123 4567"></label>
        <fieldset class="pay-opts"><legend>Pay with</legend>
          ${opt('ecocash', 'EcoCash', 'Prompt on your phone', true)}
          ${opt('onemoney', 'OneMoney', 'Prompt on your phone')}
          ${opt('web', 'Card & more', 'Visa, Mastercard, ZimSwitch, InnBucks…')}
        </fieldset>
        <label class="field mobile-field"><span>Mobile money number</span><input type="tel" name="mobile" maxlength="20" inputmode="tel" placeholder="0771234567"></label>
        <input class="hp" type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn btn-primary btn-block" type="submit">Pay ${money(c.price, c.currency)}</button>
        <p class="muted small secure-note">🔒 Secure payment by Paynow. Your course unlocks as soon as payment goes through.</p>
        <div class="form-status" role="status" aria-live="polite"></div>
        <p class="small alt-pay"><button type="button" class="link-btn" data-manual>Prefer bank transfer? Request your place instead</button></p>
      </form>`;
  }

  function bindCheckout(c) {
    const slot = page.querySelector('.enrol-slot');
    const form = slot.querySelector('.checkout-form');
    const status = form.querySelector('.form-status');
    const mobileField = form.querySelector('.mobile-field');
    const payWith = () => form.elements.pay_with.value;
    const sync = () => { mobileField.hidden = payWith() === 'web'; };
    form.querySelectorAll('[name=pay_with]').forEach((r) => r.addEventListener('change', sync)); sync();
    // Copy the WhatsApp number into the mobile-money box until the buyer edits that box themselves
    let mobileEdited = false;
    form.mobile.addEventListener('input', () => { mobileEdited = true; });
    form.phone.addEventListener('input', () => { if (!mobileEdited) form.mobile.value = form.phone.value.replace(/[^\d+]/g, ''); });
    form.querySelector('[data-manual]').addEventListener('click', () => { slot.innerHTML = enrolForm(c); bindEnrol(c); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.company_website.value) return;
      const err = (m) => { status.className = 'form-status error'; status.textContent = m; };
      if (form.full_name.value.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim())) return err('Please add your name and a valid email address — it becomes your login.');
      const method = payWith();
      if (method !== 'web' && !/^(\+?263|0)7\d{8}$/.test(form.mobile.value.replace(/[\s-]/g, ''))) return err(`Enter the ${method === 'ecocash' ? 'EcoCash (Econet)' : 'OneMoney (NetOne)'} number to pay from, e.g. 0771234567.`);
      const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = method === 'web' ? 'Opening Paynow…' : 'Sending prompt…';
      status.className = 'form-status';
      let out;
      try {
        out = await paynow({ action: 'start', slug: c.slug, method, full_name: form.full_name.value.trim(), email: form.email.value.trim(),
          phone: form.phone.value.trim(), mobile: form.mobile.value.trim(), company_website: form.company_website.value });
      } catch { out = { error: 'We couldn’t reach the payment service. Check your connection and try again.' }; }
      if (out.error || !out.payment_id) { btn.disabled = false; btn.textContent = `Pay ${money(c.price, c.currency)}`; return err(out.error || 'Payment could not start.'); }
      const url = new URL(location.href); url.searchParams.set('payment', out.payment_id);
      if (out.redirect_url) { history.replaceState(null, '', url); location.href = out.redirect_url; return; }
      history.replaceState(null, '', url);
      showStatus(c, out.payment_id, out.instructions || '');
    });
  }

  function showStatus(c, id, instructions) {
    const slot = page.querySelector('.enrol-slot');
    const started = Date.now();
    let timer; let stopped = false;
    const retry = () => {
      stopped = true; clearTimeout(timer);
      const url = new URL(location.href); url.searchParams.delete('payment'); history.replaceState(null, '', url);
      slot.innerHTML = checkoutForm(c); bindCheckout(c);
    };
    const panel = (cls, html) => { slot.innerHTML = `<div class="pay-status ${cls}" role="status" aria-live="polite">${html}</div>`; };
    const waiting = (extra = '') => panel('is-waiting', `<span class="pay-spin" aria-hidden="true"></span>
      <h3>Waiting for your payment…</h3>
      <p>${esc(instructions || 'Complete the payment on Paynow. This page updates by itself.')}</p>${extra}`);
    waiting();
    document.getElementById('enrol')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const tick = async () => {
      if (stopped) return;
      let r;
      try { r = await paynow({ action: 'check', payment_id: id }); } catch { r = {}; }
      if (r.error === 'Unknown payment') { panel('is-failed', '<h3>We couldn’t find that payment</h3><p>Try again below.</p><button class="btn btn-primary btn-block" type="button" data-retry>Back to payment</button>'); slot.querySelector('[data-retry]').onclick = retry; return; }
      if (r.paid && r.ready) {
        panel('is-paid', `<h3>Payment received ✓</h3><p>You’re enrolled in <b>${esc(c.title)}</b>.</p>
          ${r.login_link ? `<a class="btn btn-primary btn-block" href="${esc(r.login_link)}">Start learning →</a><p class="muted small">This button signs you in and asks you to choose a password. Next time, log in at <a href="portal/login.html">Student login</a> with <b>${esc(r.email)}</b>.</p>`
            : r.existing_account ? `<a class="btn btn-primary btn-block" href="portal/login.html">Log in to start learning →</a><p class="muted small">You already have an iContact account (<b>${esc(r.email)}</b>). Log in as usual and the course is waiting under <b>Academy</b>.</p>`
              : `<a class="btn btn-primary btn-block" href="portal/login.html">Log in to start learning →</a><p class="muted small">Log in with <b>${esc(r.email)}</b> using “Email me a login link”.</p>`}`);
        return;
      }
      if (r.paid) { waiting('<p class="muted small">Payment received — unlocking your course…</p>'); }
      else if (r.failed) {
        panel('is-failed', `<h3>Payment ${esc(r.status || 'not completed')}</h3><p>This payment didn’t go through. Try again, or if you were charged, WhatsApp us and we’ll sort it out.</p>
          <button class="btn btn-primary btn-block" type="button" data-retry>Try again</button>
          <a class="btn btn-outline btn-block" style="margin-top:8px" href="https://wa.me/${PAY.whatsapp}" target="_blank" rel="noopener">WhatsApp us</a>`);
        slot.querySelector('[data-retry]').onclick = retry; return;
      } else if (Date.now() - started > 4 * 60e3) {
        waiting(`<p class="muted small">Still waiting. If you’ve already approved the payment, it will unlock automatically — you can leave this page open.</p>
          <button class="btn btn-outline btn-block" type="button" data-retry>Start again</button>`);
        slot.querySelector('[data-retry]').onclick = retry;
      } else if (instructions && Date.now() - started > 60e3) {
        waiting('<p class="muted small">No prompt? Make sure your phone is on and has signal, or <button type="button" class="link-btn" data-retry>start again</button>.</p>');
        slot.querySelector('[data-retry]').onclick = retry;
      }
      timer = setTimeout(tick, Date.now() - started > 4 * 60e3 ? 15000 : 4000);
    };
    timer = setTimeout(tick, 2500);
  }

  async function openPreview(id) {
    let lesson;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(id)}&select=title,video_url,body`, { headers });
      [lesson] = await res.json();
    } catch { lesson = null; }
    if (!lesson) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'preview-dialog';
    const { videoEmbed } = await import('./academy-video.js');
    const { renderMarkdown } = await import('./markdown.js');
    dlg.innerHTML = `<div class="preview-inner"><button type="button" class="preview-close" aria-label="Close">×</button>
      <p class="eyebrow">Free preview</p><h2>${esc(lesson.title)}</h2>${videoEmbed(lesson.video_url)}
      ${lesson.body ? `<div class="prose">${renderMarkdown(lesson.body)}</div>` : ''}</div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('.preview-close')) dlg.close(); });
    dlg.showModal();
  }
}
