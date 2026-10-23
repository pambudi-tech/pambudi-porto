import { GRID } from './model.mjs';

export const MATRIX_COLOR = '#49483f';
export const ORNAMENT_COLOR = '#060606';

// Active perforations share their size; callers can override the thread color.
export function drawActiveDots(context, cells, view, progressForCell = null, color = MATRIX_COLOR) {
  const pitch = GRID * view.scale;
  const radius = pitch * .24;
  context.fillStyle = color;
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
