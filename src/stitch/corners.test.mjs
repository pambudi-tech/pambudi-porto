import test from 'node:test';
import assert from 'node:assert/strict';
import { CORNER_ROWS, CORNER_SIZE, cornerPattern, cornerPitch, cornerPositions, toVisibleCell, toStoredCell } from './corners.mjs';
import { GRID, StitchModel } from './model.mjs';
import { seedMobileUpperCorners, cornerCellVisible } from './corners.mjs';

test('the supplied motif has one stitch per black square and four inward-facing rotations', () => {
  assert.equal(CORNER_ROWS.length, CORNER_SIZE);
  assert.ok(CORNER_ROWS.every(row => row.length === CORNER_SIZE));
  const { entries } = cornerPattern();
  const stitches = new Map(entries);
  assert.equal(stitches.size, 171 * 4);
  for (const key of ['-1000,0', '-1070,0', '-1170,30', '-1300,30']) assert.ok(stitches.has(key));
});

test('four corners stay on the cloth and do not overlap at desktop and mobile sizes', () => {
  for (const [width, height] of [[1440,900], [1280,720], [800,600], [390,844], [320,568]]) {
    const pitch = cornerPitch(width);
    const view = { x: width / 2, y: height / 2, scale: pitch / GRID };
    const positions = cornerPositions(width,height,view,GRID);
    const occupied = new Set();
    for (const [key] of cornerPattern().entries) {
      const [x,y] = key.split(',').map(Number);
      const visible = toVisibleCell(x,y,positions);
      assert.deepEqual(toStoredCell(...visible,positions), [x,y]);
      assert.ok(visible[0] * pitch + view.x >= 0);
      assert.ok((visible[0] + 1) * pitch + view.x <= width);
      assert.ok(visible[1] * pitch + view.y >= 0);
      assert.ok((visible[1] + 1) * pitch + view.y <= height);
      assert.ok(!occupied.has(visible.join(',')));
      occupied.add(visible.join(','));
    }
  }
});

test('unpicked corner stitches stay unpicked through resizing and can be undone', () => {
  const initial = cornerPattern();
  const model = new StitchModel(initial.entries, initial.layout);
  model.put(-1000,0,undefined); model.commit();
  assert.equal(model.stitches.has('-1000,0'),false);
  assert.equal(model.layout.mode,'corners');
  const view = { x: 195, y: 422, scale: cornerPitch(390) / GRID };
  const positions = cornerPositions(390,844,view,GRID);
  const visible = toVisibleCell(-1000,0,positions);
  assert.equal(model.stitches.has(toStoredCell(...visible,positions).join(',')),false);
  model.undo();
  assert.ok(model.stitches.has('-1000,0'));
});

test('bottom ornaments share the wordmark margins and retain edits at each breakpoint', () => {
  for (const [width, height] of [[320,568], [390,844], [540,900], [541,900], [1280,720], [1665,978]]) {
    const pitch = cornerPitch(width), gap = width <= 540 ? 1 : 3;
    const view = { x: Math.round(width / 2), y: Math.round(height / 2), scale: pitch / GRID };
    const [,, right, left] = cornerPositions(width, height, view, GRID);
    const gaps = [
      view.x + left.col * pitch,
      width - (view.x + (right.col + CORNER_SIZE) * pitch),
      height - (view.y + (left.row + CORNER_SIZE) * pitch),
    ];
    for (const pixels of gaps) {
      assert.ok(pixels >= gap * pitch - 1e-9);
      assert.ok(pixels < (gap + 1) * pitch + 1e-9);
    }
    const stored = [left.slot + 7, 12];
    assert.deepEqual(toStoredCell(...toVisibleCell(...stored, [right, left]), [right, left]), stored);
  }
});

test('only the lower pair is visible at every breakpoint while stored upper edits are retained', () => {
  const initial = cornerPattern().entries;
  const entries = seedMobileUpperCorners(initial);
  assert.equal(entries.length, 684);
  for (const [width, expected] of [[390, 342], [540, 342], [541, 342], [1280, 342]]) {
    assert.equal(entries.filter(([key]) => cornerCellVisible(...key.split(',').map(Number), width)).length, expected);
  }
  const edited = entries.filter(([key]) => key !== '-1000,0');
  assert.deepEqual(seedMobileUpperCorners(edited, true), edited, 'saved unpicking is retained');
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length);
});

test('a collapsed, zero-width page still has a positive stitch pitch', () => {
  for (const width of [0, 1, 47, 48, 100]) assert.ok(cornerPitch(width) > 0, `width ${width}`);
});
