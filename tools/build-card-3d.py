"""The card from card.pambudi.xyz as a 3D print, with a wax seal that locks
on with a push and a turn (a bayonet) and carries the NFC tag. Sized for a
Bambu Lab A1 (0.4 mm nozzle).

Run with:
    /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python tools/build-card-3d.py [-- --no-render]

Writes ../output/card-3d-print/ (beside the site checkout):
    pambudi-card-3d.3mf        card + seal on one A1 plate, print-ready (mm)
    fit-test.3mf               a coin of the card's pocket + a plug: print first
    card-body.stl, seal.stl, fit-test-coin.stl, fit-test-plug.stl
    pambudi-card-3d.blend      the card with the seal locked on
    render-*.png               front, back, exploded, cut through the seal
    checks.json                watertightness, the fit, and the measurements below
and, for pambudi.xyz/3dprint (print.html, src/print/):
    public/downloads/3dprint/          the two 3MF plates and the print notes; the
                                       page draws pambudi-card-3d.3mf itself
    public/assets/print/card-3d.json   where each part of that file sits on the
                                       card, and how the seal comes off

Same as the page, 1:1 in millimetres:
  - outline: tools/card-sources/card-cut.svg (67.75 × 85 mm);
  - relief: tools/card-sources/emboss-pattern.svg, centred in the cut as
    tools/card_geometry.py places it, soft as the paper's (src/paper's relief
    is the die blurred by 2.5 px of the paper image, 0.16 mm here), the blur
    worked out at 0.02 mm: raised on the front, pressed the same into the
    back;
  - no type or print: just the paper.
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

OUT = ROOT.parent / 'output' / 'card-3d-print'
WEB = ROOT / 'public' / 'assets' / 'print'
DOWNLOADS = ROOT / 'public' / 'downloads' / '3dprint'
FONT = ROOT / 'tools' / 'fonts' / 'PirataOne-Regular.ttf'
# The round P seal's blank wax (as tools/build-round-seal.py on main reads it).
ROUND_SEAL = ROOT.parent / 'output' / 'wax-seal-circle-v1' / 'wax-seal-circle.png'

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDER = '--no-render' not in ARGS

# —— The card ——
STOCK = 1.4                 # mm, flat areas
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

def drop_holes(verts, tris, holes):
    """Without the triangles inside each hole (a star round its own middle)."""
    c = verts[tris].mean(axis=1)
    for lp in holes:
        ctr = lp.mean(axis=0)
        d = c - ctr
        ang = np.arctan2(d[:, 1], d[:, 0])
        la = np.arctan2(lp[:, 1] - ctr[1], lp[:, 0] - ctr[0])
        lr = np.hypot(lp[:, 0] - ctr[0], lp[:, 1] - ctr[1])
        o = np.argsort(la)
        keep = np.hypot(d[:, 0], d[:, 1]) > np.interp(ang, la[o], lr[o], period=2 * np.pi)
        tris, c = tris[keep], c[keep]
    return tris


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


def r_pocket(theta, d):
    a = from_tabs(theta)
    notch = (np.abs(a + LOCK_DEG) < NOTCH_HALF).any(0)
    stop = ((a >= STOP[0]) & (a <= STOP[1])).any(0)
    bump = (DETENT * np.clip(1 - np.abs(a - BUMP_AT) / BUMP_HALF, 0, 1)).max(0)
    r = np.where((d < LEDGE + bump - 1e-9) & ~notch, R_BORE, R_GROOVE)
    return np.where(stop, R_BORE, r)


def r_seal(theta, d):
    """The seal locked: d is the depth from the card's back."""
    tab = (np.abs(from_tabs(theta)) < TAB_HALF).any(0) & (d >= TAB_TOP - 1e-9)
    return np.where(tab, R_TAB, R_PEG)


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


