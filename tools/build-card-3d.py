"""The card from card.pambudi.xyz as a 3D print, with a wax seal over the
NFC tag. Sized for a Bambu Lab A1 (0.4 mm nozzle). Three versions:

  removable  1.4 mm: the seal locks on with a push and a turn (a bayonet)
             and comes off again; the tag in its peg.
  press      1.24 mm: sealed for good with a press. A split clip ring on the
             seal's stem squeezes through the pocket's rim and opens under
             it; a key on the stem lets it in only with the P upright.
  twist      1.0 mm: sealed for good with a push and a turn. Two flat
             springs in the card's back layer catch the stem at the end of
             the turn, and it can't turn back.
The two sealed versions can't be opened without breaking them, so the tag
can't be changed. pambudi.xyz/3dprint offers only twist (PUBLISHED); the
others build into ../output/ alone.

Run with:
    /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python tools/build-card-3d.py [-- --variant=press|twist --no-render]

Writes ../output/card-3d-print/ (removable) or card-3d-print-<variant>/
(beside the site checkout):
    <file>.3mf, <file>-keyring.3mf   a card (or key ring card) and its seal, as the page draws them
    a1-cards*.3mf              an A1 plate of 8 cards        } one colour each, printed in turn;
    a1-seals*.3mf              an A1 plate of seals (+clips)  } tools/slice-a1.py slices them
    a1-keyrings*.3mf           an A1 plate of 3 key ring cards} for the A1 (.gcode.3mf)
    fit-test*.3mf              coins of the card's pocket + plugs: print first
    *.stl, *.blend, render-*.png, checks.json, print-notes*.txt
and, for pambudi.xyz/3dprint (print.html, src/print/):
    public/downloads/3dprint/          the 3MF files and the print notes; the
                                       page draws <file>.3mf itself
    public/assets/print/card-3d*.json  where each part of that file sits on the
                                       card, how the seal comes off, the downloads

Same as the page, 1:1 in millimetres:
  - outline: tools/card-sources/card-cut.svg (67.75 × 85 mm);
  - relief: tools/card-sources/emboss-pattern.svg, centred in the cut as
    tools/card_geometry.py places it, soft as the paper's (src/paper's relief
    is the die blurred by 2.5 px of the paper image, 0.16 mm here), the blur
    worked out at 0.02 mm: raised on the front, pressed the same into the
    back;
  - no type or print: just the paper; above its top edge, a round tab with
    a 3 mm hole for a key ring (key_ring_tab), which makes it taller.
The seal is the site's round P seal, the favicon (tools/build-round-seal.py:
the blank round seal ../output/wax-seal-circle-v1/wax-seal-circle.png, its
outline, oval field and thin rim, rolled lip), 19 mm wide as in the
production files, with its P: Pirata One (tools/fonts/PirataOne-Regular.ttf,
SIL OFL), 80% of the field's height, nudged right to
look centred, its strokes made bolder, raised with a rounded bevel from a
crisp foot, as that script draws it, here in millimetres.

Both surfaces are meshed as finely as the A1 can still use, and no finer:
from an even grid, each triangle is split until its flat face is within
REFINE_TOL (0.01 mm) of the true surface; Bambu Studio smooths what it sends
the printer to about 0.012 mm, and the A1's layers are 0.08 mm at finest.
The triangles crowd only where the surface curves, always well shaped.

What printing needs and paper doesn't: the card is 1.4 mm thick and the
relief 0.5 mm (paper is 0.4 mm and 0.32 mm on a card twice the size). Under
the seal, at the card's middle, a pocket 0.9 mm deep with a 0.5 mm floor on
the front: a ledge with three notches, a groove beneath it. The seal's peg
has three tabs: in through the notches, a turn of 40° clockwise (seen from
the back) takes them under the ledge, past a small bump (the click) to a
stop, where the P stands upright. The NFC sticker goes in a recess in the
peg's end. Everything prints without support: the card front up, the seal
face up (as placed in the 3MF), 0.12 mm layers or finer (0.08 for the
crispest relief).
"""
import json
import math
import struct
import sys
import time
import zipfile
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector, geometry

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import card_geometry as g  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = '--no-render' not in ARGS
VARIANT = next((a.split('=', 1)[1] for a in ARGS if a.startswith('--variant=')), 'removable')
assert VARIANT in ('removable', 'press', 'twist'), VARIANT
SUFFIX = '' if VARIANT == 'removable' else f'-{VARIANT}'
# The versions pambudi.xyz/3dprint offers: only these write into public/;
# the others are built into ../output/ alone.
PUBLISHED = ('twist',)
FILE = 'pambudi-card-3d' if VARIANT == 'removable' else f'pambudi-card-{VARIANT}'

OUT = ROOT.parent / 'output' / f'card-3d-print{SUFFIX}'
WEB = ROOT / 'public' / 'assets' / 'print'
DOWNLOADS = ROOT / 'public' / 'downloads' / '3dprint'
FONT = ROOT / 'tools' / 'fonts' / 'PirataOne-Regular.ttf'
# The round P seal's blank wax (as tools/build-round-seal.py on main reads it).
ROUND_SEAL = ROOT.parent / 'output' / 'wax-seal-circle-v1' / 'wax-seal-circle.png'

# —— The card ——
# mm, flat areas. The sealed versions' thicknesses fall on the A1's layers
# (a 0.2 mm first layer, then 0.08 mm ones): every height below does.
STOCK = {'removable': 1.4, 'press': 1.24, 'twist': 1.0}[VARIANT]
RELIEF = 0.50               # mm, raised on the front, pressed into the back; past
                            # 0.5 the shoulders pass 51° and the back's channels sag
CARD_W, CARD_H = g.CARD_MM
CENTRE = np.array([CARD_W / 2, CARD_H / 2])   # the seal's place: the card's middle
OUTLINE_STEP = .1           # mm between outline points
PATTERN_STEP = .04          # mm between points on the pattern's outlines
SHOULDER = 2.5 * 67.75 / 1045.19   # the paper's blur: 2.5 px of the card page's paper image, in mm
FIELD_RES = 50              # px per mm the blur is worked out at
FLAT_STEP, FLAT_CLEAR = .4, .15       # an even grid over the flat paper (mm), kept off the pocket
# The relief's mesh is refined until no triangle's flat face misses the
# relief by more than REFINE_TOL (mm), its edges no shorter than REFINE_MIN:
# the finest the A1 still gets. Bambu Studio smooths each outline it sends
# to about 0.012 mm (its Resolution), so finer is dropped before printing
# and would only grow the file.
REFINE_TOL, REFINE_MIN = .01, .04
SEAL_SEED = .3              # mm between the seal face's first points (on circles), refined from there

# —— The pocket and the bayonet (card frame: z = 0 is the back, z = STOCK the front;
# d is the depth from the back, angles CCW seen from the front, so the turn
# that locks is clockwise seen from the back) ——
FLOOR = .5                  # front skin over the pocket
POCKET = STOCK - FLOOR      # pocket depth from the back
LEDGE = .4                  # the ledge the tabs turn under, at the pocket's mouth
TAB_GAP = .08               # between the tabs and the ledge above them
TAB_TOP = LEDGE + TAB_GAP
STEM = POCKET - .04         # the seal's peg, short of the pocket's floor
CLEAR = .15                 # radial clearance, peg to ledge and tabs to groove
R_PEG = 7.1
R_BORE = R_PEG + CLEAR      # the ledge's inner edge
R_TAB = 7.7
R_GROOVE = R_TAB + CLEAR    # the groove under the ledge, and the notches
R_RECESS = 6.2              # the NFC tag's recess in the peg's end: a 12 mm tag
TAG_DEPTH = .3
TABS, TAB_AT = 3, 90.       # three tabs; one at the top when locked (degrees)
TAB_HALF, NOTCH_HALF = 12., 14.
LOCK_DEG = 40.              # the turn from the notches to the stop
STOP = (13., 21.)           # a stop just past each locked tab's leading edge
BUMP_AT, BUMP_HALF, DETENT = -15., 2.5, .12   # the click, just behind its trailing edge
RIM_RELIEF, R_CONTACT = .15, R_GROOVE + .4    # the seal's underside eases off towards its rim
THETA_STEPS = 1440
Z_STEP = .02
R_MOUTH = R_GROOVE          # the pocket's widest at the card's back

# —— Twist (1.0 mm): the bayonet, thinner, with two wide tabs, and a ratchet
# that makes it one-way. The ledge is the card's first two layers; in them,
# beside the bore, two flat springs: arms lying in the layer, held at one
# end, each with a tooth at its free end reaching in to the seal's stem. In,
# the teeth run down a keyway in the stem; on the turn they ride up a ramp
# onto the stem (the arms bend out into the slot behind them) and at the end
# drop into a recess with square sides: it can't turn back. Turned back, a
# tooth pulls its arm along its length, the way it's strongest.
if VARIANT == 'twist':
    FLOOR = .4
    POCKET = STOCK - FLOOR          # 0.6: the cavity's top
    LEDGE = .28                     # two layers
    TAB_GAP = .04
    TAB_TOP = LEDGE + TAB_GAP       # the tabs from 0.32 to the peg's end at 0.52
    STEM = .52
    R_TAB = R_PEG + .45
    R_GROOVE = R_TAB + CLEAR        # the notches
    R_CAVITY = R_GROOVE + .15       # under the ledge
    # The seal's outline comes within 8.2 mm of the pocket's axis at the top
    # (40-150°) and reaches past 9.1 mm elsewhere: the springs' slots (out to
    # 8.55 mm) go where it's wide, the tabs and notches where they fit round them.
    TABS, TAB_AT = 2, 106.
    TAB_HALF, NOTCH_HALF = 24., 26.
    STOP = (25., 33.)
    R_STOP = R_BORE + .1            # the stop's face, short of the ledge's edge
    DETENT = 0.
    TAG_DEPTH = .36
    R_CONTACT = R_GROOVE + .4
    # The springs (card frame, degrees CCW seen from the front; the turn that
    # locks is clockwise seen from the back, so the stem runs past each tooth
    # towards lower angles). Each tooth spans [p, p + TOOTH]; its arm runs from
    # there round to its root at p + ARM; a slot PAWL_GAP past its end and
    # behind it lets it bend out.
    PAWLS_AT, TOOTH, ARM, PAWL_GAP = (156., 327.), 10., 60., 4.
    R_TIP = R_PEG - .25             # the teeth's reach, at rest
    R_ARM_OUT, R_SLOT_OUT = R_BORE + .8, R_BORE + 1.3
    R_PAWL_ROOM = R_SLOT_OUT + .2   # the cavity over the springs, so they're free
    R_KEYWAY = R_PEG - .45          # the stem's keyway and recesses
    SIDE, RAMP = 2., 10.            # their clearance each side of a tooth, and the ramp (degrees)
    R_MOUTH = R_SLOT_OUT

# —— Press (1.24 mm): the pocket is a rim (the card's first layer) over a
# wider cavity, under a 0.32 mm front floor. The seal's stem: a neck through
# the rim (stepped in under it), a groove, and a flange at its end. A split
# clip ring sits in the groove; pressed in, the rim squeezes it into the
# groove (its stepped edge leads it in) and past the rim it springs open:
# the stem's flange holds it, it holds the rim. A key on the neck fits a
# notch in the rim, so it goes in only with the P upright.
if VARIANT == 'press':
    LIP = .2
    POCKET = .92                    # the cavity's top
    FLOOR = STOCK - POCKET
    R_LIP = 7.7
    R_CAVITY = 8.25
    KEY_AT, KEY_HALF, KEY_NOTCH_HALF = 270., 8., 10.     # at the bottom, where the seal reaches furthest
    R_KEY, R_KEY_NOTCH, KEY_DEPTH = 7.95, 8.1, .16
    NECK = ((.08, 7.55), (.16, 7.4), (.24, 7.25))   # (to depth, radius): the neck, stepped in
    R_GR, R_FL = 6.75, 7.55         # the groove's floor, the flange
    GROOVE_END, STEM = .64, .84
    CLIP_AT = .24                   # the clip's face against the rim
    CLIP_LAYERS = ((.2, 8.0), (.08, 7.88), (.08, 7.76))   # (height, outer radius) from that face in
    CLIP_IN, CLIP_GAP, CLIP_GAP_AT = 7.15, 24., 90.
    TAG_DEPTH = .36
    R_CONTACT = R_LIP + .4
    R_MOUTH = R_KEY_NOTCH

