import { preparePortfolio } from '../surface/scene.mjs';
import { ARRIVAL, mountProjectDetail } from '../project/project-detail.mjs';
import { WORKS, fullCover, projectId, projectPage } from '../content/works.mjs';
import { IntroInkHover } from '../ink/intro-ink-hover.mjs';
import { fetchPrivate } from '../project/project-pass.mjs';
import { mountPinPanel } from '../project/project-pin.mjs';
import { revealCover } from '../project/cover-reveal.mjs';
import { mountSwipeBack } from '../project/swipe-back.mjs';
import { WaxInteraction } from '../wax/wax-interaction.mjs';
import { startWelcome, welcomeSeen } from '../preloader/welcome.mjs';
import { mountPress } from '../shared/press.mjs';

// work.html?work=<id>: the case study in content/projects/, or for a work
// without one yet, its card's details over the stand-in gallery. The index
// shows it at /work/<id>, over its works row (home.mjs).
mountPress();
const id = projectId(location.pathname) ?? new URLSearchParams(location.search).get('work');
const project = projectPage(id);
if (!project) {
  location.replace('/#works');
  await new Promise(() => {});
}
// Opened as the session's first page, the project plays the welcome first
// (welcome.mjs); measured for a flight from the works row, never.
const preview = window !== window.top && new URLSearchParams(location.search).has('transition-preview');
const welcome = preview || welcomeSeen() ? null : startWelcome({
  // Syne Mono, and the hero with its cover.
  count: 2, preference: matchMedia('(prefers-reduced-motion: reduce)'),
});
if (welcome) document.body.classList.add('is-loading');
else {
  document.getElementById('preloader')?.remove();
  document.querySelector('.project-welcome-clock')?.remove();
}
const track = task => welcome?.track(task) ?? task;
// A protected project opens at once for a visitor with a pass; otherwise its
// seal waits, out of the scene's reach, behind the PIN panel.
const seal = document.querySelector('.project-gallery-seal');
if (project.locked) {
  const opened = await fetchPrivate(id);
  if (opened) {
    project.images.push(...opened.images);
    project.site = opened.site;
  } else {
    seal.classList.remove('works-seal');
    document.body.classList.add('project-locked');
  }
}
const locked = document.body.classList.contains('project-locked');
// With the pass, the cover is the full one, private until then; without it,
// the coarse, dithered preview.
const work = WORKS.find(entry => entry.id === id);
if (project.passcode && !locked) project.images[0].src = fullCover(work);

await track(document.fonts.load('16px "Syne Mono"'));
const detail = mountProjectDetail({ ...project, locked });
// The right PIN brings the gallery and the live site, and the seal settles in with its wax-flow
// entrance where the panel was.
const pin = !locked ? null : mountPinPanel({
  title: project.title,
  async onUnlock() {
    // Shown over the works row, it tells the row the pass is in.
    if (preview) window.parent.dispatchEvent(new Event('works-pass'));
    const cover = detail.cover.querySelector('img'), full = Object.assign(new Image(), { src: fullCover(work) });
    // The full cover arrives over the preview as a dither that sharpens into
    // the photograph.
    full.decode().then(() => revealCover(cover, full, { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }), () => {});
    const opened = await fetchPrivate(id);
    if (opened) {
      detail.mountGallery(opened.images);
      detail.showSite(opened.site);
    }
    document.body.classList.remove('project-locked');
    seal.classList.add('works-seal');
    new WaxInteraction(seal, matchMedia('(prefers-reduced-motion: reduce)'));
  },
});
// The homepage paper's ink bleed, following the pointer over the project's words.
new IntroInkHover(document.querySelector('.project-opening'), matchMedia('(prefers-reduced-motion: reduce)'), {
  selector: '.project-intro h1, .project-intro p, .project-facts dt, .project-facts dd, .project-overview p',
});
await track(Promise.allSettled([detail.ready, detail.cover.querySelector('img').decode()]));
const scene = await preparePortfolio({ surfaceOnly: true, surfaceNavigation: false, stitching: false });
scene.start();
document.getElementById('surface').setAttribute('aria-busy', 'false');
if (preview) {
  document.body.classList.add('project-preview');
  window.addEventListener('project-route-enter', () => {
    document.body.classList.remove('project-preview');
    detail.reveal({ slide: false });
    pin?.arrive(ARRIVAL * .9);
  }, { once: true });
  window.addEventListener('project-route-exit', () => detail.conceal(), { once: true });
  // Before the stamp flies back, the gallery closes so the cover is in place.
  window.addEventListener('project-route-reset', () => detail.closeGallery());
  document.querySelector('.project-nav-back').addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.parent.dispatchEvent(new Event('project-route-back'));
  });
}
// A swipe to the right goes back as the "back" link does: over the works
// row, by the flight home.
mountSwipeBack(() => {
  if (preview) window.parent.dispatchEvent(new Event('project-route-back'));
  else document.querySelector('.project-nav-back').click();
});
document.documentElement.dataset.projectReady = 'true';
if (welcome) {
  welcome.ready();
  await welcome.finish(() => document.body.classList.remove('is-loading'));
  document.querySelector('.project-welcome-clock')?.remove();
}
// The PIN panel arrives as the hero nearly has.
if (!preview) requestAnimationFrame(() => { detail.reveal(); pin?.arrive(ARRIVAL * .9); });
