// On a phone the project's title keeps to one line, so every cover sits at
// the same height. A title too long for it is masked at its edges and,
// once the page's words have arrived, travels: it rests to be read, glides
// to show its end, rests there, and glides back. The fades follow it: the
// far edge fades while there is more to come, the near one once it moves.
export const MARQUEE = Object.freeze({
  speed: 28,   // px a second, at a reading pace
  hold: 1600,  // ms it rests at either end
  fade: 24,    // px of soft edge
  room: 12,    // px past its end it travels, clear of the fade
  wait: 900,   // ms after the words arrive before it first moves
});

const NARROW = '(max-width: 760px)';
const GLIDE = 'cubic-bezier(.45, 0, .55, 1)';

// The keyframes for one round: rest, glide out, rest, glide back. Each
// entry's easing runs to the next.
export function marqueeFrames(travel, { speed = MARQUEE.speed, hold = MARQUEE.hold, fade = MARQUEE.fade } = {}) {
  const move = travel / speed * 1000, duration = 2 * (hold + move);
  const at = time => time / duration;
  // `left`, not a transform: moved on the page's own frames, the copy is
  // drawn together with the mask over it, never as a layer apart that a
  // sliver of could slip past the mask's edge.
  const pose = (shift, near, far) => ({ left: `${-shift}px`, '--title-fade-near': `${near}px`, '--title-fade-far': `${far}px` });
  return {
    duration,
    frames: [
      { ...pose(0, 0, fade), offset: 0 },
      { ...pose(0, 0, fade), offset: at(hold), easing: GLIDE },
      { ...pose(travel, fade, 0), offset: at(hold + move) },
      { ...pose(travel, fade, 0), offset: at(2 * hold + move), easing: GLIDE },
      { ...pose(0, 0, fade), offset: 1 },
    ],
  };
}

export function mountTitleMarquee(title, { motionPreference }) {
  const narrow = matchMedia(NARROW);
  let animations = [], timer = null;
  const stop = () => {
    clearTimeout(timer);
    animations.forEach(animation => animation.cancel());
    animations = [];
    title.classList.remove('is-masked');
  };
  const start = () => {
    stop();
    if (!narrow.matches) return;
    // Both copies, the one read and the one inked, travel together.
    const parts = [...title.querySelectorAll('.ink-source, .ink-bleed-copy')];
    if (!parts.length) parts.push(title);
    const overflow = Math.max(...parts.map(part => part.scrollWidth)) - title.clientWidth;
    if (overflow <= 1) return;
    title.classList.add('is-masked');
    if (motionPreference.matches) return;
    const { frames, duration } = marqueeFrames(overflow + MARQUEE.room);
    const mask = title.querySelector('.ink-bleed') ?? title;
    // The fades, keyframed on the mask, and the travel on the copies.
    const masks = frames.map(frame => Object.fromEntries(Object.entries(frame).filter(([key]) => key !== 'left')));
    const moves = frames.map(({ left, offset, easing }) => ({ left, offset, ...(easing ? { easing } : {}) }));
    timer = setTimeout(() => {
      animations = [
        mask.animate(masks, { duration, iterations: Infinity }),
        ...parts.map(part => part.animate(moves, { duration, iterations: Infinity })),
      ];
    }, MARQUEE.wait);
  };
  // It moves only while the words are shown: they arrive, or leave, with
  // the page's `project-arriving` class; nothing else on the page restarts it.
  const follow = () => (document.body.classList.contains('project-arriving') ? stop() : start());
  let shown = !document.body.classList.contains('project-arriving');
  new MutationObserver(() => {
    const now = !document.body.classList.contains('project-arriving');
    if (now !== shown) { shown = now; follow(); }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  let resizing;
  addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(follow, 200); });
  narrow.addEventListener('change', follow);
  motionPreference.addEventListener('change', follow);
  follow();
}
