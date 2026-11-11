// Admin console → Academy: courses & lessons, enrolment orders (approve → student login + access), students.
import { supabase, esc, date, ago, money, toast, formData } from './supabase.js';
import { SUPABASE_URL } from './config.js';
import { openModal, closeModal, withBusy, emptyState } from './shell.js';
import { slugify } from '../../assets/js/markdown.js';

const CAT = { marketing: 'Digital marketing', web: 'Website development' };
const METHOD = { ecocash: 'EcoCash', paynow: 'Paynow', bank: 'Bank transfer', other: 'Other' };
const lines = (t) => String(t || '').split('\n').map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 20);
const waNumber = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0') && d.length === 10) d = `263${d.slice(1)}`; return d; };
const loginUrl = () => new URL('login.html', location.href).href;
const publicCourseUrl = (slug) => new URL(`../course.html?slug=${encodeURIComponent(slug)}`, location.href).href;

export async function loadAcademy() {
  const [c, l, o, e] = await Promise.all([
    supabase.from('courses').select('*').order('sort_order').order('title'),
    supabase.from('lessons').select('id, course_id, module_title, title, sort_order, duration_min, is_preview, video_url').order('sort_order').order('created_at'),
    supabase.from('academy_orders').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('enrollments').select('*, profiles(full_name, email, phone)').order('created_at', { ascending: false }).limit(500),
  ]);
  const err = c.error || l.error || o.error || e.error;
  if (err) {
    if (/courses|lessons|academy_orders|enrollments/.test(err.message)) return { missing: true, courses: [], lessons: [], orders: [], enrollments: [] };
    toast(err.message, 'error'); return { courses: [], lessons: [], orders: [], enrollments: [] };
  }
  return { courses: c.data, lessons: l.data, orders: o.data, enrollments: e.data };
}

export const newOrderCount = (st) => (st.orders || []).filter((x) => x.status === 'new').length;

