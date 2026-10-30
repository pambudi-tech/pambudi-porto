import { cornerPitch } from '../stitch/corners.mjs';
import { GRID } from '../stitch/model.mjs';
import { hash, threadSprite } from '../stitch/render.mjs';
import { THREAD_COLORS } from '../stitch/thread-colors.mjs';

// While a project is slow to get ready for its flight: after `cue` ms the
// clicked stamp is sewn around, a ring of red cross-stitches that sews in and
// unpicks in turn, each pass `sweep` ms, each stitch taking `stitch` ms to
// draw its thread; after `words` ms the nav also says so. After `giveUp` ms
// the project opens as a page of its own instead.
export const OPENING = Object.freeze({ cue: 300, words: 2000, giveUp: 6000, sweep: 2800, stitch: 520 });

// The ring's cells, clockwise from the top left, one stitch clear of a stamp
// `width` × `height` whose sides are whole stitches.
export function ringCells(width, height, pitch) {
  const columns = Math.round(width / pitch), rows = Math.round(height / pitch);
  const cells = [];
  for (let col = -2; col <= columns + 1; col++) cells.push([col, -2]);
  for (let row = -1; row <= rows + 1; row++) cells.push([columns + 1, row]);
  for (let col = columns; col >= -2; col--) cells.push([col, rows + 1]);
  for (let row = rows; row >= -1; row--) cells.push([-2, row]);
  return cells.map(([col, row]) => ({ x: col * pitch, y: row * pitch, variation: Math.floor(hash(col, row) * 8) }));
}

// A stitch's thread length `t` ms into the loop: sewn in during the first
// pass, pulled out in the same order during the second.
export function ringProgress(index, count, t, sweep = OPENING.sweep) {
  const pass = sweep + OPENING.stitch;
  const phase = t % (pass * 2);
  const offset = index / Math.max(1, count - 1) * sweep;
  const sewn = Math.max(0, Math.min(1, ((phase % pass) - offset) / OPENING.stitch));
  return phase < pass ? sewn : 1 - sewn;
}

// Sews around a card's stamp, tilting with it. For reduced motion the ring
// stands sewn. `stop` fades it away.
export function sewAround(frame, { reduced = false } = {}) {
  const pitch = cornerPitch(innerWidth), scale = pitch / GRID, dpr = Math.min(devicePixelRatio || 1, 2);
  const cells = ringCells(frame.offsetWidth, frame.offsetHeight, pitch);
  // The thread reaches past its cell; the canvas leaves room for it.
  const pad = Math.ceil(5 * scale) + 1, origin = 2 * pitch + pad;
  const width = frame.offsetWidth + origin * 2, height = frame.offsetHeight + origin * 2;
  const canvas = Object.assign(document.createElement('canvas'), { className: 'works-opening' });
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { left: `${-origin}px`, top: `${-origin}px`, width: `${width}px`, height: `${height}px` });
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  frame.append(canvas);
  const ctx = canvas.getContext('2d');
  const sprites = new Map();
  const started = performance.now();
  let frameId;
  const paint = now => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cells.forEach((cell, index) => {
      const progress = reduced ? 1 : ringProgress(index, cells.length, now - started);
      if (progress <= 0) return;
      const sprite = threadSprite(sprites, THREAD_COLORS.red, cell.variation, progress);
      ctx.drawImage(sprite, origin + cell.x - 5 * scale, origin + cell.y - 5 * scale, (GRID + 10) * scale, (GRID + 10) * scale);
    });
    if (!reduced) frameId = requestAnimationFrame(paint);
  };
  paint(started);
  return {
    async stop() {
      cancelAnimationFrame(frameId);
      await canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 0 : 200, easing: 'ease', fill: 'forwards' }).finished.catch(() => {});
      canvas.remove();
    },
  };
}
