// Turn a lesson's video link into an embedded player (shared by the public preview and the student portal).
// Supports YouTube (watch, youtu.be, shorts), Vimeo, Google Drive share links, Loom, and direct .mp4/.webm files.
const escAttr = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function videoSrc(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  let m;
  if (host === 'youtu.be') return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}?rel=0` };
  if (host.endsWith('youtube.com')) {
    const id = u.searchParams.get('v') || ((m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)) && m[1]);
    if (id) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  }
  if (host.endsWith('vimeo.com') && (m = u.pathname.match(/\/(\d+)(?:\/(\w+))?/))) return { kind: 'iframe', src: `https://player.vimeo.com/video/${m[1]}${m[2] ? `?h=${m[2]}` : ''}` };
  if (host === 'drive.google.com' && (m = u.pathname.match(/\/file\/d\/([\w-]+)/))) return { kind: 'iframe', src: `https://drive.google.com/file/d/${m[1]}/preview` };
  if (host.endsWith('loom.com') && (m = u.pathname.match(/\/(?:share|embed)\/(\w+)/))) return { kind: 'iframe', src: `https://www.loom.com/embed/${m[1]}` };
  if (/\.(mp4|webm|m4v)(\?|$)/i.test(u.pathname)) return { kind: 'video', src: url };
  return { kind: 'link', src: url };
}

export function videoEmbed(url, title = 'Lesson video') {
  const v = videoSrc(url);
  if (!v) return '';
  if (v.kind === 'iframe') return `<div class="lesson-video"><iframe src="${escAttr(v.src)}" title="${escAttr(title)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  if (v.kind === 'video') return `<div class="lesson-video"><video src="${escAttr(v.src)}" controls playsinline preload="metadata"></video></div>`;
  return `<p><a class="btn btn-outline" href="${escAttr(v.src)}" target="_blank" rel="noopener">Open the lesson video ↗</a></p>`;
}
