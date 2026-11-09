"""Builds the round wax seal's textures: python3 tools/build-round-seal.py

The round seal is the favicon's seal with its monogram cut afresh: a P in
Pirata One, raised from the field as a stamp leaves it. The blank round seal
image owns the silhouette and the wax colour; its depth is a reconstruction,
as for the wax button (tools/build-wax-seal.py), not a measured scan.

Writes three masters to tools/source-images/ for src/wax/wax-gl.mjs, which
tools/optimize-images.py encodes:
  round-seal-albedo.png   wax colour without baked light; alpha is the
                          outline's signed distance
  round-seal-relief.png   R,G normal (y up), B height / peak, A cavity
  round-seal-letters.png  the P: R its raised profile, G its contact shade
The still photograph (round-seal.png) is a frame of the relit seal, taken
from the page once these exist (see the README note at the end).
"""
import sys
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/source-images'
# The blank round seal (generated with the button's material, no lettering).
REFERENCE = ROOT.parent / 'output/wax-seal-circle-v1/wax-seal-circle.png'
FONT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tools/fonts/PirataOne-Regular.ttf'

image = Image.open(REFERENCE).convert('RGBA')
W, H = image.size
rgba = np.asarray(image, dtype=np.float32) / 255
alpha = rgba[:, :, 3]
mask = alpha > .08
solid = alpha > .35
tone = rgba[:, :, :3] @ np.array([.6, .25, .15], dtype=np.float32)

def box(a, r):
    out = a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]; pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(out, pad, mode='edge'), axis=axis)
        n = out.shape[axis]
        out = (np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, range(0, n), axis=axis)) / (2 * r + 1)
    return out

def blur(a, r):
    for _ in range(3): a = box(a, r)
    return a

def masked_blur(a, weight, r):
    return blur(a * weight, r) / np.maximum(blur(weight, r), 1e-4)

def edt(inside):
    """Exact Euclidean distance from each pixel to the nearest pixel outside
    `inside` (zero outside it), by the separable lower-envelope method."""
    INF = 1e12
    def line(f):
        n = len(f); d = np.empty(n); v = [0]; z = [-INF, INF]
        for q in range(1, n):
            while True:
                p = v[-1]
                s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * (q - p))
                if s <= z[-2]:
                    v.pop(); z.pop()
                    if v: continue
                    v.append(q); z[-1:] = [-INF, INF]; break
                v.append(q); z[-1] = s; z.append(INF); break
        k = 0
        for q in range(n):
            while z[k + 1] < q: k += 1
            d[q] = (q - v[k]) ** 2 + f[v[k]]
        return d
    f = np.where(inside, INF, 0.)
    f = np.array([line(row) for row in f])
    f = np.array([line(col) for col in f.T]).T
    return np.sqrt(f)

# Distance inside the outline, in source pixels, and outside it.
outer = edt(mask)
outside = edt(~mask)

# The sunken field's rim, the thin inner ridge, fitted on the image: centre
# (632, 589) from the top left, semi-axes 429 × 400 px.
CX, CY, A, B = 632., 589., 429., 400.
X, Y = np.meshgrid(np.arange(W, dtype=np.float32) + .5, np.arange(H, dtype=np.float32) + .5)
u, v = (X - CX) / A, (Y - CY) / B
r = np.sqrt(u * u + v * v) + 1e-6
# Signed distance to the ridge in pixels: negative in the field, positive on the lip.
ridge = (r - 1) / (np.hypot(u / A, v / B) / r)
bump = lambda d, c, s: np.exp(-((d - c) / s) ** 2)

