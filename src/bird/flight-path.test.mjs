import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightPath, FLIGHT, seededRandom } from './flight-path.mjs';

const desktop = {
  width: 1405, height: 989, birdWidth: 268, birdHeight: 374, top: 0, bottom: 918,
  avoid: { left: 394, top: 109, width: 617, height: 771 },
};
const phone = { width: 390, height: 844, birdWidth: 110, birdHeight: 155, top: 0, bottom: 700, avoid: { left: -10, top: 330, width: 410, height: 470 } };

function fly(stage, seed, duration, visit) {
  const flight = new FlightPath(stage, { seed });
  for (let time = 0; time < duration; time += FLIGHT.step) {
    const before = { x: flight.x, y: flight.y, heading: flight.heading, away: flight.away };
    flight.advance(FLIGHT.step);
    visit(flight, before);
  }
  return flight;
}

test('the same seed flies the same path, and another seed a different one', () => {
  const path = seed => {
    const points = [];
    fly(desktop, seed, 20000, flight => points.push(`${flight.x.toFixed(3)},${flight.y.toFixed(3)}`));
    return points.join(' ');
  };
  assert.equal(path(9), path(9));
  assert.notEqual(path(9), path(10));
  const random = seededRandom(3);
  assert.ok(Array.from({ length: 200 }, random).every(value => value >= 0 && value < 1));
});

test('flight is continuous, never climbs or dives without travelling across, and stays in the sky band', () => {
  const steepest = Math.tan(FLIGHT.maxSlope);
  for (const stage of [desktop, phone]) for (const seed of [1, 2, 3]) {
    let reentries = 0, turns = 0, direction = null;
    fly(stage, seed, 120000, (flight, before) => {
      if (before.away > 0) {
        if (!flight.away) reentries++;
        return;
      }
      if (flight.away) return;
      const dx = flight.x - before.x, dy = flight.y - before.y;
      // The fastest dive, hurrying behind the paper.
      const maxSpeed = FLIGHT.modes.swoop.speed * flight.pace * 1.5 * 1.45;
      assert.ok(Math.hypot(dx, dy) <= maxSpeed * FLIGHT.step + 1e-9, 'no jumps on screen');
      assert.ok(Math.abs(dy) <= Math.abs(dx) * steepest + 1e-9, 'no straight climb or dive');
      assert.ok(flight.y >= flight.low - 1e-9 && flight.y <= flight.high + 1e-9);
      assert.ok(Math.abs(flight.pitch) <= FLIGHT.maxPitch);
      if (direction !== null && flight.direction !== direction) turns++;
      direction = flight.direction;
    });
    assert.ok(reentries > 0, 'it leaves the frame and comes back');
    assert.ok(turns > 4, 'it turns back on screen');
  }
});

test('a visit mixes cruising, climbs, glides with held wings, swoops and circles across the sky', () => {
  const seen = new Set();
  let held = 0, minY = Infinity, maxY = -Infinity, minSpeed = Infinity, maxSpeed = 0;
  const flight = fly(desktop, 5, 180000, flight => {
    seen.add(flight.mode);
    if (flight.away) return;
    if (flight.holding) {
      held++;
      assert.equal(flight.wing % flight.poses, 0, 'a glide holds the wings at the top of the stroke');
    }
    minY = Math.min(minY, flight.y);
    maxY = Math.max(maxY, flight.y);
    minSpeed = Math.min(minSpeed, flight.speed);
    maxSpeed = Math.max(maxSpeed, flight.speed);
  });
  for (const mode of ['cruise', 'climb', 'glide', 'swoop', 'circle', 'exit']) assert.ok(seen.has(mode), `${mode} happens`);
  assert.ok(!seen.has('land') && !seen.has('rest'), 'it only lands when the visitor is idle');
  assert.ok(held > 100, 'it glides for a while');
  assert.ok(maxY - minY > (flight.high - flight.low) * .6, 'it uses most of the sky');
  assert.ok(maxSpeed / minSpeed > 1.5, 'its speed changes');
});

test('it carries on across the page, turning back near the edges rather than dithering on one side', () => {
  let on = 0, hidden = 0, turns = 0, sameSide = 0, lastTurn = null, direction = null;
  fly(desktop, 11, 300000, flight => {
    if (flight.away || flight.offscreen) return;
    on++;
    if (flight.hidden) hidden++;
    if (direction !== null && flight.direction !== direction) {
      turns++;
      if (lastTurn !== null && (lastTurn < desktop.width / 2) === (flight.x < desktop.width / 2)) sameSide++;
      lastTurn = flight.x;
    }
    direction = flight.direction;
  });
  assert.ok(on * FLIGHT.step / turns > 4500, 'it turns back no more than every few seconds');
  assert.ok(sameSide / turns < .3, `${Math.round(sameSide / turns * 100)}% of turns on the side of the last`);
  assert.ok(hidden / on < .42, `behind the paper ${Math.round(hidden / on * 100)}% of the time`);
});

test('narrow screens fly slower, so a crossing still takes a few seconds', () => {
  assert.ok(new FlightPath(phone).pace < new FlightPath(desktop).pace);
  const flight = new FlightPath(phone);
  assert.ok(phone.width / (FLIGHT.modes.cruise.speed * flight.pace) > 3500);
});

