"""Finish scratch poses and lay out the M56 review images on macOS.

After npm run build, use the same existing scratch directory for both steps:
    PW_PORT=4373 node --experimental-strip-types scripts/art/m56-review.ts SCRATCH options
    python3 scripts/art/m56-options.py sheets SCRATCH
The capture step calls this script's finish mode with Pillow.
"""
import json
from math import ceil, hypot
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'assets/art-painted'
OUT = ROOT / 'docs/review/m56/options'
PAD = 20
FINISHES = ('a-soft', 'b-inked', 'c-lifted')
LABELS = ('A Soft', 'B Inked', 'C Lifted')
TOWERS = {'musketeer', 'cannon', 'tar-pit', 'longbow', 'mortar', 'fire-pot'}
SHADOW_WIDTH = {'goblin': 18, 'wolf': 27, 'shieldbearer': 28, 'troll': 44,
                'grumblefoot': 50, 'grumblemaw': 52, 'guard': 21}
PAPER, CARD, INK, MUTED, GRASS = '#e7eee8', '#f7faf5', '#172b2d', '#435954', '#78936d'
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
PIECES = (('musketeer', 'Musketeer', 6), ('cannon', 'Cannon', 6), ('tar-pit', 'Tar Pit', 6),
          ('shieldbearer', 'Redcoat Shieldbearer', 8), ('harpy', 'Royal Harpy', 8), ('troll', 'Toll Troll', 4))


def layer(color, alpha):
    result = Image.new('RGBA', alpha.size, color)
    result.putalpha(alpha)
    return result


def dilate(alpha, radius):
    """Expand a soft silhouette with a round, fractionally covered edge."""
    mask = Image.new('L', alpha.size)
    reach = ceil(radius)
    for y in range(-reach, reach + 1):
        for x in range(-reach, reach + 1):
            coverage = max(0, min(1, radius + .5 - hypot(x, y)))
            if coverage:
                shifted = ImageChops.offset(alpha, x, y)
                mask = ImageChops.lighter(mask, shifted.point(lambda v: round(v * coverage)))
    return mask


def finished(source, kind, density, anchor, finish):
    image = Image.new('RGBA', (source.width + 2 * PAD, source.height + 2 * PAD))
    image.paste(source, (PAD, PAD))
    if finish == 'a-soft':
        return image
    alpha = image.getchannel('A')
    ink = '#201b19'
    if kind == 'harpy-shadow':
        if finish == 'b-inked':
            return image
        return layer(ink, dilate(alpha, density * .85).filter(ImageFilter.GaussianBlur(density * .5))
                     .point(lambda v: min(255, round(v * 1.85))))

    # The original ground contact paint peaks at alpha 56. Leave it out
    # of the body rim and preserve it under the new finish.
    body = alpha.point(lambda v: max(0, min(255, round((v - 56) * 255 / 199))))
    lightness = image.convert('L')
    def contrast(pixel, luma):
        r, g, b, a = pixel
        delta = round((luma - 103) * .16 + 2)
        return r + delta, g + delta, b + delta, a

    toned = Image.new('RGBA', image.size)
    toned.putdata([contrast(pixel, luma) for pixel, luma in zip(image.getdata(), lightness.getdata())])

    if finish == 'b-inked':
        rim = dilate(body, density * 1.48).point(lambda v: round(v * .94))
        base = layer(ink, rim)
    else:
        glow = dilate(body, density * 1.12).filter(ImageFilter.GaussianBlur(density * .88))
        base = Image.new('RGBA', image.size)
        if kind in TOWERS or kind in SHADOW_WIDTH:
            x, y = (n + PAD for n in anchor)
            half = density * (19 if kind in TOWERS else SHADOW_WIDTH[kind] / 2)
            depth = density * (4 if kind in TOWERS else 3)
            shadow = Image.new('L', image.size)
            ImageDraw.Draw(shadow).ellipse((x - half, y - depth, x + half, y + depth), fill=108)
            base = layer(ink, shadow.filter(ImageFilter.GaussianBlur(density * 1.45)))
        base.alpha_composite(layer(ink, glow.point(lambda v: round(v * .66))))
    base.alpha_composite(toned)
    return base


def finish_poses(folder):
    for pose in json.loads((folder / 'poses.json').read_text()):
        idx = pose['id']
        with Image.open(folder / f'{idx}.png') as source:
            for finish in FINISHES[1:]:
                image = finished(source.convert('RGBA'), pose['kind'], pose['density'], (pose['x'], pose['y']), finish)
                image.save(folder / f'{finish}-{idx}.png')
    print(PAD)


