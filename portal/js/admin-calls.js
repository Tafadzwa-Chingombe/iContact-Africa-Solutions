// Admin console → AI calls: conversations with Nyasha (ElevenLabs), copied in by the elevenlabs-sync Edge Function.
import { supabase, esc, date, ago, toast } from './supabase.js';
import { SUPABASE_URL } from './config.js';
import { emptyState } from './shell.js';

const COLS = 'conversation_id,started_at,duration_secs,channel,call_successful,title,summary,contact_name,business_name,phone,email,service,budget,preferred_slot,outcome,do_not_call,handled,enquiry_id,has_audio';
const OUTCOME_BADGE = { 'call booked': 'badge-paid', 'lead captured': 'badge-paid', transferred: 'badge-paid', 'callback requested': 'badge-draft', 'not interested': 'badge-void', 'do not call': 'badge-void' };
const CHANNEL = { widget: 'Website', twilio: 'Phone', sip_trunk: 'Phone', whatsapp: 'WhatsApp' };
const mins = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`);
const waNumber = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0') && d.length === 10) d = `263${d.slice(1)}`; return d; };
const isLead = (c) => !!(c.phone || c.email) && !c.do_not_call;
const who = (c) => c.contact_name || c.business_name || (isLead(c) ? c.phone || c.email : 'Visitor');

let status = null; // { configured, last_synced_at }

export async function loadCalls() {
  const { data, error } = await supabase.from('ai_calls').select(COLS).order('started_at', { ascending: false }).limit(300);
  if (error) {
    if (/ai_calls/.test(error.message)) return { missing: true, rows: [] };
    toast(error.message, 'error'); return { rows: [] };
  }
  return { rows: data };
}

export const newLeadCount = (st) => (st.rows || []).filter((c) => isLead(c) && !c.handled).length;

async function fn(body, raw = false) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new Error('Can’t reach the elevenlabs-sync function — has it been deployed?');
  if (raw && res.ok) return res;
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Sync failed (${res.status})`);
  return out;
}

export async function syncCalls(ctx, { quiet = false, full = false } = {}) {
  const btn = document.getElementById('calls-sync');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
  try {
    const r = await fn({ action: 'sync', full });
    status = { ...(status || {}), configured: true, last_synced_at: new Date().toISOString() };
    await ctx.reload();
    if (!quiet || r.imported) toast(r.imported ? `${r.imported} new call${r.imported === 1 ? '' : 's'}${r.leads ? ` · ${r.leads} lead${r.leads === 1 ? '' : 's'} added to Enquiries` : ''}` : 'Up to date — no new calls');
    if (r.more) toast('More calls to import — click Sync again', 'error');
  } catch (e) { if (!quiet) toast(e.message, 'error'); }
  ctx.rerender();
}

export async function callsStatus() {
  try { status = await fn({ action: 'status' }); } catch { status = { configured: false, unreachable: true }; }
  return status;
}

