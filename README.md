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
- `work/<project>.html` — one case study per project with a desktop/mobile preview toggle.
- Case-study text is a **draft** (marked with `<!-- DRAFT … -->` comments) — review it, and add confirmed results
  (enquiries, calls, rankings) where the `<!-- Add confirmed numbers here -->` comment sits. Replace the illustrative
  previews with real screenshots when you have them.

Preview locally:
```bash
python3 -m http.server 8000
```

## Brand assets (`assets/img/`)
| File | Use |
|---|---|
| `icontact-logo.png` | Transparent logo — site header, light backgrounds |
| `icontact-logo-white.png` | Transparent, white letters — footer, portal sidebar, dark backgrounds |
| `icontact-logo-colour.png` | Logo on its solid light-grey background — documents, email signatures, anywhere transparency isn't supported |
| `og-image.png` | Link preview when the site is shared (WhatsApp, Facebook, LinkedIn, X) |
| `favicon-*.png`, `/favicon.ico`, `apple-touch-icon.png`, `icon-*.png` | Browser tab and phone home-screen icons |

If the site moves to a custom domain, update the `og:url` / `og:image` addresses in each page's `<head>`.
