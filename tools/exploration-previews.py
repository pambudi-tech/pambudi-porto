"""Writes smaller copies of the exploration pieces for their cards.

A card is dithered from its photo at the card's size (src/works/dither.mjs),
never wider than about 600 CSS pixels, so it needs no more than 1200 device
pixels; decoding the originals, some 2000 pixels wide, for every new card
size is what made changing view slow. The originals in
public/assets/exploration/ load only up close. An animated piece keeps its
first frame, as its dithered card does.

    python3 tools/exploration-previews.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public' / 'assets' / 'exploration'
OUTPUT = SOURCE / 'preview'
LONGEST = 1200

OUTPUT.mkdir(exist_ok=True)
for path in sorted(SOURCE.glob('*.webp')):
    with Image.open(path) as image:
        image.seek(0)
        frame = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
    frame.thumbnail((LONGEST, LONGEST), Image.LANCZOS)
    out = OUTPUT / path.name
    frame.save(out, 'WEBP', quality=86, method=6)
    print(f'{out.relative_to(ROOT)}  {frame.width}x{frame.height}  {out.stat().st_size // 1024} KB')
