// iContact Africa Solutions — shared site behaviour
document.addEventListener('DOMContentLoaded', () => {
  // ---- Mobile nav -----------------------------------------------------------
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');
  if (nav && toggle) {
    toggle.addEventListener('click', () => {
      const open = !nav.classList.contains('open');
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  // ---- Header shadow on scroll ---------------------------------------------
  const header = document.querySelector('.site-header');
  const onScroll = () => header?.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---- FAQ accordion ----------------------------------------------------------
  document.querySelectorAll('.faq-list').forEach((list) => {
    list.addEventListener('click', (e) => {
      const q = e.target.closest('.faq-question');
      if (!q) return;
      const item = q.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      list.querySelectorAll('.faq-item').forEach((el) => {
        el.classList.remove('open');
        el.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('open');
        q.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ---- Reveal on scroll (fail-safe) -----------------------------------------
  // Only blocks that start below the fold are hidden, and only if the browser
  // supports IntersectionObserver and motion is allowed. If the observer never
  // responds (some in-app browsers / previews), everything is shown after 2s.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reduce) {
    const below = [...document.querySelectorAll('.reveal')]
      .filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.9);
    let alive = false;
    const io = new IntersectionObserver((entries) => {
      alive = true;
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    below.forEach((el) => { el.classList.add('pre'); io.observe(el); });
    setTimeout(() => { if (!alive) below.forEach((el) => el.classList.add('in')); }, 2000);
  }

  // ---- Hero quick-quote chips ------------------------------------------------------
  const qq = document.getElementById('quick-quote');
  qq?.querySelectorAll('[data-service]').forEach((b) =>
    b.addEventListener('click', () => {
      qq.service.value = b.dataset.service;
      qq.email.focus();
    }));

  // ---- Footer year ----------------------------------------------------------------
  document.querySelectorAll('.current-year').forEach((el) => { el.textContent = new Date().getFullYear(); });
});