export function callsView(param, st, ctx) {
  if (st.missing) {
    return `<section class="card"><div class="empty"><h3>One-time setup needed</h3>
      <p>Run <code>supabase/migrations/20261112_ai_calls.sql</code> in Supabase → SQL Editor, then refresh.</p></div></section>`;
  }
  if (param) { setTimeout(() => bindDetail(param, ctx)); return '<div class="skeleton-grid"><div></div><div></div></div>'; }
  setTimeout(() => bindList(ctx));
  const rows = st.rows;
  const leads = rows.filter(isLead);
  const syncLine = !status ? 'Checking connection…'
    : !status.configured ? '<b>Not connected yet.</b> Add the <code>ELEVENLABS_API_KEY</code> secret in Supabase (see the setup guide), then click Sync.'
      : `Last synced ${status.last_synced_at ? ago(status.last_synced_at) : 'never'}`;
  const filter = sessionStorage.getItem('callsFilter') || 'all';
  const list = filter === 'leads' ? leads : filter === 'new' ? leads.filter((c) => !c.handled) : rows;
  return `
    <div class="toolbar">
      <div class="segmented" role="tablist">${[['all', `All calls (${rows.length})`], ['leads', `Leads (${leads.length})`], ['new', `To follow up (${newLeadCount(st)})`]]
        .map(([k, l]) => `<button data-cfilter="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn btn-primary" id="calls-sync" ${status && !status.configured ? 'disabled' : ''}>Sync now</button>
    </div>
    <p class="muted small" style="margin:-6px 0 14px">${syncLine} · Conversations with Nyasha, your website AI assistant.</p>
    <section class="card">
      ${list.length ? `<div class="table-wrap"><table class="table calls-table">
        <thead><tr><th>Caller</th><th>Summary</th><th>Outcome</th><th>When</th><th></th></tr></thead>
        <tbody>${list.map((c) => `<tr class="${isLead(c) && !c.handled ? 'row-new' : ''}">
          <td><a href="#calls/${esc(c.conversation_id)}"><strong>${esc(who(c))}</strong></a>
            <span class="muted block">${esc([c.contact_name && c.business_name ? c.business_name : '', c.phone, c.email].filter(Boolean).join(' · ') || CHANNEL[c.channel] || 'Website')}</span></td>
          <td class="wrap-text"><strong>${esc(c.title || 'Conversation')}</strong><span class="muted block">${esc(c.service || '')}${c.preferred_slot ? ` · wants a call ${esc(c.preferred_slot)}` : ''}</span></td>
          <td>${c.outcome ? `<span class="badge ${OUTCOME_BADGE[c.outcome] || 'badge-draft'}">${esc(c.outcome)}</span>` : '<span class="muted">—</span>'}${isLead(c) && !c.handled ? '<span class="muted block small">To follow up</span>' : ''}</td>
          <td>${date(c.started_at)}<span class="muted block">${mins(c.duration_secs)}</span></td>
          <td class="row-actions">${c.phone ? `<a class="btn btn-ghost btn-sm" href="https://wa.me/${waNumber(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<a class="btn btn-ghost btn-sm" href="#calls/${esc(c.conversation_id)}">Open</a></td></tr>`).join('')}</tbody></table></div>`
        : emptyState(rows.length ? 'Nothing here' : 'No calls yet', rows.length ? 'No calls match this filter.' : 'Click Sync now to bring in conversations with Nyasha.')}
    </section>`;
}

function bindList(ctx) {
  const root = document.getElementById('view');
  root.querySelectorAll('[data-cfilter]').forEach((b) => b.addEventListener('click', () => { sessionStorage.setItem('callsFilter', b.dataset.cfilter); ctx.rerender(); }));
  document.getElementById('calls-sync')?.addEventListener('click', () => syncCalls(ctx));
}

