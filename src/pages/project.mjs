import { preparePortfolio } from '../surface/scene.mjs';
import { mountProjectDetail } from '../project/project-detail.mjs';
import { projectId, projectPage } from '../content/works.mjs';
import { IntroInkHover } from '../ink/intro-ink-hover.mjs';

// /work/<id>: the case study in content/projects/, or for a work without one
// yet, its card's details over the stand-in gallery.
const project = projectPage(projectId(location.pathname));
if (!project) {
  location.replace('/#works');
  await new Promise(() => {});
}

await document.fonts.load('16px "Syne Mono"');
const detail = mountProjectDetail(project);
// The homepage paper's ink bleed, following the pointer over the project's words.
new IntroInkHover(document.querySelector('.project-opening'), matchMedia('(prefers-reduced-motion: reduce)'), {
  selector: '.project-intro h1, .project-intro p, .project-facts dt, .project-facts dd, .project-overview p',
});
await Promise.allSettled([detail.ready, detail.cover.querySelector('img').decode()]);
const preview = window !== window.top && new URLSearchParams(location.search).has('transition-preview');
const scene = await preparePortfolio({ surfaceOnly: true, surfaceNavigation: false, stitching: false });
scene.start();
document.getElementById('surface').setAttribute('aria-busy', 'false');
if (preview) {
  document.body.classList.add('project-preview');
  window.addEventListener('project-route-enter', () => {
    document.body.classList.remove('project-preview');
    detail.reveal();
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
document.documentElement.dataset.projectReady = 'true';
if (!preview) requestAnimationFrame(() => detail.reveal());
