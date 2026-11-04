// The small labels over the contact icons, the intro's links and a locked
// "visit site" or gallery seal (the ::after of their [data-tooltip], base.css). The first
// waits `delay` ms, so passing over a control shows nothing; once one is
// showing, its neighbours show at once and without a fade, and so do any
// for `skip` ms after the last one hid.
export const TOOLTIP = Object.freeze({ delay: 300, skip: 300 });

const TRIGGER = '.intro-link, .contact-link, .project-visit[data-tooltip], .project-gallery-seal[data-tooltip]';

// The timing alone, apart from the page: `enter` says whether a trigger's
// label shows at once, `leave` notes when a shown one hid.
export function tooltipTiming({ delay = TOOLTIP.delay, skip = TOOLTIP.skip } = {}) {
  let shownAt = Infinity, hidAt = -Infinity;
  return {
    enter(time) {
      const instant = time - hidAt < skip;
      shownAt = instant ? time : time + delay;
      return instant;
    },
    leave(time) {
      if (time >= shownAt) hidAt = time;
      shownAt = Infinity;
    },
  };
}

export function mountTooltips(root = document) {
  document.documentElement.style.setProperty('--tooltip-delay', `${TOOLTIP.delay}ms`);
  const timing = tooltipTiming();
  let last = null;
  root.addEventListener('pointerover', event => {
    const trigger = event.target.closest?.(TRIGGER);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    const instant = timing.enter(event.timeStamp);
    trigger.toggleAttribute('data-tooltip-instant', instant);
    // The one just left gives way at once rather than fading beside it.
    if (instant && last && last !== trigger) last.setAttribute('data-tooltip-instant', '');
    last = trigger;
  }, { passive: true });
  root.addEventListener('pointerout', event => {
    const trigger = event.target.closest?.(TRIGGER);
    if (!trigger || trigger.contains(event.relatedTarget)) return;
    timing.leave(event.timeStamp);
  }, { passive: true });
}
