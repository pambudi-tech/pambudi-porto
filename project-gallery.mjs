import { CORNER_ROWS, cornerPitch } from './corners.mjs';
import { GRID } from './model.mjs';
import { hash } from './render.mjs';
import { ProjectStitches } from './project-stitches.mjs';

// Small fragments of the existing ornament, sewn at the original stitch size.
const accents = {
  curl: CORNER_ROWS.slice(24, 31).map(row => row.slice(0, 10)),
  flower: CORNER_ROWS.slice(13, 22).map(row => row.slice(0, 9)),
};

const gcd = (a, b) => b ? gcd(b, a % b) : a;

export function mountProjectGallery(grid, figures, items) {
  const plates = figures.map((figure, index) => {
    const item = items[index];
    const plate = document.createElement('div');
    plate.className = `gallery-plate${item.layout === 'wide' ? ' gallery-plate-wide' : ''}`;
    plate.dataset.corner = item.corner;
    figure.dataset.corner = item.corner;
    figure.style.aspectRatio = `${item.width} / ${item.height}`;
    figure.before(plate);
    plate.append(figure);
    const canvas = document.createElement('canvas');
    canvas.className = 'gallery-accent';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.variant = item.accent;
    figure.append(canvas);
    return { plate, figure, canvas, item, stitches: new ProjectStitches(canvas, { sweep: 460 }), offsetX: 0, offsetY: 0 };
  });
  let frame, previousPitch;
  function layout() {
    frame = null;
    const pitch = cornerPitch(innerWidth);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const gutter = 40 + pitch * 13;
    grid.style.setProperty('--accent-gutter', `${gutter}px`);
    const mobile = innerWidth <= 760;
    for (const entry of plates) {
      const { plate, figure, canvas, item } = entry;
      const rows = accents[item.accent];
      const cols = rows[0].length;
      const accentWidth = (cols + 2) * pitch, accentHeight = (rows.length + 2) * pitch;
      plate.style.setProperty('--accent-height', `${accentHeight}px`);
      const available = plate.clientWidth - (mobile ? 0 : gutter * (item.layout === 'wide' ? 2 : 1));
      const aspectWidth = item.width / gcd(item.width, item.height);
      const units = Math.max(1, Math.floor(available / (aspectWidth * pitch)));
      figure.style.width = `${units * aspectWidth * pitch}px`;
      const rect = figure.getBoundingClientRect();
      const left = rect.left - entry.offsetX, top = rect.top - entry.offsetY;
      entry.offsetX = innerWidth / 2 + Math.round((left - innerWidth / 2) / pitch) * pitch - left;
      entry.offsetY = innerHeight / 2 + Math.round((top - innerHeight / 2) / pitch) * pitch - top;
      figure.style.translate = `${entry.offsetX}px ${entry.offsetY}px`;
      if (previousPitch === `${pitch}:${dpr}:${mobile}`) continue;
      canvas.style.width = `${accentWidth}px`;
      canvas.style.height = `${accentHeight}px`;
      canvas.width = Math.ceil(accentWidth * dpr);
      canvas.height = Math.ceil(accentHeight * dpr);
      const bounds = canvas.getBoundingClientRect();
      const startX = innerWidth / 2 + Math.round((bounds.left + pitch - innerWidth / 2) / pitch) * pitch - bounds.left;
      const startY = innerHeight / 2 + Math.round((bounds.top + pitch - innerHeight / 2) / pitch) * pitch - bounds.top;
      const scale = pitch / GRID;
      const cells = [];
      rows.forEach((row, y) => [...row].forEach((cell, x) => {
        if (cell !== '#') return;
        const variation = Math.floor(hash(x, y) * 8);
        cells.push({ key: `${x},${y}`, variation, x: startX + x * pitch, y: startY + y * pitch });
      }));
      entry.stitches.layout(cells, [cells.map(cell => cell.key)], dpr, scale);
    }
    previousPitch = `${pitch}:${dpr}:${mobile}`;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(layout);
  }
  const observer = new ResizeObserver(schedule);
  observer.observe(grid);
  plates.forEach(({ plate }) => observer.observe(plate));
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  schedule();
  const reveal = () => {
    const visible = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        plates.find(plate => plate.figure === entry.target)?.stitches.reveal();
        visible.unobserve(entry.target);
      }
    }, { threshold: .12 });
    for (const entry of plates) visible.observe(entry.figure);
  };
  reveal.unpick = () => plates.forEach(entry => entry.stitches.unpick());
  return reveal;
}
