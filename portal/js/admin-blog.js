// Admin console → Blog CMS: list, write (Markdown + live preview), schedule, publish.
import { supabase, esc, date, toast } from './supabase.js';
import { renderMarkdown, readingTime, slugify } from '../../assets/js/markdown.js';
import { emptyState } from './shell.js';

const BUCKET = 'blog-images';
const POST_COLS = 'id,slug,title,excerpt,status,published_at,updated_at,tags,cover_url';

export async function loadPosts() {
  const { data, error } = await supabase.from('posts').select(POST_COLS).order('updated_at', { ascending: false });
  if (error) { toast(error.message, 'error'); return []; }
  return data;
}

const stateOf = (p) => (p.status !== 'published' ? 'draft'
  : (p.published_at && new Date(p.published_at) > new Date() ? 'scheduled' : 'published'));
const badge = (p) => {
  const s = stateOf(p);
  const cls = { draft: 'badge-draft', scheduled: 'badge-pending', published: 'badge-paid' }[s];
  return `<span class="badge ${cls}">${s}</span>`;
};
const siteUrl = (slug) => new URL(`../article.html?slug=${encodeURIComponent(slug)}`, location.href).href;

// ---------------------------------------------------------------------------
export function blogView(param, posts, ctx) {
  if (param) {
    setTimeout(() => bindEditor(param === 'new' ? null : param, ctx));
    return editorHtml();
  }
  const counts = { all: posts.length, published: 0, scheduled: 0, draft: 0 };
  posts.forEach((p) => { counts[stateOf(p)]++; });
  return `
    <div class="toolbar">
      <p class="muted">${counts.published} published · ${counts.scheduled} scheduled · ${counts.draft} draft${counts.draft === 1 ? '' : 's'}</p>
      <a class="btn btn-primary" href="#blog/new">New article</a>
    </div>
    <section class="card">
      ${posts.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Article</th><th>Status</th><th>Publish date</th><th>Last edited</th><th></th></tr></thead>
        <tbody>${posts.map((p) => `<tr>
          <td><a href="#blog/${p.id}" class="post-cell">
            ${p.cover_url ? `<img src="${esc(p.cover_url)}" alt="" loading="lazy">` : '<span class="post-thumb"></span>'}
            <span><strong>${esc(p.title)}</strong><span class="muted block">/${esc(p.slug)}${p.tags?.length ? ` · ${esc(p.tags.join(', '))}` : ''}</span></span></a></td>
          <td>${badge(p)}</td>
          <td>${p.published_at ? date(p.published_at) : '—'}</td>
          <td>${date(p.updated_at)}</td>
          <td class="row-actions">
            ${stateOf(p) === 'published' ? `<a class="btn btn-ghost btn-sm" href="${esc(siteUrl(p.slug))}" target="_blank" rel="noopener">View</a>` : ''}
            <a class="btn btn-ghost btn-sm" href="#blog/${p.id}">Edit</a>
          </td></tr>`).join('')}</tbody></table></div>`
        : emptyState('No articles yet', 'Write your first post — it appears on the website’s Blog page as soon as you publish.', '<a class="btn btn-primary" href="#blog/new">Write an article</a>')}
    </section>`;
}

function editorHtml() {
  const tb = (cmd, label, title) => `<button type="button" class="tb" data-md="${cmd}" title="${title}" aria-label="${title}">${label}</button>`;
  return `
    <a href="#blog" class="back-link">← All articles</a>
    <form class="post-editor" id="post-form" novalidate>
      <div class="pe-main">
        <input class="pe-title" name="title" placeholder="Article title" maxlength="200" required aria-label="Title">
        <div class="pe-slug muted">/article?slug=<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="120" required aria-label="URL slug"></div>
        <div class="card pe-card">
          <div class="pe-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="true" data-tab="write">Write</button>
            <button type="button" role="tab" aria-selected="false" data-tab="preview">Preview</button>
            <span class="pe-meta muted" id="pe-meta"></span>
          </div>
          <div class="pe-toolbar" aria-label="Formatting">
            ${tb('h2', 'H2', 'Heading')}${tb('h3', 'H3', 'Sub-heading')}${tb('bold', '<b>B</b>', 'Bold')}${tb('italic', '<i>I</i>', 'Italic')}
            ${tb('link', '🔗', 'Link')}${tb('ul', '•', 'Bullet list')}${tb('ol', '1.', 'Numbered list')}${tb('quote', '❝', 'Quote')}${tb('code', '&lt;/&gt;', 'Code')}
            <label class="tb tb-file" title="Insert image">🖼<input type="file" accept="image/*" id="pe-inline-img" hidden></label>
          </div>
          <div class="pe-panes">
            <textarea name="content" id="pe-content" spellcheck="true" placeholder="Write in Markdown…&#10;&#10;## A heading&#10;Normal paragraph with **bold** and a [link](https://…).&#10;- bullet point"></textarea>
            <article class="prose pe-preview" id="pe-preview" hidden></article>
          </div>
          <p class="muted small pe-help">Markdown: <code>## Heading</code> · <code>**bold**</code> · <code>*italic*</code> · <code>[text](https://link)</code> · <code>- list</code> · <code>&gt; quote</code></p>
        </div>
      </div>

      <aside class="pe-side">
        <div class="card">
          <h3 class="pe-h">Publish</h3>
          <p class="pe-status">Status: <span id="pe-status-badge"><span class="badge badge-draft">new</span></span></p>
          <label class="field"><span>Publish date <small class="muted">(future = scheduled)</small></span><input type="datetime-local" name="published_at"></label>
          <div class="pe-actions">
            <button class="btn btn-ghost" type="submit" data-action="draft">Save draft</button>
            <button class="btn btn-primary" type="submit" data-action="publish" id="pe-publish">Publish</button>
          </div>
          <div class="pe-links" id="pe-links"></div>
        </div>
        <div class="card">
          <h3 class="pe-h">Cover image</h3>
          <div class="pe-cover" id="pe-cover"><span class="muted">No cover yet</span></div>
          <input type="hidden" name="cover_url">
          <div class="btn-row"><label class="btn btn-outline btn-sm">Upload<input type="file" accept="image/*" id="pe-cover-file" hidden></label>
            <button type="button" class="btn btn-ghost btn-sm" id="pe-cover-remove">Remove</button></div>
        </div>
        <div class="card form">
          <h3 class="pe-h">Details</h3>
          <label class="field"><span>Excerpt <small class="muted">(shown on the blog list &amp; Google)</small></span><textarea name="excerpt" rows="3" maxlength="400"></textarea></label>
          <label class="field"><span>Tags <small class="muted">(comma separated)</small></span><input name="tags" placeholder="Web Design, SEO"></label>
        </div>
        <button type="button" class="btn btn-ghost danger btn-block" id="pe-delete" hidden>Delete article</button>
      </aside>
    </form>`;
}

async function uploadImage(file, folder) {
  if (!file) return null;
  if (file.size > 8 * 1024 * 1024) { toast('Image is over 8 MB — please resize it first.', 'error'); return null; }
  const clean = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-');
  const path = `${folder}/${Date.now()}-${clean}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, cacheControl: '31536000' });
  if (error) { toast(error.message, 'error'); return null; }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

