// iContact Academy — the student's learning area (portal/academy.html).
// Students see the courses they are enrolled in; admins see every course so they can check lessons.
// Lesson content is protected by row-level security: only enrolled students (and admins) can read it.
import { supabase, requireSession, esc, toast } from './supabase.js';
import { initShell, emptyState } from './shell.js';
import { renderMarkdown } from '../../assets/js/markdown.js';
import { videoEmbed } from '../../assets/js/academy-video.js';

const { session, profile } = await requireSession();
const me = session.user.id;
const isAdmin = profile.role === 'admin';
const view = document.getElementById('view');
if (profile.role !== 'student') document.querySelector('.side-client').hidden = false;

const state = { courses: [], lessons: {}, done: new Set() };
const CAT = { marketing: 'Digital marketing', web: 'Website development' };

async function load() {
  let courses;
  if (isAdmin) {
    const { data, error } = await supabase.from('courses').select('*').order('sort_order').order('title');
    if (error) return failed(error);
    courses = data;
  } else {
    const { data, error } = await supabase.from('enrollments').select('created_at, courses(*)').eq('user_id', me).eq('status', 'active').order('created_at', { ascending: false });
    if (error) return failed(error);
    courses = data.map((e) => e.courses).filter(Boolean);
  }
  const ids = courses.map((c) => c.id);
  const [l, p] = await Promise.all([
    ids.length ? supabase.from('lessons').select('id, course_id, module_title, title, sort_order, duration_min').in('course_id', ids).order('sort_order').order('created_at') : { data: [] },
    supabase.from('lesson_progress').select('lesson_id').eq('user_id', me),
  ]);
  if (l.error || p.error) return failed(l.error || p.error);
  state.courses = courses;
  state.lessons = {};
  l.data.forEach((x) => { (state.lessons[x.course_id] ||= []).push(x); });
  state.done = new Set(p.data.map((x) => x.lesson_id));
  return true;
}

function failed(err) {
  const missing = /courses|enrollments|lessons|lesson_progress/.test(err.message || '');
  view.innerHTML = `<section class="card"><div class="empty"><h3>${missing ? 'The Academy isn’t set up yet' : 'Something went wrong'}</h3>
    <p>${missing ? 'Run supabase/migrations/20261111_academy.sql in Supabase → SQL Editor, then refresh.' : esc(err.message)}</p></div></section>`;
  return false;
}

const progress = (cid) => {
  const ls = state.lessons[cid] || [];
  const n = ls.filter((x) => state.done.has(x.id)).length;
  return { n, total: ls.length, pct: ls.length ? Math.round((100 * n) / ls.length) : 0 };
};
const nextLesson = (cid) => (state.lessons[cid] || []).find((x) => !state.done.has(x.id)) || (state.lessons[cid] || [])[0];

function coursesView() {
  if (!state.courses.length) {
    return `<section class="card">${emptyState(isAdmin ? 'No courses yet' : 'You’re not enrolled in a course yet',
      isAdmin ? 'Create your first course in Admin Console → Academy.' : 'Browse the Academy, request your place, and your course will appear here once your payment is confirmed.',
      `<a class="btn btn-primary" href="${isAdmin ? 'admin.html#academy' : '../academy.html'}">${isAdmin ? 'Open Academy admin' : 'Browse courses'}</a>`)}</section>`;
  }
  return `<div class="learn-grid">${state.courses.map((c) => {
    const pr = progress(c.id); const nx = nextLesson(c.id);
    const label = !pr.total ? 'Lessons coming soon' : pr.n === pr.total ? 'Completed ✓' : pr.n ? 'Continue' : 'Start course';
    return `<article class="card learn-card">
      <p class="eyebrow">${esc(CAT[c.category] || 'Course')}${isAdmin && c.status !== 'published' ? ' · <span class="badge badge-draft">draft</span>' : ''}</p>
      <h3>${esc(c.title)}</h3>
      ${c.subtitle ? `<p class="muted">${esc(c.subtitle)}</p>` : ''}
      <div class="learn-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pr.pct}" aria-label="Progress"><span style="width:${pr.pct}%"></span></div>
      <p class="muted small">${pr.n} of ${pr.total} lessons complete</p>
      ${pr.total ? `<a class="btn btn-primary btn-sm" href="#course/${encodeURIComponent(c.slug)}~${nx.id}">${label}</a>` : `<span class="muted small">${label}</span>`}
    </article>`;
  }).join('')}</div>`;
}

