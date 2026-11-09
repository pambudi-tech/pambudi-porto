// Renders the favicon from the round P seal, lit live by src/wax/wax-gl.mjs:
//
//   npm run dev                      (in another terminal)
//   node tools/build-favicon.mjs [http://localhost:5173]
//   python3 tools/build-favicon.py
//
// Draws the seal in headless Chrome on the graphics card, once with the
// lamp at rest (the static icons) and once per frame of a lamp circling it
// (src/favicon/favicon-light.mjs plays them), and writes the masters to
// tools/source-images/: favicon-rest.png and favicon-light-frames.png, a
// strip of FRAMES squares. build-favicon.py makes the site's files from them.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2] ?? 'http://localhost:5173';
const root = new URL('..', import.meta.url);
// Rendered large and reduced in build-favicon.py, so the tiny icon is sharp.
const SIZE = 256, REST = 512;
export const FRAMES = 36;

// In the page: the seal's lamp at rest as p-seal.html has it, then a lamp
// circling the seal a little above it, once round in FRAMES steps.
const render = async (size, rest, frames) => {
  const { WaxGL } = await import('/src/wax/wax-gl.mjs');
  const { WAX_REST, lampInSeal } = await import('/src/wax/wax-light.mjs');
  const { WAX_ASPECT } = await import('/src/wax/wax-layout.mjs');
  const canvas = document.createElement('canvas');
  const wax = new WaxGL(canvas, 'round');
  await wax.prepare();
  const png = () => canvas.toDataURL('image/png');
  // At rest, p-seal.html's resting light; circling, the close lamp's gloss,
  // low over the rim, so its glint reads even at a tab's 16 px.
  wax.draw({ width: rest, height: rest, light: lampInSeal(WAX_REST, WAX_ASPECT, 1), level: .9, sheen: .45, gloss: 85 });
  const finish = { level: 1, sheen: 1, gloss: 60 };
  const still = png();
  const strip = document.createElement('canvas');
  strip.width = size * frames; strip.height = size;
  const context = strip.getContext('2d');
  for (let i = 0; i < frames; i++) {
    // From the upper left, as at rest, clockwise.
    const angle = Math.atan2(.45, -.75) - i / frames * 2 * Math.PI;
    wax.draw({ width: size, height: size, light: [Math.cos(angle) * .62, Math.sin(angle) * .62, .5], ...finish });
    context.drawImage(canvas, i * size, 0);
  }
  return { still, strip: strip.toDataURL('image/png') };
};

const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'favicon-'))}`,
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(target => target.type === 'page');
    } catch { /* Chrome is still starting. */ }
    if (!page) await sleep(200);
  }
  // Listening before anything else is awaited, so the opening isn't missed.
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
  });
  const send = (method, params = {}) => new Promise(resolve => {
    pending.set(++id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  // One device pixel per CSS pixel, so each drawing is exactly its size.
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${origin}/p-seal.html` });
  await sleep(3000);
  const { result } = await send('Runtime.evaluate', {
    expression: `(${render})(${SIZE}, ${REST}, ${FRAMES})`, awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  const save = (name, url) => writeFileSync(new URL(`tools/source-images/${name}`, root), Buffer.from(url.split(',')[1], 'base64'));
  save('favicon-rest.png', result.result.value.still);
  save('favicon-light-frames.png', result.result.value.strip);
  console.log(`Wrote favicon-rest.png (${REST} px) and favicon-light-frames.png (${FRAMES} × ${SIZE} px).`);
} finally {
  chrome.kill();
}