# —— The seal (seal frame: u right, v up, as you look at it; heights in mm) ——
SEAL_WIDTH = 19.0
SEAL_RES = 40
LETTER_STEP = .03          # mm between points on the P's outline
LETTER_RES = 100            # px per mm for the distance to the P's outline
# Measured on the favicon (px from its top left): the sunken field's centre
# and the radii of its thin ring, and of the lip's inner wall.
# From tools/build-round-seal.py, in the image's px: the field's thin rim,
# an ellipse (centre from the top left, semi-axes), and the P: its height a
# share of the field's, nudged right, each stroke grown, its bevel's width.
# The nudge is 15 px here, not the script's 24: on the 3D seal 24 sat the P
# a touch right of the optical middle (the user's eye, 2026-11-09).
SEAL_FIELD = (632., 589., 429., 400.)
P_SHARE, P_NUDGE, P_BOLD, P_BEVEL = .80, 15., 7., 26.
H_FIELD, H_EDGE, H_LIP, H_RING, H_LETTER = 1.25, .6, 1.4, .3, .6


t0 = time.time()
log = lambda *a: print(f'[{time.time() - t0:6.1f}s]', *a, flush=True)


# —— Raster helpers ——

def segments(loops):
    x0, y0, x1, y1 = [], [], [], []
    for pts in loops:
        p = np.asarray(pts, float)
        q = np.roll(p, -1, axis=0)
        x0.append(p[:, 0]); y0.append(p[:, 1]); x1.append(q[:, 0]); y1.append(q[:, 1])
    return tuple(map(np.concatenate, (x0, y0, x1, y1)))


def fill(segs, origin, size, res):
    """Even-odd fill: pixel (i, j) has its centre at origin + ((j + .5) / res, (i + .5) / res)."""
    x0, y0, x1, y1 = segs
    keep = y0 != y1
    x0, y0, x1, y1 = x0[keep], y0[keep], x1[keep], y1[keep]
    lo, hi = np.minimum(y0, y1), np.maximum(y0, y1)
    order = np.argsort(lo)
    lo, hi, x0, y0, x1, y1 = (a[order] for a in (lo, hi, x0, y0, x1, y1))
    w, h = size
    xs = origin[0] + (np.arange(w) + .5) / res
    out = np.zeros((h, w), bool)
    for i in range(h):
        y = origin[1] + (i + .5) / res
        n = np.searchsorted(lo, y, side='right')
        m = hi[:n] > y
        if not m.any():
            continue
        a0, b0, a1, b1 = x0[:n][m], y0[:n][m], x1[:n][m], y1[:n][m]
        cross = np.sort(a0 + (y - b0) / (b1 - b0) * (a1 - a0))
        out[i] = np.searchsorted(cross, xs) % 2 == 1
    return out


class Field:
    def __init__(self, values, origin, res):
        self.v, self.o, self.r = values, origin, res

    def __call__(self, x, y):
        h, w = self.v.shape
        fx = (np.asarray(x) - self.o[0]) * self.r - .5
        fy = (np.asarray(y) - self.o[1]) * self.r - .5
        j = np.clip(np.floor(fx).astype(int), 0, w - 2)
        i = np.clip(np.floor(fy).astype(int), 0, h - 2)
        tx, ty = np.clip(fx - j, 0, 1), np.clip(fy - i, 0, 1)
        v = self.v
        return ((v[i, j] * (1 - tx) + v[i, j + 1] * tx) * (1 - ty)
                + (v[i + 1, j] * (1 - tx) + v[i + 1, j + 1] * tx) * ty)

    def pixel(self, x, y):
        h, w = self.v.shape
        j = np.clip(((np.asarray(x) - self.o[0]) * self.r).astype(int), 0, w - 1)
        i = np.clip(((np.asarray(y) - self.o[1]) * self.r).astype(int), 0, h - 1)
        return self.v[i, j]


def resample(loop, step):
    p = np.vstack([loop, loop[:1]])
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    n = max(8, round(s[-1] / step))
    t = np.arange(n) * s[-1] / n
    return np.column_stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])])


def ccw(loop):
    x, y = loop[:, 0], loop[:, 1]
    area = .5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)
    return loop if area > 0 else loop[::-1]


def circle(radius, centre=(0, 0), n=THETA_STEPS):
    t = 2 * np.pi * np.arange(n) / n
    return np.column_stack([centre[0] + radius * np.cos(t), centre[1] + radius * np.sin(t)])


# —— Meshes ——

def inside(points, loop, chunk=2000):
    """Which `points` lie inside the closed `loop` (even-odd)."""
    x0, y0 = loop[:, 0], loop[:, 1]
    x1, y1 = np.roll(x0, -1), np.roll(y0, -1)
    dy = np.where(y1 != y0, y1 - y0, 1)
    out = np.zeros(len(points), bool)
    for s in range(0, len(points), chunk):
        px, py = points[s:s + chunk, :1], points[s:s + chunk, 1:]
        cross = ((y0 > py) != (y1 > py)) & (px < x0 + (py - y0) * (x1 - x0) / dy)
        out[s:s + chunk] = cross.sum(1) % 2 == 1
    return out


def drop_holes(verts, tris, holes):
    """Without the triangles inside each hole (any shape)."""
    c = verts[tris].mean(axis=1)
    keep = np.ones(len(tris), bool)
    for lp in holes:
        lo, hi = lp.min(0), lp.max(0)
        near = np.flatnonzero((c[:, 0] > lo[0]) & (c[:, 0] < hi[0]) & (c[:, 1] > lo[1]) & (c[:, 1] < hi[1]))
        keep[near[inside(c[near], lp)]] = False
    return tris[keep]


