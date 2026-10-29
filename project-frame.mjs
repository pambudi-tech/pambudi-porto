import { CORNER_ROWS, CORNER_SIZE } from './corners.mjs';
import { GRID } from './model.mjs';
import { hash } from './render.mjs';
import { ProjectStitches } from './project-stitches.mjs';

export const projectFrameGap = pitch => pitch * 2 + 20;

// The same ornament cells and cotton-thread rendering used on the main surface.
export function mountProjectFrame(figure) {
  const canvas = document.createElement('canvas');
  canvas.className = 'cover-frame';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.corners = 'top-right bottom-left';
  figure.append(canvas);
  const stitches = new ProjectStitches(canvas);
  let previous;
  const layout = (width, height, pitch) => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const key = `${width}:${height}:${pitch}:${dpr}`;
    if (previous === key) return;
    previous = key;
    const gap = projectFrameGap(pitch), margin = gap + pitch;
    const canvasWidth = width + margin * 2, canvasHeight = height + margin * 2;
    Object.assign(canvas.style, { left: `${-margin}px`, top: `${-margin}px`, width: `${canvasWidth}px`, height: `${canvasHeight}px` });
    canvas.width = Math.ceil(canvasWidth * dpr);
    canvas.height = Math.ceil(canvasHeight * dpr);
    const scale = pitch / GRID;
    const origins = [
      { turns: 1, x: margin + width + gap - CORNER_SIZE * pitch, y: margin - gap },
      { turns: 3, x: margin - gap, y: margin + height + gap - CORNER_SIZE * pitch },
    ];
    const cells = [], groups = [];
    for (const origin of origins) {
      const group = [];
      CORNER_ROWS.forEach((row, y) => [...row].forEach((cell, x) => {
        if (cell !== '#') return;
        let col = x, line = y;
        for (let turn = 0; turn < origin.turns; turn++) [col, line] = [CORNER_SIZE - 1 - line, col];
        const variation = Math.floor(hash(col, line) * 8);
        const key = `${origin.turns}:${x},${y}`;
        cells.push({ key, variation, x: origin.x + col * pitch, y: origin.y + line * pitch });
        group.push({ key, distance: x + y, col: x });
      }));
      groups.push(group.sort((a, b) => a.distance - b.distance || a.col - b.col).map(cell => cell.key));
    }
    stitches.layout(cells, groups, dpr, scale);
  };
  layout.reveal = () => stitches.reveal();
  layout.unpick = () => stitches.unpick();
  return layout;
}

