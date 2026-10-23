import { FRAME_REGISTRATION } from './frame-registration.mjs';

// The supplied shape already has a 48-unit inward offset. Register it with
// the original ornament, then apply the frame's existing image transform.
export const TEXT_AREA = Object.freeze({ x: 230, y: 139.646, width: 566, height: 979 });

export function textAreaBounds(frame = FRAME_REGISTRATION) {
  const sx = frame.width / 1028, sy = frame.height / 1304;
  return {
    left: (frame.x + TEXT_AREA.x * sx) / frame.paperWidth * 100,
    top: (frame.y + TEXT_AREA.y * sy) / frame.paperHeight * 100,
    width: TEXT_AREA.width * sx / frame.paperWidth * 100,
    height: TEXT_AREA.height * sy / frame.paperHeight * 100,
  };
}

// Read the filled SVG once. Both native text layers use these scanlines;
// the browser still owns wrapping, justification and text selection.
let sharedContour, sharedAboutMask;
function readContour() {
  return sharedContour ??= decodeContour();
}

async function decodeContour() {
  const response = await fetch(new URL('./assets/text-area-path.svg', import.meta.url));
  if (!response.ok) throw new Error(`Text area: ${response.status}`);
  const source = await response.text();
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
  // The About view masks a straight text column with the same supplied shape.
  // Feather only its alpha edge; keep the introduction's wrapping untouched.
  const feathered = source.replace('<path ', '<defs><filter id="about-edge-fade" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3"/></filter></defs><path filter="url(#about-edge-fade)" ');
  sharedAboutMask = `url("data:image/svg+xml,${encodeURIComponent(feathered)}")`;
  const canvas = document.createElement('canvas');
  canvas.width = TEXT_AREA.width; canvas.height = TEXT_AREA.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fill(new Path2D(svg.querySelector('path').getAttribute('d')));
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return Array.from({ length: canvas.height }, (_, y) => {
    let left = 0, right = canvas.width - 1;
    const filled = x => pixels[(y * canvas.width + x) * 4 + 3] >= 128;
    while (left < canvas.width && !filled(left)) left++;
    while (right > left && !filled(right)) right--;
    return left < canvas.width ? [left + 1, right] : [canvas.width / 2, canvas.width / 2];
  });
}

export function contourExclusions(rows, { width, height, top, scaleY }) {
  const half = width / 2, sx = width / TEXT_AREA.width;
  const left = [], right = [];
  const steps = Math.max(1, Math.ceil(height));
  for (let step = 0; step <= steps; step++) {
    const y = step / steps * height;
    const row = Math.floor((top + y) / scaleY);
    const bounds = rows[row] ?? [TEXT_AREA.width / 2, TEXT_AREA.width / 2];
    left.push(`${Math.min(half, bounds[0] * sx).toFixed(3)}px ${y.toFixed(3)}px`);
    right.push(`${Math.max(0, bounds[1] * sx - half).toFixed(3)}px ${y.toFixed(3)}px`);
  }
  return {
    left: `polygon(0px 0px, ${left.join(', ')}, 0px ${height}px)`,
    right: `polygon(${half}px 0px, ${right.join(', ')}, ${half}px ${height}px)`,
  };
}

