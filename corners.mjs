import { surfaceSpacing, edgeGapStitches } from './model.mjs';

// Traced square-for-square from the supplied 31 × 31 pixel ornament.
export const CORNER_ROWS = [
  '#....###.........#.............',
  '.##.#...#.......###.########...',
  '.##.#.#.#....##.###.........##.',
  '....#..#....####.#.###........#',
  '.####.....#.##.########.......#',
  '#....#...#...#..###..##....#..#',
  '#.#...###........#...#....#...#',
  '#..#..###.......#.........#..#.',
  '.##...####.....#...........##..',
  '.....#..#.#####................',
  '....#....#.....................',
  '.........#.##..................',
  '...##....#.##..................',
  '..####...#...#.................',
  '..##.....#.....................',
  '...##...#......................',
  '.##.##.#.......................',
  '#######........................',
  '.##.##.........................',
  '...##..........................',
  '.#.##..........................',
  '.#.####........................',
  '.#..##.........................',
  '.#.............................',
  '.#.............................',
  '.#.............................',
  '.#....##.......................',
  '.#...#..#......................',
  '..#.....#......................',
  '..#....#.......................',
  '...####........................',
];
export const CORNER_SIZE = 31;
const SLOTS = [-1000, -1100, -1200, -1300];
export const CORNER_LAYOUT = { columns: 31, rows: 31, size: 94, mode: 'corners' };

export function cornerPattern(color = '#ffffff') {
  const entries = [];
  for (let quarter = 0; quarter < 4; quarter++) {
    CORNER_ROWS.forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell !== '#') return;
      let col = x, line = y;
      for (let turn = 0; turn < quarter; turn++) [col, line] = [CORNER_SIZE - 1 - line, col];
      entries.push([`${SLOTS[quarter] + col},${line}`, color]);
    }));
  }
  return { entries, layout: { ...CORNER_LAYOUT } };
}

export function cornerPitch(width) {
  const pitch = width <= 540 ? Math.min(3.5, (width - 48) / 90) : Math.min(6.5, width * .165 / CORNER_SIZE);
  return pitch * surfaceSpacing(width);
}

export function cornerPositions(width, height, view, grid) {
  const step = grid * view.scale;
  const gap = edgeGapStitches(width);
  const left = Math.ceil(-view.x / step) + gap;
  const right = Math.floor((width - view.x) / step) - gap - CORNER_SIZE;
  const top = Math.ceil(-view.y / step) + gap;
  const bottom = Math.floor((height - view.y) / step) - gap - CORNER_SIZE;
  return [[left, top], [right, top], [right, bottom], [left, bottom]].map(([col, row], i) => ({ col, row, slot: SLOTS[i] }));
}

export function isUpperCornerCell(col, row) {
  return row >= 0 && row < CORNER_SIZE && SLOTS.slice(0, 2).some(slot => col >= slot && col < slot + CORNER_SIZE);
}

export const cornerCellVisible = (col, row) => !isUpperCornerCell(col, row);

export function withoutUpperCorners(entries) {
  return entries.filter(([key]) => {
    const [col, row] = key.split(',').map(Number);
    return !isUpperCornerCell(col, row);
  });
}

export function seedMobileUpperCorners(entries, initialized = false) {
  if (initialized) return entries;
  const upper = cornerPattern().entries.filter(([key]) => isUpperCornerCell(...key.split(',').map(Number)));
  return [...withoutUpperCorners(entries), ...upper];
}

export function cornerEntranceGroups(entries) {
  return SLOTS.map((slot, quarter) => entries
    .map(([key]) => {
      let [col, row] = key.split(',').map(Number);
      if (col < slot || col >= slot + CORNER_SIZE || row < 0 || row >= CORNER_SIZE) return null;
      col -= slot;
      // Return every rotated corner to the same outward-to-inward ordering.
      for (let turn = 0; turn < quarter; turn++) [col, row] = [row, CORNER_SIZE - 1 - col];
      return { key, distance: col + row, col };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance || a.col - b.col)
    .map(({ key }) => key));
}

// Corner edits retain local coordinates when the page changes size.
export function toStoredCell(col, row, positions) {
  const corner = positions.find(p => col >= p.col && col < p.col + CORNER_SIZE && row >= p.row && row < p.row + CORNER_SIZE);
  return corner ? [corner.slot + col - corner.col, row - corner.row] : [col, row];
}
export function toVisibleCell(col, row, positions) {
  const corner = positions.find(p => col >= p.slot && col < p.slot + CORNER_SIZE && row >= 0 && row < CORNER_SIZE);
  return corner ? [corner.col + col - corner.slot, corner.row + row] : [col, row];
}
