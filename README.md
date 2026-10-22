# Ivan Pambudi - The Portfolio

A standalone experiment in a fixed white surface and interactive cross-stitch. The default is the supplied simple corner ornament, traced as a 31 × 31 grid, rotated inward at all four corners. Each black reference square becomes one charcoal X. Subtle perforations indicate the stitchable grid. Needles and cotton strands are drawn procedurally; there is no woven background texture.

```sh
git clone https://github.com/pambudi-tech/pambudi-porto.git
cd pambudi-porto
npm start
```

Open http://127.0.0.1:4317. Use `PORT=4318 npm start` to choose another port.

For production, `npm run build` copies the browser files and assets into `dist/`. `vercel.json` explicitly selects the Other framework preset and publishes that directory as a static site. `server.mjs` is only the local preview server and is excluded from the deployment output. A successful deployment build does not prove runtime health; verify that the production homepage and its JavaScript, fonts, and images return HTTP 200. A `FUNCTION_INVOCATION_FAILED` error is a runtime failure whose stack trace is in Vercel’s project Logs, rather than the build log.

The bottom-center clock shows local time with seconds through enlarged dots on the same surface lattice. Its mobile placement clears the inward corner tails. It refreshes once per second and suspends while the page is hidden.

The centered paper frame uses the approved subtle embossed PNG, `assets/embossed-paper-frame.png`, scaled to fit the viewport. Its large center and ornamental gaps are solid paper; the outside of the cutout is transparent.

The paper holds Ivan’s two-paragraph introduction in locally hosted Syne Mono, with its open font license in `assets/fonts/`. Desktop copy is 16px; mobile copy is 14px. On mobile, the paper uses 8px side margins with a viewport-height cap. Image and text share the `.portfolio-paper` wrapper so they tilt and press together; the PNG still supplies the outline used for hit testing.

`paper-material.mjs` adds fixed fine grain and a restrained matte light response above the approved PNG and below the copy and seal. Softened image luminance supplies an approximate relief response around the existing embossed detail; it is not a physical height map. Four directional textures are prepared once and composited as the existing motion settles, alongside a broad diffuse light. The overlay follows the PNG alpha, so transparent cutouts remain clear. Grain never animates or reseeds. Reduced motion retains static grain with no moving light. The original image remains the fallback if material preparation fails.

The lower paper oval holds the transparent wax seal image in `assets/works-wax-seal.png`, with an embossed lowercase “works” label in Syne Mono. `wax-material.mjs` reconstructs an approximate height and normal map from distances inside the actual PNG outline, with a rolled rim, recessed groove, inner lip, and image-derived fine detail. These are inferred surface features, not measured geometry. A pointer-controlled light is shaded against those normals in `wax-interaction.mjs`; the reflection takes its red pigment from the source image and uses CSS overlay blending to enrich the wax color and retain its texture. The quiet face and stronger rim reflection stay inside the original alpha, and the embossed label remains above them. There is no timed sweep or repeating animation. The wax reflection starts appearing within 100px of the oval before hover, with a smooth spatial falloff, a 240ms fade response, and 110ms pointer-follow response shared in `WAX_LIGHT`. The embossed label eases with the same light strength and direction. Keyboard focus uses a static light; reduced motion disables pointer-driven lighting. Drawing settles into its target and stops when still, reusing the shaded pixels while only the reflection opacity changes. The original image remains visible if enhancement fails. The seal scales with the paper, sits 2px above its initial placement, and darkens while pressed. Its native button events do not place stitches. The standalone procedural experiment remains at `/wax-study/index.html`; the homepage uses the image.

The introduction grows from independent ink deposits inside each letter over about 4.2 seconds. Both paragraphs begin together. `ink-growth.mjs` preserves the soft, irregular soaking reveal beneath two temporary canvas layers that grow the letter coverage using the live text geometry; the original text stays in place and returns when the entrance completes. Reduced motion skips the effect, and resizing completes it immediately. The desktop text column is 12px narrower than the previous layout; mobile width is unchanged.

