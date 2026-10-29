import { BRAND_UNPICK_SWEEP, UNPICK_STITCH } from './stitch-unpick.mjs';
import { cornerPitch } from './corners.mjs';
import { STAMP, createPostageStamp, drawPostageStamp, stampOutline } from './postage-stamp.mjs';

export const PROJECT_FLIGHT = Object.freeze({
  duration: BRAND_UNPICK_SWEEP + UNPICK_STITCH + 120,
  easing: 'cubic-bezier(.65, 0, .25, 1)',
});

const PROJECT_NAV_MORPH = Object.freeze({
  duration: 640,
  easing: 'cubic-bezier(.64, 0, .78, 0)',
  reverseEasing: 'cubic-bezier(.22, 1, .36, 1)',
});

// Keep the collection controls and their selected pill through the handoff.
// One reversible timeline changes the shell's width and crossfades its labels.
function createProjectNavMorph(gallery, title) {
  const toggle = gallery.nav.querySelector('.works-nav-toggle');
  const bounds = toggle.getBoundingClientRect();
  const selected = toggle.querySelector('[aria-pressed="true"]').getBoundingClientRect();
  const stage = Object.assign(document.createElement('div'), { className: 'works-nav-morph' });
  const shell = Object.assign(document.createElement('span'), { className: 'works-nav-morph-shell' });
  const pill = Object.assign(document.createElement('span'), { className: 'works-nav-morph-pill' });
  const name = Object.assign(document.createElement('span'), { className: 'works-project-name', textContent: title });
  shell.setAttribute('aria-hidden', 'true');
  pill.setAttribute('aria-hidden', 'true');
  stage.style.width = `${bounds.width}px`;
  stage.style.height = `${bounds.height}px`;
  toggle.style.width = `${bounds.width}px`;
  Object.assign(pill.style, {
    left: `${selected.left - bounds.left}px`, top: `${selected.top - bounds.top}px`,
    width: `${selected.width}px`, height: `${selected.height}px`,
  });
  toggle.replaceWith(stage);
  stage.append(shell, pill, toggle, name);
  const nameWidth = name.getBoundingClientRect().width;
  const animations = [];
  return {
    enter(destinationNav) {
      const options = { duration: gallery.reduced ? 0 : PROJECT_NAV_MORPH.duration, easing: PROJECT_NAV_MORPH.easing, fill: 'both' };
      const animate = (element, frames) => animations.push(element.animate(frames, options));
      const nav = gallery.nav.getBoundingClientRect();
      animate(gallery.nav, [
        { left: `${nav.left + nav.width / 2}px` },
        { left: `${destinationNav.left + destinationNav.width / 2}px` },
      ]);
      animate(stage, [{ width: `${bounds.width}px` }, { width: `${nameWidth}px` }]);
      animate(shell, [
        { borderColor: 'rgb(73 72 63 / .14)', outlineColor: 'transparent' },
        { borderColor: 'transparent', outlineColor: 'rgb(73 72 63 / .14)' },
      ]);
      animate(pill, [
        { left: `${selected.left - bounds.left}px`, top: `${selected.top - bounds.top}px`, width: `${selected.width}px`, height: `${selected.height}px` },
        { left: '3px', top: '3px', width: `${nameWidth - 6}px`, height: `${bounds.height - 6}px` },
      ]);
      animate(toggle, [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-4px)', offset: .45 },
        { opacity: 0, transform: 'translateY(-4px)' },
      ]);
      animate(name, [
        { opacity: 0, transform: 'translateY(4px)' },
        { opacity: 0, transform: 'translateY(4px)', offset: .25 },
        { opacity: 1, transform: 'translateY(0)', offset: .85 },
        { opacity: 1, transform: 'translateY(0)' },
      ]);
      return Promise.all(animations.map(animation => animation.finished));
    },
    leave() {
      // Reversing also reverses the easing. Keep the approved return motion,
      // and give the opening that same gradual build instead of an early snap.
      animations.forEach(animation => {
        animation.effect.updateTiming({ easing: PROJECT_NAV_MORPH.reverseEasing });
        animation.reverse();
      });
      return Promise.all(animations.map(animation => animation.finished));
    },
    restore() {
      animations.forEach(animation => animation.cancel());
      toggle.style.removeProperty('width');
      stage.replaceWith(toggle);
    },
  };
}

export function projectHref(work, base) {
  const url = new URL(work.href, base);
  if (url.pathname.endsWith('/ocean.html')) url.searchParams.set('work', work.id);
  return url.href;
}

export const flightBox = rect => ({
  left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
});

// Where a card's photo sits in its window: slid by the row's parallax. The
// cover holds the same photo centred, so the flight eases between the two
// instead of swapping one crop for another.
const photoPose = entry => {
  const width = entry.image.clientWidth;
  return { translate: `${width ? (entry.parallax / width * 100).toFixed(3) : 0}% 0` };
};
const COVER_POSE = { translate: '0% 0' };

