"""Compose the painted Meadow review frames from the packed Blender assets."""

import json
import math
import struct
import zlib
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageChops

sys.dont_write_bytecode = True
from build_slice import ROUTE, SCRATCH
from review_fonts import review_font
from slice_sheets import BEARINGS, ENEMIES, PROJECTILES, SCENERY, TOWERS

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/art-painted"
OUTPUT = ROOT / "docs/art/slice-meadow"
REF = ROOT / "e2e/__screenshots__"
BASELINE = REF / "visual.spec.ts/mid-wave.png"
PHONE = REF / "visual-phone.spec.ts/phone-midwave.png"
PHONE_MAP = (0, 54, 339, 732)
SHOW_BEARING = ("W", "SE", "S", "N", "SW", "N")
SHORT_NAMES = ("Musket", "Cannon", "Tar", "Longbow", "Mortar", "Fire")
OAK_VARIANT = {(295, 158): 1, (493, 88): 3, (63, 359): 1, (99, 347): 0,
               (90, 378): 2, (537, 253): 2, (785, 415): 3, (898, 294): 0}
MAP_SIZE = (960, 480)
CELL = 32
FOUR = BEARINGS[::4]
EFFECTS = PROJECTILES + ("harpy-shadow",)
PAPER = "#eae4d5"
INK = "#282a23"
DARK = "#1c2427"

# Keep the board's interior open and group plants off the trail.
SCENE = (
    ("cave", 0, 240), ("cottage", 926, 150),
    ("spruce", 43, 67), ("spruce", 65, 86), ("spruce", 89, 58), ("bush", 38, 91),
    ("oak", 295, 158), ("berry-bush", 278, 186),
    ("oak", 493, 88), ("spruce", 522, 68), ("bush", 508, 118),
    ("birch", 716, 70), ("birch", 739, 78), ("berry-bush", 717, 94),
    ("bush", 892, 128),
    ("oak", 63, 359), ("oak", 99, 347), ("oak", 90, 378), ("berry-bush", 58, 384),
    ("spruce", 279, 394), ("spruce", 296, 413), ("spruce", 334, 404), ("bush", 324, 433),
    ("oak", 537, 253), ("birch", 559, 238), ("berry-bush", 555, 274),
    ("bush", 758, 403), ("oak", 785, 415), ("spruce", 816, 397), ("bush", 810, 436),
    ("oak", 898, 294), ("birch", 922, 281), ("berry-bush", 925, 318),
)
TREE_SCALE = {
    (43, 67): 1.12, (65, 86): .83, (89, 58): .93,
    (295, 158): 1.08, (493, 88): .89, (522, 68): 1.04,
    (63, 359): 1.10, (99, 347): .82, (90, 378): .91,
    (279, 394): .94, (296, 413): 1.15, (334, 404): .80,
    (537, 253): 1.06, (785, 415): .88, (816, 397): 1.09, (898, 294): .95,
}
# Each tower uses a buildable cell centre and a resting direction for setup.
BATTERY = (
    ("musketeer", (240, 176), "SW"),
    ("cannon", (496, 304), "SE"),
    ("tar-pit", (624, 240), "SE"),
    ("longbow", (80, 144), "SE"),
    ("mortar", (784, 304), "NW"),
    ("fire-pot", (816, 112), "SE"),
)
# Base range, minimum range, and ability to target flyers from docs/DESIGN.md.
TARGETING = {
    "musketeer": (110, 0, True),
    "cannon": (105, 0, False),
    "tar-pit": (90, 0, False),
    "longbow": (150, 0, True),
    "mortar": (220, 70, False),
    "fire-pot": (100, 0, True),
}
# Staged positions intentionally exercise walk phases and silhouettes.
# Distance and lateral offset are in 1× map pixels.
WAVE = (
    ("goblin", 62, -1), ("wolf", 118, 0), ("goblin", 200, 1),
    ("shieldbearer", 274, 0), ("goblin", 358, 1), ("harpy", 424, -1),
    ("goblin", 485, 0), ("wolf", 553, 0), ("troll", 632, 1),
    ("grumblemaw", 768, 0), ("goblin", 870, 0), ("wolf", 931, 0),
    ("grumblefoot", 1040, 0), ("shieldbearer", 1195, 0),
    ("harpy", 1254, 0), ("troll", 1378, 0), ("goblin", 1470, 1),
    ("wolf", 1515, 0),
)


