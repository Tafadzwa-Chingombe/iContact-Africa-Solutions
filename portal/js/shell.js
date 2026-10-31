// Shared app chrome for the client dashboard and the admin console:
// sidebar toggle, hash router, modal, and the signed-in user badge.
import { signOut, initials, esc } from './supabase.js';

export function initShell(profile, { routes, titles, onRoute }) {
  document.getElementById('user-name').textContent = profile.full_name || profile.email;
  document.getElementById('user-company').textContent = profile.company || profile.email;
  document.getElementById('user-avatar').textContent = initials(profile.full_name, profile.email);
  document.getElementById('signout').addEventListener('click', signOut);
  const adminLink = document.querySelector('.side-admin');
  if (adminLink && profile.role === 'admin') adminLink.hidden = false;

  // Mobile sidebar
  const sidebar = document.getElementById('sidebar');
  const scrim = document.querySelector('.scrim');
  const menuBtn = document.querySelector('.menu-btn');
  const setMenu = (open) => {
    sidebar.classList.toggle('open', open);
    scrim.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setMenu(!sidebar.classList.contains('open')));
  scrim.addEventListener('click', () => setMenu(false));

  // Router: #route or #route/param
  const go = () => {
    const [route = routes[0], param] = window.location.hash.slice(1).split('/');
    const name = routes.includes(route) ? route : routes[0];
    document.querySelectorAll('[data-route]').forEach((a) =>
      a.classList.toggle('active', a.dataset.route === name));
    const [eyebrow, title] = titles[name];
    document.getElementById('view-eyebrow').textContent = eyebrow;
    document.getElementById('view-title').textContent = title;
    document.title = `${title} — iContact Africa Client Portal`;
    setMenu(false);
    onRoute(name, param ? decodeURIComponent(param) : undefined);
  };
  window.addEventListener('hashchange', go);
  document.body.classList.remove('is-loading');
  go();
  return { rerender: go };
}

// ---------- Modal ------------------------------------------------------------
const modal = document.getElementById('modal');
modal?.addEventListener('click', (e) => {
  if (e.target === modal || e.target.closest('[data-close]')) modal.close();
});

/** Open the modal with HTML; returns the body element so callers can bind events. */
export function openModal(html, { wide = false } = {}) {
  modal.classList.toggle('modal-wide', wide);
  const body = modal.querySelector('.modal-body');
  body.innerHTML = html;
  modal.showModal();
  body.querySelector('input:not([type=hidden]), textarea, select')?.focus();
  return body;
}
export const closeModal = () => modal.close();

/** Disable a form's submit button while an async action runs. */
export async function withBusy(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try { return await fn(); } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

export const emptyState = (title, text, action = '') => `
  <div class="empty">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7"/></svg>
    <h3>${esc(title)}</h3><p>${esc(text)}</p>${action}
  </div>`;

/** Stage tracker used on project cards (client + admin). */
export function stageTracker(stage, STAGES, STAGE_LABEL) {
  const idx = STAGES.indexOf(stage);
  return `<ol class="stages${stage === 'on_hold' ? ' is-hold' : ''}">${STAGES.map((s, i) => `
    <li class="${i < idx ? 'done' : i === idx ? 'current' : ''}">
      <span class="dot">${i < idx ? '✓' : i + 1}</span><span class="lbl">${STAGE_LABEL[s]}</span>
    </li>`).join('')}</ol>`;
}
