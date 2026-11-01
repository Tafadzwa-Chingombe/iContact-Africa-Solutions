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
