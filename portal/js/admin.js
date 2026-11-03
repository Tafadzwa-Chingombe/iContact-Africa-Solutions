// Admin console: manage clients, projects, milestones, invoices, files, tickets, enquiries.
import {
  supabase, requireSession, esc, money, date, ago, bytes, STAGES, STAGE_LABEL,
  statusBadge, signedUrl, storageKey, toast, formData, initials, STORAGE_BUCKET,
} from './supabase.js';
import { SUPABASE_URL } from './config.js';
import { initShell, openModal, closeModal, withBusy, emptyState, stageTracker } from './shell.js';
import { blogView, loadPosts } from './admin-blog.js';
import { careersView, loadJobs } from './admin-careers.js';
import { analyticsView, bindAnalytics, stopAnalytics, startLiveBadge } from './admin-analytics.js';

const { session, profile } = await requireSession({ admin: true });
const me = session.user.id;
const view = document.getElementById('view');

const state = { clients: [], projects: [], invoices: [], files: [], tickets: [], enquiries: [], posts: [], jobs: { rows: [] }, zoho: null };

async function load() {
  const q = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('projects').select('*, milestones(*)').order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').order('issued_on', { ascending: false }),
    supabase.from('files').select('*, file_comments(id)').order('created_at', { ascending: false }),
    supabase.from('tickets').select('*, ticket_messages(author_id, created_at)').order('updated_at', { ascending: false }),
    supabase.from('enquiries').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  const err = q.find((r) => r.error)?.error;
  if (err) { toast(err.message, 'error'); throw err; }
  [state.clients, state.projects, state.invoices, state.files, state.tickets, state.enquiries] = q.map((r) => r.data);
  state.posts = await loadPosts();
  state.jobs = await loadJobs();
  state.projects.forEach((p) => p.milestones.sort((a, b) => a.sort_order - b.sort_order || (a.due_date || '').localeCompare(b.due_date || '')));
  counts();
}

// ---------- lookups ---------------------------------------------------------
const client = (id) => state.clients.find((c) => c.id === id);
const project = (id) => state.projects.find((p) => p.id === id);
const clientName = (id) => { const c = client(id); return c ? (c.company || c.full_name || c.email) : '—'; };
const clients = () => state.clients.filter((c) => c.role === 'client');
const invoiceClient = (i) => (i.client_id ? clientName(i.client_id) : (i.customer_name || i.customer_email || 'Not linked'));
const needsReply = () => state.tickets.filter((t) => t.status !== 'closed' && t.ticket_messages.length
  && client(t.ticket_messages.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].author_id)?.role !== 'admin');
const pending = () => state.files.filter((f) => f.needs_approval && f.approval !== 'approved');
const unpaid = () => state.invoices.filter((i) => ['unpaid', 'overdue'].includes(i.status));
const newEnquiries = () => state.enquiries.filter((e) => Date.now() - new Date(e.created_at) < 7 * 864e5);

function counts() {
  const set = (k, n) => { const el = document.querySelector(`[data-count="${k}"]`); if (el) { el.textContent = n || ''; el.hidden = !n; } };
  set('tickets', needsReply().length);
  set('approvals', state.files.filter((f) => f.approval === 'changes_requested').length);
  set('enquiries', newEnquiries().length);
}

const opts = (rows, label, selected) => rows.map((r) =>
  `<option value="${r.id}" ${r.id === selected ? 'selected' : ''}>${esc(label(r))}</option>`).join('');
const clientOpts = (sel) => opts(clients(), (c) => `${c.company || c.full_name || c.email}${c.company && c.full_name ? ` (${c.full_name})` : ''}`, sel);
const projectOpts = (clientId, sel) => opts(state.projects.filter((p) => !clientId || p.client_id === clientId), (p) => p.name, sel);
const stageOpts = (sel) => [...STAGES, 'on_hold'].map((s) => `<option value="${s}" ${s === sel ? 'selected' : ''}>${STAGE_LABEL[s]}</option>`).join('');

