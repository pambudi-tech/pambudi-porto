import test from 'node:test';
import assert from 'node:assert/strict';
import { PULL, rubberBand, pullFor, opensAt, isPull, springStep, springSettled, dipDepth, dipSpread, dipAt, dipFade, dipPath } from './pull-physics.mjs';

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

test('the red dips deeper the further the page is pulled, within a limit', () => {
  assert.equal(dipDepth(0, 800), 0);
  assert.equal(dipDepth(100, 800), 100 * PULL.dip);
  assert.ok(dipDepth(200, 800) > dipDepth(100, 800));
  assert.equal(dipDepth(5000, 800), 800 * PULL.dipMax);
});

test('the dip is deepest under the finger and fades to flat either side', () => {
  const spread = dipSpread(390);
  assert.equal(dipAt(250, 80, 250, spread), 80);
  assert.ok(dipAt(200, 80, 250, spread) < 80);
  assert.ok(Math.abs(dipAt(200, 80, 250, spread) - dipAt(300, 80, 250, spread)) < 1e-9, 'even either side');
  assert.ok(dipAt(0, 80, 389, spread) < 1, 'flat far from the finger');
  assert.equal(dipSpread(100), PULL.dipSpreadMin);
  assert.equal(dipSpread(5000), PULL.dipSpreadMax);
});

test('let go, the dip eases out flat at once, never past flat or back', () => {
  let depth = 66, frames = 0;
  const seen = [depth];
  while (depth > 0 && frames++ < 100) seen.push(depth = dipFade(depth, 16));
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] < seen[i - 1] || seen[i] === 0, 'smaller every frame');
  assert.ok(seen.every(value => value >= 0), 'never past flat');
  assert.ok(seen[1] < 66 / 2, 'more than half gone in one frame');
  assert.ok(seen.findIndex(value => value < 1) * 16 <= 64, 'under a px within four frames');
  assert.equal(depth, 0, 'ends exactly flat');
  assert.equal(dipFade(66, 200), dipFade(66, 64), 'a long frame counts as at most 64 ms');
  assert.equal(dipFade(-5, 16), 0);
});

test('the edge path spans the screen and draws flat when the dip passes above it', () => {
  const path = dipPath(390, 80, 200, 109);
  assert.match(path, /^M0,-10L0,/);
  assert.match(path, /L390,-10Z$/);
  assert.ok(path.includes('L198,') || path.includes('L204,'));
  const flat = dipPath(390, -20, 200, 109);
  for (const [, y] of flat.matchAll(/L\d+,(-?[\d.]+)/g)) assert.ok(Number(y) === 0 || Number(y) === -10);
});