The paper has a pronounced tactile response through `paper-interaction.mjs` and the shared settings in `paper-motion.mjs`. Hover follows the pointer with at most 5.5°/7° of tilt and a 1.8% lift in scale. Its shadow uses the layered falloff approach demonstrated by [Smooth Shadows](https://smoothshadows.com/), adapted into three faint alpha-following drop shadows: contact, intermediate, and broad ambient. Hover gently widens the shadow to an 18px ambient blur with 3.2% outer-layer opacity. These are local CSS values; no runtime shadow library is loaded. Pressing flattens it and compresses its scale to 98%; touch release and pointer leave settle it back to its anchored center. Alpha hit testing keeps transparent cutout areas stitchable. Paper presses and strokes crossing the sheet do not add hidden embroidery. Reduced motion keeps tilt and scale still. No paper entrance animation is added.

The supplied PAMBUDI artwork is traced from `assets/wordmark-source.png` into actual cross-stitch cells, using the same grid and cotton-thread renderer as the embroidery. On desktop its white thread spans the top with three grid cells of clearance on each side, above two lower corner ornaments. On mobile (540px and below), the same artwork is traced into enlarged surface dots using the clock’s shared dot renderer in `dot-matrix.mjs`. It retains one-dot side margins and the existing surface spacing. Upper corner ornaments are hidden at every viewport; only the lower pair remains visible. Mobile corners have one stitch of clearance; desktop corners have three, defined by `edgeGapStitches` in `model.mjs`. Positions snap to the shared lattice. The paper stays at the viewport center, above the bird and wordmark.

Surface spacing is 25% wider than the original on desktop. Mobile (540px and below) retains its previous 50% wider spacing, controlled by `surfaceSpacing(width)` in `model.mjs`. Dot diameter stays at its previous size. The lower corner stitch maps and the bird's cell counts at each viewport are preserved, so their stitches spread with the grid; PAMBUDI is resampled to fit its responsive width.

Threads across the wordmark, bird, ornaments, and visitor embroidery are 15% thicker through the shared `THREAD_WEIGHT` in `render.mjs`. Upper corner edits remain stored while hidden, and the stitch count follows the visible layout. The `mobileTopCorners` storage flag prevents intentionally unpicked upper stitches from being reseeded on reload.

On each initial page load, visible corner ornaments sew from their outer corners inward and the wordmark rises from bottom to top with a flame-shaped, irregular edge. Broad tongues lean upward while smaller pockets fill in behind them; desktop stitches and mobile dots use the same spatial reveal plan. Both use the shared `StitchEntrance` timing in `stitch-entrance.mjs` and the existing two-pass X renderer. Corners finish in about two seconds and the wordmark in about two and a half. The entrance draws on the existing embroidery and wordmark layers, preserving the paper overlap. It does not alter saved stitches or undo history, and resizing does not restart it. Reduced motion shows complete patterns immediately; editing a corner cell takes over that stitch immediately.

The abandoned procedural material study is retained separately at http://127.0.0.1:4317/paper-comparison.html and is not loaded by the portfolio.

- Click or drag to stitch; a stroke is one undo action.
- Choose one of six threads, or use the unpick tool to remove stitches.
- Right-click the surface for the stitching panel: stitch/unpick, thread colors, undo/redo, and the current stitch count. The panel stays within the viewport and closes with a click outside or Escape. Dismissing it does not place a stitch.
- On touch screens, long-press for the same panel. A short tap stitches; dragging follows the thread. Long-press and multi-touch do not leave provisional stitches.
- With the surface focused, Shift F10 or the context-menu key opens the panel. Use arrow keys to move among its controls.
- The cloth has no pan or zoom controls or gestures. Corner motifs stay anchored to the page edges as the viewport changes. Their local stitch coordinates preserve edits through resizing.
- Unpicking runs the same two-pass stitch animation backward, with no fading or floating.
- A bird, reconstructed from the supplied cross-stitch animation, travels through the surface's actual dot grid. Its pattern is sampled at the same stitch spacing as the corner motifs and visitor stitches. Each X sews and withdraws in place as the bird changes cells; it is drawn on the embroidery canvas. Permanent embroidery keeps its cells. The bird never changes saved embroidery or adds animation frames to undo history.
- On first load, the bird reveals from its center outward with the shared irregular flame pattern. The reveal follows its flight and wing poses. As stitches cross behind the centered paper they become a more vibrant leaf green, while the incoming tail retains its original red. On the return pass, stitches become red again as they emerge on the left.
- The bird pauses when reduced motion is preferred and suspends while the page is hidden.
- `S` selects the needle, `E` the unpick tool, and `1`–`6` select colors.
- `Cmd/Ctrl Z` undoes; `Cmd/Ctrl Shift Z` redoes.
- Focus the surface and use arrow keys followed by Enter to stitch with a keyboard.
- Stitches are saved in this browser's local storage, including an intentionally blank canvas. This is a local experiment; visitors do not share a live canvas.
- Reduced-motion preferences skip the two-pass stitch and unpick animations.
- This version uses the separate `kruissteek.surface.v4-corners` storage key so the old central frame is not restored. Previous storage entries are left intact.

`npm test` checks corner rotations and anchoring, retained edits through resizing, reverse unpick geometry, continuous strokes, undo/redo transactions and layout, and persistence validation. The corner data and placements live in `corners.mjs`; stitch state is independent of rendering in `model.mjs`.

For a disposable test session, open `http://127.0.0.1:4317/?scratch`. This starts from the responsive corner layout and does not read or overwrite saved stitches.