// The flight's stamp at a size: its paper whole, under the photo, which fills
// it to its perforations, as on a card and on the cover.
function shapeFlight(stamp, media, width, height, perf) {
  drawPostageStamp(stamp, width, height, perf, { whole: true });
  media.style.clipPath = `path('${stampOutline(width, height, perf)}')`;
}

function followPostage(flight, stamp, media, animation, fromPerf, toPerf) {
  const paint = () => {
    const progress = animation.effect.getComputedTiming().progress ?? 0;
    const box = flight.getBoundingClientRect();
    shapeFlight(stamp, media, box.width, box.height, fromPerf + (toPerf - fromPerf) * progress);
    if (flight.isConnected && animation.playState !== 'finished' && animation.playState !== 'idle') requestAnimationFrame(paint);
  };
  paint();
  return paint;
}

// Measure the real destination, including its responsive columns, fonts and
// stitch-grid snapping. No duplicate estimates of the hero's layout.
async function prepareProject(href) {
  const frame = document.createElement('iframe');
  frame.className = 'project-measure';
  frame.title = 'Project transition preview';
  frame.setAttribute('aria-hidden', 'true');
  frame.inert = true;
  const url = new URL(href);
  url.searchParams.set('transition-preview', '1');
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Project preview timed out')), 8000);
      frame.addEventListener('error', () => reject(new Error('Project preview unavailable')), { once: true });
      frame.addEventListener('load', () => {
        const check = () => {
          if (!frame.isConnected) return;
          if (frame.contentDocument?.documentElement.dataset.projectReady === 'true') resolve();
          else requestAnimationFrame(check);
        };
        check();
      }, { once: true });
      frame.src = url.href;
      document.body.append(frame);
    });
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  } finally { clearTimeout(timer); }
}