# The button's relief at this seal's scale: its lip is about 2.6 times wider
# in source pixels, so every height and blur is too.
K = 2.6
across = np.clip(ridge / np.maximum(ridge + outer, 1), 0, 1)
crest = np.sin(np.pi * np.clip((across - .12) / .88, 0, 1)) ** .7
lip = np.where(ridge > 0, K * (3.4 + 10.5 * crest), K * (3.4 - .8 * np.clip(-ridge / (40 * K), 0, 1)))
shape = lip + K * 2.2 * bump(ridge, 0, K * 2.2)
edge = 1 - np.exp(-outer / (2.6 * K))
clipped = np.minimum(tone, np.percentile(tone[solid], 90))
clipped = np.where(solid, clipped, np.median(tone[solid]))
on_lip = np.clip(ridge / (6 * K), 0, 1)
lumps = (blur(clipped, 5) - blur(clipped, 24)) * (.3 + 1.7 * on_lip)
grain = (clipped - blur(clipped, 2)) * .8 * K
height = blur(np.where(mask, shape * edge + 9 * K * lumps + grain, 0), 2) * mask
# Blender's rows run bottom to top; here row 0 is the top, so y up is -row.
dy, dx = np.gradient(height)
normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
cavity = np.clip(1 - np.maximum(blur(height, 12) - height, 0) * .18 / K, 0, 1)

# The field is darker wax than the lip, not shade: each keeps its own level
# while the light baked into it is mostly flattened.
field = ridge < -8 * K
level = np.where(field, np.median(tone[solid & field]), np.median(tone[solid & ~field]))
level = blur(level.astype(np.float32), 8)
local = masked_blur(tone, solid.astype(np.float32), 15)
shine = np.clip((tone - local) / .1 - .4, 0, 1) * solid
keep = (solid & (shine < .3)).astype(np.float32)
albedo = rgba[:, :, :3].copy()
filled = np.stack([masked_blur(albedo[:, :, c], keep, 10) for c in range(3)], axis=-1)
albedo = albedo * (1 - shine[..., None]) + filled * shine[..., None]
flat = albedo @ np.array([.6, .25, .15], dtype=np.float32)
albedo = np.clip(albedo * ((level + (flat - level) * .3) / np.maximum(flat, 1e-3))[..., None], 0, 1)

def save(pixels, name):
    Image.fromarray(np.round(np.clip(pixels, 0, 1) * 255).astype(np.uint8)).save(SOURCE / name)

peak = float(height.max())
# Alpha: the outline's signed distance, ±OUTLINE source pixels about 0.5.
OUTLINE = 128
save(np.dstack((albedo, np.clip(.5 + np.where(mask, outer, -outside) / (2 * OUTLINE), 0, 1))), 'round-seal-albedo.png')
save(np.dstack((normal[:, :, 0] * .5 + .5, normal[:, :, 1] * .5 + .5, height / peak, cavity)), 'round-seal-relief.png')

# The P in the field, its height 80% of the field's. Centred by its box it
# looks left of centre, so it sits NUDGE px right, where it looks centred.
SIZE = 2400
font = ImageFont.truetype(str(FONT), SIZE)
left, top, right, bottom = font.getbbox('P')
scale = 2 * B * .80 / (bottom - top)
font = ImageFont.truetype(str(FONT), round(SIZE * scale))
left, top, right, bottom = font.getbbox('P')
NUDGE = 24
# Pirata One has one weight; each stroke grows BOLD px a side to make it bolder.
BOLD = 7
glyph = Image.new('L', (W, H), 0)
ImageDraw.Draw(glyph).text((CX + NUDGE - (left + right) / 2, CY - (top + bottom) / 2), 'P', font=font, fill=255,
                          stroke_width=BOLD, stroke_fill=255)
coverage = np.asarray(glyph, dtype=np.float32) / 255
inside = coverage >= .5
# Signed distance into the letter, with the edge's coverage for subpixels.
signed = np.where(inside, edt(inside), -edt(~inside)) + (coverage - .5)
# The shader raises smoothstep(.06, .62, R): a rounded shoulder BEVEL px wide.
BEVEL = 26
profile = .06 + .56 * np.clip((signed + .5) / BEVEL, 0, 1)
shade = np.where(signed > 0, 1, np.exp(np.minimum(signed, 0) / 8)) * .22
save(np.dstack((profile, shade, np.zeros_like(shade), np.ones_like(shade))), 'round-seal-letters.png')

print('ROUND_SEAL', W, 'x', H, '; RELIEF_PEAK =', round(peak / H, 4), '; OUTLINE span =', round(2 * OUTLINE / H, 4),
      '; P', round(right - left), 'x', round(bottom - top), 'px')
