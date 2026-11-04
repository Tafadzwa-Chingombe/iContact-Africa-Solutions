#!/usr/bin/env python3
"""Build sitemap.xml: every public page plus every published blog article.

Run from the repo root:  python3 scripts/build_sitemap.py
The GitHub Action in .github/workflows/sitemap.yml runs this daily and on every
push, so new blog posts appear in the sitemap without anyone touching it.
Change BASE when the site moves to its own domain.
"""
import glob, json, re, subprocess, urllib.request
from xml.sax.saxutils import escape

BASE = 'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/'
SKIP = {'article.html'}  # template only; real articles are added below
PRIORITY = {'index.html': '1.0', 'services.html': '0.9', 'pricing.html': '0.9', 'contact.html': '0.9',
            'work.html': '0.8', 'domains.html': '0.8', 'hosting.html': '0.8', 'blog.html': '0.8', 'about.html': '0.7',
            'careers.html': '0.6', 'privacy.html': '0.2', 'terms.html': '0.2', 'cookies.html': '0.2'}


def lastmod(path):
    try:
        out = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', path], capture_output=True, text=True, check=True).stdout.strip()
        return out or None
    except Exception:
        return None


def posts():
    cfg = open('portal/js/config.js').read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", cfg).group(1)
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", cfg).group(1)
    req = urllib.request.Request(f'{url}/rest/v1/posts?select=slug,updated_at,published_at&status=eq.published&order=published_at.desc',
                                 headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    try:
        return json.load(urllib.request.urlopen(req, timeout=30))
    except Exception as e:  # never fail the build because the blog API is unreachable
        print('warning: could not load blog posts:', e)
        return None


entries = []
for p in sorted(glob.glob('*.html')) + sorted(glob.glob('work/*.html')):
    if p in SKIP:
        continue
    html = open(p).read()
    if 'noindex' in html:
        continue
    loc = BASE if p == 'index.html' else BASE + p
    entries.append((loc, lastmod(p), PRIORITY.get(p, '0.6' if p.startswith('work/') else '0.5')))

articles = posts()
if articles is None and glob.glob('sitemap.xml'):  # keep previous article entries if Supabase is down
    old = open('sitemap.xml').read()
    entries += [(loc, None, '0.7') for loc in re.findall(r'<loc>([^<]*article\.html\?slug=[^<]*)</loc>', old)]
for a in articles or []:
    entries.append((f"{BASE}article.html?slug={a['slug']}", (a.get('updated_at') or a.get('published_at') or '')[:10] or None, '0.7'))

xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc, mod, pri in entries:
    xml.append(f'  <url><loc>{escape(loc)}</loc>' + (f'<lastmod>{mod}</lastmod>' if mod else '') + f'<priority>{pri}</priority></url>')
xml.append('</urlset>')
open('sitemap.xml', 'w').write('\n'.join(xml) + '\n')
print(f'sitemap.xml: {len(entries)} URLs ({len(articles or [])} articles)')
