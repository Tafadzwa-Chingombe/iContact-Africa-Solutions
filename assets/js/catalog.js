// ==========================================================================
// iContact Africa Solutions — domains, hosting & email catalogue
// --------------------------------------------------------------------------
// ⚠️  EDIT ME: all prices below are PLACEHOLDERS. Replace them with your real
//     reseller prices (USD). Every page that shows plans reads from this file,
//     so a change here updates the Domains page, Hosting page and homepage.
//
//     • Prices are numbers (no "$").
//     • Set `popular: true` on the plan you want highlighted.
//     • Remove a plan or extension by deleting its { … } block.
// ==========================================================================

export const CURRENCY = 'USD';

// Domain extensions.
// `live: true`  → availability is checked instantly via the public registry
//                 lookup (RDAP). Only set this for extensions that support it.
// `live: false` → shown as "We'll confirm" (e.g. .co.zw has no public lookup).
export const TLDS = [
  { tld: 'co.zw',  register: 25, renew: 25, live: false, note: 'Zimbabwe business' },
  { tld: 'com',    register: 18, renew: 18, live: true,  note: 'Most popular worldwide' },
  { tld: 'africa', register: 25, renew: 25, live: true,  note: 'Pan-African brand' },
  { tld: 'org.zw', register: 25, renew: 25, live: false, note: 'Zimbabwe NGOs & non-profits' },
  { tld: 'org',    register: 20, renew: 20, live: true,  note: 'Organisations' },
  { tld: 'net',    register: 20, renew: 20, live: true,  note: 'Networks & tech' },
  { tld: 'online', register: 8,  renew: 35, live: true,  note: 'First year special' },
  { tld: 'store',  register: 10, renew: 55, live: true,  note: 'Online shops' },
  { tld: 'info',   register: 12, renew: 25, live: true,  note: 'Information sites' },
];

// Web hosting. `monthly` = price per month when paid monthly.
// Annual billing: pay ANNUAL_MONTHS months, get 12 (11 = one month free).
export const ANNUAL_MONTHS = 11;

export const HOSTING_PLANS = [
  {
    id: 'starter', name: 'Starter', monthly: 15, popular: false,
    tagline: 'One small business website',
    features: ['1 website', '10 GB SSD storage', 'Free SSL certificate', '5 email accounts', 'Weekly backups', 'Email & WhatsApp support'],
  },
  {
    id: 'business', name: 'Business', monthly: 30, popular: true,
    tagline: 'Growing businesses & online stores',
    features: ['5 websites', '50 GB NVMe storage', 'Free SSL certificate', '25 email accounts', 'Daily backups', 'Free .co.zw domain (annual plans)', 'Priority support'],
  },
  {
    id: 'pro', name: 'Pro', monthly: 50, popular: false,
    tagline: 'High-traffic & multi-site',
    features: ['Unlimited websites', '100 GB NVMe storage', 'Free SSL certificate', 'Unlimited email accounts', 'Daily backups + staging site', 'Free .co.zw domain (annual plans)', 'Priority support & uptime monitoring'],
  },
];

// Professional email hosting, priced per mailbox per month.
export const EMAIL_PLANS = [
  {
    id: 'mail-basic', name: 'Mail Basic', perUser: 10, popular: false,
    tagline: 'Professional address on your domain',
    features: ['10 GB per mailbox', 'Webmail + phone & Outlook setup', 'Spam & virus protection', 'Unlimited aliases'],
  },
  {
    id: 'mail-business', name: 'Mail Business', perUser: 18, popular: true,
    tagline: 'For teams that live in their inbox',
    features: ['30 GB per mailbox', 'Shared calendars & contacts', 'Advanced spam filtering', 'Migration from Gmail/old host', 'Daily mailbox backups'],
  },
  {
    id: 'mail-pro', name: 'Mail Pro', perUser: 25, popular: false,
    tagline: 'Compliance & long-term archiving',
    features: ['50 GB per mailbox', 'Email archiving', 'Shared calendars & contacts', 'Priority migration & support', 'Two-factor login'],
  },
];

// Small print shown under every price table.
export const PRICE_NOTE = 'Prices in USD. Your final price is confirmed on your quote/invoice before you pay.';

export const money = (n) => `$${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}`;
