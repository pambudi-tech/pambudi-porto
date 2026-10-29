import { preparePortfolio } from './app.mjs';
import { mountProjectDetail } from './project-detail.mjs';
import { WORKS } from './works-data.mjs';
import { yearLabel } from './works.mjs';
import { IntroInkHover } from './intro-ink-hover.mjs';

// Ocean sample content for the shared project template, drawn from the
// supplied LinkedIn description. Unsplash photos are temporary layout samples.
const oceanProject = {
  title: 'Ocean by BCA',
  category: 'Product design · Design systems',
  subtitle: 'Embedded as a product design retainer for a new digital banking platform for business customers.',
  overview: 'My work spanned design systems, product design, and visual direction—from establishing a deep-blue, dark glassmorphism aesthetic to redesigning the homepage and defining onboarding forms.',
  facts: {
    client: 'Bank Central Asia',
    role: 'Designer · Embedded retainer',
    period: 'Jul 2024 — May 2026',
    scope: 'Design systems, product design & visual direction',
  },
  site: WORKS.find(work => work.id === 'ocean').site,
  images: [
    { id: 'cover', src: WORKS.find(work => work.id === 'ocean').image, width: 1200, height: 900, title: 'The homepage revamp', caption: 'Visual design & interactive prototype', alt: 'Temporary Unsplash photo of aerial ocean waves and white foam' },
    { id: 'gallery-ocean', src: 'https://images.unsplash.com/photo-1735300022510-9ed02ca92f39?auto=format&fit=crop&w=1600&h=1000&q=85', width: 1600, height: 1000, layout: 'wide', accent: 'curl', corner: 'top-right', alt: 'Temporary Unsplash photo of a breaking blue ocean wave' },
    { id: 'gallery-surf', src: 'https://images.unsplash.com/photo-1651742740055-a4b4ff765225?auto=format&fit=crop&w=1200&h=900&q=85', width: 1200, height: 900, accent: 'flower', corner: 'top-left', alt: 'Temporary Unsplash photo of teal water and foamy surf' },
    { id: 'gallery-water', src: 'https://images.unsplash.com/photo-1641994396897-d8ab8d17b24e?auto=format&fit=crop&w=1200&h=900&q=85', width: 1200, height: 900, accent: 'curl', corner: 'bottom-right', alt: 'Temporary Unsplash photo of rippling deep-blue water' },
    { id: 'gallery-coast', src: 'https://images.unsplash.com/photo-1611794469140-f93afd4b3ed0?auto=format&fit=crop&w=1600&h=900&q=85', width: 1600, height: 900, layout: 'wide', accent: 'flower', corner: 'bottom-left', alt: 'Temporary Unsplash photo of waves reaching the shore' },
  ],
};

// Sample cards share this detail template, with their own cover and existing
// gallery metadata. A clicked photograph therefore remains the same project.
const selected = WORKS.find(work => work.id === new URLSearchParams(location.search).get('work'));
const project = selected && selected.id !== 'ocean' ? {
  ...oceanProject, title: selected.title, category: selected.tags.join(' · '),
  subtitle: selected.summary, overview: '', site: selected.site,
  facts: { client: selected.client, role: selected.role, period: yearLabel(selected), scope: selected.tags.join(' · ') },
  images: [{ ...oceanProject.images[0], src: selected.image, alt: selected.alt }, ...oceanProject.images.slice(1)],
} : oceanProject;

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
