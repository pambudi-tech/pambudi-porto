import test from 'node:test';
import assert from 'node:assert/strict';
import { BirdFlight, StitchTransitions } from './bird.mjs';
import { BIRD_POSES, BIRD_COLUMNS, BIRD_ROWS, BIRD_COLOR } from './bird-data.mjs';
import { ENTRANCE } from '../stitch/stitch-entrance.mjs';
import { articulatePose, bodyMotionAt, moveBirdPoint } from './bird-motion.mjs';
import { WING_POSES, wingPoint } from './wing-motion.mjs';

test('refined wings retain the raised figure, head and tail on the same bounded stitch grid', () => {
  assert.deepEqual(WING_POSES[0], BIRD_POSES[0]);
  assert.equal(WING_POSES.length, BIRD_POSES.length);
  const fixed = BIRD_POSES[0].filter(([x, y]) => (x < 25 && y >= 35) || (x >= 34 && y >= 24 && y <= 30));
  for (const pose of WING_POSES) {
    const cells = new Set(pose.map(cell => cell.join(',')));
    assert.equal(cells.size, pose.length);
    assert.ok(fixed.every(cell => cells.has(cell.join(','))), 'the head and tail keep their approved pattern');
    assert.ok(pose.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y) && x >= -2 && x < BIRD_COLUMNS + 2 && y >= -2 && y < BIRD_ROWS + 2));
  }
});

test('downstroke releases the fixed strip beside the head and lets the tips follow the shoulder', () => {
  for (let frame = 4; frame <= 8; frame++) {
    assert.ok(BIRD_POSES[frame].some(([x, y]) => x >= 26 && x < 34 && y === 24));
    assert.ok(!WING_POSES[frame].some(([x, y]) => x >= 26 && x < 34 && y === 24), 'the old horizontal wing cut no longer stays beside the head');
  }
  for (let frame = 0; frame < 12; frame++) {
    assert.deepEqual(wingPoint(25, 31, frame), [25, 31]);
    assert.deepEqual(wingPoint(28, 31, frame, true), [28, 31]);
  }
  assert.ok(wingPoint(6, 1, 7)[1] > wingPoint(6, 1, 6)[1], 'the near primaries complete the downstroke after the root');
  assert.ok(wingPoint(43, 10, 7, true)[1] > wingPoint(43, 10, 6, true)[1], 'the far primaries have follow-through too');
});

test('the lowered wings reveal a continuous back between the tail root and neck', () => {
  for (let frame = 4; frame <= 8; frame++) {
    const cells = new Set(WING_POSES[frame].map(cell => cell.join(',')));
    const contour = [[20, 31], [23, 30], [26, 29], [29, 29], [31, 27], [33, 25]];
    for (const [x, top] of contour) {
      // Check the exposed upper-back band; lower wing-root feather gaps
      // remain intentionally open below it.
      for (let y = top; y <= Math.min(top + 2, 32); y++) {
        assert.ok(cells.has(`${x},${y}`), `the back keeps its volume at ${x},${y} in pose ${frame}`);
      }
    }
    const reached = new Set(['20,31']), pending = [[20, 31]];
    while (pending.length) {
      const [x, y] = pending.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (nx < 20 || nx > 34 || ny < 24 || ny > 34 || !cells.has(key) || reached.has(key)) continue;
        reached.add(key);
        pending.push([nx, ny]);
      }
    }
    assert.ok(reached.has('34,25'), 'the restored back connects to the neck without a seam');
  }
  assert.deepEqual(WING_POSES[0], BIRD_POSES[0], 'restoring the back does not fill the raised wing featherwork');
});

test('body follow-through preserves the source figure and its open featherwork', () => {
  for (const pose of WING_POSES) assert.deepEqual(articulatePose(pose, 0), pose);
  for (let time = 400; time < 5200; time += 40) {
    const pose = WING_POSES[Math.floor(time / 100) % WING_POSES.length];
    const moved = articulatePose(pose, time);
    assert.ok(Math.abs(moved.length / pose.length - 1) < .05, 'grid rounding retains at least 95% of the stitch area');
    assert.equal(new Set(moved.map(cell => cell.join(','))).size, moved.length);
    assert.ok(moved.every(([x, y]) => x >= -2 && x < BIRD_COLUMNS + 2 && y >= -2 && y < BIRD_ROWS + 2));
    const source = new Set(pose.map(cell => cell.join(',')));
    for (const [x, y] of moved) {
      let nearby = false;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) nearby ||= source.has(`${x + dx},${y + dy}`);
      assert.ok(nearby, 'the silhouette stays within three source stitches of the approved figure');
    }
  }
});

