import { supabase, isConfigured } from './supabase.js';

const views = document.querySelectorAll('[data-view]');
const show = (name) => {
  views.forEach((v) => { v.hidden = v.dataset.view !== name; });
  document.querySelector(`[data-view="${name}"] input`)?.focus();
};
const msg = (form, text, type = 'error') => {
  const el = form.querySelector('.form-msg');
  el.textContent = text;
  el.className = `form-msg ${type}`;
};
const busy = (form, on) => {
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = on;
  btn.dataset.label ??= btn.textContent;
  btn.textContent = on ? 'Please wait…' : btn.dataset.label;
};

document.querySelectorAll('[data-go]').forEach((b) =>
  b.addEventListener('click', () => {
    // carry the typed email between views
    const email = b.closest('form')?.querySelector('input[type=email]')?.value;
    show(b.dataset.go);
    const target = document.querySelector(`[data-view="${b.dataset.go}"] input[type=email]`);
    if (target && email) target.value = email;
  }));

const redirectTo = new URL('login.html', window.location.href).href;

async function goToDashboard(userId) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
  window.location.replace(data?.role === 'admin' ? 'admin.html' : 'index.html');
}

if (!isConfigured) {
  document.querySelector('.setup-warning').hidden = false;
  document.querySelectorAll('.auth-form button').forEach((b) => { b.disabled = true; });
} else {
  // Arriving from an invite or a password-reset email → ask for a new password.
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const linkType = hash.get('type');
  let pendingReset = linkType === 'recovery' || linkType === 'invite';
  if (pendingReset) show('reset');

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { pendingReset = true; show('reset'); return; }
    if (event === 'SIGNED_IN' && session && !pendingReset) goToDashboard(session.user.id);
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (session && !pendingReset) goToDashboard(session.user.id);

  // ---- Sign in --------------------------------------------------------------
  document.querySelector('[data-view="signin"]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.reportValidity()) return;
    busy(f, true);
    const { error } = await supabase.auth.signInWithPassword({
      email: f.email.value.trim(), password: f.password.value,
    });
    busy(f, false);
    if (error) msg(f, error.message === 'Invalid login credentials'
      ? 'That email and password don’t match. Try again or use a sign-in link.' : error.message);
  });

  // ---- Magic link -----------------------------------------------------------
  document.querySelector('[data-view="magic"]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.reportValidity()) return;
    busy(f, true);
    const { error } = await supabase.auth.signInWithOtp({
      email: f.email.value.trim(),
      // Only invited clients may sign in — never create accounts from this form.
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    });
    busy(f, false);
    // Same message either way so the form can't be used to test which emails have accounts.
    if (error && error.status !== 400 && error.status !== 422) msg(f, error.message);
    else msg(f, 'If that email has portal access, a sign-in link is on its way. Check your inbox.', 'ok');
  });

  // ---- Forgot password ------------------------------------------------------
  document.querySelector('[data-view="forgot"]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.reportValidity()) return;
    busy(f, true);
    await supabase.auth.resetPasswordForEmail(f.email.value.trim(), { redirectTo });
    busy(f, false);
    msg(f, 'If that email has portal access, a reset link is on its way.', 'ok');
  });

  // ---- Set new password -----------------------------------------------------
  document.querySelector('[data-view="reset"]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.reportValidity()) return;
    if (f.password.value !== f.confirm.value) { msg(f, 'Passwords don’t match.'); return; }
    busy(f, true);
    const { data, error } = await supabase.auth.updateUser({ password: f.password.value });
    busy(f, false);
    if (error) { msg(f, error.message); return; }
    pendingReset = false;
    history.replaceState(null, '', 'login.html');
    msg(f, 'Password saved. Taking you to your dashboard…', 'ok');
    setTimeout(() => goToDashboard(data.user.id), 800);
  });
}

if (new URLSearchParams(window.location.search).has('setup')) {
  document.querySelector('.setup-warning').hidden = false;
}
