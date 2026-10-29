import { GRID } from '../stitch/model.mjs';

// Pointer, touch and keyboard input on the stitch surface: taps stitch, drags
// draw free stitch, long-press or right-click opens the controls, and the
// arrow keys move a stitching cursor. It reads and changes the scene's shared
// state (see scene.mjs).
export function mountSurfaceInput(scene, { signal }) {
  const { surface, freeStitch, controls, view, motionPreference } = scene;
  const listen = (target, type, handler, options) => target.addEventListener(type, handler, { ...options, signal });
  const moved = (tap, event) => Math.hypot(event.clientX - tap.x, event.clientY - tap.y);

  listen(surface, 'pointerdown', event => {
    if (event.target.closest('.paper-flip-control')) return;
    if (event.target.closest('.paper-copy, .about-resume')) return;
    if (event.target.closest('.works-seal')) return;
    if (event.button !== 0 || (event.pointerType === 'mouse' && event.ctrlKey)) return;
    event.preventDefault();
    scene.pointers.set(event.pointerId, true);
    surface.setPointerCapture(event.pointerId);
    if (scene.pointers.size > 1 || scene.suppressTouch) {
      scene.finishFreeStitch();
      controls.update();
      scene.cancelTap();
      scene.paper?.reset();
      scene.suppressTouch = true;
      scene.hover = null;
      scene.requestFrame();
      return;
    }
    surface.focus({ preventScroll: true });
    scene.keyboardMode = false;
    if (scene.paper?.contains(event.clientX, event.clientY)) {
      scene.cancelTap();
      scene.hover = null;
      scene.paper?.press(event);
      scene.requestFrame();
      return;
    }
    scene.activeTap = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch') scene.touchHold.begin(event.pointerId, event.clientX, event.clientY);
  });

  listen(surface, 'pointermove', event => {
    if (event.buttons && document.querySelector('.paper-copy.ink-selecting')) return;
    if (scene.suppressTouch || controls.isOpen) return;
    const tap = scene.activeTap;
    if (tap?.id === event.pointerId && moved(tap, event) > 8) {
      if (scene.stitching && scene.stitchMode === 'free') {
        scene.freePointer = event.pointerId;
        freeStitch.begin(scene.freeCell(tap.x, tap.y), performance.now(), motionPreference.matches);
      }
      scene.cancelTap();
    }
    if (scene.paper?.move(event.clientX, event.clientY, event.pointerType) || scene.paper?.ownsPointer(event.pointerId)) {
      scene.cancelTap();
      freeStitch.pause();
      scene.hover = null;
      scene.requestFrame({ stitches: freeStitch.active });
      return;
    }
    if (scene.freePointer === event.pointerId) {
      freeStitch.move(scene.freeCell(event.clientX, event.clientY), performance.now(), motionPreference.matches);
      scene.requestFrame({ stitches: true });
    }
    scene.keyboardMode = false;
    scene.hover = !scene.stitching || event.pointerType === 'touch' ? null : scene.position(event.clientX, event.clientY);
    scene.requestFrame();
  });

  function pointerEnd(event) {
    const releasedPaper = scene.paper?.release(event);
    if (scene.freePointer === event.pointerId) {
      if (event.type === 'pointerup' && !scene.paper?.contains(event.clientX, event.clientY)) {
        freeStitch.move(scene.freeCell(event.clientX, event.clientY), performance.now(), motionPreference.matches);
      }
      scene.finishFreeStitch();
      controls.update();
      scene.requestFrame({ stitches: true });
    }
    const tap = scene.activeTap?.id === event.pointerId ? scene.activeTap : null;
    if (tap) scene.cancelTap();
    scene.pointers.delete(event.pointerId);
    if (tap && event.type === 'pointerup' && !releasedPaper && !scene.suppressTouch && !controls.isOpen
        && moved(tap, event) <= 8
        && !scene.paper?.contains(event.clientX, event.clientY)) scene.stitchAt(tap.x, tap.y);
    if (!scene.pointers.size) scene.suppressTouch = false;
    if (releasedPaper || event.pointerType === 'touch' || event.type === 'pointercancel') scene.hover = null;
    scene.requestFrame();
  }
  listen(surface, 'pointerup', pointerEnd);
  listen(surface, 'pointercancel', pointerEnd);
  listen(surface, 'lostpointercapture', event => {
    if (scene.pointers.has(event.pointerId) || scene.paper?.ownsPointer(event.pointerId)) pointerEnd(event);
  });
  listen(surface, 'pointerleave', () => {
    scene.paper?.leave();
    freeStitch.pause();
    scene.hover = null;
    scene.requestFrame();
  });
  listen(surface, 'contextmenu', event => {
    if (event.target.closest('.paper-copy, .about-resume')) return;
    event.preventDefault();
    if (event.target.closest('.works-seal') || scene.paper?.contains(event.clientX, event.clientY)) return;
    controls.open(event.clientX || innerWidth / 2, event.clientY || innerHeight / 2);
  });

  // The keyboard cursor stays on screen and clear of the wordmark and clock.
  function keyboardPreview() {
    const step = GRID * view.scale;
    const cell = scene.keyboardCell;
    cell[0] = Math.max(Math.ceil(-view.x / step), Math.min(Math.floor((innerWidth - view.x) / step) - 1, cell[0]));
    cell[1] = Math.max(Math.ceil(((scene.surfaceOnly ? 0 : 70) - view.y) / step), Math.min(Math.floor((innerHeight - (scene.surfaceOnly ? 0 : 160) - view.y) / step) - 1, cell[1]));
    const [col, row] = cell;
    scene.hover = { col, row, x: view.x + (col + .5) * step, y: view.y + (row + .5) * step };
    scene.requestFrame();
  }
  listen(surface, 'keydown', event => {
    if (!scene.stitching || event.target.closest('.works-seal, .intro-link, .contact-link, .paper-flip-control, .about-resume')) return;
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const step = GRID * view.scale;
      controls.open(scene.hover?.x ?? view.x + (scene.keyboardCell[0] + .5) * step, scene.hover?.y ?? view.y + (scene.keyboardCell[1] + .5) * step);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault();
      if (!scene.keyboardMode && scene.hover) scene.keyboardCell = [scene.hover.col, scene.hover.row];
      scene.keyboardMode = true;
      scene.keyboardCell = scene.keyboardCell.map((n, i) => n + moves[event.key][i]);
      keyboardPreview();
      const action = scene.stitchMode === 'motif' ? 'stitch a motif' : freeStitch.tool === 'unpick' ? 'unstitch' : 'add a stitch';
      scene.announce(`Column ${scene.keyboardCell[0]}, row ${scene.keyboardCell[1]}. Press Enter to ${action}.`);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.repeat) return;
      scene.keyboardMode = true;
      keyboardPreview();
      scene.stitchAt(scene.hover.x, scene.hover.y);
    }
  });
  listen(document, 'keydown', event => {
    if (event.key === 'Escape') {
      scene.finishFreeStitch();
      controls.update();
      scene.paper?.reset();
      scene.touchHold.cancel();
      if (controls.isOpen) controls.close({ focus: true });
      scene.hover = null;
      scene.cancelTap();
      scene.requestFrame();
    }
    if (event.target.matches('input, textarea, select, [contenteditable]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      scene.performHistory(event.shiftKey ? 'redo' : 'undo');
    }
  });
  listen(window, 'blur', () => {
    scene.finishFreeStitch();
    scene.paper?.reset();
    scene.touchHold.cancel();
    controls.close();
    scene.cancelTap();
    scene.suppressTouch = false;
    scene.pointers.clear();
    scene.hover = null;
    scene.requestFrame();
  });
}