// ==========================================================================
// Views
// ==========================================================================
const views = {
  overview() {
    const sum = (a) => a.reduce((s, x) => s + Number(x.amount), 0);
    const monthStart = new Date(); monthStart.setDate(1);
    const paidThisMonth = state.invoices.filter((i) => i.status === 'paid' && i.paid_on && new Date(i.paid_on) >= monthStart);
    const active = state.projects.filter((p) => !['live', 'on_hold'].includes(p.stage));
    return `
      <section class="kpis">
        <a href="#clients" class="kpi"><span class="kpi-label">Clients</span><span class="kpi-value">${clients().length}</span><span class="kpi-sub">${active.length} active projects</span></a>
        <a href="#billing" class="kpi ${unpaid().length ? 'kpi-warn' : ''}"><span class="kpi-label">Outstanding</span><span class="kpi-value">${money(sum(unpaid()))}</span><span class="kpi-sub">${unpaid().length} invoices</span></a>
        <a href="#billing" class="kpi"><span class="kpi-label">Collected this month</span><span class="kpi-value">${money(sum(paidThisMonth))}</span><span class="kpi-sub">${paidThisMonth.length} payments</span></a>
        <a href="#tickets" class="kpi ${needsReply().length ? 'kpi-accent' : ''}"><span class="kpi-label">Needs reply</span><span class="kpi-value">${needsReply().length}</span><span class="kpi-sub">${state.tickets.filter((t) => t.status !== 'closed').length} open tickets</span></a>
      </section>
      <div class="grid-2">
        <section class="card">
          <header class="card-head"><h3>Active projects</h3><a class="card-link" href="#clients">Clients →</a></header>
          ${active.length ? `<ul class="list">${active.map((p) => `
            <li><span class="list-dot"></span><a href="#clients/${p.client_id}"><strong>${esc(p.name)}</strong><span class="muted block">${esc(clientName(p.client_id))} · ${STAGE_LABEL[p.stage]} · ${p.progress}%</span></a><span class="list-meta">${date(p.due_date)}</span></li>`).join('')}</ul>`
            : emptyState('No active projects', 'Create a project from a client’s page.')}
        </section>
        <section class="card">
          <header class="card-head"><h3>Tickets waiting on you</h3><a class="card-link" href="#tickets">Queue →</a></header>
          ${needsReply().length ? `<ul class="list">${needsReply().slice(0, 6).map((t) => `
            <li><span class="list-dot"></span><a href="#tickets/${t.id}"><strong>${esc(t.subject)}</strong><span class="muted block">${esc(clientName(t.client_id))}</span></a><span class="list-meta">${ago(t.updated_at)}</span></li>`).join('')}</ul>`
            : emptyState('Inbox zero', 'No tickets need a reply.')}
        </section>
      </div>
      <section class="card">
        <header class="card-head"><h3>Latest website enquiries</h3><a class="card-link" href="#enquiries">All →</a></header>
        ${enquiryTable(state.enquiries.slice(0, 5))}
      </section>`;
  },

  clients(id) {
    if (id) return clientDetail(id);
    return `
      <div class="toolbar">
        <input type="search" id="client-search" class="search" placeholder="Search clients…" aria-label="Search clients">
        <button class="btn btn-primary" data-act="invite">Invite client</button>
      </div>
      <section class="card">
        ${clients().length ? `<div class="table-wrap"><table class="table" id="client-table">
          <thead><tr><th>Client</th><th>Projects</th><th class="num">Outstanding</th><th>Open tickets</th><th>Joined</th></tr></thead>
          <tbody>${clients().map((c) => {
            const owed = unpaid().filter((i) => i.client_id === c.id).reduce((s, i) => s + Number(i.amount), 0);
            return `<tr data-search="${esc(`${c.full_name} ${c.company} ${c.email}`.toLowerCase())}">
              <td><a href="#clients/${c.id}" class="client-cell"><span class="avatar sm">${esc(initials(c.full_name, c.email))}</span><span><strong>${esc(c.company || c.full_name || c.email)}</strong><span class="muted block">${esc(c.full_name ? `${c.full_name} · ` : '')}${esc(c.email)}</span></span></a></td>
              <td>${state.projects.filter((p) => p.client_id === c.id).length}</td>
              <td class="num">${owed ? money(owed) : '—'}</td>
              <td>${state.tickets.filter((t) => t.client_id === c.id && t.status !== 'closed').length}</td>
              <td>${date(c.created_at)}</td></tr>`;
          }).join('')}</tbody></table></div>`
          : emptyState('No clients yet', 'Invite your first client to give them portal access.', '<button class="btn btn-primary" data-act="invite">Invite client</button>')}
      </section>`;
  },

  tickets(id) {
    if (id) return ticketDetail(id);
    const filter = sessionStorage.getItem('ticketFilter') || 'open';
    const list = state.tickets.filter((t) => (filter === 'all' ? true : filter === 'open' ? t.status !== 'closed' : t.status === filter));
    return `
      <div class="toolbar"><div class="segmented" role="tablist">
        ${['open', 'waiting_client', 'closed', 'all'].map((f) => `<button data-tfilter="${f}" class="${f === filter ? 'on' : ''}">${f.replace('_', ' ')}</button>`).join('')}
      </div></div>
      <section class="card">${ticketList(list)}</section>`;
  },

  approvals() {
    const list = state.files.filter((f) => f.needs_approval);
    return `<section class="card">
      ${list.length ? `<ul class="files">${list.map(fileRow).join('')}</ul>` : emptyState('Nothing awaiting approval', 'Upload a proof from a client’s page and tick “needs approval”.')}
    </section>`;
  },

  billing() {
    const filter = sessionStorage.getItem('billingFilter') || 'all';
    const list = state.invoices.filter((i) => (filter === 'all' ? true : filter === 'unlinked' ? !i.client_id : filter === 'zoho' ? !!i.zoho_invoice_id : filter === 'outstanding' ? ['unpaid', 'overdue'].includes(i.status) : true));
    const z = state.zoho;
    const zohoLine = !z ? '<span class="muted small">Checking Zoho Invoice…</span>'
      : z.configured ? `<span class="zoho-pill ok">Zoho Invoice connected</span><span class="muted small">${z.last_synced_at ? `Last sync ${ago(z.last_synced_at)}` : 'Not synced yet'}</span><button class="btn btn-outline btn-sm" data-act="zoho-pull">Sync now</button>`
      : z.error ? `<span class="zoho-pill">Zoho sync unavailable</span><span class="muted small">${esc(z.error)}</span>`
      : '<span class="zoho-pill">Zoho Invoice not connected</span><span class="muted small">Add your Zoho API secrets to sync — see the setup guide.</span>';
    const unlinked = state.invoices.filter((i) => !i.client_id).length;
    return `
      <div class="toolbar">
        <div class="segmented" role="tablist">${['all', 'outstanding', 'zoho', 'unlinked'].map((f) => `<button data-bfilter="${f}" class="${f === filter ? 'on' : ''}">${f}${f === 'unlinked' && unlinked ? ` (${unlinked})` : ''}</button>`).join('')}</div>
        <button class="btn btn-primary" data-act="invoice">New invoice</button>
      </div>
      <div class="zoho-bar">${zohoLine}</div>
      <section class="card">${invoiceTable(list, true)}</section>`;
  },

  analytics() {
    setTimeout(() => bindAnalytics());
    return analyticsView();
  },

  careers(id) {
    return careersView(id, state.jobs, { me, reload: async () => { state.jobs = await loadJobs(); } });
  },

  blog(id) {
    return blogView(id, state.posts, { me, reload: async () => { state.posts = await loadPosts(); } });
  },

  enquiries() {
    return `<section class="card">${enquiryTable(state.enquiries)}</section>`;
  },
};

