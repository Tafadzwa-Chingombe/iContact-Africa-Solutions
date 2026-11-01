// ==========================================================================
// Careers — job listings
// --------------------------------------------------------------------------
// ✏️  HOW TO POST A JOB: add an object to JOBS below and push. Each role shows
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

const CAREERS_EMAIL = 'enquiries@icontactafricasolutions.org';
const WHATSAPP = '263718574277';

// --------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => new Date(`${d}T12:00:00+02:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
// "today" in Harare (UTC+2) as YYYY-MM-DD
const todayHarare = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);

const list = document.getElementById('jobs');
const none = document.getElementById('no-jobs');
const count = document.getElementById('jobs-count');
const today = todayHarare();
const jobs = JOBS.map((j) => ({ ...j, open: !j.closes || j.closes >= today }))
  .sort((a, b) => (b.open - a.open) || String(a.closes).localeCompare(String(b.closes)));
const openJobs = jobs.filter((j) => j.open);

if (count) count.textContent = openJobs.length ? `${openJobs.length} open role${openJobs.length === 1 ? '' : 's'}` : 'No open roles right now';
if (none) {
  none.querySelector('h3').textContent = jobs.length ? 'No other positions open right now' : 'No positions open right now';
}

if (list && jobs.length) {
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
  list.hidden = false;
}
