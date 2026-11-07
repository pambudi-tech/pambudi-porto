import test from 'node:test';
import assert from 'node:assert/strict';
import { MARQUEE, marqueeFrames, marqueeRestEnd, marqueeStep } from './title-marquee.mjs';

// Where the keyframes hold one pose to the next: the round's rests.
const restsOf = ({ frames, duration }) => frames.slice(1).flatMap((frame, index) => {
  const before = frames[index];
  return before.left === frame.left ? [[before.offset * duration, frame.offset * duration]] : [];
});

test('the rests paused through are exactly where the keyframes hold still', () => {
  for (const travel of [13, 41, 120.5, 600]) {
    const round = marqueeFrames(travel);
    const rests = restsOf(round);
    assert.equal(rests.length, 2);
    for (let into = 0; into < round.duration; into += 7.3) {
      const resting = rests.some(([from, to]) => into >= from && into < to);
      assert.equal(marqueeRestEnd(into, round.duration) !== null, resting, `${travel}px at ${into}ms`);
    }
    // As each round begins, and halfway, each for `hold`.
    const close = (a, b) => Math.abs(a - b) < 1e-9;
    assert.ok(close(rests[0][0], 0) && close(rests[0][1], MARQUEE.hold));
    assert.ok(close(rests[1][0], round.duration / 2) && close(rests[1][1], round.duration / 2 + MARQUEE.hold));
  }
});

test('the travel runs through every glide, and from just before it', () => {
  const { duration } = marqueeFrames(41);
  for (let into = 0; into < duration; into += 1) {
    const { state, wake } = marqueeStep(into, duration);
    assert.ok(wake > 0, `wakes later, at ${into}ms`);
    const end = marqueeRestEnd(into, duration);
    if (end === null || end - into <= MARQUEE.lead) {
      assert.equal(state, 'run', `${into}ms`);
      // It runs until the next rest has begun, never into the next glide.
      const rest = into + wake;
      assert.ok(rest === duration / 2 || rest === duration, `${into}ms runs to ${rest}`);
    } else {
      const { still } = marqueeStep(into, duration);
      assert.equal(state, 'rest', `${into}ms`);
      // Paused until `lead` before the glide, held in the same rest.
      assert.equal(into + wake, end - MARQUEE.lead);
      assert.equal(marqueeRestEnd(still, duration), end);
    }
  }
});

test('each glide taken alone lasts as long as it does within the round', () => {
  for (const travel of [13, 41, 120.5, 600]) {
    const { frames, duration, move } = marqueeFrames(travel);
    assert.ok(Math.abs((frames[2].offset - frames[1].offset) * duration - move) < 1e-9);
    assert.ok(Math.abs((frames[4].offset - frames[3].offset) * duration - move) < 1e-9);
  }
});
