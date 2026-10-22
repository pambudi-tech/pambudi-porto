#!/usr/bin/env python3
"""Read the supplied pixel charts into one-cell-per-stitch patterns.

Requires Pillow. Sources are retained in previews/motif-references/. Cell
centers avoid chart lines; measured row/column pitches handle photographed
grids. Palettes consolidate compression noise while retaining the chart hues.
Run from any directory with: python3 tools/trace-motifs.py
"""
from pathlib import Path
from statistics import median
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SPECS = [
    # id, name, first grid boundary, pitch, chart cell count, thread palette
    ('rose', 'Rose', (214, 89), (21, 20.93), (17, 26),
     ['#491728', '#771221', '#a90c22', '#d70c1d', '#ff373f', '#0c3e35', '#214d2b', '#2d6e2b', '#4b862b', '#86a93e']),
    ('dinosaur', 'Dinosaur', (-2.5, -1.5), (33.6, 33.25), (22, 22),
     ['#104e2e', '#205c34', '#438d3b', '#80a33c', '#d8bd64', '#3b2913']),
    ('sword', 'Sword', (0, 0), (20, 20), (20, 18),
     ['#073b3e', '#07585b', '#087e7c', '#00a498', '#00cfb5', '#00efd0', '#774014', '#a85c13', '#b9781b']),
    ('dragon', 'Dragon', (33, 42), (46.78, 46.76), (18, 21), ['#cc1520']),
    ('watermelon', 'Watermelon', (9, 4), (34.17, 34.14), (22, 30),
     ['#111314', '#f50a36', '#ef607e', '#087e41', '#1eac59', '#f6f3e7']),
    ('lightning', 'Lightning', (0, 0), (31.45, 31.45), (19, 18),
     ['#161711', '#ffe600', '#ffb600', '#fff7dc']),
    ('bow', 'Bow', (-.5, -.5), (36.98, 36.98), (20, 28), ['#e66db8', '#f6c7e5']),
    ('duck', 'Duck', (.5, -.5), (29.95, 29.9), (20, 19), ['#161912', '#f3ce06', '#ec8004']),
    ('diamond', 'Diamond', (20, 64), (44.65, 44.65), (15, 11),
     ['#12678e', '#087eac', '#049bc4', '#23d9df', '#51e8ea', '#c1f4f2']),
]

def rgb(hex_color):
    return tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))

def sample(image, x, y):
    values = list(image.crop((round(x) - 2, round(y) - 2, round(x) + 3, round(y) + 3)).getdata())
    return tuple(median(pixel[c] for pixel in values) for c in range(3))

motifs = []
for id, name, origin, pitch, size, palette in SPECS:
    image = Image.open(ROOT / 'previews' / 'motif-references' / f'{id}.png').convert('RGB')
    values = [rgb(color) for color in palette]
    cells = {}
    for row in range(size[1]):
        for col in range(size[0]):
            color = sample(image, origin[0] + (col + .5) * pitch[0], origin[1] + (row + .5) * pitch[1])
            if min(color) > 215 and max(color) - min(color) < 25:
                continue  # Blank paper, rather than a white thread.
            if id == 'dragon' and not (color[0] > 90 and color[0] - color[1] > 65 and color[0] - color[2] > 40):
                continue  # Exclude the screenshot's grid and corner UI.
            nearest = min(range(len(values)), key=lambda i: sum((color[c] - values[i][c]) ** 2 for c in range(3)))
            cells[col, row] = nearest

    # White rind and the bolt's three highlights are intentional light cells
    # enclosed by their outlines, rather than the chart's blank background.
    if id in ('watermelon', 'lightning'):
        for row in range(size[1]):
            xs = [col for col, y in cells if y == row]
            if xs:
                for col in range(min(xs), max(xs) + 1):
                    cells.setdefault((col, row), len(palette) - 1)

    x0 = min(x for x, y in cells); x1 = max(x for x, y in cells)
    y0 = min(y for x, y in cells); y1 = max(y for x, y in cells)
    rows = [''.join('0123456789abcdefghijklmnopqrstuvwxyz'[cells[x, y]] if (x, y) in cells else '.'
                    for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)]
    motifs.append(dict(id=id, name=name, palette=palette, rows=rows,
                       source=dict(file=f'{id}.png', origin=origin, pitch=pitch, size=size, crop=[x0, y0, x1, y1])))
    print(f'{name}: {x1 - x0 + 1} x {y1 - y0 + 1}, {len(cells)} stitches')
    print('\n'.join(rows))

output = '// Traced from the user-supplied charts with tools/trace-motifs.py.\n'
output += '// One colored source square becomes one X; dots are unstitched.\n'
output += 'export const MOTIF_DATA = ' + json.dumps(motifs, indent=2) + ';\n'
(ROOT / 'motif-data.mjs').write_text(output)
