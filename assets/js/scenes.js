// iContact — animated, interactive page-hero scenes + CTA particle network.
// Loaded automatically by main.js. Pure SVG/CSS/canvas: no images, no libraries.
// Respects prefers-reduced-motion and pauses work when off-screen.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------- icons
  var I = {
    monitor: '<rect x="-14" y="-11" width="28" height="19" rx="3"/><path d="M-6 13h12M0 8v5"/>',
    chart: '<path d="M-13 11h26M-9 7l6-7 5 4 8-10"/><path d="M5-6h5v5"/>',
    pen: '<path d="M-11 11l3-9 13-13 6 6-13 13z"/><path d="M2-8l6 6"/>',
    mega: '<path d="M-12-3v6h5l9 7v-20l-9 7z"/><path d="M6-5a7 7 0 0 1 0 10"/>',
    lock: '<rect x="-10" y="-2" width="20" height="15" rx="3"/><path d="M-6-2v-5a6 6 0 0 1 12 0v5"/>',
    check: '<path d="M-7 0l5 5 9-10"/>',
    mail: '<rect x="-12" y="-8" width="24" height="16" rx="2"/><path d="M-12-6l12 8 12-8"/>',
    phone: '<rect x="-7" y="-12" width="14" height="24" rx="3"/><path d="M-2 8h4"/>'
  };
  var icon = function (name, x, y, s) {
    return '<g class="sc-icon" transform="translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')">' + I[name] + '</g>';
  };

  // ---------------------------------------------------------------- scenes
  // Each returns SVG markup (viewBox 600x440). Layers with data-depth move with the cursor.
  var S = {};

  S.services = function () {
    var nodes = [[300, 70, 'monitor', 'Websites'], [500, 200, 'chart', 'SEO'], [300, 330, 'pen', 'Brand'], [100, 200, 'mega', 'Ads']];
    var lines = nodes.map(function (n, i) {
      return '<path class="sc-flow" style="--d:' + (i * 0.6) + 's" d="M300 200 L' + n[0] + ' ' + n[1] + '"/>';
    }).join('');
    var ring = nodes.map(function (n, i) {
      var m = nodes[(i + 1) % 4];
      return '<path class="sc-link" d="M' + n[0] + ' ' + n[1] + ' Q300 200 ' + m[0] + ' ' + m[1] + '"/>';
    }).join('');
    var dots = nodes.map(function (n, i) {
      return '<g class="sc-node" style="--d:' + (i * 0.4) + 's"><circle cx="' + n[0] + '" cy="' + n[1] + '" r="34" class="sc-card"/>' +
        icon(n[2], n[0], n[1] - 2) + '<text x="' + n[0] + '" y="' + (n[1] + 54) + '" class="sc-label">' + n[3] + '</text></g>';
    }).join('');
    return '<g data-depth="6"><circle cx="300" cy="200" r="150" class="sc-orbit"/><circle cx="300" cy="200" r="210" class="sc-orbit sc-orbit-2"/></g>' +
      '<g data-depth="12">' + ring + lines + '</g>' +
      '<g data-depth="18"><circle cx="300" cy="200" r="46" class="sc-core"/><text x="300" y="207" class="sc-core-t">iC</text>' + dots + '</g>';
  };

  S.domains = function () {
    var mer = [0, 1, 2, 3, 4].map(function (i) {
      return '<ellipse class="sc-mer" style="--d:' + (-i * 1.6) + 's" cx="0" cy="0" rx="120" ry="120"/>';
    }).join('');
    var lat = [-80, -40, 0, 40, 80].map(function (y) {
      var r = Math.sqrt(120 * 120 - y * y);
      return '<ellipse class="sc-lat" cx="0" cy="' + y + '" rx="' + r.toFixed(1) + '" ry="' + (r * 0.18).toFixed(1) + '"/>';
    }).join('');
    var tags = [['.co.zw', 470, 90], ['.com', 120, 120], ['.africa', 500, 300], ['.org', 110, 330], ['.online', 330, 395]].map(function (t, i) {
      return '<g class="sc-float" style="--d:' + (i * 0.9) + 's"><rect x="' + (t[1] - 44) + '" y="' + (t[2] - 17) + '" width="88" height="34" rx="17" class="sc-pill"/>' +
        '<text x="' + t[1] + '" y="' + (t[2] + 5) + '" class="sc-pill-t">' + t[0] + '</text></g>';
    }).join('');
    return '<g data-depth="8" transform="translate(300 215)"><circle r="120" class="sc-globe"/>' + lat + mer + '</g>' +
      '<g data-depth="16">' + tags + '</g>' +
      '<g data-depth="22"><rect x="150" y="18" width="300" height="40" rx="20" class="sc-search"/><circle cx="175" cy="38" r="7" class="sc-lens"/><path d="M180 43l6 6" class="sc-lens"/>' +
      '<text x="196" y="44" class="sc-type"><tspan class="sc-typing">yourbusiness.co.zw</tspan></text><rect x="196" y="28" width="2" height="20" class="sc-caret"/></g>';
  };

  S.hosting = function () {
    var racks = [0, 1, 2, 3].map(function (r) {
      var y = 110 + r * 62;
      var leds = [0, 1, 2].map(function (k) {
        return '<circle cx="' + (232 + k * 14) + '" cy="' + (y + 22) + '" r="4" class="sc-led" style="--d:' + ((r * 3 + k) * 0.37 % 2.2).toFixed(2) + 's"/>';
      }).join('');
      return '<rect x="210" y="' + y + '" width="230" height="46" rx="8" class="sc-rack"/>' + leds +
        '<rect x="300" y="' + (y + 18) + '" width="110" height="8" rx="4" class="sc-bar"/><rect x="300" y="' + (y + 18) + '" width="110" height="8" rx="4" class="sc-bar-fill" style="--d:' + (r * 0.5) + 's"/>';
    }).join('');
    var streams = [250, 300, 350, 400].map(function (x, i) {
      return '<path class="sc-stream" style="--d:' + (i * 0.45) + 's" d="M' + x + ' 100 V40"/>';
    }).join('');
    return '<g data-depth="7"><path class="sc-cloud" d="M250 40a30 30 0 0 1 55-14a26 26 0 0 1 45 6a22 22 0 0 1 32 28H250a20 20 0 0 1 0-20z" transform="translate(-5 -18)"/></g>' +
      '<g data-depth="12">' + streams + '</g><g data-depth="16">' + racks + '</g>' +
      '<g data-depth="22"><rect x="40" y="300" width="170" height="96" rx="14" class="sc-card"/><text x="58" y="326" class="sc-small">Uptime</text><text x="58" y="352" class="sc-big">99.9%</text>' +
      '<path class="sc-spark" d="M58 382 l18-6 18 4 18-12 18 5 18-10 18-3"/></g>';
  };

  S.pricing = function () {
    var bars = [70, 120, 95, 170, 140, 220].map(function (h, i) {
      return '<rect class="sc-rise" style="--d:' + (i * 0.18) + 's" x="' + (150 + i * 52) + '" y="' + (380 - h) + '" width="34" height="' + h + '" rx="6"/>';
    }).join('');
    var card = function (x, y, price, label, d) {
      return '<g class="sc-float" style="--d:' + d + 's"><rect x="' + x + '" y="' + y + '" width="130" height="74" rx="14" class="sc-card"/>' +
        '<text x="' + (x + 16) + '" y="' + (y + 26) + '" class="sc-small">' + label + '</text><text x="' + (x + 16) + '" y="' + (y + 56) + '" class="sc-big">' + price + '</text></g>';
    };
    return '<g data-depth="6"><path class="sc-axis" d="M130 382 H480"/></g><g data-depth="12">' + bars +
      '<path class="sc-trend" d="M167 300 L219 260 L271 280 L323 200 L375 225 L427 150"/></g>' +
      '<g data-depth="20">' + card(400, 40, '$300', 'Websites from', 0) + card(60, 80, '$8', 'Hosting / mo', 1.2) + '</g>';
  };

  S.about = function () {
    var dots = '';
    for (var y = 40; y <= 400; y += 18) {
      for (var x = 120; x <= 560; x += 18) {
        var dx = (x - 340) / 210, dy = (y - 220) / 190;
        if (dx * dx + dy * dy < 1) dots += '<circle cx="' + x + '" cy="' + y + '" r="2.2" class="sc-dot"/>';
      }
    }
    var hx = 412, hy = 290;
    var arcs = [[200, 120], [520, 110], [240, 360], [530, 360]].map(function (p, i) {
      var mx = (p[0] + hx) / 2, my = Math.min(p[1], hy) - 70;
      return '<path class="sc-arc" style="--d:' + (i * 0.7) + 's" d="M' + hx + ' ' + hy + ' Q' + mx + ' ' + my + ' ' + p[0] + ' ' + p[1] + '"/><circle cx="' + p[0] + '" cy="' + p[1] + '" r="5" class="sc-end"/>';
    }).join('');
    return '<g data-depth="6">' + dots + '</g><g data-depth="14">' + arcs + '</g>' +
      '<g data-depth="20"><circle cx="' + hx + '" cy="' + hy + '" r="10" class="sc-pulse"/><circle cx="' + hx + '" cy="' + hy + '" r="10" class="sc-pulse" style="--d:1s"/>' +
      '<circle cx="' + hx + '" cy="' + hy + '" r="8" class="sc-pin"/><rect x="' + (hx + 16) + '" y="' + (hy - 34) + '" width="92" height="30" rx="15" class="sc-pill"/><text x="' + (hx + 62) + '" y="' + (hy - 14) + '" class="sc-pill-t">Harare</text></g>';
  };

  S.blog = function () {
    var cardAt = function (x, y, w, i) {
      return '<g class="sc-float" style="--d:' + (i * 1.1) + 's"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="150" rx="14" class="sc-card"/>' +
        '<rect x="' + (x + 16) + '" y="' + (y + 16) + '" width="' + (w - 32) + '" height="46" rx="8" class="sc-thumb"/>' +
        [0, 1, 2].map(function (k) { return '<rect x="' + (x + 16) + '" y="' + (y + 76 + k * 18) + '" width="' + ((w - 32) * [0.9, 0.75, 0.5][k]) + '" height="8" rx="4" class="sc-line sc-write" style="--d:' + (i * 1.1 + k * 0.5) + 's"/>'; }).join('') + '</g>';
    };
    var tags = [['#WebDesign', 140, 40], ['#SEO', 470, 60], ['#AI', 520, 400], ['#GBP', 90, 400]].map(function (t, i) {
      return '<g class="sc-float" style="--d:' + (i * 0.8 + 0.3) + 's"><text x="' + t[1] + '" y="' + t[2] + '" class="sc-tag">' + t[0] + '</text></g>';
    }).join('');
    return '<g data-depth="8">' + cardAt(120, 90, 180, 0) + '</g><g data-depth="14">' + cardAt(320, 140, 200, 1) + '</g>' +
      '<g data-depth="20">' + cardAt(210, 250, 170, 2) + tags + '</g>';
  };

  S.contact = function () {
    var bubble = function (x, y, w, text, me, i) {
      return '<g class="sc-msg" style="--d:' + (i * 1.2) + 's"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="44" rx="18" class="' + (me ? 'sc-bubble-me' : 'sc-bubble') + '"/>' +
        '<text x="' + (x + 18) + '" y="' + (y + 28) + '" class="' + (me ? 'sc-bubble-me-t' : 'sc-bubble-t') + '">' + text + '</text></g>';
    };
    return '<g data-depth="6"><circle cx="470" cy="110" r="40" class="sc-ring"/><circle cx="470" cy="110" r="40" class="sc-ring" style="--d:1.2s"/><circle cx="470" cy="110" r="30" class="sc-core"/>' + icon('phone', 470, 110, 1.1) + '</g>' +
      '<g data-depth="16">' + bubble(150, 150, 240, 'Hi! Can you quote for a site?', false, 0) + bubble(250, 210, 230, 'Sure — fixed price, 30 days', true, 1) +
      bubble(150, 270, 190, 'Perfect, let’s talk 👍', false, 2) +
      '<g class="sc-msg" style="--d:3.6s"><rect x="370" y="330" width="80" height="40" rx="18" class="sc-bubble-me"/><circle cx="392" cy="350" r="5" class="sc-typing-dot"/><circle cx="410" cy="350" r="5" class="sc-typing-dot" style="--d:.2s"/><circle cx="428" cy="350" r="5" class="sc-typing-dot" style="--d:.4s"/></g></g>' +
      '<g data-depth="22"><circle cx="110" cy="360" r="30" class="sc-card"/>' + icon('mail', 110, 360) + '</g>';
  };

  S.legal = function () {
    return '<g data-depth="6"><circle cx="300" cy="215" r="120" class="sc-ring"/><circle cx="300" cy="215" r="120" class="sc-ring" style="--d:1.4s"/><circle cx="300" cy="215" r="170" class="sc-orbit"/></g>' +
      '<g data-depth="14"><path class="sc-shield" d="M300 105 L380 135 V215 C380 270 345 305 300 325 C255 305 220 270 220 215 V135 Z"/>' +
      '<path class="sc-check" d="M268 215 l22 22 42-46"/></g>' +
      '<g data-depth="22"><g class="sc-float"><rect x="430" y="70" width="110" height="140" rx="10" class="sc-card"/>' +
      [0, 1, 2, 3, 4].map(function (k) { return '<rect x="446" y="' + (92 + k * 20) + '" width="' + [78, 64, 78, 50, 70][k] + '" height="7" rx="3.5" class="sc-line"/>'; }).join('') + '</g>' +
      '<g class="sc-float" style="--d:1.5s"><circle cx="110" cy="320" r="36" class="sc-card"/>' + icon('lock', 110, 318, 1.2) + '</g></g>';
  };


  S.careers = function () {
    var steps = [['Learn', 120, 330], ['Build', 230, 260], ['Ship', 340, 190], ['Grow', 450, 120]];
    var blocks = steps.map(function (st, i) {
      var h = 440 - st[2];
      return '<g class="sc-float" style="--d:' + (i * 0.5) + 's"><rect x="' + (st[1] - 46) + '" y="' + st[2] + '" width="92" height="' + h + '" rx="12" class="sc-card"/>' +
        '<text x="' + st[1] + '" y="' + (st[2] + 32) + '" class="sc-label sc-step">' + st[0] + '</text></g>';
    }).join('');
    var path = 'M120 312 C175 312 175 242 230 242 S285 172 340 172 S395 102 450 102';
    return '<g data-depth="7">' + blocks + '</g>' +
      '<g data-depth="14"><path class="sc-route" d="' + path + '"/><path class="sc-route-live" d="' + path + '"/>' +
      '<circle r="9" class="sc-walker"><animateMotion dur="6s" repeatCount="indefinite" path="' + path + '"/></circle></g>' +
      '<g data-depth="22"><g class="sc-float" style="--d:.6s"><rect x="40" y="60" width="150" height="40" rx="20" class="sc-pill"/><text x="115" y="85" class="sc-pill-t">Harare · Hybrid</text></g>' +
      '<g class="sc-float" style="--d:1.4s"><rect x="470" y="300" width="120" height="40" rx="20" class="sc-pill"/><text x="530" y="325" class="sc-pill-t">We’re hiring</text></g>' +
      '<g class="sc-float" style="--d:2s"><circle cx="530" cy="60" r="30" class="sc-card"/>' + icon('monitor', 530, 60) + '</g></g>';
  };
  S.tech = S.services;

  // ---------------------------------------------------------------- mount hero scene
  var page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
  var map = { services: 'services', domains: 'domains', hosting: 'hosting', pricing: 'pricing', about: 'about',
    blog: 'blog', contact: 'contact', careers: 'careers', privacy: 'legal', terms: 'legal', cookies: 'legal' };
  var hero = document.querySelector('.page-hero:not(.hero-bg)');
  if (hero) {
    var kind = hero.getAttribute('data-scene') || map[page] || 'tech';
    var wrap = document.createElement('div');
    wrap.className = 'scene scene-' + kind;
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<svg viewBox="0 0 600 440" preserveAspectRatio="xMidYMid meet" xmlns="' + NS + '">' + S[kind]() + '</svg>';
    hero.insertBefore(wrap, hero.firstChild);
    hero.classList.add('has-scene');
    var typed = wrap.querySelector('.sc-typing'), caret = wrap.querySelector('.sc-caret');
    if (typed && caret && typed.getComputedTextLength) wrap.style.setProperty('--tw', typed.getComputedTextLength().toFixed(1) + 'px');
    if (!reduce) parallax(hero, wrap);
    pauseOffscreen(hero, wrap);
  }

  function parallax(host, scene) {
    if (!finePointer) return;
    var layers = Array.prototype.slice.call(scene.querySelectorAll('[data-depth]'));
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    var tick = function () {
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      layers.forEach(function (l) { var d = +l.getAttribute('data-depth'); l.style.transform = 'translate(' + (cx * d).toFixed(2) + 'px,' + (cy * d).toFixed(2) + 'px)'; });
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    host.addEventListener('pointermove', function (e) {
      var r = host.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    host.addEventListener('pointerleave', function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
  }

  function pauseOffscreen(host, el) {
    if (!('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (en) { el.classList.toggle('is-paused', !en[0].isIntersecting); }).observe(host);
  }

  // ---------------------------------------------------------------- CTA particle network
  var ctas = document.querySelectorAll('.cta-card, .help-band');
  Array.prototype.forEach.call(ctas, function (host) {
    var c = document.createElement('canvas');
    c.className = 'cta-canvas';
    c.setAttribute('aria-hidden', 'true');
    host.insertBefore(c, host.firstChild);
    host.classList.add('has-canvas');
    network(host, c);
  });

  function network(host, canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, pts = [], mouse = { x: -9999, y: -9999 }, running = false, raf = 0;
    var LIME = '169,206,71', WHITE = '255,255,255';
    var size = function () {
      var r = host.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.max(18, Math.min(70, Math.round(W * H / 9000)));
      pts = [];
      for (var i = 0; i < n; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: Math.random() * 1.6 + 0.8, lime: Math.random() < 0.22 });
      draw();
    };
    var draw = function () {
      ctx.clearRect(0, 0, W, H);
      var LINK = Math.min(140, W / 6);
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (running) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
          var mx = mouse.x - p.x, my = mouse.y - p.y, md = Math.sqrt(mx * mx + my * my);
          if (md < 160 && md > 1) { p.x += mx / md * 0.6; p.y += my / md * 0.6; }
        }
        for (var j = i + 1; j < pts.length; j++) {
          var q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK) { ctx.strokeStyle = 'rgba(' + WHITE + ',' + (0.16 * (1 - d / LINK)).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        }
        var md2 = Math.sqrt(Math.pow(mouse.x - p.x, 2) + Math.pow(mouse.y - p.y, 2));
        if (md2 < 160) { ctx.strokeStyle = 'rgba(' + LIME + ',' + (0.45 * (1 - md2 / 160)).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
        ctx.fillStyle = 'rgba(' + (p.lime ? LIME : WHITE) + ',' + (p.lime ? 0.9 : 0.55) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      if (running) raf = requestAnimationFrame(draw);
    };
    var start = function () { if (running || reduce) return; running = true; raf = requestAnimationFrame(draw); };
    var stop = function () { running = false; cancelAnimationFrame(raf); };
    host.addEventListener('pointermove', function (e) { var r = host.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    host.addEventListener('pointerleave', function () { mouse.x = mouse.y = -9999; });
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(host); else window.addEventListener('resize', size);
    size();
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { en[0].isIntersecting ? start() : stop(); }).observe(host);
    else start();
  }
})();