test('the body lifts while the head balances and the tail follows with a delay', () => {
  const breast = [], head = [], tail = [];
  for (let time = 1200; time < 2400; time += 40) {
    const motion = bodyMotionAt(time);
    breast.push(moveBirdPoint(26, 35, motion)[1] - 35);
    head.push(moveBirdPoint(39, 27, motion)[1] - 27);
    tail.push(moveBirdPoint(5, 40, motion)[1] - 40);
  }
  const range = values => Math.max(...values) - Math.min(...values);
  assert.ok(range(breast) > 1.5, 'the breast no longer holds a fixed pose');
  assert.ok(range(head) > .5, 'the head participates in the movement');
  assert.ok(range(tail) > 2, 'the trailing feathers have visible follow-through');
  assert.ok(tail.some((value, index) => value * breast[index] < 0), 'the tail does not rise and fall rigidly with the breast');
  const moving = new BirdFlight(1280, 720, { x: 640, y: 320, scale: 6.5 / 22 });
  moving.update(0);
  for (let time = 40; time <= 2000; time += 40) moving.update(time);
  moving.setPaused(true);
  const frozen = [...moving.cells];
  moving.update(8000);
  assert.deepEqual([...moving.cells], frozen, 'reduced motion freezes the articulated body too');
});

test('flapping poses are distinct, bounded stitch coordinates with no duplicated cells', () => {
  assert.ok(BIRD_POSES.length >= 4);
  assert.ok(new Set(BIRD_POSES.map(pose => JSON.stringify(pose))).size >= 4);
  for (const pose of BIRD_POSES) {
    assert.ok(pose.length > 50);
    assert.equal(new Set(pose.map(point => point.join(','))).size, pose.length);
    assert.ok(pose.every(([col, row]) => Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < BIRD_COLUMNS && row >= 0 && row < BIRD_ROWS));
  }
});

test('climbs and dives pitch the whole figure about the breast without losing stitches', () => {
  // The lowered-wing pose leaves the head clear to measure.
  const pose = WING_POSES[4];
  const up = articulatePose(pose, 0, -.3), down = articulatePose(pose, 0, .3);
  const head = cells => {
    const front = cells.filter(([x]) => x >= 36);
    return front.reduce((sum, [, y]) => sum + y, 0) / front.length;
  };
  assert.ok(head(up) < head(pose) - 1.5, 'a climb raises the head');
  assert.ok(head(down) > head(pose) + 1.5, 'a dive lowers it');
  for (const moved of [up, down]) {
    assert.ok(Math.abs(moved.length / pose.length - 1) < .08, 'rotation keeps the stitch area');
    assert.equal(new Set(moved.map(cell => cell.join(','))).size, moved.length);
  }
});

