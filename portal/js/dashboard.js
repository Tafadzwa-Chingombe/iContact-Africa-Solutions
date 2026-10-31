// Client dashboard: overview, projects, invoices, files & approvals, support, account.
import {
  supabase, requireSession, esc, money, date, ago, bytes, STAGES, STAGE_LABEL,
  statusBadge, signedUrl, storageKey, toast, formData, STORAGE_BUCKET,
} from './supabase.js';
import { initShell, openModal, closeModal, withBusy, emptyState, stageTracker } from './shell.js';

const { session, profile } = await requireSession();
const me = session.user.id;
const view = document.getElementById('view');

const state = { projects: [], invoices: [], files: [], tickets: [] };

async function load() {
  const [p, i, f, t] = await Promise.all([
    supabase.from('projects').select('*, milestones(*)').order('created_at', { ascending: false }),
    supabase.from('invoices').select('*, projects(name)').order('issued_on', { ascending: false }),
    supabase.from('files').select('*, projects(name), file_comments(id)').order('created_at', { ascending: false }),
    supabase.from('tickets').select('*, projects(name), ticket_messages(author_id, created_at)').order('updated_at', { ascending: false }),
  ]);
  const err = p.error || i.error || f.error || t.error;
  if (err) { toast(err.message, 'error'); throw err; }
  state.projects = p.data.map((x) => ({
    ...x, milestones: (x.milestones || []).sort((a, b) => a.sort_order - b.sort_order || (a.due_date || '').localeCompare(b.due_date || '')),
  }));
  state.invoices = i.data;
  state.files = f.data;
  state.tickets = t.data;
  updateCounts();
}

// ---------- derived values -------------------------------------------------
const outstanding = () => state.invoices.filter((x) => ['unpaid', 'overdue'].includes(x.status));
const pendingApprovals = () => state.files.filter((x) => x.needs_approval && x.approval === 'pending');
const openTickets = () => state.tickets.filter((x) => x.status !== 'closed');
const awaitingMe = () => state.tickets.filter((x) => x.status === 'waiting_client');
const activeProjects = () => state.projects.filter((x) => x.stage !== 'live');

function updateCounts() {
  const set = (k, n) => {
    const el = document.querySelector(`[data-count="${k}"]`);
    if (el) { el.textContent = n || ''; el.hidden = !n; }
  };
  set('invoices', outstanding().length);
  set('files', pendingApprovals().length);
  set('support', awaitingMe().length);
}

