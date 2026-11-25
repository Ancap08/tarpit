"""Prepare the repository art and comparison sheets for the M54 stills."""

import json
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "assets/art-painted"
OUTPUT = ROOT / "docs/review/m54"
SCRATCH = Path(sys.argv[1])
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
INK, SOFT, GROUND = "#172b2d", "#4f6663", "#e7eee8"
SPRITES = ("musketeer", "cannon", "tar-pit", "longbow", "mortar", "fire-pot",
           "shieldbearer", "harpy")


def atlas(kind, density):
    packed = ART / "packed" / f"shared-{density}x"
    meta = json.loads(packed.with_suffix(".json").read_text())[kind]
    sheet = Image.open(packed.with_suffix(".webp")).convert("RGBA")
    left, top = meta["offset"]
    width, height = meta["frameSize"]
    regions = []
    for idx, _ in enumerate(meta["frameOrder"]):
        x = left + idx % meta["columns"] * width
        y = top + idx // meta["columns"] * height
        regions.append(sheet.crop((x, y, x + width, y + height)))
    return meta, regions


def board():
    # Extend the phone plate along its grass and river edges. The mock HTML
    # keeps actors on the corresponding unextended board coordinates.
    phone = Image.open(SCRATCH / "board-phone.png").convert("RGB")
    extension = 23
    width, height = phone.size
    out = Image.new("RGB", (width + 2 * extension, height))
    out.paste(phone, (extension, 0))
    out.paste(ImageOps.mirror(phone.crop((0, 0, extension, height))), (0, 0))
    out.paste(ImageOps.mirror(phone.crop((width - extension, 0, width, height))), (width + extension, 0))
    out.save(SCRATCH / "phone-extended.png")
    meta_by_kind = {}
    for kind in SPRITES:
        meta, frames = atlas(kind, 2)
        used = (0, 4, 8, 12) if kind in ("shieldbearer", "harpy") else (0, 4, 6, 8, 12)
        for n in used:
            frames[n].save(SCRATCH / f"{kind}-{n}.png")
        meta_by_kind[kind] = { "anchor": meta["anchor"], "size": meta["frameSize"] }
    (SCRATCH / "sprites.json").write_text(json.dumps(meta_by_kind))


def sprite_sheet():
    sheet = Image.new("RGB", (1508, 892), GROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((40, 34), "Painted sprites, in detail", font=ImageFont.truetype(BOLD, 42), fill=INK)
    draw.text((42, 92), "Same miniatures and poses. Current game art on the left, a new Blender render on the right.",
              font=ImageFont.truetype(FONT, 19), fill=SOFT)
    draw.text((42, 121), "The top pair in each column uses the phone’s physical pixels. The lower pair is enlarged 2.4×.",
              font=ImageFont.truetype(FONT, 19), fill=SOFT)
    for index, (kind, name, frame) in enumerate((
        ("cannon", "Cannon", 6), ("shieldbearer", "Redcoat Shieldbearer", 8), ("harpy", "Royal Harpy", 8)
    )):
        meta, frames = atlas(kind, 2)
        current = frames[frame].crop(meta["bodyBounds"][frame])
        smooth = Image.open(SCRATCH / f"{kind}-smooth.png").convert("RGBA")
        smooth = smooth.crop(smooth.getchannel("A").point(lambda n: 255 if n >= 100 else 0).getbbox())
        # A 390 × 844 taxed phone fits a 480 × 1232 canvas by height.
        # Atlas pixels are 2× world pixels. Phaser caps Harpy width at 42.
        scale = min(390 / 480, 844 / 1232) * 3 / 2
        body_height = round(current.height * scale)
        x = 40 + index * 480
        draw.rounded_rectangle((x, 169, x + 468, 844), 20, fill="#f7faf5")
        draw.text((x + 20, 192), name, font=ImageFont.truetype(BOLD, 23), fill=INK)
        for k, caption in enumerate(("Current", "Smoother")):
            draw.text((x + 123 + k * 222, 253), caption, anchor="mm",
                      font=ImageFont.truetype(BOLD, 18), fill=SOFT)
        for bottom, zoom, tag in ((413, 1, "390-wide phone · DPR 3"), (750, 2.4, "Enlarged · 2.4×")):
            draw.rounded_rectangle((x + 14, bottom - (118 if zoom == 1 else 236), x + 454, bottom + 18),
                                   16, fill="#d8e6df")
            for k, art in enumerate((current, smooth)):
                size = (round(current.width * scale * zoom), round(body_height * zoom))
                # Match the shipped body box, including the Harpy’s width cap.
                drawn = art.resize(size, Image.Resampling.BICUBIC)
                centre = x + 123 + k * 222
                sheet.paste(drawn, (centre - drawn.width // 2, bottom - drawn.height), drawn)
            draw.text((x + 234, bottom + 42), tag, anchor="mm",
                      font=ImageFont.truetype(FONT, 18), fill=SOFT)
    sheet.save(OUTPUT / "sprite-comparison.png", optimize=True)


def contact():
    sheet = Image.new("RGB", (1640, 946), "#101e20")
    draw = ImageDraw.Draw(sheet)
    title = ImageFont.truetype(BOLD, 26)
    draw.text((16, 15), "Window Money  /  Same level, three directions", font=title, fill="#f0f6ed")
    for i, (name, picture, color) in enumerate((
        ("Current", SCRATCH / "current-phone.png", "#e4d4b0"),
        ("A  Clean", OUTPUT / "a-clean-01-mid-wave.png", "#a9f9d8"),
        ("B  Fine print", OUTPUT / "b-fine-print-01-mid-wave.png", "#f8e9ce"),
        ("C  Bold", OUTPUT / "c-bold-01-mid-wave.png", "#ffda5d"),
    )):
        x = 16 + i * 406
        draw.text((x, 53), name, font=title, fill=color)
        sheet.paste(Image.open(picture).convert("RGB"), (x, 86))
    sheet.save(OUTPUT / "contact-sheet.png", optimize=True)


if __name__ == "__main__":
    {"board": board, "sheets": lambda: (sprite_sheet(), contact())}[sys.argv[2]]()