// ---------- reusable fragments ---------------------------------------------
function ticketList(list) {
  return list.length ? `<ul class="tickets">${list.map((t) => `
    <li><a href="#tickets/${t.id}">
      <div><strong>${esc(t.subject)}</strong><span class="muted">${esc(clientName(t.client_id))} · ${esc(project(t.project_id)?.name || 'General')} · ${ago(t.updated_at)}</span></div>
      <span class="badges">${needsReply().includes(t) ? '<span class="badge badge-urgent">needs reply</span>' : ''}${t.priority !== 'normal' ? statusBadge(t.priority) : ''}${statusBadge(t.status)}</span>
    </a></li>`).join('')}</ul>` : emptyState('No tickets', 'Nothing here.');
}

function invoiceTable(list, showClient) {
  return list.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>Invoice</th>${showClient ? '<th>Client</th>' : ''}<th>Issued</th><th>Due</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map((i) => `<tr>
      <td><strong>${esc(i.number)}</strong>${i.zoho_invoice_id ? ' <span class="badge badge-zoho" title="Synced with Zoho Invoice">Zoho</span>' : ''}${i.description ? `<span class="muted block">${esc(i.description)}</span>` : ''}</td>
      ${showClient ? `<td>${i.client_id ? `<a href="#clients/${i.client_id}">${esc(clientName(i.client_id))}</a>` : `<span class="muted">${esc(invoiceClient(i))}</span> <button class="btn btn-ghost btn-sm" data-act="invoice" data-id="${i.id}">Link client</button>`}</td>` : ''}
      <td>${date(i.issued_on)}</td><td>${date(i.due_on)}</td>
      <td class="num">${money(i.amount, i.currency)}${i.balance != null && Number(i.balance) > 0 && Number(i.balance) < Number(i.amount) ? `<span class="muted block">${money(i.balance, i.currency)} due</span>` : ''}</td><td>${statusBadge(i.status)}</td>
      <td class="row-actions">
        ${i.pdf_path ? `<button class="btn btn-ghost btn-sm" data-pdf="${esc(i.pdf_path)}">PDF</button>` : ''}
        ${i.pay_url ? `<a class="btn btn-ghost btn-sm" href="${esc(i.pay_url)}" target="_blank" rel="noopener">${i.zoho_invoice_id ? 'View' : 'Pay link'}</a>` : ''}
        ${['unpaid', 'overdue'].includes(i.status) ? `<button class="btn btn-ghost btn-sm" data-paid="${i.id}">Mark paid</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-act="invoice" data-id="${i.id}">Edit</button>
      </td></tr>`).join('')}</tbody></table></div>`
    : emptyState('No invoices', 'Create one with “New invoice”.');
}

function fileRow(f) {
  return `<li class="file">
    <span class="file-icon">${esc((f.name.split('.').pop() || 'file').slice(0, 4).toUpperCase())}</span>
    <div class="file-main"><strong>${esc(f.name)}</strong>
      <span class="muted">${esc(clientName(project(f.project_id)?.client_id))} · ${esc(project(f.project_id)?.name)} · ${bytes(f.size_bytes)} · ${ago(f.created_at)}${client(f.uploaded_by)?.role === 'client' ? ' · from client' : ''}</span></div>
    ${f.needs_approval ? statusBadge(f.approval) : ''}
    <div class="row-actions">
      <button class="btn btn-ghost btn-sm" data-download="${f.id}">Download</button>
      <button class="btn btn-ghost btn-sm" data-comments="${f.id}">Comments (${f.file_comments.length})</button>
      <button class="btn btn-ghost btn-sm danger" data-delfile="${f.id}" aria-label="Delete ${esc(f.name)}">Delete</button>
    </div></li>`;
}

function enquiryTable(list) {
  return list.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>From</th><th>Service</th><th>Message</th><th>Received</th></tr></thead>
    <tbody>${list.map((e) => `<tr>
      <td><strong>${esc(e.name)}</strong><a class="muted block" href="mailto:${esc(e.email)}">${esc(e.email)}</a>${e.phone ? `<a class="muted block" href="tel:${esc(e.phone)}">${esc(e.phone)}</a>` : ''}</td>
      <td>${esc(e.service || '—')}${e.budget ? `<span class="muted block">${esc(e.budget)}</span>` : ''}</td>
      <td class="wrap-text">${esc(e.message)}</td><td>${ago(e.created_at)}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState('No enquiries yet', 'Submissions from the website contact form land here.');
}

// ---------- client detail -----------------------------------------------------
function clientDetail(id) {
  const c = client(id);
  if (!c) return emptyState('Client not found', '', '<a class="btn btn-outline" href="#clients">Back</a>');
  const ps = state.projects.filter((p) => p.client_id === id);
  const inv = state.invoices.filter((i) => i.client_id === id);
  const fs = state.files.filter((f) => ps.some((p) => p.id === f.project_id));
  const ts = state.tickets.filter((t) => t.client_id === id);
  return `
    <a href="#clients" class="back-link">← All clients</a>
    <section class="card client-head">
      <span class="avatar lg">${esc(initials(c.full_name, c.email))}</span>
      <div><h2>${esc(c.company || c.full_name || c.email)}</h2>
        <p class="muted">${esc(c.full_name || '')}${c.full_name ? ' · ' : ''}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}</p></div>
      <div class="btn-row"><button class="btn btn-outline btn-sm" data-act="edit-client" data-id="${c.id}">Edit details</button></div>
    </section>

    <section class="card">
      <header class="card-head"><h3>Projects</h3><button class="btn btn-primary btn-sm" data-act="project" data-client="${id}">New project</button></header>
      ${ps.length ? `<div class="stack">${ps.map((p) => `
        <article class="project admin-project">
          <header class="card-head"><div><p class="eyebrow">${esc(p.service || 'Project')}</p><h3>${esc(p.name)}</h3></div>
            <div class="btn-row">${statusBadge(p.stage)}<button class="btn btn-ghost btn-sm" data-act="project" data-id="${p.id}">Edit</button></div></header>
          ${stageTracker(p.stage, STAGES, STAGE_LABEL)}
          <div class="progress"><span style="width:${p.progress}%"></span></div>
          <div class="meta-row"><span><small>Progress</small>${p.progress}%</span><span><small>Start</small>${date(p.start_date)}</span><span><small>Launch</small>${date(p.due_date)}</span></div>
          <h4 class="sub-head">Milestones</h4>
          <ul class="checklist editable">${p.milestones.map((m) => `
            <li class="${m.done ? 'done' : ''}"><button class="check" data-toggle="${m.id}" aria-label="Toggle ${esc(m.title)}">${m.done ? '✓' : ''}</button><span>${esc(m.title)}</span><span class="list-meta">${date(m.due_date)}</span><button class="icon-btn sm" data-delms="${m.id}" aria-label="Delete milestone">×</button></li>`).join('')}</ul>
          <form class="inline-form" data-addms="${p.id}">
            <input name="title" required placeholder="Add milestone…" aria-label="Milestone title">
            <input name="due_date" type="date" aria-label="Due date">
            <button class="btn btn-outline btn-sm" type="submit">Add</button>
          </form>
        </article>`).join('')}</div>` : emptyState('No projects', 'Create the first project for this client.')}
    </section>

    <section class="card">
      <header class="card-head"><h3>Files</h3><button class="btn btn-primary btn-sm" data-act="upload" data-client="${id}" ${ps.length ? '' : 'disabled title="Create a project first"'}>Upload file</button></header>
      ${fs.length ? `<ul class="files">${fs.map(fileRow).join('')}</ul>` : emptyState('No files', 'Upload proofs, documents or deliverables.')}
    </section>

    <section class="card">
      <header class="card-head"><h3>Invoices</h3><button class="btn btn-primary btn-sm" data-act="invoice" data-client="${id}">New invoice</button></header>
      ${invoiceTable(inv, false)}
    </section>

    <section class="card">
      <header class="card-head"><h3>Support tickets</h3></header>
      ${ticketList(ts)}
    </section>`;
}

// ---------- ticket detail -----------------------------------------------------
function ticketDetail(id) {
  const t = state.tickets.find((x) => x.id === id);
  if (!t) return emptyState('Ticket not found', '', '<a class="btn btn-outline" href="#tickets">Back</a>');
  setTimeout(() => { loadThread(t.id); bindReply(t.id); });
  return `
    <a href="#tickets" class="back-link">← Support queue</a>
    <section class="card thread">
      <header class="card-head">
        <div><p class="eyebrow"><a href="#clients/${t.client_id}">${esc(clientName(t.client_id))}</a> · ${esc(project(t.project_id)?.name || 'General')} · opened ${date(t.created_at)}</p><h3>${esc(t.subject)}</h3></div>
        <div class="btn-row">
          <label class="select-inline">Priority <select data-tprio="${t.id}">${['low', 'normal', 'high', 'urgent'].map((s) => `<option ${s === t.priority ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label class="select-inline">Status <select data-tstatus="${t.id}">${['open', 'in_progress', 'waiting_client', 'closed'].map((s) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}</select></label>
        </div>
      </header>
      <ol class="messages" id="messages"><li class="muted">Loading…</li></ol>
      <form class="reply" id="reply-form">
        <label class="sr-only" for="reply-body">Reply</label>
        <textarea id="reply-body" name="body" rows="3" required placeholder="Reply to client…"></textarea>
        <div class="reply-actions">
          <label class="check-inline"><input type="checkbox" name="waiting" checked> Set to “waiting on client”</label>
          <button class="btn btn-primary" type="submit">Send reply</button>
        </div>
      </form>
    </section>`;
}

async function loadThread(id) {
  const { data, error } = await supabase.from('ticket_messages').select('*').eq('ticket_id', id).order('created_at');
  if (error) return toast(error.message, 'error');
  const box = document.getElementById('messages');
  if (!box) return;
  box.innerHTML = data.map((m) => {
    const author = client(m.author_id);
    const staff = author?.role === 'admin';
    return `<li class="msg ${staff ? 'mine' : 'theirs'}"><div class="bubble">${esc(m.body).replace(/\n/g, '<br>')}</div>
      <span class="msg-meta">${m.author_id === me ? 'You' : esc(author?.full_name || author?.email || 'Unknown')} · ${ago(m.created_at)}</span></li>`;
  }).join('') || '<li class="muted">No messages.</li>';
}

function bindReply(id) {
  document.getElementById('reply-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const body = f.body.value.trim();
    if (!body) return;
    await withBusy(f, async () => {
      const { error } = await supabase.from('ticket_messages').insert({ ticket_id: id, author_id: me, body });
      if (error) return toast(error.message, 'error');
      if (f.waiting.checked) await supabase.from('tickets').update({ status: 'waiting_client' }).eq('id', id);
      f.reset(); f.waiting.checked = true;
      await load(); render();
      toast('Reply sent');
    });
  });
}

// ==========================================================================
// Forms (modals)
// ==========================================================================
function inviteClient() {
  const body = openModal(`
    <h2>Invite a client</h2>
    <p class="muted">They'll get an email to set a password and sign in to the portal.</p>
    <form class="form">
      <label class="field"><span>Email</span><input type="email" name="email" required></label>
      <div class="field-row">
        <label class="field"><span>Full name</span><input name="full_name" required></label>
        <label class="field"><span>Company</span><input name="company"></label>
      </div>
      <button class="btn btn-primary" type="submit">Send invite</button>
      <p class="muted small">Requires the <code>invite-client</code> Edge Function (see setup guide). Alternatively invite from Supabase → Authentication → Users.</p>
    </form>`);
  const form = body.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(form, async () => {
      const v = formData(form);
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify({ ...v, redirectTo: new URL('login.html', location.href).href }),
      }).catch((err) => ({ ok: false, json: async () => ({ error: err.message }) }));
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return toast(out.error || 'Invite failed', 'error');
      closeModal(); toast(`Invite sent to ${v.email}`);
      await load(); render();
    });
  });
}

