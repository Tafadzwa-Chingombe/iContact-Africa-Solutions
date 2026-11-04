#!/usr/bin/env python3
"""Build static, indexable blog pages from the published posts in Supabase.

Run from the repo root:  python3 scripts/build_blog.py
(needs: pip install -r scripts/requirements.txt)

For every published post this writes blog/<slug>.html: a complete page with its
own title, description, canonical URL, Open Graph tags, BlogPosting + Breadcrumb
JSON-LD and the full article text in the HTML. Search engines and AI crawlers
no longer need to run JavaScript to read an article.

It also writes the post cards into blog.html (between the BLOG:START/BLOG:END
markers) and removes pages for posts that are no longer published.

The GitHub Action in .github/workflows/sitemap.yml runs this every hour, so a post
published in Admin Console → Blog shows up as a static page within the hour.
Until then, article.html?slug=… still shows it (rendered in the browser).
"""
import datetime as dt
import glob
import html
import json
import os
import re
import struct
import sys
import urllib.request

import markdown
import nh3

BASE = 'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/'
OUT_DIR = 'blog'
AUTHOR = 'Tafadzwa Chingombe'
SITE = 'iContact Africa Solutions'

esc = lambda s: html.escape(str(s or ''), quote=True)


# ---------- Data --------------------------------------------------------------------
def load_posts():
    cfg = open('portal/js/config.js').read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", cfg).group(1)
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", cfg).group(1)
    # Row-level security already hides drafts and scheduled posts from the anon key;
    # the status filter is a second guard.
    req = urllib.request.Request(f'{url}/rest/v1/posts?select=*&status=eq.published&order=published_at.desc',
                                 headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    return json.load(urllib.request.urlopen(req, timeout=30))


def image_size(url):
    """(width, height) of a remote JPEG/PNG/WebP, read from its header; None if unknown."""
    try:
        req = urllib.request.Request(url, headers={'Range': 'bytes=0-65535'})
        data = urllib.request.urlopen(req, timeout=20).read(65536)
    except Exception:
        return None
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack('>II', data[16:24])
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        if data[12:16] == b'VP8X':
            return (int.from_bytes(data[24:27], 'little') + 1, int.from_bytes(data[27:30], 'little') + 1)
        if data[12:16] == b'VP8 ':
            w, h = struct.unpack('<HH', data[26:30])
            return (w & 0x3FFF, h & 0x3FFF)
        return None
    if data[:2] == b'\xff\xd8':  # JPEG: walk the segments to the frame header
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack('>HH', data[i + 5:i + 9])
                return (w, h)
            i += 2 + struct.unpack('>H', data[i + 2:i + 4])[0]
    return None


# ---------- Content -----------------------------------------------------------------
def prepare_markdown(md, title):
    md = str(md or '').replace('\r\n', '\n').lstrip()
    # The page template already prints the title as the one <h1>; drop a repeated "# Title" line.
    md = re.sub(r'\A#\s+[^\n]*\n+', '', md)
    # Links between posts: "/blog/<slug>" and "article.html?slug=<slug>" -> the static page.
    md = re.sub(r'\]\(\s*(?:/blog/|(?:\.\./)?article\.html\?slug=)([a-z0-9-]+)/?(#[^)\s]*)?\s*\)',
                lambda m: f']({m.group(1)}.html{m.group(2) or ""})', md)
    # Other site-root links ("/contact.html") would point outside this GitHub Pages project.
    md = re.sub(r'\]\(\s*/(?!/)([^)\s]*)\)', lambda m: f'](../{m.group(1)})', md)
    return md


def render_markdown(md):
    raw = markdown.markdown(md, extensions=['extra', 'sane_lists'], output_format='html')
    clean = nh3.clean(raw, attributes={**nh3.ALLOWED_ATTRIBUTES, 'a': {'href', 'title'}, 'img': {'src', 'alt', 'title', 'width', 'height'}},
                      link_rel=None)
    # External links open in a new tab; images load lazily.
    clean = re.sub(r'<a href="(https?://(?!tafadzwa-chingombe\.github\.io)[^"]*)"', r'<a href="\1" target="_blank" rel="noopener"', clean)
    clean = clean.replace('<img ', '<img loading="lazy" decoding="async" ')
    return clean


def reading_time(md):
    return max(1, round(len(str(md or '').split()) / 220))


def parse_date(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00')) if s else None


def nice_date(d):
    return f'{d.day} {d:%B %Y}'


# ---------- Template ----------------------------------------------------------------
TEMPLATE = open('article.html').read()
HEAD_SHARED = TEMPLATE[TEMPLATE.index('<meta name="theme-color"'):TEMPLATE.index('</head>')]
BODY_TOP = TEMPLATE[TEMPLATE.index('<body>'):TEMPLATE.index('<main id="main">') + len('<main id="main">')]
BODY_BOTTOM = TEMPLATE[TEMPLATE.index('</main>'):]
BODY_BOTTOM = BODY_BOTTOM.replace('<script type="module" src="assets/js/blog.js"></script>\n', '')
CTA = re.search(r'\s*<section class="section">\s*<div class="container">\s*<div class="cta-card.*?</section>', TEMPLATE, re.S).group(0)


def up_one_level(fragment):
    """Make the template's relative links work from blog/<slug>.html."""
    return re.sub(r'(\s(?:href|src))="(?!https?:|//|#|mailto:|tel:|data:|\.\./)([^"]*)"', r'\1="../\2"', fragment)


def card(p, href_prefix=''):
    tags = p.get('tags') or []
    cover = (f'<img src="{esc(p["cover_url"])}" alt="" loading="lazy" decoding="async">' if p.get('cover_url')
             else f'<span>{esc((p.get("title") or "?")[:1])}</span>')
    return f'''
  <a class="post-card" href="{href_prefix}{esc(p["slug"])}.html" data-tags="{esc("|".join(tags).lower())}">
    <div class="post-cover">{cover}</div>
    <div class="post-body">
      <p class="post-meta">{nice_date(parse_date(p["published_at"]))}{f" · {esc(tags[0])}" if tags else ""}</p>
      <h3>{esc(p["title"])}</h3>
      {f"<p>{esc(p['excerpt'])}</p>" if p.get("excerpt") else ""}
      <span class="text-link">Read article →</span>
    </div>
  </a>'''


def article_page(p, related):
    url = f'{BASE}{OUT_DIR}/{p["slug"]}.html'
    title, excerpt = p['title'], p.get('excerpt') or p['title']
    tags = p.get('tags') or []
    published, modified = parse_date(p['published_at']), parse_date(p.get('updated_at') or p['published_at'])
    md = prepare_markdown(p['content'], title)
    image = p.get('cover_url') or f'{BASE}assets/img/og-image.png'
    size = image_size(p['cover_url']) if p.get('cover_url') else None
    dims = f' width="{size[0]}" height="{size[1]}"' if size else ''
    share = urllib.request.quote(url, safe='')

    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'BlogPosting', '@id': f'{url}#article', 'headline': title, 'description': excerpt,
         'datePublished': published.isoformat(), 'dateModified': modified.isoformat(),
         'mainEntityOfPage': {'@type': 'WebPage', '@id': url}, 'url': url, 'image': image, 'inLanguage': 'en',
         'wordCount': len(md.split()), 'keywords': ', '.join(tags) or None,
         'author': {'@type': 'Person', '@id': f'{BASE}about.html#tafadzwa', 'name': AUTHOR, 'url': f'{BASE}about.html'},
         'publisher': {'@id': f'{BASE}#business'}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': BASE},
            {'@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': f'{BASE}blog.html'},
            {'@type': 'ListItem', 'position': 3, 'name': title, 'item': url}]},
    ]}
    ld['@graph'][0] = {k: v for k, v in ld['@graph'][0].items() if v is not None}
    ld_json = json.dumps(ld, ensure_ascii=False, indent=1).replace('</', '<\\/')

    related_html = ''
    if related:
        related_html = f'''
  <section class="section section-warm" id="related">
    <div class="container">
      <div class="section-head"><p class="eyebrow eyebrow-rule">Keep reading</p><h2>More from the blog</h2></div>
      <div class="blog-grid">{"".join(card(r) for r in related)}
      </div>
    </div>
  </section>'''

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<!-- Generated by scripts/build_blog.py from the Admin Console blog. Edit the post there, not this file. -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)} — {SITE} Blog</title>
<meta name="description" content="{esc(excerpt)}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(excerpt)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="{SITE}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{esc(image)}">
<meta property="article:published_time" content="{published.isoformat()}">
<meta property="article:modified_time" content="{modified.isoformat()}">
<meta property="article:author" content="{AUTHOR}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{esc(image)}">
{up_one_level(HEAD_SHARED).strip()}
<script type="application/ld+json">
{ld_json}
</script>
</head>
{up_one_level(BODY_TOP)}

  <section class="section article-wrap">
    <div class="container">
      <article id="article" class="article">
        <header class="article-head">
          <p class="crumbs"><a href="../blog.html">Blog</a>{f" / {esc(tags[0])}" if tags else ""}</p>
          <h1>{esc(title)}</h1>
          {f'<p class="lead">{esc(p["excerpt"])}</p>' if p.get('excerpt') else ''}
          <p class="article-meta"><img src="../assets/img/tafadzwa-chingombe.jpg" alt="" width="36" height="36"> <span><b>{AUTHOR}</b> · <time datetime="{published.date().isoformat()}">{nice_date(published)}</time>{f' · Updated <time datetime="{modified.date().isoformat()}">{nice_date(modified)}</time>' if modified.date() > published.date() else ''} · {reading_time(p['content'])} min read</span></p>
        </header>
        {f'<img class="article-cover" src="{esc(p["cover_url"])}" alt=""{dims} fetchpriority="high">' if p.get('cover_url') else ''}
        <div class="prose article-body">
{render_markdown(md)}
        </div>
        <footer class="article-foot">
          {f'<div class="article-tags">{"".join(f'<span class="chip">{esc(t)}</span>' for t in tags)}</div>' if tags else ''}
          <div class="share"><span>Share:</span>
            <a href="https://wa.me/?text={urllib.request.quote(f"{title} {url}", safe="")}" target="_blank" rel="noopener">WhatsApp</a>
            <a href="https://www.linkedin.com/sharing/share-offsite/?url={share}" target="_blank" rel="noopener">LinkedIn</a>
            <a href="https://www.facebook.com/sharer/sharer.php?u={share}" target="_blank" rel="noopener">Facebook</a>
            <button type="button" class="copy-link" data-url="{url}">Copy link</button>
          </div>
        </footer>
      </article>
    </div>
  </section>{related_html}
{up_one_level(CTA)}