async function bindEditor(id, ctx) {
  const form = document.getElementById('post-form');
  if (!form) return;
  const content = form.content;
  const preview = document.getElementById('pe-preview');
  const meta = document.getElementById('pe-meta');
  let post = null;
  let slugTouched = false;
  let dirty = false;

  if (id) {
    const { data, error } = await supabase.from('posts').select('*').eq('id', id).single();
    if (error || !data) { toast('Article not found', 'error'); location.hash = '#blog'; return; }
    post = data;
    form.title.value = post.title; form.slug.value = post.slug; content.value = post.content;
    form.excerpt.value = post.excerpt || ''; form.tags.value = (post.tags || []).join(', ');
    form.published_at.value = toLocalInput(post.published_at);
    form.cover_url.value = post.cover_url || '';
    slugTouched = true;
    document.getElementById('pe-delete').hidden = false;
  }

  const refreshMeta = () => {
    const words = content.value.trim() ? content.value.trim().split(/\s+/).length : 0;
    meta.textContent = `${words} words · ${readingTime(content.value)} min read`;
  };
  const refreshCover = () => {
    const url = form.cover_url.value;
    document.getElementById('pe-cover').innerHTML = url ? `<img src="${esc(url)}" alt="Cover preview">` : '<span class="muted">No cover yet</span>';
  };
  const refreshStatus = () => {
    const p = post || { status: 'draft' };
    document.getElementById('pe-status-badge').innerHTML = post ? badge(p) : '<span class="badge badge-draft">new</span>';
    document.getElementById('pe-publish').textContent = post?.status === 'published' ? 'Update' : 'Publish';
    document.getElementById('pe-links').innerHTML = post?.status === 'published'
      ? `<a href="${esc(siteUrl(post.slug))}" target="_blank" rel="noopener">View on website ↗</a>` : '';
  };
  refreshMeta(); refreshCover(); refreshStatus();

  form.title.addEventListener('input', () => { if (!slugTouched) form.slug.value = slugify(form.title.value); });
  form.slug.addEventListener('input', () => { slugTouched = true; form.slug.value = slugify(form.slug.value) || form.slug.value.toLowerCase(); });
  form.addEventListener('input', () => { dirty = true; });
  content.addEventListener('input', refreshMeta);

  // Write / Preview tabs
  form.querySelector('.pe-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    const isPrev = b.dataset.tab === 'preview';
    form.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    content.hidden = isPrev; preview.hidden = !isPrev;
    form.querySelector('.pe-toolbar').classList.toggle('is-disabled', isPrev);
    if (isPrev) preview.innerHTML = `${form.cover_url.value ? `<img src="${esc(form.cover_url.value)}" alt="">` : ''}<h1>${esc(form.title.value || 'Untitled')}</h1>${renderMarkdown(content.value)}`;
  });

  // Formatting toolbar
  const wrapSel = (before, after = before, placeholder = 'text') => {
    const { selectionStart: a, selectionEnd: b, value } = content;
    const sel = value.slice(a, b) || placeholder;
    content.setRangeText(before + sel + after, a, b, 'end');
    content.focus(); content.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const prefixLines = (prefix) => {
    const pre = (i) => (typeof prefix === 'function' ? prefix(i) : prefix);
    const { selectionStart: a, selectionEnd: b, value } = content;
    const start = value.lastIndexOf('\n', a - 1) + 1;            // start of the first selected line
    const nl = value.indexOf('\n', b);
    const end = nl === -1 ? value.length : nl;                     // end of the last selected line
    const lines = value.slice(start, end).split('\n');
    const out = lines.map((l, i) => pre(i) + (l || (lines.length === 1 ? 'text' : ''))).join('\n');
    content.setRangeText(out, start, end, 'end');
    content.focus(); content.dispatchEvent(new Event('input', { bubbles: true }));
  };
  form.querySelector('.pe-toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-md]');
    if (!b) return;
    ({
      h2: () => prefixLines('## '), h3: () => prefixLines('### '),
      bold: () => wrapSel('**'), italic: () => wrapSel('*'), code: () => wrapSel('`'),
      quote: () => prefixLines('> '), ul: () => prefixLines('- '), ol: () => prefixLines((i) => `${i + 1}. `),
      link: () => { const url = prompt('Link address (https://…)'); if (url) wrapSel('[', `](${url})`, 'link text'); },
    })[b.dataset.md]?.();
  });
  document.getElementById('pe-inline-img').addEventListener('change', async (e) => {
    const url = await uploadImage(e.target.files[0], 'content');
    e.target.value = '';
    if (url) { content.setRangeText(`\n![Describe the image](${url})\n`, content.selectionStart, content.selectionEnd, 'end'); content.dispatchEvent(new Event('input', { bubbles: true })); toast('Image inserted'); }
  });

  // Cover image
  document.getElementById('pe-cover-file').addEventListener('change', async (e) => {
    const url = await uploadImage(e.target.files[0], 'covers');
    e.target.value = '';
    if (url) { form.cover_url.value = url; dirty = true; refreshCover(); toast('Cover uploaded'); }
  });
  document.getElementById('pe-cover-remove').addEventListener('click', () => { form.cover_url.value = ''; dirty = true; refreshCover(); });

  // Save / publish
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const action = e.submitter?.dataset.action || 'draft';
    form.slug.value = slugify(form.slug.value || form.title.value);
    if (!form.title.value.trim()) { toast('Add a title first', 'error'); form.title.focus(); return; }
    if (!form.slug.value) { toast('Add a URL slug', 'error'); form.slug.focus(); return; }
    if (action === 'publish' && !content.value.trim()) { toast('Write something before publishing', 'error'); return; }
    const row = {
      title: form.title.value.trim(), slug: form.slug.value, content: content.value,
      excerpt: form.excerpt.value.trim() || null,
      tags: form.tags.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8),
      cover_url: form.cover_url.value || null,
      status: action === 'publish' ? 'published' : 'draft',
      published_at: form.published_at.value ? new Date(form.published_at.value).toISOString() : (action === 'publish' ? (post?.published_at || new Date().toISOString()) : (post?.published_at || null)),
    };
    const btns = form.querySelectorAll('button[type=submit]'); btns.forEach((b) => { b.disabled = true; });
    const q = post ? supabase.from('posts').update(row).eq('id', post.id).select().single()
      : supabase.from('posts').insert({ ...row, author_id: ctx.me }).select().single();
    const { data, error } = await q;
    btns.forEach((b) => { b.disabled = false; });
    if (error) {
      toast(error.code === '23505' ? 'That URL slug is already used by another article.' : error.message, 'error');
      return;
    }
    dirty = false;
    const wasNew = !post;
    post = data;
    form.published_at.value = toLocalInput(post.published_at);
    refreshStatus();
    await ctx.reload();
    toast(stateOf(post) === 'scheduled' ? `Scheduled for ${date(post.published_at)}` : post.status === 'published' ? 'Published — it’s live on the blog' : 'Draft saved');
    if (wasNew) history.replaceState(null, '', `#blog/${post.id}`);
  });

  document.getElementById('pe-delete').addEventListener('click', async () => {
    if (!post || !confirm(`Delete “${post.title}”? This can’t be undone.`)) return;
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) return toast(error.message, 'error');
    dirty = false; toast('Article deleted'); await ctx.reload(); location.hash = '#blog';
  });

  window.onbeforeunload = () => (dirty ? 'You have unsaved changes' : undefined);
  if (!id) form.title.focus();
}
