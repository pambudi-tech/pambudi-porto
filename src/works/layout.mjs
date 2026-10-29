// Where the works cards sit, shared by the works row and the project page.

// One card per column, leaning top, bottom, bottom, top, top, ...
export const shelfAt = index => ((index + 1) >> 1) % 2 ? 'bottom' : 'top';
// Each card sits at its own height within its shelf, the same on every visit.
const scatter = (index, salt) => {
  const n = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
};
export const placement = index => ({ lift: scatter(index, 3), shift: scatter(index, 5) });
// How far a photo slides inside its window as the row scrolls, as a share of
// the card's width either way.
export const PHOTO_PARALLAX = .14;
// Guards for the works row on tablets and desktops. Cards are `share` of the
// screen's width, never under `min` pixels and never taller than `tallest`
// of the height above the clock; every card but the first settles `settle`
// of that height lower; and no two cards come within `gap` pixels of
// overlapping. Upright screens hold the rows in a band `uprightBand` cards
// tall. Phones and tablets (up to `tabletUpTo` wide) use fixed card widths.
export const CARD_GUARD = Object.freeze({
  share: .3, min: 260, tallest: .42, settle: .06, gap: 20, uprightBand: 2.8,
  label: 36,   // room under a stamp for its password label
  tablet: 380, tabletUpTo: 1024, phone: 300,
});
