import { GRID, surfaceSpacing, THREADS, StitchModel, cellsBetween, keyOf, readStored, readLayout } from './model.mjs';
import { SurfaceRenderer } from './render.mjs';
import { cornerPattern, cornerPitch, cornerPositions, toStoredCell, toVisibleCell, seedMobileUpperCorners, cornerCellVisible, cornerEntranceGroups } from './corners.mjs';
import { TouchHold } from './touch-hold.mjs';
import { StitchWordmark } from './wordmark.mjs';
import { StitchEntrance } from './stitch-entrance.mjs';
import { PaperInteraction } from './paper-interaction.mjs';
import { DotClock } from './clock.mjs';

const $ = id => document.getElementById(id);
const surface = $('surface');
const controls = $('stitch-controls');
const storageKey = 'kruissteek.surface.v4-corners';
// Disposable preview sessions let us test without touching a visitor's work.
const scratch = new URLSearchParams(location.search).has('scratch');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let stored = null, storedRecord = null;
try { if (!scratch) { storedRecord = JSON.parse(localStorage.getItem(storageKey)); stored = readStored(storedRecord); } } catch { /* A fresh surface also works with storage disabled. */ }
const initial = cornerPattern();
const model = new StitchModel(seedMobileUpperCorners(stored ?? initial.entries, stored !== null && storedRecord?.mobileTopCorners === true), stored === null ? initial.layout : readLayout(storedRecord?.layout));
const renderer = new SurfaceRenderer($('cloth'), $('embroidery'), $('gesture'));
const cornerEntrance = new StitchEntrance({ started: performance.now(), reduced: motionPreference.matches });
cornerEntrance.plan(cornerEntranceGroups(initial.entries.filter(([key]) => model.stitches.has(key))));
const wordmark = new StitchWordmark($('wordmark'), (color, variation, progress) => renderer.sprite(color, variation, progress), { requestFrame, motionPreference });
const view = { x: 0, y: 0, scale: 1 };
const clock = new DotClock($('portfolio-clock'));
const animations = new Map();
let thread = 'garnet', mode = 'stitch';
let hover = null, frame = null, sceneDirty = true, clothDirty = true;
let painting = false, lastCell = null;
let keyboardMode = false, keyboardCell = [0, 0];
let corners = [];
const pointers = new Map();
let suppressTouch = false, activePointer = null;
let bird = null;
let cornersEntering = !motionPreference.matches;
const touchHold = new TouchHold(({ x, y }) => {
  activePointer = null;
  openControls(x, y);
});
const paper = new PaperInteraction(document.querySelector('.portfolio-frame'), { requestFrame, reduced: motionPreference.matches });

