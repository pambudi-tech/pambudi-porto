import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID, surfaceSpacing } from './model.mjs';
import { cornerPitch } from './corners.mjs';
import { SurfaceRenderer } from './render.mjs';
import { BirdFlight, samplePose } from '../bird/bird.mjs';
import { BIRD_COLUMNS, BIRD_ROWS } from '../bird/bird-data.mjs';
import { WING_POSES } from '../bird/wing-motion.mjs';

test('restored mobile spacing and 25 percent wider desktop spacing preserve dot diameter', () => {
  for (const [width, baselinePitch] of [[320, (320 - 48) / 90], [390, 3.5], [540, 3.5], [541, 541 * .165 / 31], [1280, 6.5]]) {
    const pitch = cornerPitch(width);
    const spacing = width <= 540 ? 1.5 : 1.25;
    assert.equal(surfaceSpacing(width), spacing);
    assert.ok(Math.abs(pitch - baselinePitch * spacing) < 1e-10);
    const radii = [];
    const context = { setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {}, fill() {}, arc(x, y, r) { radii.push(r); } };
    const renderer = Object.create(SurfaceRenderer.prototype);
    Object.assign(renderer, { cloth: context, dpr: 1, width, height: 80, world() {} });
    const scale = pitch / GRID;
    renderer.drawCloth({ x: 0, y: 0, scale });
    const previousRadius = Math.max(1.5 * baselinePitch / GRID, .42);
    assert.ok(radii.length > 0);
    assert.ok(radii.every(radius => Math.abs(radius * scale - previousRadius) < 1e-10));
  }
});

test('refined bird poses retain their cell density across surface spacing at each viewport', () => {
  for (const [width, height] of [[1665, 978], [1280, 720], [390, 844]]) {
    const pitch = cornerPitch(width);
    const previousPitch = pitch / surfaceSpacing(width);
    const side = Math.max(8, Math.round(Math.min(70 * previousPitch, width * .72, height * .55) / previousPitch));
    const columns = Math.max(1, Math.round(side * (BIRD_COLUMNS + 4) / 70));
    const rows = Math.max(1, Math.round(side * (BIRD_ROWS + 4) / 70));
    const bird = new BirdFlight(width, height, { x: width / 2, y: height / 2, scale: pitch / GRID });
    for (let i = 0; i < WING_POSES.length; i++) assert.deepEqual(bird.frames[i], samplePose(WING_POSES[i], columns, rows));
  }
});
