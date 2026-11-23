"""Compose packed production frames before and after milestone 44b at native 1× and 2×."""
from io import BytesIO
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PACKED = Path("assets/art-painted/packed")
BEFORE = "188a487b66e654ee168a294652c7750c43189816"
ROLES = ("axeman", "swordsman", "archer", "captain")
CAST = (
    ("goblin", "Goblin Collector"), ("wolf", "Revenue Hound"),
    ("shieldbearer", "Redcoat Shieldbearer"), ("harpy", "Royal Harpy"),
    ("troll", "Toll Troll"), ("grumblefoot", "Assessor Grumblefoot"),
    ("grumblemaw", "King Grumblemaw"), *((role, role.title()) for role in ROLES),
)
PAPER, TYPE, MUTED = "#F5EDDB", "#202E34", "#51606A"


def packed(density, old):
    def asset(ext):
        path = PACKED / f"shared-{density}x.{ext}"
        if old:
            return subprocess.check_output(["git", "show", f"{BEFORE}:{path}"], cwd=ROOT)
        return (ROOT / path).read_bytes()
    return json.loads(asset("json")), Image.open(BytesIO(asset("webp"))).convert("RGBA")


def poses(atlas, actor, old):
    layout, pixels = atlas
    guard = actor in ROLES
    meta = layout["guard" if guard else actor]
    prefix = f"{actor}-" if guard and not old else ""
    labels = ("S-idle", "E-strike") if guard else ("S-0", "E-1")
    w, h = meta["frameSize"]
    for label in labels:
        index = meta["frameOrder"].index(prefix + label)
        x = meta["offset"][0] + (index % meta["columns"]) * w
        y = meta["offset"][1] + (index // meta["columns"]) * h
        yield pixels.crop((x, y, x + w, y + h)), meta["anchor"]


def main():
    columns = [(1, True), (1, False), (2, True), (2, False)]
    sets = [packed(d, old) for d, old in columns]
    widths = (185, 250, 250, 460, 460)
    heights = [max(108, sets[-1][0]["guard" if a in ROLES else a]["frameSize"][1] + 12)
               for a, _ in CAST]
    sheet = Image.new("RGB", (sum(widths), 102 + sum(heights)), PAPER)
    ink = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=16)
    ink.text((16, 10), "The King's collectors", font=ImageFont.load_default(size=31), fill=TYPE)
    ink.text((16, 52), "Front and side views from the shipped atlas. Guards show the strike from the side.",
             font=font, fill=MUTED)
    for i, (d, old) in enumerate(columns):
        x = sum(widths[:i+1])
        ink.text((x+9, 80), f"{d}x   {'Before' if old else 'After'}", font=font, fill=TYPE)
    y = 102
    for row, ((actor, title), height) in enumerate(zip(CAST, heights)):
        ink.rectangle((0, y, sheet.width, y+height-1), fill="#CFC7AF" if row % 2 else "#D8D2BC")
        ink.text((12, y+height//2), title, anchor="lm", font=font, fill=TYPE)
        for i, (_, old) in enumerate(columns):
            left, width = sum(widths[:i+1]), widths[i+1]
            ink.line((left, y, left, y+height-1), fill="#ACA891")
            frames = list(poses(sets[i], actor, old))
            for p, (frame, anchor) in enumerate(frames):
                x = left + width * (2*p+1)//4 - anchor[0]
                top = y + (height - frame.height)//2
                sheet.paste(frame, (x, top), frame)
        y += height
    output = ROOT / "docs/art/theme/characters.jpg"
    output.parent.mkdir(exist_ok=True, parents=True)
    sheet.save(output, quality=91, subsampling=0, optimize=True)


if __name__ == "__main__":
    main()
