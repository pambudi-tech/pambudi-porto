import { mountProjectFrame } from './project-frame.mjs';
import { createPostageStamp, drawPostageStamp, stampOutline } from '../works/postage-stamp.mjs';
import { mountProjectGallery } from './project-gallery.mjs';
import { heroSize, snapToCloth } from './hero-layout.mjs';
import { ENTRANCE } from '../stitch/stitch-entrance.mjs';
import { FRAME_SWEEP } from './project-stitches.mjs';

// How long the hero takes to arrive once revealed, in ms: its stitched frame,
// the slowest part.
export const ARRIVAL = ENTRANCE.delay + FRAME_SWEEP + ENTRANCE.stitch;

export function mountProjectDetail(project) {
  document.title = `${project.title} — Ivan Pambudi`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', project.subtitle || project.overview);
  for (const element of document.querySelectorAll('[data-project]')) {
    const key = element.dataset.project;
    element.textContent = project[key] ?? project.facts[key] ?? '';
    // A case study may leave its subtitle out; its line goes with it.
    if (!element.textContent && element.closest('.project-overview')) element.remove();
  }
  // A live project links out below its overview.
  if (project.site) {
    const visit = Object.assign(document.createElement('a'), {
      className: 'project-visit', href: project.site, target: '_blank', rel: 'noopener noreferrer', textContent: 'visit site',
    });
    document.querySelector('.project-overview').append(visit);
  }

  // The cover leads; the project's other images wait in the depth gallery
  // the "gallery" seal opens.
  const [item] = project.images;
  const cover = document.createElement('figure');
  cover.id = item.id;
  cover.className = 'gallery-item cover-figure';
  const media = document.createElement('div');
  media.className = 'project-image';
  const image = new Image(item.width, item.height);
  image.src = item.src;
  image.alt = item.alt;
  image.decoding = 'async';
  if (item.focus) image.style.objectPosition = item.focus;
  media.append(image);
  cover.append(media);
  // Work behind a passcode says so, as its card does, on a tag hanging below
  // the stamp toward its right.
  if (project.passcode) {
    const tag = Object.assign(document.createElement('span'), { className: 'works-protected cover-protected', textContent: 'passcode protected' });
    tag.setAttribute('aria-hidden', 'true');
    cover.prepend(tag);
  }
  document.querySelector('.project-cover').replaceChildren(cover);

  const coverLayout = alignCoverToSurface(document.querySelector('.project-cover'), cover);
  mountScrollFades();
  // A locked project's gallery waits for its PIN (mountGallery, below).
  let gallery = null;
  const mountGallery = images => {
    gallery = mountProjectGallery({
      images, title: project.title,
      seal: document.querySelector('.project-gallery-seal'),
      motionPreference: matchMedia('(prefers-reduced-motion: reduce)'),
    });
  };
  if (!project.locked) mountGallery(project.images.slice(1));
  // Opened directly, the cover eases from the centre to its focus; arriving
  // from its card, the flight has already eased it there.
  const slideCover = () => {
    if (!item.focus) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    image.animate([{ objectPosition: '50% 50%' }, { objectPosition: item.focus }], {
      duration: reduced ? 0 : 900, delay: reduced ? 0 : 120, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards',
    });
  };
  return {
    ready: coverLayout.ready, cover, mountGallery,
    closeGallery: () => gallery?.reset(),
    reveal({ slide = true } = {}) {
      document.body.classList.remove('project-arriving');
      coverLayout.reveal();
      if (slide) slideCover();
    },
    conceal() {
      document.body.classList.add('project-arriving', 'project-preview');
      document.documentElement.classList.add('project-route-leaving');
      coverLayout.unpick();
    },
  };
}

function alignCoverToSurface(container, figure) {
  let finishLayout;
  const ready = new Promise(resolve => { finishLayout = resolve; });
  const drawFrame = mountProjectFrame(figure);
  const postage = createPostageStamp('hero-postage-paper', 'hero-postage-stamp');
  figure.append(postage);
  const media = figure.querySelector('.project-image');
  const opening = container.closest('.project-opening');
  let frame, offsetX = 0, offsetY = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      // This page's fixed, non-navigable surface camera is centered on cell 0,0.
      // Its sizes come from the shared calculation (hero-layout.mjs), which the
      // works row uses too.
      const { pitch, frameMargin, shrinkX, shrinkY, perf, inset, imageWidth, imageHeight } = heroSize(innerWidth, opening.clientWidth);
      opening.style.setProperty('--frame-margin', `${frameMargin}px`);
      opening.style.setProperty('--framed-cover-width', `${imageWidth + frameMargin * 2}px`);
      figure.style.setProperty('--cover-width', `${imageWidth}px`);
      figure.style.setProperty('--cover-height', imageHeight ? `${imageHeight}px` : 'auto');
      const rect = figure.getBoundingClientRect();
      // Snap in page coordinates, so the opening stays put while it scrolls.
      const left = rect.left - offsetX, top = rect.top - offsetY + scrollY;
      offsetX = snapToCloth(left, innerWidth / 2, pitch) - left;
      offsetY = snapToCloth(top, innerHeight / 2, pitch) - top;
      // Snap the whole composition together so its 40px content gaps stay exact.
      opening.style.setProperty('--opening-offset-x', `${offsetX}px`);
      opening.style.setProperty('--opening-offset-y', `${offsetY}px`);
      drawFrame(rect.width, rect.height, pitch);
      const width = rect.width - shrinkX * 2 + inset * 2, height = rect.height - shrinkY * 2 + inset * 2;
      // As on the works stamps, the photo fills the whole stamp, cut to its
      // perforations, over its paper.
      drawPostageStamp(postage, width, height, perf, { whole: true });
      const x = shrinkX - inset, y = shrinkY - inset;
      Object.assign(postage.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
      figure.style.setProperty('--stamp-x', `${x}px`);
      figure.style.setProperty('--stamp-y', `${y}px`);
      media.style.clipPath = `path('${stampOutline(width, height, perf)}')`;
      // Let any ResizeObserver correction and the grid snap reach layout
      // before a departing work measures this page's final hero rectangle.
      requestAnimationFrame(() => requestAnimationFrame(() => finishLayout()));
    });
  };
  new ResizeObserver(schedule).observe(opening);
  window.addEventListener('resize', schedule, { passive: true });
  schedule();
  return { ready, reveal: () => drawFrame.reveal(), unpick: () => drawFrame.unpick() };
}

// Fades at the screen's top and bottom while the page has more to scroll that
// way, each stronger the more is left, up to the last 48 pixels.
function mountScrollFades() {
  const fades = ['top', 'bottom'].map(edge => Object.assign(document.createElement('div'), { className: `project-fade project-fade-${edge}` }));
  fades.forEach(fade => fade.setAttribute('aria-hidden', 'true'));
  document.body.append(...fades);
  const root = document.documentElement;
  const update = () => {
    const below = root.scrollHeight - innerHeight - scrollY;
    root.style.setProperty('--fade-top', Math.min(1, Math.max(0, scrollY) / 48).toFixed(3));
    root.style.setProperty('--fade-bottom', Math.min(1, Math.max(0, below) / 48).toFixed(3));
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  new ResizeObserver(update).observe(document.body);
  update();
}
