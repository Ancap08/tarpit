"""Lifted paint for the M56 pose pack, at the pose's source density."""
from math import ceil, hypot

from PIL import Image, ImageChops, ImageDraw, ImageFilter


INK = '#201b19'


def dilate(alpha, radius):
    mask = Image.new('L', alpha.size)
    reach = ceil(radius)
    for y in range(-reach, reach + 1):
        for x in range(-reach, reach + 1):
            coverage = max(0, min(1, radius + .5 - hypot(x, y)))
            if coverage:
                shifted = ImageChops.offset(alpha, x, y)
                mask = ImageChops.lighter(mask, shifted.point(lambda v: round(v * coverage)))
    return mask


def paint(mask):
    result = Image.new('RGBA', mask.size, INK)
    result.putalpha(mask)
    return result


def flight_shadow(source, density):
    # The option C ground plate stays a separate shadow under the flyer.
    mask = dilate(source.getchannel('A'), density * .85)
    return paint(mask.filter(ImageFilter.GaussianBlur(density * .5))
                 .point(lambda v: min(255, round(v * 1.85))))


def keep_light(source, moonlit):
    """Use the Keep light equations on the body before painting its dark feather."""
    width, height = source.size
    material = list(source.getdata())
    output = source.copy()
    colors = []
    for i, (r, g, b, a) in enumerate(material):
        if not a:
            colors.append((0, 0, 0, 0))
            continue
        value = .27 * r + .55 * g + .18 * b
        x, y = i % width, i // width
        west = 1 - material[i - 1][3] / 255 if x else 1
        top = 1 - material[i - width][3] / 255 if y else 1
        if moonlit:
            east = 1 - material[i + 1][3] / 255 if x + 1 < width else 1
            rim = max(west * .8, east * .65, top)
            lit = (r * .86 + value * .2 + rim * 41 + 13,
                   g * .89 + value * .22 + rim * 57 + 17,
                   b * .93 + value * .25 + rim * 80 + 25)
        else:
            lit = (r * .53 + value * .24 + west * 77 + top * 20,
                   g * .47 + value * .27 + west * 35 + top * 30,
                   b * .55 + value * .37 + west * 16 + top * 47 + 8)
        colors.append((*[max(0, min(255, round(c))) for c in lit], a))
    output.putdata(colors)
    return output


def lifted(source, density, anchor, *, contact=None, old_contact=None, crowd=False):
    """Finish one antialiased logical cell. The caller leaves room for the feather."""
    alpha = source.getchannel('A')
    # Option C removes the old faint contact paint from the rim mask.
    body = alpha.point(lambda v: max(0, round((v - 56) * 255 / 199)))
    luma = source.convert('L')
    # Thin internal shading, strongest inside front silhouettes. It gives an
    # overlapping body a small value step even when the outer feather is hidden.
    inner = body.filter(ImageFilter.GaussianBlur(density * .8)) if crowd else body
    pixels = []
    for (r, g, b, a), value, inside, soft in zip(source.getdata(), luma.getdata(),
                                                body.getdata(), inner.getdata()):
        delta = round((value - 103) * .16 + 2)
        if crowd:
            delta += round(4 * inside / 255 - 21 * max(0, inside - soft) / 255)
        pixels.append((r + delta, g + delta, b + delta, a))
    toned = Image.new('RGBA', source.size)
    toned.putdata(pixels)

    width, blur, strength = (1.18, .78, .72) if crowd else (1.12, .88, .66)
    rim = dilate(body, density * width).filter(ImageFilter.GaussianBlur(density * blur))
    base = Image.new('RGBA', source.size)
    if old_contact is not None:
        base.alpha_composite(old_contact)
    if contact is not None:
        x, y = anchor
        half, depth, opacity = contact
        half *= density
        depth *= density
        shadow = Image.new('L', source.size)
        ImageDraw.Draw(shadow).ellipse((x - half, y - depth, x + half, y + depth), fill=opacity)
        base.alpha_composite(paint(shadow.filter(ImageFilter.GaussianBlur(density * 1.45))))
    base.alpha_composite(paint(rim.point(lambda v: round(v * strength))))
    base.alpha_composite(toned)
    # Alpha below 2/255 adds a texture border with no visible edge on the phone.
    base.putalpha(base.getchannel('A').point(lambda v: v if v >= 2 else 0))
    return base
