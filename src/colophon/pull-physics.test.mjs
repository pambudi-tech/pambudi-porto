import test from 'node:test';
import assert from 'node:assert/strict';
import { PULL, rubberBand, pullFor, opensAt, isPull, springStep, springSettled } from './pull-physics.mjs';

test('the page follows a short pull closely and resists a long one', () => {
  assert.equal(rubberBand(0, 800), 0);
  assert.equal(rubberBand(-40, 800), 0);
  assert.ok(rubberBand(20, 800) > 20 * .5);
  assert.ok(rubberBand(2000, 800) < 800);
  assert.ok(rubberBand(400, 800) > rubberBand(200, 800));
  assert.ok(rubberBand(400, 800) - rubberBand(200, 800) < rubberBand(200, 800));
});

test('a pull can be picked up from where the page is', () => {
  for (const pull of [10, 120, 600, 1800]) assert.ok(Math.abs(pullFor(rubberBand(pull, 800), 800) - pull) < 1e-6);
  assert.equal(pullFor(0, 800), 0);
});

test('only a deep pull opens the colophon, however fast it was let go', () => {
  assert.equal(opensAt(0, 800), false);
  assert.equal(opensAt(60, 800), false);
  assert.equal(opensAt(800 * PULL.openShare - 1, 800), false);
  assert.equal(opensAt(800 * PULL.openShare, 800), true);
  // On a phone that is most of the screen's height for the finger.
  assert.ok(pullFor(844 * PULL.openShare, 844) > 844 * .7);
});

test('a colophon shorter than the threshold opens near its own height', () => {
  assert.equal(opensAt(300, 1400, 340), true);
  assert.equal(opensAt(250, 1400, 340), false);
});

test('only a downward drag is a pull, and on the paper only a flick', () => {
  assert.equal(isPull(0, PULL.commit - 1, 50), false);
  assert.equal(isPull(0, 20, 400), true);
  assert.equal(isPull(30, 20, 50), false, 'mostly sideways');
  assert.equal(isPull(0, -30, 50), false, 'upward');
  assert.equal(isPull(0, 24, 400, { onPaper: true }), false, 'a slow drag tilts the paper');
  assert.equal(isPull(0, 24, 30, { onPaper: true }), true);
});

test('the spring settles on its target from either side without passing it', () => {
  for (const [from, to] of [[0, 400], [400, 0], [120, 0]]) {
    let state = { position: from, velocity: 0 };
    let passed = false;
    for (let i = 0; i < 120 && !springSettled(state.position, state.velocity, to); i++) {
      state = springStep(state.position, state.velocity, to, 16);
      if ((to - from) * (state.position - to) > .5) passed = true;
    }
    assert.ok(springSettled(state.position, state.velocity, to), `${from} → ${to} settles`);
    assert.equal(passed, false);
  }
});
