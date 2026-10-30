import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENING, ringCells, ringProgress } from './opening-cue.mjs';

test('the ring goes once around the stamp, one stitch clear of it, with no cell twice', () => {
  const pitch = 10, cells = ringCells(40, 20, pitch);
  const keys = cells.map(({ x, y }) => `${x},${y}`);
  assert.equal(new Set(keys).size, keys.length);
  // 4 × 2 stitches inside, so the ring is 8 × 6 cells around: 24 of them.
  assert.equal(cells.length, 24);
  for (const { x, y } of cells) {
    assert.ok(x === -20 || x === 50 || y === -20 || y === 30, `${x},${y} sits on the ring`);
  }
  assert.deepEqual([cells[0].x, cells[0].y], [-20, -20], 'it starts at the top left');
});

test('a stitch sews in on the first pass and pulls out in the same order on the second', () => {
  const pass = OPENING.sweep + OPENING.stitch, count = 24;
  assert.equal(ringProgress(0, count, 0), 0);
  assert.equal(ringProgress(0, count, OPENING.stitch), 1);
  assert.equal(ringProgress(count - 1, count, OPENING.sweep), 0, 'the last waits its turn');
  assert.equal(ringProgress(count - 1, count, pass), 1);
  assert.equal(ringProgress(0, count, pass + OPENING.stitch), 0, 'the first is first out');
  assert.equal(ringProgress(count - 1, count, pass + OPENING.stitch), 1, 'while the last is still in');
  assert.equal(ringProgress(5, count, 123), ringProgress(5, count, 123 + pass * 2), 'and it loops');
});