// Keep a normal left-aligned column. Only the viewport is masked; the text
// never acquires contour floats or changes wrapping as the visitor scrolls.
export async function mountAboutTextMask(copy) {
  if (!copy) return null;
  try {
    await readContour();
    const content = copy.querySelector('.about-content');
    copy.style.setProperty('--about-shape-mask', sharedAboutMask);
    const fade = () => {
      const remaining = Math.max(0, copy.scrollHeight - copy.clientHeight - copy.scrollTop);
      copy.style.setProperty('--about-fade-top', `${Math.min(20, Math.max(0, copy.scrollTop))}px`);
      copy.style.setProperty('--about-fade-bottom', `${Math.min(20, remaining)}px`);
      copy.dataset.scrollable = String(copy.scrollHeight > copy.clientHeight);
    };
    const layout = () => {
      const parent = copy.offsetParent, bounds = textAreaBounds();
      // Enlarge the registered mask 5% around its center. Text remains a straight
      // column, starting 12% down the enlarged shape; scrolling uses its full height.
      const scale = 1.05;
      const mask = {
        left: bounds.left - bounds.width * (scale - 1) / 2,
        top: bounds.top - bounds.height * (scale - 1) / 2,
        width: bounds.width * scale,
        height: bounds.height * scale,
      };
      copy.style.top = `${mask.top}%`;
      copy.style.height = `${mask.height}%`;
      copy.style.bottom = 'auto';
      copy.style.setProperty('--about-content-start', `${mask.height / 100 * parent.clientHeight * .12}px`);
      copy.style.setProperty('--about-scroll-tail', `${Math.max(24, mask.height / 100 * parent.clientHeight * .10)}px`);
      copy.style.setProperty('--about-mask-size', `${mask.width / 100 * parent.clientWidth}px ${mask.height / 100 * parent.clientHeight}px`);
      copy.style.setProperty('--about-mask-position', `${mask.left / 100 * parent.clientWidth - copy.offsetLeft}px ${mask.top / 100 * parent.clientHeight - copy.offsetTop}px`);
      fade();
    };
    copy.dataset.mask = 'ready';
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(copy);
    observer.observe(content);
    copy.addEventListener('scroll', fade, { passive: true });
    return { layout, observer };
  } catch (error) {
    console.warn('About text mask unavailable:', error);
    return null;
  }
}

export async function mountPaperTextContour(copy) {
  try {
    const rows = await readContour();
    const bounds = textAreaBounds();
    Object.entries(bounds).forEach(([name, value]) => { copy.style[name] = `${value}%`; });
    copy.style.right = copy.style.bottom = 'auto';
    const paragraphs = [...copy.querySelectorAll('p')].map(paragraph => {
      const source = paragraph.querySelector('.ink-source');
      const ink = paragraph.querySelector('.ink-bleed-copy');
      for (const layer of [source, ink]) {
        for (const side of ['right', 'left']) {
          const edge = document.createElement('span');
          edge.className = `paper-contour-edge paper-contour-${side}`;
          edge.setAttribute('aria-hidden', 'true');
          layer.prepend(edge);
        }
        const end = document.createElement('span');
        end.className = 'paper-contour-end';
        end.setAttribute('aria-hidden', 'true');
        layer.append(end);
      }
      return { paragraph, end: source.querySelector('.paper-contour-end') };
    });
    copy.dataset.contour = 'ready';
    const layout = () => {
      const width = copy.clientWidth, scaleY = copy.clientHeight / TEXT_AREA.height;
      if (!width || !scaleY) return;
      for (const { paragraph } of paragraphs) {
        paragraph.style.setProperty('--contour-height', '0px');
        paragraph.style.setProperty('--contour-left', 'none');
        paragraph.style.setProperty('--contour-right', 'none');
      }
      const heights = paragraphs.map(({ end }) => end.offsetTop + end.offsetHeight);
      // The paragraph heights affect the centered group's position inside the
      // contour. Settle the native wrapping without inserting manual line breaks.
      for (let pass = 0; pass < 12; pass++) {
        for (const [i, { paragraph }] of paragraphs.entries()) {
          paragraph.style.setProperty('--contour-height', `${heights[i]}px`);
        }
        for (const [i, { paragraph }] of paragraphs.entries()) {
          const edges = contourExclusions(rows, { width, height: heights[i], top: paragraph.offsetTop, scaleY });
          paragraph.style.setProperty('--contour-left', edges.left);
          paragraph.style.setProperty('--contour-right', edges.right);
        }
        const next = paragraphs.map(({ end }) => end.offsetTop + end.offsetHeight);
        if (next.every((height, i) => height === heights[i])) break;
        heights.splice(0, heights.length, ...next);
      }
      copy.dispatchEvent(new Event('paper-contour-layout'));
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(copy);
    return { layout, observer };
  } catch (error) {
    // A missing shape must leave the original native introduction readable.
    console.warn('Paper text contour unavailable:', error);
    return null;
  }
}
