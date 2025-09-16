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

    // Collect size information before we mutate the markup
    const openingTagMatch = fullMatch.match(/<video\b[^>]*>/i);
    const openingTag = openingTagMatch ? openingTagMatch[0] : '';

    const parseDimension = (value?: string | null): number | undefined => {
      if (!value) return undefined;
      const num = parseFloat(value);
      return Number.isFinite(num) && num > 0 ? num : undefined;
    };

    const readAttrValue = (tag: string, attr: string): string | undefined => {
      const match = tag.match(new RegExp(`${attr}\\s*=\\s*("|')(.*?)\\1`, 'i'));
      return match ? match[2] : undefined;
    };

    const tryGetDimension = (tag: string, names: string[]): number | undefined => {
      for (const name of names) {
        const value = readAttrValue(tag, name);
        const parsed = parseDimension(value);
        if (parsed) return parsed;
      }
      return undefined;
    };

    const widthAttrs = ['data-original-width', 'data-x-width', 'width'];
    const heightAttrs = ['data-original-height', 'data-x-height', 'height'];

    let width = openingTag ? tryGetDimension(openingTag, widthAttrs) : undefined;
    let height = openingTag ? tryGetDimension(openingTag, heightAttrs) : undefined;

    const styleMatch = openingTag.match(/style\s*=\s*("|')(.*?)\1/i);
    if (styleMatch) {
      const styleContent = styleMatch[2];
      if (!width) {
        const styleWidthMatch = styleContent.match(/(?:^|;)\s*width\s*:\s*([0-9.]+)/i);
        width = parseDimension(styleWidthMatch ? styleWidthMatch[1] : undefined);
      }
      if (!height) {
        const styleHeightMatch = styleContent.match(/(?:^|;)\s*height\s*:\s*([0-9.]+)/i);
        height = parseDimension(styleHeightMatch ? styleHeightMatch[1] : undefined);
      }
    }

    // Fallback: sometimes width/height live in data attributes without px, but
    // the numeric parse will have handled that.

    // If no src was found anywhere, return the original block as a comment to hide it
    if (!src) {
      return `<!-- Video with no src found: ${fullMatch} -->`;
    }

    const encodedSrc = encodeURIComponent(src);

    const styleParts = ['width:100%', 'border:0', 'background:black'];
    if (width) {
      styleParts.push(`max-width:${Math.round(width)}px`);
    } else if (height) {
      styleParts.push(`max-height:${Math.round(height)}px`);
    }
    if (width && height) {
      const ratio = Number((width / height).toFixed(6));
      if (ratio > 0) {
        styleParts.push(`aspect-ratio:${ratio}`);
      }
    } else {
      styleParts.push('aspect-ratio:16/9');
    }

    const iframeStyle = `${styleParts.join(';')};`;

    return `<iframe
      src="/embed/video.html?src=${encodedSrc}"
      referrerpolicy="no-referrer"
      style="${iframeStyle}"
      allow="encrypted-media; picture-in-picture; fullscreen"
    ></iframe>`;
  });

  // 4) MediaElement.js (mejs__) wrappers leave behind duplicated controls when
  //    we swap the <video> tag with our own iframe. Strip any element whose
  //    class contains these fragments. If the wrapper contains an <iframe>
  //    keep only the iframe; otherwise drop the block entirely.
  const removableFragments = [
    'mejs__',
    'custom-progress-bar',
    'volume-layer',
    'controls-mouse-hover',
  ];
  const stripPattern = new RegExp(`<([a-z0-9]+)([^>]*class=["'][^"']*(?:${removableFragments.join('|')})[^"']*["'][^>]*)>`, 'i');

  const stripWrappers = (input: string): string => {
    let htmlText = input;

    while (true) {
      stripPattern.lastIndex = 0;
      const match = stripPattern.exec(htmlText);
      if (!match) break;

      const tagName = match[1];
      const openIndex = match.index;
      const openEnd = htmlText.indexOf('>', openIndex);
      if (openEnd === -1) break;

      const lower = htmlText.toLowerCase();
      const tagLower = tagName.toLowerCase();
      let depth = 1;
      let cursor = openEnd + 1;
      let closeStart = -1;

      while (depth > 0) {
        const nextOpen = lower.indexOf(`<${tagLower}`, cursor);
        const nextClose = lower.indexOf(`</${tagLower}`, cursor);

        if (nextClose === -1) {
          closeStart = -1;
          break;
        }

        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth += 1;
          cursor = nextOpen + 1;
          continue;
        }

        depth -= 1;
        closeStart = nextClose;
        cursor = nextClose + tagLower.length + 2;
      }

      if (closeStart === -1) break;

      const closeEnd = lower.indexOf('>', cursor - 1);
      if (closeEnd === -1) break;

      const block = htmlText.slice(openIndex, closeEnd + 1);
      const iframeMatch = block.match(/<iframe[\s\S]*?<\/iframe>/i);
      const replacement = iframeMatch ? iframeMatch[0] : '';

      htmlText = htmlText.slice(0, openIndex) + replacement + htmlText.slice(closeEnd + 1);
    }

    return htmlText;
  };

  out = stripWrappers(out);

  // Some sites wrap the player in a "height_keep" div with large
  // padding-bottom to reserve vertical space. Once we replace the player with
  // a responsive iframe that controls its own aspect ratio, that wrapper just
  // leaves behind a tall empty gap, so strip it while preserving its children.
  out = out.replace(
    /<div\b[^>]*class\s*=\s*("|')[^"']*height_keep[^"']*\1[^>]*>([\s\S]*?)<\/div>/gi,
    (_match, _quote, inner) => inner,
  );

  return out;
}
