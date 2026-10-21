import { GRID } from './model.mjs';

// Active perforations share their size and color across the clock and wordmark.
export function drawActiveDots(context, cells, view, progressForCell = null) {
  const pitch = GRID * view.scale;
  const radius = pitch * .24;
  context.fillStyle = '#49483f';
  context.beginPath();
  for (const [col, row] of cells) {
    const progress = progressForCell?.(col, row) ?? 1;
    if (progress <= 0) continue;
    const activeRadius = radius * (1 - Math.pow(1 - progress, 3));
    const x = view.x + col * pitch, y = view.y + row * pitch;
    context.moveTo(x + activeRadius, y);
    context.arc(x, y, activeRadius, 0, Math.PI * 2);
  }
  context.fill();
}
