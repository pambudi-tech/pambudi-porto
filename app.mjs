import { GRID, surfaceSpacing, StitchModel, keyOf } from './model.mjs';
import { SurfaceRenderer } from './render.mjs';
import { cornerPattern, cornerPitch, cornerPositions, toStoredCell, toVisibleCell, cornerCellVisible, cornerEntranceGroups } from './corners.mjs';
import { TouchHold } from './touch-hold.mjs';
import { StitchWordmark } from './wordmark.mjs';
import { StitchEntrance } from './stitch-entrance.mjs';
import { PaperInteraction } from './paper-interaction.mjs';
import { WaxInteraction } from './wax-interaction.mjs';
import { DotClock } from './clock.mjs';
import { paperInkEntrance } from './paper-ink.mjs';
import { IntroInkHover } from './intro-ink-hover.mjs';
import { MotifBag, stampMotif, randomMotifRotation } from './motifs.mjs';
import { FreeStitch, FREE_THREADS } from './free-stitch.mjs';
import { StitchPanel } from './stitch-panel.mjs';

const $ = id => document.getElementById(id);
const surface = $('surface');
const controls = $('stitch-controls');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const panel = new StitchPanel(controls, motionPreference);
paperInkEntrance(document.querySelector('.paper-copy'), { motionPreference });
new IntroInkHover(document.querySelector('.paper-copy'), motionPreference);
// Every page load starts with the original ornaments and no visitor motifs.
// Motif history belongs only to this visit; no saved embroidery is restored.
const initial = cornerPattern();
const model = new StitchModel(initial.entries, initial.layout);
const renderer = new SurfaceRenderer($('cloth'), $('embroidery'), $('gesture'));
const cornerEntrance = new StitchEntrance({ started: performance.now(), reduced: motionPreference.matches });
cornerEntrance.plan(cornerEntranceGroups(initial.entries.filter(([key]) => model.stitches.has(key))));
const wordmark = new StitchWordmark($('wordmark'), (color, variation, progress) => renderer.sprite(color, variation, progress), { requestFrame, motionPreference });
const view = { x: 0, y: 0, scale: 1 };
const clock = new DotClock($('portfolio-clock'));
const animations = new Map();
const motifBag = new MotifBag();
let hover = null, frame = null, sceneDirty = true, clothDirty = true;
let activeTap = null;
let stitchMode = 'motif', freePointer = null;
let keyboardMode = false, keyboardCell = [0, 0];
let corners = [];
const pointers = new Map();
let suppressTouch = false;
let bird = null;
let cornersEntering = !motionPreference.matches;
const touchHold = new TouchHold(({ x, y }) => {
  cancelTap();
  openControls(x, y);
});
const paper = new PaperInteraction(document.querySelector('.portfolio-paper'), { requestFrame, reduced: motionPreference.matches });
const waxSeal = document.querySelector('.works-seal');
new WaxInteraction(waxSeal, motionPreference);
const freeStitch = new FreeStitch(model, animations, {
  resolveCell: (col, row, tool) => tool === 'unpick' ? toStoredCell(col, row, corners) : [col, row],
  canPlace(col, row, tool) {
    const step = GRID * view.scale;
    const x = view.x + (col + .5) * step, y = view.y + (row + .5) * step;
    const stored = toStoredCell(col, row, corners);
    return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight
      && !paper.contains(x, y)
      && (tool === 'unpick' || stored[0] === col || !model.stitches.has(keyOf(...stored)));
  },
});
for (const { name, color } of FREE_THREADS) {
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'thread-swatch';
  swatch.style.setProperty('--thread-color', color);
  swatch.setAttribute('aria-label', name);
  swatch.title = name;
  swatch.dataset.color = color;
  swatch.addEventListener('click', () => {
    finishFreeStitch();
    freeStitch.color = color;
    freeStitch.tool = 'stitch';
    updateControls();
    announce(`${name} thread selected.`);
  });
  document.querySelector('.thread-palette').append(swatch);
}

