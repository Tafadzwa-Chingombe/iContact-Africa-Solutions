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

## Writing blog articles
1. Sign in → **Admin Console → Blog → New article**.
2. Write in Markdown (toolbar buttons insert headings, bold, links, lists and images), check the **Preview** tab.
3. Add an excerpt (shown on the blog list and in Google), tags and a cover image.
4. **Save draft** to keep working, or **Publish**. Set a future **Publish date** to schedule it — it appears
   on the website automatically at that time.

Articles appear at `/blog.html` and `/article.html?slug=your-article`. Images are stored in the public
`blog-images` bucket; drafts and scheduled posts are never visible to the public (enforced by the database).

## Posting jobs (Careers)
1. One-time: run `supabase/migrations/20261101_jobs.sql` in Supabase → SQL Editor (already included in `schema.sql`).
2. **Admin Console → Careers → Post a job**: title, location, type, department, closing date, summary,
   "What you'll do" and "What you'll bring" (one per line).
3. **Publish** — it appears on `/careers.html` straight away. After the closing date it shows as *Closed*
   automatically (hidden 60 days later). Use **Close now** to stop applications early, **Duplicate** to reuse a role.
4. Applications go to chingombet@gmail.com (set `CAREERS_EMAIL` in `assets/js/careers.js` to change).

## Live traffic (website analytics)
1. One-time: run `supabase/migrations/20261103_analytics_zoho.sql` in Supabase → SQL Editor (already in `schema.sql`).
2. That's it. Every public page loads `assets/js/track.js`, which records a page view in `page_views`.
   **Admin Console → Live traffic** shows who's on the site right now (refreshes every 15 s, plus a live feed),
   visitors and page views per day, top pages, where visitors come from, devices and time zones.
