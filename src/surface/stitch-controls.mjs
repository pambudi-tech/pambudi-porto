import { FREE_THREADS } from '../stitch/free-stitch.mjs';
import { StitchPanel } from '../stitch/stitch-panel.mjs';

// The white stitch panel: Motif / Free stitch, thread colors, Unpick, and
// undo/redo. It reads and changes the scene's shared state (see scene.mjs).
export function mountStitchControls(scene, { signal }) {
  const $ = id => document.getElementById(id);
  const controls = $('stitch-controls');
  const palette = controls.querySelector('.thread-palette');
  const panel = new StitchPanel(controls, scene.motionPreference);
  const { freeStitch } = scene;

  for (const { name, color } of FREE_THREADS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'thread-swatch';
    swatch.style.setProperty('--thread-color', color);
    swatch.setAttribute('aria-label', name);
    swatch.title = name;
    swatch.dataset.color = color;
    swatch.addEventListener('click', () => {
      scene.finishFreeStitch();
      freeStitch.color = color;
      freeStitch.tool = 'stitch';
      update();
      scene.announce(`${name} thread selected.`);
    }, { signal });
    palette.append(swatch);
  }

  function update() {
    scene.motifLifetimes.syncHistory();
    $('undo').disabled = !scene.model.undoStack.length;
    $('redo').disabled = !scene.model.redoStack.length;
    for (const [id, mode] of [['motif-tool', 'motif'], ['free-tool', 'free']]) {
      $(id).classList.toggle('selected', scene.stitchMode === mode);
      $(id).setAttribute('aria-pressed', String(scene.stitchMode === mode));
    }
    controls.dataset.mode = scene.stitchMode;
    $('free-options').inert = scene.stitchMode !== 'free';
    $('free-options').setAttribute('aria-hidden', String(scene.stitchMode !== 'free'));
    $('unpick-tool').setAttribute('aria-checked', String(freeStitch.tool === 'unpick'));
    palette.classList.toggle('is-muted', freeStitch.tool === 'unpick');
    for (const swatch of palette.querySelectorAll('.thread-swatch')) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.color === freeStitch.color));
    }
  }
  function close({ focus = false } = {}) {
    panel.close();
    document.body.classList.remove('controls-open');
    if (focus) scene.surface.focus({ preventScroll: true });
  }
  function open(x, y) {
    if (!scene.stitching) return;
    scene.finishFreeStitch();
    update();
    scene.paper?.reset();
    scene.touchHold.cancel();
    scene.cancelTap();
    scene.hover = null;
    panel.open(x, y);
    document.body.classList.add('controls-open');
    controls.querySelector('.selected').focus({ preventScroll: true });
    scene.requestFrame();
  }

  controls.addEventListener('contextmenu', event => event.preventDefault(), { signal });
  document.addEventListener('pointerdown', event => {
    if (!panel.isOpen || controls.contains(event.target) || event.button === 2) return;
    close({ focus: true });
    // Dismissing the panel is one action; it must not also stitch a motif.
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true, signal });

  for (const [id, mode] of [['motif-tool', 'motif'], ['free-tool', 'free']]) {
    $(id).addEventListener('click', () => {
      scene.finishFreeStitch();
      scene.cancelTap();
      scene.stitchMode = mode;
      update();
      scene.announce(mode === 'motif' ? 'Motif selected. Click to stitch a random motif.' : 'Free stitch selected. Click or drag to draw stitches.');
      scene.requestFrame();
    }, { signal });
  }
  $('unpick-tool').addEventListener('click', () => {
    scene.finishFreeStitch();
    freeStitch.tool = freeStitch.tool === 'unpick' ? 'stitch' : 'unpick';
    update();
    scene.announce(freeStitch.tool === 'unpick' ? 'Unpick on. Click or drag to remove stitches.' : 'Unpick off. Click or drag to draw.');
  }, { signal });
  $('undo').addEventListener('click', () => scene.performHistory('undo'), { signal });
  $('redo').addEventListener('click', () => scene.performHistory('redo'), { signal });
  // The bare surface page opens the panel from its toolbar button.
  $('surface-tools')?.addEventListener('click', event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (panel.isOpen) close();
    else open(bounds.left, bounds.top);
  }, { signal });

  controls.querySelector('.tool-tray').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...controls.querySelectorAll('.tool-tray button:not(:disabled)')].filter(button => !button.closest('[inert]'));
    const current = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }, { signal });

  return { update, open, close, get isOpen() { return panel.isOpen; } };
}
