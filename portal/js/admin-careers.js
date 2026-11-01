// Admin console → Careers: post, edit, publish, close and delete job vacancies.
// Published jobs appear on careers.html and close automatically after closes_on.
import { supabase, esc, date, toast } from './supabase.js';
import { emptyState } from './shell.js';

const COLS = 'id,title,location,employment_type,department,closes_on,status,updated_at';
const todayHarare = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);

export async function loadJobs() {
  const { data, error } = await supabase.from('jobs').select(COLS).order('updated_at', { ascending: false });
  if (error) {
    // Table not created yet → show setup hint in the view instead of failing the console
    if (/jobs/.test(error.message)) return { missing: true, rows: [] };
    toast(error.message, 'error'); return { rows: [] };
  }
  return { rows: data };
}

const stateOf = (j) => (j.status !== 'published' ? 'draft' : (j.closes_on && j.closes_on < todayHarare() ? 'closed' : 'open'));
const badge = (j) => {
  const s = stateOf(j);
  return `<span class="badge ${{ draft: 'badge-draft', open: 'badge-paid', closed: 'badge-void' }[s]}">${s}</span>`;
};
const careersUrl = () => new URL('../careers.html#vacancies', location.href).href;

export function careersView(param, jobsState, ctx) {
  if (jobsState.missing) {
    return `<section class="card"><div class="empty">
      <h3>One-time setup needed</h3>
      <p>Run <code>supabase/migrations/20261101_jobs.sql</code> (or the latest <code>supabase/schema.sql</code>) in Supabase → SQL Editor to create the jobs table, then refresh.</p></div></section>`;
  }
  if (param) { setTimeout(() => bindEditor(param === 'new' ? null : param, ctx)); return editorHtml(); }
  const jobs = jobsState.rows;
  const n = { open: 0, closed: 0, draft: 0 };
  jobs.forEach((j) => { n[stateOf(j)]++; });
  return `
    <div class="toolbar">
      <p class="muted">${n.open} open · ${n.closed} closed · ${n.draft} draft${n.draft === 1 ? '' : 's'} · <a href="${esc(careersUrl())}" target="_blank" rel="noopener">View Careers page ↗</a></p>
      <a class="btn btn-primary" href="#careers/new">Post a job</a>
    </div>
    <section class="card">
      ${jobs.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Role</th><th>Status</th><th>Closes</th><th>Last edited</th><th></th></tr></thead>
        <tbody>${jobs.map((j) => `<tr>
          <td><a href="#careers/${j.id}"><strong>${esc(j.title)}</strong></a>
            <span class="muted block">${esc([j.location, j.employment_type, j.department].filter(Boolean).join(' · ') || '—')}</span></td>
          <td>${badge(j)}</td>
          <td>${j.closes_on ? date(j.closes_on) : 'Open until removed'}</td>
          <td>${date(j.updated_at)}</td>
          <td class="row-actions"><a class="btn btn-ghost btn-sm" href="#careers/${j.id}">Edit</a></td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No jobs posted', 'Post a vacancy and it appears on the website’s Careers page as soon as you publish it.', '<a class="btn btn-primary" href="#careers/new">Post a job</a>')}
    </section>`;
}

function editorHtml() {
  return `
    <a href="#careers" class="back-link">← All jobs</a>
    <form class="job-editor" id="job-form" novalidate>
      <section class="card form">
        <label class="field"><span>Job title</span><input name="title" required minlength="2" maxlength="140" placeholder="e.g. Junior Web Designer"></label>
        <div class="field-row">
          <label class="field"><span>Location</span><input name="location" maxlength="80" placeholder="Harare · Hybrid"></label>
          <label class="field"><span>Type</span><input name="employment_type" maxlength="40" list="job-types" placeholder="Full-time"></label>
        </div>
        <datalist id="job-types"><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option><option>Attachment</option></datalist>
        <div class="field-row">
          <label class="field"><span>Department</span><input name="department" maxlength="60" placeholder="Design, Development, Marketing…"></label>
          <label class="field"><span>Closing date <small class="muted">(last day, inclusive)</small></span><input type="date" name="closes_on"></label>
        </div>
        <label class="field"><span>Summary</span><textarea name="summary" rows="4" maxlength="1200" placeholder="A few sentences about the role and who will thrive in it."></textarea></label>
        <div class="field-row">
          <label class="field"><span>What you'll do <small class="muted">(one per line)</small></span><textarea name="responsibilities" rows="7" placeholder="Design pages in Figma&#10;Build responsive sites"></textarea></label>
          <label class="field"><span>What you'll bring <small class="muted">(one per line)</small></span><textarea name="requirements" rows="7" placeholder="A portfolio of web work&#10;Strong eye for detail"></textarea></label>
        </div>
      </section>
      <aside class="card job-side">
        <h3 class="pe-h">Publish</h3>
        <p class="pe-status">Status: <span id="job-status"><span class="badge badge-draft">new</span></span></p>
        <p class="muted small">Applications go to <b>chingombet@gmail.com</b> and WhatsApp.</p>
        <div class="pe-actions">
          <button class="btn btn-ghost" type="submit" data-action="draft">Save draft</button>
          <button class="btn btn-primary" type="submit" data-action="publish" id="job-publish">Publish</button>
        </div>
        <div class="job-side-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="job-close" hidden>Close now</button>
          <button type="button" class="btn btn-ghost btn-sm" id="job-duplicate" hidden>Duplicate</button>
          <button type="button" class="btn btn-ghost btn-sm danger" id="job-delete" hidden>Delete</button>
        </div>
        <p class="pe-links" id="job-links"></p>
      </aside>
    </form>`;
}

const lines = (t) => String(t || '').split('\n').map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).slice(0, 20);

async function bindEditor(id, ctx) {
  const form = document.getElementById('job-form');
  if (!form) return;
  let job = null;
  let dirty = false;

  const fill = (j) => {
    form.title.value = j.title || ''; form.location.value = j.location || ''; form.employment_type.value = j.employment_type || '';
    form.department.value = j.department || ''; form.closes_on.value = j.closes_on || ''; form.summary.value = j.summary || '';
    form.responsibilities.value = (j.responsibilities || []).join('\n'); form.requirements.value = (j.requirements || []).join('\n');
  };
  const refresh = () => {
    document.getElementById('job-status').innerHTML = job ? badge(job) : '<span class="badge badge-draft">new</span>';
    document.getElementById('job-publish').textContent = job?.status === 'published' ? 'Update' : 'Publish';
    ['job-delete', 'job-duplicate'].forEach((b) => { document.getElementById(b).hidden = !job; });
    document.getElementById('job-close').hidden = !(job && stateOf(job) === 'open');
    document.getElementById('job-links').innerHTML = job && job.status === 'published' ? `<a href="${esc(careersUrl())}" target="_blank" rel="noopener">View on Careers page ↗</a>` : '';
  };

  if (id) {
    const { data, error } = await supabase.from('jobs').select('*').eq('id', id).single();
    if (error || !data) { toast('Job not found', 'error'); location.hash = '#careers'; return; }
    job = data; fill(job);
  } else {
    const draft = sessionStorage.getItem('jobDuplicate');
    if (draft) { fill(JSON.parse(draft)); sessionStorage.removeItem('jobDuplicate'); dirty = true; }
    form.title.focus();
  }
  refresh();
  form.addEventListener('input', () => { dirty = true; });

  const save = async (status, extra = {}) => {
    if (!form.title.value.trim() || form.title.value.trim().length < 2) { toast('Add a job title', 'error'); form.title.focus(); return; }
    const row = {
      title: form.title.value.trim(), location: form.location.value.trim() || null,
      employment_type: form.employment_type.value.trim() || null, department: form.department.value.trim() || null,
      closes_on: form.closes_on.value || null, summary: form.summary.value.trim() || null,
      responsibilities: lines(form.responsibilities.value), requirements: lines(form.requirements.value),
      status, ...extra,
    };
    if (status === 'published' && row.closes_on && row.closes_on < todayHarare() && !extra.closes_on) {
      if (!confirm('The closing date is in the past, so this will show as Closed. Publish anyway?')) return;
    }
    const btns = form.querySelectorAll('button'); btns.forEach((b) => { b.disabled = true; });
    const q = job ? supabase.from('jobs').update(row).eq('id', job.id).select().single()
      : supabase.from('jobs').insert({ ...row, author_id: ctx.me }).select().single();
    const { data, error } = await q;
    btns.forEach((b) => { b.disabled = false; });
    if (error) return toast(error.message, 'error');
    const wasNew = !job; job = data; dirty = false; fill(job); refresh();
    await ctx.reload();
    toast(stateOf(job) === 'open' ? 'Published — it’s live on the Careers page' : stateOf(job) === 'closed' ? 'Saved — shown as closed' : 'Draft saved');
    if (wasNew) history.replaceState(null, '', `#careers/${job.id}`);
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); save(e.submitter?.dataset.action === 'publish' ? 'published' : 'draft'); });
  document.getElementById('job-close').addEventListener('click', () => {
    if (!confirm('Close applications for this role today? It stays on the Careers page marked as Closed.')) return;
    const yesterday = new Date(Date.now() + 2 * 3600e3 - 864e5).toISOString().slice(0, 10);
    form.closes_on.value = yesterday;
    save('published', { closes_on: yesterday });
  });
  document.getElementById('job-duplicate').addEventListener('click', () => {
    const copy = { ...job, title: `${job.title} (copy)`, closes_on: null };
    sessionStorage.setItem('jobDuplicate', JSON.stringify(copy));
    location.hash = '#careers/new';
  });
  document.getElementById('job-delete').addEventListener('click', async () => {
    if (!confirm(`Delete “${job.title}”? This removes it from the website and can’t be undone.`)) return;
    const { error } = await supabase.from('jobs').delete().eq('id', job.id);
    if (error) return toast(error.message, 'error');
    dirty = false; toast('Job deleted'); await ctx.reload(); location.hash = '#careers';
  });
  window.onbeforeunload = () => (dirty ? 'You have unsaved changes' : undefined);
}
