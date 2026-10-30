import { BIRD_COLUMNS } from './bird-data.mjs';

// The dove at rest, in the source chart's coordinates (rows 24–48 of the
// 46 × 66 grid, facing right): the approved head, a fluffed body leaning a
// little upright, the wing folded along its side with its tip over the tail,
// and a foot. Like the flying poses, it is sampled to the surface's stitch size.
const PERCH_TOP = 24;
const PERCH_ROWS = [
  '..................................########....',
  '.................................#########....',
  '................................###########...',
  '...............................####..#####....',
  '..............................##########......',
  '...........................##############.....',
  '.........................#################....',
  '.......................######....#########....',
  '.....................#####....############....',
  '...................####....###############....',
  '.................####...##################....',
  '...............####...####################....',
  '.............####...#####################.....',
  '...........####..########################.....',
  '.........####..#########################......',
  '........###..##########################.......',
  '.......#...###########################........',
  '.........###...######################.........',
  '.......##...########################..........',
  '.....##...#######################.............',
  '....##..######....############................',
  '..#########..................##...............',
  '.########....................##...............',
  '#######....................######.............',
  '.####.........................................',
];

export const PERCH_POSE = PERCH_ROWS.flatMap((row, y) => [...row].flatMap((cell, x) => cell === '#' ? [[x, PERCH_TOP + y]] : []));
// The foot's source columns; the tail tip hangs a little lower than the toes.
const FOOT = [27, 32];

// Where the toes rest in a perched pose sampled `columns` wide: the middle
// of the foot's lowest row.
export function toesOf(cells, columns) {
  const scale = columns / (BIRD_COLUMNS + 4);
  const from = Math.floor((FOOT[0] + 2) * scale), to = Math.ceil((FOOT[1] + 3) * scale) - 1;
  const foot = cells.filter(([x]) => x >= from && x <= to);
  const row = Math.max(...foot.map(([, y]) => y));
  const toes = foot.filter(([, y]) => y === row).map(([x]) => x);
  return { col: (Math.min(...toes) + Math.max(...toes)) / 2, row };
}
