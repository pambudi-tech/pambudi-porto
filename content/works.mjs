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
// - `privateSite: true` gives protected work a "visit site" that waits,
//   disabled, for the PIN; its address is private/works/<id>/site.txt.
// - `coverFocus` is where the project page's cover holds the photo in its
//   stamp, as an object-position; a little above the centre when left out.

export const WORKS = [
  { id: 'bca-prioritas', title: 'bca prioritas', client: 'bank central asia', tags: ['website', 'art direction', 'prototype'],
    role: 'designer', passwordProtected: true, privateSite: true,
    summary: "a revamp of bca's private banking website, with a live prototype and design documentation.",
    from: '2026-05', to: '2026-09', page: true,
    image: '/assets/works/bca-prioritas-locked.webp',
    alt: 'BCA Prioritas website on a desktop monitor: the homepage hero, “Perjalanan Hidup Anda adalah Prioritas Kami.”, beside a family on a green sofa' },
  { id: 'ocean', title: 'ocean by bca', client: 'bank central asia', tags: ['product design', 'design system'],
    role: 'product designer · embedded retainer', site: 'https://ocean.bca.co.id',
    summary: "a new digital banking platform for bca's business customers.",
    from: '2024-07', to: '2026-05', page: true,
    image: '/assets/works/ocean-v4.webp',
    alt: 'Ocean by BCA website: the homepage hero, “Kolaborasi. Inovasi. Ekspansi.”, above a photo of fishermen casting a net at sunset' },
  { id: 'bca-co-id', title: 'bca.co.id', client: 'bank central asia', tags: ['ui design', 'prototype'],
    role: 'designer', passwordProtected: true, privateSite: true,
    summary: 'a live, testable prototype of a proposed bca.co.id, built for usability research.',
    from: '2026-05', to: '2026-09', page: true,
    image: '/assets/works/bca-co-id-locked.webp',
    alt: 'Proposed bca.co.id on a tablet held in one hand: the homepage hero, “Capai Kebebasan Finansial Lebih Dini bersama BCA”, a father and daughter on a bicycle above quick logins and exchange rates' },
  { id: 'runrise', title: 'runrise running club', client: 'runrise running club', tags: ['brand identity'],
    role: 'brand designer', site: 'https://www.instagram.com/runrise.runningclub',
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

// Exploration: personal studies and play, shown by the row's toggle. None
// has a page: a card opens its piece large over the row, at its own shape
// (`width` and `height`, the image's pixels), and steps through the rest.
// They carry no dates, so their cards show no years. `preview` is a smaller
// copy their cards are dithered from (tools/exploration-previews.py);
// `image`, the original, loads only up close. Both are named in full rather
// than built from the id, so a build can version each one
// (build/asset-versions.mjs) and it is cached as long as every other image.
const exploration = (id, title, tags, width, height, alt, image, preview) =>
  ({ id, title, tags, width, height, alt, image, preview });

export const EXPLORATION = [
  exploration('alpha-basketball-academy', 'alpha basketball academy', ['brand identity'], 1920, 1440,
    'Alpha Basketball Academy moodboard: “where Champions are made” in red script over a hoop on a cream wall, the ball-seam crest in cream on black, a red court from above, a pile of basketballs and the academy name in heavy capitals',
    '/assets/exploration/alpha-basketball-academy.webp', '/assets/exploration/preview/alpha-basketball-academy.webp'),
  exploration('bellingham-card', 'bellingham card', ['card design'], 2000, 1500,
    'A gold player card for Jude Bellingham, rated 86 as a central midfielder, with his six stats and the England, LaLiga and Real Madrid badges',
    '/assets/exploration/bellingham-card.webp', '/assets/exploration/preview/bellingham-card.webp'),
  exploration('player-of-the-match', 'player of the match', ['sports graphics'], 2000, 1500,
    'Three Euro 2024 Player of the Match cards, for N’Golo Kanté, Cody Gakpo and Jude Bellingham, each in its team’s colours with the match, score and minutes played',
    '/assets/exploration/player-of-the-match.webp', '/assets/exploration/preview/player-of-the-match.webp'),
  exploration('hurts-mvp', 'hurts mvp', ['poster'], 1600, 2000,
    'Super Bowl LIX MVP poster for Jalen Hurts: his face and two throwing poses in Eagles green, his name in grainy white and green script, and his passing and rushing stats down the side',
    '/assets/exploration/hurts-mvp.webp', '/assets/exploration/preview/hurts-mvp.webp'),
  exploration('jerusalem', 'jerusalem', ['poster', 'lettering'], 2000, 1500,
    'A framed poster leaning on a wall: the Dome of the Rock mirrored top and bottom in black ink, “Jerusalem” as a turquoise blackletter ambigram across the middle, and its coordinates in each corner',
    '/assets/exploration/jerusalem.webp', '/assets/exploration/preview/jerusalem.webp'),
  exploration('dari-langit', 'dari langit', ['album cover'], 1954, 1492,
    'An album cover held up in one hand: two engraved portraits cut out over old Indonesian banknotes, with “DAR 1L4N617” typed on a folded note',
    '/assets/exploration/dari-langit.webp', '/assets/exploration/preview/dari-langit.webp'),
  exploration('leaderboard', 'leaderboard', ['app design'], 2000, 1512,
    'Two phones showing a football training leaderboard: the top three on silver, gold and bronze shields, the ranks below, and the viewer’s own place at number 8 in purple',
    '/assets/exploration/leaderboard.webp', '/assets/exploration/preview/leaderboard.webp'),
  exploration('logofolio', 'logofolio', ['logo design'], 1330, 1022,
    'Logofolio: eight glowing white marks on black, among them a ball-seam crest, a flame, a flowing R and a tall monogram, under “Logofolio” in dark blackletter',
    '/assets/exploration/logofolio.webp', '/assets/exploration/preview/logofolio.webp'),
  exploration('lusail-circuit', 'lusail circuit', ['web design'], 2000, 1500,
    'A Formula 1 GP Qatar 2025 web page for the Lusail International Circuit: the track drawn in glowing red over the circuit’s name, with its length, corners and lap record',
    '/assets/exploration/lusail-circuit.webp', '/assets/exploration/preview/lusail-circuit.webp'),
  exploration('campeon', 'campeón', ['social media'], 2000, 1500,
    'Three campeón news posts on a pink gradient: Chelsea’s new shirt sponsor, the Racing Bulls’ magenta Miami livery and Kaká in Adidas and Kith, each with a photo cut on the diagonal above a condensed headline',
    '/assets/exploration/campeon.webp', '/assets/exploration/preview/campeon.webp'),
  exploration('natuno-design-academy', 'natuno design academy', ['sticker design'], 2000, 1500,
    'Natuno Design Academy stickers in orange and green: a varsity arch badge, an N block, a “Class of AI” pennant, a script “Academy” and a hexagonal monogram badge',
    '/assets/exploration/natuno-design-academy.webp', '/assets/exploration/preview/natuno-design-academy.webp'),
  exploration('padel-booking', 'padel booking', ['app design'], 2000, 1500,
    'Two phones showing a padel court booking app in dark green: picking a day, time and court, then a booking review with the match option, a split bill and the subtotal',
    '/assets/exploration/padel-booking.webp', '/assets/exploration/preview/padel-booking.webp'),
  exploration('squircle-flags', 'squircle flags', ['icon design'], 2000, 1511,
    'Four glossy squircle flag icons, Germany, Scotland, Hungary and Switzerland, over a pale script letter',
    '/assets/exploration/squircle-flags.webp', '/assets/exploration/preview/squircle-flags.webp'),
  exploration('direction-matters', 'direction matters', ['sticker design', 'motion'], 1000, 800,
    'Animated: the Direction Matters sticker pack, its title on an orange label, then a horse in sunglasses saying “don’t ride blind”, a pixel cursor reaching a hand, and a tarot-style “The Navigator”',
    '/assets/exploration/direction-matters.webp', '/assets/exploration/preview/direction-matters.webp'),
];