def staggered_grid(outline, step):
    """An even, staggered grid of points inside `outline`."""
    x0, y0 = outline.min(0)
    x1, y1 = outline.max(0)
    xs = np.arange(x0 + step / 2, x1, step)
    ys = np.arange(y0 + step / 2, y1, step * np.sqrt(3) / 2)
    X, Y = np.meshgrid(xs, ys)
    X[1::2] += step / 2
    grid = np.column_stack([X.ravel(), Y.ravel()])
    inside = fill(segments([outline]), (x0, y0), (len(xs) * 4, int((y1 - y0) / step * 4) + 4), 4 / step)
    i = np.clip(((grid[:, 1] - y0) * 4 / step).astype(int), 0, inside.shape[0] - 1)
    j = np.clip(((grid[:, 0] - x0) * 4 / step).astype(int), 0, inside.shape[1] - 1)
    return clear_of([outline], grid[inside[i, j]], step / 3)


def refined(outline, height, seeds, tol=REFINE_TOL, shortest=REFINE_MIN, rounds=14):
    """Points inside `outline` for a mesh of `height`: from `seeds`, each
    round splits every edge (and triangle) whose flat face misses the height
    halfway along by more than `tol`, and triangulates afresh (Delaunay), so
    triangles crowd only where the relief curves and are always well shaped."""
    pts = np.asarray(seeds, float)
    for k in range(rounds):
        v2, tris, (ring,) = triangulate([outline], pts)
        z = height(v2[:, 0], v2[:, 1])
        e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
        e = np.unique(np.sort(e, axis=1), axis=0)
        # Never on the outline itself: a point there would split its edge from the wall's.
        on = np.zeros(len(v2), bool)
        on[ring] = True
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


def build_body(name, outline, relief=None):
    """A slab inside `outline` (CCW, card frame), its front at STOCK and its
    back at 0, both moved out by the `relief`'s height where it has one
    (raised on the front, pressed into the back: the paper's way), meshed to
    the A1 (`refined`); and the bayonet's pocket at CENTRE."""
    mesh = Mesh(name)
    height = relief['height'] if relief else (lambda x, y: np.zeros(np.shape(x)))
    pts = staggered_grid(outline, FLAT_STEP)
    if relief:
        pts = refined(outline, height, pts)
    v2, tris, (front_ring,) = triangulate([outline], pts)
    front = mesh.surface(v2, tris, STOCK + height(v2[:, 0], v2[:, 1]), up=True)

    r0 = r_pocket(THETA, 0)
    mouth = np.column_stack([CENTRE[0] + r0 * np.cos(THETA), CENTRE[1] + r0 * np.sin(THETA)])
    clear = np.hypot(*(pts - CENTRE).T) > R_GROOVE + FLAT_CLEAR
    v2, tris, (back_ring, mouth_ring) = triangulate([outline, mouth], pts[clear])
    zb = height(v2[:, 0], v2[:, 1])
    assert np.abs(zb[mouth_ring]).max() < 1e-9, 'relief reaches the pocket'
    back = mesh.surface(v2, tris, zb, up=False)
    mesh.wall(back[back_ring], front[front_ring])

    rings = [back[mouth_ring]]
    for d in depths(POCKET)[1:]:
        rr = r_pocket(THETA, d)
        rings.append(mesh.verts(np.column_stack([CENTRE[0] + rr * np.cos(THETA),
                                                 CENTRE[1] + rr * np.sin(THETA), np.full(THETA_STEPS, d)])))
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

    # The underside: points on circles, so the easing off has vertices to follow.
    rings_uv = [np.column_stack([r * np.cos(t), r * np.sin(t)])
                for r in np.arange(R_PEG + .1, half, .1)
                for t in [np.linspace(0, 2 * np.pi, max(24, int(2 * np.pi * r / .1)), endpoint=False)]]
    under_uv = np.vstack(rings_uv)
    under_uv = under_uv[inside_uv(under_uv)]
    root = circle(R_PEG, centre)
    v2, tris, (under_ring, root_ring) = triangulate([outline, root], to_card_frame(under_uv) + centre)
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