function editClient(id) {
  const c = client(id);
  const body = openModal(`
    <h2>Edit client</h2>
    <form class="form">
      <label class="field"><span>Full name</span><input name="full_name" value="${esc(c.full_name)}"></label>
      <label class="field"><span>Company</span><input name="company" value="${esc(c.company)}"></label>
      <label class="field"><span>Phone</span><input name="phone" value="${esc(c.phone)}"></label>
      <button class="btn btn-primary" type="submit">Save</button>
    </form>`);
  const form = body.querySelector('form');
  form.addEventListener('submit', (e) => { e.preventDefault(); save(form, 'profiles', id, formData(form)); });
}

function projectForm({ id, client: clientId }) {
  const p = id ? project(id) : { client_id: clientId, stage: 'scope', progress: 0 };
  const body = openModal(`
    <h2>${id ? 'Edit project' : 'New project'}</h2>
    <form class="form">
      ${id ? '' : `<label class="field"><span>Client</span><select name="client_id" required>${clientOpts(p.client_id)}</select></label>`}
      <div class="field-row">
        <label class="field"><span>Project name</span><input name="name" required value="${esc(p.name)}"></label>
        <label class="field"><span>Service</span><input name="service" list="services" value="${esc(p.service)}" placeholder="Website"></label>
      </div>
      <datalist id="services"><option>Website</option><option>E-commerce</option><option>SEO</option><option>Digital Marketing</option><option>Brand &amp; Design</option><option>Paid Advertising</option><option>Google Business Profile</option></datalist>
      <div class="field-row">
        <label class="field"><span>Stage</span><select name="stage">${stageOpts(p.stage)}</select></label>
        <label class="field"><span>Progress: <output>${p.progress}</output>%</span><input type="range" name="progress" min="0" max="100" step="5" value="${p.progress}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Start date</span><input type="date" name="start_date" value="${esc(p.start_date)}"></label>
        <label class="field"><span>Target launch</span><input type="date" name="due_date" value="${esc(p.due_date)}"></label>
      </div>
      <label class="field"><span>Preview / staging URL</span><input type="url" name="preview_url" value="${esc(p.preview_url)}" placeholder="https://"></label>
      <label class="field"><span>Note to client</span><textarea name="notes" rows="3">${esc(p.notes)}</textarea></label>
      ${id ? '' : '<label class="check-inline"><input type="checkbox" name="defaults" checked> Add default milestones (Scope call, Design sign-off, Build complete, Launch)</label>'}
      <div class="btn-row">
        <button class="btn btn-primary" type="submit">${id ? 'Save' : 'Create project'}</button>
        ${id ? `<button class="btn btn-ghost danger" type="button" data-delproject="${id}">Delete project</button>` : ''}
      </div>
    </form>`);
  const form = body.querySelector('form');
  form.progress.addEventListener('input', () => { form.querySelector('output').textContent = form.progress.value; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(form);
    const withDefaults = !!v.defaults; delete v.defaults;
    v.progress = Number(v.progress);
    if (id) return save(form, 'projects', id, v);
    await withBusy(form, async () => {
      const { data, error } = await supabase.from('projects').insert(v).select().single();
      if (error) return toast(error.message, 'error');
      if (withDefaults) {
        await supabase.from('milestones').insert(['Scoping call & fixed quote', 'Design sign-off', 'Build complete', 'Launch & handover']
          .map((title, i) => ({ project_id: data.id, title, sort_order: i, done: i === 0 })));
      }
      closeModal(); toast('Project created'); await load(); render();
    });
  });
}

