import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPTH, galleryPlacement, depthOpacity, galleryCurrent } from './project-gallery.mjs';

test('gallery stamps alternate sides and always fit on screen at the camera', () => {
  const room = { width: 1400, height: 900, w: 600, h: 450 };
  for (let index = 0; index < 8; index++) {
    const { x, y } = galleryPlacement(index, room);
    assert.equal(Math.sign(x), index % 2 ? 1 : -1);
    assert.ok(Math.abs(x) + room.w / 2 <= room.width / 2 - DEPTH.side + 1e-9);
    assert.ok(room.height / 2 + y - room.h / 2 >= DEPTH.top - 1e-9);
    assert.ok(room.height / 2 + y + room.h / 2 <= room.height - DEPTH.bottom + 1e-9);
  }
  assert.deepEqual(galleryPlacement(3, room), galleryPlacement(3, room));
});

test('stamps fade in from the fog and out as they pass the camera', () => {
  assert.equal(depthOpacity(0), 1);
  assert.equal(depthOpacity(DEPTH.pass), 0);
  assert.equal(depthOpacity(-DEPTH.spacing * DEPTH.fog), 0);
  assert.ok(depthOpacity(-DEPTH.spacing) > depthOpacity(-DEPTH.spacing * 2));
});

test('the current stamp is the one nearest the camera', () => {
  assert.equal(galleryCurrent(0, 4), 0);
  assert.equal(galleryCurrent(DEPTH.spacing * .6, 4), 1);
  assert.equal(galleryCurrent(DEPTH.spacing * 9, 4), 3);
  assert.equal(galleryCurrent(-DEPTH.spacing, 4), 0);
});
