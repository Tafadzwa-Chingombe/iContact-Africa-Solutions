// Fills "from $X" prices on any page: <span data-from="domains|hosting|email"></span>
import { TLDS, HOSTING_PLANS, EMAIL_PLANS, ANNUAL_MONTHS, money } from './catalog.js';

const from = {
  domains: money(Math.min(...TLDS.map((t) => t.register))),
  hosting: money(Math.min(...HOSTING_PLANS.map((p) => p.monthly))),
  email: money(Math.min(...EMAIL_PLANS.map((p) => p.perUser))),
};
document.querySelectorAll('[data-from]').forEach((el) => { if (from[el.dataset.from]) el.textContent = from[el.dataset.from]; });
