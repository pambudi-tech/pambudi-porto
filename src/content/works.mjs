import { WORKS, EXPLORATION } from '../../content/works.mjs';
import { PROJECTS, STAND_IN } from '../../content/projects/index.mjs';

export { WORKS, EXPLORATION };

const year = month => Number(month.slice(0, 4));

export const workHref = work => work.page ? `/work/${work.id}` : null;

// "2024—26", "2025—now", or one year when it starts and ends in the same one.
export const yearLabel = work => {
  const from = year(work.from), to = work.to ? year(work.to) : 'now';
  return from === to ? String(from) : `${from}—${to === 'now' ? to : String(to).slice(2)}`;
};

// The dot clock's capitals: "OCEAN BY BCA 2024-2026".
export const clockLabel = (work, short = false) => {
  const from = year(work.from), to = work.to ? year(work.to) : 'now';
  const years = from === to ? String(from) : `${from}-${to}`;
  return `${work.title}${short ? '' : ` ${years}`}`.toUpperCase().replace(/[^A-Z0-9 -]/g, '').replace(/\s+/g, ' ').trim();
};

// The id in a project page's address, /work/<id>.
export const projectId = pathname => pathname.match(/^\/work\/([^/]+)\/?$/)?.[1] ?? null;

// Everything a project page shows. A work without its own case study takes
// its card's details and the stand-in's gallery.
export function projectPage(id) {
  const work = WORKS.find(entry => entry.id === id && entry.page);
  if (!work) return null;
  const study = PROJECTS[id];
  const source = study ?? PROJECTS[STAND_IN];
  const cover = { id: 'cover', ...source.cover, src: work.image, ...(study ? {} : { alt: work.alt }) };
  const tags = work.tags.join(' · ');
  return {
    title: study?.title ?? work.title,
    category: study?.category ?? tags,
    subtitle: study?.subtitle ?? work.summary,
    overview: study?.overview ?? '',
    site: work.site,
    facts: study?.facts ?? { client: work.client, role: work.role, period: yearLabel(work), scope: tags },
    images: [cover, ...source.gallery],
  };
}
