#!/usr/bin/env python3
"""Write the card's production files to public/downloads/card/.

For a print vendor: the die-cut line, the emboss pattern, the front's print
(type as outlines), mockups, production notes, a combined PDF, and a zip of
everything. All drawn 1:1 in millimetres, in the card's own frame: its cut
outline's top-left at 0, 0.

Sources:
  - the die-cut line and the emboss pattern: as supplied
    (tools/card-sources/), the emboss centred in the cut (tools/card_geometry.py);
  - the type: the lines on card.html in Syne Mono (the site's woff2), laid
    out as src/card/card.css lays them out on the card page's paper image;
  - the mockups: the card page's paper images (tools/build-card-paper.py),
    the front with its type.

Requires Pillow, fontTools and brotli (pip3 install --user fonttools brotli).
Run from anywhere after changing any of those:

    python3 tools/build-card-paper.py && python3 tools/build-card-files.py
"""
import io
import json
import zipfile

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw

import card_geometry as g

ROOT = g.ROOT
ASSETS = ROOT / 'public' / 'assets'
OUT = ROOT / 'public' / 'downloads' / 'card'
NAME = 'pambudi-card'

# The card page's paper image (tools/card_geometry.py), on which card.css
# lays out the type.
IMAGE = g.CANVAS
PT = 72 / 25.4                          # points per millimetre
# The type, 8.5 pt on the card, as a share of the paper image's width (card.css: 4.123cqw).
TYPE_SIZE = 0.041230

# src/styles/tokens.css and src/card/card.css.
# Every line printed in black: 100% K in the PDF, one plate, no rich black.
INK = '#000000'
CUT_COLOUR = '#ec008c'                  # the usual CutContour magenta, as shown on screen
LINES = [  # (paragraph, text, colour), as in card.html
    (0, 'ivan pambudi', INK), (0, 'ui & brand designer', INK),
    (1, 'ivan@pambudi.xyz', INK), (1, '+62 878-4000-9811', INK), (1, '@____pambudi', INK),
    (2, 'pambudi.xyz', INK), (2, 'surakarta, idn', INK),
]


# —— The type ——

_FONT = None


def font():
    global _FONT
    if _FONT is None:
        f = TTFont(ASSETS / 'fonts' / 'syne-mono-latin.woff2')
        upm = f['head'].unitsPerEm
        _FONT = dict(upm=upm, ascent=f['hhea'].ascent / upm, descent=-f['hhea'].descent / upm,
                     cmap=f.getBestCmap(), glyphs=f.getGlyphSet(), metrics=f['hmtx'])
    return _FONT


def line_paths(text, size, centre, baseline):
    """One line of Syne Mono as outlines, centred on `centre` at `baseline`,
    in whatever units `size` is in (y down)."""
    f = font()
    upm, cmap, glyphs, metrics = f['upm'], f['cmap'], f['glyphs'], f['metrics']
    x = centre - sum(metrics[cmap[ord(ch)]][0] for ch in text) * size / upm / 2
    subpaths = []
    for ch in text:
        name = cmap[ord(ch)]
        # Decomposed: the figures are built of components.
        pen = DecomposingRecordingPen(glyphs)
        glyphs[name].draw(pen)
        place = lambda px, py, x=x: (x + px * size / upm, baseline - py * size / upm)
        current = None
        for op, args in pen.value:
            if op == 'moveTo':
                current = {'start': place(*args[0]), 'curves': []}
                last = args[0]
            elif op == 'lineTo':
                current['curves'].append((None, None, place(*args[0])))
                last = args[0]
            elif op == 'qCurveTo':
                # TrueType quadratics, with implied on-curve points between off-curve ones.
                pts, end = list(args[:-1]), args[-1]
                if end is None:   # a closed curve of off-curve points only
                    end = ((pts[-1][0] + pts[0][0]) / 2, (pts[-1][1] + pts[0][1]) / 2)
                p0 = last
                for k, c in enumerate(pts):
                    p2 = end if k == len(pts) - 1 else ((c[0] + pts[k + 1][0]) / 2, (c[1] + pts[k + 1][1]) / 2)
                    c1 = (p0[0] + 2 / 3 * (c[0] - p0[0]), p0[1] + 2 / 3 * (c[1] - p0[1]))
                    c2 = (p2[0] + 2 / 3 * (c[0] - p2[0]), p2[1] + 2 / 3 * (c[1] - p2[1]))
                    current['curves'].append((place(*c1), place(*c2), place(*p2)))
                    p0 = p2
                last = p0
            elif op == 'curveTo':
                c1, c2, p2 = args
                current['curves'].append((place(*c1), place(*c2), place(*p2)))
                last = p2
            elif op in ('closePath', 'endPath'):
                if current:
                    subpaths.append(current)
                current = None
        x += metrics[name][0] * size / upm
    return subpaths


