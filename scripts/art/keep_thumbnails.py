"""Paint the four sky and road combinations used by the Old Keep cards."""
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw, ImageOps

ASSETS = Path(__file__).resolve().parents[2] / 'public/assets'
W, H = 320, 160


def plate(name):
    return Image.open(ASSETS / 'keep' / f'{name}-half.webp').convert('RGBA')


def keep_piece(name, width):
    image = plate(name)
    image = image.crop(image.getbbox())
    return image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)


def thumbnail(sky, roads):
    paint = ImageOps.fit(plate(sky), (W, 106), Image.Resampling.LANCZOS)
    scene = Image.new('RGBA', (W, H))
    scene.alpha_composite(paint)
    draw = ImageDraw.Draw(scene)
    night = sky == 'sky-night'
    dawn = sky == 'sky-dawn'
    if night:
        bolt = [(245, 0), (228, 23), (240, 21), (220, 49), (230, 27), (220, 30)]
        draw.polygon(bolt, fill='#b2c7e8')
    if dawn:
        draw.ellipse((247, 32, 276, 61), fill='#ffe4aa')
    ridge = '#383c53' if night else '#6e5966' if not dawn else '#6a7482'
    draw.polygon([(0, 80), (31, 58), (57, 66), (97, 55), (124, 69), (146, 66), (177, 77),
                  (209, 61), (242, 73), (268, 57), (296, 65), (320, 52), (320, 160), (0, 160)], fill=ridge)
    crown = keep_piece('crown-wide', 128)
    scene.alpha_composite(crown, (101, 13))
    earth = '#343c43' if night else '#514e4b' if not dawn else '#64665a'
    draw.polygon([(0, 101), (31, 91), (81, 99), (113, 87), (172, 87), (220, 99),
                  (253, 93), (320, 108), (320, 160), (0, 160)], fill=earth)
    rng = Random(52)
    for _ in range(540):
        x, y = rng.randrange(W), rng.randrange(108, H)
        color = rng.choice((earth, '#59646c', '#7e7368') if not night else (earth, '#45515e', '#575865'))
        draw.line((x, y, x + rng.randrange(1, 7), y - 1), fill=color)
    # One downstream road per usable approach, joining below the barbican.
    west = [(3, 164), (60, 147), (79, 139), (91, 127), (122, 127), (153, 115)]
    east = [(322, 159), (288, 145), (251, 141), (230, 127), (181, 128), (153, 115)]
    verges = '#242a37' if night else '#4e423d'
    paving = '#a8a7aa' if night else '#bd9c7a' if not dawn else '#d2b586'
    routes = [route for road, route in [('west', west), ('east', east)] if roads in (road, 'both')]
    routes.append([(153, 115), (162, 108), (162, 96)])
    for color, width in [(verges, 18), (paving, 12)]:
        for route in routes:
            draw.line(route, fill=color, width=width, joint='curve')
    for route in routes[:-1]:
        for x, y in route[1:-1]:
            draw.line((x - 4, y + 1, x + 5, y - 2), fill=verges)
    wall = keep_piece('gate-wide', 290)
    scene.alpha_composite(wall, (15, 36))
    gate = plate('siege-barbican')
    gate = gate.crop((0, 0, gate.width // 2, gate.height // 2))
    gate = gate.crop(gate.getbbox())
    gate.thumbnail((104, 65), Image.Resampling.LANCZOS)
    scene.alpha_composite(gate, (161 - gate.width // 2, 108 - gate.height))
    return scene


if __name__ == '__main__':
    atlas = Image.new('RGB', (W * 2, H * 2))
    for i, (sky, roads) in enumerate([('sky', 'east'), ('sky', 'west'), ('sky-night', 'both'), ('sky-dawn', 'both')]):
        atlas.paste(thumbnail(sky, roads), (i % 2 * W, i // 2 * H))
    atlas.save(ASSETS / 'act3/keep-thumbnails.webp', quality=91, method=6)
