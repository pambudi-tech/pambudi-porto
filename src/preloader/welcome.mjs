import { DotClock } from '../clock/clock.mjs';
import { GRID } from '../stitch/model.mjs';
import { cornerPitch, surfaceOrigin } from '../stitch/corners.mjs';
import { PRELOADER, LoadingCounter, loadingProgress, minimumElapsed, settleWithin } from './loading-progress.mjs';
import { paperInkEntrance } from '../paper/paper-ink.mjs';
import { paperTarget, paperPlacementAt } from '../paper/paper-motion.mjs';
import { applyPaperPose } from '../paper/paper-pose.mjs';
import { createImageInkLayer } from '../ink/ink-growth.mjs';
import { registerPreloaderFrame } from '../paper/frame-registration.mjs';

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
export function startWelcome({ count, preference, clock: clockElement = document.getElementById('portfolio-clock') }) {
  const loader = document.getElementById('preloader');
  const title = loader.querySelector('.preloader-title');
  loader.style.setProperty('--preloader-exit', `${PRELOADER.exit}ms`);
  const paperPreview = loader.querySelector('.preloader-paper');
  const framePreview = paperPreview.querySelector('img');
  registerPreloaderFrame(framePreview);
  applyPaperPose(paperPreview, paperTarget(), paperPlacementAt(0, preference.matches));
  const clock = new DotClock(clockElement);
  const started = performance.now();
  const counter = new LoadingCounter(started);
  let finishCounter, finishTitle, finishPaper;
  const counterFinished = new Promise(resolve => { finishCounter = resolve; });
  const titleFinished = new Promise(resolve => { finishTitle = resolve; });
  const paperFinished = new Promise(resolve => { finishPaper = resolve; });
  // The page's own loads, its scene, the title's font and the frame.
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

  // Adobe's stylesheet loads without delaying the black screen; once its
  // face is in, the title inks in.
  const adobeStyles = document.getElementById('adobe-fonts');
  const stylesheetReady = new Promise((resolve, reject) => {
    const loaded = () => { adobeStyles.media = 'all'; resolve(); };
    if (adobeStyles.sheet) loaded();
    else {
      adobeStyles.addEventListener('load', loaded, { once: true });
      adobeStyles.addEventListener('error', () => reject(new Error('Adobe font stylesheet unavailable')), { once: true });
    }
  });
  track(stylesheetReady.then(async () => {
    // Changing a cached stylesheet's media does not register its font faces
    // until style recalculation. Flush that change before asking for the face.
    getComputedStyle(title).fontFamily;
    await new Promise(resolve => requestAnimationFrame(resolve));
    return document.fonts.load('48px "military-scribe"');
  }).then(fonts => {
    if (!fonts.length) throw new Error('Military Scribe unavailable');
    title.classList.add('is-ready');
    return paperInkEntrance(title, {
      motionPreference: preference, duration: PRELOADER.welcomeDuration, delay: 0,
      shapeText: true, onComplete: finishTitle,
    });
  }).catch(error => { finishTitle(); throw error; }));
  track(framePreview.decode().then(async () => {
    await paperInkEntrance(paperPreview, {
      motionPreference: preference, duration: PRELOADER.paperDuration, delay: 0,
      waitForFonts: false, createLayers: () => [createImageInkLayer(framePreview)],
      onComplete: finishPaper,
    });
    paperPreview.classList.add('is-ready');
  }).catch(() => finishPaper()));

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
      // Hold the completed value briefly before clearing the backdrop.
      if (!preference.matches) await new Promise(resolve => setTimeout(resolve, PRELOADER.completeHold));
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
      title.classList.add('is-ready');
      loader.querySelector('.preloader-retry').hidden = false;
    },
  };
}
