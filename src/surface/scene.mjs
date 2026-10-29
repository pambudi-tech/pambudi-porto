import { GRID, surfaceSpacing, StitchModel, keyOf } from '../stitch/model.mjs';
import { SurfaceRenderer } from '../stitch/render.mjs';
import { cornerPattern, cornerPitch, cornerPositions, surfaceOrigin, toStoredCell, toVisibleCell, cornerCellVisible, cornerEntranceGroups } from '../stitch/corners.mjs';
import { TouchHold } from '../stitch/touch-hold.mjs';
import { StitchWordmark } from '../stitch/wordmark.mjs';
import { StitchEntrance } from '../stitch/stitch-entrance.mjs';
import { StitchUnpick, BRAND_UNPICK_SWEEP, UNPICK_STITCH } from '../stitch/stitch-unpick.mjs';
import { MotifBag, stampMotif } from '../stitch/motifs.mjs';
import { MotifLifetimes } from '../stitch/motif-lifetime.mjs';
import { FreeStitch } from '../stitch/free-stitch.mjs';
import { SurfaceCamera, mountSurfaceNavigation } from '../stitch/surface-zoom.mjs';
import { MOTIF_HINT_COLOR } from '../stitch/thread-colors.mjs';
import { PaperInteraction } from '../paper/paper-interaction.mjs';
import { PaperFlip } from '../paper/paper-flip.mjs';
import { setupEmailCopy } from '../paper/contact-links.mjs';
import { mountPaperTextContour, mountAboutTextMask } from '../paper/paper-text-contour.mjs';
import { WaxInteraction } from '../wax/wax-interaction.mjs';
import { BirdFlight } from '../bird/bird.mjs';
import { IntroInkHover } from '../ink/intro-ink-hover.mjs';
import { settleWithin } from '../preloader/loading-progress.mjs';
import { isPhone } from '../shared/breakpoints.mjs';
import { mountStitchControls } from './stitch-controls.mjs';
import { mountSurfaceInput } from './surface-input.mjs';

