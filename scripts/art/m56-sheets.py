"""Compose the M56 comparison from the shipped atlases and browser captures.

Run with Pillow after m56-review.ts, using the same scratch directory.
"""
import json
from pathlib import Path
import runpy
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / 'docs/review/m56'
SCRATCH = Path(sys.argv[1])
PACKER = runpy.run_path(str(HERE / 'm56-pieces.py'))
ART = PACKER['ART']
LEGACY = ART / 'packed/shared-2x'
OLD = Image.open(LEGACY.with_suffix('.webp')).convert('RGBA')
STOCK = json.loads(LEGACY.with_suffix('.json').read_text())
NEW = json.loads((ART / 'sharp/layout.json').read_text())
BG, PAPER, GROUND, INK, MUTED = '#e7eee8', '#f7faf5', '#d8e6df', '#172b2d', '#4f6663'
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def caption(draw, x, y, text, size=22, *, bold=False, center=False, color=INK):
    draw.text((x, y), text, font=ImageFont.truetype(BOLD if bold else FONT, size), fill=color,
              anchor='mt' if center else 'lt')


def frame(kind, i, density):
    entry = NEW[f'{kind}-{density}x' if kind != 'ram' else 'ram-keep']
    with Image.open(ART / 'sharp' / (entry['atlas'] + '.webp')) as image:
        x, y, w, h, dx, dy = entry['regions'][i]
        sharp = Image.new('RGBA', entry['frameSize'])
        sharp.paste(image.crop((x, y, x + w, y + h)), (dx, dy))
    if kind == 'ram':
        with Image.open(ROOT / 'public/assets/keep/siege-machines-half.webp') as image:
            legacy = image.crop((96 * i, 0, 96 * (i + 1), 64)).convert('RGBA')
        return legacy, sharp, 96 / 88, sharp.width / 88
    legacy = next(image for j, image in enumerate(PACKER['shipped_frames'](OLD, STOCK[kind])) if i == j)
    return legacy, sharp, 2, entry['density']


def trim_scaled(image, sx, sy, zoom):
    scaled = image.resize((round(image.width * sx * zoom), round(image.height * sy * zoom)),
                          Image.Resampling.BICUBIC)
    return scaled.crop(scaled.getbbox())