def type_paths():
    """Each front line's glyphs as outlines, on the paper, with its colour.

    card.css: .card-copy is inset 25% 26% 24% of the paper, its three
    paragraphs spread top to bottom; type at 3.8cqw of the paper's width,
    1.8 line height, centred, 0 tracking. The baseline sits half the leading
    plus the ascent below each line's top (Syne Mono: 925 up, 275 down, of
    1000), as the browser sets it (checked against the page: within 0.1 mm)."""
    f = font()
    size = TYPE_SIZE * IMAGE[0]
    line = 1.8 * size
    top, bottom = .25 * IMAGE[1], (1 - .24) * IMAGE[1]
    counts = [sum(1 for p, *_ in LINES if p == k) for k in range(3)]
    gap = (bottom - top - sum(counts) * line) / 2
    baseline_in_line = (line - (f['ascent'] + f['descent']) * size) / 2 + f['ascent'] * size
    out, y = [], top
    for k in range(3):
        for paragraph, text, colour in LINES:
            if paragraph != k:
                continue
            out.append({'text': text, 'colour': colour, 'size': size,
                        'paths': line_paths(text, size, IMAGE[0] / 2, y + baseline_in_line)})
            y += line
        y += gap
    return out


# —— The back: a guide for the wax seal over the NFC chip ——
# In card millimetres, as seen from the back, centred on the die line's
# middle (card.css .card-tap draws the same). Printed: a faint 16 mm ring
# (30% black) to centre the 19 mm wax seal on by hand, which hides it with
# 1.5 mm to spare all round; and one line in black at the front's size, 2.5
# mm under the seal's edge; above it, the NFC mark (supplied,
# tools/card-sources/nfc-mark.svg), 5 mm wide, 1.6 mm over the seal's edge.
# The NFC chip (max 18 mm) sits under the seal.
# The wax may spread past 19 mm as it's pressed on by hand: the print keeps
# SPREAD mm clear of the seal's edge, on top of each gap it had.
SPREAD = 2
BACK = dict(seal=19, guide=16, guide_line=.2, guide_k=.3, guide_dashes=40, text='tap the seal', text_gap=2.5 + SPREAD, nfc=18,
            mark=5, mark_gap=1.6 + SPREAD)
GUIDE_GREY = '#bdbdbd'                  # 30% black, as shown on screen


def mm_to_canvas(p):
    """Card millimetres → the card page's paper image, in px."""
    return g.to_canvas((p[0] / g.MM_PER_UNIT + g.CUT_BOX[0], p[1] / g.MM_PER_UNIT + g.CUT_BOX[1]))


def arc(cx, cy, r, a0, a1, segments=None):
    """A circular arc (degrees, clockwise from 3 o'clock, y down) as cubic Béziers."""
    import math
    segments = segments or max(1, math.ceil(abs(a1 - a0) / 90))
    step = math.radians(a1 - a0) / segments
    k = 4 / 3 * math.tan(step / 4)
    t = math.radians(a0)
    start = (cx + r * math.cos(t), cy + r * math.sin(t))
    curves = []
    for _ in range(segments):
        t2 = t + step
        p0 = (cx + r * math.cos(t), cy + r * math.sin(t))
        p3 = (cx + r * math.cos(t2), cy + r * math.sin(t2))
        c1 = (p0[0] - k * r * math.sin(t), p0[1] + k * r * math.cos(t))
        c2 = (p3[0] + k * r * math.sin(t2), p3[1] - k * r * math.cos(t2))
        curves.append((c1, c2, p3))
        t = t2
    # Less than a full turn stays open: closing it would draw a chord.
    return {'start': start, 'curves': curves, 'open': abs(a1 - a0) < 360}


