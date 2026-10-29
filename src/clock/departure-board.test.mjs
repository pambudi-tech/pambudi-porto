import test from 'node:test';
import assert from 'node:assert/strict';
import { DepartureBoard, DEPARTURE_MOTION } from './departure-board.mjs';
import { clockTextLayout, clockGlyphCells, DotClock } from './clock.mjs';
import { GRID } from '../stitch/model.mjs';
import { cornerPitch } from '../stitch/corners.mjs';

const stage = (width = 1280, height = 900) => ({ width, height,
  view: { x: width / 2, y: (height - 80) / 2, scale: cornerPitch(width) / GRID } });
const layout = (text, viewport = stage()) => clockTextLayout(text, viewport).glyphs;
const ink = slots => clockGlyphCells(slots);

test('departure letters cycle in stable slots and settle from left to right', () => {
  const board = new DepartureBoard();
  const time = layout('12:34:56'), message = layout('FROM RIVER TO THE SEA');
  board.finish(time);
  board.transitionTo(message, 100);
  assert.deepEqual(ink(board.sample(100)), ink(time));
  const start = 100 + board.leaveDuration;
  const rolling = board.sample(start + 90);
  assert.ok(rolling.length > 0);
  assert.ok(rolling.length < message.filter(slot => slot.char !== ' ').length);
  assert.ok(rolling.some((slot, index) => slot.char !== message.filter(slot => slot.char !== ' ')[index].char));
  const staggered = board.sample(start + DEPARTURE_MOTION.roll + 1);
  assert.equal(staggered[0].char, 'F');
  assert.equal(board.active, true, 'later columns are still cycling after the first one locks');
  assert.deepEqual(board.sample(850), message);
  assert.equal(board.active, false);
});

test('interruptions start at the displayed frame and only the newest message completes', () => {
  const board = new DepartureBoard();
  const time = layout('12:34:56'), red = layout('FROM RIVER TO THE SEA'), green = layout('PALESTINE WILL BE FREE');
  board.finish(time);
  board.transitionTo(red, 0);
  const before = ink(board.sample(220));
  board.transitionTo(green, 220);
  assert.deepEqual(ink(board.sample(220)), before);
  assert.deepEqual(board.sample(1000), green);
  board.transitionTo(time, 1010);
  const returning = ink(board.sample(1190));
  board.transitionTo(red, 1190);
  assert.deepEqual(ink(board.sample(1190)), returning);
  assert.deepEqual(board.sample(2000), red);
});

test('a seconds tick during return preserves timing and resolves to the latest time', () => {
  const board = new DepartureBoard();
  board.finish(layout('PALESTINE WILL BE FREE'));
  board.transitionTo(layout('12:34:56'), 100);
  board.sample(300);
  const latest = layout('12:34:57');
  board.refreshTarget(latest);
  assert.equal(board.started, 100);
  assert.deepEqual(board.sample(800), latest);
  assert.equal(board.active, false);
});

test('every intermediate glyph stays within the screen and on integer cloth holes', () => {
  for (const [width, height] of [[320, 568], [390, 844], [720, 800], [1280, 900]]) {
    const viewport = stage(width, height), pitch = GRID * viewport.view.scale;
    const board = new DepartureBoard();
    board.finish(layout('12:34:56', viewport));
    let started = 0;
    for (const text of ['FROM RIVER TO THE SEA', 'PALESTINE WILL BE FREE', '12:34:57']) {
      board.transitionTo(layout(text, viewport), started);
      for (let elapsed = 0; elapsed <= 750; elapsed += 16) {
        for (const [col, row] of ink(board.sample(started + elapsed))) {
          assert.ok(Number.isInteger(col) && Number.isInteger(row));
          const x = viewport.view.x + col * pitch, y = viewport.view.y + row * pitch;
          assert.ok(x >= 0 && x < width && y >= 0 && y < height);
        }
      }
      started += 1000;
    }
  }
});

test('reduced motion completes immediately and settling cancels a pending animation', () => {
  const board = new DepartureBoard();
  const time = layout('12:34:56'), red = layout('FROM RIVER TO THE SEA');
  board.finish(time);
  board.transitionTo(red, 0, true);
  assert.equal(board.active, false);
  assert.deepEqual(board.sample(0), red);
  board.transitionTo(time, 100);
  board.sample(200);
  board.finish();
  assert.equal(board.active, false);
  assert.deepEqual(board.sample(200), time);
});

test('the clock honors reduced motion when a hover message is requested', () => {
  const clock = Object.create(DotClock.prototype);
  const target = layout('FROM RIVER TO THE SEA');
  clock.element = { setAttribute() {} };
  clock.view = {};
  clock.board = new DepartureBoard();
  clock.motionPreference = { matches: true };
  clock.layout = () => ({ glyphs: target });
  clock.paint = () => {};
  clock.setMessage('FROM RIVER TO THE SEA');
  assert.equal(clock.board.active, false);
  assert.deepEqual(clock.board.current, target);
});
