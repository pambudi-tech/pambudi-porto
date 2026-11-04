import { DotClock } from '../clock/clock.mjs';
import { GRID } from '../stitch/model.mjs';
import { cornerPitch, surfaceOrigin } from '../stitch/corners.mjs';
import { PRELOADER, LoadingCounter, loadingProgress, settleWithin } from './loading-progress.mjs';
import { paperTarget, paperPlacementAt, PAPER_PLACEMENT } from '../paper/paper-motion.mjs';
import { applyPaperPose } from '../paper/paper-pose.mjs';

// The welcome loader (src/partials/preloader.html): the frame and "Welcome to
// House of Pambudi" inked in, the dot clock counting up as the page loads,
// then a fade. It plays once a session, on whichever page opens first; the
// head check (src/partials/welcome-check.html) hides it before the first
// paint on any later page, marking the root `is-welcomed`.
export const WELCOMED = 'pambudi:welcomed';

export const welcomeSeen = () => document.documentElement.classList.contains('is-welcomed');

// Fits the dot clock to the screen, as the cloth's grid sits.
export function fitClock(clock) {
  const width = innerWidth, height = innerHeight;
  clock.resize(width, height, { ...surfaceOrigin(width, height), scale: cornerPitch(width) / GRID });
}

function markWelcomed() {
  try { sessionStorage.setItem(WELCOMED, '1'); } catch { /* it plays again next page; no harm */ }
}

// Starts the welcome for a page that tracks `count` loads of its own through
// `track`, and calls `ready` once its scene is prepared. `finish` waits for
// the count and the entrances, holds, and fades; `fail` shows the retry.
// Settles once the welcome's frame has been painted: as the browser reports
// it where it can, else a frame later; at most half a second either way.
const framePainted = () => new Promise(resolve => {
  const timer = setTimeout(done, 500);
  let observer = null;
  function done() { clearTimeout(timer); observer?.disconnect(); resolve(); }
  if (!PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) {
    requestAnimationFrame(() => requestAnimationFrame(done));
    return;
  }
  observer = new PerformanceObserver(list => {
    if (list.getEntries().some(entry => entry.element?.classList.contains('preloader-frame'))) done();
  });
  observer.observe({ type: 'largest-contentful-paint', buffered: true });
});

export function startWelcome({ count, preference, clock: clockElement = document.getElementById('portfolio-clock') }) {
  const loader = document.getElementById('preloader');
  const title = loader.querySelector('.preloader-title');
  loader.style.setProperty('--preloader-exit', `${PRELOADER.exit}ms`);
  loader.style.setProperty('--preloader-fade-in', `${PRELOADER.fadeIn}ms`);
  const paperPreview = loader.querySelector('.preloader-paper');
  const framePreview = paperPreview.querySelector('img');
  applyPaperPose(paperPreview, paperTarget(), paperPlacementAt(0, preference.matches));
  const clock = new DotClock(clockElement);
  const counter = new LoadingCounter(performance.now());
  let finishLoading;
  const loaded = new Promise(resolve => { finishLoading = resolve; });
  // The page's own loads, its scene, the title and the frame.
  const total = count + 1 + 2;
  let completed = 0, sceneReady = false, failed = false, frame;

  const resizeClock = () => fitClock(clock);
  clock.setLoading(0);
  resizeClock();
  addEventListener('resize', resizeClock);

  const track = task => settleWithin(task).then(value => { completed++; return value; });
  const progress = now => {
    const done = Math.min(sceneReady ? 100 : 99, loadingProgress(completed, total));
    const percent = counter.update(done, now);
    clock.setLoading(percent);
    loader.dataset.progress = String(percent);
    if (done === 100) finishLoading();
    if (!failed && percent < 100) frame = requestAnimationFrame(progress);
  };
  frame = requestAnimationFrame(progress);

  // Settles once the frame shows, or will not: the page loads its own
  // images behind it from then on (home.mjs).
  let frameShown;
  const frameShowing = new Promise(resolve => { frameShown = resolve; });
  // The frame eases in once decoded (base.css), settling into place as it
  // does; the page's paper, behind, takes up the settling where it has got
  // to (scene.placePaper), so it never shows larger than the frame.
  let settlingFrom = null;
  const settle = now => {
    const progress = (now - settlingFrom) / PAPER_PLACEMENT.duration;
    applyPaperPose(paperPreview, paperTarget(), paperPlacementAt(progress, preference.matches));
    if (progress < 1 && !preference.matches) requestAnimationFrame(settle);
  };
  track(framePreview.decode().then(() => {
    settlingFrom = performance.now();
    paperPreview.classList.add('is-ready');
    requestAnimationFrame(settle);
  }).finally(frameShown));
  // Nothing else is fetched before the frame has painted: on a slow line it
  // would hold the frame, the page's largest paint, up (home.mjs waits too).
  const framePainting = frameShowing.then(framePainted);
  // The title, outlined (title-art.mjs): fetched once the frame has painted,
  // then eased in as the frame is. Unshown, it still counts as done.
  track(framePainting.then(() => import('./title-art.mjs')).then(({ TITLE_VIEWBOX, TITLE_LETTERS }) => {
    title.innerHTML = `<svg class="preloader-title-art" viewBox="${TITLE_VIEWBOX}" aria-hidden="true" focusable="false">${
      TITLE_LETTERS.map(d => `<path d="${d}"/>`).join('')}</svg>`;
    title.classList.add('is-ready');
  }).catch(error => console.warn('Welcome title:', error)));

  const fadeOut = () => new Promise(resolve => {
    if (preference.matches) { loader.classList.add('is-leaving'); resolve(); return; }
    const done = event => {
      if (event && event.target !== loader) return;
      loader.removeEventListener('transitionend', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, PRELOADER.exit + 100);
    loader.addEventListener('transitionend', done);
    loader.classList.add('is-leaving');
  });

  return {
    clock,
    track,
    frameShown: frameShowing,
    framePainted: framePainting,
    // When the frame began settling into place, or null if it has not.
    frameSettling: () => settlingFrom,
    ready() { completed++; sceneReady = true; },
    // Resolves as soon as everything has loaded, the count jumping to 100;
    // `reveal` then runs as the welcome fades.
    async finish(reveal) {
      await loaded;
      cancelAnimationFrame(frame);
      clock.setLoading(100);
      loader.dataset.progress = '100';
      removeEventListener('resize', resizeClock);
      document.body.classList.add('is-revealing');
      reveal?.();
      await fadeOut();
      document.body.classList.remove('is-revealing');
      markWelcomed();
      loader.remove();
    },
    fail(error) {
      failed = true;
      cancelAnimationFrame(frame);
      console.error('Startup:', error);
      title.textContent = 'Unable to load. Please try again.';
      title.removeAttribute('role');
      title.removeAttribute('aria-label');
      title.classList.add('is-ready');
      loader.querySelector('.preloader-retry').hidden = false;
    },
  };
}
