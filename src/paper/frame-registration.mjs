// Register the supplied 1028 × 1304 SVG to the embossed ornament inside the
// 1122 × 1402 paper image. These bounds exclude the PNG's surrounding paper.
// Geometry stays in the original SVG; only its image placement changes.
export const FRAME_REGISTRATION = Object.freeze({
  paperWidth: 1122, paperHeight: 1402,
  x: 65.756045, y: 66.438887,
  width: 987.561884, height: 1276.138615,
});

// The welcome's frame image (pambudi-frame-paper.svg, tools/paper-frame.mjs)
// is the traced frame already placed on the paper, in a box this much
// larger than the paper on every side; base.css sizes .preloader-frame to
// match, so the box is in place from its very first paint.
export const FRAME_MARGIN = .15;
