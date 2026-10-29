// Procedural paper lace: a strip of joined panels with a scalloped edge,
// punched eyelets, fine mesh, arches, rosettes and a perforated border
// around each window. Everything scales from one band width, so the strip
// adapts to any count, direction and window size.

export const LACE = Object.freeze({
  paper: '#efe3cc',
  // Proportions of the band (the lace between the edge and a window).
  scallop: .3, ribbon: .1, mesh: .07, rosette: .3, arch: .56, frame: .2,
});

// Window rectangles and the strip's size, in CSS pixels. `pad` leaves room
// for the scallops, which bulge outside the strip's base outline.
export function laceLayout({ count, orientation = 'row', window: [w, h], band }) {
  const row = orientation === 'row';
  const r = band * LACE.scallop;
  const pad = Math.ceil(r * 1.9);
  const width = row ? count * w + (count + 1) * band : w + 2 * band;
  const height = row ? h + 2 * band : count * h + (count + 1) * band;
  const windows = Array.from({ length: count }, (_, i) => ({
    x: pad + band + (row ? i * (w + band) : 0),
    y: pad + band + (row ? 0 : i * (h + band)),
    w, h,
  }));
  return { row, band, r, pad, width, height, outerWidth: width + 2 * pad, outerHeight: height + 2 * pad, windows };
}