function finishFreeStitch() {
  freeStitch.finish();
  freePointer = null;
}
function freeCell(x, y) {
  const { col, row } = position(x, y);
  return [col, row];
}
function stitchAt(x, y) {
  if (paper.contains(x, y)) return;
  if (stitchMode === 'motif') return stampAt(x, y);
  freeStitch.begin(freeCell(x, y), performance.now(), motionPreference.matches);
  finishFreeStitch();
  updateControls();
  requestFrame({ stitches: true });
  announce(freeStitch.tool === 'unpick' ? 'Stitch removed.' : 'Stitch added.');
}

function announce(message) { $('announcement').textContent = message; }
function closeControls({ focus = false } = {}) {
  panel.close();
  document.body.classList.remove('controls-open');
  if (focus) surface.focus({ preventScroll: true });
}
function openControls(x, y) {
  finishFreeStitch();
  updateControls();
  paper.reset();
  touchHold.cancel();
  cancelTap();
  hover = null;
  panel.open(x, y);
  document.body.classList.add('controls-open');
  controls.querySelector('.selected').focus({ preventScroll: true });
  requestFrame();
}
function updateControls() {
  $('undo').disabled = !model.undoStack.length;
  $('redo').disabled = !model.redoStack.length;
  for (const [id, mode] of [['motif-tool', 'motif'], ['free-tool', 'free']]) {
    $(id).classList.toggle('selected', stitchMode === mode);
    $(id).setAttribute('aria-pressed', String(stitchMode === mode));
  }
  controls.dataset.mode = stitchMode;
  $('free-options').inert = stitchMode !== 'free';
  $('free-options').setAttribute('aria-hidden', String(stitchMode !== 'free'));
  $('unpick-tool').setAttribute('aria-checked', String(freeStitch.tool === 'unpick'));
  document.querySelector('.thread-palette').classList.toggle('is-muted', freeStitch.tool === 'unpick');
  for (const swatch of document.querySelectorAll('.thread-swatch')) {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.color === freeStitch.color));
  }
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
  if (animations.size) sceneDirty = true;
  if (clothDirty) { renderer.drawCloth(view); clothDirty = false; }
  if (sceneDirty) { renderer.drawStitches(model, view, animations, bird?.cells, cornerEntrance, now); sceneDirty = false; }
  $('embroidery').dataset.entrance = cornersEntering ? 'stitching' : 'complete';
  const unpicking = stitchMode === 'free' && freeStitch.tool === 'unpick';
  renderer.drawInteraction(view, animations, hover, stitchMode === 'free' ? freeStitch.color : '#8d7560', unpicking ? 'unpick' : 'motif', now, keyboardMode);
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
  corners = model.layout.mode === 'corners' ? cornerPositions(innerWidth, innerHeight, view, GRID).slice(2) : [];
  renderer.resolveCell = (col, row) => toVisibleCell(col, row, corners);
  renderer.isCellVisible = (col, row) => cornerCellVisible(col, row, innerWidth);
  updateControls();
  hover = null;
  requestFrame({ cloth: true, stitches: true });
}
function resize() {
  finishFreeStitch();
  touchHold.cancel();
  closeControls();
  cancelTap();
  renderer.resize(innerWidth, innerHeight);
  layoutSurface();
  wordmark.resize(innerWidth, view);
  paper.resize();
  bird?.resize(renderer.width, renderer.height, view);
}
function position(x, y) {
  return { col: Math.floor((x - view.x) / (GRID * view.scale)), row: Math.floor((y - view.y) / (GRID * view.scale)), x, y };
}
function stampAt(x, y) {
  if (paper.contains(x, y)) return;
  const { col, row } = position(x, y);
  const motif = motifBag.next();
  const next = stampMotif(model, motif.id, {
    col, row,
    rotation: randomMotifRotation(),
    seed: Math.floor(Math.random() * 10000),
    started: performance.now(),
    reduced: motionPreference.matches,
    canPlace(col, row) {
      // Keep ornament stitches in their anchored slots. Motif cells keep
      // ordinary world coordinates so a resize cannot split a motif apart.
      const stored = toStoredCell(col, row, corners);
      return stored[0] === col || !model.stitches.has(keyOf(...stored));
    },
  });
  for (const [key, animation] of next) animations.set(key, animation);
  updateControls();
  requestFrame({ stitches: true });
  announce(`${motif.name} stitched.`);
}
function cancelTap() {
  activeTap = null;
  touchHold.cancel();
}
function performHistory(direction) {
  finishFreeStitch();
  cancelTap();
  if (!model[direction]()) return;
  layoutSurface();
  animations.clear();
  updateControls();
  requestFrame({ stitches: true });
  announce(direction === 'undo' ? 'Last action undone.' : 'Last action redone.');
}

