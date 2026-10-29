import { createInkLayer } from '../ink/ink-growth.mjs';

export const INK_ENTRANCE = { delay: 180, duration: 4200 };

export async function paperInkEntrance(copy, {
  motionPreference, startWhen, duration = INK_ENTRANCE.duration,
  delay = INK_ENTRANCE.delay, shapeText = false, onComplete,
  createLayers, waitForFonts = true,
} = {}) {
  if (!copy) return;
  const layers = [];
  let frame, finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    copy.classList.remove('ink-preparing', 'ink-bloom');
    for (const layer of layers) layer.finish();
    copy.dataset.inkState = 'complete';
    motionPreference?.removeEventListener('change', onPreference);
    window.removeEventListener('resize', finish);
    onComplete?.();
  };
  const onPreference = event => { if (event.matches) finish(); };
  if (motionPreference?.matches) { finish(); return; }
  copy.dataset.inkState = 'preparing';
  copy.classList.add('ink-preparing');
  motionPreference?.addEventListener('change', onPreference);
  try {
    const image = copy.closest('.portfolio-paper')?.querySelector('img');
    await Promise.all([waitForFonts ? document.fonts.ready : null, image?.decode().catch(() => {})]);
    if (copy.dataset.inkState === 'complete') return;
    if (createLayers) layers.push(...createLayers());
    else for (const paragraph of copy.querySelectorAll('p')) layers.push(createInkLayer(paragraph, { shapeText }));
    const start = () => {
      if (copy.dataset.inkState === 'complete') return;
      window.addEventListener('resize', finish, { once: true });
      copy.classList.replace('ink-preparing', 'ink-bloom');
      copy.dataset.inkState = 'blooming';
      const started = performance.now() + delay;
      const draw = now => {
        const progress = Math.max(0, Math.min(1, (now - started) / duration));
        for (const layer of layers) layer.draw(progress);
        if (progress >= 1) finish();
        else frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    };
    if (startWhen) startWhen.then(start);
    else start();
  } catch {
    // Keep the introduction readable if enhancement or font loading fails.
    finish();
  }
}