test('the bird faces the way it flies, and only turns once it is clearly heading back', () => {
  const bird = new BirdFlight(1280, 720, { x: 640, y: 320, scale: 6.5 / 22 });
  let previous = bird.flight.x, faced = 0, checked = 0;
  for (let time = 0; time <= 60000; time += 20) {
    bird.update(time);
    const { x, direction } = bird.flight;
    if (!bird.flight.away && Math.abs(x - previous) > 2) {
      checked++;
      if (Math.sign(x - previous) === direction) faced++;
    }
    previous = x;
  }
  assert.ok(checked > 500);
  assert.ok(faced / checked > .97, 'it does not fly backwards');
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

test('the bird reveals in local flame patches without changing its flight or final stitch geometry', () => {
  const view = { x: 640, y: 320, scale: 8.125 / 22 };
  const bird = new BirdFlight(1280, 720, view);
  const full = new BirdFlight(1280, 720, view, { paused: true });
  full.setPaused(false);
  assert.equal(bird.cells.size, 0);
  let partial = false;
  const end = ENTRANCE.delay + ENTRANCE.wordmark + ENTRANCE.stitch;
  for (let time = 0; time <= end + 200; time += 50) {
    bird.update(time);
    full.update(time);
    assert.deepEqual(bird.position, full.position);
    for (const [key, cell] of bird.cells) {
      assert.ok(cell.progress <= full.cells.get(key).progress + 1e-10);
      assert.ok(Number.isInteger(cell.col) && Number.isInteger(cell.row));
    }
    if (time > 500 && time < 1500 && bird.cells.size > 0 && bird.cells.size < full.cells.size) partial = true;
  }
  assert.ok(partial, 'only a portion of the bird is stitched during the reveal');
  assert.deepEqual(bird.cells, full.cells, 'the completed bird matches the original flight');
  bird.resize(390, 844, { x: 195, y: 357, scale: 5.25 / 22 });
  assert.equal(bird.entrance.finished, true, 'resizing does not replay the reveal');
});

test('bird stays red on both sides of the paper throughout its outgoing and return flight', () => {
  const bird = new BirdFlight(1280, 720, { x: 640, y: 320, scale: 8.125 / 22 }, { paused: true });
  assert.ok([...bird.cells.values()].every(cell => cell.color === BIRD_COLOR));
  bird.setPaused(false);
  const directions = new Set();
  for (let time = 0; time <= 28000; time += 100) {
    bird.update(time);
    directions.add(bird.position.direction);
    assert.ok([...bird.cells.values()].every(cell => cell.color === BIRD_COLOR));
  }
  assert.equal(directions.size, 2, 'both flight directions were checked');
});

test('page departure unsews the dove and return replays its initial reveal without resetting the flight', () => {
  const view = { x: 640, y: 320, scale: 8.125 / 22 };
  const bird = new BirdFlight(1280, 720, view, { paused: true });
  const full = new BirdFlight(1280, 720, view, { paused: true });
  bird.setPaused(false);
  full.setPaused(false);
  bird.update(0);
  full.update(0);
  const initial = new Map(bird.cells);
  bird.setVisible(false, { duration: 900 });
  assert.deepEqual(bird.cells, initial, 'departure starts at the current thread lengths');
  let partialDeparture = false;
  for (let time = 50; time <= 900; time += 50) {
    bird.update(time);
    full.update(time);
    assert.deepEqual(bird.position, full.position, 'unsewing does not change the flight');
    if (time === 450) partialDeparture = bird.cells.size > 0 && bird.cells.size < full.cells.size;
  }
  assert.ok(partialDeparture, 'the dove retracts in patches instead of disappearing at the page handoff');
  assert.equal(bird.cells.size, 0);
  const flight = { ...bird.flight.state };
  bird.setVisible(true);
  assert.equal(bird.cells.size, 0, 'return begins with bare cloth');
  assert.deepEqual(bird.flight.state, flight, 'return keeps its place in the flight');
  let partialReturn = false;
  const end = ENTRANCE.delay + ENTRANCE.wordmark + ENTRANCE.stitch;
  for (let time = 950; time <= 900 + end + 50; time += 50) {
    bird.update(time);
    full.update(time);
    assert.deepEqual(bird.position, full.position);
    if (time === 1900) partialReturn = bird.cells.size > 0 && bird.cells.size < full.cells.size;
  }
  assert.ok(partialReturn, 'return uses the initial gradual stitch reveal');
  assert.deepEqual(bird.cells, full.cells, 'the completed dove keeps the original geometry');
});

test('a hidden dove stays hidden through resize and reduced motion, and can return immediately', () => {
  const bird = new BirdFlight(1280, 720, { x: 640, y: 320, scale: 8.125 / 22 }, { paused: true });
  bird.setVisible(false);
  assert.equal(bird.cells.size, 0);
  bird.resize(390, 844, { x: 195, y: 357, scale: 5.25 / 22 });
  bird.setPaused(true);
  assert.equal(bird.cells.size, 0, 'layout and motion preferences do not flash the hidden dove');
  bird.setVisible(true);
  assert.ok(bird.cells.size > 0);
  assert.ok([...bird.cells.values()].every(cell => cell.progress === 1));
});