class Atlas:
    def __init__(self, folder, kind, density):
        stem = f"{kind}-{density}x"
        data = json.loads((folder / (stem + ".json")).read_text())
        self.size = tuple(data["frameSize"])
        self.anchor = tuple(data["anchor"])
        self.columns = data["columns"]
        self.bounds = data.get("bodyBounds")
        self.frame_count = len(data["frameOrder"])
        with Image.open(folder / (stem + ".png")) as source:
            self.image = source.convert("RGBA")

    @lru_cache(maxsize=None)
    def frame(self, index=0):
        if not 0 <= index < self.frame_count:
            raise ValueError(f"Frame {index} is outside {self.frame_count} frames")
        width, height = self.size
        left, top = index % self.columns * width, index // self.columns * height
        return self.image.crop((left, top, left + width, top + height))


def scaled_size(size, ratio):
    return tuple(max(1, round(value * ratio)) for value in size)


def resize(image, ratio):
    if ratio == 1:
        return image
    return image.resize(scaled_size(image.size, ratio), Image.Resampling.LANCZOS)


def direction(start, end):
    dx, dy = end[0] - start[0], end[1] - start[1]
    return math.degrees(math.atan2(dx, -dy))


def facing(start, end, bearings):
    step = 360 / len(bearings)
    return round(direction(start, end) / step) % len(bearings)


def trail_point(distance, lateral):
    for start, end in zip(ROUTE, ROUTE[1:]):
        length = math.dist(start, end)
        if distance < length:
            dx = (end[0] - start[0]) / length
            dy = (end[1] - start[1]) / length
            point = (start[0] + dx * distance - dy * lateral,
                     start[1] + dy * distance + dx * lateral)
            return point, facing(start, end, FOUR)
        distance -= length
    raise ValueError("Enemy is past the Meadow path")


def mapped(point, portrait):
    x, y = point
    return (MAP_SIZE[1] - y, x) if portrait else (x, y)


def first_target(tower, origin, enemies):
    outer, inner, flyers = TARGETING[tower]
    # Enemies are staged by increasing path distance, so First walks back
    # from the leading enemy and picks the first eligible point.
    for kind, position, _ in reversed(enemies):
        if (flyers or kind != "harpy") and inner <= math.dist(origin, position) <= outer:
            return position
    return None


def stamp(page, atlas, index, point, ratio, angle=0):
    frame = resize(atlas.frame(index), ratio)
    anchor = tuple(a * ratio for a in atlas.anchor)
    if angle:
        # Rotate around the declared projectile pivot rather than the crop centre.
        radius = math.ceil(math.hypot(max(anchor[0], frame.width - anchor[0]),
                                     max(anchor[1], frame.height - anchor[1])))
        padded = Image.new("RGBA", (2 * radius, 2 * radius))
        padded.alpha_composite(frame, tuple(round(radius - a) for a in anchor))
        frame = padded.rotate(-angle, resample=Image.Resampling.BICUBIC)
        anchor = (radius, radius)
    x, y = (round(p - a) for p, a in zip(point, anchor))
    page.alpha_composite(frame, (x, y))


