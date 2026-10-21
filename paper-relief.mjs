// Fixed material study: source geometry is the approved SVG, never the PNG.
export const PAPER = Object.freeze({
  offset: 18,
  depth: 1.1,
  bevel: 5,
  paperHeight: .55,
  paperBevel: 2.5,
  grain: 4.4,
  tone: 233.2,
});

const source = new URL('./assets/approved-frame-source.svg', import.meta.url);
let rendering;

async function createPaper() {
  const started = performance.now();
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Frame source: ${response.status}`);
  const svg = await response.text();
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const [,, width, height] = document.documentElement.getAttribute('viewBox').split(/\s+/).map(Number);
  const master = document.querySelector('g > path');
  if (!master) throw new Error('The approved frame outline is missing.');
  // The first closed contour is the outer silhouette; subsequent contours
  // are internal apertures. They stay filled with paper in this material.
  const outer = master.getAttribute('d').match(/[Mm][^Mm]*/)[0];
  const canvas = window.document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const image = new Image();
  image.src = source.href;
  await image.decode();
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, width, height).data;
  const ornament = new Uint8Array(width * height);
  for (let i = 0; i < ornament.length; i++) ornament[i] = (255 - rgba[i * 4]) * rgba[i * 4 + 3] / 255;
  context.clearRect(0, 0, width, height);
  const silhouette = new Path2D(outer);
  context.fillStyle = '#fff'; context.strokeStyle = '#fff';
  context.lineWidth = PAPER.offset * 2;
  context.lineJoin = 'round'; context.lineCap = 'round';
  context.fill(silhouette); context.stroke(silhouette);
  const base = context.getImageData(0, 0, width, height).data;
  const paper = new Uint8Array(width * height);
  for (let i = 0; i < paper.length; i++) paper[i] = base[i * 4 + 3];
  const worker = new Worker(new URL('./paper-relief-worker.mjs', import.meta.url), { type: 'module' });
  try {
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(new ImageData(data.pixels, data.width, data.height));
      worker.onerror = event => reject(new Error(event.message || 'Paper renderer failed.'));
      worker.postMessage({ ornament, paper, width, height, settings: PAPER }, [ornament.buffer, paper.buffer]);
    });
    performance.measure('paper-relief', { start: started, end: performance.now() });
    return result;
  } finally {
    worker.terminate();
  }
}

export async function mountPaperFrame(canvas) {
  rendering ??= createPaper();
  const image = await rendering;
  canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d').putImageData(image, 0, 0);
  canvas.dataset.rendered = 'true';
  canvas.dispatchEvent(new Event('paper-ready'));
}

for (const canvas of document.querySelectorAll('[data-paper-relief]')) {
  mountPaperFrame(canvas).catch(error => {
    canvas.dataset.rendered = 'error';
    console.error('Paper frame:', error);
  });
}
