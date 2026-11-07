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
  lead: 150,   // ms before each glide that its travel runs again
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
    duration, move,
    frames: [
      { ...pose(0, 0, fade), offset: 0 },
      { ...pose(0, 0, fade), offset: at(hold), easing: GLIDE },
      { ...pose(travel, fade, 0), offset: at(hold + move) },
      { ...pose(travel, fade, 0), offset: at(2 * hold + move), easing: GLIDE },
      { ...pose(0, 0, fade), offset: 1 },
    ],
  };
}

// `into` ms through a round of `duration`: when the rest it is in ends, or
// null while it glides. It rests as each round begins, and again halfway.
export function marqueeRestEnd(into, duration, hold = MARQUEE.hold) {
  const half = duration / 2;
  if (into >= 0 && into < hold) return hold;
  if (into >= half && into < half + hold) return half + hold;
  return null;
}

// What its travel should be doing `into` ms through a round: 'rest', paused
// until `wake` ms on, held at `still` ms into the round, the middle of its
// rest, well clear of either glide; or 'run' until `wake` ms on, by when it
// rests again. It runs `lead` ms before each glide, so it is surely under
// way in time.
export function marqueeStep(into, duration, { hold = MARQUEE.hold, lead = MARQUEE.lead } = {}) {
  const rest = marqueeRestEnd(into, duration, hold);
  if (rest !== null && rest - into > lead) return { state: 'rest', wake: rest - lead - into, still: rest - hold / 2 };
  return { state: 'run', wake: (into < duration / 2 ? duration / 2 : duration) - into };
}

export function mountTitleMarquee(title, { motionPreference }) {
  const narrow = matchMedia(NARROW);
  // `timer` wakes the travel between rests (pace); `begin` holds its first
  // start, a pause or wake meanwhile must not cancel it.
  let animations = [], timer = null, begin = null;
  // The round under way: its length, and when each animation began it on
  // the page's timeline.
  let round = 0, origins = null;
  // What each of them does in either glide, out and back, taken alone, and
  // how long a glide takes; and the glide waiting behind a rest (pace).
  let targets = [], legs = [], move = 0, guards = [];
  // Out of sight it need not travel: scrolled well off the screen, or behind
  // the gallery once the hero has parted for it (project-gallery.mjs).
  let offscreen = false, hero = 'whole', wholeSince = -Infinity;
  // Out of sight below or above, where the title is on the page, while the
  // scroll is watched for a jump straight back to it (watch).
  let away = null;
  // While it rests the copy holds still, so its travel is paused there and
  // the page draws nothing; it runs again just before it sets off, from the
  // very point of its round it would have reached had it never stopped. Out
  // of sight it is paused too, and comes back in step the same way.
  const pace = () => {
    clearTimeout(timer);
    unguard();
    if (!origins) { unwatch(); return; }
    const now = document.timeline.currentTime;
    const elapsed = now - origins[0];
    const into = (elapsed % round + round) % round;
    const { state, wake, still } = marqueeStep(into, round);
    if (offscreen || hero === 'parted') {
      if (offscreen) watch(); else unwatch();
      animations.forEach(animation => animation.pause());
      return;
    }
    unwatch();
    if (state === 'rest') {
      animations.forEach((animation, index) => { animation.pause(); animation.currentTime = now - origins[index] - into + still; });
      // Should its wake-up come late, the page busy just then, the glide
      // still sets off on time: behind the rest waits that glide alone, on
      // the page's own timeline, showing the very same rest until it starts.
      // On time, the travel runs again first and the glide is let go of.
      const end = marqueeRestEnd(into, round);
      guards = targets.map((target, index) => {
        const glide = target.animate(legs[index][end === MARQUEE.hold ? 0 : 1], { duration: move, fill: 'both' });
        glide.startTime = origins[index] + elapsed - into + end;
        return glide;
      });
      timer = setTimeout(pace, wake);
      return;
    }
    animations.forEach((animation, index) => { animation.startTime = origins[index]; });
    timer = setTimeout(pace, wake);
  };
  const unguard = () => { guards.forEach(glide => glide.cancel()); guards = []; };
  // The observer hears of the title coming back only after the frame it
  // shows in, which its margin covers for a scroll, but not for a jump back
  // (a link, a search, the Home key); the scroll itself is heard before the
  // frame, so it is watched too, while the title is away.
  const near = () => {
    if (away && away.bottom > scrollY - innerHeight / 2 && away.top < scrollY + innerHeight * 1.5) { offscreen = false; pace(); }
  };
  const watch = () => {
    if (away) return;
    const box = title.getBoundingClientRect();
    away = { top: box.top + scrollY, bottom: box.bottom + scrollY };
    addEventListener('scroll', near, { passive: true });
  };
  const unwatch = () => {
    if (!away) return;
    away = null;
    removeEventListener('scroll', near);
  };
  const stop = () => {
    clearTimeout(begin);
    clearTimeout(timer);
    unguard();
    unwatch();
    animations.forEach(animation => animation.cancel());
    animations = [];
    origins = null;
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
    const { frames, duration, move: glide } = marqueeFrames(overflow + MARQUEE.room);
    const mask = title.querySelector('.ink-bleed') ?? title;
    // The fades, keyframed on the mask, and the travel on the copies.
    const masks = frames.map(frame => Object.fromEntries(Object.entries(frame).filter(([key]) => key !== 'left')));
    const moves = frames.map(({ left, offset, easing }) => ({ left, offset, ...(easing ? { easing } : {}) }));
    // Each glide alone, from the keyframe it leaves to the one it reaches.
    const glides = list => [1, 3].map(from => [{ ...list[from], offset: 0 }, { ...list[from + 1], offset: 1 }]);
    targets = [mask, ...parts];
    legs = [glides(masks), ...parts.map(() => glides(moves))];
    move = glide;
    begin = setTimeout(() => {
      const started = animations = [
        mask.animate(masks, { duration, iterations: Infinity }),
        ...parts.map(part => part.animate(moves, { duration, iterations: Infinity })),
      ];
      // Once under way, its round is known on the timeline, and it rests.
      Promise.all(started.map(animation => animation.ready)).then(() => {
        if (animations !== started) return;
        round = duration;
        origins = started.map(animation => animation.startTime);
        pace();
      }, () => {});
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
  // Its margin wakes it a screen's half before it could show again. While
  // the gallery has the hero, flown at the camera, where it seems is no
  // guide, and the page cannot scroll; so only a sighting from the hero
  // whole again counts.
  new IntersectionObserver(entries => {
    const entry = entries.at(-1);
    if (hero !== 'whole' || entry.time < wholeSince) return;
    offscreen = !entry.isIntersecting;
    pace();
  }, { root: document, rootMargin: '50% 0px' }).observe(title);
  addEventListener('project-hero', event => {
    hero = event.detail.state;
    if (hero === 'whole') wholeSince = performance.now();
    pace();
  });
  // A timer may have slept with the page; it wakes in step.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pace(); });
  let resizing;
  addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(follow, 200); });
  narrow.addEventListener('change', follow);
  motionPreference.addEventListener('change', follow);
  follow();
}
