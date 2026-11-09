// The tab's icon, the round P seal, with a lamp circling it: frames from
// tools/build-favicon.py, played once the page has loaded and gone idle, so
// they never compete with the page itself. Where there's no tab strip to
// see them (touch screens) or motion is unwanted, the still icon stays.
const STRIP = '/assets/favicon-light.webp';
const FRAMES = 36, SIZE = 32;
// Once round every three seconds.
const STEP = 3000 / FRAMES;

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const desk = matchMedia('(hover: hover) and (pointer: fine)');
const idle = () => new Promise(resolve => (window.requestIdleCallback
  ? requestIdleCallback(resolve, { timeout: 3000 }) : setTimeout(resolve, 300)));
const loaded = () => document.readyState === 'complete'
  ? Promise.resolve() : new Promise(resolve => addEventListener('load', resolve, { once: true }));

// Each frame as a data URL, made once: the browser then only swaps one.
async function frames() {
  const image = new Image();
  image.src = STRIP;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d');
  return Array.from({ length: FRAMES }, (_, i) => {
    context.clearRect(0, 0, SIZE, SIZE);
    context.drawImage(image, i * SIZE, 0, SIZE, SIZE, 0, 0, SIZE, SIZE);
    return canvas.toDataURL('image/png');
  });
}

async function play() {
  await loaded();
  await idle();
  const urls = await frames();
  // One icon link of our own: with others beside it, a browser may keep
  // showing the still one it chose first.
  const still = [...document.querySelectorAll('link[rel="icon"]')];
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  let frame = 0, timer = null;
  const start = () => {
    if (timer !== null || reduced.matches) return;
    still.forEach(icon => icon.remove());
    document.head.append(link);
    timer = setInterval(() => { link.href = urls[frame = (frame + 1) % FRAMES]; }, STEP);
    link.href = urls[frame];
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
    link.remove();
    document.head.append(...still);
  };
  reduced.addEventListener('change', () => (reduced.matches ? stop() : start()));
  start();
}

if (desk.matches) play().catch(error => console.info('Favicon stays still:', error.message));