def back_print():
    """The back in card mm: the printed guide ring (subpath, width), the
    printed line of type, and the seal and NFC chip outlines (not printed)."""
    cx, cy = g.CARD_MM[0] / 2, g.CARD_MM[1] / 2
    b = BACK
    ring = (arc(cx, cy, b['guide'] / 2 - b['guide_line'] / 2, 0, 360, 4), b['guide_line'])
    size = TYPE_SIZE * IMAGE[0] * g.CARD_MM[0] / ((g.cut_on_canvas()[2] - g.cut_on_canvas()[0]))
    top = cy + b['seal'] / 2 + b['text_gap']
    # Line height 1: the baseline sits (1 - 1.2) / 2 + 0.925 of the size below its top.
    baseline = top + ((1 - (font()['ascent'] + font()['descent'])) / 2 + font()['ascent']) * size
    text = {'text': b['text'], 'colour': INK, 'size': size, 'paths': line_paths(b['text'], size, cx, baseline)}
    art = g.load('nfc-mark.svg')
    ax0, ay0, ax1, ay1 = g.bounds(art)
    k = b['mark'] / (ax1 - ax0)
    top = cy - b['seal'] / 2 - b['mark_gap'] - (ay1 - ay0) * k
    mark = g.transform(art, lambda p: (cx - b['mark'] / 2 + (p[0] - ax0) * k, top + (p[1] - ay0) * k))
    return dict(ring=ring, text=text, mark=mark, centre=(cx, cy),
                seal=arc(cx, cy, b['seal'] / 2, 0, 360, 4), nfc=arc(cx, cy, b['nfc'] / 2, 0, 360, 4))


# —— The mockup's type ——

def type_layer_image(lines, size, scale=4):
    """The type drawn at `scale`, each line's contours filled even-odd (as a
    font fills its counters), brought down to `size`, antialiased."""
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    for line in lines:
        contours = [[(x * scale, y * scale) for x, y in g.flatten(sp, 8)] for sp in line['paths']]
        xs = [x for c in contours for x, _ in c]
        ys = [y for c in contours for _, y in c]
        # The line's box, on whole pixels of the mockup.
        left, top = int(min(xs) // scale) - 1, int(min(ys) // scale) - 1
        right, bottom = int(max(xs) // scale) + 2, int(max(ys) // scale) + 2
        box = ((right - left) * scale, (bottom - top) * scale)
        mask = Image.new('1', box, 0)
        for contour in contours:
            shape = Image.new('1', box, 0)
            ImageDraw.Draw(shape).polygon([(x - left * scale, y - top * scale) for x, y in contour], fill=1)
            mask = ImageChops.logical_xor(mask, shape)
        alpha = mask.convert('L').resize((right - left, bottom - top), Image.BOX)
        colour = Image.new('RGBA', alpha.size, line['colour'])
        colour.putalpha(alpha)
        layer.alpha_composite(colour, (left, top))
    return layer


def back_layer_image(back, size):
    """The finished back for its mockup: the line of type, and the wax seal
    (the favicon's P seal, 19 mm) stuck on over the ring and the chip."""
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    text = dict(back['text'], paths=g.transform(back['text']['paths'], mm_to_canvas))
    mark = {'colour': INK, 'paths': g.transform(back['mark'], mm_to_canvas)}
    layer.alpha_composite(type_layer_image([text, mark], size))
    wax = Image.open(ROOT / 'tools' / 'source-images' / 'favicon-wax-seal.webp').convert('RGBA')
    wax = wax.crop(wax.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
    px_per_mm = mm_to_canvas((1, 0))[0] - mm_to_canvas((0, 0))[0]
    w = round(BACK['seal'] * px_per_mm)
    wax = wax.resize((w, round(w * wax.height / wax.width)), Image.LANCZOS)
    cx, cy = mm_to_canvas(back['centre'])
    at = (round(cx - wax.width / 2), round(cy - wax.height / 2))
    # A soft shadow under the wax, as it stands off the paper.
    from PIL import ImageFilter
    shadow = Image.new('RGBA', size, (0, 0, 0, 0))
    shade = Image.new('RGBA', wax.size, (58, 30, 30, 0))
    shade.putalpha(wax.getchannel('A').point(lambda v: v * .35))
    shadow.alpha_composite(shade, (at[0], at[1] + 3))
    layer.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(4)))
    layer.alpha_composite(wax, at)
    return layer


# —— Writing ——

def to_card(point, origin=None):
    """Everything is in card millimetres by the time it is written."""
    return point


def svg_d(subpaths, origin):
    f = lambda n: f'{n:.4f}'.rstrip('0').rstrip('.')
    parts = []
    for sp in subpaths:
        x, y = to_card(sp['start'], origin)
        parts.append(f'M{f(x)} {f(y)}')
        for c1, c2, p in sp['curves']:
            px, py = to_card(p, origin)
            if c1 is None:
                parts.append(f'L{f(px)} {f(py)}')
            else:
                (ax, ay), (bx, by) = to_card(c1, origin), to_card(c2, origin)
                parts.append(f'C{f(ax)} {f(ay)} {f(bx)} {f(by)} {f(px)} {f(py)}')
        if not sp.get('open'):
            parts.append('Z')
    return ''.join(parts)


def svg(width, height, body, title):
    f = lambda n: f'{n:.3f}'.rstrip('0').rstrip('.')
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(width)}mm" height="{f(height)}mm" '
            f'viewBox="0 0 {f(width)} {f(height)}">\n<title>{title}</title>\n{body}</svg>\n')


