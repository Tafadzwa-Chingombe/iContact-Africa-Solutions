# Client Portal — Setup Guide

The portal (`/portal/`) is plain HTML + JavaScript backed by **Supabase** (free tier is fine).
Supabase provides logins, the database, file storage and live updates. Setup takes ~20 minutes.

## 1. Create the Supabase project
1. Sign up at <https://supabase.com> → **New project** (pick the region closest to Zimbabwe, e.g. *Europe West* or *South Africa* if offered).
2. Save the database password somewhere safe.

## 2. Create the database
1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/schema.sql`](../supabase/schema.sql) and click **Run**.
   It creates the tables, the security rules (row-level security), the private `portal-files` storage bucket and live updates. It is safe to run again.

## 3. Connect the website
Dashboard → **Project Settings → API**. Copy the **Project URL** and the **anon public** key into
[`portal/js/config.js`](../portal/js/config.js):

```js
export const SUPABASE_URL = 'https://abcd1234.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

The anon key is meant to be public — security comes from the row-level-security rules.
**Never** paste the `service_role` key into any website file.

This also switches on the website contact form: enquiries are saved to the portal's **Enquiries** inbox.
(Until it's configured, the contact form falls back to opening the visitor's email app.)

## 4. Auth settings
Dashboard → **Authentication**:
- **Sign In / Providers → Email**: enabled. Turn **off** "Allow new users to sign up" — clients are invited only.
- **URL Configuration**: set **Site URL** to your live domain, e.g. `https://icontactafricasolutions.org`, and add
  `https://icontactafricasolutions.org/portal/login.html` under **Redirect URLs**.
- **Emails → SMTP** (recommended): connect your own mail server (e.g. your cPanel email, Brevo or Resend)
  so invites come from `enquiries@icontactafricasolutions.org` and aren't rate-limited.
- Optional: edit the **Invite user** email template to match your brand.

## 5. Make yourself the admin
1. Authentication → **Users** → **Invite user** → your own email. Accept the invite and set a password.
2. SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
3. Sign in at `/portal/login.html` — admins are taken to the **Admin Console** automatically.

## 6. Inviting clients (two options)
**A. From the Admin Console (recommended)** — deploy the included Edge Function once:
```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy invite-client
```
Then use **Clients → Invite client**. The function checks that the caller is an admin before inviting.

**B. From Supabase** — Authentication → Users → **Invite user**. The client's profile is created automatically;
add their name/company in Admin → Clients → Edit details.

## Day-to-day workflow
| You do (Admin Console) | Client sees (Dashboard) |
|---|---|
| Create a project, tick "default milestones" | Stage tracker, progress bar, milestones |
| Move stage / progress, tick off milestones | Live progress on Overview |
| Upload a proof with **Needs client approval** | "Awaiting approval" → Approve / Request changes |
| Create an invoice (+ PDF, + payment link) | Invoices table, PDF download, **Pay now** |
| Reply to tickets, set status | Support threads, live replies |
| Review website **Enquiries** | — |

## Testing the security rules (optional)
`supabase/tests/` contains a Postgres test suite that impersonates clients, another client, anonymous
visitors and the admin to prove each can only see/do what they should:
```bash
PGHOST=localhost PGUSER=postgres ./supabase/tests/run.sh
```

## Hosting
Everything is static — upload the whole folder to cPanel, Netlify, Cloudflare Pages or GitHub Pages.
The portal must be served over **https** (all those hosts do this by default).
