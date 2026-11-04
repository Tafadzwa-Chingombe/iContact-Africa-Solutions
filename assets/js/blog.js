// Public blog: list (blog.html) and single article (article.html?slug=…).
// Reads published posts from Supabase with the public anon key; row-level
// security guarantees drafts and scheduled posts are never returned.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../portal/js/config.js';
import { renderMarkdown, readingTime } from './markdown.js';

const configured = !SUPABASE_URL.includes('YOUR-PROJECT-REF');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

async function api(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const LIST_COLS = 'slug,title,excerpt,cover_url,tags,published_at';
const card = (p) => `
  <a class="post-card" href="article.html?slug=${encodeURIComponent(p.slug)}" data-tags="${esc((p.tags || []).join('|').toLowerCase())}">
    <div class="post-cover">${p.cover_url ? `<img src="${esc(p.cover_url)}" alt="" loading="lazy">` : `<span>${esc((p.title || '?').slice(0, 1))}</span>`}</div>
    <div class="post-body">
      <p class="post-meta">${fmtDate(p.published_at)}${p.tags?.length ? ` · ${esc(p.tags[0])}` : ''}</p>
      <h3>${esc(p.title)}</h3>
      ${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}
      <span class="text-link">Read article →</span>
    </div>
  </a>`;

// ---------- Blog list --------------------------------------------------------------
const list = document.getElementById('blog-list');
if (list) {
  const empty = document.getElementById('blog-empty');
  const filters = document.getElementById('blog-filters');
  const wireFilters = () => {
    if (!filters || filters.hidden) return;
    filters.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tag]');
      if (!b) return;
      filters.querySelectorAll('[data-tag]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      list.querySelectorAll('.post-card').forEach((c) => {
        c.hidden = !!b.dataset.tag && !c.dataset.tags.split('|').includes(b.dataset.tag);
      });
    });
  };
  if (list.hasAttribute('data-static')) {
    // Cards were written into blog.html by scripts/build_blog.py: nothing to fetch.
    wireFilters();
  } else (async () => {
    // Fallback before the first static build: load the list in the browser.
    if (!configured) { list.hidden = true; empty.hidden = false; return; }
    try {
      const posts = await api(`select=${LIST_COLS}&order=published_at.desc&limit=60`);
      if (!posts.length) { list.hidden = true; empty.hidden = false; return; }
      list.innerHTML = posts.map(card).join('');
      const tags = [...new Set(posts.flatMap((p) => p.tags || []))].slice(0, 10);
      if (tags.length && filters) {
        filters.innerHTML = `<button type="button" aria-pressed="true" data-tag="">All <span class="count">${posts.length}</span></button>` +
          tags.map((t) => `<button type="button" aria-pressed="false" data-tag="${esc(t.toLowerCase())}">${esc(t)}</button>`).join('');
        filters.hidden = false;
        wireFilters();
      }
    } catch {
      // e.g. the blog table isn't set up yet: show the friendly "coming soon" state
      list.hidden = true; empty.hidden = false;
    }
  })();
}

// ---------- Single article ------------------------------------------------------------
const article = document.getElementById('article');
if (article) {
  const slug = new URLSearchParams(location.search).get('slug') || '';
  const notFound = () => {
    article.innerHTML = `<div class="blog-empty"><h2>Article not found</h2><p>It may have moved or been unpublished.</p><a class="btn btn-primary" href="blog.html">Back to the blog</a></div>`;
    document.title = 'Article not found — iContact Africa Solutions';
  };
  (async () => {
    if (!configured || !/^[a-z0-9-]{1,120}$/.test(slug)) return notFound();
    // Old links (article.html?slug=…): send readers to the static page if it has been built.
    try {
      const staticUrl = `blog/${slug}.html`;
      if ((await fetch(staticUrl, { method: 'HEAD' })).ok) return location.replace(staticUrl + location.hash);
    } catch { /* fall through and render in the browser */ }
    try {
      const [post] = await api(`select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`);
      if (!post) return notFound();
      document.title = `${post.title} — iContact Africa Solutions Blog`;
      document.querySelector('meta[name="description"]')?.setAttribute('content', post.excerpt || post.title);
      const url = new URL(`article.html?slug=${post.slug}`, location.href).href;
      // Tell search engines the one official address for this article, plus article details.
      document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
      document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
      document.querySelector('meta[property="og:title"]')?.setAttribute('content', post.title);
      document.querySelector('meta[property="og:description"]')?.setAttribute('content', post.excerpt || post.title);
      const ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.textContent = JSON.stringify({
        '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.excerpt || undefined,
        datePublished: post.published_at, dateModified: post.updated_at || post.published_at, mainEntityOfPage: url,
        image: post.cover_url || new URL('assets/img/og-image.png', location.href).href, keywords: (post.tags || []).join(', ') || undefined,
        author: { '@type': 'Person', name: 'Tafadzwa Chingombe' },
        publisher: { '@type': 'Organization', name: 'iContact Africa Solutions', logo: { '@type': 'ImageObject', url: new URL('assets/img/icon-512.png', location.href).href } },
      });
      document.head.appendChild(ld);
      const share = encodeURIComponent(url);
      article.innerHTML = `
        <header class="article-head">
          <p class="crumbs"><a href="blog.html">Blog</a>${post.tags?.length ? ` / ${esc(post.tags[0])}` : ''}</p>
          <h1>${esc(post.title)}</h1>
          ${post.excerpt ? `<p class="lead">${esc(post.excerpt)}</p>` : ''}
          <p class="article-meta"><img src="assets/img/tafadzwa-chingombe.jpg" alt="" width="36" height="36"> <span><b>Tafadzwa Chingombe</b> · ${fmtDate(post.published_at)} · ${readingTime(post.content)} min read</span></p>
        </header>
        ${post.cover_url ? `<img class="article-cover" src="${esc(post.cover_url)}" alt="">` : ''}
        <div class="prose article-body">${renderMarkdown(post.content)}</div>
        <footer class="article-foot">
          ${post.tags?.length ? `<div class="article-tags">${post.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
          <div class="share"><span>Share:</span>
            <a href="https://wa.me/?text=${encodeURIComponent(`${post.title} ${url}`)}" target="_blank" rel="noopener">WhatsApp</a>
            <a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${share}" target="_blank" rel="noopener">Facebook</a>
            <button type="button" class="copy-link">Copy link</button>
          </div>
        </footer>`;
      article.querySelector('.copy-link')?.addEventListener('click', async (e) => {
        try { await navigator.clipboard.writeText(url); e.target.textContent = 'Copied ✓'; } catch { e.target.textContent = url; }
      });
      const more = await api(`select=${LIST_COLS}&slug=neq.${encodeURIComponent(slug)}&order=published_at.desc&limit=3`);
      const rel = document.getElementById('related');
      if (more.length && rel) { rel.querySelector('.blog-grid').innerHTML = more.map(card).join(''); rel.hidden = false; }
    } catch {
      notFound();
    }
  })();
}
