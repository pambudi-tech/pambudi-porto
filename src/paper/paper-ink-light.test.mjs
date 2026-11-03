import test from 'node:test';
import assert from 'node:assert/strict';
import { INK_LIGHT, inkBrightness } from './paper-ink-light.mjs';

const rest = [-.22, -.42, 1.25];

test('at rest the ink is exactly its own colour', () => {
  for (const at of [[0, 0], [.2, .3], [-.3, -.1]]) assert.equal(inkBrightness(at, rest, rest), 1);
});

test('the lamp right over a word lifts it, with its sheen', () => {
  assert.ok(inkBrightness([.1, .1], [.1, .1, .6], rest) > 1.2);
});

test('a word far from the lamp is a touch darker, never much', () => {
  const far = inkBrightness([-.3, .3], [.35, -.3, .6], rest);
  assert.ok(far < 1 && far >= INK_LIGHT.darkest);
});

test('nearer the lamp is lighter than farther from it', () => {
  const lamp = [0, 0, .6];
  assert.ok(inkBrightness([.05, 0], lamp, rest) > inkBrightness([.25, 0], lamp, rest));
  assert.ok(inkBrightness([.25, 0], lamp, rest) > inkBrightness([.4, .2], lamp, rest));
});

// A sheet with a few words, enough for PaperInkLight without a browser; a
// word's `own` filter is the one its stylesheet gives it.
globalThis.getComputedStyle = element => ({ filter: element.own ?? 'none' });
function fakePaper(count) {
  const box = (left, top, width, height) => ({ left, top, width, height });
  const words = Array.from({ length: count }, (_, i) => ({ style: { filter: '' }, getBoundingClientRect: () => box(40 + i * 30, 120 + i * 10, 20, 8) }));
  const face = {
    querySelector: () => ({ getBoundingClientRect: () => box(0, 0, 320, 400) }),
    querySelectorAll: () => words,
  };
  const paper = { dataset: {}, querySelector: selector => (selector === '.paper-front' ? face : null) };
  return { paper, words };
}

test('a resize mid-light leaves no light on the ink once the lamp rests', async () => {
  const observers = [];
  globalThis.ResizeObserver = class { constructor(callback) { observers.push(callback); } observe() {} };
  const { PaperInkLight } = await import('./paper-ink-light.mjs');
  const { paper, words } = fakePaper(4);
  const light = new PaperInkLight(paper);
  light.update([.3, .2, .6], rest);
  assert.ok(words.some(word => word.style.filter));
  observers.forEach(callback => callback());
  light.update(rest, rest);
  assert.deepEqual(words.map(word => word.style.filter), ['', '', '', '']);
});

test('at rest it neither measures nor lights a page it has never lit', async () => {
  const { PaperInkLight } = await import('./paper-ink-light.mjs');
  const { paper, words } = fakePaper(3);
  let measured = 0;
  for (const word of words) { const read = word.getBoundingClientRect; word.getBoundingClientRect = () => { measured++; return read(); }; }
  new PaperInkLight(paper).update(rest, rest);
  assert.equal(measured, 0);
  assert.deepEqual(words.map(word => word.style.filter), ['', '', '']);
});

test('a word with a filter of its own keeps it under the light', async () => {
  const { PaperInkLight } = await import('./paper-ink-light.mjs');
  const { paper, words } = fakePaper(2);
  words[0].own = 'url("#signature-white")';
  const light = new PaperInkLight(paper);
  light.update([.3, .2, .6], rest);
  assert.match(words[0].style.filter, /^url\("#signature-white"\) brightness\(/);
  assert.match(words[1].style.filter, /^brightness\(/);
  light.update(rest, rest);
  assert.deepEqual(words.map(word => word.style.filter), ['', '']);
});