const projectOptions = (selected) => state.projects.map((p) =>
  `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

// ==========================================================================
// Views
// ==========================================================================
const views = {
  overview() {
    const due = outstanding();
    const dueTotal = due.reduce((s, x) => s + Number(x.amount), 0);
    const cur = due[0]?.currency || 'USD';
    const focus = activeProjects()[0] || state.projects[0];
    const upcoming = state.projects.flatMap((p) => p.milestones.filter((m) => !m.done)
      .map((m) => ({ ...m, project: p.name }))).sort((a, b) => (a.due_date || '9').localeCompare(b.due_date || '9')).slice(0, 5);

    const activity = [
      ...state.files.map((x) => ({ at: x.created_at, text: `New file <strong>${esc(x.name)}</strong> on ${esc(x.projects?.name)}`, href: '#files' })),
      ...state.invoices.map((x) => ({ at: x.created_at, text: `Invoice <strong>${esc(x.number)}</strong> issued · ${money(x.amount, x.currency)}`, href: '#invoices' })),
      ...state.tickets.map((x) => ({ at: x.updated_at, text: `Support: <strong>${esc(x.subject)}</strong> is ${esc(x.status.replace(/_/g, ' '))}`, href: `#support/${x.id}` })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);

    const first = (profile.full_name || '').split(' ')[0];
    return `
      <section class="welcome">
        <div>
          <h2>${first ? `Hi ${esc(first)}` : 'Welcome'} 👋</h2>
          <p>${pendingApprovals().length ? `You have <strong>${pendingApprovals().length}</strong> item(s) waiting for your approval.` : 'Here’s where everything stands today.'}</p>
        </div>
        <a href="#support/new" class="btn btn-primary">Request a change</a>
      </section>

      <section class="kpis">
        <a href="#projects" class="kpi"><span class="kpi-label">Active projects</span><span class="kpi-value">${activeProjects().length}</span><span class="kpi-sub">${state.projects.length} total</span></a>
        <a href="#invoices" class="kpi ${due.length ? 'kpi-warn' : ''}"><span class="kpi-label">Outstanding</span><span class="kpi-value">${money(dueTotal, cur)}</span><span class="kpi-sub">${due.length} unpaid invoice${due.length === 1 ? '' : 's'}</span></a>
        <a href="#files" class="kpi ${pendingApprovals().length ? 'kpi-accent' : ''}"><span class="kpi-label">Awaiting approval</span><span class="kpi-value">${pendingApprovals().length}</span><span class="kpi-sub">design proofs &amp; files</span></a>
        <a href="#support" class="kpi"><span class="kpi-label">Open requests</span><span class="kpi-value">${openTickets().length}</span><span class="kpi-sub">${awaitingMe().length} need your reply</span></a>
      </section>

      <div class="grid-2">
        <section class="card">
          <header class="card-head"><h3>Current project</h3><a href="#projects" class="card-link">All projects →</a></header>
          ${focus ? projectSummary(focus) : emptyState('No projects yet', 'Once your project is scoped it will appear here.')}
        </section>
        <section class="card">
          <header class="card-head"><h3>Upcoming milestones</h3></header>
          ${upcoming.length ? `<ul class="list">${upcoming.map((m) => `
            <li><span class="list-dot"></span><div><strong>${esc(m.title)}</strong><span class="muted">${esc(m.project)}</span></div><span class="list-meta">${date(m.due_date)}</span></li>`).join('')}</ul>`
            : emptyState('All caught up', 'No upcoming milestones.')}
        </section>
      </div>

      <section class="card">
        <header class="card-head"><h3>Recent activity</h3></header>
        ${activity.length ? `<ul class="list">${activity.map((a) => `
          <li><span class="list-dot"></span><a href="${a.href}">${a.text}</a><span class="list-meta">${ago(a.at)}</span></li>`).join('')}</ul>`
          : emptyState('Nothing yet', 'Activity on your projects will show up here.')}
      </section>`;
  },

  projects(id) {
    if (!state.projects.length) return emptyState('No projects yet', 'Your projects will appear here once we kick off.', '<a class="btn btn-primary" href="../contact.html">Start a project</a>');
    const list = id ? state.projects.filter((p) => p.id === id) : state.projects;
    return `${id ? '<a href="#projects" class="back-link">← All projects</a>' : ''}
      <div class="stack">${list.map((p) => `
      <article class="card project">
        <header class="card-head">
          <div><p class="eyebrow">${esc(p.service || 'Project')}</p><h3>${esc(p.name)}</h3></div>
          ${statusBadge(p.stage)}
        </header>
        ${stageTracker(p.stage, STAGES, STAGE_LABEL)}
        <div class="progress" role="progressbar" aria-valuenow="${p.progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.progress}%"></span></div>
        <div class="meta-row">
          <span><small>Progress</small>${p.progress}%</span>
          <span><small>Started</small>${date(p.start_date)}</span>
          <span><small>Target launch</small>${date(p.due_date)}</span>
          ${p.preview_url ? `<a class="btn btn-outline btn-sm" href="${esc(p.preview_url)}" target="_blank" rel="noopener">Open preview ↗</a>` : ''}
        </div>
        ${p.notes ? `<p class="note">${esc(p.notes)}</p>` : ''}
        <h4 class="sub-head">Milestones</h4>
        ${p.milestones.length ? `<ul class="checklist">${p.milestones.map((m) => `
          <li class="${m.done ? 'done' : ''}"><span class="check">${m.done ? '✓' : ''}</span><span>${esc(m.title)}</span><span class="list-meta">${date(m.due_date)}</span></li>`).join('')}</ul>`
          : '<p class="muted">Milestones will be added after scoping.</p>'}
        <footer class="card-foot">
          <a href="#files/${p.id}" class="card-link">Files (${state.files.filter((f) => f.project_id === p.id).length}) →</a>
          <a href="#support/new" class="card-link">Ask a question →</a>
        </footer>
      </article>`).join('')}</div>`;
  },

  invoices() {
    const due = outstanding();
    const paid = state.invoices.filter((x) => x.status === 'paid');
    const sum = (arr) => arr.reduce((s, x) => s + Number(x.amount), 0);
    const cur = state.invoices[0]?.currency || 'USD';
    return `
      <section class="kpis kpis-3">
        <div class="kpi ${due.length ? 'kpi-warn' : ''}"><span class="kpi-label">Outstanding</span><span class="kpi-value">${money(sum(due), cur)}</span></div>
        <div class="kpi"><span class="kpi-label">Paid to date</span><span class="kpi-value">${money(sum(paid), cur)}</span></div>
        <div class="kpi"><span class="kpi-label">Invoices</span><span class="kpi-value">${state.invoices.length}</span></div>
      </section>
      <section class="card">
        ${state.invoices.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Invoice</th><th>Project</th><th>Issued</th><th>Due</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>${state.invoices.map((x) => `
            <tr>
              <td><strong>${esc(x.number)}</strong>${x.description ? `<span class="muted block">${esc(x.description)}</span>` : ''}</td>
              <td>${esc(x.projects?.name || '—')}</td>
              <td>${date(x.issued_on)}</td>
              <td>${date(x.due_on)}</td>
              <td class="num">${money(x.amount, x.currency)}</td>
              <td>${statusBadge(x.status)}</td>
              <td class="row-actions">
                ${x.pdf_path ? `<button class="btn btn-ghost btn-sm" data-pdf="${esc(x.pdf_path)}">PDF</button>` : ''}
                ${x.pay_url && x.status !== 'paid' ? `<a class="btn btn-primary btn-sm" href="${esc(x.pay_url)}" target="_blank" rel="noopener">Pay now</a>` : ''}
              </td>
            </tr>`).join('')}</tbody></table></div>`
          : emptyState('No invoices', 'Invoices for your projects will appear here.')}
        <p class="muted small pad">Paying by bank transfer or EcoCash? Use the invoice number as your reference and we'll mark it paid within one business day.</p>
      </section>`;
  },

  files(projectId) {
    const list = projectId ? state.files.filter((f) => f.project_id === projectId) : state.files;
    const pending = list.filter((f) => f.needs_approval && f.approval === 'pending');
    const rest = list.filter((f) => !(f.needs_approval && f.approval === 'pending'));
    const row = (f) => `
      <li class="file">
        <span class="file-icon">${esc((f.name.split('.').pop() || 'file').slice(0, 4).toUpperCase())}</span>
        <div class="file-main">
          <strong>${esc(f.name)}</strong>
          <span class="muted">${esc(f.projects?.name)} · ${bytes(f.size_bytes)} · ${ago(f.created_at)}${f.uploaded_by === me ? ' · uploaded by you' : ''}</span>
        </div>
        ${f.needs_approval ? statusBadge(f.approval) : ''}
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-download="${f.id}">Download</button>
          <button class="btn btn-ghost btn-sm" data-file="${f.id}">${f.needs_approval && f.approval === 'pending' ? 'Review' : `Comments (${f.file_comments.length})`}</button>
        </div>
      </li>`;
    return `
      <div class="toolbar">
        <label class="select-inline">Project
          <select id="file-filter"><option value="">All projects</option>${projectOptions(projectId)}</select>
        </label>
        ${state.projects.length ? '<button class="btn btn-primary" id="upload-btn">Upload file</button>' : ''}
      </div>
      ${pending.length ? `<section class="card card-accent"><header class="card-head"><h3>Waiting for your approval</h3></header><ul class="files">${pending.map(row).join('')}</ul></section>` : ''}
      <section class="card"><header class="card-head"><h3>All files</h3></header>
        ${rest.length ? `<ul class="files">${rest.map(row).join('')}</ul>` : emptyState('No files yet', 'Designs, documents and assets will be shared here.')}
      </section>`;
  },

  support(param) {
    if (param === 'new') { setTimeout(newTicket); param = undefined; }
    if (param) return ticketThreadShell(param);
    return `
      <div class="toolbar"><p class="muted">We reply the same business day. Urgent? Call <a href="tel:+263718574277">+263 71 857 4277</a>.</p>
        <button class="btn btn-primary" id="new-ticket">New request</button></div>
      <section class="card">
        ${state.tickets.length ? `<ul class="tickets">${state.tickets.map((t) => `
          <li><a href="#support/${t.id}">
            <div><strong>${esc(t.subject)}</strong><span class="muted">${esc(t.projects?.name || 'General')} · ${t.ticket_messages.length} message${t.ticket_messages.length === 1 ? '' : 's'} · updated ${ago(t.updated_at)}</span></div>
            <span class="badges">${t.priority !== 'normal' ? statusBadge(t.priority) : ''}${statusBadge(t.status)}</span>
          </a></li>`).join('')}</ul>`
          : emptyState('No requests yet', 'Need a change, fix or have a question? Open a request and we’ll get on it.')}
      </section>`;
  },

  account() {
    return `
      <div class="grid-2">
        <section class="card">
          <header class="card-head"><h3>Your details</h3></header>
          <form id="profile-form" class="form">
            <label class="field"><span>Full name</span><input name="full_name" value="${esc(profile.full_name)}" autocomplete="name"></label>
            <label class="field"><span>Company</span><input name="company" value="${esc(profile.company)}" autocomplete="organization"></label>
            <label class="field"><span>Phone</span><input name="phone" value="${esc(profile.phone)}" autocomplete="tel"></label>
            <label class="field"><span>Email</span><input value="${esc(session.user.email)}" disabled></label>
            <button class="btn btn-primary" type="submit">Save changes</button>
          </form>
        </section>
        <section class="card">
          <header class="card-head"><h3>Change password</h3></header>
          <form id="password-form" class="form">
            <label class="field"><span>New password</span><input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
            <label class="field"><span>Confirm</span><input type="password" name="confirm" minlength="8" required autocomplete="new-password"></label>
            <button class="btn btn-primary" type="submit">Update password</button>
          </form>
        </section>
      </div>`;
  },
};

function projectSummary(p) {
  const next = p.milestones.find((m) => !m.done);
  return `
    <div class="project-mini">
      <div class="project-mini-head"><strong>${esc(p.name)}</strong>${statusBadge(p.stage)}</div>
      ${stageTracker(p.stage, STAGES, STAGE_LABEL)}
      <div class="progress"><span style="width:${p.progress}%"></span></div>
      <div class="meta-row">
        <span><small>Progress</small>${p.progress}%</span>
        <span><small>Next</small>${esc(next?.title || '—')}</span>
        <span><small>Launch</small>${date(p.due_date)}</span>
      </div>
      <a href="#projects/${p.id}" class="card-link">View details →</a>
    </div>`;
}

// ---------- Support thread ---------------------------------------------------
function ticketThreadShell(id) {
  const t = state.tickets.find((x) => x.id === id);
  if (!t) return emptyState('Request not found', 'It may have been removed.', '<a href="#support" class="btn btn-outline">Back to support</a>');
  setTimeout(() => { loadThread(t); bindReply(t.id); });
  return `
    <a href="#support" class="back-link">← All requests</a>
    <section class="card thread">
      <header class="card-head">
        <div><p class="eyebrow">${esc(t.projects?.name || 'General')} · opened ${date(t.created_at)}</p><h3>${esc(t.subject)}</h3></div>
        <span class="badges">${statusBadge(t.priority)}${statusBadge(t.status)}</span>
      </header>
      <ol class="messages" id="messages"><li class="muted">Loading conversation…</li></ol>
      ${t.status === 'closed' ? '<p class="muted pad">This request is closed. Open a new one if you need anything else.</p>' : `
      <form class="reply" id="reply-form">
        <label class="sr-only" for="reply-body">Reply</label>
        <textarea id="reply-body" name="body" rows="3" required placeholder="Write a reply…"></textarea>
        <button class="btn btn-primary" type="submit">Send</button>
      </form>`}
    </section>`;
}

async function loadThread(t) {
  const { data, error } = await supabase.from('ticket_messages')
    .select('*, profiles(full_name, role)').eq('ticket_id', t.id).order('created_at');
  if (error) return toast(error.message, 'error');
  const box = document.getElementById('messages');
  if (!box) return;
  box.innerHTML = data.map((m) => {
    const mine = m.author_id === me;
    const who = mine ? 'You' : (m.profiles?.role === 'admin' ? `${m.profiles.full_name || 'iContact team'} · iContact` : m.profiles?.full_name || 'Client');
    return `<li class="msg ${mine ? 'mine' : 'theirs'}"><div class="bubble">${esc(m.body).replace(/\n/g, '<br>')}</div><span class="msg-meta">${esc(who)} · ${ago(m.created_at)}</span></li>`;
  }).join('') || '<li class="muted">No messages yet.</li>';
  box.lastElementChild?.scrollIntoView({ block: 'nearest' });
}

function bindReply(ticketId) {
  document.getElementById('reply-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const text = f.body.value.trim();
    if (!text) return;
    await withBusy(f, async () => {
      const { error: err } = await supabase.from('ticket_messages').insert({ ticket_id: ticketId, author_id: me, body: text });
      if (err) return toast(err.message, 'error');
      f.reset();
      await load();
      loadThread(state.tickets.find((x) => x.id === ticketId));
    });
  });
}

function newTicket() {
  const body = openModal(`
    <h2>New support request</h2>
    <form class="form" id="ticket-form">
      <label class="field"><span>Subject</span><input name="subject" required maxlength="140" placeholder="e.g. Update prices on the services page"></label>
      <div class="field-row">
        <label class="field"><span>Project</span><select name="project_id"><option value="">General</option>${projectOptions()}</select></label>
        <label class="field"><span>Priority</span><select name="priority"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option><option value="urgent">Urgent — site is down</option></select></label>
      </div>
      <label class="field"><span>Details</span><textarea name="body" rows="5" required placeholder="What do you need? Include page links if you can."></textarea></label>
      <button class="btn btn-primary" type="submit">Submit request</button>
    </form>`);
  body.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const v = formData(f);
    await withBusy(f, async () => {
      const { data: t, error } = await supabase.from('tickets')
        .insert({ client_id: me, subject: v.subject, project_id: v.project_id, priority: v.priority }).select().single();
      if (error) return toast(error.message, 'error');
      const { error: e2 } = await supabase.from('ticket_messages').insert({ ticket_id: t.id, author_id: me, body: v.body });
      if (e2) return toast(e2.message, 'error');
      closeModal();
      toast('Request sent — we’ll reply shortly.');
      await load();
      location.hash = `#support/${t.id}`;
    });
  });
}

