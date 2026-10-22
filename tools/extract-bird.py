#!/usr/bin/env python3
"""Extract the supplied bird's X stitches and articulate a registered flap loop.

Requires Pillow and NumPy. The source is read only. Its 480 px crop clips most
other poses, so the complete raised-wing pose supplies the original feather
pattern; only wing coordinates are articulated for the intermediate poses.
"""
from collections import deque
from pathlib import Path
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw


SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/Users/mac/Downloads/CrossStitch-ezgif.com-resize.webp')
TARGET = Path(__file__).resolve().parents[1] / 'bird-data.mjs'
image = Image.open(SOURCE)
image.seek(16)
image.load()
pixels = np.asarray(image.convert('RGB')).astype(float)
red = np.maximum(0, pixels[:, :, 0] - pixels[:, :, 1])

# Measured lattice period and phase in the resized source. Sampling both the
# center and the four diagonal arms rejects pale background/compression marks.
pitch_x, pitch_y = 7.12, 7.56
origin_x, origin_y = 4.652, .906
diagonal_samples = [(0, 0), (-.22, -.22), (.22, -.22), (-.22, .22), (.22, .22)]
occupied = set()
for row in range(57):
    for col in range(51):
        values = [red[round(origin_y + (row + dy) * pitch_y),
                      round(origin_x + (col + dx) * pitch_x)]
                  for dx, dy in diagonal_samples]
        if np.mean(values) > 20:
            occupied.add((col, row))

# A fragment of the second bird enters below this pose. Keep only the connected
# first bird, including its intentional open featherwork.
components = []
while occupied:
    first = occupied.pop()
    component, pending = {first}, deque([first])
    while pending:
        col, row = pending.popleft()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                neighbor = (col + dx, row + dy)
                if neighbor in occupied:
                    occupied.remove(neighbor)
                    component.add(neighbor)
                    pending.append(neighbor)
    components.append(component)
base = max(components, key=len)

# The head, breast and tail retain identical cells in every pose. Each wing
# pivots at its own shoulder; the far wing follows slightly behind the near one.
left = {(col, row) for col, row in base if col < 28 and row < 41}
right = {(col, row) for col, row in base if col >= 28 and row < 34}
body = base - left - right
poses = []
for frame in range(12):
    phase = frame / 12 * math.tau
    near_flap = -.05 + 1.05 * math.cos(phase)
    far_flap = -.02 + 1.02 * math.cos(phase - .3)
    cells = set(body)
    for wing, shoulder, flap in [(left, (27, 41), near_flap), (right, (30, 34), far_flap)]:
        sx, sy = shoulder
        width = .85 + .15 * abs(flap)
        for col, row in wing:
            x = round(sx + (col - sx) * width)
            y = round(sy + (row - sy) * flap)
            cells.add((x, y))
            # A stretched downstroke can span two rows between neighboring
            # source cells. Preserve that continuous thread area on the grid.
            if abs(flap) > 1 and (col, row + 1) in wing:
                next_y = round(sy + (row + 1 - sy) * flap)
                for line in range(min(y, next_y), max(y, next_y) + 1):
                    cells.add((x, line))
    poses.append(sorted(cells, key=lambda cell: (cell[1], cell[0])))

min_x = min(col for pose in poses for col, row in pose) - 1
min_y = min(row for pose in poses for col, row in pose) - 1
poses = [[(col - min_x, row - min_y) for col, row in pose] for pose in poses]
columns = max(col for pose in poses for col, row in pose) + 2
rows = max(row for pose in poses for col, row in pose) + 2
source_ink = pixels[(red > 85) & (pixels[:, :, 1] < 145)]
color = '#' + ''.join(f'{int(channel):02x}' for channel in np.median(source_ink, axis=0))

data = [
    "import { THREAD_COLORS } from './thread-colors.mjs';",
    '',
    '// Source: the supplied CrossStitch-ezgif.com-resize.webp, complete bird in frame 16.',
    '// Original X-stitch layout; wings articulated around registered shoulders.',
    '// The source clips its other poses, so these intermediate wing positions are reconstructed.',
    f'export const BIRD_COLUMNS = {columns};',
    f'export const BIRD_ROWS = {rows};',
    'export const BIRD_COLOR = THREAD_COLORS.red;',
    'export const BIRD_FRAME_MS = 100;',
    'export const BIRD_POSES = [',
]
for pose in poses:
    data.append('  ' + json.dumps(pose, separators=(',', ':')) + ',')
data.append('];\n')
TARGET.write_text('\n'.join(data))
print(json.dumps({'output': str(TARGET), 'poses': len(poses), 'columns': columns,
                  'rows': rows, 'color': color, 'stitches': [len(pose) for pose in poses]}))

if '--preview' in sys.argv:
    size = 4
    panel_width, panel_height = columns * size + 20, rows * size + 28
    preview = Image.new('RGB', (panel_width * 4, panel_height * 3), 'white')
    drawing = ImageDraw.Draw(preview)
    for frame, pose in enumerate(poses):
        ox, oy = (frame % 4) * panel_width + 10, (frame // 4) * panel_height + 20
        drawing.text((ox, oy - 16), str(frame), fill='black')
        for col, row in pose:
            x, y = ox + col * size, oy + row * size
            drawing.line((x - 1.5, y - 1.5, x + 1.5, y + 1.5), fill=color)
            drawing.line((x - 1.5, y + 1.5, x + 1.5, y - 1.5), fill=color)
    preview.save('/private/tmp/bird-pose-extraction.png')
