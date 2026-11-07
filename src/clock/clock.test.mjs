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

test('without the welcome, the clock dots fade in each at its own random moment', async () => {
  const { dotFade, CLOCK_DOTS_IN } = await import('./clock.mjs');
  const cells = [];
  for (let col = 0; col < 12; col++) for (let row = 0; row < 5; row++) cells.push([col, row]);
  const at = (elapsed, seed = 3) => cells.map(([col, row]) => dotFade(col, row, elapsed, seed));
  assert.ok(at(0).every(alpha => alpha === 0));
  const middle = at(CLOCK_DOTS_IN.delay + CLOCK_DOTS_IN.spread / 2);
  assert.ok(middle.some(alpha => alpha > .5) && middle.some(alpha => alpha === 0), 'some dots in, others still waiting');
  assert.deepEqual(at(CLOCK_DOTS_IN.delay + CLOCK_DOTS_IN.spread / 2), middle, 'a dot keeps its moment between frames');
  assert.notDeepEqual(at(CLOCK_DOTS_IN.delay + CLOCK_DOTS_IN.spread / 2, 9), middle, 'another entrance, another pattern');
  assert.ok(at(CLOCK_DOTS_IN.delay + CLOCK_DOTS_IN.spread + CLOCK_DOTS_IN.dot).every(alpha => alpha === 1));
  const { ENTRANCE } = await import('../stitch/stitch-entrance.mjs');
  assert.equal(CLOCK_DOTS_IN.delay + CLOCK_DOTS_IN.spread + CLOCK_DOTS_IN.dot, ENTRANCE.delay + ENTRANCE.corners + ENTRANCE.stitch, 'in time with the corners');
});

test('the band edges fall on whole pixels at every ratio, or there is no band', async () => {
  const { wholePixelEdge } = await import('./clock.mjs');
  assert.equal(wholePixelEdge(745.3, -1, [2, 2]), 745);
  assert.equal(wholePixelEdge(745.3, 1, [2, 2]), 746);
  assert.equal(wholePixelEdge(745.3, -1, [1.25, 1.25]), 744);
  assert.equal(wholePixelEdge(745.3, 1, [1.5, 1.5]), 746);
  assert.equal(wholePixelEdge(745.3, 1, [1.1, 1.1]), null, 'a ratio that never lands whole');
});

test('the clock canvas covers just its rows, and every dot it draws, on whole pixels', async () => {
  const { clockBand } = await import('./clock.mjs');
  const rowsOf = glyphs => ({ top: Math.min(...glyphs.map(slot => slot.row)), bottom: Math.max(...glyphs.map(slot => slot.row + 4)) });
  for (const [width, height] of [[320, 568], [390, 844], [1440, 900], [2560, 1440]]) {
    for (const ratio of [1, 1.25, 1.5, 2]) {
      for (const safeBottom of [0, 34]) {
        const view = { x: Math.round(width / 2), y: Math.round((height - 80) / 2), scale: cornerPitch(width) / GRID };
        const pitch = GRID * view.scale;
        for (const text of ['12:34:56', '100%', 'FROM RIVER TO THE SEA', 'BCA PRIORITAS AND OCEAN BY BCA AND MANDALIKA GP AND RUNRISE']) {
          const { glyphs, cells } = clockTextLayout(text, { width, height, view, safeBottom });
          const band = clockBand(rowsOf(glyphs), { view, width, height, dpr: ratio, ratio });
          const label = `${width}x${height}@${ratio} ${text}`;
          if (!Number.isInteger(width * ratio) || !Number.isInteger(height * ratio)) { assert.equal(band, null, label); continue; }
          assert.ok(band, label);
          for (const edge of [band.top, band.bottom]) assert.ok(Number.isInteger(edge) && Number.isInteger(edge * ratio), label);
          assert.ok(band.top >= 0 && band.bottom <= height && band.bottom - band.top < height / 2, label);
          // Each dot, its edge softened by a pixel, lies inside, or past the screen as on the old canvas.
          for (const [, row] of cells) {
            const y = view.y + row * pitch, r = pitch * .24 + 1;
            assert.ok((y - r >= band.top || band.top === 0) && (y + r <= band.bottom || band.bottom === height), label);
          }
        }
      }
    }
  }
});

