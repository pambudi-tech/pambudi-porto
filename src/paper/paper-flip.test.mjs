import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPER_FLIP, paperFlipDirection, paperFlipPoseAt, paperFlipKeyframes, isPaperTap, PaperFlip } from './paper-flip.mjs';

test('the clicked half sets turn direction regardless of which face is visible', () => {
  const bounds = { left: 400, width: 400 };
  assert.equal(paperFlipDirection(450, bounds), -1);
  assert.equal(paperFlipDirection(750, bounds), 1);
  assert.equal(paperFlipDirection(600, bounds), 1);
  for (const from of [-360, -180, 0, 180, 360]) {
    for (const direction of [-1, 1]) {
      const to = from + direction * 180;
      assert.equal(paperFlipPoseAt(.5, from, to).angle, from + direction * 90);
      assert.deepEqual(paperFlipPoseAt(0, from, to), { angle: from, y: -0, z: 0, rx: -0 });
      const rest = paperFlipPoseAt(1, from, to);
      assert.equal(rest.angle, to);
      assert.ok(Math.abs(rest.y) < 1e-10 && Math.abs(rest.z) < 1e-10);
      assert.ok(Math.abs(paperFlipPoseAt(.01, from, to).angle - from) < .002);
      assert.ok(Math.abs(paperFlipPoseAt(.99, from, to).angle - to) < .002);
    }
  }
});

test('only short released taps activate a turn; drags, holds and cancelled pointers do not', () => {
  const start = { x: 100, y: 200, time: 0 };
  const release = { type: 'pointerup', clientX: 102, clientY: 202 };
  assert.ok(isPaperTap(start, release, 200));
  assert.equal(isPaperTap(start, release, PAPER_FLIP.tapMs + 1), false);
  assert.equal(isPaperTap({ ...start, dragged: true }, release, 200), false);
  assert.equal(isPaperTap(start, { ...release, clientX: 120 }, 200), false);
  assert.equal(isPaperTap(start, { ...release, type: 'pointercancel' }, 200), false);
  assert.equal(isPaperTap(null, release, 200), false);
});

test('reduced motion flips instantly in either direction and repeated active taps are ignored', () => {
  const flip = Object.create(PaperFlip.prototype);
  Object.assign(flip, { angle: 0, red: false, reduced: true, active: false,
    finish() { this.angle = this.to; this.red = this.destinationRed; },
  });
  assert.equal(flip.flip(-1), true);
  assert.equal(flip.angle, -180);
  assert.equal(flip.red, true);
  assert.equal(flip.flip(-1), true);
  assert.equal(flip.angle, -360);
  assert.equal(flip.red, false);
  assert.equal(flip.flip(1), true);
  assert.equal(flip.angle, -180);
  assert.equal(flip.red, true);
  flip.active = true;
  assert.equal(flip.flip(1), false);
  assert.equal(flip.angle, -180);
});

test('native keyframes preserve the existing choreography in both directions', () => {
  for (const direction of [-1, 1]) {
    const frames = paperFlipKeyframes(180, 180 + direction * 180);
    assert.equal(frames.length, 61);
    assert.equal(frames[0].offset, 0);
    assert.equal(frames.at(-1).offset, 1);
    assert.match(frames[0].transform, /rotateY\(180deg\)/);
    assert.ok(frames[30].transform.includes(`rotateY(${180 + direction * 90}deg)`));
    assert.ok(frames.at(-1).transform.includes(`rotateY(${180 + direction * 180}deg)`));
  }
});

test('the compositor owns the turn; completion restores interaction and releases its animation', async () => {
  const flip = Object.create(PaperFlip.prototype), events = [], callbacks = [];
  let complete, cancelled = 0, calls = 0;
  const animation = { finished: new Promise(resolve => { complete = resolve; }), cancel() { cancelled++; } };
  const face = () => ({ inert: false, setAttribute() {} });
  Object.assign(flip, { angle: 0, red: false, active: false, reduced: false,
    element: { dataset: {}, dispatchEvent(event) { events.push(event.type); } },
    front: face(), back: face(), control: { setAttribute() {} },
    turn: { style: {}, animate(frames, options) {
      calls++;
      assert.equal(frames.length, 61);
      assert.equal(options.duration, PAPER_FLIP.duration);
      return animation;
    } },
    onStart() { callbacks.push('suspend'); }, onFinish() { callbacks.push('resume'); },
  });
  assert.equal(flip.flip(-1), true);
  assert.equal(flip.active, true);
  assert.equal(flip.front.inert && flip.back.inert, true);
  assert.equal(flip.flip(1), false);
  assert.equal(calls, 1);
  assert.equal(flip.turn.style.transform, undefined, 'no per-frame style writer is needed');
  complete();
  await animation.finished;
  assert.equal(flip.active, false);
  assert.equal(flip.turn.style.transform, 'rotateY(-180deg)');
  assert.equal(flip.red, true);
  assert.equal(flip.front.inert, true);
  assert.equal(flip.back.inert, false);
  assert.equal(cancelled, 1);
  assert.deepEqual(events, ['paperflipstart', 'paperflipend']);
  assert.deepEqual(callbacks, ['suspend', 'resume']);
});

test('switching to reduced motion completes an in-flight turn only once', async () => {
  const flip = Object.create(PaperFlip.prototype);
  let complete, finishes = 0;
  const animation = { finished: new Promise(resolve => { complete = resolve; }), cancel() {} };
  Object.assign(flip, { angle: 0, red: false, active: false, reduced: false,
    element: { dataset: {}, dispatchEvent() {} },
    front: { setAttribute() {} }, back: { setAttribute() {} }, control: { setAttribute() {} },
    turn: { style: {}, animate: () => animation }, onFinish() { finishes++; },
  });
  flip.flip(1);
  flip.setReducedMotion(true);
  assert.equal(flip.active, false);
  assert.equal(flip.red, true);
  assert.equal(flip.turn.style.transform, 'rotateY(180deg)');
  complete();
  await animation.finished;
  assert.equal(finishes, 1);
});
