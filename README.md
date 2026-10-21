# Kruissteek surface study

A standalone experiment in a fixed white surface and interactive cross-stitch. The default is the supplied simple corner ornament, traced as a 31 × 31 grid, rotated inward at all four corners. Each black reference square becomes one charcoal X. Subtle perforations indicate the stitchable grid. Needles and cotton strands are drawn procedurally; there is no woven background texture.

```sh
git clone https://github.com/pambudi-tech/pambudi-porto.git
cd pambudi-porto
npm start
```

Open http://127.0.0.1:4317. Use `PORT=4318 npm start` to choose another port.

The bottom-center clock shows local time with seconds through enlarged dots on the same surface lattice. Its mobile placement clears the inward corner tails. It refreshes once per second and suspends while the page is hidden.

The centered paper frame uses the approved subtle embossed PNG, `assets/embossed-paper-frame.png`, scaled to fit the viewport. Its large center and ornamental gaps are solid paper; the outside of the cutout is transparent.

The paper has a restrained tactile response through `paper-interaction.mjs` and the shared settings in `paper-motion.mjs`. Hover follows the pointer with at most 1.05°/1.35° of tilt and a soft shadow shift. Pressing flattens it slightly; touch release and pointer leave settle it back to its anchored center. Alpha hit testing keeps transparent cutout areas stitchable. Paper presses and strokes crossing the sheet do not add hidden embroidery. Reduced motion keeps tilt and scale still. No paper entrance animation is added.

The supplied PAMBUDI artwork is traced from `assets/wordmark-source.png` into actual cross-stitch cells, using the same grid and cotton-thread renderer as the embroidery. On desktop its white thread spans the top with three grid cells of clearance on each side, above two lower corner ornaments. On mobile (540px and below), the wordmark is hidden and two matching upper corner ornaments appear, using the same pattern and inward rotations as the lower pair. Mobile corners have one stitch of clearance; desktop corners have three, defined by `edgeGapStitches` in `model.mjs`. Positions snap to the shared lattice. The paper stays at the viewport center, above the bird and wordmark.

Surface spacing is 25% wider than the original on desktop. Mobile (540px and below) retains its previous 50% wider spacing, controlled by `surfaceSpacing(width)` in `model.mjs`. Dot diameter stays at its previous size. The lower corner stitch maps and the bird's cell counts at each viewport are preserved, so their stitches spread with the grid; PAMBUDI is resampled to fit its responsive width.

Threads across the wordmark, bird, ornaments, and visitor embroidery are 15% thicker through the shared `THREAD_WEIGHT` in `render.mjs`. Upper corner edits remain stored when hidden on desktop, and the stitch count follows the visible layout. The `mobileTopCorners` storage flag prevents intentionally unpicked upper stitches from being reseeded on reload.

On each initial page load, visible corner ornaments sew from their outer corners inward and the desktop wordmark stitches from bottom to top. Both use the shared `StitchEntrance` timing in `stitch-entrance.mjs` and the existing two-pass X renderer. Corners finish in about two seconds and the wordmark in about two and a half. The entrance draws on the existing embroidery and wordmark layers, preserving the paper overlap. It does not alter saved stitches or undo history, and resizing does not restart it. Reduced motion shows complete patterns immediately; editing a corner cell takes over that stitch immediately.

The abandoned procedural material study is retained separately at http://127.0.0.1:4317/paper-comparison.html and is not loaded by the portfolio.

- Click or drag to stitch; a stroke is one undo action.
- Choose one of six threads, or use the unpick tool to remove stitches.
- Right-click the surface for the stitching panel: stitch/unpick, thread colors, undo/redo, and the current stitch count. The panel stays within the viewport and closes with a click outside or Escape. Dismissing it does not place a stitch.
- On touch screens, long-press for the same panel. A short tap stitches; dragging follows the thread. Long-press and multi-touch do not leave provisional stitches.
- With the surface focused, Shift F10 or the context-menu key opens the panel. Use arrow keys to move among its controls.
- The cloth has no pan or zoom controls or gestures. Corner motifs stay anchored to the page edges as the viewport changes. Their local stitch coordinates preserve edits through resizing.
- Unpicking runs the same two-pass stitch animation backward, with no fading or floating.
- A bird, reconstructed from the supplied cross-stitch animation, travels through the surface's actual dot grid. Its pattern is sampled at the same stitch spacing as the corner motifs and visitor stitches. Each X sews and withdraws in place as the bird changes cells; it is drawn on the embroidery canvas. Permanent embroidery keeps its cells. The bird never changes saved embroidery or adds animation frames to undo history.
- The bird pauses when reduced motion is preferred and suspends while the page is hidden.
- `S` selects the needle, `E` the unpick tool, and `1`–`6` select colors.
- `Cmd/Ctrl Z` undoes; `Cmd/Ctrl Shift Z` redoes.
- Focus the surface and use arrow keys followed by Enter to stitch with a keyboard.
- Stitches are saved in this browser's local storage, including an intentionally blank canvas. This is a local experiment; visitors do not share a live canvas.
- Reduced-motion preferences skip the two-pass stitch and unpick animations.
- This version uses the separate `kruissteek.surface.v4-corners` storage key so the old central frame is not restored. Previous storage entries are left intact.

`npm test` checks corner rotations and anchoring, retained edits through resizing, reverse unpick geometry, continuous strokes, undo/redo transactions and layout, and persistence validation. The corner data and placements live in `corners.mjs`; stitch state is independent of rendering in `model.mjs`.

For a disposable test session, open `http://127.0.0.1:4317/?scratch`. This starts from the responsive corner layout and does not read or overwrite saved stitches.
