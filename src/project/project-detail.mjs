import { cornerPitch } from '../stitch/corners.mjs';
import { mountProjectFrame, projectFrameGap } from './project-frame.mjs';
import { STAMP, createPostageStamp, drawPostageStamp, stampOutline } from '../works/postage-stamp.mjs';
import { mountProjectGallery } from './project-gallery.mjs';
import { CARD_GUARD } from '../works/layout.mjs';

export function mountProjectDetail(project) {
  document.title = `${project.title} — Ivan Pambudi`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', project.subtitle);
  for (const element of document.querySelectorAll('[data-project]')) {
    const key = element.dataset.project;
    element.textContent = project[key] ?? project.facts[key] ?? '';
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
  media.append(image);
  cover.append(media);
  document.querySelector('.project-cover').replaceChildren(cover);

  const coverLayout = alignCoverToSurface(document.querySelector('.project-cover'), cover);
  mountScrollFades();
  const gallery = mountProjectGallery({
    images: project.images.slice(1), title: project.title,
    seal: document.querySelector('.project-gallery-seal'),
    motionPreference: matchMedia('(prefers-reduced-motion: reduce)'),
  });
  return {
    ready: coverLayout.ready, cover,
    closeGallery: gallery.reset,
    reveal() {
      document.body.classList.remove('project-arriving');
      coverLayout.reveal();
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
      // Reuse its actual pitch; 8 × 6 cells keep both 4:3 and a centered grid fit.
      const pitch = cornerPitch(innerWidth);
      const frameMargin = projectFrameGap(pitch) + pitch;
      // The stitched corners keep to the figure; the stamp sits half a block
      // smaller inside it, so the gap around it widens.
      const shrinkX = 2 * pitch, shrinkY = 1.5 * pitch;
      const perf = STAMP.perf * pitch, inset = Math.round(perf * STAMP.margin);
      let imageWidth, imageHeight = null;
      if (innerWidth > 1000) {
        // Include the entire stitched frame in the middle grid column. The grid
        // gap therefore measures from its outer bounds to either text column.
        const blocks = Math.max(1, Math.floor((opening.clientWidth - 80) * 1.9 / 3.9 / (8 * pitch)));
        imageWidth = blocks * 8 * pitch;
      } else {
        // One column: the stamp is the works index's card to the pixel, so the
        // flight between them only moves it.
        const card = Math.round((innerWidth <= 540 ? CARD_GUARD.phone : CARD_GUARD.tablet) / perf) * perf;
        const cardHeight = Math.round(((card - inset * 2) / STAMP.window + inset * 2) / perf) * perf;
        imageWidth = card - inset * 2 + shrinkX * 2;
        imageHeight = cardHeight - inset * 2 + shrinkY * 2;
      }
      opening.style.setProperty('--frame-margin', `${frameMargin}px`);
      opening.style.setProperty('--framed-cover-width', `${imageWidth + frameMargin * 2}px`);
      figure.style.setProperty('--cover-width', `${imageWidth}px`);
      figure.style.setProperty('--cover-height', imageHeight ? `${imageHeight}px` : 'auto');
      const rect = figure.getBoundingClientRect();
      const left = rect.left - offsetX, top = rect.top - offsetY;
      const snap = (value, origin) => origin + Math.round((value - origin) / pitch) * pitch;
      offsetX = snap(left, innerWidth / 2) - left;
      offsetY = snap(top, innerHeight / 2) - top;
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
  window.addEventListener('scroll', schedule, { passive: true });
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