// ---------- Files: review / comments / upload ------------------------------
async function openFile(id) {
  const f = state.files.find((x) => x.id === id);
  const { data: comments, error } = await supabase.from('file_comments')
    .select('*, profiles(full_name, role)').eq('file_id', id).order('created_at');
  if (error) return toast(error.message, 'error');
  const canApprove = f.needs_approval && f.approval === 'pending';
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name);
  const preview = isImage ? await signedUrl(f.storage_path, 600).catch(() => null) : null;

  const body = openModal(`
    <p class="eyebrow">${esc(f.projects?.name)}</p>
    <h2>${esc(f.name)}</h2>
    ${preview ? `<img class="file-preview" src="${esc(preview)}" alt="Preview of ${esc(f.name)}">` : ''}
    <div class="modal-actions">
      <button class="btn btn-outline" data-download="${f.id}">Download</button>
      ${f.needs_approval ? statusBadge(f.approval) : ''}
    </div>
    <h4 class="sub-head">Comments</h4>
    <ol class="messages compact">${comments.map((c) => `
      <li class="msg ${c.author_id === me ? 'mine' : 'theirs'}"><div class="bubble">${esc(c.body).replace(/\n/g, '<br>')}</div>
      <span class="msg-meta">${c.author_id === me ? 'You' : esc(c.profiles?.full_name || 'iContact team')} · ${ago(c.created_at)}</span></li>`).join('') || '<li class="muted">No comments yet.</li>'}</ol>
    <form class="form" id="comment-form">
      <label class="field"><span>${canApprove ? 'Feedback (required if requesting changes)' : 'Add a comment'}</span><textarea name="body" rows="3"></textarea></label>
      <div class="btn-row">
        ${canApprove ? `
          <button class="btn btn-primary" type="button" data-approve="approved">Approve</button>
          <button class="btn btn-outline" type="button" data-approve="changes_requested">Request changes</button>`
          : '<button class="btn btn-primary" type="submit">Post comment</button>'}
      </div>
    </form>`, { wide: isImage });

  const form = body.querySelector('#comment-form');
  const addComment = async (text) => {
    if (!text) return true;
    const { error: err } = await supabase.from('file_comments').insert({ file_id: f.id, author_id: me, body: text });
    if (err) { toast(err.message, 'error'); return false; }
    return true;
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = form.body.value.trim();
    if (!text) return;
    if (await addComment(text)) { toast('Comment posted'); await load(); openFile(id); }
  });
  body.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
    const decision = b.dataset.approve;
    const text = form.body.value.trim();
    if (decision === 'changes_requested' && !text) { toast('Tell us what to change in the feedback box.', 'error'); form.body.focus(); return; }
    b.disabled = true;
    if (!(await addComment(text))) { b.disabled = false; return; }
    const { error: err } = await supabase.from('files').update({ approval: decision }).eq('id', f.id);
    if (err) { b.disabled = false; return toast(err.message, 'error'); }
    closeModal();
    toast(decision === 'approved' ? 'Approved — thank you!' : 'Change request sent.');
    await load(); render();
  }));
}

