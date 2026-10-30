// The cards on the works index, in order.
//
// - `from` and `to` are months, 'YYYY-MM'; `to: null` is ongoing.
// - `tags` name what was made, on the stamp; `summary` is the project page's
//   subtitle.
// - `page: true` gives the card a project page at /work/<id>. A work with a
//   case study in content/projects/ shows it; the others borrow Ocean's
//   gallery as a stand-in until theirs is written.
// - `site` is a live address the project page links to, where there is one.
// - `passwordProtected` marks work behind the PIN: its page shows the cover,
//   and a PIN panel in place of the gallery seal (server/works-pass.mjs).
//   Its `image` is then a coarse, dithered preview (`<id>-locked.webp`, made
//   by tools/locked-preview.py); the full cover is
//   private/works/<id>/cover.webp, sent only with the PIN's pass.
// - `coverFocus` is where the project page's cover holds the photo in its
//   stamp, as an object-position; a little above the centre when left out.
// - Covers from Unsplash are temporary samples.
const unsplash = id => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&h=900&q=80`;

export const WORKS = [
  { id: 'bca-prioritas', title: 'bca prioritas', client: 'bank central asia', tags: ['website', 'art direction', 'prototype'],
    role: 'designer', passwordProtected: true,
    summary: "a revamp of bca's private banking website, with a live prototype and design documentation.",
    from: '2026-05', to: '2026-09', page: true,
    image: '/assets/works/bca-prioritas-locked.webp',
    alt: 'BCA Prioritas website on a desktop monitor: the homepage hero, “Perjalanan Hidup Anda adalah Prioritas Kami.”, beside a family on a green sofa' },
  { id: 'ocean', title: 'ocean by bca', client: 'bank central asia', tags: ['product design', 'design system'],
    role: 'product designer · embedded retainer',
    summary: "a new digital banking platform for bca's business customers.",
    from: '2024-07', to: '2026-05', page: true,
    image: '/assets/works/ocean-v4.webp',
    alt: 'Ocean by BCA website: the homepage hero, “Kolaborasi. Inovasi. Ekspansi.”, above a photo of fishermen casting a net at sunset' },
  { id: 'bca-co-id', title: 'bca.co.id', client: 'bank central asia', tags: ['ui design', 'prototype'],
    role: 'designer', passwordProtected: true,
    summary: 'a live, testable prototype of a proposed bca.co.id, built for usability research.',
    from: '2026-05', to: '2026-09', page: true,
    image: '/assets/works/bca-co-id-locked.webp',
    alt: 'Proposed bca.co.id on a tablet held in one hand: the homepage hero, “Capai Kebebasan Finansial Lebih Dini bersama BCA”, a father and daughter on a bicycle above quick logins and exchange rates' },
  { id: 'runrise', title: 'runrise running club', client: 'runrise running club', tags: ['brand identity'],
    role: 'brand designer',
    summary: 'the identity of a running club born on the village roads of sukoharjo.',
    from: '2026-05', to: '2026-05', page: true,
    image: '/assets/works/runrise.webp',
    alt: 'Runrise Running Club flag: a white rooster over a blackletter RRC monogram on black, flying against an orange dusk sky' },
  { id: 'trueno-sagrado', title: 'trueno sagrado de los libertadores', client: 'trueno sagrado de los libertadores', tags: ['jersey design', 'logo design'],
    role: 'designer',
    summary: 'a name, logo and jersey for the tsl team, designed in a week.',
    from: '2024-12', to: '2024-12', page: true,
    image: '/assets/works/trueno-sagrado-v3.webp',
    alt: 'Trueno Sagrado de Los Libertadores jersey: royal blue with white trim and gold piping, the club crest on the chest and sponsor marks across the front, on a turquoise gradient' },
  { id: 'mandalika', title: 'mandalika gp', client: 'mandalika grand prix association', tags: ['website', 'ui design'],
    role: 'ui designer',
    summary: "the official portal for indonesia's motogp and wsbk races at mandalika, designed from scratch in three weeks.",
    from: '2023-05', to: '2023-07', page: true,
    image: '/assets/works/mandalika-v2.webp',
    alt: 'Mandalika GP website on a desktop monitor resting on a motorcycle wheel: the MotoGP riders standing, above the last session results, on a red gradient' },
];

// Exploration: personal studies and play, shown by the gallery's toggle.
// All samples for now; none has a page yet, so their cards do not open.
export const EXPLORATION = [
  { id: 'soft-forms', title: 'soft forms', client: 'personal', tags: ['3d study'], role: 'exploration',
    summary: 'sample: rounded shapes lit like fabric.',
    from: '2026-07', to: null, image: unsplash('1618005182384-a83a8bd57fbe'), alt: 'Sample cover: an abstract colour study' },
  { id: 'night-signal', title: 'night signal', client: 'personal', tags: ['light study'], role: 'exploration',
    summary: 'sample: neon light, long exposures.',
    from: '2025-12', to: '2026-02', image: unsplash('1550684376-efcbd6e3f031'), alt: 'Sample cover: an abstract light study' },
  { id: 'paint-drift', title: 'paint drift', client: 'personal', tags: ['colour study'], role: 'exploration',
    summary: 'sample: poured paint, read as a palette.',
    from: '2025-06', to: '2025-08', image: unsplash('1541701494587-cb58502866ab'), alt: 'Sample cover: an abstract paint study' },
  { id: 'gradient-weather', title: 'gradient weather', client: 'personal', tags: ['motion study'], role: 'exploration',
    summary: 'sample: gradients that move like the sky.',
    from: '2024-11', to: '2025-01', image: unsplash('1557672172-298e090bd0f1'), alt: 'Sample cover: an abstract gradient study' },
  { id: 'colour-field', title: 'colour field', client: 'personal', tags: ['type and colour'], role: 'exploration',
    summary: 'sample: one colour, many weights of type.',
    from: '2024-03', to: '2024-06', image: unsplash('1579546929518-9e396f3cc809'), alt: 'Sample cover: an abstract colour field' },
];