async function courseView(param = '') {
  const [slug, lessonId] = param.split('~');
  const c = state.courses.find((x) => x.slug === slug);
  if (!c) { location.hash = '#courses'; return ''; }
  const ls = state.lessons[c.id] || [];
  const current = ls.find((x) => x.id === lessonId) || nextLesson(c.id);
  document.getElementById('view-title').textContent = c.title;
  document.getElementById('view-eyebrow').textContent = 'Academy · ' + (CAT[c.category] || 'Course');
  if (!current) return `<section class="card">${emptyState('Lessons coming soon', 'This course has no lessons yet.')}</section>`;

  const { data: lesson, error } = await supabase.from('lessons').select('*').eq('id', current.id).single();
  if (error) { toast(error.message, 'error'); return ''; }
  const idx = ls.findIndex((x) => x.id === current.id);
  const next = ls[idx + 1]; const prev = ls[idx - 1];
  const pr = progress(c.id);
  const modules = [];
  ls.forEach((l) => { let m = modules.find((x) => x.title === l.module_title); if (!m) { m = { title: l.module_title, items: [] }; modules.push(m); } m.items.push(l); });
  const done = state.done.has(current.id);
  return `<div class="player">
    <aside class="card player-nav" aria-label="Lessons">
      <a class="back-link" href="#courses">← My courses</a>
      <div class="learn-progress"><span style="width:${pr.pct}%"></span></div>
      <p class="muted small">${pr.n} of ${pr.total} complete</p>
      ${modules.map((m) => `<p class="player-module">${esc(m.title)}</p><ol>${m.items.map((l) => `
        <li><a href="#course/${encodeURIComponent(c.slug)}~${l.id}" class="${l.id === current.id ? 'current' : ''}${state.done.has(l.id) ? ' done' : ''}"${l.id === current.id ? ' aria-current="true"' : ''}>
          <span class="tick" aria-hidden="true">${state.done.has(l.id) ? '✓' : ''}</span><span>${esc(l.title)}</span>${l.duration_min ? `<small>${l.duration_min}m</small>` : ''}</a></li>`).join('')}</ol>`).join('')}
    </aside>
    <article class="card player-main">
      <p class="eyebrow">${esc(lesson.module_title)} · Lesson ${idx + 1} of ${ls.length}</p>
      <h2>${esc(lesson.title)}</h2>
      ${videoEmbed(lesson.video_url, lesson.title)}
      ${lesson.body ? `<div class="prose lesson-notes">${renderMarkdown(lesson.body)}</div>` : (lesson.video_url ? '' : '<p class="muted">This lesson’s video and notes are on their way.</p>')}
      <div class="player-actions">
        ${prev ? `<a class="btn btn-ghost" href="#course/${encodeURIComponent(c.slug)}~${prev.id}">← Previous</a>` : '<span></span>'}
        <button class="btn ${done ? 'btn-outline' : 'btn-primary'}" data-complete="${current.id}" data-next="${next ? next.id : ''}">${done ? (next ? 'Next lesson →' : 'Back to my courses') : (next ? 'Mark complete & next →' : 'Mark complete')}</button>
      </div>
    </article>
  </div>`;
}

let route = 'courses'; let param;
async function render() {
  view.innerHTML = '<div class="skeleton-grid"><div></div><div></div></div>';
  view.innerHTML = route === 'course' ? await courseView(param) : coursesView();
  view.focus({ preventScroll: true });
}

view.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-complete]');
  if (!b) return;
  const id = b.dataset.complete;
  const [slug] = (param || '').split('~');
  if (!state.done.has(id)) {
    b.disabled = true;
    const { error } = await supabase.from('lesson_progress').upsert({ user_id: me, lesson_id: id }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true });
    b.disabled = false;
    if (error) return toast(error.message, 'error');
    state.done.add(id);
  }
  location.hash = b.dataset.next ? `#course/${encodeURIComponent(slug)}~${b.dataset.next}` : '#courses';
  if (!b.dataset.next) toast('Course progress saved');
});

if (await load()) {
  initShell(profile, {
    routes: ['courses', 'course'],
    titles: { courses: ['Academy', 'My courses'], course: ['Academy', 'Course'] },
    onRoute(r, p) { route = r; param = p; render(); window.scrollTo(0, 0); },
  });
} else {
  document.body.classList.remove('is-loading');
}
