import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageTable, traceWordmark, traceStackedWordmark, WORDMARK_RATIO, WORDMARK_LINES } from './wordmark-grid.mjs';
import { cornerPattern, withoutUpperCorners, CORNER_SIZE } from './corners.mjs';
import { edgeGapStitches } from './model.mjs';

test('wordmark side margins use one stitch on mobile and three on desktop', () => {
  const width = 128, height = 32;
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const table = coverageTable(rgba, width, height);
  for (const screenWidth of [320, 390, 540, 541, 1173, 1920]) {
    const pitch = screenWidth < 540 ? 3.5 : 6.5;
    const view = { x: screenWidth / 2, y: 450 };
    const result = traceWordmark(table, width, height, screenWidth, view, pitch);
    const xs = result.cells.map(([col]) => view.x + col * pitch);
    const leftGap = Math.min(...xs);
    const rightGap = screenWidth - Math.max(...xs) - pitch;
    const gap = screenWidth <= 540 ? 1 : 3;
    assert.equal(edgeGapStitches(screenWidth), gap);
    assert.ok(leftGap >= gap * pitch && leftGap < (gap + 1) * pitch);
    assert.ok(rightGap >= gap * pitch && rightGap < (gap + 1) * pitch);
    assert.ok(Math.abs(result.height - (screenWidth - leftGap - rightGap) * WORDMARK_RATIO) < 1e-6);
    assert.equal(new Set(result.cells.map(cell => cell.join(','))).size, result.cells.length);
  }
});

test('transparent artwork and black background pixels do not create stitches', () => {
  const width = 32, height = 8;
  const transparent = new Uint8ClampedArray(width * height * 4);
  const black = new Uint8ClampedArray(transparent.length);
  for (let i = 3; i < black.length; i += 4) black[i] = 255;
  for (const rgba of [transparent, black]) {
    const result = traceWordmark(coverageTable(rgba, width, height), width, height, 320, { x: 160, y: 400 }, 4);
    assert.equal(result.cells.length, 0);
  }
});

test('mobile PAM and BUDI stay on the existing lattice with one empty stitch row between them', () => {
  const width = 128, height = 64;
  const table = coverageTable(new Uint8ClampedArray(width * height * 4).fill(255), width, height);
  const lines = WORDMARK_LINES.map(crop => ({ label: crop.label, aspectRatio: crop.height / crop.width, table, width, height }));
  for (const screenWidth of [320, 390, 540]) {
    const pitch = 5.25, view = { x: Math.round(screenWidth / 2), y: 357 };
    const result = traceStackedWordmark(lines, screenWidth, view, pitch);
    assert.deepEqual(result.rows.map(row => row.label), ['PAM', 'BUDI']);
    assert.equal(result.rows[1].top - result.rows[0].bottom, 1);
    assert.ok(result.cells.every(([col, row]) => Number.isInteger(col) && Number.isInteger(row)));
    assert.equal(new Set(result.cells.map(cell => cell.join(','))).size, result.cells.length);
    assert.ok(result.cells.every(([, row]) => row !== result.rows[0].bottom));
    assert.ok(result.height > screenWidth * WORDMARK_RATIO * 3);
  }
});

test('removing upper ornaments preserves lower corners and unrelated saved edits', () => {
  const entries = [...cornerPattern().entries, ['20,5', 'garnet'], ['-999,100', 'sage']];
  const remaining = new Map(withoutUpperCorners(entries));
  assert.equal(remaining.size, 171 * 2 + 2);
  assert.equal(remaining.get('20,5'), 'garnet');
  assert.equal(remaining.get('-999,100'), 'sage');
  for (const [key, color] of entries) {
    const [col, row] = key.split(',').map(Number);
    if (col >= -1300 && col < -1200 + CORNER_SIZE && row >= 0 && row < CORNER_SIZE) assert.equal(remaining.get(key), color);
  }
});