def write_3mf(path, parts):
    """parts: [(name, V, F, (tx, ty))], each already in print orientation."""
    objects, items = [], []
    for i, (name, V, F, (tx, ty)) in enumerate(parts, 1):
        V = V - [V[:, 0].min(), V[:, 1].min(), V[:, 2].min()]
        vs = '\n'.join(f'<vertex x="{x:.4f}" y="{y:.4f}" z="{z:.4f}"/>' for x, y, z in V.tolist())
        ts = '\n'.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in F.tolist())
        objects.append(f'<object id="{i}" name="{name}" type="model"><mesh><vertices>\n{vs}\n'
                       f'</vertices><triangles>\n{ts}\n</triangles></mesh></object>')
        items.append(f'<item objectid="{i}" transform="1 0 0 0 1 0 0 0 1 {tx:.3f} {ty:.3f} 0"/>')
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


def placement(card_print, lid_print_v, lid_card):
    """For the page: each part's own coordinates in the 3MF (write_3mf moves
    each to its corner) back to the card frame, the seal locked on. Row-major 4 × 4."""
    m = card_print.min(0)
    card = [[1, 0, 0, m[0]], [0, 1, 0, m[1]], [0, 0, 1, m[2]], [0, 0, 0, 1]]
    n = lid_print_v.min(0)
    lift = (-lid_card[:, 2]).min()          # lid_print set the peg's end on the plate
    seal = [[-1, 0, 0, CENTRE[0] - n[0]], [0, 1, 0, n[1] + CENTRE[1]], [0, 0, -1, -(n[2] + lift)], [0, 0, 0, 1]]
    local = lid_print_v - n
    back = np.column_stack([local, np.ones(len(local))]) @ np.array(seal).T
    assert np.allclose(back[:, :3], lid_card, atol=1e-6), 'the seal would not land on the card'
    return {'card body': card, 'seal': seal}


