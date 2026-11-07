import { PULL, rubberBand, pullFor, opensAt, isPull, springStep, springSettled } from './pull-physics.mjs';

// The homepage does not scroll; pulled down past its top anyway (a swipe
// down on a phone, scrolling up with the wheel or trackpad on a computer,
// Page Up or Home from the keyboard), the page drops like rubber and the
// colophon, "about this porto", shows on red above it. Let go early and the
// page rises back; pull hard enough and the colophon stays out until it is
// sent back, the same way it came.
//
// The cloth, the paper and the clock drop together: one transform each,
// written straight to those three elements, with nothing measured per frame.
// While they are anywhere but home they take no input of their own: the
// pull's listeners on the window can still catch them. `scene` is the
// portfolio's (surface/scene.mjs): it says when the page is at rest to pull
// and lets go of what a pointer was doing on it. `clock`, the dot clock
// (clock/clock.mjs), draws on the screen's whole canvas while it is moved.
export class ColophonPull {
  constructor({ scene, panel, layers, motionPreference, clock = null }) {
    this.scene = scene;
    this.clock = clock;
    this.panel = panel;
    this.layers = layers;
    this.motionPreference = motionPreference;
    this.closeButton = panel.querySelector('.colophon-back');
    // How far the page has dropped, in px.
    this.lift = 0;
    this.velocity = 0;
    this.target = 0;
    this.open = false;
    this.touch = null;
    this.wheel = null;
    this.frame = null;
    this.height = 0;
    this.lifetime = new AbortController();
    const options = { signal: this.lifetime.signal };
    const capture = { ...options, capture: true };
    addEventListener('pointerdown', event => this.down(event), capture);
    addEventListener('pointermove', event => this.moveTouch(event), { ...capture, passive: true });
    addEventListener('pointerup', event => this.up(event), capture);
    addEventListener('pointercancel', event => this.up(event), capture);
    // A wheel listener that may cancel scrolling makes the browser wait for
    // the page before it scrolls, wherever it listens. So the wheel is heard
    // only where and when a pull could start: on the page itself, while the
    // paper lies white side up (each turn, the works row's too, is marked by
    // paperflipstart and paperflipend); and over the whole window only while
    // the page is pulled (begin to rest), when it takes no input of its own.
    // About's text and the exploration sheet scroll without waiting.
    this.paper = layers[0].querySelector('.portfolio-paper');
    this.onWheel = event => this.wheelBy(event);
    this.wheelOptions = { ...options, passive: false };
    this.paper?.addEventListener('paperflipstart', () => this.syncWheel(), options);
    this.paper?.addEventListener('paperflipend', () => this.syncWheel(), options);
    this.syncWheel();
    addEventListener('keydown', event => this.key(event), options);
    // Before the scene measures the page for the new size (a capture
    // listener on window runs first), so it never measures it dropped.
    addEventListener('resize', () => this.settleNow(), capture);
    this.closeButton?.addEventListener('click', () => this.close(), options);
    // The colophon swiped back up, from its end.
    panel.addEventListener('touchstart', event => {
      this.panelTouch = this.open && this.atEnd() ? event.touches[0]?.clientY : null;
    }, { ...options, passive: true });
    panel.addEventListener('touchmove', event => {
      if (this.panelTouch == null || !this.atEnd()) return;
      if (this.panelTouch - (event.touches[0]?.clientY ?? 0) > 48) { this.panelTouch = null; this.close(); }
    }, { ...options, passive: true });
  }

  get reduced() { return this.motionPreference.matches; }
  get size() { return innerHeight; }
  // The highest the page goes once let go: a little past the colophon's height.
  get ceiling() { return this.height * 1.04 + 8; }
  // The colophon scrolled to its end, the edge that meets the page.
  atEnd() { return this.panel.scrollTop + this.panel.clientHeight >= this.panel.scrollHeight - 1; }

  // The page can be pulled only as it first opens: the white side of the
  // paper up, nothing else open, nothing being stitched.
  canPull() { return document.body.dataset.ready === 'true' && this.scene.canLift(); }

  // The page hears the wheel while its paper lies still, white side up, and
  // not turned away for the works row (which makes it inert while open).
  // canPull still decides each time; this only keeps the listener away from
  // the red side's About and from the row and its sheet.
  syncWheel() {
    const paper = this.paper;
    const up = !paper || (!paper.inert && paper.dataset.paperSide !== 'red' && paper.dataset.flipping !== 'true');
    if (up === this.wheelOnPage) return;
    this.wheelOnPage = up;
    if (up) this.layers[0].addEventListener('wheel', this.onWheel, this.wheelOptions);
    else this.layers[0].removeEventListener('wheel', this.onWheel);
  }

  // Whether a pointer or wheel event is over the page: at home, by its own
  // elements; dropped (and inert), by where the page now lies.
  onPage(event) {
    if (!this.lift) return this.layers[0].contains(event.target) && !event.target.closest('.about-resume');
    return !this.panel.contains(event.target) && event.clientY >= this.lift;
  }

