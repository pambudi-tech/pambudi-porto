import test from 'node:test';
import assert from 'node:assert/strict';
import { paperTarget, advancePaper, paperContains, PAPER_MOTION } from './paper-motion.mjs';
import { PaperInteraction } from './paper-interaction.mjs';

test('paper lifts and tilts toward the pointer and pressing flattens it', () => {
  const hover = paperTarget({ hovered: true, x: 1, y: -1 });
  assert.equal(hover.rx, PAPER_MOTION.tiltX);
  assert.equal(hover.ry, PAPER_MOTION.tiltY);
  assert.equal(hover.scale, PAPER_MOTION.hoverScale);
  assert.equal(hover.lx, 1);
  assert.equal(hover.ly, -1);
  assert.ok(hover.light > 0);
  assert.equal(paperTarget({ hovered: true, x: 10 }).ry, PAPER_MOTION.tiltY);
  const pressed = paperTarget({ hovered: true, pressed: true, x: 1, y: -1 });
  assert.equal(pressed.rx, 0);
  assert.equal(pressed.ry, 0);
  assert.equal(pressed.scale, PAPER_MOTION.pressScale);
  assert.ok(pressed.blur < hover.blur && pressed.sy < hover.sy);
});

test('touch release settles exactly back to the anchored resting state', () => {
  let current = paperTarget({ pressed: true });
  const rest = paperTarget();
  for (let i = 0; i < 120; i++) current = advancePaper(current, rest, 16);
  assert.deepEqual(current, rest);
  assert.equal(paperTarget({ hovered: true, reduced: true, x: .9, y: -.8 }).ry, 0);
  assert.equal(paperTarget({ pressed: true, reduced: true }).scale, 1);
  for (const pressed of [false, true]) {
    const still = paperTarget({ hovered: true, pressed, reduced: true, x: .9, y: -.8 });
    assert.deepEqual([still.lx, still.ly, still.light], [0, 0, 0]);
  }
});

test('paper outline hit testing leaves transparent corners stitchable', () => {
  const bounds = { left: 100, top: 200, width: 400, height: 600 };
  const alpha = new Uint8Array([0, 255, 255, 0, 0, 255, 255, 0, 255, 255, 255, 255, 0, 255, 255, 0]);
  const mask = { width: 4, height: 4, alpha };
  assert.equal(paperContains(bounds, mask, 300, 500), true);
  assert.equal(paperContains(bounds, mask, 110, 210), false);
  assert.equal(paperContains(bounds, mask, 490, 210), false);
  assert.equal(paperContains(bounds, mask, 50, 500), false);
  assert.equal(paperContains(bounds, mask, 500, 500), false);
  assert.equal(paperContains(bounds, null, 300, 500), false);
});

test('touch press, release, and pointer cancellation never leave the paper stuck', () => {
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const paper = Object.create(PaperInteraction.prototype);
    Object.assign(paper, {
      state: { hovered: false, pressed: false, reduced: false, x: 0, y: 0 },
      current: paperTarget(), target: paperTarget(), pointerId: null,
      bounds: { left: 0, top: 0, width: 100, height: 100 },
      mask: { width: 1, height: 1, alpha: new Uint8Array([255]) },
      write() {}, requestFrame() {},
    });
    const event = { pointerId: 7, pointerType: 'touch', clientX: 70, clientY: 30 };
    paper.press(event);
    assert.equal(paper.ownsPointer(7), true);
    assert.equal(paper.target.scale, PAPER_MOTION.pressScale);
    assert.equal(paper.release({ ...event, pointerId: 8, type }), false);
    paper.release({ ...event, type });
    assert.equal(paper.ownsPointer(7), false);
    assert.equal(paper.state.hovered, false);
    assert.deepEqual(paper.target, paperTarget());
    for (let frame = 0; frame < 120; frame++) paper.update(frame * 16);
    assert.deepEqual(paper.current, paperTarget());
  }
});