def board(load, cell, active, portrait=False):
    density = 1 if cell == CELL else 2
    map_ratio = cell / CELL
    sprite_ratio = map_ratio / density
    ground = load("meadow", density).frame()
    if ground.size != scaled_size(MAP_SIZE, density):
        raise ValueError(f"Unexpected ground size {ground.size}")
    if portrait:
        ground = ground.transpose(Image.Transpose.ROTATE_270)
    page = resize(ground, sprite_ratio).copy()

    def draw(kind, index, point, angle=0, scale=1):
        pixels = tuple(value * map_ratio for value in point)
        stamp(page, load(kind, density), index, pixels, sprite_ratio * scale, angle)

    def depth(point):
        return mapped(point, portrait)[1]

    for kind, x, y in sorted(SCENE, key=lambda item: depth(item[1:])):
        frame = 1 if portrait and kind == "cave" else 0
        if kind == "oak":
            frame = OAK_VARIANT[(x, y)]
        draw(kind, frame, mapped((x, y), portrait), scale=TREE_SCALE.get((x, y), 1))

    def scaled_box(cx, cy, rx, ry):
        return tuple(round(v * map_ratio) for v in (cx-rx, cy-ry, cx+rx, cy+ry))

    guides = Image.new("RGBA", page.size)
    pen = ImageDraw.Draw(guides)
    # Use the game's valid-cell treatment and base Musketeer range.
    cx, cy = mapped((240, 176), portrait)
    for radius, fill, outline, line in (
        (TARGETING["musketeer"][0], (255, 242, 168, 31), (255, 242, 168, 230), 2),
        (22, None, "#fff2a8", 3),
    ):
        pen.ellipse(scaled_box(cx, cy, radius, radius), fill=fill, outline=outline,
                    width=round(line * map_ratio))
    hx, hy = mapped((304, 240), portrait)
    pen.rectangle(scaled_box(hx, hy, 15.5, 15.5), fill=(95, 211, 95, 64),
                  outline="#5fd35f", width=round(2 * map_ratio))
    page.alpha_composite(guides)

    enemies = [(kind, *trail_point(distance, lateral))
               for kind, distance, lateral in WAVE] if active else []
    figures = []
    shots = {"cannon": "cannonball", "longbow": "arrow"}
    projectiles = []
    for kind, position, resting in BATTERY:
        target = first_target(kind, position, enemies)
        heading = BEARINGS.index(resting) if target is None else facing(position, target, BEARINGS)
        if portrait:
            heading = (heading + 4) % len(BEARINGS)
        screen = mapped(position, portrait)
        figures.append((screen, kind, heading))
        if target is not None and kind in shots:
            goal = mapped(target, portrait)
            point = tuple((start + end) / 2 for start, end in zip(screen, goal))
            angle = direction(screen, goal) if shots[kind] == "arrow" else 0
            projectiles.append((shots[kind], point, angle))

    bars = []
    # Stage hit points and status on ordinary enemies only.
    hurt = {3: .70, 6: .42, 10: .22, 13: .56, 17: .34}
    for phase, (kind, position, heading) in enumerate(enemies):
        if portrait:
            heading = (heading + 1) % len(FOUR)
        atlas = load(kind, density)
        frame = heading * atlas.columns + phase % atlas.columns
        screen = mapped(position, portrait)
        if kind == "harpy":
            draw("harpy-shadow", 0, screen)
        figures.append((screen, kind, frame))
        left, top, right, bottom = atlas.bounds[frame]
        ax, ay = atlas.anchor
        if phase in hurt:
            bars.append((screen[0] + ((left + right)/2 - ax)/density,
                         screen[1] + (top - ay)/density, hurt[phase]))
        if phase in (13, 17):
            # The stock rings sit slightly outside the visible body, below
            # the sprite. Size their radius to the painted pose.
            cx = screen[0] + ((left + right)/2 - ax)/density
            cy = screen[1] + ((top + bottom)/2 - ay)/density
            radius = max(right-left, bottom-top) / (2*density)
            rings = [(3, "#2e2118")] if phase == 13 else [(3, "#ff7a1a")]
            for offset, color in rings:
                ImageDraw.Draw(page).ellipse(scaled_box(cx, cy, radius+offset, radius+offset),
                                             outline=color, width=3*round(map_ratio))

    for position, kind, index in sorted(figures, key=lambda item: item[0][1]):
        draw(kind, index, position)
    for kind, position, angle in projectiles:
        draw(kind, 0, position, angle)

    pen = ImageDraw.Draw(page)
    for x, top, hp in bars:
        px, py = round((x-16)*map_ratio), round((top-11)*map_ratio)
        unit = round(map_ratio)
        pen.rectangle((px, py, px+32*unit-1, py+6*unit-1), fill="#15171a")
        color = "#5fd35f" if hp >= .5 else "#f29a2e" if hp >= .25 else "#e0473a"
        pen.rectangle((px+unit, py+unit, px+unit+round(30*hp*unit)-1, py+5*unit-1), fill=color)

    if not portrait:
        legends = Image.new("RGBA", page.size)
        pen = ImageDraw.Draw(legends)
        face = review_font("mono-bold", round(12*map_ratio))
        for (_, (x, y), _), name in zip(BATTERY, SHORT_NAMES):
            cx, cy = x*map_ratio, (y+30)*map_ratio
            w = round((pen.textlength(name, font=face)+6*map_ratio)/2)
            pen.rectangle((cx-w, cy-8*map_ratio, cx+w, cy+8*map_ratio-1),
                          fill=(20,22,26,199))
            pen.text((cx, cy), name, font=face, anchor="mm", fill="#f2e6c9")
        page.alpha_composite(legends)
    return page


def label(draw, xy, message, size, fill=INK, anchor=None):
    draw.text(xy, message, font=review_font("sans", size), fill=fill, anchor=anchor)


