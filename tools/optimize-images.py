"""Writes the site's WebP images from the full-size masters in source-images/.

Requires Pillow with WebP support. Run after replacing a master:

    python3 tools/optimize-images.py

or name the masters to encode only those:

    python3 tools/optimize-images.py wax-seal-albedo wax-seal-relief

Each image is sized to what the page needs and encoded as tightly as its use
allows: the paper frames are lossy at a quality where the error averages
about one level; the wax seal keeps exact pixels, since its shading is
reconstructed from fine detail; the wordmark keeps exact pixels because it
is traced cell by cell.
"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools' / 'source-images'
OUTPUT = ROOT / 'public' / 'assets'

LOSSY = dict(quality=95, method=6, alpha_quality=100)
# Surface normals for the WebGL paper (src/paper/paper-gl.mjs): lighting
# reads their slopes, so a little loss shows only as faint shading noise.
RELIEF = dict(quality=90, method=6)
EXACT = dict(lossless=True, exact=True, quality=100, method=6)

# name: (sizes in pixels wide, encoding). The first is the image's own URL
# (None keeps the master's size); each smaller one is a srcset candidate
# written beside it as <name>-<width>w.webp.
IMAGES = {
    # Shown up to the viewport's height; the masters are the limit. Phones
    # at up to about 1.8 device pixels per CSS pixel need no more than 800.
    'embossed-paper-frame': ((None, 800), LOSSY),
    'debossed-red-paper-frame': ((None, 800), LOSSY),
    # Its wax material is computed at 512 and 768 pixels wide, and the seal
    # is never shown wider than about 420 device pixels.
    'works-wax-seal': ((768,), EXACT),
    # The relit seal's colour and relief (src/wax/wax-gl.mjs), written by
    # tools/build-wax-seal.py. Exact: any loss shows in the moving gloss.
    'wax-seal-albedo': ((768,), EXACT),
    'wax-seal-relief': ((768,), EXACT),
    # The round P seal (p-seal.html), shown up to 560 CSS pixels wide, and
    # its colour, relief and monogram from tools/build-round-seal.py. The
    # still is a frame of the relit seal, its alpha kept exact for the edge.
    'round-seal': ((1024,), LOSSY),
    'round-seal-albedo': ((1024,), EXACT),
    'round-seal-relief': ((1024,), EXACT),
    'round-seal-letters': ((1024,), EXACT),
    # The paper model's baked relief (front emboss, back deboss), lit live on
    # the paper; 1024 wide covers the sheet at up to two device pixels.
    'paper-front-relief': ((1024,), RELIEF),
    'paper-back-relief': ((1024,), RELIEF),
    # Shown at most 160 CSS pixels wide.
    'ivan-signature': ((640, 320), EXACT),
    'wordmark-source': ((None,), EXACT),
}

only = set(sys.argv[1:])
for name, (widths, options) in IMAGES.items():
    if only and name not in only:
        continue
    master = Image.open(SOURCE / f'{name}.png')
    master.load()
    for index, width in enumerate(widths):
        image = master
        if width and image.width > width:
            image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
        target = OUTPUT / (f'{name}.webp' if index == 0 else f'{name}-{width}w.webp')
        image.save(target, 'WEBP', **options)
        print(f'{target.relative_to(ROOT)}: {image.width}×{image.height}, {target.stat().st_size // 1024} KB')