// The stitch surface behind every page: cloth, embroidery, corner ornaments,
// wordmark, bird, and on the homepage, the paper. This module owns the state
// and the frame loop; stitch-controls.mjs and surface-input.mjs handle the
// panel and the pointer and keyboard through the shared `scene` object.
//
// `stitching: false` leaves the cloth to look at: no motifs, free stitch or
// stitch controls, by pointer or keyboard.
export async function preparePortfolio({ clock, surfaceOnly = false, surfaceNavigation = true, stitching = true } = {}) {
  let running = false, releaseEntrance;
  const startWhen = new Promise(resolve => { releaseEntrance = resolve; });
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const $ = id => document.getElementById(id);
  const surface = $('surface');
  if (!stitching) surface.dataset.stitching = 'off';
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const announce = message => { $('announcement').textContent = message; };
  const copy = document.querySelector('.paper-copy');
  if (!surfaceOnly) {
    setupEmailCopy(copy.querySelector('[data-email]'), { announce });
    new IntroInkHover(copy, motionPreference);
    await mountPaperTextContour(copy);
    await mountAboutTextMask(document.querySelector('.about-resume'));
  }
  // Every page load starts with the original ornaments and no visitor motifs.
  // Motif history belongs only to this visit; no saved embroidery is restored.
  const initial = cornerPattern();
  const model = new StitchModel(surfaceOnly ? [] : initial.entries, initial.layout);
  const renderer = new SurfaceRenderer($('cloth'), $('embroidery'), $('gesture'));
  const cornerEntrance = new StitchEntrance({ started: Infinity, reduced: motionPreference.matches });
  let brandingDeparture = null;
  const cornerVisibility = { progress: (key, now) => cornerEntrance.progress(key, now) * (brandingDeparture?.progress(key, now) ?? 1) };
  cornerEntrance.plan(cornerEntranceGroups(initial.entries.filter(([key]) => model.stitches.has(key))));
  const wordmark = surfaceOnly ? null : new StitchWordmark($('wordmark'), (color, variation, progress) => renderer.sprite(color, variation, progress), { requestFrame, motionPreference, entranceStarted: Infinity });
  const view = { x: 0, y: 0, scale: 1 };
  const camera = surfaceOnly ? new SurfaceCamera(view) : null;
  const animations = new Map();
  const motifLifetimes = new MotifLifetimes(model, animations);
  let motifExpiryTimer = null;
  const motifBag = new MotifBag();
  let frame = null, sceneDirty = true, clothDirty = true;
  let corners = [];
  let bird = null;
  let cornersEntering = !motionPreference.matches;
  let worksMessage = '';
  const touchHold = new TouchHold(({ x, y }) => {
    scene.cancelTap();
    scene.controls.open(x, y);
  });
  const sheet = surfaceOnly ? null : new PaperInteraction(document.querySelector('#surface .portfolio-paper'), {
    requestFrame, reduced: motionPreference.matches, placementMirror: document.querySelector('.preloader-paper'),
  });
  const paperFlip = surfaceOnly ? null : new PaperFlip(sheet.element, {
    reduced: motionPreference.matches,
    onStart: () => sheet.setFlipping(true),
    onFinish: () => sheet.setFlipping(false),
  });
  const waxes = [...document.querySelectorAll('.works-seal')]
    .map(element => new WaxInteraction(element, motionPreference, { startWhen }));
  const freeStitch = new FreeStitch(model, animations, {
    resolveCell: (col, row, tool) => tool === 'unpick' ? toStoredCell(col, row, corners) : [col, row],
    canPlace(col, row, tool) {
      const step = GRID * view.scale;
      const x = view.x + (col + .5) * step, y = view.y + (row + .5) * step;
      const stored = toStoredCell(col, row, corners);
      return x >= 0 && y >= 0 && x < innerWidth && y < innerHeight
        && !scene.paper?.contains(x, y)
        && (tool === 'unpick' || stored[0] === col || !model.stitches.has(keyOf(...stored)));
    },
  });

  // What the controls and input modules share with the scene.
  const scene = {
    surface, view, model, freeStitch, motifLifetimes, touchHold, motionPreference, surfaceOnly, stitching,
    // While the paper is lifted off for the works gallery, it is out of reach.
    paper: sheet,
    hover: null, activeTap: null, stitchMode: 'motif', freePointer: null,
    keyboardMode: false, keyboardCell: [0, 0], pointers: new Map(), suppressTouch: false,
    controls: null,
    announce, requestFrame, position, freeCell, stitchAt, performHistory,
    finishFreeStitch() {
      freeStitch.finish();
      scene.freePointer = null;
    },
    cancelTap() {
      scene.activeTap = null;
      touchHold.cancel();
    },
  };
  scene.controls = mountStitchControls(scene, { signal });

  function stitchAt(x, y) {
    if (!stitching || scene.paper?.contains(x, y)) return;
    if (scene.stitchMode === 'motif') return stampAt(x, y);
    freeStitch.begin(freeCell(x, y), performance.now(), motionPreference.matches);
    scene.finishFreeStitch();
    scene.controls.update();
    requestFrame({ stitches: true });
    announce(freeStitch.tool === 'unpick' ? 'Stitch removed.' : 'Stitch added.');
  }
  function requestFrame({ cloth = false, stitches = false } = {}) {
    if (!running) return;
    clothDirty ||= cloth;
    sceneDirty ||= stitches;
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function draw(now) {
    frame = null;
    if (motifLifetimes.update(now, motionPreference.matches)) {
      sceneDirty = true;
      scene.controls.update();
      scheduleMotifExpiry();
    }
    if (bird?.update(now)) sceneDirty = true;
    // Recheck the moving silhouette every frame, including when the pointer
    // stays still and the dove flies beneath it or moves away.
    const { hover } = scene;
    const birdCell = hover && !scene.keyboardMode && !scene.controls.isOpen ? bird?.hitTest(hover.x, hover.y) : null;
    const birdCovered = birdCell && model.stitches.has(keyOf(...toStoredCell(birdCell.col, birdCell.row, corners)));
    clock?.setMessage(birdCell && !birdCovered ? bird.hoverMessage(hover.x, hover.y) : worksMessage);
    const wordmarkEntering = wordmark?.update(now);
    const paperMoving = scene.paper?.update(now);
    const wasEntering = cornersEntering;
    cornersEntering = cornerEntrance.active(now) || Boolean(brandingDeparture?.active(now));
    if (wasEntering || cornersEntering) sceneDirty = true;
    for (const [key, animation] of animations) {
      if (now - animation.started >= animation.duration) {
        animations.delete(key);
        sceneDirty = true;
      }
    }
    if (animations.size) sceneDirty = true;
    if (clothDirty) { renderer.drawCloth(view); clothDirty = false; }
    if (sceneDirty) { renderer.drawStitches(model, view, animations, bird?.cells, cornerVisibility, now); sceneDirty = false; }
    $('embroidery').dataset.entrance = cornersEntering ? 'stitching' : 'complete';
    const free = scene.stitchMode === 'free', unpicking = free && freeStitch.tool === 'unpick';
    renderer.drawInteraction(view, animations, hover, free ? freeStitch.color : MOTIF_HINT_COLOR, unpicking ? 'unpick' : 'motif', now, scene.keyboardMode);
    if (animations.size || cornersEntering || wordmarkEntering || paperMoving || (bird && !bird.paused)) requestFrame();
  }
  function patternBounds() {
    return { width: Math.max(120, innerWidth - 64), height: Math.max(140, innerHeight - (isPhone(innerWidth) ? 260 : 210)) };
  }
  function layoutSurface() {
    const bounds = patternBounds();
    if (camera) camera.resize(innerWidth, innerHeight, cornerPitch(innerWidth) / GRID);
    else {
      view.scale = model.layout.mode === 'corners' ? cornerPitch(innerWidth) / GRID : surfaceSpacing(innerWidth) * Math.min(bounds.width / model.layout.columns, bounds.height / model.layout.rows) * model.layout.size / 100 / GRID;
      Object.assign(view, surfaceOrigin(innerWidth, innerHeight));
    }
    clock?.resize(innerWidth, innerHeight, view);
    corners = !surfaceOnly && model.layout.mode === 'corners' ? cornerPositions(innerWidth, innerHeight, view, GRID).slice(2) : [];
    renderer.resolveCell = (col, row) => toVisibleCell(col, row, corners);
    renderer.isCellVisible = surfaceOnly ? null : (col, row) => cornerCellVisible(col, row, innerWidth);
    scene.controls.update();
    scene.hover = null;
    requestFrame({ cloth: true, stitches: true });
  }
  function resize() {
    scene.finishFreeStitch();
    touchHold.cancel();
    scene.controls.close();
    scene.cancelTap();
    renderer.resize(innerWidth, innerHeight);
    layoutSurface();
    wordmark?.resize(innerWidth, view);
    sheet?.resize();
    bird?.resize(renderer.width, renderer.height, view);
  }
  function position(x, y) {
    return { col: Math.floor((x - view.x) / (GRID * view.scale)), row: Math.floor((y - view.y) / (GRID * view.scale)), x, y };
  }
  function freeCell(x, y) {
    const { col, row } = position(x, y);
    return [col, row];
  }
  function stampAt(x, y) {
    if (scene.paper?.contains(x, y)) return;
    const { col, row } = position(x, y);
    const motif = motifBag.next();
    const next = stampMotif(model, motif.id, {
      col, row,
      seed: Math.floor(Math.random() * 10000),
      started: performance.now(),
      reduced: motionPreference.matches,
      onStamp(transaction, cells, started) {
        motifLifetimes.add(transaction, cells, started);
        scheduleMotifExpiry();
      },
      canPlace(col, row) {
        // Keep ornament stitches in their anchored slots. Motif cells keep
        // ordinary world coordinates so a resize cannot split a motif apart.
        const stored = toStoredCell(col, row, corners);
        return stored[0] === col || !model.stitches.has(keyOf(...stored));
      },
    });
    for (const [key, animation] of next) animations.set(key, animation);
    scene.controls.update();
    requestFrame({ stitches: true });
    announce(`${motif.name} stitched.`);
  }
  function scheduleMotifExpiry() {
    clearTimeout(motifExpiryTimer);
    const deadline = motifLifetimes.nextExpiry;
    motifExpiryTimer = Number.isFinite(deadline)
      ? setTimeout(() => requestFrame({ stitches: true }), Math.max(1, Math.ceil(deadline - performance.now())))
      : null;
  }
  function performHistory(direction) {
    scene.finishFreeStitch();
    scene.cancelTap();
    if (!model[direction]()) return;
    if (!surfaceOnly) layoutSurface();
    animations.clear();
    scene.controls.update();
    requestFrame({ stitches: true });
    announce(direction === 'undo' ? 'Last action undone.' : 'Last action redone.');
  }

  if (camera && surfaceNavigation) mountSurfaceNavigation(surface, camera, {
    onStart() {
      scene.finishFreeStitch();
      scene.cancelTap();
      scene.controls.close();
      scene.pointers.clear();
      scene.hover = null;
      scene.controls.update();
      requestFrame({ stitches: true });
    },
    onChange() {
      scene.hover = null;
      requestFrame({ cloth: true, stitches: true });
    },
  });
  mountSurfaceInput(scene, { signal });

  document.addEventListener('visibilitychange', () => {
    bird?.suspend();
    if (document.hidden) {
      scene.hover = null;
      clock?.setMessage('');
      scene.finishFreeStitch();
      scene.paper?.reset();
      touchHold.cancel();
      scene.controls.close();
      scene.cancelTap();
    } else requestFrame({ stitches: true });
  }, { signal });
  window.addEventListener('resize', resize, { signal });
  motionPreference.addEventListener('change', event => {
    sheet?.setReducedMotion(event.matches);
    paperFlip?.setReducedMotion(event.matches);
    if (event.matches) {
      cornerEntrance.finish();
      wordmark?.finishEntrance();
      animations.clear();
    }
    bird?.setPaused(event.matches);
    requestFrame({ stitches: true });
  }, { signal });

  resize();
  scene.controls.update();

  await Promise.allSettled([sheet?.ready, wordmark?.ready, ...waxes.map(wax => wax.ready)].map(task => settleWithin(task)));
  renderer.drawCloth(view);
  clothDirty = false;
  return {
    start() {
      if (running) return;
      const now = performance.now();
      cornerEntrance.started = now;
      if (wordmark?.entrance) wordmark.entrance.started = now;
      sheet?.place(now);
      if (!surfaceOnly) bird = new BirdFlight(renderer.width, renderer.height, view, { paused: motionPreference.matches });
      running = true;
      releaseEntrance(now);
      requestFrame({ stitches: true });
    },
    view,
    pause() {
      running = false;
      bird?.suspend();
      if (frame) cancelAnimationFrame(frame);
      frame = null;
    },
    resume() {
      running = true;
      requestFrame({ cloth: true, stitches: true });
    },
    unpickBranding() {
      const started = performance.now();
      cornerEntrance.finish();
      brandingDeparture = new StitchUnpick(cornerEntranceGroups(initial.entries), { started, reduced: motionPreference.matches });
      wordmark?.unpick(started, motionPreference.matches);
      bird?.setVisible(false, { duration: BRAND_UNPICK_SWEEP + UNPICK_STITCH });
      scene.hover = null;
      requestFrame({ stitches: true });
    },
    // Unpicks every stitch a visitor added, motifs and free stitch alike, back
    // to the cloth's own ornaments, and forgets them: undo cannot bring them back.
    unpickVisitorStitches() {
      scene.finishFreeStitch();
      if (scene.controls.isOpen) scene.controls.close();
      const original = new Map(initial.entries), started = performance.now();
      const changed = [...model.stitches].filter(([key, color]) => original.get(key) !== color)
        .concat([...original].filter(([key]) => !model.stitches.has(key)).map(([key]) => [key, undefined]));
      // A quick sweep across the cloth, left to right.
      const order = changed.map(([key]) => Number(key.split(',')[0]));
      const low = Math.min(...order), span = Math.max(1, Math.max(...order) - low);
      for (const [key, color] of changed) {
        const before = original.get(key);
        if (before === undefined) model.stitches.delete(key);
        else model.stitches.set(key, before);
        if (color === undefined || motionPreference.matches) continue;
        animations.set(key, {
          kind: 'unpick', color, from: 1, revealUnderneath: true,
          started: started + (Number(key.split(',')[0]) - low) / span * BRAND_UNPICK_SWEEP * .5,
          duration: UNPICK_STITCH,
        });
      }
      model.undoStack = [];
      model.redoStack = [];
      motifLifetimes.records.clear();
      motifLifetimes.journal.clear();
      scene.controls.update();
      requestFrame({ stitches: true });
    },
    restoreBranding({ animate = false } = {}) {
      const started = performance.now();
      if (animate && brandingDeparture) brandingDeparture.reverse(started);
      else brandingDeparture = null;
      wordmark?.restore(animate, started);
      bird?.setVisible(true, { immediate: !animate || motionPreference.matches });
      requestFrame({ stitches: true });
    },
    setPaperPresent(present) {
      sheet?.reset();
      // Pause the paper's pointer lighting while it is turned away.
      sheet?.setFlipping(!present);
      scene.paper = present ? sheet : null;
      scene.hover = null;
      requestFrame();
    },
    setMessage(message = '') {
      worksMessage = message;
      clock?.setMessage(message);
      requestFrame();
    },
    // Stops drawing and removes every listener the scene added.
    destroy() {
      running = false;
      bird?.suspend();
      cancelAnimationFrame(frame);
      frame = null;
      clearTimeout(motifExpiryTimer);
      lifetime.abort();
    },
  };
}
