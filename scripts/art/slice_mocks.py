"""Compose the painted Meadow review frames from the packed Blender assets."""

import json
import math
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True
from build_slice import ROUTE
from slice_sheets import BEARINGS, ENEMIES, PROJECTILES, SCENERY, TOWERS

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/art-painted"
OUTPUT = ROOT / "docs/art/slice-meadow"
BASELINE = ROOT / "e2e/__screenshots__/visual.spec.ts/mid-wave.png"
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
    ("birch", 765, 105), ("birch", 787, 115), ("berry-bush", 758, 132),
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
    ("musketeer", (112, 176), "NE"),
    ("cannon", (240, 144), "NE"),
    ("tar-pit", (368, 240), "E"),
    ("longbow", (496, 336), "SE"),
    ("mortar", (624, 272), "SE"),
    ("fire-pot", (816, 240), "N"),
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
    ("goblin", 65, -3), ("wolf", 101, 4), ("goblin", 141, -2),
    ("troll", 201, 1), ("shieldbearer", 248, -3), ("harpy", 291, 3),
    ("goblin", 346, -1), ("wolf", 388, 3), ("shieldbearer", 434, -3),
    ("harpy", 486, 4), ("goblin", 555, 2), ("troll", 610, -2),
    ("wolf", 668, 3), ("shieldbearer", 727, -2), ("harpy", 786, 3),
    ("goblin", 849, -3), ("grumblefoot", 990, 0), ("wolf", 1127, 2),
    ("troll", 1271, -1), ("grumblemaw", 1453, 0),
)


class Atlas:
    def __init__(self, folder, kind, density):
        stem = f"{kind}-{density}x"
        data = json.loads((folder / (stem + ".json")).read_text())
        self.size = tuple(data["frameSize"])
        self.anchor = tuple(data["anchor"])
        self.columns = data["columns"]
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
        draw(kind, frame, mapped((x, y), portrait), scale=TREE_SCALE.get((x, y), 1))

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

    for phase, (kind, position, heading) in enumerate(enemies):
        if portrait:
            heading = (heading + 1) % len(FOUR)
        atlas = load(kind, density)
        frame = heading * atlas.columns + phase % atlas.columns
        screen = mapped(position, portrait)
        if kind == "harpy":
            draw("harpy-shadow", 0, screen)
        figures.append((screen, kind, frame))

    for position, kind, index in sorted(figures, key=lambda item: item[0][1]):
        draw(kind, index, position)

    for kind, position, angle in projectiles:
        draw(kind, 0, position, angle)
    return page


@lru_cache(maxsize=None)
def font(size):
    path = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def label(draw, xy, message, size, fill=INK, anchor=None):
    draw.text(xy, message, font=font(size), fill=fill, anchor=anchor)


def display_frame(ground, cell, portrait=False):
    if portrait:
        canvas = Image.new("RGBA", (480, 734), DARK)
        canvas.alpha_composite(ground, (90, 54))
        return canvas

    scale = cell // CELL
    canvas = Image.new("RGBA", (ground.width, ground.height + 100 * scale), DARK)
    canvas.alpha_composite(ground)
    return canvas


def comparison(baseline, mock):
    with Image.open(baseline) as source:
        if source.size != mock.size:
            raise ValueError(f"{baseline} has size {source.size}, expected {mock.size}")
        current = source.convert("RGB")
    width, height = mock.size
    page = Image.new("RGB", (width * 2 + 72, height + 122), PAPER)
    draw = ImageDraw.Draw(page)
    label(draw, (24, 17), "Meadow at the same map scale", 33)
    label(draw, (24, 70), "Current game capture  /  32 px per cell", 18)
    label(draw, (width + 48, 70), "Painted mid-wave mock  /  32 px per cell", 18)
    page.paste(current, (24, 98))
    page.paste(mock.convert("RGB"), (width + 48, 98))
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
                index = atlas.columns + 1
            elif kind in TOWERS:
                index = BEARINGS.index("SE")
            full = atlas.frame(index)
            phone = resize(full, 20 / 64)
            cards.append((kind, full.crop(full.getbbox()), phone.crop(phone.getbbox())))
        rows.append((title, cards))

    gap, margin = 14, 24
    card_width = max(156, *(full.width + 24 for _, cards in rows for _, full, _ in cards))
    width = margin * 2 + card_width * 7 + gap * 6
    band_heights = [(max(86, *(full.height + 12 for _, full, _ in cards)),
                     max(42, *(phone.height + 8 for _, _, phone in cards)))
                    for _, cards in rows]
    height = 102 + sum(full + phone + 75 for full, phone in band_heights) + 682
    page = Image.new("RGBA", (width, height), PAPER)
    pen = ImageDraw.Draw(page)
    label(pen, (margin, 22), "Painted Meadow pieces", 34)
    label(pen, (margin, 69), "Each piece at 64 px per cell above and 20 px per cell below", 18)
    ground = load("meadow", 2).frame()
    top = 102
    for (title, cards), (full_height, phone_height) in zip(rows, band_heights):
        label(pen, (margin, top), title, 21)
        for col, (kind, full, phone) in enumerate(cards):
            left = margin + col * (card_width + gap)
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

    y = top
    label(pen, (margin, y), "Meadow ground", 21)
    label(pen, (margin, y + 36), "Native 2× sample", 16)
    label(pen, (width - margin - 300, y + 36), "Full map at phone scale", 16)
    sample_width = width - margin * 2 - 300 - gap
    page.alpha_composite(ground.crop((0, 96, sample_width, 696)), (margin, y + 60))
    phone_ground = resize(ground.transpose(Image.Transpose.ROTATE_270), 20 / 64)
    page.alpha_composite(phone_ground, (width - margin - 300, y + 60))
    return page


def save(frame, path, *, lossless=False):
    frame.convert("RGB").save(path, format="WEBP", lossless=lossless, quality=87, method=6)
    print(f"{path.name}: {frame.width}×{frame.height}, {path.stat().st_size:,} bytes")


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)

    @lru_cache(maxsize=None)
    def load(kind, density):
        return Atlas(ASSETS, kind, density)

    for cell, suffix in ((32, "1x"), (64, "2x"), (20, "phone")):
        portrait = suffix == "phone"
        for active, state in ((False, "before"), (True, "mid-wave")):
            map_view = board(load, cell, active, portrait)
            frame = display_frame(map_view, cell, portrait)
            save(frame, OUTPUT / f"meadow-{state}-{suffix}.webp", lossless=portrait)
            if not portrait:
                save(map_view, OUTPUT / f"meadow-{state}-map-{suffix}.webp")
            if suffix == "1x" and active:
                save(comparison(BASELINE, frame), OUTPUT / "meadow-comparison.webp",
                     lossless=True)

    save(contact(load), OUTPUT / "meadow-contact.webp", lossless=True)


if __name__ == "__main__":
    main()
