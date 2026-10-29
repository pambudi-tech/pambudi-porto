import { cornerPitch } from './corners.mjs';
import { mountProjectFrame, projectFrameGap } from './project-frame.mjs';
import { mountProjectGallery } from './project-gallery.mjs';
import { STAMP, createPostageStamp, drawPostageStamp } from './postage-stamp.mjs';

export function mountProjectDetail(project) {
  document.title = `${project.title} — Ivan Pambudi`;
  for (const element of document.querySelectorAll('[data-project]')) {
    const key = element.dataset.project;
    element.textContent = project[key] ?? project.facts[key] ?? '';
  }

  const gallery = document.querySelector('.project-gallery');
  gallery?.setAttribute('aria-label', `${project.title} project gallery`);
  const figures = project.images.map((item, index) => {
    const figure = document.createElement('figure');
    figure.id = item.id;
    figure.className = index === 0 ? 'gallery-item cover-figure' : 'gallery-item';
    const media = document.createElement('div');
    media.className = 'project-image';
    const image = new Image(item.width, item.height);
    image.src = item.src;
    image.alt = item.alt;
    image.loading = index ? 'lazy' : 'eager';
    image.decoding = 'async';
    media.append(image);
    figure.append(media);
    return figure;
  });
  document.querySelector('.project-cover').replaceChildren(figures[0]);
  const galleryGrid = document.querySelector('.gallery-grid');
  galleryGrid?.replaceChildren(...figures.slice(1));
  const revealGallery = galleryGrid ? mountProjectGallery(galleryGrid, figures.slice(1), project.images.slice(1)) : null;

  const coverLayout = alignCoverToSurface(document.querySelector('.project-cover'), figures[0]);
  return {
    ready: coverLayout.ready, cover: figures[0],
    reveal() {
      document.body.classList.remove('project-arriving');
      coverLayout.reveal();
      revealGallery?.();
    },
    conceal() {
      document.body.classList.add('project-arriving', 'project-preview');
      document.documentElement.classList.add('project-route-leaving');
      coverLayout.unpick();
      revealGallery?.unpick();
    },
  };
}

function alignCoverToSurface(container, figure) {
  let finishLayout;
  const ready = new Promise(resolve => { finishLayout = resolve; });
  const drawFrame = mountProjectFrame(figure);
  const postage = createPostageStamp('hero-postage-paper', 'hero-postage-stamp');
  figure.append(postage);
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
      // Include the entire stitched frame in the middle grid column. The grid
      // gap therefore measures from its outer bounds to either text column.
      const imageBudget = innerWidth > 1000
        ? (opening.clientWidth - 80) * 1.9 / 3.9
        : opening.clientWidth - frameMargin * 2;
      const blocks = Math.max(1, Math.floor(imageBudget / (8 * pitch)));
      const imageWidth = blocks * 8 * pitch;
      opening.style.setProperty('--frame-margin', `${frameMargin}px`);
      opening.style.setProperty('--framed-cover-width', `${imageWidth + frameMargin * 2}px`);
      figure.style.setProperty('--cover-width', `${imageWidth}px`);
      const rect = figure.getBoundingClientRect();
      const left = rect.left - offsetX, top = rect.top - offsetY;
      const snap = (value, origin) => origin + Math.round((value - origin) / pitch) * pitch;
      offsetX = snap(left, innerWidth / 2) - left;
      offsetY = snap(top, innerHeight / 2) - top;
      // Snap the whole composition together so its 40px content gaps stay exact.
      opening.style.setProperty('--opening-offset-x', `${offsetX}px`);
      opening.style.setProperty('--opening-offset-y', `${offsetY}px`);
      drawFrame(rect.width, rect.height, pitch);
      const perf = STAMP.perf * pitch, inset = Math.round(perf * STAMP.margin);
      const width = rect.width + inset * 2, height = rect.height + inset * 2;
      drawPostageStamp(postage, width, height, perf);
      Object.assign(postage.style, { left: `${-inset}px`, top: `${-inset}px`, width: `${width}px`, height: `${height}px` });
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
