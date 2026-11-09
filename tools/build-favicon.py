"""Makes the site's favicons from the masters tools/build-favicon.mjs renders:

    python3 tools/build-favicon.py

public/favicon.ico (16, 32, 48) and favicon-32.png: the round P seal at rest.
public/apple-touch-icon.png: the same on white, as iOS shows it.
public/assets/favicon-light.webp: a strip of FRAMES 32 px squares, a lamp
circling the seal, which src/favicon/favicon-light.mjs plays in the tab.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/source-images'
PUBLIC = ROOT / 'public'
FRAMES, TILE = 36, 32

rest = Image.open(SOURCE / 'favicon-rest.png').convert('RGBA')
small = lambda size: rest.resize((size, size), Image.LANCZOS)
small(32).save(PUBLIC / 'favicon-32.png', optimize=True)
small(48).save(PUBLIC / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
# iOS fills transparency with black: the seal on white, with a margin.
touch = Image.new('RGBA', (180, 180), (255, 255, 255, 255))
touch.alpha_composite(small(156), (12, 12))
touch.convert('RGB').save(PUBLIC / 'apple-touch-icon.png', optimize=True)

strip = Image.open(SOURCE / 'favicon-light-frames.png').convert('RGBA')
size = strip.height
out = Image.new('RGBA', (FRAMES * TILE, TILE))
for i in range(FRAMES):
    out.paste(strip.crop((i * size, 0, (i + 1) * size, size)).resize((TILE, TILE), Image.LANCZOS), (i * TILE, 0))
# Lossy: its error averages about three levels, unseen at 32 px, for a
# third of the lossless bytes (19 KB, not 61).
out.save(PUBLIC / 'assets/favicon-light.webp', quality=92, alpha_quality=100, method=6)
for path in ('favicon-32.png', 'favicon.ico', 'apple-touch-icon.png', 'assets/favicon-light.webp'):
    print(path, (PUBLIC / path).stat().st_size, 'bytes')
