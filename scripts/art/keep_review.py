"""Native-resolution castle studies and an inventory of the raw runtime layers."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public/assets/keep"
OUTPUT = ROOT / "docs/review/m51"


def plate(name):
    with Image.open(SOURCE / (name + ".webp")) as image:
        return image.convert("RGBA")


def studies():
    size = plate("gate").size
    for name, layers in [("keep-dusk-detail", ["far", "crown", "gate"]),
                         ("keep-lightning-detail", ["lightning"])]:
        sky = plate("sky").resize(size, Image.Resampling.LANCZOS)
        if name == "keep-lightning-detail":
            sky = Image.blend(sky, Image.new("RGBA", size, "#c3cfdf"), .28)
        for layer in layers:
            sky.alpha_composite(plate(layer))
        sky.convert("RGB").save(OUTPUT / (name + ".jpg"), quality=95, subsampling=0)


def contact():
    names = sorted(path.stem for path in SOURCE.glob("*.webp"))
    tile_w, tile_h = 380, 262
    sheet = Image.new("RGB", (tile_w * 3, tile_h * ((len(names)+2)//3)), "#1c232c")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 17)
    except OSError:
        font = ImageFont.load_default()
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
    studies()
    contact()
