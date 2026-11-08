// The resume viewer's sums (src/pages/resume.mjs), apart from the page so
// they can be tested without a browser. A page's `view` is its PDF box,
// [x0, y0, x1, y1] in points, with y counting up from the bottom.

// The canvas a page is drawn on: as crisp as the screen, and at least 1600 px
// wide so a phone can pinch in without blur, but never past 2400 px, as
// phones limit how much canvas a page may hold.
export const CANVAS = Object.freeze({ min: 1600, max: 2400 });

// `scale`: CSS pixels per PDF point at this width. `ratio`: canvas pixels
// per CSS pixel. `width` × `height`: the canvas itself.
export function canvasPlan(cssWidth, [x0, y0, x1, y1], dpr = 1) {
  const scale = cssWidth / (x1 - x0);
  const width = Math.round(Math.min(CANVAS.max, Math.max(CANVAS.min, cssWidth * dpr)));
  const ratio = width / cssWidth;
  return { scale, ratio, width, height: Math.round((y1 - y0) * scale * ratio) };
}

// A link's box as percentages of its page, so it stays on its words at any
// width without being placed again.
export function linkBox([ax, ay, bx, by], [x0, y0, x1, y1]) {
  const pageWidth = x1 - x0, pageHeight = y1 - y0;
  const left = Math.min(ax, bx), right = Math.max(ax, bx);
  const bottom = Math.min(ay, by), top = Math.max(ay, by);
  const percent = value => `${(value * 100).toFixed(3)}%`;
  return {
    left: percent((left - x0) / pageWidth),
    top: percent((y1 - top) / pageHeight),
    width: percent((right - left) / pageWidth),
    height: percent((top - bottom) / pageHeight),
  };
}

// What a link is called aloud.
export function linkLabel(url) {
  try {
    const { protocol, hostname, pathname } = new URL(url);
    if (protocol === 'mailto:') return `Email ${decodeURIComponent(pathname)}`;
    if (hostname === 'wa.me') return `WhatsApp +${pathname.slice(1)}`;
    return hostname.replace(/^www\./, '') + (pathname === '/' ? '' : pathname);
  } catch {
    return url;
  }
}

// Web links open beside the resume; an email link opens the mail app.
export const opensTab = url => /^https?:/i.test(url);
