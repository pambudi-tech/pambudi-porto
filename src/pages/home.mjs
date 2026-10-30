import { DotClock } from '../clock/clock.mjs';
import { settleWithin } from '../preloader/loading-progress.mjs';
import { fitClock, startWelcome, welcomeSeen } from '../preloader/welcome.mjs';
import { projectId } from '../content/works.mjs';

// The index, and every project's own address, /work/<id>: there the project
// shows over the works row as though its card had just been chosen, so
// "back" flies its stamp home as ever. The first page of a session plays the
// welcome (welcome.mjs); any later one shows as soon as it is ready.
const surface = document.getElementById('surface');
surface.inert = true;
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const opened = projectId(location.pathname);
const welcome = welcomeSeen() ? null : startWelcome({
  // The portfolio's images, the traced artwork, Syne Mono and the scene's code.
  count: surface.querySelectorAll('img').length + 3, preference,
});
const clock = welcome?.clock ?? new DotClock(document.getElementById('portfolio-clock'));
if (!welcome) fitClock(clock);
const track = task => (welcome ? welcome.track(task) : settleWithin(task));

async function boot() {
  // Fetch the traced artwork too; it is not an <img> in the page itself.
  const artwork = new Image();
  artwork.src = '/assets/wordmark-source.webp';
  const application = track(import('../surface/scene.mjs'));
  // The works gallery is only needed after the reveal; fetch it alongside.
  const gallery = import('../works/gallery.mjs');
  await Promise.all([
    ...[...surface.querySelectorAll('img'), artwork].map(image => track(image.decode())),
    track(document.fonts.load('16px "Syne Mono"')),
    application,
  ]);
  const app = await application;
  if (!app) throw new Error('The portfolio could not start.');
  const scene = await app.preparePortfolio({ clock });
  scene.start();
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
  const show = () => document.body.classList.remove('is-loading');
  if (welcome) {
    welcome.ready();
    await welcome.finish(show);
  } else show();
  pageShown();
  clock.finishLoading();
  surface.inert = false;
  surface.removeAttribute('aria-busy');
  document.body.dataset.ready = 'true';
  document.getElementById('preloader')?.remove();
  if (works) return;
  const row = await makeWorks();
  if (location.hash === '#works') row.open({ history: false });
}

boot().catch(error => {
  if (welcome) welcome.fail(error);
  else {
    console.error('Portfolio startup:', error);
    document.body.classList.remove('is-loading');
  }
});
