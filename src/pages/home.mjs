import { DotClock } from '../clock/clock.mjs';
import { settleWithin } from '../preloader/loading-progress.mjs';
import { fitClock, startWelcome, welcomeSeen } from '../preloader/welcome.mjs';
import { projectId } from '../content/routes.mjs';
import { mountPress } from '../shared/press.mjs';
import { mountTooltips } from '../shared/tooltip.mjs';

// The index, and every project's own address, /work/<id>: there the project
// shows over the works row as though its card had just been chosen, so
// "back" flies its stamp home as ever. The first page of a session plays the
// welcome (welcome.mjs); any later one shows as soon as it is ready.
const surface = document.getElementById('surface');
surface.inert = true;
const preference = matchMedia('(prefers-reduced-motion: reduce)');
mountPress(preference);
mountTooltips();
const opened = projectId(location.pathname);
const welcome = welcomeSeen() ? null : startWelcome({
  // The portfolio's images, the traced artwork, Syne Mono and the scene's code.
  count: surface.querySelectorAll('img').length + 3, preference,
});
const clock = welcome?.clock ?? new DotClock(document.getElementById('portfolio-clock'));
if (!welcome) fitClock(clock);
const track = task => (welcome ? welcome.track(task) : settleWithin(task));

// The page's images name their files in data-src and data-srcset, so the
// welcome's own frame and code load first; they load once it shows.
function loadImages(root) {
  for (const image of root.querySelectorAll('img[data-src]')) {
    if (image.dataset.srcset) image.srcset = image.dataset.srcset;
    image.src = image.dataset.src;
    delete image.dataset.src;
    delete image.dataset.srcset;
  }
}

async function boot() {
  // The welcome's frame first, painted; then the page's code and images
  // behind it, well within the welcome's own time.
  if (welcome) await welcome.framePainted;
  const application = track(import('../surface/scene.mjs'));
  // The works gallery is only needed after the reveal; fetch it alongside.
  const gallery = import('../works/gallery.mjs');
  loadImages(surface);
  // Fetch the traced artwork too; it is not an <img> in the page itself.
  const artwork = new Image();
  artwork.src = '/assets/wordmark-source.webp';
  await Promise.all([
    ...[...surface.querySelectorAll('img'), artwork].map(image => track(image.decode())),
    track(document.fonts.load('16px "Syne Mono"')),
    application,
  ]);
  const app = await application;
  if (!app) throw new Error('The portfolio could not start.');
  const scene = await app.preparePortfolio({ clock });
  scene.placePaper();
  const makeWorks = async () => {
    const { WorksGallery } = await gallery;
    return new WorksGallery(document.getElementById('works'), {
      scene, motionPreference: preference,
      paper: surface.querySelector('.portfolio-paper'),
      frontSeal: surface.querySelector('.paper-front .works-seal'),
    });
  };
  // A project's address: the project is up, over the works row, before the
  // page shows; its entrance plays once the page does.
  const works = opened ? await makeWorks() : null;
  let pageShown;
  const showing = new Promise(resolve => { pageShown = resolve; });
  if (works) await new Promise(resolve => works.openProject(opened, () => { resolve(); return showing; }));
  // The entrances (the stitches, the wordmark, the seal's pour) begin as the
  // page shows, not behind the welcome; the paper has settled already.
  const show = () => {
    document.body.classList.remove('is-loading');
    scene.start();
  };
  if (welcome) {
    welcome.ready();
    await welcome.finish(show);
  } else {
    // With no welcome counter to roll over, the clock's dots fade in, each
    // at its own random moment, as the page shows.
    clock.finishLoading({ immediate: true });
    clock.fadeInDots();
    show();
  }
  pageShown();
  if (welcome) clock.finishLoading();
  surface.inert = false;
  surface.removeAttribute('aria-busy');
  document.body.dataset.ready = 'true';
  document.getElementById('preloader')?.remove();
  if (works) return;
  const row = await makeWorks();
  if (location.hash === '#works') row.open({ history: false });
  else row.warm();
}

boot().catch(error => {
  if (welcome) welcome.fail(error);
  else {
    console.error('Portfolio startup:', error);
    document.body.classList.remove('is-loading');
  }
});
