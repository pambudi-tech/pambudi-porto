import test from 'node:test';
import assert from 'node:assert/strict';
import { ownShapeWidth, tagCounts, wrapLines, cardMove, sheetColumns } from './gallery.mjs';
import { EXPLORATION } from '../content/works.mjs';

test('a card that keeps its photo\'s shape: the window takes its aspect at the shared height, in whole perforations', () => {
  // A 4:3 piece matches a works card: a 300 px window inside a 12 px margin.
  assert.equal(ownShapeWidth(4 / 3, 249, 12, 6), 324);
  // A 4:5 poster is narrower, a 5:4 one a little less wide.
  assert.equal(ownShapeWidth(4 / 5, 249, 12, 6), 204);
  assert.equal(ownShapeWidth(5 / 4, 249, 12, 6), 306);
  for (const aspect of [.8, 1, 4 / 3, 1.31]) assert.equal(ownShapeWidth(aspect, 249, 12, 6) % 6, 0);
});

test('exploration filters list each tag once, most used first, then by name', () => {
  const counts = tagCounts([{ tags: ['poster', 'lettering'] }, { tags: ['poster'] }, { tags: ['app design'] }]);
  assert.deepEqual(counts, [['poster', 2], ['app design', 1], ['lettering', 1]]);
  const all = tagCounts(EXPLORATION);
  assert.equal(all.reduce((sum, [, count]) => sum + count, 0), EXPLORATION.flatMap(work => work.tags).length);
});

test('the sheet wraps cards into lines no wider than the room, in order', () => {
  assert.deepEqual(wrapLines([100, 100, 100, 100, 100], 300, 10), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(wrapLines([100, 100, 100], 320, 10), [[0, 1, 2]]);
  // A card wider than the room still gets a line of its own.
  assert.deepEqual(wrapLines([500, 100], 320, 10), [[0], [1]]);
});

test('a card glides only a short way; far or from out of sight, it settles in place', () => {
  const screen = { width: 1440, height: 900 };
  const rect = (left, top, width = 300, height = 225) => ({ left, top, width, height, right: left + width, bottom: top + height });
  assert.equal(cardMove(rect(100, 100), rect(220, 160), screen), 'glide');
  assert.equal(cardMove(rect(100, 100), rect(1000, 600), screen), 'settle');
  assert.equal(cardMove(rect(2400, 100), rect(300, 300), screen), 'settle');
  assert.equal(cardMove(null, rect(300, 300), screen), 'settle');
  assert.equal(cardMove(rect(100, 100), rect(100, 1400), screen), 'none');
});

test('the sheet takes four columns only while each stays at least 280 px wide', () => {
  const room = width => width - 2 * Math.max(48, width * .06);
  assert.equal(sheetColumns(room(1920), 28), 4);
  assert.equal(sheetColumns(room(1440), 28), 4);
  assert.equal(sheetColumns(room(1366), 28), 3);
  assert.equal(sheetColumns(room(1280), 28), 3);
  assert.equal(sheetColumns(room(1024), 28, { most: 4, fewest: 2, narrowest: 280, step: 18 }), 2);
  assert.equal(sheetColumns(room(900), 28), 2);
  for (const width of [900, 1024, 1280, 1366, 1440, 1920]) {
    const count = sheetColumns(room(width), 28);
    assert.ok((room(width) - 28 * (count - 1)) / count >= 280 || count === 2, `${width}`);
  }
});
