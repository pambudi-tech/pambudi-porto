"""The resume's public pages before the PIN, as a protected work's cover is.

tools/resume/build.mjs draws each page of the teaser (the resume with every
word below the header scrambled) at the locked sample's size, 280 px wide; this
bakes each into the site's locked dither with tools/locked-preview.py's own
dots: crisp, coarse, 5 brightness steps. src/project/cover-reveal.mjs reveals
the resume from it with the PIN, as it does a cover. Run by build.mjs:

    python3 tools/resume/locked-pages.py <sample.png> <out.webp> [...]
"""

import importlib.util
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location('locked_preview', ROOT / 'tools' / 'locked-preview.py')
locked = importlib.util.module_from_spec(spec)
spec.loader.exec_module(locked)

WIDTH = 1200  # the preview's width, as a cover's; the height follows the page


def bake(sample_path, out_path):
    tiny = Image.open(sample_path).convert('RGB')
    columns = WIDTH // locked.CELL
    rows = round(WIDTH * tiny.height / tiny.width) // locked.CELL
    colours = tiny.resize((columns, rows), Image.BILINEAR)
    dots = Image.new('RGB', (columns, rows))
    for y in range(rows):
        for x in range(columns):
            rgb = tuple(value / 255 for value in colours.getpixel((x, y)))
            dots.putpixel((x, y), tuple(round(value * 255) for value in locked.shade(rgb, x, y)))
    out = Path(out_path)
    dots.resize((columns * locked.CELL, rows * locked.CELL), Image.NEAREST).save(out, 'WEBP', lossless=True, method=6)
    print(out.relative_to(ROOT), out.stat().st_size, 'bytes')


if __name__ == '__main__':
    pairs = sys.argv[1:]
    for sample, out in zip(pairs[::2], pairs[1::2]):
        bake(sample, out)
