// Cookieless, privacy-friendly page-view counter → Admin Console → Live traffic.
// No cookies, no IP address, no cross-site tracking. A random id lives in
// sessionStorage for this tab only, so a visit can be counted once and shown as "live".
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../portal/js/config.js';

(() => {
  try {
    const nav = navigator;
    const testing = window.__icTrackTest === true;
    if (!testing) {
      if (nav.doNotTrack === '1' || window.doNotTrack === '1' || nav.globalPrivacyControl) return;
      if (nav.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(nav.userAgent)) return;
      if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || location.protocol === 'file:') return;
    }
    if (SUPABASE_URL.includes('YOUR-PROJECT-REF')) return;
    // Don't count the team or clients while they're signed in to the portal.
    if (Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k))) return;

    const root = new URL('../../', import.meta.url);
    let path = location.pathname.startsWith(root.pathname) ? `/${location.pathname.slice(root.pathname.length)}` : location.pathname;
    if (path === '/' || path.endsWith('/')) path += 'index.html';
    if (path.startsWith('/portal/')) return;
    if (location.pathname.endsWith('article.html') && location.search) path += location.search.replace(/&.*$/, '');

    let sid = sessionStorage.getItem('ic_sid');
    if (!sid) { sid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 24); sessionStorage.setItem('ic_sid', sid); }

    let ref = '';
    try { const r = document.referrer && new URL(document.referrer); if (r && r.hostname !== location.hostname) ref = r.hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    const q = new URLSearchParams(location.search);
    const ua = nav.userAgent;
    const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop';
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other';
    const cut = (s, n) => (s ? String(s).slice(0, n) : null);
    const id = crypto.randomUUID ? crypto.randomUUID() : null;
    if (!id) return;

    const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
    fetch(`${SUPABASE_URL}/rest/v1/page_views`, {
      method: 'POST', keepalive: true, headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        id, session_id: sid, path: cut(path, 300), title: cut(document.title, 200), referrer: cut(ref, 300),
        utm_source: cut(q.get('utm_source'), 80), utm_campaign: cut(q.get('utm_campaign'), 80),
        device, browser, language: cut(nav.language, 20),
        timezone: cut(Intl.DateTimeFormat().resolvedOptions().timeZone, 60), screen_w: Math.min(screen.width || 0, 10000),
      }),
    }).then((res) => {
      if (!res.ok) return;
      // Heartbeat while the tab is visible, so the admin sees who's on the site now.
      const started = Date.now();
      const ping = () => {
        if (document.visibilityState !== 'visible' || Date.now() - started > 30 * 60e3) return;
        fetch(`${SUPABASE_URL}/rest/v1/rpc/pv_ping`, { method: 'POST', keepalive: true, headers, body: JSON.stringify({ p_id: id, p_session: sid }) }).catch(() => {});
      };
      setInterval(ping, 30e3);
      document.addEventListener('visibilitychange', ping);
    }).catch(() => {});
  } catch { /* analytics must never break the page */ }
})();