function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const nums = state.invoices.map((i) => i.number.match(new RegExp(`^INV-${year}-(\\d+)$`))?.[1]).filter(Boolean).map(Number);
  return `INV-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

// Create a client account from inside another form (invoice). invite=false → billing-only, no email yet.
async function createClientAccount({ email, full_name, company, phone, invite }) {
  const { data: { session: s } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({ email, full_name, company, phone, invite, redirectTo: new URL('login.html', location.href).href }),
  }).catch((err) => ({ ok: false, json: async () => ({ error: err.message }) }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.id) throw new Error(out.error || 'Could not create the client');
  return out;
}

async function zohoCall(action, extra = {}) {
  const { data: { session: s } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/zoho-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({ action, ...extra }),
  }).catch(() => ({ ok: false, status: 0, json: async () => ({ error: 'Can’t reach the zoho-sync function — has it been deployed?' }) }));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || (res.status === 404 ? 'The zoho-sync function isn’t deployed yet' : `Zoho sync failed (${res.status})`));
  return out;
}

async function loadZohoStatus() {
  try { state.zoho = await zohoCall('status'); } catch (err) { state.zoho = { configured: false, error: err.message }; }
  return state.zoho;
}

async function zohoPull({ quiet } = {}) {
  const btn = document.querySelector('[data-act="zoho-pull"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
  try {
    const r = await zohoCall('pull');
    state.zoho = { ...state.zoho, configured: true, last_synced_at: r.synced_at };
    if (!quiet || r.created) toast(`Zoho sync: ${r.created} new, ${r.updated} updated${r.linked_clients ? `, ${r.linked_clients} clients matched` : ''}`);
    await load(); if (route === 'billing') render();
  } catch (err) { if (!quiet) toast(err.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Sync now'; } }
}

function invoiceForm({ id, client: clientId }) {
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const i = id ? state.invoices.find((x) => x.id === id)
    : { client_id: clientId, number: nextInvoiceNumber(), currency: 'USD', status: 'unpaid', issued_on: new Date().toISOString().slice(0, 10), due_on: due };
  const noClients = !clients().length;
  const zohoOn = state.zoho?.configured;
  const body = openModal(`
    <h2>${id ? `Edit ${esc(i.number)}` : 'New invoice'}</h2>
    ${i.zoho_invoice_id ? '<p class="muted small">Synced from Zoho Invoice — amounts, dates and status are updated from Zoho on every sync. Edit those in Zoho; here you can link the client and project.</p>' : ''}
    <form class="form">
      <div class="field-row">
        <label class="field"><span>Client</span><select name="client_id" ${i.zoho_invoice_id ? '' : 'required'}>
          ${id && !i.client_id ? `<option value="">— Not linked${i.customer_name ? ` (Zoho: ${esc(i.customer_name)})` : ''} —</option>` : noClients ? '' : '<option value="" disabled selected hidden>Choose a client…</option>'}
          ${clientOpts(i.client_id)}<option value="__new" ${noClients && !id ? 'selected' : ''}>+ New client…</option></select></label>
        <label class="field"><span>Project (optional)</span><select name="project_id"><option value="">—</option>${projectOpts(i.client_id, i.project_id)}<option value="__new">+ New project…</option></select></label>
      </div>
      <fieldset class="inline-new" data-new="client" ${noClients && !id ? '' : 'hidden'}>
        <legend>New client</legend>
        <div class="field-row">
          <label class="field"><span>Email</span><input type="email" name="nc_email" value="${esc(i.customer_email || '')}" placeholder="client@company.co.zw"></label>
          <label class="field"><span>Phone</span><input name="nc_phone" placeholder="077 123 4567"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Full name</span><input name="nc_full_name"></label>
          <label class="field"><span>Company</span><input name="nc_company" value="${esc(i.customer_name || '')}"></label>
        </div>
        <label class="check-inline"><input type="checkbox" name="nc_invite"> <span>Email them a Client Portal invite now<small class="muted block">Leave unticked for a billing-only client — you can invite them later from Clients.</small></span></label>
      </fieldset>
      <fieldset class="inline-new" data-new="project" hidden>
        <legend>New project</legend>
        <div class="field-row">
          <label class="field"><span>Project name</span><input name="np_name" placeholder="Company website"></label>
          <label class="field"><span>Service</span><input name="np_service" list="services" placeholder="Website"></label>
        </div>
        <datalist id="services"><option>Website</option><option>E-commerce</option><option>SEO</option><option>Digital Marketing</option><option>Brand &amp; Design</option><option>Paid Advertising</option><option>Google Business Profile</option><option>Hosting</option></datalist>
        <label class="check-inline"><input type="checkbox" name="np_defaults" checked> Add default milestones</label>
      </fieldset>
      <div class="field-row">
        <label class="field"><span>Invoice no.</span><input name="number" required value="${esc(i.number)}"></label>
        <label class="field"><span>Status</span><select name="status">${['draft', 'unpaid', 'paid', 'overdue', 'void'].map((s) => `<option ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Description</span><input name="description" value="${esc(i.description)}" placeholder="50% deposit — website build"></label>
      <div class="field-row">
        <label class="field"><span>Amount</span><input name="amount" type="number" min="0" step="0.01" required value="${esc(i.amount)}"></label>
        <label class="field"><span>Currency</span><select name="currency">${[...new Set(['USD', 'ZWG', 'ZAR', i.currency])].map((c) => `<option ${c === i.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Issued</span><input type="date" name="issued_on" value="${esc(i.issued_on)}"></label>
        <label class="field"><span>Due</span><input type="date" name="due_on" value="${esc(i.due_on)}"></label>
      </div>
      <label class="field"><span>Payment link (Paynow, PayPal, Stripe…)</span><input type="url" name="pay_url" value="${esc(i.pay_url)}" placeholder="https://"></label>
      <label class="field"><span>Invoice PDF ${i.pdf_path ? '(replace)' : ''}</span><input type="file" name="pdf" accept="application/pdf"></label>
      ${!i.zoho_invoice_id && zohoOn ? `<label class="check-inline"><input type="checkbox" name="to_zoho" ${id ? '' : 'checked'}> ${id ? 'Also create this invoice in Zoho Invoice' : 'Create in Zoho Invoice too (Zoho assigns the invoice number)'}</label>` : ''}
      <div class="btn-row">
        <button class="btn btn-primary" type="submit">${id ? 'Save' : 'Create invoice'}</button>
        ${id ? `<button class="btn btn-ghost danger" type="button" data-delinvoice="${id}">Delete</button>` : ''}
      </div>
    </form>`);
  const form = body.querySelector('form');
  const box = (k) => form.querySelector(`[data-new="${k}"]`);
  const syncNew = () => {
    const newClient = form.client_id.value === '__new';
    box('client').hidden = !newClient;
    form.nc_email.required = newClient;
    if (form.project_id.value !== '__new' || newClient) {
      const keep = form.project_id.value;
      form.project_id.innerHTML = `<option value="">—</option>${newClient ? '' : projectOpts(form.client_id.value)}<option value="__new">+ New project…</option>`;
      if (keep === '__new') form.project_id.value = '__new';
    }
    box('project').hidden = form.project_id.value !== '__new';
    form.np_name.required = form.project_id.value === '__new';
  };
  form.client_id.addEventListener('change', () => { syncNew(); if (form.client_id.value === '__new') form.nc_email.focus(); });
  form.project_id.addEventListener('change', () => { syncNew(); if (form.project_id.value === '__new') form.np_name.focus(); });
  syncNew();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formData(form);
    const pdf = form.pdf.files[0];
    const extra = Object.fromEntries(Object.entries(v).filter(([k]) => /^(nc_|np_)|^to_zoho$|^pdf$/.test(k)));
    Object.keys(extra).forEach((k) => delete v[k]);
    v.amount = Number(v.amount);
    if (!v.client_id) v.client_id = null;
    if (!v.project_id) v.project_id = null;
    if (v.status === 'paid' && !i.paid_on) v.paid_on = new Date().toISOString().slice(0, 10);
    await withBusy(form, async () => {
      try {
        // 1. New client?
        if (v.client_id === '__new') {
          const c = await createClientAccount({ email: extra.nc_email, full_name: extra.nc_full_name, company: extra.nc_company, phone: extra.nc_phone, invite: !!extra.nc_invite });
          v.client_id = c.id;
          toast(c.existing ? `${extra.nc_email} already had an account — invoice linked to it` : c.invited ? `Client created and invite sent to ${extra.nc_email}` : 'Client created (billing only)');
        }
        // 2. New project?
        if (v.project_id === '__new') {
          if (!v.client_id) throw new Error('Choose or create a client before adding a project');
          const { data: pr, error } = await supabase.from('projects').insert({ client_id: v.client_id, name: extra.np_name, service: extra.np_service || null, stage: 'scope', progress: 0 }).select().single();
          if (error) throw error;
          if (extra.np_defaults) {
            await supabase.from('milestones').insert(['Scoping call & fixed quote', 'Design sign-off', 'Build complete', 'Launch & handover']
              .map((title, n) => ({ project_id: pr.id, title, sort_order: n, done: n === 0 })));
          }
          v.project_id = pr.id;
        }
        // 3. PDF + invoice row
        if (pdf) {
          const path = storageKey(`invoices/${v.client_id || 'unlinked'}`, pdf);
          const up = await supabase.storage.from(STORAGE_BUCKET).upload(path, pdf, { contentType: 'application/pdf' });
          if (up.error) throw up.error;
          v.pdf_path = path;
        }
        // Zoho owns its invoices' money fields — only send the links for those.
        const patch = i.zoho_invoice_id ? { client_id: v.client_id, project_id: v.project_id, ...(v.pdf_path ? { pdf_path: v.pdf_path } : {}), pay_url: v.pay_url || i.pay_url } : v;
        const q = id ? supabase.from('invoices').update(patch).eq('id', id).select().single() : supabase.from('invoices').insert(v).select().single();
        const { data: saved, error } = await q;
        if (error) throw error;
        // 4. Zoho
        if (extra.to_zoho) {
          try { const z = await zohoCall('push', { invoice_id: saved.id }); toast(`Created in Zoho as ${z.number}`); }
          catch (err) { toast(`Saved in the portal, but Zoho said: ${err.message}`, 'error'); }
        }
        closeModal(); toast(id ? 'Invoice saved' : 'Invoice created'); await load(); render();
      } catch (err) {
        toast(err.message, 'error');
        await load(); // a client/project may have been created before the failure — keep the lists current
        if (v.client_id && v.client_id !== '__new' && !clients().some((c) => c.id === form.client_id.value)) {
          form.client_id.insertAdjacentHTML('afterbegin', clientOpts(v.client_id)); form.client_id.value = v.client_id; syncNew();
        }
      }
    });
  });
}

function uploadForm(clientId) {
  const body = openModal(`
    <h2>Upload file</h2>
    <form class="form">
      <label class="field"><span>Project</span><select name="project_id" required>${projectOpts(clientId)}</select></label>
      <label class="dropzone"><input type="file" name="file" required multiple><span>Choose file(s)</span></label>
      <label class="check-inline"><input type="checkbox" name="needs_approval"> Needs client approval (design proof, copy, etc.)</label>
      <label class="field"><span>Message to client (optional)</span><textarea name="note" rows="2"></textarea></label>
      <button class="btn btn-primary" type="submit">Upload</button>
    </form>`);
  const form = body.querySelector('form');
  const input = form.file;
  input.addEventListener('change', () => { form.querySelector('.dropzone span').textContent = [...input.files].map((f) => f.name).join(', ') || 'Choose file(s)'; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = form.project_id.value;
    const needs = form.needs_approval.checked;
    const note = form.note.value.trim();
    await withBusy(form, async () => {
      for (const file of input.files) {
        const path = storageKey(pid, file);
        const up = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, { contentType: file.type || undefined });
        if (up.error) { toast(`${file.name}: ${up.error.message}`, 'error'); continue; }
        const { data, error } = await supabase.from('files').insert({
          project_id: pid, uploaded_by: me, name: file.name, storage_path: path, size_bytes: file.size,
          needs_approval: needs, approval: needs ? 'pending' : 'none',
        }).select().single();
        if (error) { toast(error.message, 'error'); continue; }
        if (note) await supabase.from('file_comments').insert({ file_id: data.id, author_id: me, body: note });
      }
      closeModal(); toast('Upload complete'); await load(); render();
    });
  });
}

async function fileComments(id) {
  const f = state.files.find((x) => x.id === id);
  const { data, error } = await supabase.from('file_comments').select('*').eq('file_id', id).order('created_at');
  if (error) return toast(error.message, 'error');
  const body = openModal(`
    <p class="eyebrow">${esc(project(f.project_id)?.name)}</p><h2>${esc(f.name)}</h2>
    ${f.needs_approval ? `<p>${statusBadge(f.approval)} ${f.approved_at ? `approved ${date(f.approved_at)}` : ''}</p>` : ''}
    <ol class="messages compact">${data.map((c) => `<li class="msg ${client(c.author_id)?.role === 'admin' ? 'mine' : 'theirs'}"><div class="bubble">${esc(c.body).replace(/\n/g, '<br>')}</div><span class="msg-meta">${esc(client(c.author_id)?.full_name || '')} · ${ago(c.created_at)}</span></li>`).join('') || '<li class="muted">No comments.</li>'}</ol>
    <form class="form">
      <label class="field"><span>Comment</span><textarea name="body" rows="3" required></textarea></label>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit">Post</button>
        ${f.needs_approval && f.approval === 'changes_requested' ? '<button class="btn btn-outline" type="button" data-reproof>Mark as revised (pending again)</button>' : ''}
      </div>
    </form>`);
  const form = body.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error: err } = await supabase.from('file_comments').insert({ file_id: id, author_id: me, body: form.body.value.trim() });
    if (err) return toast(err.message, 'error');
    await load(); fileComments(id);
  });
  body.querySelector('[data-reproof]')?.addEventListener('click', async () => {
    const { error: err } = await supabase.from('files').update({ approval: 'pending', approved_at: null }).eq('id', id);
    if (err) return toast(err.message, 'error');
    closeModal(); toast('Sent back for approval'); await load(); render();
  });
}

async function save(form, table, id, values) {
  await withBusy(form, async () => {
    const { error } = await supabase.from(table).update(values).eq('id', id);
    if (error) return toast(error.message, 'error');
    closeModal(); toast('Saved'); await load(); render();
  });
}

async function remove(table, id, what) {
  if (!confirm(`Delete this ${what}? This can't be undone.`)) return false;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return false; }
  toast(`${what[0].toUpperCase()}${what.slice(1)} deleted`);
  return true;
}

// ---------- event delegation ---------------------------------------------------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button, a');
  if (!b) return;
  const d = b.dataset;
  try {
    if (d.act === 'invite') inviteClient();
    else if (d.act === 'edit-client') editClient(d.id);
    else if (d.act === 'project') projectForm({ id: d.id, client: d.client });
    else if (d.act === 'invoice') invoiceForm({ id: d.id, client: d.client });
    else if (d.act === 'upload') uploadForm(d.client);
    else if (d.comments) fileComments(d.comments);
    else if (d.download) window.open(await signedUrl(state.files.find((f) => f.id === d.download).storage_path), '_blank', 'noopener');
    else if (d.pdf) window.open(await signedUrl(d.pdf), '_blank', 'noopener');
    else if (d.tfilter) { sessionStorage.setItem('ticketFilter', d.tfilter); render(); }
    else if (d.bfilter) { sessionStorage.setItem('billingFilter', d.bfilter); render(); }
    else if (d.act === 'zoho-pull') zohoPull();
    else if (d.paid) {
      const { error } = await supabase.from('invoices').update({ status: 'paid', paid_on: new Date().toISOString().slice(0, 10) }).eq('id', d.paid);
      if (error) throw error;
      toast('Marked as paid');
      if (state.invoices.find((x) => x.id === d.paid)?.zoho_invoice_id) {
        zohoCall('payment', { invoice_id: d.paid }).then((r) => r.recorded && toast('Payment recorded in Zoho too'))
          .catch((err) => toast(`Marked paid here, but Zoho said: ${err.message}`, 'error'));
      }
      await load(); render();
    } else if (d.toggle) {
      const m = state.projects.flatMap((p) => p.milestones).find((x) => x.id === d.toggle);
      const { error } = await supabase.from('milestones').update({ done: !m.done }).eq('id', m.id);
      if (error) throw error;
      await load(); render();
    } else if (d.delms) { if (await remove('milestones', d.delms, 'milestone')) { await load(); render(); } }
    else if (d.delproject) { if (await remove('projects', d.delproject, 'project')) { closeModal(); await load(); render(); } }
    else if (d.delinvoice) { if (await remove('invoices', d.delinvoice, 'invoice')) { closeModal(); await load(); render(); } }
    else if (d.delfile) {
      const f = state.files.find((x) => x.id === d.delfile);
      if (await remove('files', f.id, 'file')) {
        await supabase.storage.from(STORAGE_BUCKET).remove([f.storage_path]);
        await load(); render();
      }
    }
  } catch (err) { toast(err.message, 'error'); }
});

