#!/usr/bin/env python3
"""Write the paper images, cut by the supplied die line.

  public/assets/card-front-paper.webp (+ -800w)   the card page's embossed front
  public/assets/card-back-paper.webp  (+ -800w)   the card page's debossed back
  tools/source-images/embossed-paper-frame.png     the homepage's front master
  tools/source-images/debossed-red-paper-frame.png the homepage's red back master
      (the homepage's paper keeps the render's proportions, 1122 × 1402, so
      its layout, welcome frame and text area stay where they are; run
      `python3 tools/optimize-images.py embossed-paper-frame
      debossed-red-paper-frame` after, for its WebP files)

Each is the paper as the page's WebGL draws it at rest (src/paper/paper-gl.mjs:
the same relief maps, paper colour, lamp, shading, relief shadows and grain),
on the squeezed image of tools/card_geometry.py, cut by the supplied card cut
(tools/card-sources/card-cut.svg). They are what shows before the WebGL fades
in over them, and stay without WebGL, so the two match; their alpha is the
cut the WebGL draws within.

Requires Pillow and numpy. Then rebuild the production files:

    python3 tools/build-card-paper.py && python3 tools/build-card-files.py
"""
import numpy as np
from PIL import Image, ImageDraw

import card_geometry as g

ASSETS = g.ROOT / 'public' / 'assets'
SUPERSAMPLE = 4

# src/paper/paper-gl.mjs
WHITE = np.array([232.7, 232.6, 232.0]) / 255
RED = np.array([186.7, 42.6, 46.3]) / 255
LIGHT = dict(rest=(-.22, -.42, 1.25), relief=1, contrast=.8, shadow=1, shadow_length=1.6)
FACES = {'front': 'paper-front-relief.webp', 'back': 'paper-back-relief.webp'}


def cut_alpha(canvas=g.CANVAS, squash=g.SQUASH):
    w, h = canvas
    s = SUPERSAMPLE
    mask = Image.new('L', (w * s, h * s), 0)
    draw = ImageDraw.Draw(mask)
    for subpath in g.CUT:
        draw.polygon([(x * s, y * s) for x, y in (g.to_canvas(p, squash) for p in g.flatten(subpath, 24))], fill=255)
    return mask.resize((w, h), Image.LANCZOS)


def sampler(relief):
    """Bilinear lookup of the relief's normals at canvas uv, as in the shader:
    flat outside the relief's box, y turned to the sheet's frame (down)."""
    rx, ry, rw, rh = g.relief_rect()
    tex = np.asarray(relief, dtype=np.float64) / 255 * 2 - 1
    th, tw = tex.shape[:2]

    def at(u, v):
        qx, qy = (u - rx) / rw, (v - ry) / rh
        inside = (qx >= 0) & (qx <= 1) & (qy >= 0) & (qy <= 1)
        fx, fy = np.clip(qx * tw - .5, 0, tw - 1), np.clip(qy * th - .5, 0, th - 1)
        x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
        x1, y1 = np.minimum(x0 + 1, tw - 1), np.minimum(y0 + 1, th - 1)
        ax, ay = (fx - x0)[..., None], (fy - y0)[..., None]
        n = (tex[y0, x0] * (1 - ax) + tex[y0, x1] * ax) * (1 - ay) + (tex[y1, x0] * (1 - ax) + tex[y1, x1] * ax) * ay
        n[..., 1] = -n[..., 1]
        n[..., :2] *= LIGHT['relief']
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        flat = np.zeros_like(n)
        flat[..., 2] = 1
        return np.where(inside[..., None], n, flat), (th, tw)
    return at


def fract(x):
    return x - np.floor(x)


def hash2(px, py):
    px, py = fract(px * .1031), fract(py * .1030)
    d = px * (py + 33.33) + py * (px + 33.33)
    px, py = px + d, py + d
    return fract((px + py) * px) - .5


def grain(u, v, aspect):
    cx, cy = np.floor(u * 896), np.floor(v * 896 / aspect)
    fibre = hash2(np.floor((cx + cy * .12) / 2) + 91, np.floor(cy / 7) + 91)
    return (hash2(cx, cy) * 7 + fibre * 4) / 255


