import { GRID, surfaceSpacing, THREADS, parseKey } from './model.mjs';
import { ORNAMENT_COLOR } from './dot-matrix.mjs';

export const THREAD_WEIGHT = 1.15;

const colors = Object.fromEntries(THREADS.map(thread => [thread.id, thread.color]));
export const hash = (x, y, salt = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 43.13) * 43758.5453;
  return n - Math.floor(n);
};
const mix = (hex, target, amount) => {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16));
  // Keep the cotton highlights subdued along with the near-black ornaments.
  const brightness = hex === ORNAMENT_COLOR ? .55 : 1;
  return `rgb(${rgb.map((v, i) => Math.round((v + (target[i] - v) * amount) * brightness)).join(',')})`;
};
const easeOut = value => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);

function threadPoints(x0, y0, x1, y1, seed, slack = 0) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  return Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    const bow = Math.sin(t * Math.PI) * ((seed - .5) * .8 + slack);
    const variation = Math.sin(t * Math.PI * 3 + seed * 6) * .38 * Math.sin(t * Math.PI);
    return { x: x0 + dx * t + nx * (bow + variation), y: y0 + dy * t + ny * (bow + variation), t };
  });
}

function line(ctx, points, progress, offsetX = 0, offsetY = 0) {
  const last = progress * (points.length - 1), integer = Math.floor(last);
  ctx.beginPath();
  ctx.moveTo(points[0].x + offsetX, points[0].y + offsetY);
  for (let i = 1; i <= integer; i++) ctx.lineTo(points[i].x + offsetX, points[i].y + offsetY);
  if (integer < points.length - 1) {
    const fraction = last - integer, p = points[integer], q = points[integer + 1];
    ctx.lineTo(p.x + (q.x - p.x) * fraction + offsetX, p.y + (q.y - p.y) * fraction + offsetY);
  }
}

