import test from 'node:test';
import assert from 'node:assert/strict';
import { rollPoint, placeStrip, rollerRadius, stripHeight, copiesOf, rollKeyframes } from './sheet-roller.mjs';

const edges = { top: 120, bottom: 780, radius: rollerRadius(120, 900) };
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

test('between the curl lines the sheet lies flat, where it is', () => {
  for (const y of [120, 300, 780]) assert.deepEqual(rollPoint(y, edges), { y, z: 0, angle: 0 });
  // Rolled nowhere when the roller is off.
  assert.deepEqual(rollPoint(10, { ...edges, radius: Infinity }), { y: 10, z: 0, angle: 0 });
});

test('past a curl line the sheet wraps over the roller, away from the eye, without stretching', () => {
  const { radius } = edges;
  let last = rollPoint(edges.top, edges);
  for (let past = 4; past <= radius * Math.PI / 2; past += 4) {
    const point = rollPoint(edges.top - past, edges);
    // Each step along the sheet is the same step along the curve.
    assert.ok(close(Math.hypot(point.y - last.y, point.z - last.z), 2 * radius * Math.sin(2 / radius), 1e-6));
    assert.ok(point.y < last.y && point.z < last.z && point.angle > last.angle);
    last = point;
  }
  // The crest is a radius above the curl line and a radius back.
  const crest = rollPoint(edges.top - radius * Math.PI / 2, edges);
  assert.ok(close(crest.y, edges.top - radius, 1e-6) && close(crest.z, -radius, 1e-6));
  // The bottom mirrors the top.
  const below = rollPoint(edges.bottom + 50, edges), above = rollPoint(edges.top - 50, edges);
  assert.ok(close(below.y - edges.bottom, edges.top - above.y) && close(below.z, above.z));
});

test('seen from the middle of the screen, the crest meets the screen\'s edge', () => {
  const perspective = 900, height = 900, radius = rollerRadius(120, height, perspective);
  const crest = { y: 120 - radius, z: -radius };
  const seen = height / 2 + (crest.y - height / 2) * perspective / (perspective - crest.z);
  assert.ok(close(seen, 0, 1e-6));
});

test('strips placed on the roller meet edge to edge: no gaps, no overlaps', () => {
  const step = stripHeight(edges.radius);
  // A card crossing the top curl line, and one crossing the bottom.
  for (const start of [edges.top - 230, edges.bottom - 60]) {
    for (let from = 0; from + step <= 240; from += step) {
      const a = placeStrip(start + from, start + from + step, edges);
      const b = placeStrip(start + from + step, start + from + 2 * step, edges);
      if (a.hidden || b.hidden) continue;
      // Where a strip's tilt and length carry its lower edge is where the next begins.
      const endY = a.y + step * a.scale * Math.cos(a.tilt), endZ = a.z + step * a.scale * Math.sin(a.tilt);
      assert.ok(close(endY, b.y, 1e-6) && close(endZ, b.z, 1e-6), `at ${start + from}`);
    }
  }
});

test('a strip beyond the crest is out of sight; flat strips are untouched', () => {
  const flat = placeStrip(300, 320, edges);
  assert.deepEqual([flat.y, flat.z, flat.tilt, flat.scale, flat.hidden], [300, 0, 0, 1, false]);
  const reach = edges.radius * Math.PI / 2;
  assert.equal(placeStrip(edges.top - reach - 20, edges.top - reach - 4, edges).hidden, true);
  assert.equal(placeStrip(edges.top - reach + 4, edges.top - reach + 20, edges).hidden, false);
  // Strips bend little enough that a chord stands for the arc.
  for (const radius of [120, 154, 240, 300]) {
    const height = stripHeight(radius);
    assert.ok(radius * (1 - Math.cos(height / radius / 2)) <= .6 && height >= 6, `${radius}`);
  }
});

test('an endless sheet shows every copy of a card in sight, and only those', () => {
  const sight = { scroll: 10000, period: 1000, from: -200, to: 1100 };
  // A card 200 px tall at 50 px down the sheet: copies at 10050 and 11050.
  assert.deepEqual(copiesOf(50, 200, sight), [[10, 50], [11, 1050]]);
  // Partly in sight above.
  assert.deepEqual(copiesOf(850, 200, sight), [[9, -150], [10, 850]]);
  // Without a loop: only the card itself, if in sight.
  assert.deepEqual(copiesOf(50, 200, { ...sight, period: 0, scroll: 0 }), [[0, 50]]);
  assert.deepEqual(copiesOf(2000, 200, { ...sight, period: 0, scroll: 0 }), []);
});

test('the roll\'s keyframes run from beyond the bottom crest to beyond the top one, flat between the curl lines', () => {
  const strip = stripHeight(edges.radius);
  const { frames, span } = rollKeyframes({ ...edges, strip });
  const reach = edges.radius * Math.PI / 2;
  assert.ok(close(span, edges.bottom + reach - (edges.top - reach - strip)));
  assert.equal(frames[0].offset, 0);
  assert.ok(close(frames.at(-1).offset, 1));
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].offset > frames[i - 1].offset);
  // Where a strip lies flat between the curl lines, it is untouched.
  const flat = frames.find(frame => close(frame.offset, reach / span + 0) || frame.transform.includes(`, ${(edges.bottom - strip).toFixed(3)}px, 0.000px`));
  assert.ok(flat && flat.transform.includes('rotateX(0.00000rad) scaleY(1.00000)'));
  // Past a crest, it faces away.
  const beyond = frames.at(-1).transform.match(/rotateX\(([-\d.]+)rad\)/)[1];
  assert.ok(Math.abs(+beyond) > Math.PI / 2);
});