export function drawLace(canvas, spec, { dpr = 1, paper = LACE.paper } = {}) {
  const layout = laceLayout(spec);
  const { band, r, pad, width, height, windows, row } = layout;
  canvas.width = Math.round(layout.outerWidth * dpr);
  canvas.height = Math.round(layout.outerHeight * dpr);
  canvas.style.width = `${layout.outerWidth}px`;
  canvas.style.height = `${layout.outerHeight}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, layout.outerWidth, layout.outerHeight);
  const x0 = pad, y0 = pad, x1 = pad + width, y1 = pad + height;
  const rib = band * LACE.ribbon, [w, h] = spec.window;
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const edges = scallopCentres(x0, y0, x1, y1, r);
  const inward = (cx, cy, d) => [cx + Math.sign(x0 + width / 2 - cx) * d, cy + Math.sign(y0 + height / 2 - cy) * d];
  const ring = band * .2;

  // Where the solid motifs sit: joints between panels, corners, arches and
  // the openwork ovals in each band.
  const joints = [];
  for (let i = 1; i < windows.length; i++) {
    if (row) { const x = windows[i].x - band / 2; joints.push([x, y0 + band * .5], [x, y1 - band * .5]); }
    else { const y = windows[i].y - band / 2; joints.push([x0 + band * .5, y], [x1 - band * .5, y]); }
  }
  const arches = windows.flatMap(win => row
    ? [[win.x + win.w / 2, win.y - band * .12, win.w * .4, band * LACE.arch, -1], [win.x + win.w / 2, win.y + win.h + band * .12, win.w * .4, band * LACE.arch, 1]]
    : [[win.x - band * .12, win.y + win.h / 2, band * LACE.arch, win.h * .4, -1], [win.x + win.w + band * .12, win.y + win.h / 2, band * LACE.arch, win.h * .4, 1]]);
  const ovals = [];
  for (let i = 0; i <= windows.length; i++) {
    if (row) ovals.push([x0 + band / 2 + i * (w + band), y0 + height / 2, band * .2, h * .28]);
    else ovals.push([x0 + width / 2, y0 + band / 2 + i * (h + band), w * .28, band * .2]);
  }

  // 1. The paper outline: a rectangle with scallops and round corners.
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.rect(x0, y0, width, height);
  for (const { x, y } of edges) circle(ctx, x, y, r);
  for (const [cx, cy] of corners) circle(ctx, cx, cy, r * 1.5);
  ctx.fill();

  // 2. Net everywhere inside the edge ribbon; solid motifs are laid back on top.
  ctx.globalCompositeOperation = 'destination-out';
  mesh(ctx, x0 + ring, y0 + ring, width - ring * 2, height - ring * 2, band);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = ctx.strokeStyle = paper;
  ctx.lineWidth = rib;
  // The edge ribbon and a second, finer one inside it.
  strokeRect(ctx, x0 + ring - rib / 2, y0 + ring - rib / 2, width - ring * 2 + rib, height - ring * 2 + rib);
  // A solid frame around each window, carrying its perforated line.
  ctx.lineWidth = band * LACE.frame;
  for (const win of windows) strokeRect(ctx, win.x - band * LACE.frame / 2, win.y - band * LACE.frame / 2, win.w + band * LACE.frame, win.h + band * LACE.frame);
  // Arches and ovals are double ribbons: a broad one carrying eyelets and a
  // fine one just inside it.
  for (const [width, inset] of [[rib * 1.5, 0], [rib * .45, rib * 1.45]]) {
    ctx.lineWidth = width;
    for (const [cx, cy, rx, ry, side] of arches) halfEllipse(ctx, cx, cy, rx - inset, ry - inset, side, row);
    for (const [cx, cy, rx, ry] of ovals) { ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, rx - inset), Math.max(1, ry - inset), 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.beginPath();
  for (const [x, y] of joints) circle(ctx, x, y, band * LACE.rosette);
  for (const [cx, cy] of corners) circle(ctx, ...inward(cx, cy, band * .46), band * LACE.rosette * 1.05);
  ctx.fill();

  // 3. Eyelets, picots and perforations punched through the solid parts.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  for (const { x, y, nx, ny } of edges) {
    const angle = Math.atan2(ny, nx);
    for (let k = -2; k <= 2; k++) {
      const a = angle + k * .52;
      circle(ctx, x + Math.cos(a) * r * .66, y + Math.sin(a) * r * .66, r * .12);
    }
    circle(ctx, x - nx * r * .05, y - ny * r * .05, r * .26);
  }
  for (const [cx, cy] of corners) {
    for (let k = 0; k < 9; k++) {
      const a = Math.atan2(cy - (y0 + height / 2), cx - (x0 + width / 2)) + (k - 4) * .3;
      circle(ctx, cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05, r * .13);
    }
  }
  for (const point of rectPoints(x0 + ring, y0 + ring, width - ring * 2, height - ring * 2, rib * 1.6)) circle(ctx, point.x, point.y, rib * .28);
  for (const win of windows) {
    for (const point of rectPoints(win.x - band * LACE.frame / 2, win.y - band * LACE.frame / 2,
      win.w + band * LACE.frame, win.h + band * LACE.frame, band * .07)) circle(ctx, point.x, point.y, band * .022);
  }
  for (const [cx, cy, rx, ry, side] of arches) arcEyelets(ctx, cx, cy, rx, ry, side, row, band);
  for (const [cx, cy, rx, ry] of ovals) {
    const steps = Math.round(Math.PI * (rx + ry) / (band * .08));
    for (let i = 0; i < steps; i++) {
      const a = i / steps * Math.PI * 2;
      circle(ctx, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, band * .03);
    }
  }
  for (const [x, y] of joints) rosette(ctx, x, y, band * LACE.rosette);
  for (const [cx, cy] of corners) rosette(ctx, ...inward(cx, cy, band * .46), band * LACE.rosette * 1.05);
  // The windows themselves.
  for (const win of windows) ctx.rect(win.x, win.y, win.w, win.h);
  ctx.fill();

  // 4. Pressed relief along the ribbons, lit from the upper left.
  for (const win of windows) {
    const f = band * LACE.frame;
    emboss(ctx, () => ctx.rect(win.x - f * .82, win.y - f * .82, win.w + f * 1.64, win.h + f * 1.64), .7);
    emboss(ctx, () => ctx.rect(win.x - f * .16, win.y - f * .16, win.w + f * .32, win.h + f * .32), .7);
  }
  emboss(ctx, () => ctx.rect(x0 + ring + rib / 2, y0 + ring + rib / 2, width - ring * 2 - rib, height - ring * 2 - rib), .7);
  return layout;
}

function strokeRect(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.stroke();
}

function halfEllipse(ctx, cx, cy, rx, ry, side, row) {
  const start = row ? (side < 0 ? Math.PI : 0) : (side < 0 ? Math.PI / 2 : -Math.PI / 2);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, start, start + Math.PI);
  ctx.stroke();
}

function arcEyelets(ctx, cx, cy, rx, ry, side, row, band) {
  const start = row ? (side < 0 ? Math.PI : 0) : (side < 0 ? Math.PI / 2 : -Math.PI / 2);
  const steps = Math.round(Math.PI * (rx + ry) / 2 / (band * .075));
  for (let i = 1; i < steps; i++) {
    const a = start + i / steps * Math.PI;
    circle(ctx, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, band * .03);
  }
}

function circle(ctx, x, y, radius) {
  ctx.moveTo(x + radius, y);
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

// Scallop centres sit on the base outline; each knows its outward normal.
function scallopCentres(x0, y0, x1, y1, r) {
  const points = [];
  const side = (ax, ay, bx, by, nx, ny) => {
    const length = Math.hypot(bx - ax, by - ay);
    const count = Math.max(1, Math.round(length / (r * 1.7)));
    for (let i = 1; i < count; i++) points.push({ x: ax + (bx - ax) * i / count, y: ay + (by - ay) * i / count, nx, ny });
  };
  side(x0, y0, x1, y0, 0, -1);
  side(x1, y0, x1, y1, 1, 0);
  side(x1, y1, x0, y1, 0, 1);
  side(x0, y1, x0, y0, -1, 0);
  return points;
}

// Evenly spaced points around a rectangle, landing exactly on its corners.
function rectPoints(x, y, w, h, spacing) {
  const points = [];
  const side = (ax, ay, bx, by) => {
    const count = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / spacing));
    for (let i = 0; i < count; i++) points.push({ x: ax + (bx - ax) * i / count, y: ay + (by - ay) * i / count });
  };
  side(x, y, x + w, y);
  side(x + w, y, x + w, y + h);
  side(x + w, y + h, x, y + h);
  side(x, y + h, x, y);
  return points;
}

// A flower of punched petals around an eyelet, ringed with small dots.
function rosette(ctx, x, y, size) {
  circle(ctx, x, y, size * .2);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const px = x + Math.cos(a) * size * .5, py = y + Math.sin(a) * size * .5;
    ctx.moveTo(px + Math.cos(a) * size * .2, py + Math.sin(a) * size * .2);
    ctx.ellipse(px, py, size * .2, size * .09, a, 0, Math.PI * 2);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i + .5) * Math.PI / 8;
    circle(ctx, x + Math.cos(a) * size * .86, y + Math.sin(a) * size * .86, size * .055);
  }
}

// A staggered net of tiny holes, like machine-punched doily mesh.
function mesh(ctx, x, y, w, h, band) {
  const step = band * LACE.mesh;
  ctx.beginPath();
  for (let row = 0, py = y + step / 2; py <= y + h; row++, py += step * .87) {
    for (let px = x + step / 2 + (row % 2) * step / 2; px <= x + w; px += step) circle(ctx, px, py, step * .34);
  }
  ctx.fill();
}

function emboss(ctx, path, width) {
  // Only on paper: relief never paints across punched holes.
  ctx.globalCompositeOperation = 'source-atop';
  for (const [offset, color] of [[.6, 'rgb(90 70 45 / .16)'], [-.6, 'rgb(255 255 255 / .9)']]) {
    ctx.save();
    ctx.translate(offset, offset);
    ctx.beginPath();
    path();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}
