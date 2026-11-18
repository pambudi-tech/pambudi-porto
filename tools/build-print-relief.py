#!/usr/bin/env python3
"""Write the homepage paper's relief: the 3D-printed card's emboss.

  tools/source-images/paper-print-front-relief.png   the front, embossed
  tools/source-images/paper-print-back-relief.png    the back, debossed
      (then `python3 tools/optimize-images.py paper-print-front-relief
      paper-print-back-relief` for the WebP files src/paper/paper-gl.mjs lights)

Both come from tools/source-images/print-emboss-height.png: the printed
card's front, its height over the paper (16 bit, white = HEIGHT_MM), on the
relief image's grid (the traced frame and RELIEF_MARGIN artwork units of flat
paper round it). It is the height tools/build-card-3d.py gives the card's
front (card_fields: each stroke climbs to a ridge), sampled over that grid.

The normals are the height's own slopes, to scale: nothing is exaggerated.
The printed card's back is flat; the paper's back is this front pressed
through the sheet, so its deboss is the front's height turned over (mirrored
left to right, sunk as deep as the front stands).

Requires Pillow and numpy.
"""
from pathlib import Path

import numpy as np
from PIL import Image

import card_geometry as g

SOURCES = g.ROOT / 'tools' / 'source-images'
HEIGHT_MM = 1.26
# The grid: the artwork's width and both margins, across the image.
MARGIN_X = 47


def normals(height, mm_per_texel):
    """The surface's normals, x right and y up the sheet, as the shader reads them."""
    down, right = np.gradient(height.astype(np.float64), mm_per_texel)
    n = np.stack([-right, down, np.ones_like(right)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(np.clip(np.round((n + 1) / 2 * 255), 0, 255).astype(np.uint8))


def main():
    height = np.asarray(Image.open(SOURCES / 'print-emboss-height.png'), dtype=np.float64) / 65535 * HEIGHT_MM
    art_mm = g._K[0] * g.MM_PER_UNIT
    mm_per_texel = (g.ART[0] + 2 * MARGIN_X) * art_mm / height.shape[1]
    normals(height, mm_per_texel).save(SOURCES / 'paper-print-front-relief.png', optimize=True)
    normals(-height[:, ::-1], mm_per_texel).save(SOURCES / 'paper-print-back-relief.png', optimize=True)
    print(f'{height.shape[1]} x {height.shape[0]}, {mm_per_texel:.4f} mm per texel, up to {height.max():.2f} mm')


if __name__ == '__main__':
    main()
