// Shared Markdown → safe HTML (admin preview + public blog).
// Content is sanitised with DOMPurify so a post can never inject scripts.
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12.0.2/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/+esm';

marked.setOptions({ gfm: true, breaks: false });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') || '') && !node.getAttribute('href').includes(location.host)) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener');
  }
  if (node.tagName === 'IMG') { node.setAttribute('loading', 'lazy'); node.setAttribute('decoding', 'async'); }
});

export function renderMarkdown(md) {
  return DOMPurify.sanitize(marked.parse(String(md || '')), { USE_PROFILES: { html: true } });
}

export const readingTime = (md) => Math.max(1, Math.round(String(md || '').trim().split(/\s+/).length / 220));

export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120).replace(/-+$/, '');
