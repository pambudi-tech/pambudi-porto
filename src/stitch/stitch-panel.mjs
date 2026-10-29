// Shared by entry, exit, mode changes and expanding free-stitch controls.
export const STITCH_PANEL_MOTION = { duration: 240, easing: 'cubic-bezier(.22, 1, .36, 1)' };

export class StitchPanel {
  constructor(element, motionPreference) {
    Object.assign(this, { element, motionPreference, isOpen: false });
    element.style.setProperty('--stitch-panel-duration', `${STITCH_PANEL_MOTION.duration}ms`);
    element.style.setProperty('--stitch-panel-ease', STITCH_PANEL_MOTION.easing);
    this.observer = new ResizeObserver(() => { if (this.isOpen) this.position(); });
    this.observer.observe(element);
  }
  position() {
    const { element, anchor } = this;
    const width = element.offsetWidth, height = element.offsetHeight;
    const left = anchor.x + width + 10 > innerWidth - 12 ? anchor.x - width - 10 : anchor.x + 10;
    const top = this.above ? anchor.y - height - 10 : anchor.y + 10;
    element.style.left = `${Math.max(12, Math.min(left, innerWidth - width - 12))}px`;
    element.style.top = `${Math.max(12, Math.min(top, innerHeight - height - 12))}px`;
    element.style.transformOrigin = `${anchor.x > left + width / 2 ? 'right' : 'left'} ${anchor.y > top + height / 2 ? 'bottom' : 'top'}`;
  }
  open(x, y) {
    clearTimeout(this.closeTimer);
    this.anchor = { x, y };
    this.isOpen = true;
    this.element.hidden = false;
    this.element.inert = false;
    this.element.removeAttribute('aria-hidden');
    // Reserve space for the palette so expansion never flips the menu's side.
    this.above = y + Math.max(this.element.offsetHeight, 300) + 10 > innerHeight - 12;
    this.position();
    // Measure the initial state before transitioning, including after a reopen.
    this.element.getBoundingClientRect();
    this.element.classList.add('is-open');
  }
  close() {
    this.isOpen = false;
    this.element.inert = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.element.classList.remove('is-open');
    clearTimeout(this.closeTimer);
    if (this.element.hidden || this.motionPreference.matches) this.element.hidden = true;
    else this.closeTimer = setTimeout(() => { if (!this.isOpen) this.element.hidden = true; }, STITCH_PANEL_MOTION.duration);
  }
}
