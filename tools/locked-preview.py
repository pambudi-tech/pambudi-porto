"""The public preview of a passcode-protected work's cover.

The full cover stays in private/works/<id>/cover.webp, sent only with the
PIN's pass (server/works-pass.mjs). The public stand-in is the site's own
dither (src/works/dither.mjs), baked in: crisp dots in the photo's own
colours, a little coarser than the cards', sampled from a small copy of the
cover, so it reads as the picture but its fine detail is gone. Run after
changing a protected cover:

    python3 tools/locked-preview.py bca-prioritas bca-co-id
"""

import math
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# src/project/cover-reveal.mjs starts its reveal from this dither: keep its
# LOCKED in step with SAMPLE, CELL and LEVELS.
SAMPLE = (280, 210)   # all the detail the preview keeps: enough to cover up
SIZE = (1200, 900)    # the preview's size, 4:3 like every cover
CELL = 3              # pixels per dither dot
LEVELS = 5            # brightness steps between black and white


def bayer2(x, y):
    return ((math.floor(x) / 2 + math.floor(y) ** 2 * .75) % 1 + 1) % 1


def bayer8(x, y):
    """The 8x8 ordered-dither threshold, as dither.mjs computes it."""
    bayer4 = lambda a, b: bayer2(a / 2, b / 2) * .25 + bayer2(a, b)
    return bayer4(x / 2, y / 2) * .25 + bayer2(x, y)


def shade(rgb, x, y):
    """One dot: the colour at its brightness step, keeping its hue."""
    luma = sum(value * weight for value, weight in zip(rgb, (.299, .587, .114)))
    stepped = min(1, math.floor(luma * LEVELS + bayer8(x, y)) / LEVELS)
    if stepped <= luma:
        return tuple(value * stepped / luma for value in rgb) if luma > 0 else (0, 0, 0)
    towards_white = (stepped - luma) / (1 - luma)
    return tuple(value + (1 - value) * towards_white for value in rgb)


def preview(work_id):
    cover = Image.open(ROOT / 'private' / 'works' / work_id / 'cover.webp').convert('RGB')
    # Cover-crop to 4:3, as the cards do, then keep only a tiny copy's detail.
    width, height = cover.size
    crop_height = min(height, round(width * 3 / 4))
    crop_width = round(crop_height * 4 / 3)
    left, top = (width - crop_width) // 2, (height - crop_height) // 2
    tiny = cover.crop((left, top, left + crop_width, top + crop_height)).resize(SAMPLE, Image.LANCZOS)
    columns, rows = SIZE[0] // CELL, SIZE[1] // CELL
    colours = tiny.resize((columns, rows), Image.BILINEAR)
    dots = Image.new('RGB', (columns, rows))
    for y in range(rows):
        for x in range(columns):
            rgb = tuple(value / 255 for value in colours.getpixel((x, y)))
            dots.putpixel((x, y), tuple(round(value * 255) for value in shade(rgb, x, y)))
    out = ROOT / 'public' / 'assets' / 'works' / f'{work_id}-locked.webp'
    dots.resize(SIZE, Image.NEAREST).save(out, 'WEBP', lossless=True, method=6)
    print(out.relative_to(ROOT), out.stat().st_size, 'bytes')


if __name__ == '__main__':
    for work_id in sys.argv[1:]:
        preview(work_id)
