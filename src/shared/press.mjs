// Every button and link gives under the finger: it sinks a little as it is
// pressed and springs back as it is let go. A quick tap still shows, since
// the press holds at least `hold` ms. Controls with a press of their own (the
// stamp cards' paper, the wax seals, the stitch tools) keep theirs.
export const PRESS = Object.freeze({
  scale: .95,
  down: 70,     // ms to sink
  up: 240,      // ms to spring back
  hold: 110,    // ms a press shows at the least
  springBack: 'cubic-bezier(.34, 1.56, .64, 1)',
});

const PRESSABLE = 'button, a[href], [role="button"]';
const OWN_PRESS = '.works-link, .works-seal, .tool-button, .thread-swatch';

// The control a press at `target` presses, or null: not disabled, not one
// with a press of its own, and a box a transform can scale.
export function pressTarget(target) {
  const control = target?.closest?.(PRESSABLE);
  if (!control || control.matches(':disabled, [aria-disabled="true"]') || control.closest(OWN_PRESS)) return null;
  return getComputedStyle(control).display === 'inline' ? null : control;
}

export function mountPress(motionPreference = matchMedia('(prefers-reduced-motion: reduce)')) {
  // `pressed` is down now; `letting` is let go but still holding its press.
  let pressed = null, since = 0, letting = null;
  const springBack = control => {
    control.getAnimations().filter(animation => animation.id === 'press').forEach(animation => animation.cancel());
    control.animate([{ scale: PRESS.scale }, { scale: 1 }], { duration: PRESS.up, easing: PRESS.springBack });
  };
  const sink = control => {
    // One still holding springs back at once, unless it is pressed again.
    if (letting) {
      clearTimeout(letting.timer);
      if (letting.control !== control) springBack(letting.control);
      letting = null;
    }
    pressed = control;
    since = performance.now();
    control.animate([{ scale: 1 }, { scale: PRESS.scale }], { duration: PRESS.down, easing: 'ease-out', fill: 'forwards', id: 'press' });
  };
  const release = () => {
    const control = pressed;
    if (!control) return;
    pressed = null;
    letting = { control, timer: setTimeout(() => { letting = null; springBack(control); }, Math.max(0, PRESS.hold - (performance.now() - since))) };
  };
  document.addEventListener('pointerdown', event => {
    if (motionPreference.matches || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const control = pressTarget(event.target);
    if (control) sink(control);
  }, { passive: true });
  for (const type of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(type, release, { passive: true });
  // From the keyboard, Enter and Space press it too.
  document.addEventListener('keydown', event => {
    if (motionPreference.matches || event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    const control = pressTarget(event.target);
    if (control) sink(control);
  });
  document.addEventListener('keyup', release);
}