def pdf_path(subpaths, origin, page_height, margin):
    """PDF path operators in points, y up, the card offset by the page margin."""
    f = lambda n: f'{n:.3f}'.rstrip('0').rstrip('.')
    def pt(p):
        x, y = to_card(p, origin)
        return f((x + margin) * PT), f((page_height - y - margin) * PT)
    ops = []
    for sp in subpaths:
        ops.append('%s %s m' % pt(sp['start']))
        for c1, c2, p in sp['curves']:
            if c1 is None:
                ops.append('%s %s l' % pt(p))
            else:
                ops.append('%s %s %s %s %s %s c' % (*pt(c1), *pt(c2), *pt(p)))
        if not sp.get('open'):
            ops.append('h')
    return '\n'.join(ops)


def rgb(hex_colour):
    return tuple(int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5))


def write_pdf(path, pages, size):
    """A minimal PDF 1.4: each page one content stream; spot colours for the
    cut and the emboss; Helvetica (standard, not embedded) for the notes."""
    objects = []
    def add(body):
        objects.append(body)
        return len(objects)
    # Spot colours: CutContour (magenta) and Emboss (black), CMYK alternates.
    def separation(name, cmyk):
        fn = add('<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [%s] /N 1 >>' % ' '.join(map(str, cmyk)))
        return add('[/Separation /%s /DeviceCMYK %d 0 R]' % (name, fn))
    cut_cs, emboss_cs = separation('CutContour', (0, 1, 0, 0)), separation('Emboss', (0, 0, 0, 1))
    guide_cs = separation('NFC-Guide', (1, 0, 0, 0))
    font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    pages_id = len(objects) + 1 + 2 * len(pages)   # after every page and its stream
    kids = []
    w, h = size
    for content, trim in pages:
        data = content.encode('latin-1')
        stream = add('<< /Length %d >>\nstream\n' % len(data) + content + '\nendstream')
        kids.append(add(
            '<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.3f %.3f] /TrimBox [%s] '
            '/Resources << /ColorSpace << /Cut %d 0 R /Emboss %d 0 R /Guide %d 0 R >> /Font << /F1 %d 0 R >> >> '
            '/Contents %d 0 R >>' % (pages_id, w * PT, h * PT, ' '.join('%.3f' % n for n in trim),
                                     cut_cs, emboss_cs, guide_cs, font, stream)))
    assert add('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % k for k in kids), len(kids))) == pages_id
    catalog = add('<< /Type /Catalog /Pages %d 0 R >>' % pages_id)
    info = add('<< /Title (Ivan Pambudi card: production files) /Creator (tools/build-card-files.py) >>')
    out = io.BytesIO()
    out.write(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(out.tell())
        out.write(('%d 0 obj\n' % i).encode() + body.encode('latin-1') + b'\nendobj\n')
    xref = out.tell()
    out.write(('xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1)).encode())
    for o in offsets:
        out.write(('%010d 00000 n \n' % o).encode())
    out.write(('trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n'
               % (len(objects) + 1, catalog, info, xref)).encode())
    path.write_bytes(out.getvalue())


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    origin = None
    width, height = g.CARD_MM
    outline = g.transform(g.CUT, g.to_mm)
    emboss = g.transform(g.EMBOSS, g.to_mm)
    lines_px = type_paths()
    canvas_to_mm = lambda p: g.to_mm(g.from_canvas(p))
    lines = [dict(l, paths=g.transform(l['paths'], canvas_to_mm)) for l in lines_px]
    mm_per_px = g.to_mm(g.from_canvas((1, 0)))[0] - g.to_mm(g.from_canvas((0, 0)))[0]
    back = back_print()
    # The back's files are drawn as seen from the back: the die line mirrored.
    outline_back = g.transform(outline, lambda p: (width - p[0], p[1]))

    cut_d = svg_d(outline, origin)
    cut_layer = f'<g id="die-cut" fill="none" stroke="{CUT_COLOUR}" stroke-width="0.1"><path d="{cut_d}"/></g>\n'
    emboss_layer = f'<g id="emboss" fill="#000" fill-rule="evenodd"><path d="{svg_d(emboss, origin)}"/></g>\n'
    type_layer = '<g id="print">\n' + ''.join(
        f'<path fill="{l["colour"]}" d="{svg_d(l["paths"], origin)}"><title>{l["text"].replace("&", "&amp;")}</title></path>\n'
        for l in lines) + '</g>\n'

    files = {}
    def save(name, data):
        (OUT / name).write_bytes(data if isinstance(data, bytes) else data.encode())
        files[name] = OUT / name

    save(f'{NAME}-die-cut.svg', svg(width, height, cut_layer, 'Die-cut line, 1:1 mm'))
    save(f'{NAME}-emboss.svg', svg(width, height, emboss_layer + cut_layer,
                                   'Blind emboss pattern (black = raised on the front), seen from the front, with the die-cut line'))
    save(f'{NAME}-front.svg', svg(width, height, type_layer + cut_layer,
                                  'Front print: type as outlines, with the die-cut line'))
    sp, w = back['ring']
    # Dashed: guide_dashes dashes and as many gaps, so the ring closes evenly.
    import math
    dash = math.pi * (BACK['guide'] - BACK['guide_line']) / (2 * BACK['guide_dashes'])
    back_layer = ('<g id="print">\n'
                  f'<path fill="none" stroke="{GUIDE_GREY}" stroke-width="{w}" stroke-dasharray="{dash:.4f} {dash:.4f}" d="{svg_d([sp], origin)}"><title>wax seal guide, {BACK["guide"]} mm, dashed, 30% K (hidden under the seal)</title></path>\n'
                  f'<path fill="#000" d="{svg_d(back["mark"], origin)}"><title>NFC mark, {BACK["mark"]} mm wide</title></path>\n'
                  f'<path fill="#000" d="{svg_d(back["text"]["paths"], origin)}"><title>{back["text"]["text"]}</title></path>\n'
                  '</g>\n')
    guide_layer = ('<g id="placement" fill="none" stroke="#00aeef" stroke-width="0.1">'
                   f'<path stroke-dasharray="0.6 0.4" d="{svg_d([back["seal"]], origin)}"><title>wax seal, {BACK["seal"]} mm, applied by hand: not printed</title></path>'
                   f'<path stroke-dasharray="0.2 0.4" d="{svg_d([back["nfc"]], origin)}"><title>NFC chip, max {BACK["nfc"]} mm, under the seal: not printed</title></path>'
                   '</g>\n')
    cut_back_layer = f'<g id="die-cut" fill="none" stroke="{CUT_COLOUR}" stroke-width="0.1"><path d="{svg_d(outline_back, origin)}"/></g>\n'
    save(f'{NAME}-back.svg', svg(width, height, back_layer + guide_layer + cut_back_layer,
                                 'Back print, seen from the back: the seal guide ring and type; the wax seal and NFC chip outlines (not printed); the die-cut line mirrored'))

    # Mockups: the card page's paper on white, the front with its type.
    for side in ('front', 'back'):
        image = Image.open(ASSETS / f'card-{side}-paper.webp').convert('RGBA')
        page = Image.new('RGBA', image.size, (255, 255, 255, 255))
        page.alpha_composite(image)
        if side == 'front':
            page.alpha_composite(type_layer_image(lines_px, image.size))
        else:
            page.alpha_composite(back_layer_image(back, image.size))
        buffer = io.BytesIO()
        page.convert('RGB').save(buffer, 'PNG', optimize=True)
        save(f'{NAME}-mockup-{side}.png', buffer.getvalue())

    # The combined PDF: the card 1:1 on a page with a 10 mm margin, a page each.
    margin = 10
    page_w, page_h = width + 2 * margin, height + 2 * margin
    trim = (margin * PT, margin * PT, (margin + width) * PT, (margin + height) * PT)
    cut_ops = '/Cut CS 1 SCN 0.25 w\n' + pdf_path(outline, origin, page_h, margin) + '\nS'
    def label(*texts):
        # Under the card, a line each, small enough for the page's width.
        out = []
        for i, text in enumerate(texts):
            safe = text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
            out.append('BT /F1 5 Tf 0.45 g %.3f %.3f Td (%s) Tj ET' % (margin * PT, (margin - 4 - 2.4 * i) * PT, safe))
        return '\n'.join(out)
    print_ops = []
    for l in lines:
        fill = '0 0 0 1 k' if l['colour'] == '#000000' else '%.4f %.4f %.4f rg' % rgb(l['colour'])
        print_ops.append('%s\n%s\nf' % (fill, pdf_path(l['paths'], origin, page_h, margin)))
    cut_back_ops = '/Cut CS 1 SCN 0.25 w\n' + pdf_path(outline_back, origin, page_h, margin) + '\nS'
    sp, w = back['ring']
    back_ops = ['0 0 0 %.2f K %.3f w [%.4f %.4f] 0 d\n%s\nS [] 0 d' % (BACK['guide_k'], w * PT, dash * PT, dash * PT, pdf_path([sp], origin, page_h, margin)),
                '0 0 0 1 k\n%s\nf' % pdf_path(back['mark'] + back['text']['paths'], origin, page_h, margin),
                '/Guide CS 1 SCN 0.25 w [1.7 1.1] 0 d\n%s\nS' % pdf_path([back['seal']], origin, page_h, margin),
                '[0.6 1.1] 0 d\n%s\nS [] 0 d' % pdf_path([back['nfc']], origin, page_h, margin)]
    pages = [
        ('\n'.join(print_ops) + '\n' + cut_ops + '\n' + label(
            'FRONT PRINT - type as outlines, black (100% K)', 'Magenta: die-cut line (CutContour), not printed'), trim),
        ('\n'.join(back_ops) + '\n' + cut_back_ops + '\n' + label(
            'BACK PRINT, seen from the back - dashed seal guide 30% K, NFC mark + type 100% K',
            'Cyan: wax seal %d mm (long dashes), NFC chip %d mm (short), not printed' % (BACK['seal'], BACK['nfc'])), trim),
        ('/Emboss cs 1 scn\n' + pdf_path(emboss, origin, page_h, margin) + '\nf*\n' + cut_ops + '\n' + label(
            'BLIND EMBOSS - black = raised on the front, seen from the front', 'One die pair; the back shows it debossed. Not printed.'), trim),
        (cut_ops + '\n' + label('DIE-CUT LINE - %.2f x %.2f mm' % (width, height), 'CutContour spot, 0.25 pt'), trim),
    ]
    write_pdf(OUT / f'{NAME}-production.pdf', pages, (page_w, page_h))
    files[f'{NAME}-production.pdf'] = OUT / f'{NAME}-production.pdf'

    type_mm = lines[0]['size'] * mm_per_px
    notes = f"""IVAN PAMBUDI - BUSINESS CARD - PRODUCTION NOTES

Size (die-cut, shaped)   {width:.2f} x {height:.2f} mm (width x height), portrait
Shape                    custom die-cut outline: {NAME}-die-cut.svg
Stock                    white, uncoated (confirm weight and thickness on a proof)
Front                    blind emboss (no ink) + printed type
Back                     shows the emboss recessed (debossed), plus a small print,
                         seen from the back in {NAME}-back.svg:
                         - a faint dashed {BACK['guide']} mm ring, 30% K: the guide for the wax seal,
                           which covers it;
                         - the NFC mark, {BACK['mark']} mm wide, black (100% K), above the seal;
                         both keep {SPREAD} mm clear of the seal's edge in case the
                         wax spreads as it's pressed on;
                         - "{BACK['text']}" in black (100% K), under the seal.
NFC                      one NFC chip (sticker or inlay), round, max {BACK['nfc']} mm, e.g.
                         NTAG213 for a link, NTAG215/216 for a contact card,
                         centred on the guide ring: {back['centre'][0]:.2f} mm from the
                         left, {back['centre'][1]:.2f} mm from the top (the card's middle).
                         Apply after printing, embossing and die-cutting (the press
                         would crack it). No metal or foil near it. Write the link,
                         then lock the chip. Test a sample through the wax with
                         iPhone and Android.
Wax seal                 {BACK['seal']} mm, applied by hand last, over the chip, centred on
                         the guide ring. Use a self-adhesive (cold) seal: hot wax
                         can damage the chip.
Emboss                   one blind-emboss die pair (male and female) from
                         {NAME}-emboss.svg. Black = raised on the front, drawn as
                         seen from the front. The same press gives the deboss on
                         the back, so no second die is needed.
Type                     Syne Mono, {type_mm:.2f} mm ({type_mm * PT:.1f} pt), centred, 0 tracking;
                         already converted to outlines, no fonts needed.
Ink                      black, every line: 100% K (one plate, not rich black).

Files (all 1:1, in millimetres, the card's top-left at 0, 0)
  {NAME}-production.pdf   4 pages: front print, back print, emboss pattern,
                          die-cut line. Die-cut is a CutContour spot (magenta,
                          0.25 pt); emboss is an "Emboss" spot; the wax seal's
                          and NFC chip's places are an "NFC-Guide" spot (cyan,
                          dashed). None of them is to be printed.
  {NAME}-front.svg        front print with the die-cut line
  {NAME}-back.svg         back print with the seal and chip outlines and the
                          die-cut line, seen from the back (die line mirrored)
  {NAME}-emboss.svg       emboss pattern with the die-cut line
  {NAME}-die-cut.svg      die-cut line only
  {NAME}-mockup-front.png / -back.png   how it should look

Live preview: https://card.pambudi.xyz
"""
    save(f'{NAME}-notes.txt', notes)

    with zipfile.ZipFile(OUT / f'{NAME}-files.zip', 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name, path in sorted(files.items()):
            info = zipfile.ZipInfo(f'{NAME}/{name}', date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, path.read_bytes())

    summary = {'card_mm': [round(width, 3), round(height, 3)], 'cut_subpaths': len(outline),
               'emboss_subpaths': len(emboss), 'type_mm': round(type_mm, 3),
               'files': sorted(p.name for p in OUT.iterdir())}
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main()