document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (!f.dataset.addms) return;
  e.preventDefault();
  const v = formData(f);
  const p = project(f.dataset.addms);
  const { error } = await supabase.from('milestones').insert({ project_id: p.id, title: v.title, due_date: v.due_date, sort_order: p.milestones.length });
  if (error) return toast(error.message, 'error');
  await load(); render();
});

document.addEventListener('change', async (e) => {
  const d = e.target.dataset;
  if (d.tstatus || d.tprio) {
    const patch = d.tstatus ? { status: e.target.value } : { priority: e.target.value };
    const { error } = await supabase.from('tickets').update(patch).eq('id', d.tstatus || d.tprio);
    if (error) return toast(error.message, 'error');
    toast('Ticket updated'); await load(); counts();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'client-search') return;
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('#client-table tbody tr').forEach((tr) => { tr.hidden = !tr.dataset.search.includes(q); });
});

// ---------- boot ----------------------------------------------------------------
let route = 'overview';
let param;
function render() {
  if ((route === 'blog' || route === 'careers') && param) return; // never redraw over an open editor
  if (route === 'analytics') return; // the analytics view refreshes itself
  const keepScroll = window.scrollY;
  view.innerHTML = views[route](param);
  window.scrollTo(0, keepScroll);
}

await load();
loadZohoStatus().then(() => { if (route === 'billing') render(); });
startLiveBadge();
initShell(profile, {
  routes: ['overview', 'analytics', 'clients', 'tickets', 'approvals', 'billing', 'blog', 'careers', 'enquiries'],
  titles: {
    overview: ['Admin', 'Overview'],
    analytics: ['Website', 'Live traffic'],
    clients: ['Admin', 'Clients'],
    tickets: ['Admin', 'Support queue'],
    approvals: ['Admin', 'Approvals'],
    billing: ['Admin', 'Billing'],
    blog: ['Content', 'Blog'],
    careers: ['Content', 'Careers'],
    enquiries: ['Admin', 'Website enquiries'],
  },
  onRoute(r, p) {
    if (!((r === 'blog' || r === 'careers') && p)) window.onbeforeunload = null;
    if (r !== 'analytics') stopAnalytics();
    route = r; param = p; view.innerHTML = views[r](p); window.scrollTo(0, 0);
    // Auto-sync Zoho when Billing opens (at most every 15 minutes)
    if (r === 'billing' && state.zoho?.configured && (!state.zoho.last_synced_at || Date.now() - new Date(state.zoho.last_synced_at) > 15 * 6e4)) zohoPull({ quiet: true });
  },
});

supabase.channel('admin-live')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages' }, async () => {
    await load();
    if (route === 'tickets' && param) loadThread(param); else render();
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'files' }, async () => { await load(); render(); })
  .subscribe();
