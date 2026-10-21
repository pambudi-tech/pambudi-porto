import { edgeGapStitches } from './model.mjs';

export const WORDMARK_RATIO = 1038 / 4096;
// Crops from the supplied artwork, split in the empty gap between M and B.
export const WORDMARK_LINES = [
  { label: 'PAM', x: 0, y: 12, width: 2004, height: 1026 },
  { label: 'BUDI', x: 2040, y: 0, width: 2056, height: 894 },
];

export function coverageTable(rgba, width, height) {
  const stride = width + 1;
  const table = new Float32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      row += rgba[p + 3] / 255 * (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 765;
      table[(y + 1) * stride + x + 1] = table[y * stride + x + 1] + row;
    }
  }
  return table;
}

export function traceWordmark(table, sourceWidth, sourceHeight, width, view, pitch, options = {}) {
  const gap = edgeGapStitches(width);
  const left = Math.ceil(-view.x / pitch) + gap;
  const right = Math.floor((width - view.x) / pitch) - gap;
  const artLeft = view.x + left * pitch;
  const artWidth = (right - left) * pitch;
  let height = artWidth * (options.aspectRatio ?? WORDMARK_RATIO);
  if (options.startRow !== undefined) height = Math.max(1, Math.round(height / pitch)) * pitch;
  const top = options.startRow ?? Math.floor(-view.y / pitch);
  const originY = options.startRow === undefined ? 0 : view.y + top * pitch;
  const bottom = options.startRow === undefined ? Math.ceil((height - view.y) / pitch) : top + Math.round(height / pitch);
  const cells = [];
  const stride = sourceWidth + 1;
  for (let row = top; row < bottom; row++) {
    const y0 = Math.max(0, Math.floor((view.y + row * pitch - originY) / height * sourceHeight));
    const y1 = Math.min(sourceHeight, Math.ceil((view.y + (row + 1) * pitch - originY) / height * sourceHeight));
    for (let col = left; col < right; col++) {
      const x0 = Math.max(0, Math.floor((view.x + col * pitch - artLeft) / artWidth * sourceWidth));
      const x1 = Math.min(sourceWidth, Math.ceil((view.x + (col + 1) * pitch - artLeft) / artWidth * sourceWidth));
      const area = (x1 - x0) * (y1 - y0);
      if (area <= 0) continue;
      const ink = table[y1 * stride + x1] - table[y0 * stride + x1] - table[y1 * stride + x0] + table[y0 * stride + x0];
      if (ink / area >= .3) cells.push([col, row]);
    }
  }
  return { cells, height, topRow: top, bottomRow: bottom };
}

export function traceStackedWordmark(lines, width, view, pitch) {
  const cells = [], rows = [];
  let startRow = Math.ceil(-view.y / pitch);
  for (const line of lines) {
    const traced = traceWordmark(line.table, line.width, line.height, width, view, pitch, {
      aspectRatio: line.aspectRatio,
      startRow,
    });
    cells.push(...traced.cells);
    rows.push({ label: line.label, top: traced.topRow, bottom: traced.bottomRow });
    startRow = traced.bottomRow + 1;
  }
  return { cells, rows, height: view.y + (startRow - 1) * pitch };
}
