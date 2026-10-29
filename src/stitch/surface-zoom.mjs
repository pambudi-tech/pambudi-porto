export const SURFACE_ZOOM = { min: .25, max: 8, step: 1.25 };

// All layers and hit testing share this camera; zoom never changes stitch cells.
export class SurfaceCamera {
  constructor(view) {
    this.view = view;
    this.factor = 1;
  }
  resize(width, height, baseScale) {
    const { view } = this;
    const center = this.width === undefined ? [0, 0]
      : [(this.width / 2 - view.x) / view.scale, (this.height / 2 - view.y) / view.scale];
    Object.assign(this, { width, height, baseScale });
    view.scale = baseScale * this.factor;
    view.x = width / 2 - center[0] * view.scale;
    view.y = height / 2 - center[1] * view.scale;
  }
  zoomBy(multiplier, x = this.width / 2, y = this.height / 2) {
    const factor = Math.max(SURFACE_ZOOM.min, Math.min(SURFACE_ZOOM.max, this.factor * multiplier));
    const ratio = factor / this.factor;
    this.view.x = x - (x - this.view.x) * ratio;
    this.view.y = y - (y - this.view.y) * ratio;
    this.view.scale = this.baseScale * factor;
    this.factor = factor;
  }
  pan(dx, dy) {
    this.view.x += dx;
    this.view.y += dy;
  }
  reset() {
    this.factor = 1;
    Object.assign(this.view, { x: this.width / 2, y: this.height / 2, scale: this.baseScale });
  }
}

export function mountSurfaceNavigation(surface, camera, { onStart, onChange }) {
  const touches = new Map();
  let space = false, dragging = null, pinching = false, pinch = null;
  const $ = id => document.getElementById(id);
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function update() {
    $('zoom-reset').textContent = `${Math.round(camera.factor * 100)}%`;
    $('zoom-out').disabled = camera.factor <= SURFACE_ZOOM.min;
    $('zoom-in').disabled = camera.factor >= SURFACE_ZOOM.max;
    onChange();
  }
  function measurePinch() {
    const [a, b] = [...touches.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) } : null;
  }
  surface.addEventListener('wheel', event => {
    stop(event);
    onStart();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    camera.zoomBy(Math.exp(-Math.max(-200, Math.min(200, pixels)) * .003), event.clientX, event.clientY);
    update();
  }, { passive: false });
  surface.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size > 1 || pinching) {
        stop(event);
        onStart();
        pinching = true;
        pinch = measurePinch();
        surface.setPointerCapture(event.pointerId);
      }
    } else if (event.button === 1 || (event.button === 0 && space)) {
      stop(event);
      onStart();
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
      surface.setPointerCapture(event.pointerId);
      surface.classList.add('is-panning');
    }
  }, true);
  surface.addEventListener('pointermove', event => {
    if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinching) {
      stop(event);
      const next = measurePinch();
      if (next && pinch) {
        if (pinch.distance > 0) camera.zoomBy(next.distance / pinch.distance, pinch.x, pinch.y);
        camera.pan(next.x - pinch.x, next.y - pinch.y);
        update();
      }
      pinch = next;
    } else if (dragging?.id === event.pointerId) {
      stop(event);
      camera.pan(event.clientX - dragging.x, event.clientY - dragging.y);
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
      update();
    }
  }, true);
  function end(event) {
    touches.delete(event.pointerId);
    if (pinching) {
      stop(event);
      pinch = measurePinch();
      if (!touches.size) pinching = false;
    }
    if (dragging?.id === event.pointerId) {
      stop(event);
      dragging = null;
      surface.classList.remove('is-panning');
    }
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) surface.addEventListener(type, end, true);
  for (const [id, action] of [
    ['zoom-in', () => camera.zoomBy(SURFACE_ZOOM.step)],
    ['zoom-out', () => camera.zoomBy(1 / SURFACE_ZOOM.step)],
    ['zoom-reset', () => camera.reset()],
  ]) $(id).addEventListener('click', () => { onStart(); action(); update(); });
  document.addEventListener('keydown', event => {
    if (event.target.closest('input, textarea, select, [contenteditable]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space' && event.target === surface) {
      event.preventDefault();
      event.stopImmediatePropagation();
      space = true;
      surface.classList.add('can-pan');
    } else if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      onStart();
      if (event.key === '0') camera.reset();
      else camera.zoomBy(event.key === '-' ? 1 / SURFACE_ZOOM.step : SURFACE_ZOOM.step);
      update();
    }
  }, true);
  document.addEventListener('keyup', event => {
    if (event.code === 'Space') { space = false; surface.classList.remove('can-pan'); }
  });
  window.addEventListener('blur', () => {
    touches.clear();
    space = pinching = false;
    dragging = pinch = null;
    surface.classList.remove('can-pan', 'is-panning');
  });
  window.addEventListener('resize', update);
}
