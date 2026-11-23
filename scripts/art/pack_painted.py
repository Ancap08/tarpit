"""Pack generated Blender sheets for on-demand play. Run after generating the map plates."""

import argparse
import json
from pathlib import Path

from PIL import Image

ART = Path(__file__).resolve().parents[2] / "assets/art-painted"
PACKED = ART / "packed"
MAPS = ("meadow", "switchback", "riverbend")


def shared(density):
    sheets = []
    for path in ART.glob(f"*-{density}x.json"):
        name = path.stem.rsplit("-", 1)[0]
        if name in MAPS:
            continue
        meta = json.loads(path.read_text())
        with Image.open(path.with_suffix(".png")) as image:
            sheets.append((name, meta, image.convert("RGBA")))
    # Place complete sheets in shelves. Their original frame order and anchors
    # are the ones used by walkers, tower bearings, guard poses and HP bars.
    width = 1024 * density
    x = y = shelf_height = 0
    layout = {}
    for name, meta, image in sorted(sheets, key=lambda item: (-item[2].height, item[0])):
        if x + image.width > width:
            x = 0
            y += shelf_height
            shelf_height = 0
        layout[name] = {**meta, "offset": [x, y]}
        x += image.width
        shelf_height = max(shelf_height, image.height)
    atlas = Image.new("RGBA", (width, y + shelf_height))
    for name, _, image in sheets:
        atlas.paste(image, tuple(layout[name]["offset"]))
    atlas.save(PACKED / f"shared-{density}x.webp", quality=95, method=6)
    (PACKED / f"shared-{density}x.json").write_text(json.dumps(layout, separators=(",", ":")) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parts", nargs="*", help="shared and/or map names; default is all")
    parts = parser.parse_args().parts or ["shared", *MAPS]
    PACKED.mkdir(exist_ok=True)
    for part in parts:
        if part not in ("shared", *MAPS):
            parser.error(f"unknown part: {part}")
        for density in (1, 2):
            if part == "shared":
                shared(density)
            else:
                with Image.open(ART / f"{part}-{density}x.png") as ground:
                    ground.convert("RGB").save(PACKED / f"{part}-{density}x.webp", quality=90, method=6)


if __name__ == "__main__":
    main()
