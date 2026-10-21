import test from 'node:test';
import assert from 'node:assert/strict';
import { flightAt, rebaseFlightTime, BirdFlight, StitchTransitions } from './bird.mjs';
import { BIRD_POSES, BIRD_COLUMNS, BIRD_ROWS } from './bird-data.mjs';

test('flapping poses are distinct, bounded stitch coordinates with no duplicated cells', () => {
  assert.ok(BIRD_POSES.length >= 4);
  assert.ok(new Set(BIRD_POSES.map(pose => JSON.stringify(pose))).size >= 4);
  for (const pose of BIRD_POSES) {
    assert.ok(pose.length > 50);
    assert.equal(new Set(pose.map(point => point.join(','))).size, pose.length);
    assert.ok(pose.every(([col, row]) => Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < BIRD_COLUMNS && row >= 0 && row < BIRD_ROWS));
  }
});

test('flight reverses direction beyond the screen edges without a position jump', () => {
  for (const [width, height, birdWidth, birdHeight] of [[1280,720,210,210], [390,844,130,130]]) {
    const stage = { width, height, birdWidth, birdHeight };
    const { legMs } = flightAt(0, stage);
    const rightBefore = flightAt(legMs * .76 - .01, stage);
    const rightAfter = flightAt(legMs * .76 + .01, stage);
    assert.equal(rightBefore.direction, 1);
    assert.equal(rightAfter.direction, -1);
    assert.ok(rightBefore.x > width && rightAfter.x > width);
    assert.ok(Math.abs(rightBefore.x - rightAfter.x) < 1);
    const leftBefore = flightAt(legMs * 1.76 - .01, stage);
    const leftAfter = flightAt(legMs * 1.76 + .01, stage);
    assert.equal(leftBefore.direction, -1);
    assert.equal(leftAfter.direction, 1);
    assert.ok(leftBefore.x + birdWidth < 1 && leftAfter.x + birdWidth < 1);
    assert.ok(Math.abs(leftBefore.x - leftAfter.x) < 1);
    for (let i = 0; i <= 100; i++) {
      const { y } = flightAt(legMs * 2 * i / 100, stage);
      assert.ok(y >= 0 && y + birdHeight <= height);
    }
  }
});

test('resizing preserves travel progress and direction', () => {
  const desktop = { width: 1280, height: 720, birdWidth: 210, birdHeight: 210 };
  const mobile = { width: 390, height: 844, birdWidth: 130, birdHeight: 130 };
  for (const time of [0, 5000, 12000, 17000, 30000, 60000]) {
    const before = flightAt(time, desktop);
    const after = flightAt(rebaseFlightTime(time, desktop, mobile), mobile);
    assert.equal(before.direction, after.direction);
    const progressBefore = (before.x + desktop.birdWidth) / (desktop.width + desktop.birdWidth * 2);
    const progressAfter = (after.x + mobile.birdWidth) / (mobile.width + mobile.birdWidth * 2);
    assert.ok(Math.abs(progressBefore - progressAfter) < 1e-10);
  }
});

test('the moving bird occupies only integer cells on the surface grid at every viewport size', () => {
  for (const [width, height, pitch] of [[1280, 720, 6.5], [390, 844, 3.5], [850, 640, 4.52]]) {
    const view = { x: Math.round(width / 2), y: Math.round(height / 2), scale: pitch / 22 };
    const bird = new BirdFlight(width, height, view);
    const positions = new Set();
    for (let time = 0; time < 15000; time += 25) {
      bird.update(time);
      positions.add(bird.position.col);
      for (const [key, { col, row, progress }] of bird.cells) {
        assert.ok(Number.isInteger(col) && Number.isInteger(row));
        assert.equal(key, `${col},${row}`);
        assert.ok(progress > 0 && progress <= 1);
        // The two endpoints use neighboring holes from the same surface lattice.
        assert.ok(Math.abs((view.x + (col + 1) * pitch) - (view.x + col * pitch) - pitch) < 1e-9);
      }
    }
    assert.ok(positions.size > 30);
    bird.resize(width + 100, height, { ...view, x: view.x + 50 });
    assert.ok(bird.cells.size > 0);
    assert.ok([...bird.cells.values()].every(({ col, row }) => Number.isInteger(col) && Number.isInteger(row)));
  }
});

test('bird stitches sew and withdraw in place while shared cells stay fully stitched', () => {
  const stitches = new StitchTransitions();
  stitches.setTarget([[0, 0], [1, 0]], 0, true);
  stitches.setTarget([[1, 0], [2, 0]], 100);
  const middle = stitches.sample(135);
  assert.equal(middle.get('0,0').progress, .5);
  assert.equal(middle.get('1,0').progress, 1);
  assert.equal(middle.get('2,0').progress, .5);
  assert.deepEqual([...stitches.sample(170).keys()], ['1,0', '2,0']);
});

test('a direction change during a stitch continues from its current thread length', () => {
  const stitches = new StitchTransitions();
  stitches.setTarget([[0, 0]], 0, true);
  stitches.setTarget([[1, 0]], 100);
  const before = stitches.sample(135);
  stitches.setTarget([[0, 0]], 135);
  assert.deepEqual(stitches.sample(135), before);
  assert.equal(stitches.sample(170).get('0,0').progress, 1);
  assert.equal(stitches.sample(170).has('1,0'), false);
});

test('reduced motion holds a complete pattern and resuming does not advance by the hidden time', () => {
  const bird = new BirdFlight(1280, 720, { x: 640, y: 320, scale: 6.5 / 22 }, { paused: true });
  const initial = [...bird.cells];
  assert.equal(bird.update(1000), false);
  assert.deepEqual([...bird.cells], initial);
  bird.setPaused(false);
  bird.update(1000);
  bird.update(1016);
  const beforeHidden = bird.elapsed;
  bird.suspend();
  bird.update(60000);
  assert.equal(bird.elapsed, beforeHidden);
  bird.setPaused(true);
  assert.ok([...bird.cells.values()].every(cell => cell.progress === 1));
});
