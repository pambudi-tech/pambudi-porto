import { cornerPitch } from '../stitch/corners.mjs';
import { STAMP } from '../works/postage-stamp.mjs';
import { CARD_GUARD } from '../works/layout.mjs';
import { isPhone } from '../shared/breakpoints.mjs';
import { projectFrameGap } from './project-frame.mjs';

// A project page's hero, worked out from the screen, for the project page to
// lay itself out with (project-detail.mjs).

// Above this width the hero is three columns, the cover in the middle
// (project-detail.css); below, one.
export const HERO_COLUMNS = 1000;

// The hero's sizes on a screen `width` wide whose opening is `opening` wide:
// the cloth's pitch, the stitched frame's margin, how far the stamp sits in
// from the figure, its perforation, and the figure's size. On wide screens
// the cover is whole 8-cell blocks of a 4:3 figure (its height then comes
// from CSS, so null); on narrow ones it is the works card to the pixel, so
// the flight between them only moves it.
export function heroSize(width, opening) {
  const pitch = cornerPitch(width);
  const frameMargin = projectFrameGap(pitch) + pitch;
  // The stitched corners keep to the figure; the stamp sits half a block
  // smaller inside it, so the gap around it widens.
  const shrinkX = 2 * pitch, shrinkY = 1.5 * pitch;
  const perf = STAMP.perf * pitch, inset = Math.round(perf * STAMP.margin);
  if (width > HERO_COLUMNS) {
    // Include the entire stitched frame in the middle grid column. The grid
    // gap therefore measures from its outer bounds to either text column.
    const blocks = Math.max(1, Math.floor((opening - 80) * 1.9 / 3.9 / (8 * pitch)));
    return { pitch, frameMargin, shrinkX, shrinkY, perf, inset, imageWidth: blocks * 8 * pitch, imageHeight: null };
  }
  const card = Math.round((isPhone(width) ? CARD_GUARD.phone : CARD_GUARD.tablet) / perf) * perf;
  const cardHeight = Math.round(((card - inset * 2) / STAMP.window + inset * 2) / perf) * perf;
  return {
    pitch, frameMargin, shrinkX, shrinkY, perf, inset,
    imageWidth: card - inset * 2 + shrinkX * 2, imageHeight: cardHeight - inset * 2 + shrinkY * 2,
  };
}

// Snapped to the cloth's grid about the screen's middle, as the page snaps
// its hero.
export const snapToCloth = (value, origin, pitch) => origin + Math.round((value - origin) / pitch) * pitch;
