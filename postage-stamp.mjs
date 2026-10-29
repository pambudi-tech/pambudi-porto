export const STAMP = Object.freeze({ ratio: 1489 / 930, perf: 2, hole: .3, margin: .85 });

// A stamp's outline at a card's size: a rectangle bitten by half-circle
// perforations every `perf` along each edge, a quarter bite at each corner as
// on a stamp torn from its sheet, and the photo's window cut from its middle.
// Returns the SVG path and the window's inset from the edge.
export function stampShape(width, height, perf) {
  const r = perf * STAMP.hole;
  const inset = Math.round(perf * STAMP.margin);
  const corners = [[0, 0], [width, 0], [width, height], [0, height]];
  const f = n => +n.toFixed(2);
  const arc = (x, y) => ` A ${f(r)} ${f(r)} 0 0 0 ${f(x)} ${f(y)}`;
  let d = `M ${f(r)} 0`;
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
  d += ` Z M ${inset} ${inset} V ${height - inset} H ${width - inset} V ${inset} Z`;
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

export function drawPostageStamp(stamp, width, height, perf) {
  const shape = stampShape(width, height, perf);
  stamp.setAttribute('viewBox', `0 0 ${width} ${height}`);
  stamp.lastChild.setAttribute('d', shape.d);
  stamp.dataset.perforation = String(perf);
  return shape;
}
