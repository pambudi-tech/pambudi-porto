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

// Where a project page's cover holds its photo in the stamp, as an
// object-position: a little above the centre unless the work sets its own.
export const coverFocus = work => work.coverFocus ?? '50% 84%';

// The id in a project page's address, /work/<id>.
export const projectId = pathname => pathname.match(/^\/work\/([^/]+)\/?$/)?.[1] ?? null;

// A work's full cover. For protected work it is private, served only to a
// visitor with the PIN's pass (server/works-pass.mjs); its card's `image` is
// a coarse, dithered preview.
export const fullCover = work => (work.passwordProtected
  ? `/api/work-asset?path=${encodeURIComponent(`${work.id}/cover.webp`)}` : work.image);

// The project page itself, the template a project's address is filled from.
export const projectPageHref = id => `/work.html?work=${encodeURIComponent(id)}`;

// Everything a project page shows. A work without its own case study takes
// its card's details and the stand-in's gallery. A password-protected work is
// `locked`: its page has the cover alone, and its gallery comes from the
// server once a visitor has the PIN (server/works-pass.mjs).
export function projectPage(id) {
  const work = WORKS.find(entry => entry.id === id && entry.page);
  if (!work) return null;
  const study = PROJECTS[id];
  const source = study ?? PROJECTS[STAND_IN];
  const cover = { id: 'cover', ...source.cover, src: work.image, focus: coverFocus(work), ...(study ? {} : { alt: work.alt }) };
  const tags = work.tags.join(' · ');
  return {
    title: study?.title ?? work.title,
    // The top bar's pill: the work's name as its card has it.
    name: work.title,
    category: study?.category ?? tags,
    subtitle: study?.subtitle ?? work.summary,
    overview: study?.overview ?? '',
    site: work.site,
    // A protected work's live site: its "visit site" shows from the start,
    // but its address comes with the PIN (server/works-pass.mjs).
    privateSite: Boolean(work.passwordProtected && work.privateSite),
    facts: study?.facts ?? { client: work.client, role: work.role, period: yearLabel(work), scope: tags },
    images: work.passwordProtected ? [cover] : [cover, ...(source.gallery ?? PROJECTS[STAND_IN].gallery)],
    locked: Boolean(work.passwordProtected),
    passcode: Boolean(work.passwordProtected),
  };
}