  key(event) {
    if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      this.close();
    } else if ((event.key === 'PageUp' || event.key === 'Home') && !this.open && !this.lift
      && event.target === this.layers[0] && !event.altKey && !event.ctrlKey && !event.metaKey && this.canPull()) {
      event.preventDefault();
      this.begin();
      this.toOpen(0);
    }
  }

  down(event) {
    if (this.open) {
      // A tap on the page below sends the colophon back, and does nothing else.
      if (!this.panel.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
      return;
    }
    if (this.touch) { this.cancelTouch(); return; }
    if (event.pointerType === 'mouse' || !event.isPrimary || this.wheel || this.target) return;
    if (!this.onPage(event) || event.target.closest('.works-seal') || !this.canPull()) return;
    // The paper where it lies now, dropped or not.
    const onPaper = this.scene.paperContains(event.clientX, event.clientY - this.lift);
    // On the cloth while free stitch is on, a drag draws thread instead.
    if (!onPaper && this.scene.stitchMode === 'free') return;
    this.touch = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, onPaper, pulling: false, samples: [] };
  }

  moveTouch(event) {
    const touch = this.touch;
    if (!touch || event.pointerId !== touch.id) return;
    const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
    if (!touch.pulling) {
      if (dy < -PULL.commit || Math.abs(dx) > PULL.commit * 2) { this.touch = null; return; }
      if (!isPull(dx, dy, event.timeStamp - touch.time, { onPaper: touch.onPaper })) return;
      if (!this.canPull()) { this.touch = null; return; }
      touch.pulling = true;
      // From here the touch is the pull's: the scene lets go of its tap,
      // its press on the paper and its long-press.
      this.scene.letGo(touch.id);
      this.begin();
      // From wherever the page is now (a spring may have been carrying it),
      // so it never jumps as the pull takes hold.
      touch.from = pullFor(this.lift, this.size) - dy;
    }
    this.sample(touch, event);
    if (!this.canPull()) { this.cancelTouch(); return; }
    if (this.reduced) return;
    this.setLift(rubberBand(touch.from + dy, this.size));
  }

  // The finger's last 80 ms, for how fast it was moving when let go.
  sample(touch, event) {
    touch.samples.push({ y: event.clientY, time: event.timeStamp });
    while (touch.samples.length > 1 && event.timeStamp - touch.samples[0].time > 80) touch.samples.shift();
  }

  up(event) {
    const touch = this.touch;
    if (!touch || event.pointerId !== touch.id) return;
    this.touch = null;
    if (!touch.pulling) return;
    // Where it was let go counts too: a finger held still has no speed left.
    this.sample(touch, event);
    const [first] = touch.samples, last = touch.samples.at(-1);
    const span = last.time - first.time;
    // Moving down is positive here, as the drop is.
    const velocity = span > 0 ? (last.y - first.y) / span : 0;
    const lift = this.reduced ? rubberBand(touch.from + event.clientY - touch.y, this.size) : this.lift;
    if (event.type === 'pointerup' && opensAt(lift, this.size, this.height) && this.canPull()) this.toOpen(Math.max(velocity, 0));
    else this.toRest(Math.min(velocity, 0));
  }

  cancelTouch() {
    const touch = this.touch;
    this.touch = null;
    if (touch?.pulling) this.toRest(0);
  }

  wheelBy(event) {
    // Each event once: the window's listener, added as the pull begins,
    // would otherwise hear the event that began it on its way up.
    if (event === this.lastWheel) return;
    this.lastWheel = event;
    // Pinch zoom and ctrl+wheel are the browser's.
    if (event.ctrlKey) return;
    if (this.open) {
      // Scrolling back down past the colophon's end sends it back.
      if (event.deltaY > 0 && (!this.panel.contains(event.target) || this.atEnd())) {
        event.preventDefault();
        this.close();
      } else if (!this.panel.contains(event.target)) event.preventDefault();
      return;
    }
    if (this.touch) return;
    // Scrolling up pulls the page down.
    const pixels = -event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? this.size : 1);
    if (!this.wheel) {
      if (pixels <= 0 || this.target || !this.onPage(event) || !this.canPull()) return;
      this.scene.letGo();
      this.begin();
      this.wheel = { pull: pullFor(this.lift, this.size), timer: null };
    }
    event.preventDefault();
    const wheel = this.wheel;
    clearTimeout(wheel.timer);
    // Something else opened meanwhile (a click on the works seal while the
    // trackpad was still gliding): the pull lets go.
    if (!this.canPull()) { this.wheel = null; this.toRest(0); return; }
    // The wheel pulls no further than the page will go once let go, so it
    // never snaps back to there.
    wheel.pull = Math.min(Math.max(0, wheel.pull + pixels * PULL.wheelScale), pullFor(this.ceiling, this.size));
    wheel.lift = rubberBand(wheel.pull, this.size);
    if (!this.reduced && !this.frame) this.frame = requestAnimationFrame(now => this.glide(now));
    wheel.timer = setTimeout(() => this.wheelRest(), PULL.wheelRest);
  }

  // A mouse wheel moves in notches: the page glides after the wheel's pull
  // rather than stepping with each one, as a page scrolled by it would.
  glide(now, last = now - 16) {
    const wheel = this.wheel;
    if (!wheel) { this.frame = null; return; }
    const amount = 1 - Math.exp(-Math.min(now - last, 64) / 45);
    const lift = this.lift + (wheel.lift - this.lift) * amount;
    this.setLift(Math.abs(wheel.lift - lift) < .5 ? wheel.lift : lift);
    this.frame = requestAnimationFrame(next => this.glide(next, now));
  }

  wheelRest() {
    const wheel = this.wheel;
    this.wheel = null;
    if (!wheel) return;
    // Only how far it pulled counts. The spring takes over from wherever the
    // glide has got to.
    if (opensAt(wheel.lift ?? 0, this.size, this.height) && this.canPull()) this.toOpen(0);
    else this.toRest(0);
  }

  // The pull begins: the colophon's height is measured once, here, and it
  // shows its end first, the edge that meets the page. The page takes no
  // input of its own until it is home again (rest), so the window hears the
  // wheel until then, wherever it is turned.
  begin() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
    // At home still: the clock changes canvas where both show alike.
    this.clock?.holdWhole(true);
    addEventListener('wheel', this.onWheel, this.wheelOptions);
    this.panel.hidden = false;
    if (!this.open) this.panel.scrollTop = this.panel.scrollHeight;
    this.height = Math.min(this.panel.offsetHeight, Math.round(this.size * PULL.maxShare));
    // Focus the page had comes back to it once it is home.
    if (this.layers.some(layer => layer.contains(document.activeElement))) this.returnFocus = true;
    for (const layer of this.layers) {
      layer.style.willChange = 'transform';
      layer.inert = true;
    }
    this.panel.style.willChange = 'transform';
  }

  setLift(lift) {
    this.lift = lift;
    const transform = lift ? `translate3d(0, ${lift}px, 0)` : '';
    for (const layer of this.layers) layer.style.transform = transform;
    this.panel.style.transform = transform;
  }

  toOpen(velocity) {
    this.open = true;
    this.panel.inert = false;
    this.panel.removeAttribute('aria-hidden');
    this.springTo(this.height, velocity);
    this.panel.focus({ preventScroll: true });
    this.scene.announce('About this portfolio, above the page. Escape to go back.');
  }

  toRest(velocity) {
    // Focus goes back to the page once it is home and can take it.
    if (this.open) this.returnFocus = true;
    this.open = false;
    this.panel.inert = true;
    this.panel.setAttribute('aria-hidden', 'true');
    this.springTo(0, velocity);
  }

  close() {
    if (this.open) this.toRest(0);
  }

  springTo(target, velocity) {
    this.target = target;
    cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.reduced) {
      this.setLift(target);
      if (!target) this.rest();
      return;
    }
    this.velocity = velocity;
    // Never above the page's home, nor far past where it set out from.
    const highest = Math.max(this.ceiling, this.lift);
    let last = null;
    const step = now => {
      const elapsed = last == null ? 16 : now - last;
      last = now;
      const next = springStep(this.lift, this.velocity, target, elapsed);
      this.velocity = next.velocity;
      const lift = Math.max(0, Math.min(next.position, highest));
      if (springSettled(lift, this.velocity, target)) {
        this.setLift(target);
        this.frame = null;
        if (!target) this.rest();
        return;
      }
      this.setLift(lift);
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  // Home: as the page was when it first opened, nothing left over.
  rest() {
    this.target = 0;
    this.velocity = 0;
    this.setLift(0);
    // Home again, the clock can go back to its own rows' canvas.
    this.clock?.holdWhole(false);
    for (const layer of this.layers) {
      layer.style.willChange = '';
      layer.inert = false;
    }
    this.panel.style.willChange = '';
    this.panel.inert = true;
    this.panel.setAttribute('aria-hidden', 'true');
    this.panel.hidden = true;
    removeEventListener('wheel', this.onWheel);
    if (this.returnFocus || this.panel.contains(document.activeElement)) this.layers[0].focus({ preventScroll: true });
    this.returnFocus = false;
  }

  // At once, no spring: before a resize, the page goes home.
  settleNow() {
    if (!this.lift && !this.open && !this.touch && !this.wheel && this.panel.hidden) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.wheel) clearTimeout(this.wheel.timer);
    if (this.open) this.returnFocus = true;
    this.wheel = null;
    this.touch = null;
    this.open = false;
    this.rest();
  }

  destroy() {
    this.settleNow();
    this.lifetime.abort();
  }
}
