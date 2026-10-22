import { DotClock } from './clock.mjs';
import { GRID } from './model.mjs';
import { cornerPitch } from './corners.mjs';
import { PRELOADER, LoadingCounter, loadingProgress, minimumElapsed, settleWithin } from './loading-progress.mjs';
import { paperInkEntrance } from './paper-ink.mjs';
import { paperTarget, paperPlacementAt } from './paper-motion.mjs';
import { applyPaperPose } from './paper-pose.mjs';
import { createImageInkLayer } from './ink-growth.mjs';
import { registerPreloaderFrame } from './frame-registration.mjs';

const loader = document.getElementById('preloader');
const surface = document.getElementById('surface');
surface.inert = true;
const title = loader.querySelector('.preloader-title');
loader.style.setProperty('--preloader-exit', `${PRELOADER.exit}ms`);
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const paperPreview = loader.querySelector('.preloader-paper');
const framePreview = paperPreview.querySelector('img');
registerPreloaderFrame(framePreview);
applyPaperPose(paperPreview, paperTarget(), paperPlacementAt(0, preference.matches));
const clock = new DotClock(document.getElementById('portfolio-clock'));
const started = performance.now();
const counter = new LoadingCounter(started);
let finishCounter;
const counterFinished = new Promise(resolve => { finishCounter = resolve; });
let completed = 0, sceneReady = false, failed = false, frame;
// Includes the SVG as its own resource, alongside the three portfolio images.
const total = surface.querySelectorAll('img').length + paperPreview.querySelectorAll('img').length + 1 + 4;

function resizeClock() {
  const width = innerWidth, height = innerHeight;
  clock.resize(width, height, {
    x: Math.round(width / 2), y: Math.round((height - (width <= 540 ? 130 : 80)) / 2),
    scale: cornerPitch(width) / GRID,
  });
}
clock.setLoading(0);
resizeClock();
window.addEventListener('resize', resizeClock);

function track(task) {
  return settleWithin(task).then(value => { completed++; return value; });
}
function progress(now) {
  const loaded = Math.min(sceneReady ? 100 : 99, loadingProgress(completed, total));
  const percent = counter.update(loaded, now);
  clock.setLoading(percent);
  loader.dataset.progress = String(percent);
  if (percent === 100) finishCounter();
  if (!failed && percent < 100) frame = requestAnimationFrame(progress);
}
frame = requestAnimationFrame(progress);

function fadeOut() {
  return new Promise(resolve => {
    if (preference.matches) { loader.classList.add('is-leaving'); resolve(); return; }
    const finish = event => {
      if (event && event.target !== loader) return;
      loader.removeEventListener('transitionend', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, PRELOADER.exit + 100);
    loader.addEventListener('transitionend', finish);
    loader.classList.add('is-leaving');
  });
}

async function boot() {
  // Fetch the traced artwork too; it is not an <img> in the page itself.
  const artwork = new Image();
  artwork.src = new URL('./assets/wordmark-source.png', import.meta.url).href;
  // Fetch Adobe's stylesheet without delaying the initial black screen.
  const adobeStyles = document.getElementById('adobe-fonts');
  const stylesheetReady = new Promise((resolve, reject) => {
    const loaded = () => { adobeStyles.media = 'all'; resolve(); };
    if (adobeStyles.sheet) loaded();
    else {
      adobeStyles.addEventListener('load', loaded, { once: true });
      adobeStyles.addEventListener('error', () => reject(new Error('Adobe font stylesheet unavailable')), { once: true });
    }
  });
  let finishWelcome;
  const welcomeFinished = new Promise(resolve => { finishWelcome = resolve; });
  let finishPaper;
  const paperFinished = new Promise(resolve => { finishPaper = resolve; });
  const fontReady = stylesheetReady.then(async () => {
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
      shapeText: true, onComplete: finishWelcome,
    });
  });
  const application = track(import('./app.mjs'));
  await Promise.all([
    ...[...surface.querySelectorAll('img'), artwork, framePreview].map(image => track(
      image === framePreview
        ? image.decode().then(async () => {
          await paperInkEntrance(paperPreview, {
            motionPreference: preference, duration: PRELOADER.paperDuration, delay: 0,
            waitForFonts: false, createLayers: () => [createImageInkLayer(framePreview)],
            onComplete: finishPaper,
          });
          paperPreview.classList.add('is-ready');
        })
        : image.decode(),
    )),
    track(document.fonts.load('16px "Syne Mono"')),
    track(fontReady),
    application,
  ]);
  const app = await application;
  if (!app) throw new Error('The portfolio could not start.');
  const scene = await app.preparePortfolio({ clock });
  completed++;
  sceneReady = true;
  await Promise.all([welcomeFinished, paperFinished, counterFinished, new Promise(resolve => {
    const check = now => {
      if (minimumElapsed(now - started)) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  })]);
  cancelAnimationFrame(frame);
  clock.setLoading(100);
  loader.dataset.progress = '100';
  // Hold the completed value briefly before clearing the backdrop.
  if (!preference.matches) await new Promise(resolve => setTimeout(resolve, PRELOADER.completeHold));
  window.removeEventListener('resize', resizeClock);
  scene.start();
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-revealing');
  await fadeOut();
  clock.finishLoading();
  surface.inert = false;
  surface.removeAttribute('aria-busy');
  document.body.classList.remove('is-revealing');
  document.body.dataset.ready = 'true';
  loader.remove();
}

boot().catch(error => {
  failed = true;
  cancelAnimationFrame(frame);
  console.error('Portfolio startup:', error);
  title.textContent = 'Unable to load. Please try again.';
  title.classList.add('is-ready');
  loader.querySelector('.preloader-retry').hidden = false;
});
