// ==========================================================================
// Careers — job listings
// --------------------------------------------------------------------------
// ✏️  EASIEST: post jobs in the Admin Console → Careers (they load from Supabase).
// You can also hard-code roles here: add an object to JOBS below and push. Each role shows
// as "Open" until its closing date, then automatically switches to "Closed"
// (closing day is inclusive, Harare time). Delete old roles whenever you like.
//
// Example (copy, uncomment and edit):
// {
//   title: 'Junior Web Designer',
//   location: 'Harare · Hybrid',
//   type: 'Full-time',
//   department: 'Design',
//   closes: '2026-12-15',                      // YYYY-MM-DD
//   summary: 'One or two sentences about the role and who will thrive in it.',
//   responsibilities: ['Design pages in Figma', 'Build sites in HTML/CSS'],
//   requirements: ['A portfolio of web work', 'Strong eye for detail'],
// },
// ==========================================================================
const JOBS = [
];

const CAREERS_EMAIL = 'chingombet@gmail.com';
const WHATSAPP = '263718574277';

// --------------------------------------------------------------------------
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../portal/js/config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => new Date(`${d}T12:00:00+02:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
// "today" in Harare (UTC+2) as YYYY-MM-DD
const todayHarare = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);

const list = document.getElementById('jobs');
const none = document.getElementById('no-jobs');
const count = document.getElementById('jobs-count');

function render(all) {
  const today = todayHarare();
  const jobs = all.map((j) => ({ ...j, open: !j.closes || j.closes >= today }))
    .sort((a, b) => (b.open - a.open) || String(a.closes || '9999').localeCompare(String(b.closes || '9999')));
  const openJobs = jobs.filter((j) => j.open);
  if (count) count.textContent = openJobs.length ? `${openJobs.length} open role${openJobs.length === 1 ? '' : 's'}` : 'No open roles right now';
  if (none) none.querySelector('h3').textContent = jobs.length ? 'No other positions open right now' : 'No positions open right now';
  if (!list) return;
  list.hidden = !jobs.length;
  list.innerHTML = jobs.map((j, i) => {
    const subject = encodeURIComponent(`Application: ${j.title}`);
    const body = encodeURIComponent(`Hi iContact,\n\nI'd like to apply for the ${j.title} role. My CV is attached.\n\nName:\nPhone:\nPortfolio/LinkedIn:\n`);
    return `
    <article class="job${j.open ? '' : ' is-closed'}">
      <header class="job-head">
        <h3>${esc(j.title)}</h3>
        <span class="job-status">${j.open ? 'Open' : 'Closed'}</span>
      </header>
      <ul class="job-meta">
        ${j.location ? `<li>📍 ${esc(j.location)}</li>` : ''}${j.type ? `<li>🕒 ${esc(j.type)}</li>` : ''}${j.department ? `<li>🏷️ ${esc(j.department)}</li>` : ''}
        ${j.closes ? `<li>📅 ${j.open ? 'Closes' : 'Closed'} ${fmt(j.closes)}</li>` : ''}
      </ul>
      ${j.summary ? `<p>${esc(j.summary)}</p>` : ''}
      ${(j.responsibilities?.length || j.requirements?.length) ? `
      <details class="job-more"${i === 0 && j.open ? ' open' : ''}>
        <summary>Role details</summary>
        ${j.responsibilities?.length ? `<h4>What you&rsquo;ll do</h4><ul>${j.responsibilities.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        ${j.requirements?.length ? `<h4>What you&rsquo;ll bring</h4><ul>${j.requirements.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      </details>` : ''}
      <footer class="job-foot">${j.open
        ? `<a class="btn btn-primary btn-sm" href="mailto:${CAREERS_EMAIL}?subject=${subject}&body=${body}">Apply by email</a>
           <a class="btn btn-outline btn-sm" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hi, I'm interested in the ${j.title} role.`)}" target="_blank" rel="noopener">Ask on WhatsApp</a>`
        : '<span class="muted">Applications for this role have closed.</span>'}</footer>
    </article>`;
  }).join('');
}

// 1) roles hard-coded above, straight away
render(JOBS);

// 2) roles posted from the Admin Console (published only — enforced by the database)
(async () => {
  if (SUPABASE_URL.includes('YOUR-PROJECT-REF')) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?select=title,location,employment_type,department,summary,responsibilities,requirements,closes_on&status=eq.published&order=closes_on.asc.nullslast`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) return; // e.g. jobs table not created yet — keep the static list
    const rows = await res.json();
    const fromDb = rows.map((r) => ({ title: r.title, location: r.location, type: r.employment_type, department: r.department,
      summary: r.summary, responsibilities: r.responsibilities, requirements: r.requirements, closes: r.closes_on }));
    // hide roles that closed more than 60 days ago so the page stays tidy
    const cutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    render([...JOBS, ...fromDb.filter((j) => !j.closes || j.closes >= cutoff)]);
  } catch { /* offline or blocked: keep the static list */ }
})();