def caption(draw, xy, value, size, *, bold=False, center=False, color=INK):
    font = ImageFont.truetype(str(FONT_DIR / ('Arial Bold.ttf' if bold else 'Arial.ttf')), size)
    draw.text(xy, value, font=font, fill=color, anchor='mt' if center else 'lt')


def atlas_pair(kind, pose, stock_atlas, stock, sharp):
    entry = stock[kind]
    w, h = entry['frameSize']
    x, y = entry['offset']
    x += pose % entry['columns'] * w
    y += pose // entry['columns'] * h
    old = stock_atlas.crop((x, y, x + w, y + h))
    entry = sharp[f'{kind}-2x']
    x, y, w, h, dx, dy = entry['regions'][pose]
    with Image.open(ART / 'sharp' / (entry['atlas'] + '.webp')) as atlas:
        new = Image.new('RGBA', entry['frameSize'])
        new.paste(atlas.crop((x, y, x + w, y + h)), (dx, dy))
    return (old, tuple(stock[kind]['anchor'])), (new, tuple(entry['anchor']))


def with_flight_shadow(sprite, anchor, shadow, shadow_anchor):
    x, y = anchor
    sx, sy = shadow_anchor
    ground = Image.new('RGBA', sprite.size)
    # Test-mode Painted Harpies are lifted three game units (six source px).
    ground.alpha_composite(shadow, (x - sx, y - sy + 6))
    return Image.alpha_composite(ground, sprite)


def piece_sheets():
    stock_path = ART / 'packed/shared-2x'
    stock_atlas = Image.open(stock_path.with_suffix('.webp')).convert('RGBA')
    stock = json.loads(stock_path.with_suffix('.json').read_text())
    sharp = json.loads((ART / 'sharp/layout.json').read_text())
    shadows = atlas_pair('harpy-shadow', 0, stock_atlas, stock, sharp)
    for finish, label in zip(FINISHES, LABELS):
        sheet = Image.new('RGB', (1170, 1528), PAPER)
        draw = ImageDraw.Draw(sheet)
        caption(draw, (24, 21), label + '  /  Six pieces', 42, bold=True)
        caption(draw, (24, 80), '390 × 656 CSS px at DPR 3  ·  Phone pixels above, 2.4× enlargement below', 28, color=MUTED)
        for index, (kind, name, pose) in enumerate(PIECES):
            x, y = 24 + index % 2 * 570, 132 + index // 2 * 464
            draw.rounded_rectangle((x, y, x + 552, y + 444), 12, fill=CARD)
            caption(draw, (x + 18, y + 15), name, 29, bold=True)
            draw.rounded_rectangle((x + 12, y + 78, x + 540, y + 178), 5, fill=GRASS)
            draw.rounded_rectangle((x + 12, y + 184, x + 540, y + 432), 5, fill=GRASS)
            for top, bottom in ((78, 178), (184, 432)):
                draw.line((x + 276, y + top, x + 276, y + bottom), fill='#9eb294')
            (old, old_at), (soft, soft_at) = atlas_pair(kind, pose, stock_atlas, stock, sharp)
            new = finished(soft, kind, 2, soft_at, finish)
            new_at = tuple(coord + PAD for coord in soft_at)
            if kind == 'harpy':
                (old_shadow, old_shadow_at), (soft_shadow, soft_shadow_at) = shadows
                new_shadow = finished(soft_shadow, 'harpy-shadow', 2, soft_shadow_at, finish)
                old = with_flight_shadow(old, old_at, old_shadow, old_shadow_at)
                new = with_flight_shadow(new, new_at, new_shadow, tuple(coord + PAD for coord in soft_shadow_at))
            for i, (source, anchor, column) in enumerate(((old, old_at, 'Today'), (new, new_at, label))):
                middle = x + 138 + 276 * i
                caption(draw, (middle, y + 50), column, 24, bold=True, center=True, color=MUTED)
                for zoom, baseline, area in ((1, 164, (78, 178)), (2.4, 395, (184, 432))):
                    scale = 3 * 656 / 1388 / 2 * zoom
                    sized = source.resize(tuple(round(n * scale) for n in source.size), Image.Resampling.BICUBIC)
                    left, top, right, bottom = sized.getbbox()
                    sprite_x = middle - round(anchor[0] * scale)
                    sprite_y = y + baseline - round(anchor[1] * scale)
                    if not (y + area[0] <= sprite_y + top and sprite_y + bottom <= y + area[1]):
                        raise ValueError(f'{name} {column} at {zoom}× does not fit its swatch')
                    visible = sized.crop((left, top, right, bottom))
                    sheet.paste(visible, (sprite_x + left, sprite_y + top), visible)
        sheet.save(OUT / f'{finish}-pieces.png', optimize=True)


