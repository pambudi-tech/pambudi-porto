"""Checks a sliced plate layer by layer for plastic laid over air: every
extrusion is drawn at its width, and what the part's walls and skins lay
past what the layer below laid (part or support) is measured.

Two levels:
    leaning   more than LEAN mm past: a line more than half over air; a
              60 degree overhang at 0.08 mm layers moves out 0.14 mm a
              layer, so a few scattered pixels here are normal
    in air    more than AIR mm past: a whole line with nothing under it
              (a bridge, an island, a thread hanging from one end)
Sparse and internal solid infill are left out: they cross the infill under
them by design. Supports are measured the same way, as a count only.

Run:
    python3 tools/check-print-layers.py <plate.gcode.3mf> [placement.json]
With the placement tools/tilt-card-a1.py writes beside its plate, each
"in air" patch is said in the card's own frame (where on the card, how deep
from its back).
"""
import json
import math
import re
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

PX = .05          # mm per pixel
LEAN = .25        # mm past the layer below
AIR = .45         # mm past the layer below: more than a line's width

ARGS = sys.argv[1:]
PLATE = Path(ARGS[0]) if ARGS else None
PLACED = json.loads(Path(ARGS[1]).read_text()) if len(ARGS) > 1 else None
NUM = re.compile(r'([XYZEIJ])(-?\d*\.?\d+)')
INFILL = ('Sparse infill', 'Internal solid infill')


def kind(feature):
    if feature.lower().startswith('support'):
        return 'support'
    return 'infill' if feature in INFILL else 'skin'


def layers():
    """[(z, [(x0, y0, x1, y1, width, kind, feature)])] from the plate's G-code."""
    with zipfile.ZipFile(PLATE) as z:
        name = next(n for n in z.namelist() if n.endswith('.gcode'))
        text = z.read(name).decode()
    out, segs = [], None
    x = y = 0.
    feature, width = '', .42
    for line in text.splitlines():
        if line.startswith(';'):
            if line.startswith('; CHANGE_LAYER'):
                segs = []
                out.append([None, segs])
            elif line.startswith('; Z_HEIGHT:') and out:
                out[-1][0] = float(line.split(':')[1])
            elif line.startswith('; FEATURE:'):
                feature = line.split(':', 1)[1].strip()
            elif line.startswith('; LINE_WIDTH:'):
                width = float(line.split(':')[1])
            continue
        op = line.split(' ', 1)[0]
        if op not in ('G0', 'G1', 'G2', 'G3'):
            continue
        v = dict(NUM.findall(line.split(';')[0]))
        nx, ny = float(v.get('X', x)), float(v.get('Y', y))
        e = float(v.get('E', 0))
        if segs is not None and e > 0 and (nx, ny) != (x, y) and not feature.startswith('Custom'):
            k = kind(feature)
            if op in ('G2', 'G3'):
                cx, cy = x + float(v.get('I', 0)), y + float(v.get('J', 0))
                a0, a1 = math.atan2(y - cy, x - cx), math.atan2(ny - cy, nx - cx)
                r = math.hypot(x - cx, y - cy)
                if op == 'G3' and a1 <= a0:
                    a1 += 2 * math.pi
                if op == 'G2' and a1 >= a0:
                    a1 -= 2 * math.pi
                n = max(2, int(abs(a1 - a0) * r / .1) + 1)
                pts = [(cx + r * math.cos(t), cy + r * math.sin(t)) for t in np.linspace(a0, a1, n)]
                pts[-1] = (nx, ny)
                segs += [(*p, *q, width, k, feature) for p, q in zip(pts, pts[1:])]
            else:
                segs.append((x, y, nx, ny, width, k, feature))
        x, y = nx, ny
    return [(z, s) for z, s in out if s]


