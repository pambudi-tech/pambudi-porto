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

// Where the traced frame's own box (FRAME_REGISTRATION) lies within the
// welcome's frame image, as fractions of it: the frame's ink entrance
// grows over this box, as it did when the image was this box.
export function preloaderFrameRegion() {
  const r = FRAME_REGISTRATION, span = 1 + 2 * FRAME_MARGIN;
  return {
    x: (r.x / r.paperWidth + FRAME_MARGIN) / span, y: (r.y / r.paperHeight + FRAME_MARGIN) / span,
    width: r.width / r.paperWidth / span, height: r.height / r.paperHeight / span,
  };
}
