// Shared Supabase client + small helpers used by every portal page.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, STORAGE_BUCKET } from './config.js';

export const isConfigured =
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export { STORAGE_BUCKET };

/** Redirect to login unless signed in. Returns { session, profile }. */
export async function requireSession({ admin = false } = {}) {
  if (!supabase) {
    window.location.replace('login.html?setup=1');
    return new Promise(() => {});
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.replace('login.html');
    return new Promise(() => {});
  }
  const { data: profile, error } = await supabase
    .from('profiles').select('*').eq('id', session.user.id).single();
  if (error) throw error;
  if (admin && profile.role !== 'admin') {
    window.location.replace('index.html');
    return new Promise(() => {});
  }
  return { session, profile };
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.replace('login.html');
}

// ---------- formatting -----------------------------------------------------
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (n, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(Number(n || 0));

export const date = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const ago = (d) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return date(d);
};

export const bytes = (b) => {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i ? 1 : 0)} ${u[i]}`;
};

export const STAGES = ['scope', 'design', 'build', 'launch', 'live'];
export const STAGE_LABEL = {
  scope: 'Scope', design: 'Design', build: 'Build', launch: 'Launch', live: 'Live', on_hold: 'On hold',
};

export const statusBadge = (status) => {
  const label = String(status || '').replace(/_/g, ' ');
  return `<span class="badge badge-${esc(status)}">${esc(label)}</span>`;
};

/** Signed, short-lived download URL for a private storage object. */
export async function signedUrl(path, seconds = 120) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

/** Safe storage key: <prefix>/<timestamp>-<slugged-name> */
export const storageKey = (prefix, file) => {
  const clean = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-');
  return `${prefix}/${Date.now()}-${clean}`;
};

// ---------- UI helpers -----------------------------------------------------
export function toast(msg, type = 'ok') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

export const initials = (name, email) =>
  (name || email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

/** Read a <form> into a plain object, trimming strings and dropping empties to null. */
export const formData = (form) =>
  Object.fromEntries([...new FormData(form).entries()].map(([k, v]) =>
    [k, typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v]));
