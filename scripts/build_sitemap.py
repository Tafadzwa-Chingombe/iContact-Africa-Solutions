#!/usr/bin/env python3
"""Build sitemap.xml: every public page plus every static blog article in blog/.

Run from the repo root:  python3 scripts/build_sitemap.py
The GitHub Action in .github/workflows/sitemap.yml runs this daily and on every
push, so new blog posts appear in the sitemap without anyone touching it.
Change BASE when the site moves to its own domain.
"""
import glob, re, subprocess
from xml.sax.saxutils import escape

BASE = 'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/'
SKIP = {'article.html'}  # noindex fallback; the static pages in blog/ are listed instead
PRIORITY = {'index.html': '1.0', 'services.html': '0.9', 'ai-voice-agents.html': '0.9', 'pricing.html': '0.9', 'contact.html': '0.9',
            'work.html': '0.8', 'domains.html': '0.8', 'hosting.html': '0.8', 'blog.html': '0.8', 'about.html': '0.7',
            'careers.html': '0.6', 'privacy.html': '0.2', 'terms.html': '0.2', 'cookies.html': '0.2'}


def lastmod(path):
    try:
        out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', path], capture_output=True, text=True, check=True).stdout.strip()
        return out or None
    except Exception:
        return None


def article_modified(path):
    """Blog pages carry their real last-edited date (from the CMS) in a meta tag."""
    m = re.search(r'<meta property="article:modified_time" content="(\d{4}-\d{2}-\d{2})', open(path).read())
    return m.group(1) if m else lastmod(path)


entries = []
for p in sorted(glob.glob('*.html')) + sorted(glob.glob('work/*.html')):
    if p in SKIP:
        continue
    html = open(p).read()
    if 'noindex' in html:
        continue
    loc = BASE if p == 'index.html' else BASE + p
    entries.append((loc, lastmod(p), PRIORITY.get(p, '0.6' if p.startswith('work/') else '0.5')))

for p in sorted(glob.glob('blog/*.html')):  # written by scripts/build_blog.py
    entries.append((BASE + p, article_modified(p), '0.7'))

xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc, mod, pri in entries:
    xml.append(f'  <url><loc>{escape(loc)}</loc>' + (f'<lastmod>{mod}</lastmod>' if mod else '') + f'<priority>{pri}</priority></url>')
xml.append('</urlset>')
open('sitemap.xml', 'w').write('\n'.join(xml) + '\n')
print(f'sitemap.xml: {len(entries)} URLs ({len(glob.glob("blog/*.html"))} articles)')
