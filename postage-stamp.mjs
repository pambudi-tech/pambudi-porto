// `window` is the photo's opening, 4:3 like the project page's cover, so a
// work shows the same crop on its stamp and on its page.
export const STAMP = Object.freeze({ window: 4 / 3, perf: 2, hole: .3, margin: .85 });

// A stamp's outline at a card's size, its top left at x, y: a rectangle
// bitten by half-circle perforations every `perf` along each edge, and a
// quarter bite at each corner as on a stamp torn from its sheet.
export function stampOutline(width, height, perf, x = 0, y = 0) {
  const r = perf * STAMP.hole;
  const corners = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  const f = n => +n.toFixed(2);
  const arc = (x, y) => ` A ${f(r)} ${f(r)} 0 0 0 ${f(x)} ${f(y)}`;
  let d = `M ${f(x + r)} ${f(y)}`;
  corners.forEach(([x0, y0], side) => {
    const [x1, y1] = corners[(side + 1) % 4];
    const [x2, y2] = corners[(side + 2) % 4];
    const length = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / length, dy = (y1 - y0) / length;
    const count = Math.max(2, Math.round(length / perf)), step = length / count;
    // Going round clockwise, each bite curves into the paper.
    for (let i = 1; i < count; i++) {
      const t = i * step;
      d += ` L ${f(x0 + dx * (t - r))} ${f(y0 + dy * (t - r))}${arc(x0 + dx * (t + r), y0 + dy * (t + r))}`;
    }
    // The next corner: a quarter bite, onto the following side.
    const next = Math.hypot(x2 - x1, y2 - y1);
    d += ` L ${f(x1 - dx * r)} ${f(y1 - dy * r)}${arc(x1 + (x2 - x1) / next * r, y1 + (y2 - y1) / next * r)}`;
  });
  return `${d} Z`;
}

// The outline with the photo's window cut from its middle. Returns the SVG
// path and the window's inset from the edge.
export function stampShape(width, height, perf) {
  const inset = Math.round(perf * STAMP.margin);
  const d = `${stampOutline(width, height, perf)} M ${inset} ${inset} V ${height - inset} H ${width - inset} V ${inset} Z`;
  return { d, inset };
}

export function createPostageStamp(id, className = '') {
  const stamp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  stamp.setAttribute('class', `postage-stamp ${className}`.trim());
  stamp.setAttribute('aria-hidden', 'true');
  stamp.innerHTML = `<defs><linearGradient id="${id}" x1=".45" y1="0" x2=".55" y2="1">`
    + '<stop offset="0" stop-color="var(--works-paper-light)" /><stop offset="1" stop-color="var(--works-paper-dark)" /></linearGradient></defs>'
    + `<path fill="url(#${id})" />`;
  return stamp;
}

// `whole` draws the paper without its window, for a photo laid over it.
export function drawPostageStamp(stamp, width, height, perf, { whole = false } = {}) {
  const shape = stampShape(width, height, perf);
  stamp.setAttribute('viewBox', `0 0 ${width} ${height}`);
  stamp.lastChild.setAttribute('d', whole ? stampOutline(width, height, perf) : shape.d);
  stamp.dataset.perforation = String(perf);
  return shape;
}