surface.addEventListener('pointerdown', event => {
  if (event.target.closest('.paper-copy')) return;
  if (event.target.closest('.works-seal')) return;
  if (event.button !== 0 || (event.pointerType === 'mouse' && event.ctrlKey)) return;
  event.preventDefault();
  pointers.set(event.pointerId, true);
  surface.setPointerCapture(event.pointerId);
  if (pointers.size > 1 || suppressTouch) {
    finishFreeStitch();
    updateControls();
    cancelTap();
    paper.reset();
    suppressTouch = true;
    hover = null;
    requestFrame();
    return;
  }
  surface.focus({ preventScroll: true });
  keyboardMode = false;
  if (paper.contains(event.clientX, event.clientY)) {
    cancelTap();
    hover = null;
    paper.press(event);
    requestFrame();
    return;
  }
  activeTap = { id: event.pointerId, x: event.clientX, y: event.clientY };
  if (event.pointerType === 'touch') touchHold.begin(event.pointerId, event.clientX, event.clientY);
});
surface.addEventListener('pointermove', event => {
  if (event.buttons && document.querySelector('.paper-copy.ink-selecting')) return;
  if (suppressTouch || panel.isOpen) return;
  if (activeTap?.id === event.pointerId && Math.hypot(event.clientX - activeTap.x, event.clientY - activeTap.y) > 8) {
    if (stitchMode === 'free') {
      freePointer = event.pointerId;
      freeStitch.begin(freeCell(activeTap.x, activeTap.y), performance.now(), motionPreference.matches);
    }
    cancelTap();
  }
  if (paper.move(event.clientX, event.clientY, event.pointerType) || paper.ownsPointer(event.pointerId)) {
    cancelTap();
    freeStitch.pause();
    hover = null;
    requestFrame({ stitches: freeStitch.active });
    return;
  }
  if (freePointer === event.pointerId) {
    freeStitch.move(freeCell(event.clientX, event.clientY), performance.now(), motionPreference.matches);
    requestFrame({ stitches: true });
  }
  keyboardMode = false;
  hover = event.pointerType === 'touch' ? null : position(event.clientX, event.clientY);
  requestFrame();
});
function pointerEnd(event) {
  const releasedPaper = paper.release(event);
  if (freePointer === event.pointerId) {
    if (event.type === 'pointerup' && !paper.contains(event.clientX, event.clientY)) {
      freeStitch.move(freeCell(event.clientX, event.clientY), performance.now(), motionPreference.matches);
    }
    finishFreeStitch();
    updateControls();
    requestFrame({ stitches: true });
  }
  const tap = activeTap?.id === event.pointerId ? activeTap : null;
  if (tap) cancelTap();
  pointers.delete(event.pointerId);
  if (tap && event.type === 'pointerup' && !releasedPaper && !suppressTouch && !panel.isOpen
      && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 8
      && !paper.contains(event.clientX, event.clientY)) stitchAt(tap.x, tap.y);
  if (!pointers.size) suppressTouch = false;
  if (releasedPaper || event.pointerType === 'touch' || event.type === 'pointercancel') hover = null;
  requestFrame();
}
surface.addEventListener('pointerup', pointerEnd);
surface.addEventListener('pointercancel', pointerEnd);
surface.addEventListener('lostpointercapture', event => {
  if (pointers.has(event.pointerId) || paper.ownsPointer(event.pointerId)) pointerEnd(event);
});
surface.addEventListener('pointerleave', () => { paper.leave(); freeStitch.pause(); hover = null; requestFrame(); });
surface.addEventListener('contextmenu', event => {
  if (event.target.closest('.paper-copy')) return;
  event.preventDefault();
  if (event.target.closest('.works-seal') || paper.contains(event.clientX, event.clientY)) return;
  openControls(event.clientX || innerWidth / 2, event.clientY || innerHeight / 2);
});
controls.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('pointerdown', event => {
  if (!panel.isOpen || controls.contains(event.target) || event.button === 2) return;
  closeControls({ focus: true });
  // Dismissing the panel is one action; it must not also stitch a motif.
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
  if (event.target.closest('.works-seal')) return;
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
    announce(`Column ${keyboardCell[0]}, row ${keyboardCell[1]}. Press Enter to ${stitchMode === 'motif' ? 'stitch a motif' : freeStitch.tool === 'unpick' ? 'unstitch' : 'add a stitch'}.`);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (event.repeat) return;
    keyboardMode = true;
    keyboardPreview();
    stitchAt(hover.x, hover.y);
  }

});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    finishFreeStitch();
    updateControls();
    paper.reset();
    touchHold.cancel();
    if (panel.isOpen) closeControls({ focus: true });
    hover = null;
    cancelTap();
    requestFrame();
  }
  if (event.target.matches('input, textarea, select, [contenteditable]')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    performHistory(event.shiftKey ? 'redo' : 'undo');
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;

});
window.addEventListener('blur', () => {
  finishFreeStitch();
  paper.reset();
  touchHold.cancel();
  closeControls();
  cancelTap();
  suppressTouch = false;
  pointers.clear();
  hover = null;
  requestFrame();
});
document.addEventListener('visibilitychange', () => {
  bird?.suspend();
  if (document.hidden) {
    finishFreeStitch();
    paper.reset();
    touchHold.cancel();
    closeControls();
    cancelTap();
  } else requestFrame({ stitches: true });
});
window.addEventListener('resize', resize);
motionPreference.addEventListener('change', event => {
  paper.setReducedMotion(event.matches);
  if (event.matches) {
    cornerEntrance.finish();
    wordmark.finishEntrance();
    animations.clear();
  }
  bird?.setPaused(event.matches);
  requestFrame({ stitches: true });
});

for (const [id, mode] of [['motif-tool', 'motif'], ['free-tool', 'free']]) {
  $(id).addEventListener('click', () => {
    finishFreeStitch();
    cancelTap();
    stitchMode = mode;
    updateControls();
    announce(mode === 'motif' ? 'Motif selected. Click to stitch a random motif.' : 'Free stitch selected. Click or drag to draw stitches.');
    requestFrame();
  });
}
$('unpick-tool').addEventListener('click', () => {
  finishFreeStitch();
  freeStitch.tool = freeStitch.tool === 'unpick' ? 'stitch' : 'unpick';
  updateControls();
  announce(freeStitch.tool === 'unpick' ? 'Unpick on. Click or drag to remove stitches.' : 'Unpick off. Click or drag to draw.');
});
$('undo').addEventListener('click', () => performHistory('undo'));
$('redo').addEventListener('click', () => performHistory('redo'));

document.querySelector('.tool-tray').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...document.querySelectorAll('.tool-tray button:not(:disabled)')].filter(button => !button.closest('[inert]'));
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
