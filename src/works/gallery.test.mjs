import test from 'node:test';
import assert from 'node:assert/strict';
import { ownShapeWidth, tagCounts, wrapLines, cardMove, sheetColumns, sheetEntrance, WorksGallery } from './gallery.mjs';
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

test('a chosen project lets go of the glitch\'s readied photos, and they are readied again once its card is home', () => {
  const gallery = Object.create(WorksGallery.prototype);
  const closed = [];
  const readied = [];
  gallery.readyGlitch = after => readied.push(after);
  gallery.glitchReady = new Map([['a', { pixels: { close: () => closed.push('a') } }], ['b', { pixels: { close: () => closed.push('b') } }]]);
  gallery.departing = true;
  assert.equal(gallery.departing, true);
  assert.deepEqual(closed, ['a', 'b']);
  assert.equal(gallery.glitchReady, null);
  assert.deepEqual(readied, []);
  gallery.departing = false;
  assert.equal(gallery.departing, false);
  assert.deepEqual(readied, [700]);
});

test('the sheet comes in line by line from the top, quickly; the rolled edges after the last card in view', () => {
  const lines = [0, 1, 2, 3, 4, 5].map(row => ({ y: 100 + row * 300, entries: [`${row}a`, `${row}b`, `${row}c`] }));
  const { delays, last } = sheetEntrance(lines, 700, { line: 60, across: 25, latest: 260 });
  // The top line first, left to right; each line after the one above.
  assert.deepEqual(['0a', '0b', '0c', '1a'].map(card => delays.get(card)), [0, 25, 50, 60]);
  // Nothing waits longer than `latest`, however long the sheet.
  assert.equal(Math.max(...delays.values()), 260);
  // Lines at 100, 400 in view: the last of them starts at 60 + 50.
  assert.equal(last, 110);
});