async function bindDetail(id, ctx) {
  const view = document.getElementById('view');
  const { data: c, error } = await supabase.from('ai_calls').select('*').eq('conversation_id', id).maybeSingle();
  if (location.hash !== `#calls/${id}`) return; // navigated away meanwhile
  if (error || !c) { view.innerHTML = emptyState('Call not found', error?.message || '', '<a class="btn btn-outline" href="#calls">Back</a>'); return; }
  document.getElementById('view-title').textContent = c.title || 'Conversation';
  const fields = [['Name', c.contact_name], ['Business', c.business_name], ['Phone / WhatsApp', c.phone], ['Email', c.email], ['Service', c.service], ['Budget', c.budget],
    ['Preferred call time', c.preferred_slot], ['Outcome', c.outcome], ['Channel', CHANNEL[c.channel] || c.channel], ['Length', mins(c.duration_secs)],
    ['Mood', c.sentiment], ['Caller rating', c.rating ? `${c.rating}/5` : null], ['Cost', c.cost_usd != null ? `$${Number(c.cost_usd).toFixed(2)}` : null]].filter(([, v]) => v);
  const evals = Object.entries(c.evaluations || {});
  const first = String(c.contact_name || '').split(' ')[0];
  const waText = encodeURIComponent(`Hi${first ? ` ${first}` : ''}, this is Tafadzwa from iContact Africa Solutions, following up on your chat with Nyasha${c.service ? ` about ${c.service}` : ''}.`);
  view.innerHTML = `
    <a href="#calls" class="back-link">← All AI calls</a>
    <div class="call-layout">
      <div>
        <section class="card">
          <p class="eyebrow">${date(c.started_at)} · ${new Date(c.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
          <h2 style="margin:4px 0 10px">${esc(c.title || 'Conversation')}</h2>
          ${c.summary ? `<p>${esc(c.summary)}</p>` : ''}
          ${c.follow_up_notes && c.follow_up_notes !== c.summary ? `<p class="muted"><b>Follow-up notes:</b> ${esc(c.follow_up_notes)}</p>` : ''}
          ${c.do_not_call ? '<p class="badge badge-void">Asked not to be contacted</p>' : ''}
        </section>
        <section class="card">
          <header class="card-head"><h3>Recording</h3></header>
          ${c.has_audio ? '<div id="call-audio"><button class="btn btn-outline btn-sm" id="load-audio" type="button">▶ Load recording</button></div>' : '<p class="muted">No recording for this conversation.</p>'}
        </section>
        <section class="card">
          <header class="card-head"><h3>Transcript</h3><span class="muted small">${(c.transcript || []).length} messages</span></header>
          <div class="transcript-chat">${(c.transcript || []).map((t) => `
            <div class="bubble ${t.role === 'user' ? 'from-user' : 'from-agent'}"><span class="who">${t.role === 'user' ? 'Caller' : 'Nyasha'}${t.t != null ? ` · ${mins(t.t)}` : ''}</span><p>${esc(t.message)}</p></div>`).join('') || '<p class="muted">No transcript.</p>'}
          </div>
        </section>
      </div>
      <aside>
        <section class="card call-lead">
          <h3>${isLead(c) ? 'Lead details' : 'Details'}</h3>
          <dl class="call-fields">${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
          <div class="call-actions">
            ${c.phone && !c.do_not_call ? `<a class="btn btn-primary" href="https://wa.me/${waNumber(c.phone)}?text=${waText}" target="_blank" rel="noopener">WhatsApp</a><a class="btn btn-outline" href="tel:${esc(c.phone)}">Call</a>` : ''}
            ${c.email && !c.do_not_call ? `<a class="btn btn-outline" href="mailto:${esc(c.email)}">Email</a>` : ''}
          </div>
          ${isLead(c) ? `<label class="check-inline" style="margin-top:12px"><input type="checkbox" id="call-handled" ${c.handled ? 'checked' : ''}> Followed up</label>` : ''}
          ${c.enquiry_id ? '<p class="muted small" style="margin-top:8px">Also listed in <a href="#enquiries">Enquiries</a>.</p>' : ''}
        </section>
        ${evals.length ? `<section class="card"><h3>Quality checks</h3><ul class="call-evals">${evals.map(([k, e]) => `<li title="${esc(e.why || '')}"><span class="badge ${e.result === 'success' ? 'badge-paid' : e.result === 'failure' ? 'badge-void' : 'badge-draft'}">${esc(e.result || '—')}</span> ${esc(k.replace(/_/g, ' '))}</li>`).join('')}</ul></section>` : ''}
      </aside>
    </div>`;

  document.getElementById('call-handled')?.addEventListener('change', async (e) => {
    const { error: err } = await supabase.from('ai_calls').update({ handled: e.target.checked }).eq('conversation_id', id);
    if (err) { e.target.checked = !e.target.checked; return toast(err.message, 'error'); }
    await ctx.reload(); toast(e.target.checked ? 'Marked as followed up' : 'Back on the follow-up list');
  });
  document.getElementById('load-audio')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Loading…';
    try {
      const res = await fn({ action: 'audio', conversation_id: id }, true);
      const url = URL.createObjectURL(await res.blob());
      document.getElementById('call-audio').innerHTML = `<audio controls autoplay src="${url}" style="width:100%"></audio><a class="muted small" href="${url}" download="${esc(id)}.mp3">Download</a>`;
    } catch (err) { toast(err.message, 'error'); e.target.disabled = false; e.target.textContent = '▶ Load recording'; }
  });
}