3. Privacy: no cookies, no IP addresses, no cross-site tracking. A random id lives in the tab's session storage
   only. Visitors with Do Not Track / Global Privacy Control aren't counted, and neither are browsers signed in
   to the portal (so your own visits don't skew the numbers). The Cookie and Privacy pages say this.
4. Visits from `localhost` aren't recorded, so local testing doesn't pollute your stats.

## Billing ↔ Zoho Invoice
The Billing tab can import every invoice from Zoho Invoice, create portal invoices in Zoho, and record
"Mark paid" as a Zoho payment. Your Zoho keys live only in Supabase secrets, never in the website.

1. Run `supabase/migrations/20261103_analytics_zoho.sql` (see above) if you haven't.
2. Find your **data centre**: the domain you sign in to Zoho on — `zoho.com` → `com`, `zoho.eu` → `eu`,
   `zoho.in` → `in`, `zoho.com.au` → `com.au`. Find your **Organisation ID** in Zoho Invoice →
   Settings → Organisation Profile.
3. Go to the Zoho API Console (`https://api-console.zoho.<dc>`) → **Add Client → Self Client** → Create.
   Copy the **Client ID** and **Client Secret**.
4. In the Self Client, open **Generate Code**. Scope:
   `ZohoInvoice.invoices.ALL,ZohoInvoice.contacts.ALL,ZohoInvoice.customerpayments.CREATE`,
   duration 10 minutes, then **Create**, and copy the code.
5. Swap the code for a long-lived refresh token (within 10 minutes). Run this on your own computer,
   replacing the CAPITALS:
   ```bash
   curl -X POST "https://accounts.zoho.DC/oauth/v2/token?grant_type=authorization_code&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&code=CODE"
   ```
   Copy the `refresh_token` from the reply.
6. Supabase → **Edge Functions → Secrets** → add `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
   `ZOHO_REFRESH_TOKEN` and `ZOHO_DC` (plus `ZOHO_ORG_ID` only if you have more than one Zoho organisation). Don't paste these into chat, email or the website.
7. Deploy the functions:
   ```bash
   supabase functions deploy zoho-sync
   supabase functions deploy invite-client
   ```
8. Open **Admin Console → Billing**. You should see "Zoho Invoice connected". Click **Sync now**. After that,
   Billing syncs automatically each time you open it (at most every 15 minutes).

How the sync works:
- **Zoho → portal:** every Zoho invoice is imported or updated (number, amount, balance, dates, status and
  Zoho's online invoice/payment link). Zoho customers are matched to portal clients by email. Invoices for
  customers with no portal login appear under the **Unlinked** filter. Use **Link client** to attach one
  (the link is remembered for that customer's future invoices).
- **Portal → Zoho:** a new invoice made in the portal has "Create in Zoho Invoice too" ticked by default.
  Zoho creates the customer if needed and assigns the invoice number, which the portal then uses.
- **Mark paid** on a Zoho invoice records a payment for the outstanding balance in Zoho.
- For invoices that came from Zoho, change amounts and dates **in Zoho**. The next sync overwrites them in the portal.

## Creating clients and projects from an invoice
In **Billing → New invoice**, choose **+ New client…** or **+ New project…** in the dropdowns to create them
inline. Leave "Email them a Client Portal invite" unticked for a billing-only client. You can invite them
later from **Clients → Invite client** with the same email; they'll get a sign-in link.
(This uses the `invite-client` function, so redeploy it after updating, as in step 7 above.)

## iContact Academy (online courses)

Public pages: `academy.html` (catalogue) and `course.html?slug=…` (one page per course). Students learn in `portal/academy.html`.

1. **Payment details** — fill in `assets/js/academy-config.js` (EcoCash number and name, Paynow link, bank lines). While they are empty, the course page says you will WhatsApp the details.
2. **Courses** — Admin Console → **Academy → Courses**. Edit a course, add lessons (video link + notes), mark one or two lessons as *Free preview*, then **Publish**. Only published courses appear on the website. Use *unlisted* YouTube/Vimeo links (or Google Drive/Loom/MP4); anyone with an unlisted link can watch it, so treat it as "hidden", not "locked".
3. **Enrolments** — a visitor requests a place on the course page → it shows under **Academy → Requests** (badge on the nav). Check the money has arrived, click **Approve**: this creates their login (role `student`), gives access, and gives you a one-time sign-in link with a **Send on WhatsApp** button. Prefer the link over email — Supabase's built-in email is limited to a few messages an hour.
4. **Students** tab — remove/restore access, or make a fresh **Login link** if theirs expired. **Add a student** gives access without a website request (e.g. a cash payment).
5. Existing clients who buy a course keep their client role and see the course under **Academy** in their portal.

Database: `supabase/migrations/20261111_academy.sql` (already applied). Lesson content is protected by row-level security: only enrolled students and admins can read non-preview lessons.

## AI assistant calls (Nyasha / ElevenLabs)

Every conversation with Nyasha — the voice/chat assistant on the website — is recorded and analysed by ElevenLabs (transcript, audio, summary and the lead details she collects). **Admin Console → AI calls** copies them in so you don't need to log in to ElevenLabs.

**One-time setup (≈3 minutes):**
1. ElevenLabs → **Developers → API keys → Create key**. Name it `iContact portal`, restrict it to **ElevenAgents → Read** only (nothing else), and copy it.
2. Supabase → **Edge Functions → Secrets → Add secret**: name `ELEVENLABS_API_KEY`, paste the key, save. (Never put this key in website files or chat.)
3. Open **Admin Console → AI calls** and click **Sync now**.

**Using it:**
- The tab syncs itself when you open it (at most every 10 minutes); **Sync now** forces it.
- Calls where Nyasha captured a phone number or email are **leads**: they get a badge on the menu, a WhatsApp/Call button, and are also added to **Enquiries** (tagged *AI call*). Tick **Followed up** to clear the badge. People who asked not to be contacted are never added to Enquiries.
- Open a call for the summary, all collected details, the full transcript, quality checks and the recording (streamed from ElevenLabs when you click *Load recording*; it isn't copied into your storage).
- Recordings and transcripts stay in ElevenLabs as well; its retention settings decide how long they're kept there. The portal keeps its copy of the transcript until you delete the row.

Database: `supabase/migrations/20261112_ai_calls.sql` (already applied). Function: `supabase/functions/elevenlabs-sync`.

## Testing the security rules (optional)
`supabase/tests/` contains a Postgres test suite that impersonates clients, another client, anonymous
visitors and the admin to prove each can only see/do what they should:
```bash
PGHOST=localhost PGUSER=postgres ./supabase/tests/run.sh
```

## Hosting
Everything is static — upload the whole folder to cPanel, Netlify, Cloudflare Pages or GitHub Pages.
The portal must be served over **https** (all those hosts do this by default).