# —— Build ——

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}

    report['fit'] = fit_check()
    log('fit', report['fit'])

    outline, relief = card_fields()
    body = build_body('card body', outline, relief)
    BV, BF = body.arrays()
    report['card body'] = check(BV, BF)
    log('card body', report['card body'])

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

    # The fit test: a coin of the card's middle and a plug with a flat face.
    # Locked, their notches meet.
    coin_r = lambda t: 11 - np.clip(1 - np.abs(np.angle(np.exp(1j * (t - np.pi / 2)))) / .07, 0, 1)
    tt = 2 * np.pi * np.arange(1600) / 1600
    coin = ccw(np.column_stack([CENTRE[0] + coin_r(tt) * np.cos(tt), CENTRE[1] + coin_r(tt) * np.sin(tt)]))
    test_coin = build_body('fit test coin', coin)
    plug_r = lambda t: 9.5 - np.clip(1 - np.abs(np.angle(np.exp(1j * (t - np.pi / 2)))) / .07, 0, 1)
    plug_uv = np.column_stack([plug_r(tt) * np.cos(tt), plug_r(tt) * np.sin(tt)])
    plug_h = lambda u, v: np.full(np.shape(u), 1.5)
    plug_in = lambda p: np.hypot(p[:, 0], p[:, 1]) < plug_r(np.arctan2(p[:, 1], p[:, 0])) - .03
    test_plug = build_seal('fit test plug', plug_uv, plug_h, plug_in, CENTRE, refine=False)
    CV, CF = test_coin.arrays()
    PV, PF = test_plug.arrays()
    report['fit test coin'], report['fit test plug'] = check(CV, CF), check(PV, PF)

    for k, v in report.items():
        if k == 'fit':
            continue
        assert v['watertight'] and v['unused_vertices'] == 0 and v['volume_mm3'] > 0, (k, v)

    # Measurements that matter on the A1.
    report['measurements_mm'] = dict(
        card=[round(CARD_W, 3), round(CARD_H, 3)], stock=STOCK, at_the_relief=round(STOCK + RELIEF, 2),
        relief=RELIEF, relief_shoulder_mm=round(SHOULDER, 3),
        seal_width=SEAL_WIDTH, seal_height=round(float(max(sf['base'].v.max(), H_FIELD + H_LETTER)), 3),
        seal_size=[round(float(np.ptp(outline_uv[:, 0])), 3), round(float(np.ptp(outline_uv[:, 1])), 3)],
        seal_outline_radius_min=round(float(edge.min()), 3),
        seal_overlap_on_card_min=round(float(edge.min() - R_GROOVE), 3),
        letter_size=[round(float(s), 3) for s in sf['letter_size']],
        pocket_depth=POCKET, pocket_floor=FLOOR, ledge=LEDGE, groove=round(POCKET - LEDGE, 2),
        peg=STEM, tab_thickness=round(STEM - TAB_TOP, 2), tab_reach=round(R_TAB - R_BORE, 2),
        clearance_radial=CLEAR, lock_turn_deg=LOCK_DEG, click_interference=round(LEDGE + DETENT - TAB_TOP, 3),
        nfc_tag_max_diameter=round(2 * R_RECESS - .4, 1), nfc_tag_max_thickness=TAG_DEPTH,
        seal_overhang_under_rim=[round(float(edge.min() - R_PEG), 2), round(float(edge.max() - R_PEG), 2)],
    )
    log(report['measurements_mm'])

    card_print = BV
    lid_p = lid_print(LV, CENTRE)
    coin_p = CV
    plug_p = lid_print(PV, CENTRE)
    write_stl(OUT / 'card-body.stl', card_print, BF)
    write_stl(OUT / 'seal.stl', lid_p, LF)
    write_stl(OUT / 'fit-test-coin.stl', coin_p, CF)
    write_stl(OUT / 'fit-test-plug.stl', plug_p, PF)
    write_3mf(OUT / 'pambudi-card-3d.3mf', [('card body', card_print, BF, (70, 85)),
                                            ('seal', lid_p, LF, (160, 118))])
    write_3mf(OUT / 'fit-test.3mf', [('fit test coin', coin_p, CF, (95, 117)),
                                     ('fit test plug', plug_p, PF, (140, 117))])
    (OUT / 'checks.json').write_text(json.dumps(report, indent=2))
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    m = report['measurements_mm']
    (WEB / 'card-3d.json').write_text(json.dumps(dict(
        file='/downloads/3dprint/pambudi-card-3d.3mf',
        objects={k: [[round(float(x), 6) for x in row] for row in v] for k, v in placement(card_print, lid_p, LV).items()},
        card_mm=[round(CARD_W, 3), round(CARD_H, 3)], centre_mm=[round(float(c), 4) for c in CENTRE],
        stock_mm=STOCK, relief_mm=RELIEF, unlock_deg=LOCK_DEG, peg_mm=STEM, seal_mm=SEAL_WIDTH,
        # Across, up and down, and its height with the peg, for the page's dimensions.
        seal_size_mm=[m['seal_size'][0], m['seal_size'][1], round(float(np.ptp(LV[:, 2])), 3)]),
        indent=2) + '\n')
    (OUT / 'print-notes.txt').write_text(f'''IVAN PAMBUDI CARD - 3D PRINT (Bambu Lab A1, 0.4 mm nozzle)

1. Print fit-test.3mf first (a few minutes). Put the plug's tabs into the
   coin's notches, push, and turn it clockwise: it should click and stop
   with its marker at the coin's marker. Too stiff or too loose: change
   CLEAR (now {CLEAR} mm) or DETENT (now {DETENT} mm) in tools/build-card-3d.py
   and rebuild.
2. Print pambudi-card-3d.3mf: the card front up, the seal face up, as placed.
   PLA, supports off, 0.08 mm layers (0.08mm Extra Fine) for the crispest
   relief and the cleanest front over the pocket, 0.12 mm also fine. Card in
   white, seal in red (separate prints, or one plate with a filament each).
3. NFC: a round sticker tag up to {m['nfc_tag_max_diameter']} mm wide and {TAG_DEPTH} mm thick
   (e.g. NTAG213, 12 mm). Stick it in the recess in the end of the seal's peg.
4. On: tabs into the notches, push, turn clockwise about {LOCK_DEG:.0f} degrees
   until it clicks and stops; the P stands upright.
   Off: turn it back anticlockwise past the click and lift.

Card     {m['card'][0]} x {m['card'][1]} mm, the cut of card.pambudi.xyz; {STOCK} mm thick
         ({m['at_the_relief']} mm at the relief, raised {RELIEF} mm on the front, pressed into the back)
Pocket   {POCKET} mm deep, {FLOOR} mm floor on the front: a {LEDGE} mm ledge with three
         notches, a {m['groove']} mm groove beneath it
Seal     {SEAL_WIDTH} mm wide, {m['seal_height']} mm tall; a {STEM} mm peg with three
         {m['tab_thickness']} mm tabs, {CLEAR} mm clearance; the tag's recess in its end
What the A1 shows: the pocket's top (the front's inside) bridges 15.7 mm;
the seal's rim overhangs its peg by {m['seal_overhang_under_rim'][0]}-{m['seal_overhang_under_rim'][1]} mm underneath, and its
underside eases off {RIM_RELIEF} mm towards the rim so a slight sag there can't lift it.
''')
    for name in ('pambudi-card-3d.3mf', 'fit-test.3mf', 'print-notes.txt'):
        (DOWNLOADS / name).write_bytes((OUT / name).read_bytes())
    log('wrote', OUT)

    scene(BV, BF, LV, LF, CV, CF, PV, PF)


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