function announce(message) { $('announcement').textContent = message; }
function closeControls({ focus = false } = {}) {
  controls.hidden = true;
  document.body.classList.remove('controls-open');
  if (focus) surface.focus({ preventScroll: true });
}
function openControls(x, y) {
  paper.reset();
  touchHold.cancel();
  finishStroke();
  hover = null;
  controls.hidden = false;
  const { width, height } = controls.getBoundingClientRect();
  const left = x + width + 10 > innerWidth - 12 ? x - width - 10 : x + 10;
  const top = y + height + 10 > innerHeight - 12 ? y - height - 10 : y + 10;
  controls.style.left = `${Math.max(12, Math.min(left, innerWidth - width - 12))}px`;
  controls.style.top = `${Math.max(12, Math.min(top, innerHeight - height - 12))}px`;
  document.body.classList.add('controls-open');
  controls.querySelector('.selected').focus({ preventScroll: true });
  requestFrame();
}
function persist() {
  if (scratch) return;
  try { localStorage.setItem(storageKey, JSON.stringify({ version: 3, mobileTopCorners: true, layout: model.layout, stitches: [...model.stitches] })); }
  catch {
    $('canvas-help').textContent = 'Browser storage is unavailable. Your work will not persist after closing.';
  }
}
function updateControls() {
  $('undo').disabled = !model.undoStack.length;
  $('redo').disabled = !model.redoStack.length;
  const visibleCount = [...model.stitches.keys()].filter(key => cornerCellVisible(...key.split(',').map(Number), innerWidth)).length;
  $('stitch-count').textContent = `${visibleCount.toLocaleString()} stitch${visibleCount === 1 ? '' : 'es'}`;
  $('thread-name').textContent = mode === 'erase' ? 'Unpicking' : `${THREADS.find(t => t.id === thread).name} thread`;

}
function requestFrame({ cloth = false, stitches = false } = {}) {
  clothDirty ||= cloth;
  sceneDirty ||= stitches;
  if (!frame) frame = requestAnimationFrame(draw);
}
function draw(now) {
  frame = null;
  if (bird?.update(now)) sceneDirty = true;
  const wordmarkEntering = wordmark.update(now);
  const paperMoving = paper.update(now);
  const wasEntering = cornersEntering;
  cornersEntering = cornerEntrance.active(now);
  if (wasEntering || cornersEntering) sceneDirty = true;
  for (const [key, animation] of animations) {
    if (now - animation.started >= animation.duration) {
      animations.delete(key);
      sceneDirty = true;
    }
  }
  if (clothDirty) { renderer.drawCloth(view); clothDirty = false; }
  if (sceneDirty) { renderer.drawStitches(model, view, animations, bird?.cells, cornerEntrance, now); sceneDirty = false; }
  $('embroidery').dataset.entrance = cornersEntering ? 'stitching' : 'complete';
  renderer.drawInteraction(view, animations, hover, thread, mode, now, keyboardMode);
  if (animations.size || cornersEntering || wordmarkEntering || paperMoving || (bird && !bird.paused)) requestFrame();
}
function patternBounds() {
  return { width: Math.max(120, innerWidth - 64), height: Math.max(140, innerHeight - (innerWidth <= 540 ? 260 : 210)) };
}
function layoutSurface() {
  const bounds = patternBounds();
  view.scale = model.layout.mode === 'corners' ? cornerPitch(innerWidth) / GRID : surfaceSpacing(innerWidth) * Math.min(bounds.width / model.layout.columns, bounds.height / model.layout.rows) * model.layout.size / 100 / GRID;
  view.x = Math.round(innerWidth / 2);
  view.y = Math.round((innerHeight - (innerWidth <= 540 ? 130 : 80)) / 2);
  clock.resize(innerWidth, innerHeight, view);
  corners = model.layout.mode === 'corners' ? cornerPositions(innerWidth, innerHeight, view, GRID).slice(innerWidth <= 540 ? 0 : 2) : [];
  renderer.resolveCell = (col, row) => toVisibleCell(col, row, corners);
  renderer.isCellVisible = (col, row) => cornerCellVisible(col, row, innerWidth);
  updateControls();
  hover = null;
  requestFrame({ cloth: true, stitches: true });
}
function resize() {
  touchHold.cancel();
  closeControls();
  finishStroke();
  renderer.resize(innerWidth, innerHeight);
  layoutSurface();
  wordmark.resize(innerWidth, view);
  paper.resize();
  bird?.resize(renderer.width, renderer.height, view);
}
function position(x, y) {
  return { col: Math.floor((x - view.x) / (GRID * view.scale)), row: Math.floor((y - view.y) / (GRID * view.scale)), x, y };
}
function selectThread(id) {
  thread = id;
  for (const button of $('palette').children) button.setAttribute('aria-pressed', String(button.dataset.thread === id));
  setMode('stitch');
  announce(`${THREADS.find(t => t.id === id).name} thread selected.`);
}
function setMode(next) {
  finishStroke();
  mode = next;
  $('stitch-tool').classList.toggle('selected', next === 'stitch');
  $('erase-tool').classList.toggle('selected', next === 'erase');
  $('stitch-tool').setAttribute('aria-pressed', String(next === 'stitch'));
  $('erase-tool').setAttribute('aria-pressed', String(next === 'erase'));
  updateControls();
  requestFrame();
}

for (const [index, color] of THREADS.entries()) {
  const button = document.createElement('button');
  button.className = 'thread-swatch';
  button.style.setProperty('--thread', color.color);
  button.dataset.thread = color.id;
  button.setAttribute('aria-label', `${color.name} thread`);
  button.setAttribute('aria-pressed', String(color.id === thread));
  button.title = `${color.name} (${index + 1})`;
  button.addEventListener('click', () => selectThread(color.id));
  $('palette').append(button);
}

