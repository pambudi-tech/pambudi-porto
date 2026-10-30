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
      const maxSpeed = FLIGHT.modes.swoop.speed * flight.pace * 1.6;
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
  for (const mode of Object.keys(FLIGHT.modes)) assert.ok(seen.has(mode), `${mode} happens`);
  assert.ok(held > 100, 'it glides for a while');
  assert.ok(maxY - minY > (flight.high - flight.low) * .6, 'it uses most of the sky');
  assert.ok(maxSpeed / minSpeed > 1.5, 'its speed changes');
});

test('it mostly shows on the open cloth beside the paper', () => {
  const { avoid, birdWidth } = desktop, inset = birdWidth * .2;
  let on = 0, hidden = 0;
  fly(desktop, 11, 300000, flight => {
    if (flight.away || flight.offscreen) return;
    on++;
    if (flight.x > avoid.left + inset && flight.x < avoid.left + avoid.width - inset) hidden++;
  });
  assert.ok(hidden / on < .35, `behind the paper ${Math.round(hidden / on * 100)}% of the time`);
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