def render(face, canvas=g.CANVAS, colour=WHITE):
    w, h = canvas
    aspect = w / h
    v, u = np.mgrid[0:h, 0:w].astype(np.float64)
    u, v = (u + .5) / w, (v + .5) / h
    at = sampler(Image.open(ASSETS / FACES[face]).convert('RGB'))
    n, (th, tw) = at(u, v)

    light = np.array(LIGHT['rest'])
    p = np.stack([(u - .5) * aspect, v - .5, np.zeros_like(u)], axis=-1)
    to_light = light - p
    l = to_light / np.linalg.norm(to_light, axis=-1, keepdims=True)

    # The shader's walk toward the light, rebuilding height from slopes.
    dxy = l[..., :2] + 1e-5
    direction = dxy / np.linalg.norm(dxy, axis=-1, keepdims=True)
    tan_elevation = l[..., 2] / np.maximum(np.linalg.norm(l[..., :2], axis=-1), 1e-3)
    rect_h = g.relief_rect()[3]
    step_u = direction[..., 0] / aspect * (1 / th) * rect_h
    step_v = direction[..., 1] * (1 / th) * rect_h
    height = np.zeros_like(u)
    shadow = np.zeros_like(u)
    for i in range(1, 15):
        m, _ = at(u + step_u * i, v + step_v * i)
        slope = -(m[..., 0] * direction[..., 0] + m[..., 1] * direction[..., 1]) / np.maximum(m[..., 2], .2)
        height += slope * LIGHT['shadow_length']
        shadow = np.maximum(shadow, np.clip((height - i * tan_elevation) / .6, 0, 1))
    shadow *= LIGHT['shadow']

    wrap = .25
    flat_lit = (l[..., 2] + wrap) / (1 + wrap)
    diffuse = np.maximum((np.sum(n * l, axis=-1) + wrap) / (1 + wrap), 0) * (1 - shadow)
    falloff = 1 / (1 + np.sum(to_light ** 2, axis=-1) * .9)
    centre = 1 / (1 + np.dot(light, light) * .9)
    broad = np.clip((falloff / centre - 1) * .18, -.09, .06)
    shade = 1 + (diffuse - flat_lit) / flat_lit * LIGHT['contrast'] + broad
    out = (colour + grain(u, v, aspect)[..., None]) * shade[..., None]
    return Image.fromarray(np.clip(np.round(out * 255), 0, 255).astype(np.uint8))


def save(image, name):
    image.save(ASSETS / f'{name}.webp', 'WEBP', quality=86, method=6)
    image.resize((800, round(800 * image.height / image.width)), Image.LANCZOS) \
        .save(ASSETS / f'{name}-800w.webp', 'WEBP', quality=86, method=6)


def main():
    alpha = cut_alpha()
    for face in FACES:
        image = render(face).convert('RGBA')
        image.putalpha(alpha)
        save(image, f'card-{face}-paper')
    # The homepage: its own proportions, the back red.
    alpha = cut_alpha(g.PAPER, 1)
    for face, colour, name in (('front', WHITE, 'embossed-paper-frame'), ('back', RED, 'debossed-red-paper-frame')):
        image = render(face, g.PAPER, colour).convert('RGBA')
        image.putalpha(alpha)
        image.save(g.ROOT / 'tools' / 'source-images' / f'{name}.png', optimize=True)
    x0, y0, x1, y1 = g.cut_on_canvas()
    w, h = g.CANVAS
    print(f'canvas {w} x {h}; cut box {x0:.2f}, {y0:.2f} to {x1:.2f}, {y1:.2f} '
          f'({x1 - x0:.2f} x {y1 - y0:.2f} px); card {g.CARD_MM[0]:.2f} x {g.CARD_MM[1]:.2f} mm')
    print('dims insets (%): left {:.3f} right {:.3f} top {:.3f} bottom {:.3f}'.format(
        x0 / w * 100, (w - x1) / w * 100, y0 / h * 100, (h - y1) / h * 100))


if __name__ == '__main__':
    main()