def pieces(filename, title, note, subjects, *, keep=False, columns=3):
    spacing, margin = 16, 30
    # Pre-size the cards at physical scale. A boss's enlarged pose must fit
    # without reducing it or overlapping the next actor.
    cards = []
    for kind, label, pose in subjects:
        a, b, da, db = frame(kind, pose, 4 if keep else 2)
        sx = 3 * 844 / (1194 if keep else 1388)
        sy = sx * (1.5 if keep else 1)
        if kind == 'ram':
            sx *= 1.26
            sy *= 1.26
        cards.append((label, [[trim_scaled(art, sx/density, sy/density, zoom) for zoom in (1, 2.4)]
                              for art, density in ((a, da), (b, db))]))
    width = max(390, 2 * max(art.width for _, pairs in cards for _, art in pairs) + 60)
    first = max(110, max(art.height for _, pairs in cards for art, _ in pairs) + 24)
    second = max(160, max(art.height for _, pairs in cards for _, art in pairs) + 24)
    height = 127 + first + second
    rows = (len(cards) + columns - 1) // columns
    total_width = max(1100, 2*margin + columns*width + (columns-1)*spacing)
    sheet = Image.new('RGB', (total_width, 116 + rows*height + (rows-1)*spacing + margin), BG)
    draw = ImageDraw.Draw(sheet)
    caption(draw, margin, 24, title, 38, bold=True)
    caption(draw, margin, 76, note, color=MUTED)
    for idx, (label, pairs) in enumerate(cards):
        x = margin + idx % columns * (width + spacing)
        y = 116 + idx // columns * (height + spacing)
        draw.rounded_rectangle((x, y, x + width, y + height), 16, fill=PAPER)
        caption(draw, x + 15, y + 16, label, 21, bold=True)
        split = y + 71 + first
        for i, (name, (phone, enlarged)) in enumerate(zip(('Today', 'Sharper'), pairs)):
            mid = x + width * (1 + 2*i) // 4
            caption(draw, mid, y + 49, name, 17, bold=True, center=True, color=MUTED)
            for top, bottom, sprite in ((y + 71, split, phone), (split + 29, y + height - 25, enlarged)):
                draw.rounded_rectangle((mid - width//4 + 5, top, mid + width//4 - 5, bottom), 10, fill=GROUND)
                left = mid - sprite.width//2
                at = (top + bottom - sprite.height)//2
                sheet.paste(sprite, (left, at), sprite)
            caption(draw, mid, split + 6, 'Phone pixels above  ·  2.4× below', 13, center=True, color=MUTED)
    sheet.save(OUT / (filename + '.png'), optimize=True)


def crop(image, point, width, height, lift=0):
    x, y = [round(3 * point[k]) for k in ('x', 'y')]
    left = max(0, min(image.width - width, x - width//2))
    top = max(0, min(image.height - height, y - height//2 - lift))
    return image.crop((left, top, left + width, top + height)).resize((3*width, 3*height),
                                                                      Image.Resampling.NEAREST)


def battle(level, height, filename, title):
    sides = []
    for switch in ('off', 'on'):
        name = f'{level}-{height}-painted-{switch}'
        shot = Image.open(SCRATCH / (name + '.png')).convert('RGB')
        pos = json.loads((SCRATCH / (name + '.json')).read_text())
        if level == 25:
            detail = [crop(shot, pos['gate'], 380, 330, 105)]
        else:
            pair = {k: (pos['a'][k] + pos['b'][k]) / 2 for k in ('x', 'y')}
            detail = [crop(shot, pos['crowd'], 330, 177, 48), crop(shot, pair, 350, 425, 28)]
        sides.append((shot, detail))
    margin = 24
    w, h = sides[0][0].size
    sheet = Image.new('RGB', (2*w + 3*margin, h + sum(pic.height for pic in sides[0][1])
                             + 185 + 54 * len(sides[0][1])), BG)
    draw = ImageDraw.Draw(sheet)
    caption(draw, margin, 20, title, 46, bold=True)
    caption(draw, margin, 79, f'390 × {height} CSS px  ·  DPR 3  ·  Same battle state in both captures', 27, color=MUTED)
    for i, (shot, detail) in enumerate(sides):
        x = margin + i * (margin + w)
        caption(draw, x, 135, ('Switch off  ·  Today', 'Switch on  ·  Sharper')[i], 30, bold=True)
        sheet.paste(shot, (x, 177))
        y = 177 + h
        for j, pic in enumerate(detail):
            caption(draw, x, y + 13, ('Gate crowd' if level == 25 else ('Crowd' if j == 0 else 'Two towers')) + '  ·  3× crop',
                    25, bold=True)
            sheet.paste(pic, (x, y + 54))
            y += 54 + pic.height
    sheet.save(OUT / (filename + '.webp'), lossless=True, quality=85, method=4)


OUT.mkdir(parents=True, exist_ok=True)
pieces('pieces-towers', 'The six painted towers',
       'Each model covers all upgrade levels and both paths. Poses are shown at the same scale.',
       [(kind, label, 6) for kind, label in (('musketeer', 'Musketeer'), ('cannon', 'Cannon'),
        ('tar-pit', 'Tar Pit'), ('longbow', 'Longbow'), ('mortar', 'Mortar'), ('fire-pot', 'Fire Pot'))])
pieces('pieces-enemies', 'The King’s collectors',
       'Matched poses and footprints at 390 × 844, DPR 3. Each lower pair is enlarged 2.4×.',
       [('goblin', 'Goblin Collector', 8), ('wolf', 'Revenue Hound', 4), ('shieldbearer', 'Redcoat Shieldbearer', 8),
        ('harpy', 'Royal Harpy', 8), ('troll', 'Toll Troll', 4)])
pieces('pieces-bosses', 'The two bosses',
       'Matched poses and footprints at 390 × 844, DPR 3.', [('grumblefoot', 'Assessor Grumblefoot', 8),
        ('grumblemaw', 'King Grumblemaw', 8)], columns=2)
pieces('pieces-guards', 'The Old Keep squad',
       'Shown at the settled battle scale on a 390 × 844 phone, DPR 3.',
       [('guard', 'Axeman', 2), ('guard', 'Swordsman', 10), ('guard', 'Archer', 18),
        ('guard', 'Captain', 26)], keep=True, columns=2)
pieces('piece-ram', 'The siege ram',
       'Shown at its gate approach size on a 390 × 844 phone, DPR 3.', [('ram', 'Siege Ram', 0)],
       keep=True, columns=1)
for height in (656, 844):
    battle(11, height, f'mid-wave-390x{height}', 'Window Money  /  Mid-wave')
battle(25, 844, 'old-keep-390x844', 'The King’s Last Notice  /  Gate crowd')
