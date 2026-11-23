"""Rebuild the painted Meadow slice. Run with the Mac's installed Python/Pillow."""

import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = ROOT / "assets/art-painted"
REVIEW = ROOT / "docs/art/slice-meadow"
SCRATCH = Path("/private/tmp/tarpit-art-scratch/slice")
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
ROUTE = [(0,240), (160,240), (160,96), (420,96), (420,384),
         (680,384), (680,192), (960,192)]
STUDY = [
    ("cannon", 112, 176, 135), ("longbow", 208, 144, 315),
    ("tar-pit", 208, 240, 45), ("wolf", 160, 135, 0),
    ("troll", 100, 240, 90), ("goblin", 228, 96, 90),
    ("spruce", 69, 150, 0), ("birch", 271, 199, 0),
]


def pack_ground():
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    with Image.open(SCRATCH/"meadow.png") as source:
        for density in (1,2):
            ground = source.convert("RGB").resize((960*density,480*density),
                                                  Image.Resampling.LANCZOS)
            path = OUT / f"meadow-{density}x.png"
            # Discard at most one 8-bit step per channel. The grass stipple
            # compresses better and rare flower colours retain their hue.
            ground.point(lambda channel: 3 * round(channel / 3)).save(path, optimize=True)
            data = dict(frameSize=list(ground.size), anchor=[0,0], columns=1,
                        frameOrder=["meadow"], pixelsPerCell=32*density)
            path.with_suffix(".json").write_text(json.dumps(data, indent=2)+"\n")


def proof():
    from PIL import Image, ImageDraw, ImageFont
    REVIEW.mkdir(parents=True, exist_ok=True)
    with Image.open(OUT/"meadow-1x.png") as source:
        patch = source.crop((32,48,320,272)).convert("RGBA")
    page = Image.new("RGB", (624,274), "#eae4d5")
    pen = ImageDraw.Draw(page)
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf",16)
    for x,angle,label in [(16,90,"Ground and pieces at 90°"), (320,65,"Ground at 90°, pieces at 65°")]:
        pen.text((x,12),label,font=font,fill="#282a23")
        sample = patch.copy()
        for kind,px,py,_ in sorted(STUDY,key=lambda row: row[2]):
            with Image.open(SCRATCH/f"study-{kind}-{angle}.png") as sprite:
                small = sprite.resize((96,96), Image.Resampling.BOX)
                sample.alpha_composite(small, (px-32-48,py-48-48))
        page.paste(sample,(x,38))
    page.save(REVIEW/"camera-study.webp",lossless=True,method=6)


def run_stage(name, command):
    start = time.perf_counter()
    subprocess.run(command, cwd=ROOT, check=True)
    print(f"{name} wall time: {time.perf_counter()-start:.2f} s", flush=True)


def main():
    SCRATCH.mkdir(parents=True, exist_ok=True)
    for task in ("study", "ground"):
        run_stage(task, [BLENDER, "-b", "--python-exit-code", "1", "-P",
                        str(HERE/"slice_board.py"), "--", task])
    pack_ground()
    proof()
    run_stage("sheets", [BLENDER,"-b","--python-exit-code","1","-P",str(HERE/"slice_sheets.py")])
    run_stage("composites", [sys.executable,str(HERE/"slice_mocks.py")])


if __name__ == "__main__":
    main()
