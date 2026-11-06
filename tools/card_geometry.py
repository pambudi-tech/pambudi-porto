"""The card's geometry, shared by tools/build-card-paper.py and
tools/build-card-files.py.

Two sources are the truth for production, as supplied (tools/card-sources/):
  - card-cut.svg       the die-cut outline, in 0.1 mm (850 units = 85 mm);
  - emboss-pattern.svg the blind-emboss artwork, the site's frame
                       (public/assets/pambudi-frame.svg) at its own proportions.
The cut is the emboss grown evenly all round, so the emboss sits centred in it.

The page shows the rendered paper (its photographs and relief maps), whose
ornament is placed by src/paper/frame-registration.mjs 1.9% taller than the
artwork's proportions. On the card page the paper is squeezed to the
artwork's proportions instead: the same 1122 px wide image, CANVAS[1] tall.
`to_canvas` maps the supplied files' units into that image.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'tools' / 'card-sources'
MM_PER_UNIT = 0.1

# src/paper/frame-registration.mjs and the artwork it places.
PAPER = (1122, 1402)
FRAME = dict(x=65.756045, y=66.438887, width=987.561884, height=1276.138615)
ART = (1028, 1304)
SX, SY = FRAME['width'] / ART[0], FRAME['height'] / ART[1]
# Squeezed so the artwork keeps its proportions: x and y scale alike.
CANVAS = (PAPER[0], round(PAPER[1] * SX / SY))
SQUASH = CANVAS[1] / PAPER[1]
# src/paper/paper-gl.mjs: the relief image's box, as fractions of the paper
# (unchanged by squeezing the whole image).
RELIEF_MARGIN = (47, 50)


def relief_rect(offset=(0, 0)):
    unit = FRAME['width'] / 1028
    mx, my = RELIEF_MARGIN[0] * unit, RELIEF_MARGIN[1] * unit
    return ((FRAME['x'] - mx + offset[0]) / PAPER[0], (FRAME['y'] - my + offset[1]) / PAPER[1],
            (FRAME['width'] + 2 * mx) / PAPER[0], (FRAME['height'] + 2 * my) / PAPER[1])


# —— SVG paths (absolute M, L, H, V, C, Z) ——

def parse_path(d):
    """Subpaths as {'start': p, 'curves': [(c1, c2, p) or (None, None, p)]}.
    Reads M L H V C S Z, absolute and relative (lowercase)."""
    tokens = re.findall(r'[MLHVCSZmlhvcsz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?', d)
    subpaths, current, last_c2 = [], (0.0, 0.0), None
    i, command = 0, None

    def num():
        nonlocal i
        i += 1
        return float(tokens[i - 1])

    while i < len(tokens):
        if tokens[i] in 'MLHVCSZmlhvcsz':
            command = tokens[i]
            i += 1
            if command in 'Zz':
                if subpaths:
                    current = subpaths[-1]['start']
                last_c2 = None
                continue
        rel = command.islower()
        base = current if rel else (0.0, 0.0)
        c = command.upper()
        if c == 'M':
            p = (base[0] + num(), base[1] + num())
            subpaths.append({'start': p, 'curves': []})
            current, last_c2 = p, None
            command = 'l' if rel else 'L'   # further pairs are lines
        elif c == 'L':
            p = (base[0] + num(), base[1] + num())
            subpaths[-1]['curves'].append((None, None, p))
            current, last_c2 = p, None
        elif c == 'H':
            p = ((current[0] if rel else 0) + num(), current[1])
            subpaths[-1]['curves'].append((None, None, p))
            current, last_c2 = p, None
        elif c == 'V':
            p = (current[0], (current[1] if rel else 0) + num())
            subpaths[-1]['curves'].append((None, None, p))
            current, last_c2 = p, None
        elif c == 'C':
            c1 = (base[0] + num(), base[1] + num())
            c2 = (base[0] + num(), base[1] + num())
            p = (base[0] + num(), base[1] + num())
            subpaths[-1]['curves'].append((c1, c2, p))
            current, last_c2 = p, c2
        elif c == 'S':
            # The first control point mirrors the last curve's second, about the current point.
            c1 = (2 * current[0] - last_c2[0], 2 * current[1] - last_c2[1]) if last_c2 else current
            c2 = (base[0] + num(), base[1] + num())
            p = (base[0] + num(), base[1] + num())
            subpaths[-1]['curves'].append((c1, c2, p))
            current, last_c2 = p, c2
    return subpaths


def load(name):
    source = (SOURCES / name).read_text()
    return [sp for d in re.findall(r' d="([^"]+)"', source) for sp in parse_path(d)]


def flatten(subpath, steps=16):
    points, p = [subpath['start']], subpath['start']
    for c1, c2, q in subpath['curves']:
        if c1 is None:
            points.append(q)
        else:
            for k in range(1, steps + 1):
                t = k / steps
                u = 1 - t
                points.append((u ** 3 * p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * q[0],
                               u ** 3 * p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * q[1]))
        p = q
    return points


def bounds(subpaths):
    points = [p for sp in subpaths for p in flatten(sp)]
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def transform(subpaths, f):
    return [{'start': f(sp['start']),
             'curves': [(None if c1 is None else f(c1), None if c2 is None else f(c2), f(p))
                        for c1, c2, p in sp['curves']],
             **({'open': True} if sp.get('open') else {})} for sp in subpaths]


# —— The supplied files, together ——

CUT = load('card-cut.svg')
EMBOSS_ART = load('emboss-pattern.svg')
CUT_BOX = bounds(CUT)
_EMBOSS_BOX = bounds(EMBOSS_ART)
# The emboss centred in the cut: the cut is it grown evenly (about 18.7 units).
EMBOSS_OFFSET = (CUT_BOX[0] + (CUT_BOX[2] - CUT_BOX[0] - (_EMBOSS_BOX[2] - _EMBOSS_BOX[0])) / 2 - _EMBOSS_BOX[0],
                 CUT_BOX[1] + (CUT_BOX[3] - CUT_BOX[1] - (_EMBOSS_BOX[3] - _EMBOSS_BOX[1])) / 2 - _EMBOSS_BOX[1])
EMBOSS = transform(EMBOSS_ART, lambda p: (p[0] + EMBOSS_OFFSET[0], p[1] + EMBOSS_OFFSET[1]))
# The supplied emboss is the artwork scaled by this much (units per artwork unit).
_K = ((_EMBOSS_BOX[2] - _EMBOSS_BOX[0]) / ART[0], (_EMBOSS_BOX[3] - _EMBOSS_BOX[1]) / ART[1])
CARD_MM = ((CUT_BOX[2] - CUT_BOX[0]) * MM_PER_UNIT, (CUT_BOX[3] - CUT_BOX[1]) * MM_PER_UNIT)


def to_canvas(p, squash=SQUASH):
    """Supplied units → the card page's squeezed paper image, in px; with
    squash=1, the homepage's paper image (1122 × 1402, the render's own
    proportions, as frame-registration.mjs places the ornament)."""
    ax = (p[0] - EMBOSS_OFFSET[0] - _EMBOSS_BOX[0]) / _K[0]
    ay = (p[1] - EMBOSS_OFFSET[1] - _EMBOSS_BOX[1]) / _K[1]
    return FRAME['x'] + ax * SX, (FRAME['y'] + ay * SY) * squash


def from_canvas(p):
    """The squeezed paper image, in px → supplied units."""
    ax = (p[0] - FRAME['x']) / SX
    ay = (p[1] / SQUASH - FRAME['y']) / SY
    return ax * _K[0] + _EMBOSS_BOX[0] + EMBOSS_OFFSET[0], ay * _K[1] + _EMBOSS_BOX[1] + EMBOSS_OFFSET[1]


def to_mm(p):
    """Supplied units → millimetres from the cut's top-left."""
    return (p[0] - CUT_BOX[0]) * MM_PER_UNIT, (p[1] - CUT_BOX[1]) * MM_PER_UNIT


def cut_on_canvas():
    """The cut's box on the squeezed image, in px."""
    xs, ys = zip(*(to_canvas(p) for sp in CUT for p in flatten(sp)))
    return min(xs), min(ys), max(xs), max(ys)