test('resizing keeps its place in proportion and inside the new sky', () => {
  const flight = new FlightPath(desktop, { seed: 4 });
  flight.advance(9000);
  const before = { x: flight.x / desktop.width, direction: flight.direction };
  flight.resize(phone);
  assert.ok(Math.abs(flight.x / phone.width - before.x) < 1e-9);
  assert.equal(flight.direction, before.direction);
  assert.ok(flight.y >= flight.low && flight.y <= flight.high);
  flight.advance(20000);
  assert.ok(flight.y >= flight.low && flight.y <= flight.high);
});

const perches = [{ x: 1180, y: 690, direction: -1 }, { x: 225, y: 690, direction: 1 }];

// Steps `flight` for `duration` ms, checking the slope rule on every visible step.
function watch(flight, duration, visit = () => {}) {
  const steepest = Math.tan(FLIGHT.maxSlope);
  for (let time = 0; time < duration; time += FLIGHT.step) {
    const before = { x: flight.x, y: flight.y, away: flight.away, offscreen: flight.offscreen };
    flight.advance(FLIGHT.step);
    if (!before.away && !flight.away && !before.offscreen && !flight.offscreen) {
      assert.ok(Math.abs(flight.y - before.y) <= Math.abs(flight.x - before.x) * steepest + 1e-9, 'no straight climb or dive');
    }
    if (visit(time) === false) return time;
  }
  return duration;
}

test('an idle visitor sends it straight to the nearest perch, where it settles facing into the page', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const flight = new FlightPath(desktop, { seed });
    flight.setPerches(perches);
    watch(flight, 5000);
    if (flight.away) watch(flight, 6000, () => !flight.away ? false : undefined);
    const nearest = perches.reduce((best, perch) => Math.hypot(perch.x - flight.x, perch.y - flight.y) < Math.hypot(best.x - flight.x, best.y - flight.y) ? perch : best);
    flight.setIdle(true);
    assert.equal(flight.mode, 'land', 'it heads for its perch at once');
    assert.equal(flight.perch, nearest);
    const took = watch(flight, 20000, () => flight.resting ? false : undefined);
    assert.ok(flight.resting && took < 15000, `it settles within a few seconds (${took}ms)`);
    assert.ok(Math.hypot(flight.x - nearest.x, flight.y - nearest.y) < 3);
    assert.equal(flight.direction, nearest.direction, 'it faces into the page');
    const rest = { x: flight.x, y: flight.y };
    flight.advance(10000);
    assert.deepEqual({ x: flight.x, y: flight.y }, rest, 'it stays put while the visitor is away');
    flight.setIdle(false);
    assert.equal(flight.mode, 'takeoff', 'activity lifts it off the perch');
    watch(flight, 1500);
    assert.ok(Math.sign(flight.x - rest.x) === nearest.direction, 'it leaves the way it faces');
    assert.ok(flight.y < rest.y, 'and climbs away');
  }
});

test('a moved pointer calls it over within a moment, and it carries on as usual once there', () => {
  for (const [seed, lure] of [[1, { x: 300, y: 300 }], [2, { x: 1200, y: 250 }], [3, { x: 700, y: 700 }]]) {
    const flight = new FlightPath(desktop, { seed });
    watch(flight, 4000);
    flight.setLure(lure.x, lure.y);
    watch(flight, FLIGHT.followDelay - FLIGHT.step);
    assert.notEqual(flight.mode, 'follow', 'not instantly');
    watch(flight, FLIGHT.step * 2);
    if (!flight.away) assert.equal(flight.mode, 'follow', 'but very soon');
    const goal = flight.lureTarget();
    let closest = Infinity;
    watch(flight, 12000, () => {
      closest = Math.min(closest, Math.hypot(flight.x - goal.x, flight.y - goal.y));
      return flight.mode !== 'follow' && closest < 40 ? false : undefined;
    });
    assert.ok(closest < 40, `it reaches the pointer (${Math.round(closest)}px away at best)`);
    assert.notEqual(flight.mode, 'follow', 'and then flies on');
  }
});

test('while it follows, it keeps looking for where the pointer has got to', () => {
  const flight = new FlightPath(desktop, { seed: 6 });
  watch(flight, 3000);
  flight.setLure(250, 400);
  watch(flight, 600);
  flight.setLure(1150, 400);
  watch(flight, FLIGHT.followEvery + FLIGHT.step);
  assert.equal(flight.goal.x, 1150, 'the new spot replaces the old one');
});

test('without a perch an idle visitor changes nothing, and activity turns a landing away', () => {
  const free = new FlightPath(desktop, { seed: 8 }), idle = new FlightPath(desktop, { seed: 8 });
  idle.setIdle(true);
  free.advance(30000);
  idle.advance(30000);
  assert.deepEqual([idle.x, idle.y, idle.mode], [free.x, free.y, free.mode]);
  const landing = new FlightPath(desktop, { seed: 8 });
  landing.setPerches(perches);
  landing.advance(4000);
  landing.setIdle(true);
  assert.equal(landing.mode, 'land');
  landing.setIdle(false);
  assert.notEqual(landing.mode, 'land');
});
