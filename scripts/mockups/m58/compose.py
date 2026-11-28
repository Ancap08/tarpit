"""Compose the two level 21 still studies from the shipping art and captured board.

From the repo root, build with `npm run build -- --outDir "$M58_SCRATCH/build"`.
Run capture.ts with Node's --experimental-strip-types, PW_PORT=4576, and
the scratch path. With at least 3 GB free, run miniatures.py in Blender.
Then run `python3 scripts/mockups/m58/compose.py SCRATCH A1` followed by
`python3 scripts/mockups/m58/compose.py SCRATCH A2 --sheets`.

The only game pixels replaced are in the board area. Board positions come from
capture.ts. Queue positions are display-only offsets from the captured state.
"""
import argparse
import json
import math
from pathlib import Path
import random
import shutil
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / "docs/review/m58"
KEEP = ROOT / "public/assets/keep"
SPRITES = ROOT / "assets/art-painted/sharp"
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
sys.path.insert(0, str(ROOT / "scripts/art"))
import keep_weather as paint

S = paint.S = 2
RESAMPLE = Image.Resampling.LANCZOS
CASES = ("phone-setup", "phone-gate", "wide-gate")
# Bounds in the untouched CSS-pixel captures. The first three numbers are the
# viewport and map edges; the rest describe hill and Keep placement.
FRAMING = {
    "phone": {
        "edges": (0, 390, 537),
        "A1": ([(0, 243), (.17, 238), (.38, 235), (.57, 245), (.76, 222), (1, 240)],
               (67, 150, 261, 110)),
        "A2": ([(0, 200), (.23, 210), (.42, 197), (.60, 204), (.79, 195), (1, 207)],
               (92, 154, 209, 60)),
    },
    "wide": {
        "edges": (88, 1191, 685),
        "A1": ([(0, 289), (.16, 310), (.36, 291), (.53, 302), (.72, 258), (1, 222)],
               (271, 134, 520, 187)),
        "A2": ([(0, 219), (.16, 227), (.36, 219), (.53, 226), (.71, 217), (1, 176)],
               (323, 137, 390, 99)),
    },
}


def pixel(point):
    return tuple(round(value * S) for value in point)


def point(entry):
    return entry["x"], entry["y"]


