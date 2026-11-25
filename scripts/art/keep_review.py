"""Side-by-side phone comparison and inventory of the raw runtime layers."""
from io import BytesIO
from pathlib import Path
from subprocess import check_output
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public/assets/keep"
OUTPUT = ROOT / "docs/review/m51"


def plate(name):
    with Image.open(SOURCE / (name + ".webp")) as image:
        return image.convert("RGBA")


def caption_font(size):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)
    except OSError:
        return ImageFont.load_default()


def phone_comparison():
    path = "docs/review/m51/keep-390x844.png"
    first = check_output(["git", "show", f"a449daa:{path}"], cwd=ROOT)
    with Image.open(BytesIO(first)) as old, Image.open(ROOT / path) as current:
        assert old.size == current.size == (390, 844)
        gutter, caption = 12, 38
        sheet = Image.new("RGB", (old.width * 2 + gutter, old.height + caption), "#192029")
        legend = ImageDraw.Draw(sheet)
        for i, (label, image) in enumerate([("First pass", old), ("Second pass", current)]):
            x = i * (old.width + gutter)
            sheet.paste(image, (x, caption))
            legend.text((x+12, 8), label, font=caption_font(18), fill="#f0ede4")
        sheet.save(OUTPUT / "keep-phone-comparison.png")


def contact():
    names = sorted(path.stem for path in SOURCE.glob("*.webp"))
    tile_w, tile_h = 380, 262
    sheet = Image.new("RGB", (tile_w * 3, tile_h * ((len(names)+2)//3)), "#1c232c")
    draw = ImageDraw.Draw(sheet)
    font = caption_font(17)
    for i, name in enumerate(names):
        image = plate(name)
        dimensions = image.size
        image.thumbnail((tile_w-16, tile_h-41), Image.Resampling.LANCZOS)
        x, y = i % 3 * tile_w, i // 3 * tile_h
        draw.rectangle((x+4,y+4,x+tile_w-5,y+tile_h-33), fill="#494e57")
        sheet.paste(image, (x+(tile_w-image.width)//2,y+(tile_h-31-image.height)//2), image)
        draw.text((x+10,y+tile_h-26),f"{name}   {dimensions[0]} × {dimensions[1]}",font=font,fill="#e8e2d6")
    sheet.save(OUTPUT / "keep-layers.jpg", quality=92)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    contact()
    phone_comparison()