function uploadFile() {
  const current = location.hash.split('/')[1];
  const body = openModal(`
    <h2>Upload a file</h2>
    <p class="muted">Logos, copy, photos, brand guides — up to 50 MB.</p>
    <form class="form" id="upload-form">
      <label class="field"><span>Project</span><select name="project_id" required>${projectOptions(current)}</select></label>
      <label class="dropzone"><input type="file" name="file" required><span>Choose a file or drag it here</span></label>
      <button class="btn btn-primary" type="submit">Upload</button>
    </form>`);
  const form = body.querySelector('form');
  const input = form.querySelector('input[type=file]');
  input.addEventListener('change', () => {
    form.querySelector('.dropzone span').textContent = input.files[0]?.name || 'Choose a file or drag it here';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = input.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) return toast('That file is over 50 MB. Email us a link instead.', 'error');
    await withBusy(form, async () => {
      const pid = form.project_id.value;
      const path = storageKey(pid, file);
      const up = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) return toast(up.error.message, 'error');
      const { error } = await supabase.from('files').insert({
        project_id: pid, uploaded_by: me, name: file.name, storage_path: path, size_bytes: file.size,
      });
      if (error) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        return toast(error.message, 'error');
      }
      closeModal(); toast('File uploaded'); await load(); render();
    });
  });
}