def tween(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def composite(plate, sprite, x, y, width, height):
    sprite = sprite.resize(pixel((width, height)), RESAMPLE)
    plate.composite(sprite, x, y)


def ridge_line(left, right, anchors):
    result = []
    for x in range(left - 4, right + 6, 3):
        t = max(0, min(1, (x - left) / (right - left)))
        a, b = next((a, b) for a, b in zip(anchors, anchors[1:]) if a[0] <= t <= b[0])
        v = (t - a[0]) / (b[0] - a[0])
        height = a[1] + (b[1] - a[1]) * v * v * (3 - 2 * v)
        height += 2.6 * math.sin(x / 14) + 1.4 * math.sin(x / 5.4)
        result.append((x, height))
    return result


def below(plate, line):
    mask = Image.new("L", plate.image.size)
    ImageDraw.Draw(mask).polygon(plate.xy(line + [(plate.w + 8, plate.h), (-8, plate.h)]), 255)
    return mask


def skyline(plate, scratch, left, right, ridge, castle, strength):
    x, y, width, height = castle
    sky = Image.open(KEEP / "sky-half.webp").convert("RGB")
    sky = ImageOps.fit(sky.crop((30, 174, 1280, 577)),
                       ((right - left) * S, (round(max(y for _, y in ridge)) + 35) * S))
    neutral_sky = ImageOps.colorize(sky.convert("L"), (62, 75, 87), (170, 164, 147), mid=(120, 123, 121))
    sky = Image.blend(neutral_sky, sky, .17).convert("RGBA")
    plate.composite(sky, left, 0)

    # Folds are built back to front, with lighter color in the distance.
    for index, (lift, color) in enumerate(((48, (107, 116, 118)), (30, (92, 106, 109)), (13, (77, 95, 97)))):
        line = [(px, py - lift + (11 - 2 * index) * math.sin(px / (29 + 17 * index) + index * 2)
                 + 4 * math.sin(px / (8 + index)) + plate.rng.uniform(-1.7, 1.7)) for px, py in ridge]
        plate.poly(line + [(right, plate.h), (left, plate.h)], color)
        for (ax, ay), (bx, by) in zip(line[::2], line[2::2]):
            if by < ay:
                plate.poly([(ax, ay), (bx, by), (bx + 12 + index * 5, by + 19)], paint.colour(color, 4))

    castle_art = Image.open(scratch / "distant-keep.png").convert("RGBA")
    castle_art = castle_art.crop(castle_art.getbbox())
    # Keep the tiny lit windows while compressing the tonal range of the stone.
    graded = []
    for r, g, b, a in castle_art.getdata():
        light = .28 * r + .57 * g + .15 * b
        warm = max(0, min(1, (r - b - 29) / 94)) if r > 112 else 0
        if strength == "A1":
            color = paint.rgb((45, 57, 66), (118, 129, 124), light / 255)
            color = paint.rgb(color, (169, 146, 113), warm * .63)
        else:
            color = paint.rgb((27, 37, 47), (47, 58, 65), light / 255)
            color = paint.rgb(color, (187, 151, 110), warm * .77)
        graded.append((*color, a))
    castle_art.putdata(graded)
    composite(plate, castle_art, x, y, width, height)

    # Put low mist in front of the base. The next, nearer shoulder occludes
    # the feet and the ends of the old curtain wall.
    veil = Image.new("RGBA", plate.image.size, (130, 143, 139))
    fog = Image.new("L", plate.image.size)
    draw = ImageDraw.Draw(fog)
    for px, py in ridge:
        draw.ellipse(plate.xy([(px - 15, py - 22), (px + 13, py + 11)]), 108)
    veil.putalpha(fog.filter(ImageFilter.GaussianBlur(9 * S)))
    plate.image.alpha_composite(veil)


def plateau(plate, ridge, road, sites, gate, unit):
    mask = below(plate, ridge)
    w, h = plate.image.size
    rng = plate.rng
    broad = paint.noise((w, h), (5, 14), rng)
    stone = paint.noise((w, h), (47, 51), rng)
    grain = Image.blend(broad, stone, .32)
    terrain = ImageOps.colorize(grain, (59, 66, 63), (122, 123, 104),
                               mid=(83, 92, 83)).convert("RGBA")
    # All close objects use a soft key from the upper left. A little of the
    # distant haze spills over the crest and falls away onto the board.
    edge = Image.new("L", (w, h))
    draw = ImageDraw.Draw(edge)
    for x, y in ridge:
        draw.line(plate.xy([(x, y - 5), (x + 3, y - 5)]), 182, width=round(34 * unit * S))
    haze = Image.new("RGBA", (w, h), (114, 127, 120))
    haze.putalpha(edge.filter(ImageFilter.GaussianBlur(12 * unit * S)))
    terrain.alpha_composite(haze)
    plate.image.paste(terrain, (0, 0), mask)

    # Sparse slate seams and scattered low rocks leave the playable area quiet.
    def clear(x, y, padding):
        return (paint.distance_to_road((x, y), road) > (14 + padding) * unit
                and all(math.dist((x, y), site) > (13 + padding) * unit for site in sites)
                and math.dist((x, y), gate) > (25 + padding) * unit)

    for _ in range(round(plate.w * .52)):
        x = rng.uniform(5, plate.w - 5)
        y = rng.uniform(min(py for _, py in ridge) + 10, plate.h - 6)
        xs, ys = pixel((x, y))
        if not mask.getpixel((xs, ys)) or not clear(x, y, 2):
            continue
        color = terrain.getpixel((xs, ys))[:3]
        length = rng.uniform(3, 18) * unit
        plate.line([(x, y), (x + .55 * length, y - 1.1 * unit),
                    (x + length, y - .8 * unit)], paint.colour(color, rng.uniform(-8, 10)), .65 * unit)
        if rng.random() < .16:
            paint.rock(plate, x, y, length * .62, length * .24, paint.colour(color, -8))


def shoulder(plate, points, unit):
    """Quiet exposed beds, set above a low bank outside the open roads."""
    rng = plate.rng
    lip = []
    for a, b in zip(points, points[1:]):
        segments = max(2, round(math.dist(a, b) / (9 * unit)))
        for i in range(segments):
            x, y = tween(a, b, i / segments)
            lip.append((x, y + rng.uniform(-2, 2.5) * unit))
    lip.append(points[-1])
    foot = [(x + rng.uniform(-2, 2) * unit,
             y + rng.uniform(6, 11) * unit * math.sin(math.pi * i / (len(lip) - 1)))
            for i, (x, y) in enumerate(lip)]
    plate.poly(lip + foot[::-1], "#4b554e")
    for i, ((x, y), (xx, yy)) in enumerate(zip(lip, lip[1:])):
        shade = rng.uniform(-8, 8)
        plate.poly([(x, y), (xx, yy), foot[i + 1], foot[i]], paint.colour((77, 86, 79), shade))
        if i % 3 != 1:
            plate.line([(x, y), (xx, yy)], paint.colour((106, 113, 100), shade), .7 * unit)
        if i % 3 == 2:
            rx, ry = foot[i]
            paint.rock(plate, rx, ry, 5.5 * unit, 2 * unit, (82, 91, 80))


def outlying_terrain(plate, phone):
    # Lower stretches of the crag curve around the first and last approaches.
    # The broad west side of landscape leaves room for the old ward ruins.
    if phone:
        unit = 1
        banks = [
            [(-14, 282), (16, 273), (43, 275), (73, 262), (90, 260)],
            [(265, 291), (298, 287), (318, 277), (339, 275), (361, 260), (399, 257)],
            [(-13, 480), (19, 472), (45, 479), (69, 469)],
            [(263, 469), (293, 453), (330, 458), (357, 446), (393, 450)],
        ]
        ruins = [(22, 476, 38, 22), (360, 447, 30, 23)]
    else:
        unit = 2.1
        banks = [
            [(76, 422), (147, 415), (194, 390), (238, 386), (291, 360), (376, 363), (462, 339)],
            [(181, 545), (262, 541), (339, 512), (404, 522), (458, 506), (525, 482), (581, 486)],
            [(83, 624), (149, 610), (217, 617), (291, 593), (354, 591), (415, 577)],
            [(760, 376), (824, 362), (887, 365), (931, 346), (973, 343)],
        ]
        ruins = [(202, 590, 87, 45), (249, 479, 59, 36)]
    for bank in banks:
        shoulder(plate, bank, unit)
    weathered = paint.Plate((plate.w, plate.h))
    for x, y, width, height in ruins:
        paint.broken_ward(weathered, x, y, width, height)
    alpha = weathered.image.getchannel("A").point(lambda value: value * .27)
    weathered.image = ImageEnhance.Color(weathered.image).enhance(.34)
    weathered.image.putalpha(alpha)
    plate.image.alpha_composite(weathered.image)


def pave(plate, path, width, *, closed=False):
    """Dress the exact centreline with a shallow, wheel-worn stone road."""
    rng = plate.rng
    unit = width / 24
    for span, color, dy in (
        (width + 3.2 * unit, "#474f48", 1.5 * unit),
        (width, "#8e8d7d", 0),
        (width - 2.7 * unit, "#73766b", 0),
        (width - 4.8 * unit, "#868277" if closed else "#a09887", 0),
    ):
        points = [(x, y + dy) for x, y in path]
        plate.line(points, color, span)
        for x, y in points:
            plate.oval(x, y, span / 2, span / 2, color)
    body = (134, 130, 119) if closed else (157, 152, 136)
    for a, b in zip(path, path[1:]):
        length = math.dist(a, b)
        u = tuple((q - p) / length for p, q in zip(a, b))
        normal = -u[1], u[0]
        rows = max(1, round(length / (3.8 * unit)))
        half = width / 2 - 2.7 * unit

        def at(s, t):
            return a[0] + s * u[0] + t * normal[0], a[1] + s * u[1] + t * normal[1]

        for row in range(rows):
            start, end = length * row / rows, length * (row + 1) / rows
            left = -half
            while left < half - .6 * unit:
                right = min(half, left + rng.uniform(2.1, 5.3) * unit)
                shade = paint.colour(body, rng.uniform(-12, 10))
                inset = .33 * unit
                plate.poly([at(start + inset, left + inset), at(start + .1 * unit, right - inset),
                            at(end - inset, right - inset), at(end - inset, left + inset)], shade)
                if rng.random() < .54:
                    plate.line([at(start + inset, left + inset), at(start + inset, right - inset)],
                               paint.colour(shade, 13), .46 * unit)
                left = right


def stone_steps(plate, road, unit):
    """The last existing stair reaches a cut in the upper terrace."""
    a, b = road[-2:]
    ux, uy = ((q - p) / math.dist(a, b) for p, q in zip(a, b))
    for i in range(9):
        x, y = tween(a, b, i / 9)
        ends = [(x + t * uy * unit, y - t * ux * unit) for t in (-9.7, 9.7)]
        plate.line(ends, "#555d55", 1.65 * unit)
        plate.line([(x, y - .8 * unit) for x, y in ends], "#c5b59a", .62 * unit)
    x, y = b
    paint.pool(plate, x, y + 2 * unit, 26 * unit, 12 * unit, (34, 43, 39), 134)
    for dx, dy, width, height in (
            (-15, -5, 14, 9), (17, -7, 21, 11), (6, -11, 14, 8), (-9, -10, 14, 8)):
        paint.rock(plate, x + dx * unit, y + dy * unit, width * unit, height * unit, (88, 96, 83))

    def arch(radius, height):
        return [(x + math.cos(i * math.pi / 10) * radius * unit,
                 y - math.sin(i * math.pi / 10) * height * unit) for i in range(11)]

    plate.poly(arch(11.3, 10.8), "#858877")
    plate.poly(arch(7.2, 7.25), "#343d38")
    for a, b in zip(arch(7.2, 7.25)[1::2], arch(11.3, 10.8)[1::2]):
        plate.line([a, b], "#555e54", .62 * unit)
    plate.line(arch(10.5, 10.1), "#a29c87", .55 * unit)


def placed_marker(plate, x, y, high, unit):
    """A stone socket on grade, or on a crenellated tower outwork."""
    def polygon(points, color):
        plate.poly([(x + dx * unit, y + dy * unit) for dx, dy in points], color)

    if high:
        paint.pool(plate, x + 2 * unit, y + 8 * unit, 26 * unit, 12 * unit, (26, 37, 32), 157)
        # The plinths rise above the board while their markers and hit points
        # remain at the old wall-walk cell centres.
        crown = [(-13, -2), (-10, -8), (8, -8), (13, -3), (13, 3), (8, 7), (-9, 7), (-13, 3)]
        polygon([(-13, 1), (13, 1), (12, 14), (7, 17), (-8, 17), (-13, 12)], "#474f49")
        polygon([(-13, 2), (-8, 4), (-8, 16), (-13, 12)], "#67716a")
        polygon([(-8, 7), (7, 7), (7, 16), (-8, 16)], "#566158")
        for inset in (10, 14):
            plate.line([(x - 9 * unit, y + inset * unit), (x + 9 * unit, y + inset * unit)], "#424a43", .65 * unit)
        polygon(crown, "#a19f88")
        polygon([(-11, -3), (-8, -6), (7, -6), (11, -2), (8, 5), (-8, 5)], "#686b57")
        for a in (-10, -3, 4):
            polygon([(a, -8), (a + 4, -8), (a + 4, -5), (a, -5)], "#c0b49a")
        plate.oval(x, y, 7.2 * unit, 6 * unit, "#302e25")
        plate.oval(x, y - .45 * unit, 6.3 * unit, 5.35 * unit, "#f1c783")
        ink = "#392d23"
    else:
        paint.pool(plate, x + 1.5 * unit, y + 2 * unit, 17 * unit, 9 * unit, (25, 37, 31), 155)
        plate.oval(x, y + 1 * unit, 10 * unit, 7.55 * unit, "#313e35")
        plate.oval(x, y, 9.35 * unit, 7.05 * unit, "#9aa997")
        plate.oval(x, y, 7.35 * unit, 5.7 * unit, "#c6e6cd")
        ink = "#203c30"
    radius = 3.5 * unit
    plate.line([(x - radius, y), (x + radius, y)], ink, 1.45 * unit)
    plate.line([(x, y - radius), (x, y + radius)], ink, 1.45 * unit)


def approach_sample(path, distance):
    for a, b in zip(path, path[1:]):
        length = math.dist(a, b)
        if distance <= length:
            return tween(a, b, distance / length)
        distance -= length
    raise ValueError("Queue exceeds the open road")


def queue(enemies, gate, road):
    waiting = [e for e in enemies if e["distance"] >= gate["distance"] - 7]
    approach = [point(gate), *road[9::-1]]
    length = sum(math.dist(a, b) for a, b in zip(approach, approach[1:]))
    # In a two-abreast queue, the feet in alternate columns are staggered.
    # Stragglers follow in order behind the waiting bodies towards the mouth.
    stops = [(.052 + .050 * (i // 2) + .004 * (i % 2), (-1) ** (i + 1)) for i in range(len(waiting))]
    trailing = len(enemies) - len(waiting)
    tail = stops[-1][0] + .047
    stops += [(tail + (.959 - tail) * i / max(1, trailing - 1), 0) for i in range(trailing)]

    def seat(fraction, side):
        # Average the tangent around a corner so each column bends smoothly.
        # The paving and underlying simulation trail stay in their places.
        a = approach_sample(approach, length * (fraction - .017))
        b = approach_sample(approach, length * (fraction + .017))
        x, y = tween(a, b, .5)
        ux, uy = ((end - start) / math.dist(a, b) for start, end in zip(a, b))
        offset = side * length * .020
        face = ("W" if ux > 0 else "E") if abs(ux) > abs(uy) else ("N" if uy > 0 else "S")
        return x - uy * offset, y + ux * offset, face

    occupied = []
    for enemy, (fraction, side) in zip(enemies, stops):
        # Leave a readable gap on the inside of a bend, where evenly spaced
        # road distances alone can put two actors on top of each other.
        shifts = [0] + [sign * step * .005 for step in range(1, 9) for sign in (1, -1)]
        for shift in shifts:
            x, y, face = seat(max(.026, min(.97, fraction + shift)), side)
            if all(math.dist((x, y), previous) >= .038 * length for previous in occupied):
                break
        else:
            raise ValueError(f"No clear seat for collector {enemy['id']}")
        occupied.append((x, y))
        yield x, y, face, enemy["id"]


def actors(plate, positions, unit):
    data = json.loads((SPRITES / "layout.json").read_text())["goblin-4x"]
    atlas = Image.open(SPRITES / (data["moonAtlas"] + ".webp")).convert("RGBA")
    atlas = ImageEnhance.Color(atlas).enhance(1.18)
    zoom = unit * S * .061
    for x, y, _, _ in positions:
        paint.pool(plate, x + .75 * unit, y + .55 * unit, 8.1 * unit, 4.7 * unit,
                   (22, 27, 27), 222)
    for x, y, face, enemy_id in sorted(positions, key=lambda item: item[1]):
        frame = "NESW".index(face) * 4 + enemy_id % 4
        col, row, width, height, dx, dy = data["regions"][frame]
        sprite = atlas.crop((col, row, col + width, row + height))
        sprite = sprite.resize((round(width * zoom), round(height * zoom)), RESAMPLE)
        # Alpha dilation gives the existing sprites a dark contour at phone size.
        a, b = data["anchor"]
        target = (round(x * S + (dx - a) * zoom), round(y * S + (dy - b) * zoom))
        alpha = sprite.getchannel("A")
        rim = Image.new("RGBA", sprite.size, (27, 31, 33))
        rim.putalpha(alpha.filter(ImageFilter.MaxFilter(3)))
        plate.image.alpha_composite(rim, target)
        plate.image.alpha_composite(sprite, target)


def ui(today, board, phone, setup):
    if phone:
        panels = [(4, 2, 387, 100, 14), (6, 107, 132, 156, 8)]
        if setup:
            panels += [(136, 107, 289, 156, 8), (267, 482, 352, 526, 8)]
    else:
        panels = [(96, 4, 1182, 128, 26), (102, 145, 356, 217, 18)]
    mask = Image.new("L", pixel(today.size))
    draw = ImageDraw.Draw(mask)
    for x0, y0, x1, y1, radius in panels:
        draw.rounded_rectangle(pixel((x0, y0, x1 - 1, y1 - 1)), S * radius, fill=255)
    board.paste(today, mask=mask.resize(today.size, RESAMPLE))


def make_picture(scratch, strength, case):
    layout, phase = case.split("-")
    phone = layout == "phone"
    unit = 1 if phone else 2.1
    today = Image.open(scratch / f"today-{case}.png").convert("RGB")
    data = json.loads((scratch / f"{case}.json").read_text())
    styles = FRAMING[layout]
    left, right, bottom = styles["edges"]
    anchors, castle = styles[strength]
    plate = paint.Plate((today.width, bottom))
    ridge = ridge_line(left, right, anchors)
    skyline(plate, scratch, left, right, ridge, castle, strength)
    road = list(map(point, data["road"]))
    west = list(map(point, data["westRoad"]))
    sites = data["sites"]
    gate = point(data["gate"])
    plateau(plate, ridge, road, list(map(point, sites)), gate, unit)
    outlying_terrain(plate, phone)
    pave(plate, west, 20 * unit, closed=True)
    # Extend only the road artwork past its visible entry edge.
    a, b = road[:2]
    start = tween(a, b, -.9)
    pave(plate, [start, *road], 23 * unit)
    stone_steps(plate, road, unit)

    bx, by = point(data["blockade"])
    brace = Image.open(KEEP / "siege-blockade-half.webp").convert("RGBA")
    composite(plate, brace, bx - 23 * unit, by - 24 * unit, 46 * unit, 34.5 * unit)
    gx, gy = gate
    paint.pool(plate, gx + 4 * unit, gy - 1 * unit, 35 * unit, 19 * unit, (25, 38, 34), 157)
    ward = Image.open(scratch / f"ward-{layout}.png").convert("RGBA")
    sx, sy = json.loads((scratch / "ward-sills.json").read_text())[layout]
    scale = .116 * unit
    composite(plate, ward, gx - sx * scale, gy - sy * scale, ward.width * scale, ward.height * scale)

    for site in sites:
        x, y = point(site)
        placed_marker(plate, x, y, site["high"], unit)
    if data["enemies"]:
        display = list(queue(data["enemies"], data["gate"], road))
        assert len(display) == 32
        actors(plate, display, unit)

    result = today.copy()
    board = plate.image.resize((today.width, bottom), RESAMPLE).convert("RGB")
    result.paste(board.crop((left, 0, right, bottom)), (left, 0))
    ui(today, result, phone, phase == "setup")
    result.save(OUT / f"{strength}-{case}.png", optimize=True)


def sheets():
    font = ImageFont.truetype(FONT, 30)
    names = ("Today", "A1", "A2")
    for case in CASES:
        panels = [Image.open(OUT / f"{prefix}-{case}.png").convert("RGB") for prefix in ("today", "A1", "A2")]
        width, height = panels[0].size
        phone = case.startswith("phone")
        outer = 16
        label = 48
        if phone:
            size = (width * 3 + outer * 4, height + label + outer * 2)
        else:
            size = (width + outer * 2, (height + label + outer) * 3 + outer)
        sheet = Image.new("RGB", size, "#172224")
        draw = ImageDraw.Draw(sheet)
        for index, (name, panel) in enumerate(zip(names, panels)):
            x = outer + index * (width + outer) if phone else outer
            y = outer if phone else outer + index * (height + label + outer)
            draw.text((x + width // 2, y + 18), name, font=font, anchor="mm", fill="#f3f3e9")
            sheet.paste(panel, (x, y + label))
        sheet.save(OUT / f"A-{case}.png", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("scratch", type=Path)
    parser.add_argument("strength", choices=("A1", "A2"))
    parser.add_argument("--sheets", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for case in CASES:
        shutil.copyfile(args.scratch / f"today-{case}.png", OUT / f"today-{case}.png")
        make_picture(args.scratch, args.strength, case)
    if args.sheets:
        sheets()


if __name__ == "__main__":
    main()