def display_frame(ground, density, portrait, active):
    if portrait:
        baseline = PHONE if active else REF / "visual-phone.spec.ts/phone-meadow-wave0.png"
    else:
        baseline = BASELINE if active else REF / "visual.spec.ts/map-wave0.png"
    with Image.open(baseline) as source:
        page = source.convert("RGB")
    if portrait:
        x, y, right, bottom = PHONE_MAP
        if page.size != (340, 844):
            raise ValueError("Phone baseline changed; remeasure the map rectangle")
        ground = ground.resize((right-x, bottom-y), Image.Resampling.LANCZOS)
    else:
        x, y = 0, 0
        page = page.resize((960*density, 580*density), Image.Resampling.NEAREST)
    page.paste(ground, (x, y))
    return page


def comparison(baseline, mock):
    with Image.open(baseline) as source:
        if source.size != mock.size:
            raise ValueError(f"Comparison frame differs from {baseline}")
        current = source.convert("RGB")
    width, height = mock.size
    page = Image.new("RGB", (width*2+24, height+50), "#20292a")
    pen = ImageDraw.Draw(page)
    label(pen, (12, 15), "Current game", 18, "#eee5d2")
    label(pen, (width+36, 15), "Painted Meadow", 18, "#eee5d2")
    page.paste(current, (0, 50))
    page.paste(mock, (width+24, 50))
    return page


