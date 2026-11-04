import { DotClock } from '../clock/clock.mjs';
import { GRID } from '../stitch/model.mjs';
import { cornerPitch, surfaceOrigin } from '../stitch/corners.mjs';
import { PRELOADER, LoadingCounter, loadingProgress, minimumElapsed, settleWithin } from './loading-progress.mjs';
import { paperInkEntrance } from '../paper/paper-ink.mjs';
import { PAPER_PLACEMENT, paperTarget, paperPlacementAt } from '../paper/paper-motion.mjs';
import { applyPaperPose } from '../paper/paper-pose.mjs';
import { createArtInkLayer, createImageInkLayer, imageInkDensity } from '../ink/ink-growth.mjs';
import { preloaderFrameRegion } from '../paper/frame-registration.mjs';

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
  const paperPreview = loader.querySelector('.preloader-paper');
  const framePreview = paperPreview.querySelector('img');
  // The title rides on the frame: lifted with it, and placed with it.
  const poseWelcome = placement => {
    applyPaperPose(paperPreview, paperTarget(), placement);
    title.style.translate = `0 ${(placement?.y ?? 0).toFixed(4)}px`;
  };
  poseWelcome(paperPlacementAt(0, preference.matches));
  // The frame waits lifted, as the paper does before it is placed, until the
  // welcome is about to leave. Then it is placed with the paper's own
  // placement (PAPER_PLACEMENT), timed so the motion is half done midway
  // through the fade: half is seen on the welcome, half on the page. The
  // real sheet behind is placed on the same clock (scene.mjs,
  // 'paperplacement') and carries it on. Until the frame is placed, the
  // sheet's pose isn't mirrored on it.
  paperPreview.dataset.placement = preference.matches ? 'complete' : 'pending';
  const placeFrame = started => {
    if (paperPreview.dataset.placement !== 'pending') return;
    paperPreview.dataset.placement = 'placing';
    paperPreview.dataset.placementStart = String(started);
    paperPreview.dispatchEvent(new CustomEvent('paperplacement', { detail: { started } }));
    const step = now => {
      const progress = Math.max(0, (now - started) / PAPER_PLACEMENT.duration);
      if (progress >= 1 || preference.matches || !paperPreview.isConnected) {
        poseWelcome(null);
        paperPreview.dataset.placement = 'complete';
        return;
      }
      poseWelcome(paperPlacementAt(progress));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const clock = new DotClock(clockElement);
  const started = performance.now();
  const counter = new LoadingCounter(started);
  let finishCounter, finishTitle, finishPaper;
  const counterFinished = new Promise(resolve => { finishCounter = resolve; });
  const titleFinished = new Promise(resolve => { finishTitle = resolve; });
  const paperFinished = new Promise(resolve => { finishPaper = resolve; });
  // The page's own loads, its scene, the title and the frame.
  const total = count + 1 + 2;
  let completed = 0, sceneReady = false, failed = false, frame;

  const resizeClock = () => fitClock(clock);
  clock.setLoading(0);
  resizeClock();
  addEventListener('resize', resizeClock);

  const track = task => settleWithin(task).then(value => { completed++; return value; });
  const progress = now => {
    const loaded = Math.min(sceneReady ? 100 : 99, loadingProgress(completed, total));
    const percent = counter.update(loaded, now);
    clock.setLoading(percent);
    loader.dataset.progress = String(percent);
    if (percent === 100) finishCounter();
    if (!failed && percent < 100) frame = requestAnimationFrame(progress);
  };
  frame = requestAnimationFrame(progress);

  // Settles once the frame shows, or will not: the page loads its own
  // images behind it from then on (home.mjs).
  let frameShown;
  const frameShowing = new Promise(resolve => { frameShown = resolve; });
  // The frame's ink field is worked out while the frame itself loads.
  const frameInk = preference.matches ? null : imageInkDensity(framePreview, preloaderFrameRegion());
  track(framePreview.decode().then(async () => {
    await paperInkEntrance(paperPreview, {
      motionPreference: preference, duration: PRELOADER.paperDuration, delay: 0,
      waitForFonts: false, createLayers: async () => [await createImageInkLayer(framePreview, preloaderFrameRegion(), frameInk ?? undefined)],
      onComplete: finishPaper,
    });
    paperPreview.classList.add('is-ready');
  }).catch(() => finishPaper()).finally(frameShown));
  // Nothing else is fetched before the frame has painted: on a slow line it
  // would hold the frame, the page's largest paint, up (home.mjs waits too).
  const framePainting = frameShowing.then(framePainted);
  // The title, outlined (title-art.mjs): fetched once the frame has painted,
  // then inked in letter by letter as text was.
  track(framePainting.then(() => import('./title-art.mjs')).then(({ TITLE_VIEWBOX, TITLE_LETTERS }) => {
    title.innerHTML = `<svg class="preloader-title-art" viewBox="${TITLE_VIEWBOX}" aria-hidden="true" focusable="false">${
      TITLE_LETTERS.map(d => `<path d="${d}"/>`).join('')}</svg>`;
    title.classList.add('is-ready');
    return paperInkEntrance(title, {
      motionPreference: preference, duration: PRELOADER.welcomeDuration, delay: 0,
      waitForFonts: false, createLayers: () => [createArtInkLayer(title.firstElementChild)], onComplete: finishTitle,
    });
  }).catch(error => {
    // Unshown, the title still counts as done, and the page still opens.
    console.warn('Welcome title:', error);
    finishTitle();
  }));

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
    ready() { completed++; sceneReady = true; },
    // Resolves once the count has reached 100, the entrances have finished and
    // the welcome has shown for its minimum; `reveal` then runs as it fades.
    async finish(reveal) {
      await Promise.all([titleFinished, paperFinished, counterFinished, new Promise(resolve => {
        const check = now => (minimumElapsed(now - started) ? resolve() : requestAnimationFrame(check));
        requestAnimationFrame(check);
      })]);
      cancelAnimationFrame(frame);
      clock.setLoading(100);
      loader.dataset.progress = '100';
      // Hold the completed value briefly before clearing the backdrop. The
      // placement's lift eases out as (1 - t)³, so it is half done at
      // t = 1 - ∛½; that moment lands where the fade (CSS `ease`, at 29.3%
      // of its time) has the welcome half gone.
      if (!preference.matches) {
        const halfDone = PAPER_PLACEMENT.duration * (1 - Math.cbrt(.5));
        placeFrame(performance.now() + PRELOADER.completeHold + PRELOADER.exit * .293 - halfDone);
        await new Promise(resolve => setTimeout(resolve, PRELOADER.completeHold));
      }
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