// ---------- event delegation for every view ---------------------------------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.dataset.download) {
    const f = state.files.find((x) => x.id === t.dataset.download);
    try { window.open(await signedUrl(f.storage_path), '_blank', 'noopener'); } catch (err) { toast(err.message, 'error'); }
  } else if (t.dataset.pdf) {
    try { window.open(await signedUrl(t.dataset.pdf), '_blank', 'noopener'); } catch (err) { toast(err.message, 'error'); }
  } else if (t.dataset.file) openFile(t.dataset.file);
  else if (t.id === 'upload-btn') uploadFile();
  else if (t.id === 'new-ticket') newTicket();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'file-filter') location.hash = e.target.value ? `#files/${e.target.value}` : '#files';
});

function bindAccount() {
  document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const v = formData(f);
    await withBusy(f, async () => {
      const { error } = await supabase.from('profiles').update(v).eq('id', me);
      if (error) return toast(error.message, 'error');
      Object.assign(profile, v);
      document.getElementById('user-name').textContent = profile.full_name || profile.email;
      document.getElementById('user-company').textContent = profile.company || profile.email;
      toast('Details saved');
    });
  });
  document.getElementById('password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (f.password.value !== f.confirm.value) return toast('Passwords don’t match', 'error');
    await withBusy(f, async () => {
      const { error } = await supabase.auth.updateUser({ password: f.password.value });
      if (error) return toast(error.message, 'error');
      f.reset(); toast('Password updated');
    });
  });
}

// ---------- boot -------------------------------------------------------------
let currentRoute = 'overview';
let currentParam;
function render() {
  view.innerHTML = views[currentRoute](currentParam);
  if (currentRoute === 'account') bindAccount();
}

await load();
initShell(profile, {
  routes: ['overview', 'projects', 'invoices', 'files', 'support', 'account'],
  titles: {
    overview: ['Dashboard', 'Overview'],
    projects: ['Your work', 'Projects'],
    invoices: ['Billing', 'Invoices'],
    files: ['Shared', 'Files & approvals'],
    support: ['Help', 'Support'],
    account: ['Settings', 'Account'],
  },
  onRoute(route, param) {
    currentRoute = route; currentParam = param;
    render();
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  },
});

// Live updates: refresh when the team replies or changes something.
supabase.channel('client-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_messages' }, async () => { await load(); if (currentRoute !== 'support' || !currentParam) render(); else loadThread(state.tickets.find((x) => x.id === currentParam)); })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, async () => { await load(); if (['overview', 'files'].includes(currentRoute)) render(); })
  .subscribe();
