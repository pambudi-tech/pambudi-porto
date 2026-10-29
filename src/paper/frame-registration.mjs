// Register the supplied 1028 × 1304 SVG to the embossed ornament inside the
// 1122 × 1402 paper image. These bounds exclude the PNG's surrounding paper.
// Geometry stays in the original SVG; only its image placement changes.
export const FRAME_REGISTRATION = Object.freeze({
  paperWidth: 1122, paperHeight: 1402,
  x: 65.756045, y: 66.438887,
  width: 987.561884, height: 1276.138615,
});

export function registerPreloaderFrame(image) {
  const r = FRAME_REGISTRATION;
  image.style.left = `${r.x / r.paperWidth * 100}%`;
  image.style.top = `${r.y / r.paperHeight * 100}%`;
  image.style.width = `${r.width / r.paperWidth * 100}%`;
  image.style.height = `${r.height / r.paperHeight * 100}%`;
}