export async function transitionToProject(gallery, entry, { history = true, seal = true } = {}) {
  if (gallery.departing) return;
  const href = entry.link.href;
  if (new URL(href).origin !== location.origin) {
    location.assign(href);
    return;
  }
  gallery.departing = true;
  // The clicked card's seal stays pressed from here until it fades out. A tap
  // never showed the seal, so its stamp simply flies.
  if (seal) entry.item.classList.add('is-departing');
  const navMorph = createProjectNavMorph(gallery, entry.work.title);
  let preview, flight, sealOut, inDetail = false, returning = false;
  const galleryTitle = document.title;
  const duration = gallery.reduced ? 0 : PROJECT_FLIGHT.duration;
  const requestBack = () => window.history.back();
  const restore = () => {
    preview?.remove();
    flight?.remove();
    navMorph.restore();
    gallery.root.classList.remove('is-navigating', 'is-returning');
    entry.item.classList.remove('is-flight-source', 'is-departing');
    sealOut?.cancel();
    document.body.classList.remove('is-project-transition');
    gallery.scene.resume();
    gallery.departing = false;
    gallery.root.inert = false;
    document.title = galleryTitle;
    window.removeEventListener('project-route-back', requestBack);
    gallery.paint();
  };
  try {
    preview = await prepareProject(href);
    const targetImage = preview.contentDocument.querySelector('.project-cover .project-image img');
    const targetPostage = preview.contentDocument.querySelector('.hero-postage-stamp');
    const destination = targetPostage.getBoundingClientRect();
    if (!destination.width || !destination.height) throw new Error('Project hero is not ready');
    gallery.gliding = false;
    const source = entry.frame.getBoundingClientRect();
    const sourcePerf = STAMP.perf * cornerPitch(innerWidth);
    const targetPerf = Number(targetPostage.dataset.perforation);
    flight = document.createElement('div');
    flight.className = 'project-flight';
    flight.setAttribute('aria-hidden', 'true');
    const fromImage = new Image(), toImage = new Image();
    fromImage.src = entry.image.currentSrc || entry.image.src;
    toImage.src = targetImage.currentSrc || targetImage.src;
    toImage.className = 'project-flight-target';
    const media = Object.assign(document.createElement('div'), { className: 'project-flight-media' });
    const postage = createPostageStamp(`flight-paper-${entry.work.id}`);
    // Held where the card shows it until the flight starts.
    for (const image of [fromImage, toImage]) Object.assign(image.style, photoPose(entry));
    media.append(fromImage, toImage);
    flight.append(postage, media);
    Object.assign(flight.style, flightBox(source));
    shapeFlight(postage, media, source.width, source.height, sourcePerf);
    // Only cover the card once its photo can be painted, so it never blinks
    // to an empty window.
    await Promise.allSettled([fromImage.decode(), toImage.decode()]);
    // The pressed seal fades off the card first; then the stamp flies.
    if (seal) {
      sealOut = entry.seal?.element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: gallery.reduced ? 0 : 200, easing: 'ease', fill: 'forwards' });
      await sealOut?.finished;
    }
    document.body.append(flight);
    gallery.root.inert = true;
    gallery.root.classList.add('is-navigating');
    document.body.classList.add('is-project-transition');
    gallery.scene.unpickBranding();
    gallery.scene.unpickVisitorStitches();
    gallery.keepPainting(PROJECT_FLIGHT.duration + 100);
    // The card's photograph travels first; the destination's full-size
    // photograph resolves as it reaches the hero's final bounds.
    const movement = flight.animate([flightBox(source), flightBox(destination)], {
      duration, easing: PROJECT_FLIGHT.easing, fill: 'forwards',
    });
    const posePhotos = (from, to) => [fromImage, toImage].map(image => {
      image.getAnimations().filter(animation => animation.id === 'pose').forEach(animation => animation.cancel());
      const animation = image.animate([from, to], { duration, easing: PROJECT_FLIGHT.easing, fill: 'forwards' });
      animation.id = 'pose';
      return animation;
    });
    posePhotos(photoPose(entry), COVER_POSE);
    const finishPostage = followPostage(flight, postage, media, movement, sourcePerf, targetPerf);
    toImage.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: .3 }, { opacity: 1, offset: .88 }, { opacity: 1 }], {
      duration, fill: 'forwards',
    });
    await Promise.all([movement.finished, navMorph.enter(preview.contentDocument.querySelector('.project-nav').getBoundingClientRect())]);
    finishPostage();
    // Promote the already rendered destination instead of reloading it.
    // The flight remains over its hidden hero until both are in place.
    preview.className = 'project-route';
    preview.inert = false;
    preview.removeAttribute('aria-hidden');
    preview.title = `${entry.work.title} project detail`;
    await preview.animate([{ opacity: 0 }, { opacity: 1 }], { duration: gallery.reduced ? 0 : 140, fill: 'forwards' }).finished;
    preview.contentWindow.dispatchEvent(new Event('project-route-enter'));
    flight.remove();
    gallery.scene.pause();
    inDetail = true;
    document.title = preview.contentDocument.title;
    if (history) window.history.pushState({ projectWork: entry.work.id }, '', href);
    window.addEventListener('project-route-back', requestBack);

    const reverse = async () => {
      if (returning || !inDetail) return;
      returning = true;
      preview.style.pointerEvents = 'none';
      preview.contentWindow.dispatchEvent(new Event('project-route-reset'));
      if (preview.contentWindow.scrollY > 1) {
        await new Promise(resolve => {
          let timer;
          const finish = () => {
            clearTimeout(timer);
            preview.contentWindow.removeEventListener('scrollend', finish);
            resolve();
          };
          preview.contentWindow.addEventListener('scrollend', finish, { once: true });
          timer = setTimeout(finish, gallery.reduced ? 0 : 800);
          preview.contentWindow.scrollTo({ top: 0, behavior: gallery.reduced ? 'instant' : 'smooth' });
        });
      }
      const hero = targetPostage.getBoundingClientRect();
      const card = entry.frame.getBoundingClientRect();
      // Keep the same decoded image layer for the return trip.
      flight.getAnimations().forEach(animation => animation.cancel());
      Object.assign(flight.style, flightBox(hero));
      document.body.append(flight);
      gallery.root.classList.remove('is-navigating');
      gallery.root.classList.add('is-returning');
      entry.item.classList.add('is-flight-source');
      gallery.scene.resume();
      gallery.scene.restoreBranding({ animate: true });
      gallery.keepPainting(duration + 100);
      preview.classList.add('is-returning');
      // Its identical parent control takes over before starting the reverse
      // morph, so the departing iframe never covers the moving navigation.
      preview.contentDocument.documentElement.classList.add('project-nav-handoff');
      preview.contentWindow.dispatchEvent(new Event('project-route-exit'));
      // The iframe becomes transparent while its red stitches retract, so
      // the portfolio's stitches can sew back underneath it at the same time.
      const returningImage = flight.animate([flightBox(hero), flightBox(card)], { duration, easing: PROJECT_FLIGHT.easing, fill: 'forwards' });
      posePhotos(COVER_POSE, photoPose(entry));
      const finishReturningPostage = followPostage(flight, postage, media, returningImage,
        Number(targetPostage.dataset.perforation), STAMP.perf * cornerPitch(innerWidth));
      await Promise.all([
        navMorph.leave(),
        returningImage.finished,
        toImage.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards' }).finished,
      ]);
      finishReturningPostage();
      inDetail = false;
      restore();
      entry.link.focus({ preventScroll: true });
    };
    if (gallery.projectHistoryHandler) window.removeEventListener('popstate', gallery.projectHistoryHandler);
    gallery.projectHistoryHandler = () => {
      if (location.href === href) {
        if (!inDetail && !gallery.departing) transitionToProject(gallery, entry, { history: false });
      } else reverse();
    };
    window.addEventListener('popstate', gallery.projectHistoryHandler);
  } catch (error) {
    console.warn('Project transition unavailable; opening the project directly.', error);
    restore();
    gallery.scene.restoreBranding();
    location.assign(href);
  }
}