test('the canvas is not cut to a band where the browser would scale it', async () => {
  const { clockBand } = await import('./clock.mjs');
  const view = { x: 195, y: 382, scale: cornerPitch(390) / GRID };
  const rows = { top: 75, bottom: 79 };
  assert.ok(clockBand(rows, { view, width: 390, height: 844, dpr: 2, ratio: 2 }));
  assert.equal(clockBand(rows, { view, width: 390, height: 844, dpr: 2, ratio: 3 }), null, 'a 3x screen draws the 2x canvas scaled');
  assert.equal(clockBand(rows, { view, width: 391, height: 845, dpr: 1.5, ratio: 1.5 }), null, 'not a whole number of canvas pixels');
  assert.equal(clockBand({ top: Infinity, bottom: -Infinity }, { view, width: 390, height: 844, dpr: 2, ratio: 2 }), null);
});

// A clock with just its canvas, for where the canvas is placed.
function placedClock({ width = 390, height = 844, dpr = 2 } = {}) {
  const clock = Object.create(DotClock.prototype);
  clock.canvas = { style: {}, width: width * dpr, height: 0 };
  Object.assign(clock, { width, height, dpr, ratio: dpr, boxHeight: undefined, placed: null, painted: 0 });
  clock.view = { x: Math.round(width / 2), y: Math.round((height - 80) / 2), scale: cornerPitch(width) / GRID };
  const { glyphs } = clockTextLayout('12:34:56', { width, height, view: clock.view });
  clock.rows = { top: Infinity, bottom: -Infinity };
  clock.board = { sample: () => glyphs };
  clock.paints = 0;
  clock.paint = () => { clock.paints++; };
  return { clock, glyphs };
}

test('held, the clock draws on the whole screen, and goes back to its band once let go', () => {
  const { clock, glyphs } = placedClock();
  clock.place(glyphs);
  assert.notEqual(clock.placed, 'screen');
  const band = { top: clock.canvas.style.top, height: clock.canvas.height };
  clock.holdWhole(true);
  assert.equal(clock.placed, 'screen');
  assert.deepEqual([clock.canvas.style.top, clock.canvas.style.height, clock.canvas.height, clock.offset], ['', '', 844 * 2, 0]);
  assert.equal(clock.paints, 1, 'drawn again at once');
  clock.holdWhole(true);
  clock.place(glyphs);
  assert.equal(clock.paints, 1, 'held again: nothing to do');
  assert.equal(clock.placed, 'screen');
  clock.holdWhole(false);
  assert.deepEqual({ top: clock.canvas.style.top, height: clock.canvas.height }, band);
  assert.equal(clock.paints, 2);
});

test('a resize observes the box afresh and takes it to match until it is reported', () => {
  const { clock, glyphs } = placedClock();
  const calls = [];
  clock.element = {};
  clock.observer = { unobserve: () => calls.push('unobserve'), observe: () => calls.push('observe') };
  clock.layout = () => ({ glyphs });
  clock.board = { ...clock.board, finish() {} };
  // Reported at the old height: the window then grows.
  clock.boxHeight = 844;
  globalThis.devicePixelRatio = 2;
  try { clock.resize(390, 900, clock.view); } finally { delete globalThis.devicePixelRatio; }
  assert.deepEqual(calls, ['unobserve', 'observe']);
  assert.notEqual(clock.placed, 'screen', 'the band, not the whole screen first');
  // The report: the box is not the window's height after all.
  clock.boxHeight = 880;
  clock.refit();
  assert.equal(clock.placed, 'screen');
  assert.equal(clock.canvas.height, 900 * 2);
});