{up_one_level(BODY_BOTTOM).replace("</body>", """<script>
document.querySelector('.copy-link')?.addEventListener('click', async (e) => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText(b.dataset.url); b.textContent = 'Copied ✓'; } catch { b.textContent = b.dataset.url; }
});
</script>
</body>""")}'''


def update_blog_index(posts):
    page = open('blog.html').read()
    start, end = '<!-- BLOG:START -->', '<!-- BLOG:END -->'
    if start not in page:
        sys.exit('blog.html is missing the <!-- BLOG:START --> / <!-- BLOG:END --> markers')
    cards = ''.join(card(p, f'{OUT_DIR}/') for p in posts)
    tags = list(dict.fromkeys(t for p in posts for t in (p.get('tags') or [])))[:10]
    filters = (f'<button type="button" aria-pressed="true" data-tag="">All <span class="count">{len(posts)}</span></button>'
               + ''.join(f'<button type="button" aria-pressed="false" data-tag="{esc(t.lower())}">{esc(t)}</button>' for t in tags))
    block = f'''{start}
      <div class="filters blog-filters" id="blog-filters" role="group" aria-label="Filter by topic"{"" if tags else " hidden"}>{filters if tags else ""}</div>
      <div class="blog-grid" id="blog-list" data-static>{cards}
      </div>
      {end}'''
    page = page[:page.index(start)] + block + page[page.index(end) + len(end):]
    # Show the "coming soon" box only when there are no posts.
    page = re.sub(r'<div class="blog-empty" id="blog-empty"( hidden)?>', '<div class="blog-empty" id="blog-empty"' + (' hidden' if posts else '') + '>', page)
    open('blog.html', 'w').write(page)


def main():
    try:
        posts = load_posts()
    except Exception as e:  # never wipe the blog because the API is unreachable
        print('warning: could not load blog posts, leaving existing pages untouched:', e)
        return
    now = dt.datetime.now(dt.timezone.utc)
    posts = [p for p in posts if p.get('slug') and p.get('published_at') and parse_date(p['published_at']) <= now
             and re.fullmatch(r'[a-z0-9-]{1,120}', p['slug'])]
    os.makedirs(OUT_DIR, exist_ok=True)
    keep = set()
    for p in posts:
        related = [r for r in posts if r['slug'] != p['slug']][:3]
        path = f'{OUT_DIR}/{p["slug"]}.html'
        open(path, 'w').write(article_page(p, related))
        keep.add(path)
    for old in glob.glob(f'{OUT_DIR}/*.html'):  # post unpublished or slug changed
        if old not in keep:
            os.remove(old)
            print('removed', old)
    update_blog_index(posts)
    print(f'blog: {len(posts)} static article pages written to {OUT_DIR}/')


if __name__ == '__main__':
    main()