function place(col, row, delay = 0) {
  const pitch = GRID * view.scale;
  if (paper.contains(view.x + (col + .5) * pitch, view.y + (row + .5) * pitch)) return;
  [col, row] = toStoredCell(col, row, corners);
  const key = keyOf(col, row), previous = model.stitches.get(key);
  if (!model.put(col, row, mode === 'erase' ? undefined : thread)) return;
  cornerEntrance.complete(key);
  if (!motionPreference.matches) {
    animations.set(key, { color: mode === 'erase' ? previous : thread, started: performance.now() + delay, duration: 390, kind: mode === 'erase' ? 'erase' : 'add' });
  }
  requestFrame({ stitches: true });
  updateControls();
}
function paintTo(cell) {
  const next = [cell.col, cell.row];
  const cells = lastCell ? cellsBetween(lastCell, next) : [next];
  cells.forEach(([x, y], i) => place(x, y, Math.min(i * 9, 70)));
  lastCell = next;
}
function finishStroke() {
  if (!painting && !model.pending) return;
  painting = false;
  lastCell = null;
  model.commit();
  updateControls();
  persist();
}
function performHistory(direction) {
  finishStroke();
  if (!model[direction]()) return;
  layoutSurface();
  animations.clear();
  updateControls();
  persist();
  requestFrame({ stitches: true });
  announce(direction === 'undo' ? 'Last gesture undone.' : 'Last gesture redone.');
}

function startStrokeAt(x, y) {
  painting = true;
  model.begin();
  hover = position(x, y);
  paintTo(hover);
}

surface.addEventListener('pointerdown', event => {
  if (event.button !== 0 || (event.pointerType === 'mouse' && event.ctrlKey)) return;
  if (paper.contains(event.clientX, event.clientY)) {
    event.preventDefault();
    touchHold.cancel();
    finishStroke();
    hover = null;
    paper.press(event);
    surface.setPointerCapture(event.pointerId);
    requestFrame();
    return;
  }
  event.preventDefault();
  surface.focus({ preventScroll: true });
  keyboardMode = false;
  pointers.set(event.pointerId, true);
  surface.setPointerCapture(event.pointerId);
  if (pointers.size > 1 || suppressTouch) {
    touchHold.cancel();
    // Multi-touch does not move the cloth or leave a provisional first mark.
    if (model.pending) {
      for (const [key, before] of model.pending) {
        if (before === undefined) model.stitches.delete(key);
        else model.stitches.set(key, before);
      }
      model.pending = null;
    }
    suppressTouch = true;
    painting = false;
    lastCell = null;
    animations.clear();
    hover = null;
    updateControls();
    requestFrame({ stitches: true });
    return;
  }
  activePointer = event.pointerId;
  if (event.pointerType === 'touch') touchHold.begin(event.pointerId, event.clientX, event.clientY);
  else startStrokeAt(event.clientX, event.clientY);
});
surface.addEventListener('pointermove', event => {
  if (suppressTouch || !controls.hidden) return;
  if (paper.move(event.clientX, event.clientY, event.pointerType) || paper.ownsPointer(event.pointerId)) {
    touchHold.cancel();
    hover = null;
    lastCell = null;
    requestFrame();
    return;
  }
  if (touchHold.has(event.pointerId)) {
    const start = touchHold.move(event.pointerId, event.clientX, event.clientY);
    if (!start) return;
    startStrokeAt(start.x, start.y);
  }
  keyboardMode = false;
  hover = position(event.clientX, event.clientY);
  if (painting && event.pointerId === activePointer) paintTo(hover);
  requestFrame();
});
function pointerEnd(event) {
  if (paper.release(event)) { hover = null; requestFrame(); return; }
  const tap = touchHold.take(event.pointerId);
  if (tap && event.type === 'pointerup' && !suppressTouch && controls.hidden) startStrokeAt(tap.x, tap.y);
  pointers.delete(event.pointerId);
  if (!pointers.size) {
    suppressTouch = false;
    activePointer = null;
    finishStroke();
  }
  if (event.pointerType === 'touch' || event.type === 'pointercancel') hover = null;
  requestFrame();
}
surface.addEventListener('pointerup', pointerEnd);
surface.addEventListener('pointercancel', pointerEnd);
surface.addEventListener('lostpointercapture', event => {
  if (pointers.has(event.pointerId) || paper.ownsPointer(event.pointerId)) pointerEnd(event);
});
surface.addEventListener('pointerleave', () => { paper.leave(); if (!painting) { hover = null; requestFrame(); } });
surface.addEventListener('contextmenu', event => {
  event.preventDefault();
  openControls(event.clientX || innerWidth / 2, event.clientY || innerHeight / 2);
});
controls.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('pointerdown', event => {
  if (controls.hidden || controls.contains(event.target) || event.button === 2) return;
  closeControls({ focus: true });
  // Dismissing the panel is one action; it must not also place a stitch.
  event.preventDefault();
  event.stopPropagation();
}, true);