def cdt(outer, holes=(), constraints=(), points=None):
    """Constrained Delaunay inside `outer`, without `holes`, with every edge
    of the `constraints` loops kept as an edge. Returns 2D vertices, CCW
    triangles, the outer and holes' output vertex indices, and the output
    edges that lie on a constraint (as vertex pairs)."""
    points = np.empty((0, 2)) if points is None else np.asarray(points, float).reshape(-1, 2)
    loops = [outer, *holes, *constraints]
    allpts = np.vstack(loops + [points])
    coords = [Vector((float(x), float(y))) for x, y in allpts]
    edges, starts, s = [], [], 0
    for lp in loops:
        n = len(lp)
        starts.append(s)
        edges += [(s + i, s + (i + 1) % n) for i in range(n)]
        s += n
    first_constraint = sum(len(lp) for lp in [outer, *holes])
    vo, eo, fo, ov, oe, _ = geometry.delaunay_2d_cdt(coords, edges, [list(range(len(outer)))], 1, 1e-7, True)
    verts = np.array([(v.x, v.y) for v in vo])
    inv = np.full(len(allpts), -1)
    for i, origs in enumerate(ov):
        for o in origs:
            inv[o] = i
    assert all(len(f) == 3 for f in fo), 'CDT returned non-triangles'
    tris = drop_holes(verts, np.array(fo, np.int64), holes)
    a, b, cc = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    area = (b[:, 0] - a[:, 0]) * (cc[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (cc[:, 0] - a[:, 0])
    tris[area < 0] = tris[area < 0][:, ::-1]
    idx = []
    for st, lp in zip(starts, [outer, *holes]):
        ix = inv[st:st + len(lp)]
        assert (ix >= 0).all() and len(set(ix.tolist())) == len(ix), 'a loop vertex was merged'
        idx.append(ix)
    cuts = np.array([e for e, origs in zip(eo, oe)
                     if any(first_constraint <= o < len(edges) for o in origs)], np.int64).reshape(-1, 2)
    return verts, tris, idx, cuts


def triangulate(loops, points):
    """`cdt` with loops[1:] as holes and no other constraints."""
    verts, tris, idx, _ = cdt(loops[0], loops[1:], (), points)
    return verts, tris, idx


class Mesh:
    def __init__(self, name):
        self.name, self.v, self.f, self.n = name, [], [], 0

    def verts(self, arr):
        arr = np.asarray(arr, float)
        idx = self.n + np.arange(len(arr))
        self.v.append(arr)
        self.n += len(arr)
        return idx

    def faces(self, tris):
        self.f.append(np.asarray(tris, np.int64).reshape(-1, 3))

    def surface(self, verts2d, tris, z, up):
        idx = self.verts(np.column_stack([verts2d, z]))
        t = idx[tris]
        self.faces(t if up else t[:, ::-1])
        return idx

    def wall(self, low, high, outward=True):
        """Quads between two loops of equal length (CCW seen from +z); low below high."""
        a, b = low, np.roll(low, -1)
        c, d = np.roll(high, -1), high
        quads = np.column_stack([a, b, c, a, c, d]).reshape(-1, 3)
        self.faces(quads if outward else quads[:, ::-1])

    def tube(self, rings, outward):
        for j in range(len(rings) - 1):
            self.wall(rings[j], rings[j + 1], outward)

    def fan(self, ring, centre, up):
        c = self.verts([centre])[0]
        a, b = ring, np.roll(ring, -1)
        t = np.column_stack([np.full(len(a), c), a, b])
        self.faces(t if up else t[:, ::-1])

    def arrays(self):
        """Vertices no face uses (a level's copies off that level) dropped."""
        V, F = np.concatenate(self.v), np.concatenate(self.f)
        used = np.unique(F)
        remap = np.full(len(V), -1)
        remap[used] = np.arange(len(used))
        return V[used], remap[F]


def check(V, F):
    """Closed, consistently wound, no degenerate faces, positive volume."""
    n = len(V)
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    fwd = e[:, 0] * n + e[:, 1]
    rev = e[:, 1] * n + e[:, 0]
    tri = V[F]
    cr = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = .5 * np.linalg.norm(cr, axis=1)
    vol = np.einsum('ij,ij->i', tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum() / 6
    return dict(
        vertices=int(n), triangles=int(len(F)),
        watertight=bool(len(np.unique(fwd)) == len(fwd) and np.array_equal(np.sort(fwd), np.sort(rev))),
        unused_vertices=int(n - len(np.unique(F))),
        smallest_triangle_mm2=float(area.min()),
        volume_mm3=round(float(vol), 2),
        size_mm=[round(float(s), 3) for s in V.max(0) - V.min(0)],
    )


# —— The bayonet ——
# Both the pocket and the peg are a radius at each angle and depth, so each
# is one tube; the fit is checked on the same functions.

THETA = 2 * np.pi * np.arange(THETA_STEPS) / THETA_STEPS


def depths(top):
    return np.linspace(0, top, max(2, round(top / Z_STEP)) + 1)


def from_tabs(theta):
    """Degrees from each tab's locked centre, wrapped; shape (TABS, n)."""
    centres = np.radians(TAB_AT + 360 / TABS * np.arange(TABS))[:, None]
    return np.degrees(np.angle(np.exp(1j * (np.atleast_1d(theta)[None, :] - centres))))


def r_pocket_removable(theta, d):
    a = from_tabs(theta)
    notch = (np.abs(a + LOCK_DEG) < NOTCH_HALF).any(0)
    stop = ((a >= STOP[0]) & (a <= STOP[1])).any(0)
    bump = (DETENT * np.clip(1 - np.abs(a - BUMP_AT) / BUMP_HALF, 0, 1)).max(0)
    r = np.where((d < LEDGE + bump - 1e-9) & ~notch, R_BORE, R_GROOVE)
    return np.where(stop, R_BORE, r)


def r_seal_removable(theta, d):
    """The seal locked: d is the depth from the card's back."""
    tab = (np.abs(from_tabs(theta)) < TAB_HALF).any(0) & (d >= TAB_TOP - 1e-9)
    return np.where(tab, R_TAB, R_PEG)


def degrees_from(theta, at):
    """Degrees from `at` (degrees), wrapped to ±180."""
    return (np.degrees(np.asarray(theta)) - at + 180) % 360 - 180


# —— Twist ——

def r_cavity_twist(theta):
    """Under the ledge: the tabs' groove, the stops, the room over the springs."""
    a = from_tabs(theta)
    stop = ((a >= STOP[0]) & (a <= STOP[1])).any(0)
    r = np.where(stop, R_STOP, R_CAVITY)
    for p in PAWLS_AT:
        span = (np.degrees(np.asarray(theta)) - (p - PAWL_GAP - 2)) % 360 <= ARM + PAWL_GAP + 4
        r = np.where(span, R_PAWL_ROOM, r)
    return r


def r_pocket_twist(theta, d, **_):
    """As a radius (for the fit): the ledge's bore and notches (the springs
    are checked on their own), the cavity under it."""
    notch = (np.abs(from_tabs(theta) + LOCK_DEG) < NOTCH_HALF).any(0)
    if d < LEDGE - 1e-9:
        return np.where(notch, R_GROOVE, R_BORE)
    return r_cavity_twist(theta)


def r_seal_twist(theta, d):
    """The stem locked: the tabs at its end; down its length a keyway where
    the teeth went in; at the ledge, the ramps up out of it and the recesses
    the teeth drop into."""
    tab = (np.abs(from_tabs(theta)) < TAB_HALF).any(0) & (d >= TAB_TOP - 1e-9)
    r = np.where(tab, R_TAB, R_PEG).astype(float)
    for p in PAWLS_AT:
        r = np.where(np.abs(degrees_from(theta, p + LOCK_DEG + TOOTH / 2)) < TOOTH / 2 + SIDE, R_KEYWAY, r)
        if d < TAB_TOP - 1e-9:
            r = np.where(np.abs(degrees_from(theta, p + TOOTH / 2)) < TOOTH / 2 + SIDE, R_KEYWAY, r)
            x = degrees_from(theta, p + LOCK_DEG - SIDE)      # 0 at the keyway's edge, below it < 0
            ramp = (x > -RAMP) & (x <= 0)
            r = np.where(ramp, R_PEG + (R_KEYWAY - R_PEG) * (x + RAMP) / RAMP, r)
    return r


def twist_lip_loop(centre, r_tip=None):
    """The pocket's mouth through the ledge (card frame, CCW): the bore and its
    notches, and at each spring, out round its slot, back along the arm's
    back to its tooth, round the tooth, and on along the arm's inner edge."""
    r_tip = R_TIP if r_tip is None else r_tip
    step = 360 / THETA_STEPS
    at = lambda deg, r: (centre[0] + r * math.cos(math.radians(deg)), centre[1] + r * math.sin(math.radians(deg)))
    degs = np.arange(0, 360, step)
    notch = (np.abs(from_tabs(np.radians(degs)) + LOCK_DEG) < NOTCH_HALF).any(0)
    skip = np.zeros(len(degs), bool)
    for p in PAWLS_AT:
        skip |= (degs - (p - PAWL_GAP)) % 360 <= PAWL_GAP + TOOTH
    assert not skip[0]
    out, i = [], 0
    while i < len(degs):
        if not skip[i]:
            out.append(at(degs[i], R_GROOVE if notch[i] else R_BORE))
            i += 1
            continue
        p = next(p for p in PAWLS_AT if (degs[i] - (p - PAWL_GAP)) % 360 <= PAWL_GAP + TOOTH)
        g0, q = p - PAWL_GAP, p + ARM
        out.append(at(g0, R_BORE))
        out += [at(t, R_SLOT_OUT) for t in np.arange(g0, q, step)] + [at(q, R_SLOT_OUT)]
        out += [at(t, R_ARM_OUT) for t in np.arange(q, p, -step)] + [at(p, R_ARM_OUT)]
        out += [at(t, r_tip) for t in np.arange(p, p + TOOTH, step)] + [at(p + TOOTH, r_tip)]
        out.append(at(p + TOOTH, R_BORE))
        while i < len(degs) and skip[i]:
            i += 1
    loop = np.array(out)
    x, y = loop[:, 0], loop[:, 1]
    assert .5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y) > 0, 'the mouth runs clockwise'
    return loop


def twist_check(r_tip=None):
    """In at the notches, the tabs and the teeth clear; turned, the tabs go
    under the ledge, clear of the stops, and the teeth ride up onto the stem
    (their arms bend out, less than their slot allows) and drop into the
    recesses; locked, nothing touches."""
    r_tip = R_TIP if r_tip is None else r_tip
    th = np.radians(np.arange(0, 360, .1))
    ds = depths(STEM)
    locked = min((r_pocket_twist(th, d) - r_seal_twist(th, d)).min() for d in ds)
    assert locked >= CLEAR - 1e-6, f'locked seal touches the pocket ({locked:.3f} mm)'
    # In: the tabs through the notches at every depth, the teeth down the keyway.
    going_in = min((r_pocket_twist(th, d) - r_seal_twist(th + np.radians(LOCK_DEG), s)).min()
                   for s in ds for d in [s - push for push in np.linspace(0, STEM, 27)] if d >= 0)
    assert going_in >= CLEAR - 1e-6, f'the tabs catch going in ({going_in:.3f} mm)'
    teeth = np.concatenate([np.radians(np.arange(p, p + TOOTH + .01, .1)) for p in PAWLS_AT])
    keyway = min(r_tip - r_seal_twist(teeth + np.radians(LOCK_DEG), d).max() for d in ds)
    assert keyway >= .1 - 1e-6, f'the teeth catch going in ({keyway:.3f} mm)'
    # The turn: the tabs clear the stops; the teeth's arms bend out by as much as
    # the stem lifts them, never as far as their slot.
    bend = []
    for a in np.arange(-LOCK_DEG, .01, .25):
        for d in ds:
            if d >= TAB_TOP:
                hit = r_seal_twist(th - np.radians(a), d) > r_cavity_twist(th) - .1
                assert not hit.any(), f'a tab catches on the turn at {a:.2f}°'
        bend.append(max(0., (r_seal_twist(teeth - np.radians(a), 0) - r_tip).max()))
    room = R_SLOT_OUT - R_ARM_OUT
    assert max(bend) <= room - .15 + 1e-6, f'the springs bend {max(bend):.2f} mm, their slot is {room:.2f}'
    assert bend[0] == 0 and bend[-1] == 0, 'a tooth is held at the start or the end of the turn'
    # Turned back from locked: the recess's side is square, the tooth is caught.
    back = r_seal_twist(teeth + np.radians(SIDE + .5), 0) - r_tip
    assert back.max() >= R_PEG - r_tip - 1e-6, 'the tooth can turn back'
    return dict(locked_clearance=round(locked, 3), spring_bend_max=round(max(bend), 3), slot=round(room, 3),
                tooth_catch=round(R_PEG - r_tip, 3), tabs=TABS, turn_deg=LOCK_DEG)


# —— Press ——

def r_pocket_press(theta, d, r_lip=None):
    r_lip = R_LIP if r_lip is None else r_lip
    if d < LIP - 1e-9:
        key = np.abs(degrees_from(theta, KEY_AT)) < KEY_NOTCH_HALF
        return np.where(key, R_KEY_NOTCH, r_lip)
    return np.full(np.shape(theta), R_CAVITY)


def r_seal_press(theta, d):
    """The stem in place: its neck in the rim (stepped in towards the clip),
    the key, the groove the clip sits in, the flange at its end."""
    if d >= GROOVE_END - 1e-9:
        return np.full(np.shape(theta), R_FL)
    if d >= NECK[-1][0] - 1e-9:
        return np.full(np.shape(theta), R_GR)
    r = next(radius for to, radius in NECK if d < to - 1e-9)
    key = (np.abs(degrees_from(theta, KEY_AT)) < KEY_HALF) & (d < KEY_DEPTH - 1e-9)
    return np.where(key, R_KEY, r)


def clip_height():
    return sum(h for h, _ in CLIP_LAYERS)


def press_check(r_lip=None):
    """The stem and its key pass the rim; the clip, squeezed to the rim, still
    clears the groove's floor, and opens in the cavity clear of its wall; the
    flange holds it on; it fits its groove; the flange clears the floor."""
    r_lip = R_LIP if r_lip is None else r_lip
    th = np.radians(np.arange(0, 360, .1))
    passing = min((r_pocket_press(th, 0, r_lip) - r_seal_press(th, d)).min() for d in depths(STEM))
    assert passing >= CLEAR - 1e-6, f'the stem catches on the rim ({passing:.3f} mm)'
    key_side = (KEY_NOTCH_HALF - KEY_HALF) * math.radians(1) * R_KEY
    assert key_side >= .2, f'the key fits its notch by {key_side:.2f} mm'
    catch = CLIP_LAYERS[0][1] - r_lip
    squeezed = CLIP_IN - catch - R_GR
    assert catch >= .15 and squeezed >= .1 - 1e-6, (catch, squeezed)
    assert R_CAVITY - CLIP_LAYERS[0][1] >= .2
    assert R_FL - CLIP_IN >= .3 and NECK[-1][1] - CLIP_IN >= .1 - 1e-6
    assert GROOVE_END - CLIP_AT - clip_height() >= .04 - 1e-6
    assert POCKET - STEM >= .08 - 1e-6
    return dict(stem_clearance=round(passing, 3), clip_catch=round(catch, 3),
                clip_squeezed_to_groove=round(squeezed, 3), clip_play_axial=round(GROOVE_END - CLIP_AT - clip_height(), 3),
                key_side_clearance=round(key_side, 3))


def fit_check():
    """Locked, nothing touches; in at the notches, nothing touches; on the
    turn, only the bump does (the click), by DETENT - TAB_GAP."""
    th = np.radians(np.arange(0, 360, .1))
    ds = depths(STEM)
    locked = min((r_pocket(th, d) - r_seal(th, d)).min() for d in ds)
    assert locked >= CLEAR - 1e-9, f'locked seal touches the pocket ({locked:.3f} mm)'
    rot = lambda a: np.radians(a)
    # Pushed in at the notches, at every depth on the way.
    for push in np.linspace(0, STEM, 44):
        for s_ in ds:
            d = s_ - push
            if d < 0:
                continue
            gap = (r_pocket(th, d) - r_seal(th + rot(LOCK_DEG), s_)).min()   # turned back by LOCK_DEG
            assert gap >= CLEAR - 1e-9, f'the tabs catch going in ({gap:.3f} mm at depth {d:.2f})'
    # Turning, at full depth: only the bump may be in the way.
    caught = set()
    for a in np.arange(-LOCK_DEG, .01, .25):
        for d in ds:
            hit = r_seal(th - rot(a), d) > r_pocket(th, d) + 1e-9
            if hit.any():
                caught.add(round(d, 3))
    assert all(TAB_TOP - 1e-9 <= d < LEDGE + DETENT for d in caught), f'the tabs catch on the turn at {sorted(caught)}'
    return dict(locked_clearance=round(locked, 3), click_interference=round(LEDGE + DETENT - TAB_TOP, 3),
                caught_depths_on_turn=sorted(caught))


r_pocket = {'removable': r_pocket_removable, 'press': r_pocket_press, 'twist': r_pocket_twist}[VARIANT]
r_seal = {'removable': r_seal_removable, 'press': r_seal_press, 'twist': r_seal_twist}[VARIANT]


# —— The card body ——

def blur(a, sigma):
    """A Gaussian blur, sigma in px (by FFT, the edges held)."""
    pad = int(4 * sigma) + 2
    a = np.pad(a.astype(np.float32), pad, mode='edge')
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.rfftfreq(a.shape[1])[None, :]
    k = np.exp(-2 * (np.pi * sigma) ** 2 * (fx ** 2 + fy ** 2))
    return np.fft.irfft2(np.fft.rfft2(a) * k, s=a.shape)[pad:-pad, pad:-pad].astype(np.float32)


def distance_field(loops, origin, size, res, band, cell=20):
    """The signed distance (mm) to the loops' outline at each pixel, + inside
    (even-odd), exact within `band` of it, ±band beyond. Each block of
    `cell` px is measured against only the segments near it."""
    w, h = size
    inside = fill(segments(loops), origin, size, res)
    x0, y0, x1, y1 = segments(loops)
    sdf = np.where(inside, band, -band).astype(np.float32)
    cmm = cell / res
    ncx, ncy = -(-w // cell), -(-h // cell)
    gx0 = np.clip(np.floor((np.minimum(x0, x1) - band - origin[0]) / cmm).astype(int), 0, ncx - 1)
    gx1 = np.clip(np.floor((np.maximum(x0, x1) + band - origin[0]) / cmm).astype(int), 0, ncx - 1)
    gy0 = np.clip(np.floor((np.minimum(y0, y1) - band - origin[1]) / cmm).astype(int), 0, ncy - 1)
    gy1 = np.clip(np.floor((np.maximum(y0, y1) + band - origin[1]) / cmm).astype(int), 0, ncy - 1)
    spans = (gx1 - gx0 + 1) * (gy1 - gy0 + 1)
    seg = np.repeat(np.arange(len(x0)), spans)
    off = np.arange(spans.sum()) - np.repeat(np.cumsum(spans) - spans, spans)
    wide = np.repeat(gx1 - gx0 + 1, spans)
    cells = (np.repeat(gy0, spans) + off // wide) * ncx + np.repeat(gx0, spans) + off % wide
    o = np.argsort(cells, kind='stable')
    cells, seg = cells[o], seg[o]
    edges = np.flatnonzero(np.r_[True, cells[1:] != cells[:-1], True])
    for a, b in zip(edges[:-1], edges[1:]):
        ci, cj = divmod(int(cells[a]), ncx)
        i0, j0 = ci * cell, cj * cell
        i1, j1 = min(i0 + cell, h), min(j0 + cell, w)
        X, Y = np.meshgrid(origin[0] + (np.arange(j0, j1) + .5) / res, origin[1] + (np.arange(i0, i1) + .5) / res)
        px, py = X.reshape(-1, 1), Y.reshape(-1, 1)
        k = seg[a:b]
        ax, ay, dx, dy = x0[k], y0[k], x1[k] - x0[k], y1[k] - y0[k]
        t = np.clip(((px - ax) * dx + (py - ay) * dy) / np.maximum(dx * dx + dy * dy, 1e-12), 0, 1)
        d = np.minimum(np.hypot(px - ax - t * dx, py - ay - t * dy).min(1), band).reshape(X.shape)
        sdf[i0:i1, j0:j1] = np.where(inside[i0:i1, j0:j1], d, -d)
    return sdf




def clear_of(anchors, points, gap):
    """`points` without those within `gap` of any anchor (lines or points,
    all kept) or of a point kept before them."""
    cells = {}
    for a in anchors:
        for q in np.asarray(a, float).reshape(-1, 2):
            cells.setdefault((int(q[0] // gap), int(q[1] // gap)), []).append(q)
    keep = []
    for q in points:
        k = (int(q[0] // gap), int(q[1] // gap))
        near = any((q[0] - r[0]) ** 2 + (q[1] - r[1]) ** 2 < gap * gap
                   for di in (-1, 0, 1) for dj in (-1, 0, 1) for r in cells.get((k[0] + di, k[1] + dj), ()))
        if not near:
            cells.setdefault(k, []).append(q)
            keep.append(q)
    return np.array(keep).reshape(-1, 2)


def soft_relief(loops, box, res, sigma, height):
    """The relief of `loops` (even-odd): the drawing blurred by `sigma` mm,
    times `height`. Returns its height (mm) anywhere."""
    pad = 4 * sigma + .2
    origin = (box[0] - pad, box[1] - pad)
    size = (int((box[2] - box[0] + 2 * pad) * res), int((box[3] - box[1] + 2 * pad) * res))
    field = Field(blur(fill(segments(loops), origin, size, res), sigma * res), origin, res)
    return dict(height=lambda x, y: height * field(x, y))


def stamped_relief(loops, box, res, bold, bevel, height):
    """The P as the round seal stamps it (tools/build-round-seal.py): its
    outline grown `bold`, raised `height` over a rounded bevel `bevel` wide
    from a crisp foot (smoothstep of the distance in). Returns its height and
    its share of `height`, anywhere."""
    band = bevel + bold + .1
    origin = (box[0] - band - .1, box[1] - band - .1)
    size = (int((box[2] - box[0] + 2 * band + .2) * res), int((box[3] - box[1] + 2 * band + .2) * res))
    field = Field(distance_field(loops, origin, size, res, band), origin, res)
    lift = lambda d: smoothstep((np.asarray(d) + bold) / bevel)
    return dict(height=lambda x, y: height * lift(field(x, y)), share=lambda x, y: lift(field(x, y)))


def card_fields():
    """The cut and the emboss pattern's soft relief (card frame, mm, y up)."""
    to_card = lambda p: (p[0], CARD_H - p[1])
    cut_loops = [np.array([to_card(g.to_mm(p)) for p in g.flatten(sp, 64)]) for sp in g.CUT]
    pattern = [resample(np.array([to_card(g.to_mm(p)) for p in g.flatten(sp, 32)]), PATTERN_STEP)
               for sp in g.EMBOSS]
    lo, hi = np.vstack(pattern).min(0), np.vstack(pattern).max(0)
    relief = soft_relief(pattern, (*lo, *hi), FIELD_RES, SHOULDER, RELIEF)
    return ccw(resample(max(cut_loops, key=len), OUTLINE_STEP)), relief


# The key ring: a round tab above the top edge on the card's middle line,
# its own room for the hole, curving into the edge each side as the cut's
# corners do; the frame's pattern stays as it is. The card grows taller.
KEY_RING_HOLE = 3.0       # mm across
KEY_RING_WALL = 2.1       # paper round it
KEY_RING_RISE = 1.5       # its middle above the top edge (the hole's foot on the edge's line)
KEY_RING_FILLET = 2.0     # the curves from the tab into the edge


def key_ring_tab(outline):
    """The card's outline (CCW) with the tab, and the hole: the tab a circle
    round the hole, joined to the top edge each side by a circle tangent to
    both (outside the paper)."""
    cx = CARD_W / 2
    top = outline[np.abs(outline[:, 0] - cx) < .2, 1].max()
    C = np.array([cx, top + KEY_RING_RISE])
    R, rf = KEY_RING_HOLE / 2 + KEY_RING_WALL, KEY_RING_FILLET
    a, b = outline, np.roll(outline, -1, axis=0)

    def nearest(P):
        d = b - a
        t = np.clip(((P - a) * d).sum(1) / np.maximum((d * d).sum(1), 1e-12), 0, 1)
        q = a + t[:, None] * d
        k = int(np.argmin(np.hypot(*(q - P).T)))
        return float(np.hypot(*(q[k] - P))), q[k], k

    joins = {}
    for side, sweep in ((1, -1), (-1, 1)):
        # From straight above the tab, round towards this side and down,
        # until the fillet's circle touches the edge.
        phi = math.pi / 2
        step = math.radians(.5) * sweep
        F = lambda f: C + (R + rf) * np.array([math.cos(f), math.sin(f)])
        while nearest(F(phi + step))[0] > rf:
            phi += step
        lo, hi = phi, phi + step
        for _ in range(50):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if nearest(F(mid))[0] > rf else (lo, mid)
        f = F(lo)
        _, on_edge, k = nearest(f)
        assert not inside(f[None], outline)[0], 'the tab\'s curve would sit inside the card'
        joins[side] = dict(fillet=f, edge=on_edge, lobe=C + R * (f - C) / np.hypot(*(f - C)), k=k)

    def arc(centre, p0, p1, long=False):
        a0, a1 = math.atan2(*(p0 - centre)[::-1]), math.atan2(*(p1 - centre)[::-1])
        d = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        if long:
            d = d - math.copysign(2 * math.pi, d)
        r = np.hypot(*(p0 - centre))
        n = max(2, int(abs(d) * r / (OUTLINE_STEP / 4)))
        t = a0 + d * np.linspace(0, 1, n)
        return centre + r * np.column_stack([np.cos(t), np.sin(t)])

    right, left = joins[1], joins[-1]
    # CCW, the top edge runs right to left: in from the right along its
    # fillet, over the tab, out along the left fillet.
    over = np.vstack([arc(right['fillet'], right['edge'], right['lobe']),
                      arc(C, right['lobe'], left['lobe'], long=True)[1:],
                      arc(left['fillet'], left['lobe'], left['edge'])[1:]])
    i, j = right['k'], left['k']
    assert i < j, 'the outline should run right to left along the top'
    loop = np.vstack([outline[:i + 1], over, outline[j + 1:]])
    hole = circle(KEY_RING_HOLE / 2, C, n=192)
    return ccw(resample(loop, OUTLINE_STEP)), hole


def staggered_grid(outline, step, holes=()):
    """An even, staggered grid of points inside `outline`, outside `holes`."""
    x0, y0 = outline.min(0)
    x1, y1 = outline.max(0)
    xs = np.arange(x0 + step / 2, x1, step)
    ys = np.arange(y0 + step / 2, y1, step * np.sqrt(3) / 2)
    X, Y = np.meshgrid(xs, ys)
    X[1::2] += step / 2
    grid = np.column_stack([X.ravel(), Y.ravel()])
    mask = fill(segments([outline]), (x0, y0), (len(xs) * 4, int((y1 - y0) / step * 4) + 4), 4 / step)
    i = np.clip(((grid[:, 1] - y0) * 4 / step).astype(int), 0, mask.shape[0] - 1)
    j = np.clip(((grid[:, 0] - x0) * 4 / step).astype(int), 0, mask.shape[1] - 1)
    grid = grid[mask[i, j]]
    for hole in holes:
        grid = grid[~inside(grid, hole)]
    return clear_of([outline, *holes], grid, step / 3)


def refined(outline, height, seeds, holes=(), tol=REFINE_TOL, shortest=REFINE_MIN, rounds=14):
    """Points inside `outline` for a mesh of `height`: from `seeds`, each
    round splits every edge (and triangle) whose flat face misses the height
    halfway along by more than `tol`, and triangulates afresh (Delaunay), so
    triangles crowd only where the relief curves and are always well shaped."""
    pts = np.asarray(seeds, float)
    for k in range(rounds):
        v2, tris, rings = triangulate([outline, *holes], pts)
        z = height(v2[:, 0], v2[:, 1])
        e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
        e = np.unique(np.sort(e, axis=1), axis=0)
        # Never on the outline (or a hole's) itself: a point there would split its edge from the wall's.
        on = np.zeros(len(v2), bool)
        on[np.concatenate(rings)] = True
        e = e[~(on[e[:, 0]] & on[e[:, 1]])]
        mid = (v2[e[:, 0]] + v2[e[:, 1]]) / 2
        err = np.abs(height(mid[:, 0], mid[:, 1]) - (z[e[:, 0]] + z[e[:, 1]]) / 2)
        long = np.linalg.norm(v2[e[:, 0]] - v2[e[:, 1]], axis=1) > 2 * shortest
        c = v2[tris].mean(1)
        errc = np.abs(height(c[:, 0], c[:, 1]) - z[tris].mean(1))
        wide = np.sqrt(np.abs(np.cross(v2[tris[:, 1]] - v2[tris[:, 0]], v2[tris[:, 2]] - v2[tris[:, 0]]))) > 1.5 * shortest
        new = np.vstack([mid[(err > tol) & long], c[(errc > tol) & wide]])
        log(f'refine round {k + 1}: {len(v2)} points, {len(new)} more')
        if not len(new):
            break
        pts = np.vstack([pts, np.unique(np.round(new, 6), axis=0)])
    return pts


def build_body(name, outline, relief=None, holes=(), **tune):
    """A slab inside `outline` (CCW, card frame), its front at STOCK and its
    back at 0, both moved out by the `relief`'s height where it has one
    (raised on the front, pressed into the back: the paper's way), meshed to
    the A1 (`refined`), with `holes` straight through (punched, as through
    embossed paper); and the seal's pocket at CENTRE (`tune`: a fit test's
    rim or teeth)."""
    mesh = Mesh(name)
    height = relief['height'] if relief else (lambda x, y: np.zeros(np.shape(x)))
    pts = staggered_grid(outline, FLAT_STEP, holes)
    if relief:
        pts = refined(outline, height, pts, holes)
    v2, tris, (front_ring, *front_holes) = triangulate([outline, *holes], pts)
    front = mesh.surface(v2, tris, STOCK + height(v2[:, 0], v2[:, 1]), up=True)

    ring = lambda rr, d: mesh.verts(np.column_stack([CENTRE[0] + rr * np.cos(THETA), CENTRE[1] + rr * np.sin(THETA),
                                                     np.full(THETA_STEPS, d)]))
    if VARIANT == 'twist':
        mouth = twist_lip_loop(CENTRE, **tune)
    else:
        r0 = r_pocket(THETA, 0, **tune)
        mouth = np.column_stack([CENTRE[0] + r0 * np.cos(THETA), CENTRE[1] + r0 * np.sin(THETA)])
    clear = np.hypot(*(pts - CENTRE).T) > R_MOUTH + FLAT_CLEAR
    v2, tris, (back_ring, mouth_ring, *back_holes) = triangulate([outline, mouth, *holes], pts[clear])
    zb = height(v2[:, 0], v2[:, 1])
    assert np.abs(zb[mouth_ring]).max() < 1e-9, 'relief reaches the pocket'
    back = mesh.surface(v2, tris, zb, up=False)
    mesh.wall(back[back_ring], front[front_ring])
    for b, f in zip(back_holes, front_holes):
        mesh.wall(back[b], front[f], outward=False)

    if VARIANT == 'twist':
        # The ledge, springs and all, straight up through its two layers; its
        # top, round the mouth, faces the cavity; the cavity up to the floor.
        rc = r_cavity_twist(THETA)
        cavity = np.column_stack([CENTRE[0] + rc * np.cos(THETA), CENTRE[1] + rc * np.sin(THETA)])
        v2, tris, (cavity_ring, lip_ring) = triangulate([cavity, mouth], np.empty((0, 2)))
        top = mesh.surface(v2, tris, np.full(len(v2), LEDGE), up=True)
        mesh.wall(back[mouth_ring], top[lip_ring], outward=False)
        rings = [top[cavity_ring], ring(rc, POCKET)]
    else:
        rings = [back[mouth_ring]] + [ring(r_pocket(THETA, d, **tune), d) for d in depths(POCKET)[1:]]
    mesh.tube(rings, outward=False)
    mesh.fan(rings[-1], (*CENTRE, POCKET), up=False)
    return mesh


# —— The seal ——

def load_seal():
    """The round seal's outline, as a radius (mm) per angle about its field's
    centre (u right, v up), and its mm per image px (19 mm across)."""
    img = bpy.data.images.load(str(ROUND_SEAL))
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    alpha = px.reshape(h, w, 4)[::-1, :, 3]          # rows from the top
    ys, xs = np.nonzero(alpha > .5)
    mm = SEAL_WIDTH / (xs.max() - xs.min() + 1)
    phi = np.linspace(-np.pi, np.pi, 1440, endpoint=False)
    rs = np.arange(300, 720, .25)
    X = SEAL_FIELD[0] + rs[None, :] * np.cos(phi)[:, None]
    Y = SEAL_FIELD[1] - rs[None, :] * np.sin(phi)[:, None]
    a = Field(alpha, (0, 0), 1)(X, Y)
    edge = np.array([rs[np.nonzero(row >= .5)[0].max()] for row in a])
    k = np.exp(-.5 * (np.arange(-8, 9) / 3) ** 2)
    edge = np.convolve(np.r_[edge[-8:], edge, edge[:8]], k / k.sum(), mode='valid')
    return phi, edge * mm, mm


def letter_loops(tall, offset):
    """The P's outline loops (seal frame, mm), from the font's own curves:
    `tall` from ascender to descender, its box's middle at `offset`."""
    font = bpy.data.fonts.load(str(FONT))
    curve = bpy.data.curves.new('P', 'FONT')
    curve.font, curve.body, curve.resolution_u = font, 'P', 64
    obj = bpy.data.objects.new('P', curve)
    bpy.context.scene.collection.objects.link(obj)
    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    co = np.array([v.co[:2] for v in me.vertices])
    directed = set()
    for poly in me.polygons:
        vs = list(poly.vertices)
        directed.update(zip(vs, vs[1:] + vs[:1]))
    nxt = {a: b for a, b in directed if (b, a) not in directed}
    ev.to_mesh_clear()
    bpy.data.objects.remove(obj)
    lo, hi = co.min(0), co.max(0)
    s = tall / (hi[1] - lo[1])
    p = (co - (lo + hi) / 2) * s + offset
    loops = []
    while nxt:
        start = next(iter(nxt))
        chain, v = [start], nxt.pop(start)
        while v != start:
            chain.append(v)
            v = nxt.pop(v)
        loops.append(resample(p[chain], LETTER_STEP))
    return loops, (hi - lo) * s


def seal_fields():
    phi, edge, mm = load_seal()
    fa, fb = SEAL_FIELD[2] * mm, SEAL_FIELD[3] * mm
    half = SEAL_WIDTH / 2 + 1.5
    origin = (-half, -half)
    n = int(2 * half * SEAL_RES)
    u = origin[0] + (np.arange(n) + .5) / SEAL_RES
    U, Vv = np.meshgrid(u, u)
    # Signed distance to the field's rim (mm): - in the field, + on the lip.
    eu, ev = U / fa, Vv / fb
    r = np.sqrt(eu * eu + ev * ev) + 1e-9
    ridge = (r - 1) / (np.hypot(eu / fa, ev / fb) / r)
    E = np.interp(np.arctan2(Vv, U), phi, edge, period=2 * np.pi)
    out = np.maximum(E - np.hypot(U, Vv), 0)
    # Across the lip, from the rim (0) to the outline (1), as the script's.
    a = np.clip(ridge / np.maximum(ridge + out, 1e-3), 0, 1)
    lip = (1 - a) * H_FIELD + a * H_EDGE + H_LIP * np.sin(np.pi * np.clip((a - .12) / .88, 0, 1)) ** .7
    height = np.where(ridge > 0, lip, H_FIELD) + H_RING * np.exp(-(ridge / .17) ** 2)
    loops, letter_size = letter_loops(P_SHARE * 2 * fb, (P_NUDGE * mm, 0))
    lo, hi = np.vstack(loops).min(0), np.vstack(loops).max(0)
    bold, bevel = P_BOLD * mm, P_BEVEL * mm
    letter = stamped_relief(loops, (*lo, *hi), LETTER_RES, bold, bevel, H_LETTER)
    base = Field(height, origin, SEAL_RES)
    return dict(phi=phi, edge=edge, height=lambda u, v: base(u, v) + letter['height'](u, v), base=base,
                letter_size=letter_size + 2 * bold, bevel=bevel, origin=origin, mm_per_px=mm)


def polar_points(r_max, step):
    """Points on circles round the middle, `step` apart."""
    pts, r, k = [np.zeros((1, 2))], step, 0
    while r < r_max:
        n = max(6, int(2 * np.pi * r / step))
        t = (np.arange(n) + .5 * (k % 2)) * 2 * np.pi / n
        pts.append(np.column_stack([r * np.cos(t), r * np.sin(t)]))
        r += step
        k += 1
    return np.vstack(pts)


def to_card_frame(uv):
    """Seal frame (as seen looking at the seal, from the back) → card frame."""
    return np.column_stack([-uv[:, 0], uv[:, 1]])


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def build_seal(name, outline_uv, height_uv, inside_uv, centre, refine=True):
    """The seal in the card frame, locked: its face at z = -height (refined
    as the card's relief is), its underside on the card's back (z = 0, easing
    off by RIM_RELIEF towards the rim), its peg and tabs down in the pocket,
    the tag's recess in the peg's end."""
    half = np.abs(outline_uv).max() + SEAL_SEED
    seeds = polar_points(half, SEAL_SEED)
    outline = ccw(to_card_frame(outline_uv) + centre)
    height = lambda x, y: height_uv(-(np.asarray(x) - centre[0]), np.asarray(y) - centre[1])
    pts = to_card_frame(seeds[inside_uv(seeds)]) + centre
    if refine:
        pts = refined(outline, height, pts)
    mesh = Mesh(name)
    v2, tris, (top_ring,) = triangulate([outline], pts)
    top = mesh.surface(v2, tris, -height(v2[:, 0], v2[:, 1]), up=False)

    # The underside: points on circles, so the easing off has vertices to follow,
    # round the peg's root (its section where it meets the underside).
    root_r = r_seal(THETA, 0)
    rings_uv = [np.column_stack([r * np.cos(t), r * np.sin(t)])
                for r in np.arange(root_r.min() + .1, half, .1)
                for t in [np.linspace(0, 2 * np.pi, max(24, int(2 * np.pi * r / .1)), endpoint=False)]]
    under_uv = np.vstack(rings_uv)
    under = to_card_frame(under_uv[inside_uv(under_uv)]) + centre
    off = under - centre
    beyond = np.hypot(*off.T) > np.interp(np.arctan2(off[:, 1], off[:, 0]) % (2 * np.pi), THETA, root_r, period=2 * np.pi) + .05
    root = np.column_stack([centre[0] + root_r * np.cos(THETA), centre[1] + root_r * np.sin(THETA)])
    v2, tris, (under_ring, root_ring) = triangulate([outline, root], under[beyond])
    rad = np.hypot(*(v2 - centre).T)
    under = mesh.surface(v2, tris, -RIM_RELIEF * smoothstep((rad - R_CONTACT) / .5), up=True)
    mesh.wall(top[top_ring], under[under_ring])

    # The peg and its tabs, closed by its end round the tag's recess.
    re = r_seal(THETA, STEM)
    end_loop = np.column_stack([centre[0] + re * np.cos(THETA), centre[1] + re * np.sin(THETA)])
    v2, tris, (end_ring, recess_ring) = triangulate([end_loop, circle(R_RECESS, centre)], np.empty((0, 2)))
    end = mesh.surface(v2, tris, np.full(len(v2), STEM), up=True)
    rings = [under[root_ring]]
    for d in depths(STEM)[1:-1]:
        rr = r_seal(THETA, d)
        rings.append(mesh.verts(np.column_stack([centre[0] + rr * np.cos(THETA),
                                                 centre[1] + rr * np.sin(THETA), np.full(THETA_STEPS, d)])))
    rings.append(end[end_ring])
    mesh.tube(rings, outward=True)
    ceiling = mesh.verts(np.column_stack([circle(R_RECESS, centre), np.full(THETA_STEPS, STEM - TAG_DEPTH)]))
    mesh.tube([ceiling, end[recess_ring]], outward=False)
    mesh.fan(ceiling, (*centre, STEM - TAG_DEPTH), up=True)
    return mesh


def build_clip(name, centre):
    """The split clip ring (press), in the card frame where it sits on the
    stem: its outer edge widest at the face that holds the rim and stepped in
    towards the cavity, so it leads itself in. One profile swept round all
    but its split."""
    prof, z = [(CLIP_IN, 0.)], 0.
    for h, r in CLIP_LAYERS:
        prof += [(r, z), (r, z + h)]
        z += h
    prof.append((CLIP_IN, z))
    P = np.array(prof)                       # anticlockwise in (r, z)
    n = int(round((360 - CLIP_GAP) / .25))
    angles = np.radians(CLIP_GAP_AT + CLIP_GAP / 2 + np.linspace(0, 360 - CLIP_GAP, n + 1))
    mesh = Mesh(name)
    rows = [mesh.verts(np.column_stack([centre[0] + P[:, 0] * math.cos(t), centre[1] + P[:, 0] * math.sin(t),
                                        CLIP_AT + P[:, 1]])) for t in angles]
    for a, b in zip(rows[:-1], rows[1:]):
        mesh.faces(np.column_stack([a, b, np.roll(b, -1), a, np.roll(b, -1), np.roll(a, -1)]).reshape(-1, 3))
    v2, tris, (ix,) = triangulate([P], np.empty((0, 2)))
    k = np.empty(len(v2), np.int64)
    k[ix] = np.arange(len(P))
    mesh.faces(rows[0][k[tris]])
    mesh.faces(rows[-1][k[tris]][:, ::-1])
    return mesh


# —— A1 plates ——

BED, PLATE_GAP, PLATE_EDGE = 256., 3., 4.
# The A1's head wrap detect zone, at the back right (its profile's
# head_wrap_detect_zone): nothing goes there.
HEAD_WRAP = (226., 224., 256., 256.)


def plate_items(card, seal=None, clip=None, keyring=None):
    """A full A1 plate: two rows of three cards, two more on their side along
    the front (the first of them the key ring card, its tab to the left),
    nine seals in the corner they leave, nine clips beside the rows. Each
    argument: (part index, (width, depth)); returns write_3mf items."""
    ci, (W, H) = card
    g = PLATE_GAP
    m = (BED - (2 * (H + g) + W)) / 2
    side = [(ci, H), (ci, H)] if keyring is None else [(keyring[0], keyring[1][1]), (ci, H)]
    items, x0 = [], m
    for part, length in side:
        items.append((part, 1, x0, m))
        x0 += length + g
    items += [(ci, 0, m + k * (W + g), m + W + g + j * (H + g)) for j in range(2) for k in range(3)]
    if seal:
        si, (sw, sh) = seal
        room = BED - m - x0
        sx, sy = x0 + (room - (3 * sw + 2 * g)) / 2, m + (W - (3 * sh + 2 * g)) / 2
        items += [(si, 0, sx + c * (sw + g), sy + r * (sh + g)) for r in range(3) for c in range(3)]
    if clip:
        ki, (kw, kh) = clip
        x0 = m + 3 * W + 3 * g
        room, tall = BED - m - x0, 2 * H + g
        assert kw <= room and 9 * kh + 8 * g <= tall
        kx, ky = x0 + (room - kw) / 2, m + W + g + (tall - (9 * kh + 8 * g)) / 2
        items += [(ki, 0, kx, ky + r * (kh + g)) for r in range(9)]
    return items


def row_items(part, count):
    """`count` copies of a part upright in one row, in the middle of the plate."""
    i, (w, h) = part
    x0 = (BED - (count * w + (count - 1) * PLATE_GAP)) / 2
    return [(i, 0, x0 + k * (w + PLATE_GAP), (BED - h) / 2) for k in range(count)]


def off_head_wrap(x, y, w, h):
    zx0, zy0, zx1, zy1 = HEAD_WRAP
    g = PLATE_GAP
    return x + w <= zx0 - g or y + h <= zy0 - g or x >= zx1 + g or y >= zy1 + g


def seal_plate_items(seal, clip=None):
    """A plate of seals only: staggered rows, as close as their round edges
    allow; with clips, each seal over its clip, in columns."""
    (si, (sw, sh)), g, m = seal, PLATE_GAP, PLATE_EDGE
    items = []
    if clip is None:
        p = max(sw, sh) + g
        y, k = m, 0
        while y + sh <= BED - m:
            x = m + (p / 2 if k % 2 else 0)
            while x + sw <= BED - m:
                if off_head_wrap(x, y, sw, sh):
                    items.append((si, 0, x, y))
                x += p
            y, k = y + p * math.sqrt(3) / 2, k + 1
        return items
    ki, (kw, kh) = clip
    cell = (max(sw, kw) + g, sh + kh + 2 * g)
    cols, rows = int((BED - 2 * m + g) // cell[0]), int((BED - 2 * m + g) // cell[1])
    x0 = (BED - (cols * cell[0] - g)) / 2
    y0 = (BED - (rows * cell[1] - g)) / 2
    for r in range(rows):
        for c in range(cols):
            x, y = x0 + c * cell[0], y0 + r * cell[1]
            items += [(ki, 0, x + (cell[0] - g - kw) / 2, y), (si, 0, x + (cell[0] - g - sw) / 2, y + kh + g)]
    return items


def plate_check(items, sizes, round_parts=()):
    """Every copy on the bed, PLATE_GAP clear of the next (by their boxes;
    for round parts, by their circles)."""
    boxes = []
    for part, q, x, y in items:
        w, h = sizes[part][:2]
        if q % 2:
            w, h = h, w
        assert x >= 2 - 1e-6 and y >= 2 - 1e-6 and x + w <= BED - 2 + 1e-6 and y + h <= BED - 2 + 1e-6, (part, x, y)
        assert off_head_wrap(x, y, w, h), f'a copy in the A1\'s head wrap zone at {x:.1f}, {y:.1f}'
        boxes.append((part, x, y, w, h))
    for i, (pa, xa, ya, wa, ha) in enumerate(boxes):
        for pb, xb, yb, wb, hb in boxes[i + 1:]:
            if pa in round_parts and pb in round_parts:
                gap = math.hypot(xa + wa / 2 - xb - wb / 2, ya + ha / 2 - yb - hb / 2) - max(wa, ha) / 2 - max(wb, hb) / 2
            else:
                gap = max(xb - xa - wa, xa - xb - wb, yb - ya - ha, ya - yb - hb)
            assert gap >= PLATE_GAP - 1e-6, f'copies {gap:.2f} mm apart'
    return len(items)


# —— Writing ——

def write_stl(path, V, F):
    tri = V[F].astype(np.float32)
    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(F), dtype=[('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')])
    rec['n'], rec['v'] = nrm, tri
    with open(path, 'wb') as f:
        f.write(b'pambudi card, mm'.ljust(80, b' '))
        f.write(struct.pack('<I', len(F)))
        f.write(rec.tobytes())


def write_3mf(path, parts, items=None):
    """parts: [(name, V, F, (tx, ty))], each already in print orientation,
    placed once with its near corner at (tx, ty); or, with `items`
    [(part index, quarter turns, x, y)], as many copies as listed, each
    turned that many quarter turns anticlockwise, its near corner at (x, y)
    (one mesh, written once)."""
    objects, out, sizes = [], [], []
    for i, (name, V, F, *_) in enumerate(parts, 1):
        V = V - V.min(0)
        sizes.append(V.max(0))
        vs = '\n'.join(f'<vertex x="{x:.4f}" y="{y:.4f}" z="{z:.4f}"/>' for x, y, z in V.tolist())
        ts = '\n'.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in F.tolist())
        objects.append(f'<object id="{i}" name="{name}" type="model"><mesh><vertices>\n{vs}\n'
                       f'</vertices><triangles>\n{ts}\n</triangles></mesh></object>')
    if items is None:
        items = [(i, 0, *part[3]) for i, part in enumerate(parts)]
    for part, q, x, y in items:
        w, h = sizes[part][:2]
        m = f'1 0 0 0 1 0 0 0 1 {x:.3f} {y:.3f} 0' if q % 2 == 0 else f'0 1 0 -1 0 0 0 0 1 {x + h:.3f} {y:.3f} 0'
        out.append(f'<item objectid="{part + 1}" transform="{m}"/>')
    items = out
    model = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<model unit="millimeter" xml:lang="en-US" '
             'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n'
             '<metadata name="Title">Ivan Pambudi card</metadata>\n'
             f'<resources>\n{"".join(objects)}\n</resources>\n<build>{"".join(items)}</build>\n</model>\n')
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr('[Content_Types].xml',
                   '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/'
                   'package/2006/content-types"><Default Extension="rels" ContentType="application/'
                   'vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" '
                   'ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
        z.writestr('_rels/.rels',
                   '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.'
                   'openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" '
                   'Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
                   '</Relationships>')
        z.writestr('3D/3dmodel.model', model)


def lid_print(V, centre):
    """Card frame → printed face up, peg on the plate (a half turn about y)."""
    P = np.column_stack([centre[0] - V[:, 0], V[:, 1] - centre[1], -V[:, 2]])
    return P - [0, 0, P[:, 2].min()]


def placement(card_print, lid_print_v, lid_card, clip_card=None):
    """For the page: each part's own coordinates in the 3MF (write_3mf moves
    each to its corner) back to the card frame, the seal locked on (the clip
    on its stem). Row-major 4 × 4."""
    m = card_print.min(0)
    card = [[1, 0, 0, m[0]], [0, 1, 0, m[1]], [0, 0, 1, m[2]], [0, 0, 0, 1]]
    n = lid_print_v.min(0)
    lift = (-lid_card[:, 2]).min()          # lid_print set the peg's end on the plate
    seal = [[-1, 0, 0, CENTRE[0] - n[0]], [0, 1, 0, n[1] + CENTRE[1]], [0, 0, -1, -(n[2] + lift)], [0, 0, 0, 1]]
    local = lid_print_v - n
    back = np.column_stack([local, np.ones(len(local))]) @ np.array(seal).T
    assert np.allclose(back[:, :3], lid_card, atol=1e-6), 'the seal would not land on the card'
    out = {'card body': card, 'seal': seal}
    if clip_card is not None:
        k = clip_card.min(0)
        out['clip'] = [[1, 0, 0, k[0]], [0, 1, 0, k[1]], [0, 0, 1, k[2]], [0, 0, 0, 1]]
    return out


# —— Build ——

def fit_test():
    """Coins of the card's middle (with its pocket) and plugs with a flat
    face, as the card and seal fit. Removable: one pair, its notches marking
    where it locks. Sealed, each can be tried only once, so three, tight to
    loose, marked by one to three dips in their edges."""
    tt = 2 * np.pi * np.arange(1600) / 1600

    def disc_r(radius, marks):
        return lambda t: radius - sum(np.clip(1 - np.abs(np.angle(np.exp(1j * (t - np.pi / 2 - .3 * (k - (marks - 1) / 2))))) / .07, 0, 1)
                                      for k in range(marks))

    def disc(radius, marks):
        r = disc_r(radius, marks)(tt)
        return np.column_stack([r * np.cos(tt), r * np.sin(tt)])

    plug_h = lambda u, v: np.full(np.shape(u), 1.5)
    if VARIANT == 'removable':
        tunes = [{}]
    elif VARIANT == 'press':
        tunes = [dict(r_lip=R_LIP - .05), dict(r_lip=R_LIP), dict(r_lip=R_LIP + .05)]
    else:
        tunes = [dict(r_tip=R_TIP - .1), dict(r_tip=R_TIP), dict(r_tip=R_TIP + .1)]
    parts, report = [], {}
    for k, tune in enumerate(tunes):
        marks = k + 1
        tag = '' if len(tunes) == 1 else f' {marks}'
        if VARIANT == 'twist':
            report[f'fit test{tag}'] = twist_check(**tune)
        coin = build_body(f'fit test coin{tag}', ccw(disc(11, marks) + CENTRE), **tune)
        plug_uv = disc(9.5, marks)
        plug_in = lambda p, r=disc_r(9.5, marks): np.hypot(p[:, 0], p[:, 1]) < r(np.arctan2(p[:, 1], p[:, 0])) - .03
        plug = build_seal(f'fit test plug{tag}', plug_uv, plug_h, plug_in, CENTRE, refine=False)
        CV, CF = coin.arrays()
        PV, PF = plug.arrays()
        report[f'fit test coin{tag}'], report[f'fit test plug{tag}'] = check(CV, CF), check(PV, PF)
        x = 95 if len(tunes) == 1 else 60 + 34 * k
        parts += [(f'fit test coin{tag}', CV, CF, (x, 117 if len(tunes) == 1 else 140)),
                  (f'fit test plug{tag}', lid_print(PV, CENTRE), PF, (140 if len(tunes) == 1 else x + 1.5, 117 if len(tunes) == 1 else 110))]
        if VARIANT == 'press':
            KV, KF = build_clip(f'fit test clip{tag}', CENTRE).arrays()
            report[f'fit test clip{tag}'] = check(KV, KF)
            parts.append((f'fit test clip{tag}', KV, KF, (x + 3, 86)))
    return parts, report


def seal_cover(phi, edge):
    """How far the seal's outline reaches past the pocket's mouth on the
    card's back, at its least (mm): the mouth must stay hidden."""
    if VARIANT == 'twist':
        mouth = twist_lip_loop(CENTRE) - CENTRE
    else:
        r0 = r_pocket(THETA, 0)
        mouth = np.column_stack([r0 * np.cos(THETA), r0 * np.sin(THETA)])
    # The seal frame is mirrored (u = -x): the outline at card angle a is at pi - a.
    a = np.arctan2(mouth[:, 1], mouth[:, 0])
    o = np.argsort(phi)
    reach = np.interp((np.pi - a + np.pi) % (2 * np.pi) - np.pi, phi[o], edge[o], period=2 * np.pi)
    cover = float((reach - np.hypot(*mouth.T)).min())
    assert cover >= .3, f'the pocket shows past the seal ({cover:.2f} mm)'
    return round(cover, 3)


def notes_twist(m, counts):
    """The print notes for the version the page offers, in Indonesian (for
    the person printing them)."""
    return f'''KARTU IVAN PAMBUDI - CETAK 3D (Bambu Lab A1, nozzle 0.4 mm)

FILE (sudah di-slice untuk A1: PLA, layer 0.08 mm, tanpa support)
- a1-cards{SUFFIX}.gcode.3mf: {counts['cards']} kartu (putih)
- a1-seals{SUFFIX}.gcode.3mf: {counts['seals']} seal (merah)
- a1-keyrings{SUFFIX}.gcode.3mf: {counts['keyrings']} kartu gantungan kunci (putih)
- fit-test{SUFFIX}.gcode.3mf: potongan uji, satu warna, cetak paling dulu
Cara print: buka file-nya di Bambu Studio lalu Print, atau salin ke kartu
microSD A1 dan pilih dari layar printer. Satu warna per file: ganti
gulungan filamen sebelum mencetak file berikutnya.

LANGKAH
1. Cetak fit-test{SUFFIX}.gcode.3mf dulu: 3 koin (bagian tengah kartu) dan 3 sumbat
   (seal polos), ditandai 1, 2, 3 takik di pinggirnya (1 = paling ketat).
   Kuncinya permanen, jadi tiap pasang cuma bisa dicoba sekali: masukkan kaki
   sumbat ke celah koin, dorong, lalu putar searah jarum jam sampai klik.
   Pilih nomor paling ketat yang masih bisa diputar tanpa dipaksa, lalu
   kabari nomornya, supaya ukuran gigi pegas di kartu disesuaikan (R_TIP,
   sekarang {R_TIP} mm; koin 1 = {R_TIP - .1:.2f}, koin 3 = {R_TIP + .1:.2f}).
2. Cetak plate kartu dan plate gantungan (putih), lalu plate seal (merah).
3. Tempel stiker NFC di ceruk di ujung pasak seal.
4. Pasang seal: masukkan kedua kaki pasaknya ke celah di lubang belakang
   kartu, dorong, lalu putar searah jarum jam sekitar {LOCK_DEG:.0f} derajat sampai klik
   dan berhenti; huruf P berdiri tegak. Setelah itu seal tidak bisa diputar
   balik, jadi stiker NFC terkunci di dalam.

SETELAN CETAK
- PLA, support MATI. Posisi seperti di file: kartu telentang (punggungnya di
  plate, mukanya ke atas), seal menghadap ke atas (pasaknya di plate).
- Tidak perlu support: kartu dan seal duduk rata di plate. Atap lubang seal
  di kartu dan pinggiran bawah seal (menggantung {m['seal_overhang_under_rim'][0]}-{m['seal_overhang_under_rim'][1]} mm di sekeliling
  pasak) cukup dicetak sebagai jembatan dan overhang pendek. Bagian bawah
  seal mungkin sedikit kasar, tapi tidak kelihatan dan sudah diberi ruang.
- Layer 0.08 mm (profil "0.08mm Extra Fine") supaya relief paling tajam.
  Semua ketinggian sudah disesuaikan dengan layer ini (layer pertama 0.2 mm,
  lalu 0.08 mm).
- Elephant foot compensation di Bambu Studio biarkan seperti bawaannya.
- Sekitar {m['card_grams']} g PLA per kartu, {m['seal_grams']} g per seal.

UKURAN
Kartu      {m['card'][0]:.2f} x {m['card'][1]:.2f} mm, potongan card.pambudi.xyz; tebal {STOCK} mm
           ({m['at_the_relief']} mm di motif emboss: naik {RELIEF} mm di depan, tertekan di belakang)
Gantungan  kartu yang sama dengan tonjolan bulat di atas, {m['card_key_ring'][0]:.2f} x {m['card_key_ring'][1]:.2f} mm;
           lubang {KEY_RING_HOLE} mm, dinding kertas {KEY_RING_WALL} mm di sekelilingnya
Seal       lebar {SEAL_WIDTH} mm; lilinnya {m['seal_height']:.2f} mm, {m['seal_with_peg']:.2f} mm dengan pasaknya
NFC        stiker bulat maksimal {m['nfc_tag_max_diameter']} mm, tebal maksimal {m['nfc_tag_max_thickness']} mm
           (misalnya NTAG213 12 mm)
Lubang     bibir {LEDGE} mm dengan 2 celah dan 2 pegas pipih, di atas rongga
           {round(POCKET - LEDGE, 2)} mm, di bawah lantai depan {FLOOR} mm
Pasak      {STEM} mm, 2 kaki {round(STEM - TAB_TOP, 2)} mm, jarak bebas {CLEAR} mm; saat diputar pegasnya
           melentur {m['spring_bend']} mm lalu mengunci {m['tooth_catch']} mm
'''


def notes(m, counts):
    """The print notes for this version."""
    if VARIANT == 'twist':
        return notes_twist(m, counts)
    head = f'IVAN PAMBUDI CARD - 3D PRINT, {VARIANT.upper()} (Bambu Lab A1, 0.4 mm nozzle)'
    files = (f'Files: a1-cards{SUFFIX}.3mf ({counts["cards"]} cards), a1-seals{SUFFIX}.3mf ({counts["seals"]} seals),\n'
             f'a1-keyrings{SUFFIX}.3mf ({counts["keyrings"]} key ring cards), fit-test{SUFFIX}.3mf.')
    common = f'''PLA, supports off, as placed: the card's back on the plate (front up), the
seal face up. 0.08 mm layers (0.08mm Extra Fine) for the crispest relief;
{"the heights below are made for them (a 0.2 mm first layer, then 0.08 mm)" if VARIANT != 'removable' else "0.12 mm also fine"}.
Keep Bambu Studio's elephant foot compensation as it is.
About {m['card_grams']} g of PLA a card, {m['seal_grams']} g a seal.

Two colours (cards white, seals red): the files carry no colour, so in
Bambu Studio give each part its filament.
- With the AMS lite (the A1 Combo's feeder, up to four spools): load white
  and red, open the plate, select the seals and set them to the red, the
  cards to the white. It prints in one go, changing filament on each layer
  both are printing (about 18 changes: roughly 15-20 minutes more, and a
  little filament purged at each change).
- Without the AMS lite (one spool at a time): print the plate twice, once
  with the seals deleted (white), once with the cards deleted (red).'''
    sizes = f'''Card     {m['card'][0]} x {m['card'][1]} mm, the cut of card.pambudi.xyz; {STOCK} mm thick
         ({m['at_the_relief']} mm at the relief, raised {RELIEF} mm on the front, pressed into the back)
Key ring the same card with a round tab on top, {m['card_key_ring'][0]} x {m['card_key_ring'][1]} mm:
         a {KEY_RING_HOLE} mm hole, {KEY_RING_WALL} mm of paper round it
Seal     {SEAL_WIDTH} mm wide, {m['seal_height']} mm tall
NFC      a round sticker tag up to {m['nfc_tag_max_diameter']} mm wide and {m['nfc_tag_max_thickness']} mm thick
         (e.g. NTAG213, 12 mm), in the recess in the end of the seal's {"stem" if VARIANT == 'press' else "peg"}'''
    if VARIANT == 'removable':
        steps = f'''1. Print fit-test.3mf first (a few minutes). Put the plug's tabs into the
   coin's notches, push, and turn it clockwise: it should click and stop
   with its marker at the coin's marker. Too stiff or too loose: change
   CLEAR (now {CLEAR} mm) or DETENT (now {DETENT} mm) in tools/build-card-3d.py
   and rebuild.
2. Print a1-cards.3mf and a1-keyrings.3mf (white), then a1-seals.3mf (red).
3. Stick the NFC tag in the recess in the end of the seal's peg.
4. On: tabs into the notches, push, turn clockwise about {LOCK_DEG:.0f} degrees
   until it clicks and stops; the P stands upright.
   Off: turn it back anticlockwise past the click and lift.'''
        build = f'''Pocket   {POCKET} mm deep, {FLOOR} mm floor on the front: a {LEDGE} mm ledge with three
         notches, a {round(POCKET - LEDGE, 2)} mm groove beneath it
Peg      {STEM} mm, three {round(STEM - TAB_TOP, 2)} mm tabs, {CLEAR} mm clearance'''
    elif VARIANT == 'press':
        steps = f'''1. Print fit-test-press.3mf first: three coins, three plugs, three clips,
   marked 1, 2, 3 by dips in their edges (1 tightest). A clip can't come out
   once in, so each pair is tried once: slip a clip into the groove of plug 1
   (open it over the plug's end), line the plug's key up with the notch in
   the coin's rim, and press. Do the same with 2 and 3. Use the tightest
   that went in with a firm press and won't pull out; tell the build its
   rim (R_LIP, now {R_LIP} mm; coin 1 is {R_LIP - .05:.2f}, coin 3 {R_LIP + .05:.2f}).
2. Print a1-cards-press.3mf and a1-keyrings-press.3mf (white), then a1-seals-press.3mf (red).
3. Stick the NFC tag in the recess in the end of the seal's stem.
4. Slip the clip into the groove on the seal's stem (it opens over the
   flange at the stem's end). Turn the seal until its key drops into the
   notch (the P upright) and press it straight in until it clicks.
   It won't come out again without breaking: the tag is sealed in.'''
        build = f'''Pocket   a {LIP} mm rim at the back ({2 * R_LIP} mm hole, a notch for the key) over a
         {round(POCKET - LIP, 2)} mm cavity {2 * R_CAVITY} mm across, under a {round(FLOOR, 2)} mm front floor
Stem     {STEM} mm: a neck through the rim, a groove, a {round(STEM - GROOVE_END, 2)} mm flange
Clip     {round(clip_height(), 2)} mm, {2 * CLIP_LAYERS[0][1]} mm across, split; catches the rim by {m['clip_catch']} mm'''
    else:
        steps = f'''1. Print fit-test-twist.3mf first: three coins and three plugs, marked 1, 2,
   3 by dips in their edges (1 tightest). Each locks once, for good, so each
   pair is tried once: tabs into the notches, push, turn clockwise until it
   clicks. Use the tightest that turns without forcing; tell the build its
   teeth (R_TIP, now {R_TIP} mm; coin 1 is {R_TIP - .1:.2f}, coin 3 {R_TIP + .1:.2f}).
2. Print a1-cards-twist.3mf and a1-keyrings-twist.3mf (white), then a1-seals-twist.3mf (red).
3. Stick the NFC tag in the recess in the end of the seal's peg.
4. Tabs into the notches, push, and turn clockwise about {LOCK_DEG:.0f} degrees until
   it clicks and stops; the P stands upright. It can't turn back: the tag
   is sealed in.'''
        build = f'''Pocket   a {LEDGE} mm ledge with two notches and two flat springs, over a
         {round(POCKET - LEDGE, 2)} mm groove, under a {FLOOR} mm front floor
Peg      {STEM} mm, two {round(STEM - TAB_TOP, 2)} mm tabs, {CLEAR} mm clearance; its springs bend
         {m['spring_bend']} mm on the turn and catch {m['tooth_catch']} mm'''
    return f'''{head}

{files}

{steps}

{common}

{sizes}
{build}
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'variant': VARIANT}
    report['fit'] = {'removable': fit_check, 'press': press_check, 'twist': twist_check}[VARIANT]()
    log('fit', report['fit'])

    # Two cards: the card, and the key ring card (the same with a tab on top).
    outline, relief = card_fields()
    BV, BF = build_body('card body', outline, relief).arrays()
    report['card body'] = check(BV, BF)
    log('card body', report['card body'])
    ring_outline, hole = key_ring_tab(outline)
    RV, RF = build_body('card body, key ring', ring_outline, relief, holes=[hole]).arrays()
    report['card body, key ring'] = check(RV, RF)
    log('card body, key ring', report['card body, key ring'])

    sf = seal_fields()
    phi, edge = sf['phi'], sf['edge']
    o = np.argsort(phi)
    outline_uv = resample(np.column_stack([edge * np.cos(phi), edge * np.sin(phi)]), OUTLINE_STEP)

    def inside_uv(p):
        e = np.interp(np.arctan2(p[:, 1], p[:, 0]), phi[o], edge[o], period=2 * np.pi)
        return np.hypot(p[:, 0], p[:, 1]) < e - .03

    seal = build_seal('seal', outline_uv, sf['height'], inside_uv, CENTRE)
    LV, LF = seal.arrays()
    report['seal'] = check(LV, LF)
    log('seal', report['seal'])
    clip = None
    if VARIANT == 'press':
        clip = build_clip('clip', CENTRE).arrays()
        report['clip'] = check(*clip)
        log('clip', report['clip'])

    tests, test_report = fit_test()
    report.update(test_report)
    for k, v in report.items():
        if isinstance(v, dict) and 'watertight' in v:
            assert v['watertight'] and v['unused_vertices'] == 0 and v['volume_mm3'] > 0, (k, v)

    # Measurements that matter on the A1.
    root_r = r_seal(THETA, 0)
    grams = lambda mm3: round(mm3 * 1.24e-3, 1)
    m = report['measurements_mm'] = dict(
        card=[round(float(s), 3) for s in np.ptp(outline, axis=0)],
        card_key_ring=[round(float(s), 3) for s in np.ptp(ring_outline, axis=0)],
        stock=STOCK, at_the_relief=round(STOCK + RELIEF, 2),
        relief=RELIEF, relief_shoulder_mm=round(SHOULDER, 3),
        seal_width=SEAL_WIDTH, seal_height=round(float(max(sf['base'].v.max(), H_FIELD + H_LETTER)), 3),
        seal_size=[round(float(np.ptp(outline_uv[:, 0])), 3), round(float(np.ptp(outline_uv[:, 1])), 3)],
        seal_outline_radius_min=round(float(edge.min()), 3),
        seal_cover_of_mouth_min=seal_cover(phi, edge),
        letter_size=[round(float(s), 3) for s in sf['letter_size']],
        seal_with_peg=round(float(np.ptp(LV[:, 2])), 2),
        pocket_depth=round(POCKET, 2), front_floor=round(STOCK - POCKET, 2), peg=STEM,
        nfc_tag_max_diameter=round(2 * R_RECESS - .4, 1), nfc_tag_max_thickness=TAG_DEPTH,
        seal_overhang_under_rim=[round(float(edge.min() - root_r.max()), 2), round(float(edge.max() - root_r.min()), 2)],
        card_grams=grams(report['card body']['volume_mm3']),
        seal_grams=grams(report['seal']['volume_mm3'] + (report['clip']['volume_mm3'] if clip else 0)),
    )
    if VARIANT == 'removable':
        m.update(ledge=LEDGE, groove=round(POCKET - LEDGE, 2), tab_thickness=round(STEM - TAB_TOP, 2),
                 tab_reach=round(R_TAB - R_BORE, 2), clearance_radial=CLEAR, lock_turn_deg=LOCK_DEG,
                 click_interference=round(LEDGE + DETENT - TAB_TOP, 3))
    elif VARIANT == 'press':
        m.update(rim=LIP, rim_hole=2 * R_LIP, cavity=round(POCKET - LIP, 2), cavity_width=2 * R_CAVITY,
                 clip_height=round(clip_height(), 2), clip_catch=report['fit']['clip_catch'],
                 clip_axial_play=report['fit']['clip_play_axial'])
    else:
        m.update(ledge=LEDGE, groove=round(POCKET - LEDGE, 2), tab_thickness=round(STEM - TAB_TOP, 2),
                 tab_reach=round(R_TAB - R_BORE, 2), clearance_radial=CLEAR, lock_turn_deg=LOCK_DEG,
                 spring_bend=report['fit']['spring_bend_max'], tooth_catch=report['fit']['tooth_catch'])
    log(m)

    # Print orientation: the cards as built (back on the plate), the seal face
    # up, the clip as it sits (its holding face on the plate).
    lid_p = lid_print(LV, CENTRE)
    write_stl(OUT / 'card-body.stl', BV, BF)
    write_stl(OUT / 'card-body-key-ring.stl', RV, RF)
    write_stl(OUT / 'seal.stl', lid_p, LF)
    with_seal = [('seal', lid_p, LF, (160, 118))]
    if clip:
        write_stl(OUT / 'clip.stl', clip[0] - clip[0].min(0), clip[1])
        with_seal.append(('clip', clip[0], clip[1], (161.5, 92)))
    for name, V, F, _ in tests:
        write_stl(OUT / f"{name.replace(' ', '-')}.stl", V, F)
    # One of each, as the page draws them: the card's object is "card body" in both.
    write_3mf(OUT / f'{FILE}.3mf', [('card body', BV, BF, (70, 85))] + with_seal)
    write_3mf(OUT / f'{FILE}-keyring.3mf', [('card body', RV, RF, (70, 82))] + with_seal)

    # The A1 plates, one colour each, printed in turn: eight cards; as many
    # seals as fit; three key ring cards; the fit test. tools/slice-a1.py
    # slices each for the A1 into the .gcode.3mf the page offers.
    size = lambda V: tuple(float(s) for s in np.ptp(V, axis=0)[:2])
    span = lambda parts: [np.ptp(V, axis=0) for _, V, _ in parts]
    seal_parts = [('seal', lid_p, LF)] + ([('clip', clip[0], clip[1])] if clip else [])
    plates = {
        'cards': ([('card body', BV, BF)], plate_items((0, size(BV)))),
        'seals': (seal_parts, seal_plate_items((0, size(lid_p)), (1, size(clip[0])) if clip else None)),
        'keyrings': ([('card body, key ring', RV, RF)], row_items((0, size(RV)), 3)),
    }
    counts = {}
    for key, (parts, items) in plates.items():
        plate_check(items, span(parts), round_parts=(0,) if key == 'seals' and not clip else ())
        write_3mf(OUT / f'a1-{key}{SUFFIX}.3mf', parts, items)
        counts[key] = sum(1 for item in items if item[0] == 0)
    write_3mf(OUT / f'fit-test{SUFFIX}.3mf', tests)
    report['plates'] = counts
    (OUT / 'checks.json').write_text(json.dumps(report, indent=2))
    # The plates as laid out (each part's outline from above, and where each copy
    # goes), to draw them (and check them by eye) outside Blender.
    seal_xy = lid_p[:, :2] - lid_p[:, :2].min(0)
    ang = np.arctan2(*(seal_xy - seal_xy.mean(0)).T[::-1])
    reach = np.hypot(*(seal_xy - seal_xy.mean(0)).T)
    bins = np.digitize(ang, np.linspace(-np.pi, np.pi, 361))
    seal_rim = np.array([seal_xy[bins == k][np.argmax(reach[bins == k])] for k in np.unique(bins)])
    flat = lambda loop: (loop - loop.min(0)).round(3).tolist()
    shapes = {'cards': [flat(outline)], 'seals': [seal_rim.round(3).tolist()] + ([flat(circle(CLIP_LAYERS[0][1]))] if clip else []),
              'keyrings': [flat(ring_outline)]}
    (OUT / 'plates.json').write_text(json.dumps(dict(bed=BED, head_wrap=HEAD_WRAP, **{
        key: dict(items=items, sizes=[[float(x) for x in v[:2]] for v in span(parts)], shapes=shapes[key])
        for key, (parts, items) in plates.items()})))

    # For the page: one file per card (the page draws each), and the
    # downloads: the four plates, sliced for the A1 (tools/slice-a1.py), and
    # the print notes (in Indonesian).
    singles = {'': (BV, outline), '-keyring': (RV, ring_outline)}
    downloads = [
        dict(label=f'a1 plate, {counts["cards"]} cards', href=f'/downloads/3dprint/a1-cards{SUFFIX}.gcode.3mf', kind='3mf'),
        dict(label=f'a1 plate, {counts["seals"]} seals', href=f'/downloads/3dprint/a1-seals{SUFFIX}.gcode.3mf', kind='3mf'),
        dict(label=f'a1 plate, {counts["keyrings"]} key ring cards', href=f'/downloads/3dprint/a1-keyrings{SUFFIX}.gcode.3mf', kind='3mf'),
        dict(label='fit test, print first', href=f'/downloads/3dprint/fit-test{SUFFIX}.gcode.3mf', kind='3mf'),
        dict(label='print notes', href=f'/downloads/3dprint/print-notes{SUFFIX}.txt', kind='txt'),
    ]
    for tail, (card_v, loop) in singles.items():
        (OUT / f'card-3d{SUFFIX}{tail}.json').write_text(json.dumps(dict(
            variant=VARIANT, card='key ring' if tail else 'card', file=f'/downloads/3dprint/{FILE}{tail}.3mf',
            objects={k: [[round(float(x), 6) for x in row] for row in v]
                     for k, v in placement(card_v, lid_p, LV, clip[0] if clip else None).items()},
            card_mm=[round(float(s), 3) for s in np.ptp(loop, axis=0)], centre_mm=[round(float(c), 4) for c in CENTRE],
            # The card's middle (its box's, the tab and all): the seal's pocket may be below it.
            middle_mm=[round(float(c), 4) for c in (loop.min(0) + loop.max(0)) / 2],
            stock_mm=STOCK, relief_mm=RELIEF, unlock_deg=0 if VARIANT == 'press' else LOCK_DEG, peg_mm=STEM,
            seal_mm=SEAL_WIDTH,
            # Across, up and down, and its height with the peg, for the page's dimensions.
            seal_size_mm=[m['seal_size'][0], m['seal_size'][1], round(float(np.ptp(LV[:, 2])), 3)],
            downloads=downloads), indent=2) + '\n')
    (OUT / f'print-notes{SUFFIX}.txt').write_text(notes(m, counts))
    if VARIANT in PUBLISHED:
        DOWNLOADS.mkdir(parents=True, exist_ok=True)
        WEB.mkdir(parents=True, exist_ok=True)
        for tail in singles:
            (WEB / f'card-3d{SUFFIX}{tail}.json').write_bytes((OUT / f'card-3d{SUFFIX}{tail}.json').read_bytes())
            # Only for the page to draw: the card (or key ring card) with its seal.
            (DOWNLOADS / f'{FILE}{tail}.3mf').write_bytes((OUT / f'{FILE}{tail}.3mf').read_bytes())
        (DOWNLOADS / f'print-notes{SUFFIX}.txt').write_bytes((OUT / f'print-notes{SUFFIX}.txt').read_bytes())
    log('wrote', OUT, counts)

    fitted = [('card body', BV, BF, 'paper'), ('seal', LV, LF, 'wax')]
    if clip:
        fitted.append(('clip', clip[0], clip[1], 'wax'))
    scene(fitted, tests)


# —— Blender scene and renders ——

def to_object(name, V, F, material, collection):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(V))
    me.vertices.foreach_set('co', V.astype(np.float32).ravel())
    me.loops.add(len(F) * 3)
    me.loops.foreach_set('vertex_index', F.astype(np.int32).ravel())
    me.polygons.add(len(F))
    me.polygons.foreach_set('loop_start', np.arange(0, 3 * len(F), 3, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate()
    mark_sharp(me)
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


def mark_sharp(me):
    """Smooth relief, crisp where faces meet at a corner (the cut edge, the thread)."""
    me.shade_smooth()
    n = len(me.polygons)
    nrm = np.empty(n * 3)
    me.polygons.foreach_get('normal', nrm)
    nrm = nrm.reshape(-1, 3)
    corners = np.empty(n, np.int32)
    me.polygons.foreach_get('loop_total', corners)
    le = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('edge_index', le)
    o = np.argsort(le, kind='stable')
    faces_of = np.repeat(np.arange(n), corners)[o]
    a, b = faces_of[0::2], faces_of[1::2]
    sharp = np.zeros(len(me.edges), bool)
    sharp[le[o][0::2]] = (nrm[a] * nrm[b]).sum(1) < math.cos(math.radians(35))
    if 'sharp_edge' in me.attributes:
        me.attributes.remove(me.attributes['sharp_edge'])
    me.attributes.new('sharp_edge', 'BOOLEAN', 'EDGE').data.foreach_set('value', sharp)


def material(name, colour, rough, coat=0.):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*colour, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = coat
    m.diffuse_color = (*colour, 1)
    return m


def spin(ob, angle, centre):
    """Turn an object about the pocket's axis (card frame)."""
    from mathutils import Matrix
    T = Matrix.Translation((*centre, 0))
    ob.matrix_world = T @ Matrix.Rotation(angle, 4, 'Z') @ T.inverted() @ ob.matrix_world


def scene(fitted, tests):
    """fitted: [(name, V, F, 'paper' | 'wax')], in the card frame, in place;
    tests: the fit test's parts as printed."""
    from mathutils import Matrix
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    sc = bpy.context.scene
    sc.unit_settings.system, sc.unit_settings.scale_length, sc.unit_settings.length_unit = 'METRIC', .001, 'MILLIMETERS'
    mats = {'paper': material('Paper • PLA white', (.82, .82, .80), .55),
            'wax': material('Wax • PLA red', (.50, .02, .03), .35, .2)}
    col = bpy.data.collections.new('Card, seal in place')
    sc.collection.children.link(col)
    obs = {name: to_object(name, V, F, mats[kind], col) for name, V, F, kind in fitted}
    test = bpy.data.collections.new('Fit test, as printed')
    sc.collection.children.link(test)
    for name, V, F, (tx, ty) in tests:
        to_object(name, V - V.min(0) + [tx, ty - 200, 0], F, mats['wax' if 'coin' not in name else 'paper'], test)
    test.hide_render = True

    world = bpy.data.worlds.new('Studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.92, .92, .92, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
    sc.world = world
    sun = bpy.data.objects.new('Lamp', bpy.data.lights.new('Lamp', 'SUN'))
    sun.data.energy, sun.data.angle = 3.2, math.radians(6)
    sc.collection.objects.link(sun)

    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = 1400
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cx, cy = CENTRE

    def shot(name, loc, rot, ortho=None, lamp=(50, 0, 135), size=(1400, 1400)):
        sc.render.resolution_x, sc.render.resolution_y = size
        cam.location = loc
        if isinstance(rot, Vector):
            cam.rotation_euler = (rot - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        else:
            cam.rotation_euler = [math.radians(a) for a in rot]
        cam.data.type = 'ORTHO' if ortho else 'PERSP'
        if ortho:
            cam.data.ortho_scale = ortho
        else:
            cam.data.lens = 70
        cam.data.clip_start, cam.data.clip_end = 1, 2000
        sun.rotation_euler = [math.radians(a) for a in lamp]
        sc.render.filepath = str(OUT / f'render-{name}.png')
        bpy.ops.render.render(write_still=True)
        log('rendered', name)

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{FILE}.blend'))
    if not RENDER:
        return
    card, lid, clip = obs['card body'], obs['seal'], obs.get('clip')
    shot('front', (cx, cy, 200), (0, 0, 0), ortho=92, lamp=(55, 0, 135))
    shot('back', (cx, cy, -200), (0, 180, 0), ortho=92, lamp=(125, 0, 45))
    # Exploded, from below the back: the seal (turned back) and the clip lifted out.
    held = {ob: ob.matrix_world.copy() for ob in obs.values()}
    if VARIANT != 'press':
        spin(lid, -math.radians(LOCK_DEG), CENTRE)
    lid.matrix_world = Matrix.Translation((0, 0, -12)) @ lid.matrix_world
    if clip:
        clip.matrix_world = Matrix.Translation((0, 0, -6)) @ clip.matrix_world
    shot('exploded', (cx + 34, cy - 72, -17), Vector((cx, cy, -5)), lamp=(120, 10, 70))
    for ob, mw in held.items():
        ob.matrix_world = mw
    # The pocket from the back, the seal (and clip) away.
    for ob in (lid, clip):
        if ob:
            ob.hide_render = True
    shot('pocket', (cx, cy, -60), (0, 180, 0), ortho=26, lamp=(130, 0, 40))
    for ob in (lid, clip):
        if ob:
            ob.hide_render = False
    # Cut through the seal and the card along the pocket's axis.
    # The cut faces show as flat colour: what you see through the cut is the
    # inside of the far half, drawn as its section colour.
    for mat, colour in ((mats['paper'], (.30, .30, .30)), (mats['wax'], (.20, .01, .015))):
        nt = mat.node_tree
        mix, emit = nt.nodes.new('ShaderNodeMixShader'), nt.nodes.new('ShaderNodeEmission')
        emit.inputs['Color'].default_value = (*colour, 1)
        out = nt.nodes['Material Output']
        nt.links.new(nt.nodes.new('ShaderNodeNewGeometry').outputs['Backfacing'], mix.inputs[0])
        nt.links.new(nt.nodes['Principled BSDF'].outputs[0], mix.inputs[1])
        nt.links.new(emit.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
    for ob in obs.values():
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.transform(ob.matrix_world)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(cx, cy, 0), plane_no=(1, 0, 0), clear_outer=True)
        bm.transform(ob.matrix_world.inverted())
        bm.to_mesh(ob.data)
        bm.free()
    # Looking at the cut face (through the top tab or the key), the seal on top.
    shot('section', (cx + 60, cy, .2), (-90, 0, -90), ortho=24, lamp=(-60, 0, 70), size=(1600, 480))


main()