def contact(load):
    groups = (("Towers", TOWERS), ("Enemies", ENEMIES),
              ("Scenery", SCENERY), ("Projectiles and effects", EFFECTS))
    rows = []
    for title, kinds in groups:
        cards = []
        for kind in kinds:
            atlas = load(kind, 2)
            index = 0
            if kind in ENEMIES:
                direction_name = "E" if kind in ("wolf", "shieldbearer") else "S"
                index = FOUR.index(direction_name) * atlas.columns + 1
            elif kind in TOWERS:
                index = BEARINGS.index(SHOW_BEARING[TOWERS.index(kind)])
            full = atlas.frame(index)
            phone = resize(full, 20 / 64)
            cards.append((kind, full.crop(full.getbbox()), phone.crop(phone.getbbox())))
        rows.append((title, cards))

    gap, margin = 14, 24
    widths = [156] * max(len(cards) for _, cards in rows)
    for _, cards in rows:
        for column, (_, full, _) in enumerate(cards):
            widths[column] = max(widths[column], full.width + 24)
    width = margin * 2 + sum(widths) + gap * (len(widths)-1)
    band_heights = [(max(86, *(full.height + 12 for _, full, _ in cards)),
                     max(42, *(phone.height + 8 for _, _, phone in cards)))
                    for _, cards in rows]
    height = 184 + sum(full + phone + 75 for full, phone in band_heights) + 465
    page = Image.new("RGBA", (width, height), PAPER)
    pen = ImageDraw.Draw(page)
    label(pen, (margin, 15), "Tower silhouettes", 26)
    stride = min(100, (width - 3*margin) // 12)
    band = 6 * stride
    other = 2*margin + band
    label(pen, (margin, 49), "Painted on Meadow  /  20 px per cell", 16)
    label(pen, (other, 49), "Same poses in silhouette  /  20 px per cell", 16)
    grass = load("meadow", 2).frame()
    patch = grass.crop((0, 0, round(band*64/20), round(54*64/20)))
    page.paste(patch.resize((band, 54), Image.Resampling.LANCZOS), (margin, 75))
    pen.rectangle((other, 75, other+band-1, 128), fill="#d4cbba")
    for i, (kind, _, small) in enumerate(rows[0][1]):
        cutout = Image.new("RGBA", small.size, INK)
        cutout.putalpha(small.getchannel("A"))
        for edge, sprite in ((margin, small), (other, cutout)):
            cx = edge + i*stride + stride//2
            page.alpha_composite(sprite, (cx-sprite.width//2, 75+(54-sprite.height)//2))
            label(pen, (cx, 145), kind.replace("-", " ").title(), 14, INK, "mm")
    ground = load("meadow", 2).frame()
    top = 184
    for (title, cards), (full_height, phone_height) in zip(rows, band_heights):
        label(pen, (margin, top), title, 21)
        if title == "Towers":
            label(pen, (margin + 85, top + 4), "64 px per cell above · 20 px below", 16)
        for col, (kind, full, phone) in enumerate(cards):
            card_width = widths[col]
            left = margin + sum(widths[:col]) + col * gap
            y = top + 30
            cx = left + card_width // 2
            label(pen, (cx, y + 12), kind.replace("-", " ").title(), 16, INK, "mm")
            for image, band_y, band_h, fill in (
                (full, y + 27, full_height, "#d5cebc"),
                (phone, y + 31 + full_height, phone_height, "#c9c3b0"),
            ):
                pen.rectangle((left, band_y, left + card_width - 1, band_y + band_h - 1),
                              fill=fill)
                page.alpha_composite(image, (cx - image.width // 2,
                                             band_y + (band_h - image.height) // 2))
        top += full_height + phone_height + 75

    label(pen, (margin, top), "Four oak crowns at 1×", 21)
    for index in range(4):
        stamp(page, load("oak", 1), index, (margin + 25 + 66*index, top+68), 1)
    y = top + 83
    label(pen, (margin, y), "Meadow ground", 21)
    label(pen, (margin, y + 36), "Native 2× sample", 16)
    label(pen, (width - margin - 600, y + 36), "Full map at 20 px per cell", 16)
    sample_width = width - margin * 2 - 600 - gap
    page.alpha_composite(ground.crop((0, 96, sample_width, 396)), (margin, y + 60))
    phone_ground = resize(ground, 20 / 64).convert("RGB").quantize(40, dither=Image.Dither.NONE)
    page.paste(phone_ground, (width - margin - 600, y + 60))
    return page


def indexed_map(view, ground):
    # Reserve the ground colours. Train the remaining palette on scenery,
    # figures and overlays so that small saturated details keep their paint.
    field_rgb = ground.convert("RGB")
    delta = ImageChops.difference(view, field_rgb).convert("L")
    field = {rgb for _, rgb in field_rgb.getcolors(256)}
    field_slots = max(ground.getdata()) + 1
    pixels = []
    for count, rgb in view.getcolors(view.width * view.height):
        if rgb not in field:
            pixels.extend([rgb] * min(count, 48))
    sample = Image.new("RGB", (len(pixels), 1))
    sample.putdata(pixels)
    paint = sample.quantize(256-field_slots, dither=Image.Dither.NONE)
    custom = Image.new("P", (1, 1))
    custom.putpalette((ground.getpalette()[:field_slots*3] + paint.getpalette())[:768])
    converted = view.quantize(palette=custom, dither=Image.Dither.NONE)
    # Retain the untouched field indices exactly despite Pillow's nearest-
    # colour cache. The first palette entries match the shipping ground.
    converted.paste(ground, mask=delta.point(lambda d: 0 if d else 255))
    return converted


def save(frame, path):
    frame.save(path, optimize=True)
    if frame.mode == "RGB":
        # Screenshots contain more than 256 colours. Preserve every HUD
        # pixel. Unfiltered RGB rows compress flat palette art particularly
        # well, while Pillow selects better filters for antialiased captures.
        width = frame.width * 3
        rgb = frame.tobytes()
        rows = b"".join(b"\0"+rgb[i:i+width] for i in range(0, len(rgb), width))

        def chunk(kind, data):
            payload = kind + data
            return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload))

        ihdr = struct.pack(">2I5B", frame.width, frame.height, 8, 2, 0, 0, 0)
        png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
               + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))
        if len(png) < path.stat().st_size:
            path.write_bytes(png)
    print(f"{path.name}: {frame.width}×{frame.height}, {path.stat().st_size:,} bytes")


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    SCRATCH.mkdir(parents=True, exist_ok=True)

    @lru_cache(maxsize=None)
    def load(kind, density):
        return Atlas(ASSETS, kind, density)

    for active, state in ((False, "before"), (True, "mid-wave")):
        for density in (1, 2):
            view = board(load, CELL*density, active).convert("RGB")
            if density == 2:
                with Image.open(ASSETS / "meadow-2x.png") as ground:
                    view = indexed_map(view, ground)
            save(view, SCRATCH / f"meadow-{state}-map-{density}x.png")
            frame = display_frame(view, density, False, active)
            save(frame, SCRATCH / f"meadow-{state}-{density}x.png")
            if active and density == 1:
                save(comparison(BASELINE, frame), OUTPUT / "meadow-comparison.png")
        portrait = board(load, CELL*2, active, portrait=True)
        frame = display_frame(portrait, 1, True, active)
        save(frame, SCRATCH / f"meadow-{state}-phone.png")
        if active:
            save(comparison(PHONE, frame), OUTPUT / "meadow-comparison-phone.png")

    sheet = contact(load).convert("RGB")
    save(sheet, OUTPUT / "meadow-contact.png")


if __name__ == "__main__":
    main()