export function academyView(param, st, ctx) {
  if (st.missing) {
    return `<section class="card"><div class="empty"><h3>One-time setup needed</h3>
      <p>Run <code>supabase/migrations/20261111_academy.sql</code> (or the latest <code>supabase/schema.sql</code>) in Supabase → SQL Editor, then refresh.</p></div></section>`;
  }
  if (param === 'new' || (param && param.startsWith('c-'))) {
    const course = param === 'new' ? null : st.courses.find((x) => x.id === param.slice(2));
    setTimeout(() => bindEditor(course, st, ctx));
    return editorHtml(course, st);
  }
  const tab = sessionStorage.getItem('academyTab') || (newOrderCount(st) ? 'orders' : 'courses');
  setTimeout(() => bindList(st, ctx));
  const course = (id) => st.courses.find((c) => c.id === id);
  const lessonCount = (id) => st.lessons.filter((l) => l.course_id === id).length;
  const students = (id) => st.enrollments.filter((x) => x.course_id === id && x.status === 'active').length;
  const newOrders = st.orders.filter((o) => o.status === 'new');
  const done = st.orders.filter((o) => o.status !== 'new').slice(0, 30);

  const ordersTab = `
    <section class="card">
      <header class="card-head"><h3>New enrolment requests</h3><span class="muted small">Check the payment, then approve to create the student’s login</span></header>
      ${newOrders.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Student</th><th>Course</th><th>Payment</th><th>Received</th><th></th></tr></thead>
        <tbody>${newOrders.map((o) => `<tr>
          <td><strong>${esc(o.full_name)}</strong><span class="muted block">${esc(o.email)}${o.phone ? ` · ${esc(o.phone)}` : ''}</span></td>
          <td>${esc(course(o.course_id)?.title || '—')}<span class="muted block">${course(o.course_id) ? money(course(o.course_id).price, course(o.course_id).currency) : ''}</span></td>
          <td>${esc(METHOD[o.pay_method] || o.pay_method)}<span class="muted block">${o.pay_reference ? `Ref ${esc(o.pay_reference)}` : 'No reference yet'}</span></td>
          <td>${ago(o.created_at)}</td>
          <td class="row-actions"><button class="btn btn-primary btn-sm" data-approve="${o.id}">Approve</button>
            ${o.phone ? `<a class="btn btn-ghost btn-sm" href="https://wa.me/${waNumber(o.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
            <button class="btn btn-ghost btn-sm danger" data-reject="${o.id}">Reject</button></td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No new requests', 'When someone requests a place on a course, it appears here.')}
    </section>
    ${done.length ? `<section class="card"><header class="card-head"><h3>Recently handled</h3></header><div class="table-wrap"><table class="table">
      <thead><tr><th>Student</th><th>Course</th><th>Status</th><th>Received</th></tr></thead>
      <tbody>${done.map((o) => `<tr><td>${esc(o.full_name)}<span class="muted block">${esc(o.email)}</span></td><td>${esc(course(o.course_id)?.title || '—')}</td>
        <td><span class="badge ${o.status === 'approved' ? 'badge-paid' : 'badge-void'}">${esc(o.status)}</span></td><td>${date(o.created_at)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;

  const coursesTab = `
    <section class="card">
      ${st.courses.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Course</th><th>Price</th><th>Lessons</th><th>Students</th><th>Status</th><th></th></tr></thead>
        <tbody>${st.courses.map((c) => `<tr>
          <td><a href="#academy/c-${c.id}"><strong>${esc(c.title)}</strong></a><span class="muted block">${esc(CAT[c.category] || c.category)} · ${esc(c.level)}</span></td>
          <td>${money(c.price, c.currency)}</td><td>${lessonCount(c.id)}</td><td>${students(c.id)}</td>
          <td><span class="badge ${c.status === 'published' ? 'badge-paid' : 'badge-draft'}">${c.status === 'published' ? 'live' : 'draft'}</span></td>
          <td class="row-actions"><a class="btn btn-ghost btn-sm" href="#academy/c-${c.id}">Edit</a>${c.status === 'published' ? `<a class="btn btn-ghost btn-sm" href="${esc(publicCourseUrl(c.slug))}" target="_blank" rel="noopener">View ↗</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No courses yet', 'Create your first course, add lessons, then publish it to the Academy page.', '<a class="btn btn-primary" href="#academy/new">New course</a>')}
    </section>`;

  const studentsTab = `
    <section class="card">
      ${st.enrollments.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Student</th><th>Course</th><th>Paid</th><th>Enrolled</th><th>Status</th><th></th></tr></thead>
        <tbody>${st.enrollments.map((x) => `<tr>
          <td><strong>${esc(x.profiles?.full_name || x.profiles?.email || '—')}</strong><span class="muted block">${esc(x.profiles?.email || '')}</span></td>
          <td>${esc(course(x.course_id)?.title || '—')}</td>
          <td>${x.amount != null ? money(x.amount, x.currency) : '—'}<span class="muted block">${esc(METHOD[x.pay_method] || '')}${x.pay_reference ? ` · ${esc(x.pay_reference)}` : ''}</span></td>
          <td>${date(x.created_at)}</td>
          <td><span class="badge ${x.status === 'active' ? 'badge-paid' : 'badge-void'}">${esc(x.status)}</span></td>
          <td class="row-actions"><button class="btn btn-ghost btn-sm" data-sendlink="${x.id}">Login link</button>
            <button class="btn btn-ghost btn-sm" data-toggle-enrol="${x.id}">${x.status === 'active' ? 'Remove access' : 'Restore access'}</button></td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No students yet', 'Approved enrolments appear here.')}
    </section>`;

  return `
    <div class="toolbar">
      <div class="segmented" role="tablist">${[['orders', `Requests${newOrders.length ? ` (${newOrders.length})` : ''}`], ['courses', 'Courses'], ['students', 'Students']].map(([k, l]) => `<button data-atab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="btn-row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline" data-addstudent>Add a student</button><a class="btn btn-primary" href="#academy/new">New course</a></div>
    </div>
    ${tab === 'orders' ? ordersTab : tab === 'students' ? studentsTab : coursesTab}
    <p class="muted small">Public page: <a href="../academy.html" target="_blank" rel="noopener">Academy ↗</a> · Student view: <a href="academy.html">open the learning area</a></p>`;
}

// ---------- create the student's login + access ------------------------------------------
async function callInvite(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-client`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ ...body, role: 'student', redirectTo: loginUrl() }),
  }).catch(() => ({ ok: false, json: async () => ({ error: 'Can’t reach the invite-client function — has it been deployed?' }) }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.id) throw new Error(out.error || 'Could not create the student’s login');
  return out;
}

async function grantAccess({ courseId, name, email, phone, amount, method, reference, delivery }) {
  const acct = await callInvite({ email, full_name: name, phone, link: delivery === 'link', invite: delivery === 'email' });
  const { data: enr, error } = await supabase.from('enrollments')
    .upsert({ course_id: courseId, user_id: acct.id, status: 'active', amount, pay_method: method, pay_reference: reference || null }, { onConflict: 'course_id,user_id' })
    .select().single();
  if (error) throw error;
  return { acct, enr };
}

function resultModal({ acct, name, phone, course, delivery }) {
  const first = String(name || '').split(' ')[0] || 'there';
  const msg = acct.link
    ? `Hi ${first}, welcome to iContact Academy! Your place on "${course.title}" is confirmed. Tap this link to sign in and set your password: ${acct.link}\n\nAfter that, log in any time at ${loginUrl()}`
    : '';
  openModal(`
    <h2>Access granted ✓</h2>
    <p>${esc(name)} can now open <b>${esc(course.title)}</b>${acct.existing ? ' with their existing login' : ''}.</p>
    ${acct.link ? `
      <label class="field"><span>One-time sign-in link</span><input readonly value="${esc(acct.link)}" id="acad-link"></label>
      <div class="btn-row" style="display:flex;gap:8px;flex-wrap:wrap">
        ${phone ? `<a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(msg)}">Send on WhatsApp</a>` : ''}
        <button class="btn btn-outline" type="button" id="acad-copy">Copy message</button>
      </div>
      <p class="muted small">The link works once. If it expires, use “Login link” on the Students tab to make a new one.</p>`
      : `<p class="muted">${delivery === 'email' ? 'A sign-in email is on its way to them.' : ''}</p>`}
    <div class="btn-row"><button class="btn btn-ghost" data-close>Done</button></div>`);
  document.getElementById('acad-copy')?.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(msg); e.target.textContent = 'Copied ✓'; } catch { document.getElementById('acad-link').select(); }
  });
}

function accessForm({ title, course, st, name = '', email = '', phone = '', method = 'ecocash', reference = '' }) {
  return `
    <h2>${title}</h2>
    <form class="form">
      ${course ? `<p class="muted">${esc(course.title)} · ${money(course.price, course.currency)}</p><input type="hidden" name="course_id" value="${course.id}">`
        : `<label class="field"><span>Course</span><select name="course_id" required>${st.courses.map((c) => `<option value="${c.id}">${esc(c.title)} (${money(c.price, c.currency)})</option>`).join('')}</select></label>`}
      <div class="field-row">
        <label class="field"><span>Full name</span><input name="full_name" required value="${esc(name)}"></label>
        <label class="field"><span>Email (their login)</span><input type="email" name="email" required value="${esc(email)}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>WhatsApp number</span><input name="phone" value="${esc(phone)}"></label>
        <label class="field"><span>Amount received</span><input type="number" step="0.01" min="0" name="amount" value="${course ? esc(course.price) : ''}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Payment method</span><select name="pay_method">${Object.entries(METHOD).map(([k, v]) => `<option value="${k}"${k === method ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Transaction ID</span><input name="pay_reference" value="${esc(reference)}"></label>
      </div>
      <fieldset class="field"><legend>Send their login</legend>
        <label class="check-inline"><input type="radio" name="delivery" value="link" checked> Give me a sign-in link to send on WhatsApp (recommended)</label>
        <label class="check-inline"><input type="radio" name="delivery" value="email"> Email it to them</label>
      </fieldset>
      <button class="btn btn-primary" type="submit">Confirm payment &amp; give access</button>
      <p class="muted small">Only confirm once the payment has reached your account.</p>
    </form>`;
}

function bindAccessForm(body, st, ctx, onDone) {
  const form = body.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(form);
    const course = st.courses.find((c) => c.id === v.course_id);
    await withBusy(form, async () => {
      try {
        const res = await grantAccess({ courseId: v.course_id, name: v.full_name, email: v.email, phone: v.phone, amount: v.amount == null ? null : Number(v.amount), method: v.pay_method, reference: v.pay_reference, delivery: v.delivery });
        if (onDone) await onDone(res);
        await ctx.reload();
        resultModal({ acct: res.acct, name: v.full_name, phone: v.phone, course, delivery: v.delivery });
        ctx.rerender();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

function bindList(st, ctx) {
  const root = document.getElementById('view');
  root.querySelectorAll('[data-atab]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('academyTab', b.dataset.atab); ctx.rerender(); }));
  root.querySelector('[data-addstudent]')?.addEventListener('click', () => {
    if (!st.courses.length) return toast('Create a course first', 'error');
    bindAccessForm(openModal(accessForm({ title: 'Add a student', st })), st, ctx);
  });
  root.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => {
    const o = st.orders.find((x) => x.id === b.dataset.approve);
    const course = st.courses.find((c) => c.id === o.course_id);
    const body = openModal(accessForm({ title: 'Approve enrolment', course, st, name: o.full_name, email: o.email, phone: o.phone, method: o.pay_method, reference: o.pay_reference }));
    bindAccessForm(body, st, ctx, async ({ enr }) => {
      const { error } = await supabase.from('academy_orders').update({ status: 'approved', enrollment_id: enr.id }).eq('id', o.id);
      if (error) toast(error.message, 'error');
    });
  }));
  root.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Reject this request? It moves to “Recently handled”; nothing is sent to the person.')) return;
    const { error } = await supabase.from('academy_orders').update({ status: 'rejected' }).eq('id', b.dataset.reject);
    if (error) return toast(error.message, 'error');
    await ctx.reload(); ctx.rerender();
  }));
  root.querySelectorAll('[data-toggle-enrol]').forEach((b) => b.addEventListener('click', async () => {
    const x = st.enrollments.find((y) => y.id === b.dataset.toggleEnrol);
    const to = x.status === 'active' ? 'cancelled' : 'active';
    if (to === 'cancelled' && !confirm('Remove this student’s access to the course? You can restore it later.')) return;
    const { error } = await supabase.from('enrollments').update({ status: to }).eq('id', x.id);
    if (error) return toast(error.message, 'error');
    await ctx.reload(); ctx.rerender();
  }));
  root.querySelectorAll('[data-sendlink]').forEach((b) => b.addEventListener('click', async () => {
    const x = st.enrollments.find((y) => y.id === b.dataset.sendlink);
    b.disabled = true;
    try {
      const acct = await callInvite({ email: x.profiles?.email, full_name: x.profiles?.full_name, link: true });
      resultModal({ acct, name: x.profiles?.full_name, phone: x.profiles?.phone, course: st.courses.find((c) => c.id === x.course_id), delivery: 'link' });
    } catch (err) { toast(err.message, 'error'); }
    b.disabled = false;
  }));
}

// ---------- course + lessons editor ------------------------------------------------------
function editorHtml(c, st) {
  const v = c || { category: 'marketing', level: 'beginner', currency: 'USD', price: '', status: 'draft', outcomes: [], sort_order: st.courses.length };
  const ls = c ? st.lessons.filter((l) => l.course_id === c.id) : [];
  return `
    <a href="#academy" class="back-link">← All courses</a>
    <form class="card form course-editor" id="course-form" novalidate>
      <div class="field-row">
        <label class="field"><span>Course title</span><input name="title" required minlength="3" maxlength="120" value="${esc(v.title)}"></label>
        <label class="field"><span>Web address <small class="muted">(course.html?slug=…)</small></span><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="80" value="${esc(v.slug)}"></label>
      </div>
      <label class="field"><span>Short description <small class="muted">(shown on the course card)</small></span><input name="subtitle" maxlength="200" value="${esc(v.subtitle)}"></label>
      <div class="field-row">
        <label class="field"><span>Category</span><select name="category">${Object.entries(CAT).map(([k, l]) => `<option value="${k}"${k === v.category ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Level</span><select name="level">${['beginner', 'intermediate', 'advanced'].map((k) => `<option${k === v.level ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Price</span><input type="number" step="0.01" min="0" name="price" required value="${esc(v.price)}"></label>
        <label class="field"><span>Currency</span><select name="currency">${['USD', 'ZWG', 'ZAR'].map((k) => `<option${k === v.currency ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Length <small class="muted">(e.g. “3 hours”; blank = from lessons)</small></span><input name="duration_text" maxlength="60" value="${esc(v.duration_text)}"></label>
        <label class="field"><span>Order on the Academy page</span><input type="number" name="sort_order" value="${esc(v.sort_order)}"></label>
      </div>
      <label class="field"><span>What students will learn <small class="muted">(one per line)</small></span><textarea name="outcomes" rows="5">${esc((v.outcomes || []).join('\n'))}</textarea></label>
      <label class="field"><span>About this course</span><textarea name="description" rows="5" maxlength="4000">${esc(v.description)}</textarea></label>
      <label class="field"><span>Who it’s for</span><textarea name="who_for" rows="2" maxlength="600">${esc(v.who_for)}</textarea></label>
      <label class="field"><span>Cover image URL <small class="muted">(optional, 16:9)</small></span><input type="url" name="cover_url" maxlength="500" value="${esc(v.cover_url)}"></label>
      <div class="btn-row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-ghost" type="submit" data-action="draft">${v.status === 'published' ? 'Unpublish (save as draft)' : 'Save draft'}</button>
        <button class="btn btn-primary" type="submit" data-action="published">${v.status === 'published' ? 'Save changes' : 'Publish to the Academy'}</button>
        ${c ? `<span class="badge ${v.status === 'published' ? 'badge-paid' : 'badge-draft'}">${v.status === 'published' ? 'live' : 'draft'}</span>` : ''}
        ${c ? '<button class="btn btn-ghost danger" type="button" id="course-delete" style="margin-left:auto">Delete course</button>' : ''}
      </div>
    </form>
    ${c ? `<section class="card">
      <header class="card-head"><h3>Lessons (${ls.length})</h3><button class="btn btn-primary btn-sm" type="button" data-lesson="new">Add lesson</button></header>
      ${ls.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>Lesson</th><th>Video</th><th>Preview</th><th></th></tr></thead>
        <tbody>${ls.map((l, i) => `<tr>
          <td>${i + 1}</td><td><strong>${esc(l.title)}</strong><span class="muted block">${esc(l.module_title)}${l.duration_min ? ` · ${l.duration_min} min` : ''}</span></td>
          <td>${l.video_url ? '✓' : '<span class="muted">—</span>'}</td><td>${l.is_preview ? 'Free' : ''}</td>
          <td class="row-actions"><button class="btn btn-ghost btn-sm" data-move="${l.id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button>
            <button class="btn btn-ghost btn-sm" data-move="${l.id}" data-dir="1" ${i < ls.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button>
            <button class="btn btn-ghost btn-sm" data-lesson="${l.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No lessons yet', 'Add lessons with a video link (YouTube, Vimeo, Google Drive, Loom or an MP4) and notes.')}
      <p class="muted small">Tip: use <b>unlisted</b> YouTube or Vimeo videos. Mark one or two lessons as a free preview so visitors can try the course.</p>
    </section>` : ''}`;
}

async function bindEditor(c, st, ctx) {
  const form = document.getElementById('course-form');
  if (!form) return;
  let dirty = false;
  if (!c) form.title.addEventListener('input', () => { if (!form.slug.dataset.touched) form.slug.value = slugify(form.title.value).slice(0, 80); });
  form.slug.addEventListener('input', () => { form.slug.dataset.touched = '1'; });
  form.addEventListener('input', () => { dirty = true; });
  window.onbeforeunload = () => (dirty ? 'You have unsaved changes' : undefined);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = e.submitter?.dataset.action === 'published' ? 'published' : 'draft';
    if (!form.reportValidity()) return;
    const row = {
      title: form.title.value.trim(), slug: form.slug.value.trim(), subtitle: form.subtitle.value.trim() || null,
      category: form.category.value, level: form.level.value, price: Number(form.price.value), currency: form.currency.value,
      duration_text: form.duration_text.value.trim() || null, sort_order: Number(form.sort_order.value) || 0,
      outcomes: lines(form.outcomes.value), description: form.description.value.trim() || null, who_for: form.who_for.value.trim() || null,
      cover_url: form.cover_url.value.trim() || null, status,
    };
    if (status === 'published' && c && !st.lessons.some((l) => l.course_id === c.id) && !confirm('This course has no lessons yet. Publish anyway?')) return;
    const q = c ? supabase.from('courses').update(row).eq('id', c.id).select().single() : supabase.from('courses').insert(row).select().single();
    const { data, error } = await q;
    if (error) return toast(/duplicate key/.test(error.message) ? 'That web address is already used by another course' : error.message, 'error');
    dirty = false; window.onbeforeunload = null;
    await ctx.reload();
    toast(status === 'published' ? 'Published — it’s on the Academy page' : 'Saved as draft');
    if (!c) location.hash = `#academy/c-${data.id}`; else ctx.rerender();
  });

  document.getElementById('course-delete')?.addEventListener('click', async () => {
    const n = st.enrollments.filter((x) => x.course_id === c.id).length;
    if (!confirm(`Delete “${c.title}”${n ? ` and its ${n} student enrolment(s)` : ''}? Lessons are deleted too. This can’t be undone.`)) return;
    const { error } = await supabase.from('courses').delete().eq('id', c.id);
    if (error) return toast(error.message, 'error');
    dirty = false; window.onbeforeunload = null; await ctx.reload(); toast('Course deleted'); location.hash = '#academy';
  });

  const root = document.getElementById('view');
  root.querySelectorAll('[data-lesson]').forEach((b) => b.addEventListener('click', () => lessonForm(c, b.dataset.lesson === 'new' ? null : b.dataset.lesson, st, ctx)));
  root.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
    const ls = st.lessons.filter((l) => l.course_id === c.id);
    const i = ls.findIndex((l) => l.id === b.dataset.move); const j = i + Number(b.dataset.dir);
    if (j < 0 || j >= ls.length) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
    const results = await Promise.all(ls.map((l, k) => supabase.from('lessons').update({ sort_order: k }).eq('id', l.id)));
    const err = results.find((r) => r.error)?.error;
    if (err) toast(err.message, 'error');
    await ctx.reload(); ctx.rerender();
  }));
}

async function lessonForm(c, id, st, ctx) {
  let l = { module_title: st.lessons.filter((x) => x.course_id === c.id).slice(-1)[0]?.module_title || 'Getting started', is_preview: false };
  if (id) {
    const { data, error } = await supabase.from('lessons').select('*').eq('id', id).single();
    if (error) return toast(error.message, 'error');
    l = data;
  }
  const modules = [...new Set(st.lessons.filter((x) => x.course_id === c.id).map((x) => x.module_title))];
  const body = openModal(`
    <h2>${id ? 'Edit lesson' : 'Add lesson'}</h2>
    <form class="form">
      <div class="field-row">
        <label class="field"><span>Module / section</span><input name="module_title" list="acad-modules" required maxlength="120" value="${esc(l.module_title)}"></label>
        <label class="field"><span>Length (minutes)</span><input type="number" min="0" max="600" name="duration_min" value="${esc(l.duration_min)}"></label>
      </div>
      <datalist id="acad-modules">${modules.map((m) => `<option>${esc(m)}</option>`).join('')}</datalist>
      <label class="field"><span>Lesson title</span><input name="title" required minlength="2" maxlength="160" value="${esc(l.title)}"></label>
      <label class="field"><span>Video link <small class="muted">(YouTube, Vimeo, Google Drive, Loom or .mp4)</small></span><input type="url" name="video_url" maxlength="500" value="${esc(l.video_url)}" placeholder="https://"></label>
      <label class="field"><span>Notes <small class="muted">(Markdown: ## headings, **bold**, - lists, [links](https://…))</small></span><textarea name="body" rows="10">${esc(l.body)}</textarea></label>
      <label class="check-inline"><input type="checkbox" name="is_preview" ${l.is_preview ? 'checked' : ''}> Free preview: anyone can watch this lesson from the course page</label>
      <div class="btn-row"><button class="btn btn-primary" type="submit">${id ? 'Save lesson' : 'Add lesson'}</button>
        ${id ? '<button class="btn btn-ghost danger" type="button" id="lesson-delete">Delete</button>' : ''}</div>
    </form>`, { wide: true });
  const form = body.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = { module_title: form.module_title.value.trim() || 'Lessons', title: form.title.value.trim(), duration_min: form.duration_min.value ? Number(form.duration_min.value) : null,
      video_url: form.video_url.value.trim() || null, body: form.body.value.trim() || null, is_preview: form.is_preview.checked };
    await withBusy(form, async () => {
      const q = id ? supabase.from('lessons').update(row).eq('id', id)
        : supabase.from('lessons').insert({ ...row, course_id: c.id, sort_order: st.lessons.filter((x) => x.course_id === c.id).length });
      const { error } = await q;
      if (error) return toast(error.message, 'error');
      closeModal(); toast(id ? 'Lesson saved' : 'Lesson added'); await ctx.reload(); ctx.rerender();
    });
  });
  body.querySelector('#lesson-delete')?.addEventListener('click', async () => {
    if (!confirm(`Delete “${l.title}”?`)) return;
    const { error } = await supabase.from('lessons').delete().eq('id', id);
    if (error) return toast(error.message, 'error');
    closeModal(); toast('Lesson deleted'); await ctx.reload(); ctx.rerender();
  });
}