def crop_box(point, width, height, dx=0, dy=0):
    x = round(3 * point['x'] + dx) - width // 2
    y = round(3 * point['y'] + dy) - height // 2
    return x, y, x + width, y + height


def midpoint(a, b):
    return {axis: (a[axis] + b[axis]) / 2 for axis in ('x', 'y')}


def scene_crops(name, positions):
    if name == 'mid-wave':
        return [('Crowd', crop_box(positions['crowd'], 352, 155, dx=-138, dy=-73)),
                ('Musketeer and Cannon', crop_box(midpoint(positions['a'], positions['b']), 350, 302, dy=-28))]
    towers = {tower['kind']: tower for tower in positions['towers']}
    return [('Gate crowd', crop_box(positions['gate'], 352, 334, dx=8, dy=-56)),
            ('Fire Pot and Mortar', crop_box(midpoint(towers['firepot'], towers['mortar']), 354, 464, dy=-38))]


def webp(image, name):
    image.save(OUT / f'{name}.webp', lossless=True, quality=85, method=4)


def detail_sheet(label, title, image, crops):
    width = 1170
    sheet = Image.new('RGB', (width, 92 + sum(3 * (b - t) + 59 for _, (_, t, _, b) in crops) + 24), PAPER)
    draw = ImageDraw.Draw(sheet)
    caption(draw, (24, 19), label + '  /  ' + title, 42, bold=True)
    y = 86
    for description, box in crops:
        caption(draw, (24, y), description + '  ·  3× crop', 28, bold=True, color=MUTED)
        pic = image.crop(box)
        zoomed = pic.resize((3 * pic.width, 3 * pic.height), Image.Resampling.NEAREST)
        sheet.paste(zoomed, ((width - zoomed.width) // 2, y + 38))
        y += zoomed.height + 59
    return sheet


def battle_sheets(scratch):
    scenes = {}
    for name, title, field in (('mid-wave', 'Window Money', (245, 325, 925, 1688)),
                               ('old-keep-night', 'Old Keep at night', (0, 62, 1170, 1668))):
        folder = scratch / name
        captures = [Image.open(folder / f'{finish}.png').convert('RGB') for finish in FINISHES]
        soft = captures[0]
        assert soft.size == (1170, 1968)
        if name == 'mid-wave':
            prior = Image.open(OUT.parent / 'mid-wave-390x656.webp').convert('RGB')
            assert not ImageChops.difference(soft, prior.crop((1218, 177, 2388, 2145))).getbbox()
        for image in captures[1:]:
            box = ImageChops.difference(soft, image).getbbox()
            assert box and field[0] <= box[0] < box[2] <= field[2] and field[1] <= box[1] < box[3] <= field[3]
        crops = scene_crops(name, json.loads((folder / 'positions.json').read_text()))
        for (finish, label), image in zip(zip(FINISHES, LABELS), captures):
            webp(image, f'{finish}-{name}')
            webp(detail_sheet(label, title, image, crops), f'{finish}-{name}-detail')
        scenes[name] = (captures, crops)
    return scenes


def contact_sheet(scenes):
    sheet = Image.new('RGB', (1170, 1210), PAPER)
    draw = ImageDraw.Draw(sheet)
    caption(draw, (24, 18), 'Three finishes for the sharper pieces', 47, bold=True)
    caption(draw, (24, 81), 'Same fights at phone scale  ·  390 × 656 at DPR 3', 30, color=MUTED)
    for i, label in enumerate(LABELS):
        caption(draw, (204 + 381 * i, 139), label, 38, bold=True, center=True)
    y = 208
    for name, index, label in (('mid-wave', 0, 'Window Money crowd'), ('mid-wave', 1, 'Towers on grass'),
                               ('old-keep-night', 0, 'Old Keep gate at night')):
        captures, crops = scenes[name]
        _, box = crops[index]
        caption(draw, (28, y), label, 31, bold=True)
        for i, capture in enumerate(captures):
            crop = capture.crop(box)
            sheet.paste(crop, (204 + 381 * i - crop.width // 2, y + 42))
        y += crop.height + 72
    webp(sheet, 'contact-sheet')


if __name__ == '__main__':
    if sys.argv[1] == 'finish':
        finish_poses(Path(sys.argv[2]))
    elif sys.argv[1] == 'sheets':
        OUT.mkdir(parents=True, exist_ok=True)
        piece_sheets()
        contact_sheet(battle_sheets(Path(sys.argv[2])))