function strand(ctx, points, color, seed, progress, top) {
  if (progress <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const start = points[0], end = points.at(-1);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const nx = -(end.y - start.y) / length, ny = (end.x - start.x) / length;
  // Floss spreads between the holes, then gathers into each entry point.
  // Six separate plies give the broad, soft shoulders of a sewn cotton X.
  const spread = t => (.12 + .88 * Math.pow(Math.sin(Math.PI * t), .3))
    * (1 - .16 * Math.pow(Math.sin(Math.PI * t), 6))
    * (1 + .09 * Math.sin(t * Math.PI * 3 + seed * 6));
  const width = (8.4 + seed * .9) * THREAD_WEIGHT;
  const fiber = (offset, phase = 0) => points.map(p => {
    const gather = spread(p.t);
    const twist = Math.sin(p.t * Math.PI * 3.2 + phase + seed * 5)
      * .38 * Math.sin(p.t * Math.PI);
    return { ...p, x: p.x + nx * (offset * gather + twist), y: p.y + ny * (offset * gather + twist) };
  });
  const edgeA = fiber(-width / 2), edgeB = fiber(width / 2);
  const ribbon = (offsetX = 0, offsetY = 0) => {
    // Reuse the same fractional endpoint as the plies during sewing/unpicking.
    const trim = edge => {
      const last = progress * (edge.length - 1), index = Math.floor(last);
      const result = edge.slice(0, index + 1);
      if (index < edge.length - 1) {
        const p = edge[index], q = edge[index + 1], fraction = last - index;
        result.push({ x: p.x + (q.x - p.x) * fraction, y: p.y + (q.y - p.y) * fraction });
      }
      return result;
    };
    const outline = [...trim(edgeA), ...trim(edgeB).reverse()];
    ctx.beginPath();
    ctx.moveTo(outline[0].x + offsetX, outline[0].y + offsetY);
    for (const p of outline.slice(1)) ctx.lineTo(p.x + offsetX, p.y + offsetY);
    ctx.closePath();
    ctx.fill();
  };
  // A restrained contact shadow separates the upper diagonal at the crossing.
  ctx.fillStyle = 'rgba(43, 35, 28, .18)';
  ctx.shadowColor = 'rgba(43, 35, 28, .18)';
  ctx.shadowBlur = top ? 1.2 : .65;
  ctx.shadowOffsetY = top ? .65 : .35;
  ribbon(.25, top ? .7 : .4);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = mix(color, [38, 29, 25], .23);
  ribbon();
  for (let ply = 0; ply < 6; ply++) {
    const offset = (ply / 5 - .5) * (width - 1.1);
    const path = fiber(offset, ply * 1.1);
    const light = hash(ply, seed, 7);
    line(ctx, path, progress);
    ctx.lineWidth = (1.18 + light * .16) * THREAD_WEIGHT;
    ctx.strokeStyle = mix(color, [255, 240, 219], .04 + light * .09);
    ctx.stroke();
    // Longitudinal filaments follow each ply, with gentle, uneven highlights.
    line(ctx, path, progress, -.22, -.26);
    ctx.lineWidth = .30 * THREAD_WEIGHT;
    ctx.strokeStyle = mix(color, [255, 245, 226], .15 + light * .10);
    ctx.stroke();
    line(ctx, path, progress, .25, .24);
    ctx.lineWidth = .23 * THREAD_WEIGHT;
    ctx.strokeStyle = mix(color, [35, 27, 24], .14);
    ctx.stroke();
    // Small fibers break up the sheen along the cotton instead of forming
    // the repeated transverse bands of a smooth cord.
    for (let i = 2; i + 2 < path.length * progress; i += 3) {
      const grain = hash(i, ply, seed * 9);
      const off = (grain - .5) * .65;
      line(ctx, path.slice(i, i + 3), 1, nx * off, ny * off);
      ctx.lineWidth = (.12 + grain * .1) * THREAD_WEIGHT;
      ctx.strokeStyle = grain > .45
        ? mix(color, [255, 246, 225], .24 + grain * .12)
        : mix(color, [35, 27, 24], .16);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawCross(ctx, x, y, colorId, variation = 0, progress = 1) {
  const color = colors[colorId] || colorId;
  const seed = hash(variation, 9, 4);
  const first = easeOut(progress / .52);
  const second = easeOut((progress - .42) / .58);
  const tightening = progress < 1 ? Math.sin(progress * Math.PI) * .9 : 0;
  ctx.save();
  ctx.translate(x, y);
  // Very small shaded entry points anchor the thread into the perforations.
  if (progress === 1) {
    for (const [px, py] of [[0, 0], [GRID, 0], [0, GRID], [GRID, GRID]]) {
      ctx.fillStyle = mix(color, [35, 29, 23], .38);
      ctx.beginPath();
      ctx.ellipse(px, py + .05, .85 * THREAD_WEIGHT, .65 * THREAD_WEIGHT, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  strand(ctx, threadPoints(.15, GRID - .15, GRID - .15, .15, seed, tightening), color, seed, first, false);
  strand(ctx, threadPoints(.15, .15, GRID - .15, GRID - .15, 1 - seed, -tightening), color, 1 - seed, second, true);
  ctx.restore();
}

export class SurfaceRenderer {
  constructor(cloth, embroidery, gesture) {
    this.clothCanvas = cloth;
    this.stitchCanvas = embroidery;
    this.gestureCanvas = gesture;
    this.cloth = cloth.getContext('2d', { alpha: false });
    this.stitch = embroidery.getContext('2d');
    this.gesture = gesture.getContext('2d');
    this.sprites = new Map();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
  }
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    for (const canvas of [this.clothCanvas, this.stitchCanvas, this.gestureCanvas]) {
      canvas.width = Math.round(width * this.dpr);
      canvas.height = Math.round(height * this.dpr);
    }
  }
  clear(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  world(ctx, view) {
    ctx.setTransform(this.dpr * view.scale, 0, 0, this.dpr * view.scale, this.dpr * view.x, this.dpr * view.y);
  }
  drawCloth(view) {
    const ctx = this.cloth;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.width, this.height);
    // Quiet perforations keep the stitchable grid without fabric grain.
    this.world(ctx, view);
    const left = -view.x / view.scale, top = -view.y / view.scale;
    const width = this.width / view.scale, height = this.height / view.scale;
    // Undo the pitch multiplier for dot sizing: spacing changes, diameter does not.
    const spacing = surfaceSpacing(this.width);
    const baselineScale = view.scale / spacing;
    const holeRadius = Math.max(1.5, .42 / baselineScale) / spacing;
    ctx.fillStyle = '#202020';
    ctx.beginPath();
    for (let row = Math.floor(top / GRID); row <= Math.ceil((top + height) / GRID); row++) {
      for (let col = Math.floor(left / GRID); col <= Math.ceil((left + width) / GRID); col++) {
        const x = col * GRID, y = row * GRID;
        ctx.moveTo(x + holeRadius, y);
        ctx.arc(x, y, holeRadius, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
  sprite(color, variation, progress = 1) {
    const step = Math.round(progress * 12);
    const key = `${color}:${variation}:${step}`;
    if (!this.sprites.has(key)) {
      const sprite = document.createElement('canvas');
      const scale = 3, margin = 5;
      sprite.width = sprite.height = (GRID + margin * 2) * scale;
      const ctx = sprite.getContext('2d');
      ctx.scale(scale, scale);
      drawCross(ctx, margin, margin, color, variation, step / 12);
      if (this.sprites.size > 768) {
        // Keep finished cotton sprites while short-lived motif frames cycle.
        const transient = [...this.sprites.keys()].find(key => !key.endsWith(':12'));
        this.sprites.delete(transient ?? this.sprites.keys().next().value);
      }
      this.sprites.set(key, sprite);
    }
    return this.sprites.get(key);
  }
  drawStitches(model, view, animations = new Map(), movingCells = new Map(), entrance = null, now = 0) {
    this.clear(this.stitch);
    this.world(this.stitch, view);
    const occupied = new Set();
    for (const [key, color] of model.stitches) {
      const stored = parseKey(key);
      if (this.isCellVisible && !this.isCellVisible(...stored)) continue;
      const [col, row] = this.resolveCell?.(...stored) ?? stored;
      occupied.add(`${col},${row}`);
      const animation = animations.get(key);
      if (animation?.kind === 'add') continue;
      if (animation?.kind === 'unpick' && animation.revealUnderneath) continue;
      // Motifs sew on the embroidery layer so their reveal stays beneath
      // the paper, exactly like the finished stitches.
      const progress = animation?.kind === 'motif'
        ? Math.max(0, Math.min(1, (now - animation.started) / animation.duration))
        : entrance?.progress(key, now) ?? 1;
      if (progress <= 0) continue;
      const x = col * GRID, y = row * GRID;
      const sx = x * view.scale + view.x, sy = y * view.scale + view.y;
      if (sx < -GRID * view.scale || sy < -GRID * view.scale || sx > this.width || sy > this.height) continue;
      const variation = Math.floor(hash(col, row) * 8);
      this.stitch.drawImage(this.sprite(color, variation, progress), x - 5, y - 5, GRID + 10, GRID + 10);
    }
    for (const [key, animation] of animations) {
      if (animation.kind !== 'erase' && animation.kind !== 'unpick') continue;
      const stored = parseKey(key);
      if (this.isCellVisible && !this.isCellVisible(...stored)) continue;
      const [col, row] = this.resolveCell?.(...stored) ?? stored;
      occupied.add(`${col},${row}`);
      if (animation.kind === 'unpick') {
        const progress = animation.from * (1 - Math.max(0, Math.min(1, (now - animation.started) / animation.duration)));
        if (progress > 0) this.stitch.drawImage(this.sprite(animation.color, Math.floor(hash(col, row) * 8), progress), col * GRID - 5, row * GRID - 5, GRID + 10, GRID + 10);
      }
    }
    // One thread per surface cell. Permanent embroidery keeps its place as
    // the bird stitches and unpicks the surrounding holes.
    for (const [key, { col, row, color, progress }] of movingCells) {
      if (occupied.has(key)) continue;
      const x = col * GRID, y = row * GRID;
      const sx = x * view.scale + view.x, sy = y * view.scale + view.y;
      if (sx < -GRID * view.scale || sy < -GRID * view.scale || sx > this.width || sy > this.height) continue;
      this.stitch.drawImage(this.sprite(color, Math.floor(hash(col, row) * 8), progress), x - 5, y - 5, GRID + 10, GRID + 10);
    }
  }
  drawInteraction(view, animations, hover, color, mode, now, keyboard) {
    this.clear(this.gesture);
    const ctx = this.gesture;
    this.world(ctx, view);
    for (const [key, animation] of animations) {
      if (animation.kind === 'motif' || animation.kind === 'unpick') continue;
      const stored = parseKey(key);
      if (this.isCellVisible && !this.isCellVisible(...stored)) continue;
      const [col, row] = this.resolveCell?.(...stored) ?? stored;
      const elapsed = (now - animation.started) / animation.duration;
      if (elapsed < 0 && animation.kind !== 'erase') continue;
      const progress = Math.max(0, Math.min(1, elapsed));
      const variation = Math.floor(hash(col, row) * 8);
      if (animation.kind === 'erase') {
        drawCross(ctx, col * GRID, row * GRID, animation.color, variation, 1 - progress);
      } else drawCross(ctx, col * GRID, row * GRID, animation.color, variation, progress);
    }
    if (!hover) return;
    const { col, row, x, y } = hover;
    const wx = col * GRID, wy = row * GRID;
    // Motif placement uses the original single-stitch preview. Its position
    // comes only from the active cell, so it steps between the surface holes.
    if (mode === 'stitch' || mode === 'motif') {
      ctx.save();
      ctx.globalAlpha = keyboard ? .48 : .27;
      drawCross(ctx, wx, wy, color, Math.floor(hash(col, row) * 8));
      ctx.restore();
      for (const [px, py] of [[wx, wy], [wx + GRID, wy], [wx, wy + GRID], [wx + GRID, wy + GRID]]) {
        ctx.beginPath();
        ctx.arc(px, py, 2.8, 0, Math.PI * 2);
        ctx.strokeStyle = mix(colors[color] || color, [255, 255, 255], .5);
        ctx.lineWidth = .65;
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(103,77,62,.5)';
      ctx.lineWidth = .9 / view.scale;
      ctx.setLineDash([2 / view.scale, 3 / view.scale]);
      ctx.strokeRect(wx - 3, wy - 3, GRID + 6, GRID + 6);
      ctx.setLineDash([]);
    }
    if (keyboard || mode === 'motif' || mode === 'unpick') return;
    // A tiny needle has a real eye and a loose loop of the selected thread.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    ctx.translate(x + 1, y - 1);
    ctx.rotate(.62);
    if (mode === 'stitch') {
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.bezierCurveTo(17, -47, 28, -13, 11, -18);
      ctx.bezierCurveTo(5, -20, 5, -28, 0, -24);
      ctx.strokeStyle = colors[color];
      ctx.lineWidth = 1;
      ctx.stroke();
      const metal = ctx.createLinearGradient(-2, 0, 2, 0);
      metal.addColorStop(0, '#777b79');
      metal.addColorStop(.45, '#fbfcf7');
      metal.addColorStop(1, '#666c69');
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-1.7, -13, -1.4, -25);
      ctx.quadraticCurveTo(0, -29, 1.4, -25);
      ctx.quadraticCurveTo(1.7, -13, 0, 0);
      ctx.fillStyle = metal;
      ctx.shadowColor = '#46413740';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#575d58';
      ctx.lineWidth = .65;
      ctx.beginPath();
      ctx.ellipse(0, -23.8, .55, 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#747a6b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -15);
      ctx.lineTo(-4, -20);
      ctx.moveTo(0, -15);
      ctx.lineTo(3, -22);
      ctx.stroke();
    }
    ctx.restore();
  }
}
