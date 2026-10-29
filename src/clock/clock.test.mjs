import test from 'node:test';
import assert from 'node:assert/strict';
import { DotClock, clockTextLayout } from './clock.mjs';
import { GRID } from '../stitch/model.mjs';
import { cornerPitch } from '../stitch/corners.mjs';
import { BirdFlight } from '../bird/bird.mjs';
import { BIRD_COLOR } from '../bird/bird-data.mjs';
import { DepartureBoard } from './departure-board.mjs';
import { drawActiveDots } from '../stitch/dot-matrix.mjs';

test('dove hover follows visible stitched cells and selects the phrase from their side of the paper', () => {
  const bird = Object.create(BirdFlight.prototype);
  bird.view = { x: 160, y: 100 };
  bird.pitch = 8;
  bird.stage = { width: 320 };
  bird.cells = new Map([
    ['-10,3', { col: -10, row: 3, color: BIRD_COLOR, progress: 1 }],
    ['20,3', { col: 20, row: 3, color: BIRD_COLOR, progress: 1 }],
    ['-9,3', { col: -9, row: 3, color: BIRD_COLOR, progress: .1 }],
  ]);
  assert.equal(bird.hoverMessage(84, 128), 'FROM RIVER TO THE SEA');
  assert.equal(bird.hoverMessage(324, 128), 'PALESTINE WILL BE FREE');
  assert.equal(bird.hoverMessage(92, 128), '', 'barely revealed stitches do not create a hover target');
  assert.equal(bird.hoverMessage(150, 128), '', 'open space inside the bird bounds remains open');
  bird.cells.delete('-10,3');
  assert.equal(bird.hoverMessage(84, 128), '', 'a stationary pointer loses hover when the bird moves away');
});

test('both phrases stay complete, centered, and on the cloth lattice across screen sizes', () => {
  for (const [width, height] of [[320, 568], [390, 844], [720, 800], [1280, 900]]) {
    const view = { x: width / 2, y: (height - 80) / 2, scale: cornerPitch(width) / GRID };
    const pitch = GRID * view.scale;
    for (const message of ['FROM RIVER TO THE SEA', 'PALESTINE WILL BE FREE']) {
      const { lines, cells } = clockTextLayout(message, { width, height, view });
      assert.equal(lines.join(' '), message);
      assert.ok(cells.length > 100);
      assert.ok(cells.every(([col, row]) => Number.isInteger(col) && Number.isInteger(row)));
      const xs = cells.map(([col]) => view.x + col * pitch);
      const ys = cells.map(([, row]) => view.y + row * pitch);
      assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) < width);
      assert.ok(Math.min(...ys) >= 0 && Math.max(...ys) < height);
      assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - width / 2) <= pitch);
    }
  }
});

test('hover messages survive clock ticks and leaving restores the latest time', t => {
  t.mock.method(globalThis, 'setTimeout', () => 0);
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  const clock = Object.create(DotClock.prototype);
  const labels = [];
  clock.element = { setAttribute: (_, value) => labels.push(value) };
  clock.formatter = { format: () => '12:34:56' };
  let paints = 0;
  clock.paint = () => { paints++; };
  clock.setMessage('FROM RIVER TO THE SEA');
  clock.setMessage('FROM RIVER TO THE SEA');
  assert.equal(paints, 1, 'unchanged hover does not redraw every frame');
  clock.tick();
  assert.equal(labels.at(-1), 'FROM RIVER TO THE SEA');
  clock.setMessage('PALESTINE WILL BE FREE');
  assert.equal(labels.at(-1), 'PALESTINE WILL BE FREE');
  clock.setMessage('');
  assert.equal(labels.at(-1), 'Local time 12:34:56');
  assert.equal(clock.time, '12:34:56');
});

test('loading percentages never scramble or go backwards, then roll into the live clock', t => {
  t.mock.method(globalThis, 'setTimeout', () => 0);
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  const clock = Object.create(DotClock.prototype);
  const labels = [];
  clock.element = { dataset: {}, setAttribute: (_, value) => labels.push(value) };
  clock.formatter = { format: () => '12:34:56' };
  clock.motionPreference = { matches: false };
  clock.board = new DepartureBoard();
  clock.view = { x: 640, y: 410, scale: 1 };
  clock.layout = () => clockTextLayout(clock.loading === undefined ? clock.time : `${clock.loading}%`, {
    width: 1280, height: 900, view: clock.view,
  });
  clock.paint = () => {};
  for (const [requested, displayed] of [[0, '0%'], [13, '13%'], [42, '42%'], [41, '42%'], [100, '100%']]) {
    clock.setLoading(requested);
    assert.equal(clock.board.current.map(slot => slot.char).join(''), displayed);
    assert.equal(clock.board.active, false, 'loading does not scramble the displayed percentage');
  }
  clock.tick();
  assert.equal(labels.at(-1), 'Loading 100%');
  assert.equal(clock.board.current.map(slot => slot.char).join(''), '100%');
  clock.finishLoading();
  assert.equal(clock.element.dataset.mode, 'clock');
  assert.equal(labels.at(-1), 'Local time 12:34:56');
  assert.equal(clock.board.from.map(slot => slot.char).join(''), '100%');
  assert.equal(clock.board.target.map(slot => slot.char).join(''), '12:34:56');
  assert.equal(clock.board.active, true);
});

test('the dot matrix draws without throwing when the page loads at zero width', () => {
  const calls = [];
  const context = { beginPath() {}, fill() {}, moveTo() {}, arc: (...args) => { if (args[2] < 0) throw new RangeError('negative radius'); calls.push(args); } };
  for (const scale of [cornerPitch(0) / GRID, -.01]) {
    assert.doesNotThrow(() => drawActiveDots(context, [[0, 0], [1, 2]], { x: 0, y: 0, scale }));
  }
  assert.ok(calls.length > 0);
});
