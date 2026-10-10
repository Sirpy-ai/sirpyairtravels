/* ==========================================================================
   Sirpy Air Travels — tiny, safe Markdown for blog posts
   Used by /post and the admin editor preview. Everything is HTML-escaped
   first, so a post can never inject scripts; only these are supported:
     # / ## / ### headings      - bullet list      1. numbered list
     > quote                    ![alt](image-url)  [text](link)
     **bold**  *italic*         blank line = new paragraph
   ========================================================================== */
(function () {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* Only web, site-relative, mail, phone and WhatsApp links. */
  const safeUrl = (u) => (/^(https?:\/\/|\/(?!\/)|mailto:|tel:)/i.test(u) ? u : '#');

  function inline(text) {
    return esc(text)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy">`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
        const url = safeUrl(href);
        const ext = /^https?:/i.test(url) && !/^https?:\/\/(www\.)?sirpyairtravels\.com/i.test(url);
        return `<a href="${url}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  }

  function md(src) {
    const out = [];
    const blocks = String(src || '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
    for (const block of blocks) {
      const lines = block.split('\n').filter((l) => l.trim());
      if (!lines.length) continue;
      const first = lines[0];
      let m;
      if ((m = /^(#{1,3})\s+(.*)$/.exec(first)) && lines.length === 1) {
        const n = m[1].length + 1; // # -> h2 (the page already has the h1)
        out.push(`<h${n}>${inline(m[2])}</h${n}>`);
      } else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`);
      } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
        out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`);
      } else if (lines.every((l) => /^>\s?/.test(l))) {
        out.push(`<blockquote>${lines.map((l) => inline(l.replace(/^>\s?/, ''))).join('<br>')}</blockquote>`);
      } else if (lines.length === 1 && /^!\[[^\]]*\]\([^)]+\)$/.test(first.trim())) {
        out.push(`<figure>${inline(first.trim())}</figure>`);
      } else {
        out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
      }
    }
    return out.join('\n');
  }

  window.SirpyMd = md;
})();