function keyboardPreview() {
  const step = GRID * view.scale;
  keyboardCell[0] = Math.max(Math.ceil(-view.x / step), Math.min(Math.floor((innerWidth - view.x) / step) - 1, keyboardCell[0]));
  keyboardCell[1] = Math.max(Math.ceil((70 - view.y) / step), Math.min(Math.floor((innerHeight - 160 - view.y) / step) - 1, keyboardCell[1]));
  const [col, row] = keyboardCell;
  const x = view.x + (col + .5) * step;
  const y = view.y + (row + .5) * step;
  hover = { col, row, x, y };
  requestFrame();
}
surface.addEventListener('keydown', event => {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    const step = GRID * view.scale;
    openControls(hover?.x ?? view.x + (keyboardCell[0] + .5) * step, hover?.y ?? view.y + (keyboardCell[1] + .5) * step);
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (moves[event.key]) {
    event.preventDefault();
    if (!keyboardMode && hover) keyboardCell = [hover.col, hover.row];
    keyboardMode = true;
    keyboardCell = keyboardCell.map((n, i) => n + moves[event.key][i]);
    keyboardPreview();
    const existing = model.stitches.get(keyOf(...toStoredCell(...keyboardCell, corners)));
    announce(`Column ${keyboardCell[0]}, row ${keyboardCell[1]}. ${existing ? `${THREADS.find(t => t.id === existing)?.name ?? existing} stitch.` : 'Bare cloth.'}`);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    keyboardMode = true;
    model.begin();
    place(...keyboardCell);
    model.commit();
    persist();
    updateControls();
    keyboardPreview();
    announce(mode === 'erase' ? 'Stitch unpicked.' : 'Stitch placed.');
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    const previous = mode;
    mode = 'erase';
    place(...keyboardCell);
    model.commit();
    mode = previous;
    persist();
    updateControls();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    paper.reset();
    touchHold.cancel();
    if (!controls.hidden) closeControls({ focus: true });
    hover = null;
    finishStroke();
    requestFrame();
  }
  if (event.target.matches('input, textarea, select, [contenteditable]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    performHistory(event.shiftKey ? 'redo' : 'undo');
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === 's') setMode('stitch');
  if (event.key.toLowerCase() === 'e') setMode('erase');
  if (/^[1-6]$/.test(event.key)) selectThread(THREADS[Number(event.key) - 1].id);
});
window.addEventListener('blur', () => {
  paper.reset();
  touchHold.cancel();
  closeControls();
  finishStroke();
  activePointer = null;
  suppressTouch = false;
  pointers.clear();
  hover = null;
  requestFrame();
});
document.addEventListener('visibilitychange', () => {
  bird?.suspend();
  if (document.hidden) {
    paper.reset();
    touchHold.cancel();
    closeControls();
    finishStroke();
  } else requestFrame({ stitches: true });
});
window.addEventListener('resize', resize);
motionPreference.addEventListener('change', event => {
  paper.setReducedMotion(event.matches);
  if (event.matches) {
    cornerEntrance.finish();
    wordmark.finishEntrance();
  }
  bird?.setPaused(event.matches);
  requestFrame({ stitches: true });
});

$('stitch-tool').addEventListener('click', () => setMode('stitch'));
$('erase-tool').addEventListener('click', () => setMode('erase'));
$('undo').addEventListener('click', () => performHistory('undo'));
$('redo').addEventListener('click', () => performHistory('redo'));

document.querySelector('.tool-tray').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...document.querySelectorAll('.tool-tray button:not(:disabled)')];
  const current = buttons.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus();
});
resize();
updateControls();

import('./bird.mjs').then(({ BirdFlight }) => {
  bird = new BirdFlight(renderer.width, renderer.height, view, {
    paused: motionPreference.matches,
  });
  requestFrame({ stitches: true });
}).catch(() => {});
