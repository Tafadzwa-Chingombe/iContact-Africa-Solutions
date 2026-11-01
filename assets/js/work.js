// Portfolio filters (Work page) and device preview toggle (case-study pages).
(function () {
  // ---- Filters ------------------------------------------------------------
  var grid = document.getElementById('portfolio');
  var status = document.getElementById('filter-status');
  var bar = document.querySelector('.filters');
  if (grid && bar) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.work-card'));
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var apply = function (filter, label) {
      var shown = 0;
      cards.forEach(function (card) {
        var match = filter === 'all' || card.getAttribute('data-cats').split(' ').indexOf(filter) !== -1;
        if (match) {
          shown++;
          if (card.classList.contains('is-hidden')) {
            card.classList.remove('is-hidden');
            if (!reduce) {
              card.classList.add('is-entering');
              requestAnimationFrame(function () { requestAnimationFrame(function () { card.classList.remove('is-entering'); }); });
            }
          }
        } else {
          card.classList.add('is-hidden');
        }
      });
      if (status) status.textContent = filter === 'all' ? 'Showing all ' + shown + ' projects' : 'Showing ' + shown + ' ' + label + ' project' + (shown === 1 ? '' : 's');
    };
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b) return;
      bar.querySelectorAll('[data-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      var label = b.childNodes[0].textContent.trim();
      apply(b.getAttribute('data-filter'), label);
      try { history.replaceState(null, '', b.getAttribute('data-filter') === 'all' ? location.pathname : '#' + b.getAttribute('data-filter')); } catch (err) { /* ignore */ }
    });
    // Deep link: work.html#gbp
    var start = location.hash.slice(1);
    var startBtn = start && bar.querySelector('[data-filter="' + start + '"]');
    if (startBtn) startBtn.click();
  }

  // ---- Device preview toggle (case studies) -----------------------------------
  var device = document.getElementById('device');
  var toggle = document.querySelector('.device-toggle');
  if (device && toggle) {
    toggle.addEventListener('click', function (e) {
      var b = e.target.closest('[data-device]');
      if (!b) return;
      toggle.querySelectorAll('[data-device]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      device.classList.toggle('is-mobile', b.getAttribute('data-device') === 'mobile');
      // Real screenshots: swap the desktop/mobile image
      var shot = device.querySelector('[data-shot]');
      if (shot) {
        var mobile = b.getAttribute('data-device') === 'mobile';
        shot.querySelector('.shot-desktop').hidden = mobile;
        shot.querySelector('.shot-mobile').hidden = !mobile;
      }
    });
  }
})();

// ---- Company-profile page viewer (case studies with [data-book]) ---------------
(function () {
  var book = document.querySelector('[data-book]');
  if (!book) return;
  var pages = Array.prototype.slice.call(book.querySelectorAll('.book-page'));
  var thumbs = Array.prototype.slice.call(document.querySelectorAll('.book-thumbs button'));
  var counter = document.querySelector('.book-count');
  var prev = document.querySelector('.book-prev');
  var next = document.querySelector('.book-next');
  var i = 0;
  var show = function (n) {
    i = Math.max(0, Math.min(pages.length - 1, n));
    pages.forEach(function (p, k) { p.hidden = k !== i; });
    thumbs.forEach(function (t, k) {
      t.setAttribute('aria-current', k === i ? 'true' : 'false');
      if (k === i && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    if (counter) counter.textContent = 'Page ' + (i + 1) + ' of ' + pages.length;
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === pages.length - 1;
    // load neighbours early for smooth flipping
    [i + 1, i - 1].forEach(function (k) { var img = pages[k] && pages[k].querySelector('img'); if (img) img.loading = 'eager'; });
  };
  prev && prev.addEventListener('click', function () { show(i - 1); });
  next && next.addEventListener('click', function () { show(i + 1); });
  thumbs.forEach(function (t, k) { t.addEventListener('click', function () { show(k); }); });
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') show(i + 1);
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === 'Escape' && document.body.classList.contains('book-zoomed')) toggleZoom(false);
  });
  // swipe
  var x0 = null;
  book.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  book.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
  });
  // full-screen zoom
  var stage = document.querySelector('.book-stage');
  var toggleZoom = function (on) {
    document.body.classList.toggle('book-zoomed', on);
    stage.classList.toggle('is-zoomed', on);
  };
  book.addEventListener('click', function () { toggleZoom(!stage.classList.contains('is-zoomed')); });
  var closeBtn = document.querySelector('.book-close');
  closeBtn && closeBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleZoom(false); });
  show(0);
})();
