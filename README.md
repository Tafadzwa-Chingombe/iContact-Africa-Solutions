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

Preview locally:
```bash
python3 -m http.server 8000
```
