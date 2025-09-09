// Lightweight HTML normalizer to improve readability/safety of crawled HTML
// NOTE: This avoids heavy dependencies. It focuses on images and obvious overflow sources.

export function normalizeCrawledHtml(html: string): string {
  if (!html || typeof html !== 'string') return html;

  let out = html;

  // 1) Normalize <img> tags: add referrerpolicy, remove fixed width/height, enforce responsive sizing
  out = out.replace(/<img\b[^>]*?>/gi, (imgTag) => {
    let t = imgTag;
    
    // Add referrerpolicy to bypass CDN referrer checks
    if (!/referrerpolicy/i.test(t)) {
      t = t.replace(/<img/i, '<img referrerpolicy="no-referrer"');
    }

    // Drop width/height attributes
    t = t.replace(/\s(?:width|height)\s*=\s*("|')[^"']*\1/gi, "");
    // Normalize style – remove width/height/min/max width; keep the rest; then append our rules
    if (/\sstyle\s*=\s*("|')/i.test(t)) {
      t = t.replace(/\sstyle\s*=\s*("|')(.*?)\1/gi, (_m, q, style) => {
        let s = String(style)
          .replace(/(?:^|;)\s*max-width\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*min-width\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*width\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*height\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*left\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*right\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*position\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*transform\s*:[^;]+;?/gi, '')
          .trim();
        if (s && !s.endsWith(';')) s += ';';
        s += 'width:100% !important;max-width:100% !important;height:auto !important;object-fit:contain !important;';
        return ` style=${q}${s}${q}`;
      });
    } else {
      t = t.replace(/<img\b/i, '<img style="width:100% !important;max-width:100% !important;height:auto !important;object-fit:contain !important;"');
    }
    // Ensure display block for predictable layout
    if (!/display\s*:/i.test(t)) {
      t = t.replace(/\sstyle\s*=\s*("|')/i, (_m, q) => ` style=${q}display:block;${q}`);
    }
    return t;
  });

  // 2) Neutralize fixed positioning and floats for common wrappers that can cause overflow
  // Only touch obvious inline styles.
  out = out.replace(/<(div|section|article|aside|figure)\b([^>]*?)>/gi, (m, tag, rest) => {
    let r = rest;
    if (/\sstyle\s*=\s*("|')/i.test(r)) {
      r = r.replace(/\sstyle\s*=\s*("|')(.*?)\1/gi, (_m, q, style) => {
        let s = String(style)
          .replace(/(?:^|;)\s*max-width\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*min-width\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*width\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*left\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*right\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*position\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*transform\s*:[^;]+;?/gi, '')
          .replace(/(?:^|;)\s*float\s*:[^;]+;?/gi, '')
          .trim();
        if (s && !s.endsWith(';')) s += ';';
        s += 'max-width:100% !important;width:auto !important;position:static !important;transform:none !important;float:none !important;';
        return ` style=${q}${s}${q}`;
      });
      return `<${tag}${r}>`;
    }
    return m;
  });

  // 3) Replace <video> tags with an iframe pointing to our static embed helper
  out = out.replace(/<video\b[^>]*?>([\s\S]*?)<\/video>/gi, (fullMatch, innerContent) => {
    let src = '';
    
    // Case 1: Check for src on the <video> tag itself
    const videoTagSrcMatch = fullMatch.match(/<video\b[^>]*?src\s*=\s*("|')([^"'\s>]+)/i);
    if (videoTagSrcMatch && videoTagSrcMatch[2]) {
        src = videoTagSrcMatch[2];
    } 
    // Case 2: If not found, check for src in a <source> tag
    else if (innerContent) {
        const sourceTagSrcMatch = innerContent.match(/<source\b[^>]*?src\s*=\s*("|')([^"'\s>]+)/i);
        if (sourceTagSrcMatch && sourceTagSrcMatch[2]) {
            src = sourceTagSrcMatch[2];
        }
    }

    // If no src was found anywhere, return the original block as a comment to hide it
    if (!src) {
        return `<!-- Video with no src found: ${fullMatch} -->`;
    }

    // If we found a src, build the iframe pointing to our static helper page
    const encodedSrc = encodeURIComponent(src);
    return `<iframe
      src="/embed/video.html?src=${encodedSrc}"
      referrerpolicy="no-referrer"
      style="width:100%;aspect-ratio:16/9;border:0;background:black;"
      allow="encrypted-media; picture-in-picture; fullscreen"
    ></iframe>`;
  });

  return out;
}