def draw(segs, box, kinds, grow=0.):
    x0, y0, w, h = box
    img = Image.new('1', (w, h), 0)
    d = ImageDraw.Draw(img)
    for ax, ay, bx, by, width, k, _ in segs:
        if k not in kinds:
            continue
        r = (width / 2 + grow) / PX
        p, q = ((ax - x0) / PX, (ay - y0) / PX), ((bx - x0) / PX, (by - y0) / PX)
        d.line([p, q], fill=1, width=max(1, round(2 * r)))
        for c in (p, q):
            d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=1)
    return np.array(img, bool)


def card_frame(px, py, z, box):
    """Plate pixels at height z to the card's frame (x across, y up, z from the back)."""
    x0, y0, *_ = box
    P = np.c_[x0 + px * PX, y0 + py * PX, np.full(len(px), z)] - PLACED['offset']
    a = math.radians(PLACED['angle'])
    c, s = math.cos(a), math.sin(a)
    R = np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])
    return P @ R            # back from the tilt: R's inverse is its transpose


def main():
    ls = layers()
    every = [s for _, s in ls for s in s]
    xs = [p for s in every for p in (s[0], s[2])]
    ys = [p for s in every for p in (s[1], s[3])]
    x0, y0 = min(xs) - 1, min(ys) - 1
    box = (x0, y0, int((max(xs) + 1 - x0) / PX), int((max(ys) + 1 - y0) / PX))
    ALL = ('skin', 'infill', 'support')
    print(f'{PLATE.name}: {len(ls)} layers, {ls[0][0]:.2f}-{ls[-1][0]:.2f} mm')
    print('  first layer: ' + ', '.join(f'{k} {draw(ls[0][1], box, (k,)).sum() * PX * PX:.0f} mm2' for k in ALL))
    lean = air = sup_air = 0.
    flagged = []
    prev = prev2 = None
    by_feature = {}
    for z, segs in ls:
        skin, support = draw(segs, box, ('skin',)), draw(segs, box, ('support',))
        if prev is not None:
            # The layer below, and supports two layers down: a support's top is
            # one layer short of the part it holds (support_top_z_distance).
            under = prev + [s for s in (prev2 or []) if s[5] == 'support']
            near, reach = draw(under, box, ALL, grow=LEAN), draw(under, box, ALL, grow=AIR)
            lean += (skin & ~near).sum() * PX * PX
            loose = skin & ~reach
            air += loose.sum() * PX * PX
            sup_air += (support & ~reach).sum() * PX * PX
            if loose.sum() * PX * PX >= .02:
                flagged.append((z, loose))
            for ax, ay, bx, by, width, k, feature in segs:
                if k == 'skin':
                    i, j = int(((ay + by) / 2 - box[1]) / PX), int(((ax + bx) / 2 - box[0]) / PX)
                    if loose[i, j]:
                        by_feature[feature] = by_feature.get(feature, 0) + math.hypot(bx - ax, by - ay)
        prev2, prev = prev, segs
    print(f'  part skins more than {LEAN} mm past the layer below: {lean:.1f} mm2 in all (scattered pixels are normal)')
    print(f'  part skins more than {AIR} mm past (a whole line in air): {air:.2f} mm2 in all, '
          f'{len(flagged)} layers with 0.02 mm2 or more')
    print(f'  supports more than {AIR} mm past: {sup_air:.1f} mm2 in all')
    print('  lines in air, by feature: ' + (', '.join(f'{f} {mm:.1f} mm' for f, mm in
                                                   sorted(by_feature.items(), key=lambda t: -t[1])) or 'none'))
    for z, loose in flagged:
        msg = f'    z {z:.2f}: {loose.sum() * PX * PX:.2f} mm2'
        if PLACED:
            py, px = np.nonzero(loose)
            C = card_frame(px, py, z, box)
            r = np.hypot(*(C[:, :2] - PLACED['centre']).T)
            msg += (f' | card x {C[:, 0].min():.1f}-{C[:, 0].max():.1f}, y {C[:, 1].min():.1f}-{C[:, 1].max():.1f},'
                    f' {C[:, 2].min():.2f}-{C[:, 2].max():.2f} mm from the back, {r.min():.1f}-{r.max():.1f} mm'
                    ' from the pocket axis')
        print(msg)


if __name__ == '__main__':
    main()
