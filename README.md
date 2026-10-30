# Ivan Pambudi - The Portfolio

Ivan Pambudi's portfolio: a white cross-stitch surface where visitors can sew motifs, an embossed paper card with the introduction and About Me, and a works gallery of postage-stamp cards that fly into each project page.

It is plain JavaScript with no framework, built with [Vite](https://vite.dev) and deployed to Vercel as a static site.

```sh
git clone https://github.com/pambudi-tech/pambudi-porto.git
cd pambudi-porto
npm install
npm run dev
```

Open http://127.0.0.1:4317.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with live reload |
| `npm run build` | Production build in `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm test` | Unit tests (`node:test`) |
| `npm run lint` | ESLint |
| `npm run check` | Lint, tests and build, as CI runs them |
| `npm run images` | Regenerates the WebP images from their masters (needs Python with Pillow) |

## Editing content

Text and links live in `content/`, separate from the code:

- `content/site.mjs`: the introduction, contact links, and About Me (experience, skills, stack, signature). It is written into the HTML at build time, so it stays readable without JavaScript.
- `content/works.mjs`: the cards on the works index and the exploration toggle (disabled in `index.html` for now), in display order. Dates are months (`'2024-07'`); `to: null` means ongoing.
- `content/projects/`: one case study per file, named after its work's `id`.

**Adding a project:** add its card to `content/works.mjs` with `page: true`. It gets a page at `/work/<id>` right away, using its card details and a stand-in gallery. To write the case study, copy `content/projects/ocean.mjs` to `content/projects/<id>.mjs`, fill it in, and list it in `content/projects/index.mjs`. Put local images in `public/assets/works/`.

**Password-protected work:** a card with `passwordProtected: true` gets a page that shows its cover, title and facts, with a PIN panel where the gallery seal would be. The PIN is checked on the server (`api/unlock.js`, `server/works-pass.mjs`), never in the page. A right PIN sets a signed, HttpOnly cookie that opens every protected project for a day. The gallery only comes from the server (`api/gallery.js`), so it is not in the page's code. A protected project's cover lives in `private/works/<id>/cover.webp`, and its card shows a coarse dithered preview made by `python3 tools/locked-preview.py <id>` until the PIN is in. Its own gallery lives in `private/works/<id>/gallery.json`, with its images beside it, served by `api/work-asset.js` to visitors with a pass. Until it has one, the stand-in gallery shows. Once the PIN is in, the full cover arrives through the preview's own dither, its dots sharpening until they melt into the photograph (`src/project/cover-reveal.mjs`).

The server needs `WORKS_PIN` (six digits) and `WORKS_SECRET` (a long random string). Set them on Vercel, and in `.env.local` for the dev server (see `.env.example`). Changing `WORKS_SECRET` signs everyone out. `WORKS_RESET_PASS=1` in `.env.local` makes the dev server forget the pass on every page load, for testing the panel.

## Images

`public/assets/` is served as-is at `/assets/`. The large images are WebP files generated from full-size masters in `tools/source-images/`. To change one, replace its master and run `npm run images`. `tools/optimize-images.py` sets each image's size and quality.

## Code layout

```
index.html, surface.html, work.html   pages; /work/<id> opens index.html, which shows work.html?work=<id> over the works row
content/          site text, works, and case studies
public/assets/    images, icons, and fonts
build/            Vite plugin that writes content and shared partials into the HTML
src/
  pages/          one entry module per page
  surface/        the stitch surface: scene, controls panel, and input
  stitch/         stitch model, renderer, motifs, free stitch, corners, wordmark
  paper/          the paper card: flip, tilt, material, and text contour
  ink/            ink entrances and the hover bleed
  wax/            wax seal material, light, and entrance
  bird/           the flying bird
  clock/          dot clock and departure-board text
  works/          works gallery and the card-to-page flight
  project/        project page detail and its depth gallery
  preloader/      loading progress
  content/        helpers that read content/ (labels, project pages)
  shared/         small shared helpers (clamp, breakpoints)
  partials/       HTML shared between pages
  styles/         stylesheets; tokens.css holds the shared colors
tools/            image, motif, and bird data scripts, and their sources
docs/behavior.md  detailed notes on how each part looks and moves
```

Tests sit beside the modules they cover (`*.test.mjs`).

## Deployment

Vercel runs `npm run build` and publishes `dist/` (see `vercel.json`). Hashed scripts and styles under `/static/` are cached for a year. Files under `/assets/` are cached for a day, so give a changed image a new file name if it must update everywhere at once. `/work/<id>` is rewritten to `index.html`, which shows the project over the works row as if its card had been chosen, so "back" plays the usual flight home. The project page itself is `work.html?work=<id>`. The old `/ocean.html` redirects to `/work/ocean`. The welcome loader plays once a browser session, on whichever page opens first.
