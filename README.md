# iContact Africa Solutions — Website & Client Portal

Static marketing site + Supabase-powered client portal. No build step: upload the folder to any static host.

```
index.html, services.html, work.html, pricing.html, about.html, blog.html, contact.html
assets/css/styles.css      Site design system (Poppins, iContact blue #2e5794 + lime #a9ce47)
assets/js/main.js          Nav, FAQ accordion, scroll reveals, quick-quote form
assets/js/contact.js       Contact form → Supabase "enquiries" (mailto fallback)
portal/login.html          Client login (password, magic link, reset)
portal/index.html          Client dashboard: overview, projects, invoices, files & approvals, support, account
portal/admin.html          Admin console: clients, projects, milestones, invoices, files, tickets, enquiries
portal/js/config.js        ← paste your Supabase URL + anon key here
supabase/schema.sql        Database, row-level security, storage bucket
supabase/functions/        invite-client Edge Function
supabase/tests/            Row-level-security test suite
docs/CLIENT_PORTAL_SETUP.md  Step-by-step setup
```

Start with **[docs/CLIENT_PORTAL_SETUP.md](docs/CLIENT_PORTAL_SETUP.md)**.

## Domains, hosting & email
- `domains.html` — domain checker. Live availability (public RDAP) for .com/.net/.org/.africa/.online/.store/.info;
  .co.zw and .org.zw show "We'll confirm". A name is only shown "Available" when the registry itself says so.
- `hosting.html` — web hosting (monthly/yearly toggle) and email hosting (per-mailbox calculator).
- **All prices live in [`assets/js/catalog.js`](assets/js/catalog.js)** — the current values are placeholders; edit them there
  and the Domains page, Hosting page and homepage "from" prices all update.
- Orders open a short form (`assets/js/order.js`) that saves to the admin **Enquiries** inbox, with WhatsApp/email
  fallback until Supabase is connected. No payment is taken online — you confirm and invoice through the portal.

## Portfolio & case studies
- `work.html` — filterable portfolio (deep links like `work.html#gbp`), featured case study.
- `work/<project>.html` — one case study per project with a desktop/mobile preview toggle and an "Open live preview" link
  to the project's GitHub Pages site (`https://tafadzwa-chingombe.github.io/<Repo>/`).
- Screenshots live in `assets/img/work/<project>-desktop.jpg` / `-mobile.jpg` (1200×750 and 520px wide). Re-take them
  when a client site changes.
- Case-study text is a **draft** (marked with `<!-- DRAFT … -->` comments) — review it, and add confirmed results
  (enquiries, calls, rankings) where the `<!-- Add confirmed numbers here -->` comment sits. Replace the illustrative
  previews with real screenshots when you have them.

Preview locally:
```bash
python3 -m http.server 8000
```

## Blog (admin CMS)
- Write, schedule and publish articles in **Admin Console → Blog** (`portal/js/admin-blog.js`, Markdown + live preview).
- Public pages are **static and indexable**: `scripts/build_blog.py` writes every published post to
  `blog/<slug>.html` (own title, description, canonical, Open Graph, BlogPosting + Breadcrumb JSON-LD, full text in
  the HTML) and writes the post cards into `blog.html`. Don't edit those files by hand — edit the post in the CMS.
- The **Build blog and sitemap** GitHub Action runs this hourly (and on every push). To publish a post immediately:
  GitHub → Actions → Build blog and sitemap → Run workflow.
- `article.html?slug=…` is a noindex fallback: it forwards to the static page, or renders a just-published post in
  the browser until the next build.
- Link to another post in Markdown as `/blog/<slug>` or `article.html?slug=<slug>`; the build rewrites both. Start
  the post body with text, not a `# Title` line (the page already shows the title; the build drops a leading one).
- Markdown is rendered with Python-Markdown + nh3 at build time, and with marked + DOMPurify (`assets/js/markdown.js`)
  in the admin preview and fallback page, so posts can't inject scripts.

## Legal pages
`privacy.html`, `terms.html`, `cookies.html` — written for this site's real setup (Zimbabwe Cyber and Data
Protection Act, Supabase, GitHub Pages, no tracking cookies). **Have a lawyer review them**, and update the
Cookie Policy if you ever add analytics or ads.

## Brand assets (`assets/img/`)
| File | Use |
|---|---|
| `icontact-logo.png` | Transparent logo — site header, light backgrounds |
| `icontact-logo-white.png` | Transparent, white letters — footer, portal sidebar, dark backgrounds |
| `icontact-logo-colour.png` | Logo on its solid light-grey background — documents, email signatures, anywhere transparency isn't supported |
| `og-image.png` | Link preview when the site is shared (WhatsApp, Facebook, LinkedIn, X) |
| `favicon-*.png`, `/favicon.ico`, `apple-touch-icon.png`, `icon-*.png` | Browser tab and phone home-screen icons |

If the site moves to a custom domain, update the `og:url` / `og:image` addresses in each page's `<head>`.

## Search engines (SEO)
- `sitemap.xml` lists every public page and every published blog article. It's rebuilt by
  `scripts/build_sitemap.py`, which the **Update sitemap** GitHub Action runs on every push and daily.
  Submit it once in Google Search Console: `https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/sitemap.xml`.
- Every public page has a canonical URL, the homepage carries business structured data (schema.org),
  articles add `BlogPosting` data, and portal pages are `noindex`.
- Moving to your own domain? Update `BASE` in `scripts/build_sitemap.py` and the `og:url` / canonical
  URLs (search-and-replace `https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/`).