def scene(BV, BF, LV, LF, CV, CF, PV, PF):
    from mathutils import Matrix
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    sc = bpy.context.scene
    sc.unit_settings.system, sc.unit_settings.scale_length, sc.unit_settings.length_unit = 'METRIC', .001, 'MILLIMETERS'
    paper = material('Paper • PLA white', (.82, .82, .80), .55)
    wax = material('Wax • PLA red', (.50, .02, .03), .35, .2)
    col = bpy.data.collections.new('Card, seal locked on')
    sc.collection.children.link(col)
    card = to_object('card body', BV, BF, paper, col)
    lid = to_object('seal', LV, LF, wax, col)
    test = bpy.data.collections.new('Fit test')
    sc.collection.children.link(test)
    to_object('fit test coin', CV + [90, 0, 0], CF, paper, test)
    to_object('fit test plug', PV + [90, 0, 0], PF, wax, test)
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

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'pambudi-card-3d.blend'))
    if not RENDER:
        return
    shot('front', (cx, cy, 200), (0, 0, 0), ortho=92, lamp=(55, 0, 135))
    shot('back', (cx, cy, -200), (0, 180, 0), ortho=92, lamp=(125, 0, 45))
    # Exploded, from below the back: the seal turned back and lifted out.
    locked = lid.matrix_world.copy()
    spin(lid, -math.radians(LOCK_DEG), CENTRE)
    lid.matrix_world = Matrix.Translation((0, 0, -12)) @ lid.matrix_world
    shot('exploded', (cx + 34, cy - 72, -17), Vector((cx, cy, -5)), lamp=(120, 10, 70))
    lid.matrix_world = locked
    # Cut through the seal and the card along the pocket's axis.
    # The cut faces show as flat colour: what you see through the cut is the
    # inside of the far half, drawn as its section colour.
    for ob, colour in ((card, (.30, .30, .30)), (lid, (.20, .01, .015))):
        m = ob.data.materials[0]
        nt = m.node_tree
        mix, emit = nt.nodes.new('ShaderNodeMixShader'), nt.nodes.new('ShaderNodeEmission')
        emit.inputs['Color'].default_value = (*colour, 1)
        out = nt.nodes['Material Output']
        nt.links.new(nt.nodes.new('ShaderNodeNewGeometry').outputs['Backfacing'], mix.inputs[0])
        nt.links.new(nt.nodes['Principled BSDF'].outputs[0], mix.inputs[1])
        nt.links.new(emit.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.transform(ob.matrix_world)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(cx, cy, 0), plane_no=(1, 0, 0), clear_outer=True)
        bm.transform(ob.matrix_world.inverted())
        bm.to_mesh(ob.data)
        bm.free()
    # Looking at the cut face (through the top tab), the seal on top.
    shot('section', (cx + 60, cy, .2), (-90, 0, -90), ortho=24, lamp=(-60, 0, 70), size=(1600, 480))


main()
