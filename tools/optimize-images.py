"""Writes the site's WebP images from the full-size masters in source-images/.

Requires Pillow with WebP support. Run after replacing a master:

    python3 tools/optimize-images.py

Each image is sized to what the page needs and encoded as tightly as its use
allows: the paper frames are lossy at a quality where the error averages
about one level; the wax seal keeps exact pixels, since its shading is
reconstructed from fine detail; the wordmark keeps exact pixels because it
is traced cell by cell.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools' / 'source-images'
OUTPUT = ROOT / 'public' / 'assets'

LOSSY = dict(quality=95, method=6, alpha_quality=100)
EXACT = dict(lossless=True, exact=True, quality=100, method=6)

# name: (widest size in pixels or None to keep it, encoding)
IMAGES = {
    # Shown up to the viewport's height; the masters are the limit.
    'embossed-paper-frame': (None, LOSSY),
    'debossed-red-paper-frame': (None, LOSSY),
    # Its wax material is computed at 512 and 768 pixels wide.
    'works-wax-seal': (1024, EXACT),
    # Shown at most 160 CSS pixels wide.
    'ivan-signature': (640, EXACT),
    'wordmark-source': (None, EXACT),
}

for name, (width, options) in IMAGES.items():
    image = Image.open(SOURCE / f'{name}.png')
    image.load()
    if width and image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    target = OUTPUT / f'{name}.webp'
    image.save(target, 'WEBP', **options)
    print(f'{target.relative_to(ROOT)}: {image.width}×{image.height}, {target.stat().st_size // 1024} KB')
