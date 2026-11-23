"""Pack RGBA sprite frames and lay out the Tarpit art comparison.

Run with Python 3 and Pillow, or use Blender's --python entry point to
forward to the host Python. Rendered inputs stay in the art scratch folder.
"""

import argparse
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

# Blender's -P entry point does not add the script's folder to sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from art_paths import FFMPEG, SCRATCH_ROOT

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = SCRATCH_ROOT
PLATES = SCRATCH / "spike-v5"
BASELINE = ROOT / "e2e/__screenshots__/visual.spec.ts/new-towers.png"
CROP_SIZE = (640, 448)
FRAME_SIZE = (64, 64)
PHONE_SIZE = (200, 140)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clay", type=Path, help="Clay game-angle render, 640×448")
    parser.add_argument("--painted", type=Path, help="Painted game-angle render, 640×448")
    parser.add_argument("--clay-alt", type=Path, help="Optional clay overhead render, 640×448")
    parser.add_argument("--painted-alt", type=Path, help="Optional painted overhead render, 640×448")
    parser.add_argument("--frames", type=Path, default=SCRATCH / "frames")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/art/spike-v5")
    parser.add_argument("--scratch", type=Path, default=SCRATCH / "sheets")
    parser.add_argument("--sprites-only", action="store_true")
    args = parser.parse_args()
    if not args.sprites_only and not (args.clay and args.painted):
        parser.error("--clay and --painted are required for the comparison")
    if bool(args.clay_alt) != bool(args.painted_alt):
        parser.error("supply both alternate angles or neither")
    return args


def open_image(image_module, path, size=None, mode="RGBA"):
    with image_module.open(path) as source:
        if size and source.size != size:
            raise ValueError(f"{path} is {source.size}, expected {size}")
        if mode == "RGBA" and source.mode != "RGBA":
            raise ValueError(f"{path} must have an RGBA PNG with an alpha channel")
        return source.convert(mode)


def pack_sprites(Image, args):
    groups = {
        "goblin-walk": [[f"goblin-{facing}-{phase}" for phase in range(4)] for facing in "NESW"],
        "cannon-turn": [[f"cannon-{facing}" for facing in range(8)]],
    }
    for name, rows in groups.items():
        sheets = {}
        bounds = {}
        for size in (64, 32):
            sheets[size] = Image.new("RGBA", (len(rows[0]) * size, len(rows) * size))
            bounds[size] = []

        for row_index, row in enumerate(rows):
            for col_index, frame_name in enumerate(row):
                frame = open_image(Image, args.frames / f"{frame_name}.png", FRAME_SIZE)
                # Pillow resamples premultiplied colors for RGBA images. BOX
                # uses the exact four source pixels without edge ringing.
                reduced = frame.resize((32, 32), Image.Resampling.BOX)
                for size, cell in ((64, frame), (32, reduced)):
                    alpha = cell.getchannel("A")
                    bbox = alpha.getbbox()
                    if not bbox or alpha.getextrema()[0] != 0:
                        raise ValueError(f"{frame_name} needs both visible and transparent pixels")
                    if bbox[0] == 0 or bbox[1] == 0 or bbox[2] == size or bbox[3] == size:
                        raise ValueError(f"{frame_name} alpha touches a {size}px cell boundary: {bbox}")
                    sheets[size].paste(cell, (col_index * size, row_index * size))
                    bounds[size].append((bbox[2] - bbox[0], bbox[3] - bbox[1]))

        for size, path in ((64, PLATES / f"{name}-2x.png"), (32, args.scratch / f"{name}-1x.png")):
            sheet = sheets[size]
            sheet.save(path, optimize=True)
            widths, heights = zip(*bounds[size])
            print(
                f"{name} {size}px cells: {sheet.width}×{sheet.height}, {path.stat().st_size:,} bytes, "
                f"{len(widths)} visible bounds {min(widths)}–{max(widths)}px wide "
                f"× {min(heights)}–{max(heights)}px tall"
            )


def composite_panels(page, panels, output, scratch):
    """Use RGB overlays so FFmpeg never subsamples the panel color channels."""
    with TemporaryDirectory(dir=scratch) as folder:
        temp = Path(folder)
        background = temp / "background.png"
        page.save(background)
        command = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(background)]
        stages = []
        for i, (panel, x, y) in enumerate(panels, 1):
            panel_file = temp / f"panel-{i}.png"
            panel.save(panel_file)
            command.extend(["-i", str(panel_file)])
            previous = f"layer{i - 1}" if i > 1 else "0:v"
            stages.append(f"[{previous}][{i}:v]overlay={x}:{y}:format=rgb[layer{i}]")
        command.extend([
            "-filter_complex", ";".join(stages), "-map", f"[layer{len(panels)}]",
            "-frames:v", "1", "-pix_fmt", "rgb24", "-update", "1", str(output),
        ])
        subprocess.run(command, check=True)


def comparison(Image, ImageDraw, args):
    from review_fonts import review_font

    current = open_image(Image, BASELINE, mode="RGB").crop((0, 64, 320, 288))
    all_views = [
        current.resize(CROP_SIZE, Image.Resampling.NEAREST),
        open_image(Image, args.clay, CROP_SIZE, mode="RGB"),
        open_image(Image, args.painted, CROP_SIZE, mode="RGB"),
    ]
    alternate = (
        [open_image(Image, path, CROP_SIZE, mode="RGB") for path in (args.clay_alt, args.painted_alt)]
        if args.clay_alt else []
    )

    paper, ink, secondary, rule = "#eee9dc", "#29251d", "#585448", "#b9b2a1"
    accents = ["#555d48", "#874b34", "#3c6259"]
    margin, gap = 44, 24
    width = margin * 2 + CROP_SIZE[0] * 3 + gap * 2
    cols = [margin + i * (CROP_SIZE[0] + gap) for i in range(3)]
    phone_top = 733
    alternate_top = phone_top + 196
    height = alternate_top + 48 + CROP_SIZE[1] if alternate else phone_top + 190
    page = Image.new("RGB", (width, height), paper)
    panels = []
    draw = ImageDraw.Draw(page)
    title = review_font("serif", 75)
    heading = review_font("serif-bold", 38)
    caption = review_font("sans", 23)
    label = review_font("mono", 20)
    bold = review_font("sans-bold", 22)

    def text(x, y, message, font, fill=ink, anchor="lt"):
        draw.text((x, y), message, font=font, fill=fill, anchor=anchor)

    text(margin, 33, "TARPIT  /  ART SPIKE", label, secondary)
    text(margin, 77, "Meadow in three styles", title)
    text(width - margin, 95, "10 × 7 cells  /  64 px per cell across", label, secondary, "rt")
    draw.line((margin, 181, width - margin, 181), fill=rule, width=2)

    for x, accent, name, sub, view in zip(
        cols,
        accents,
        ("Current game", "Clay stop-motion", "Painted miniature"),
        ("Game capture, overhead", "Sculpted clay, 65° camera", "Painted tabletop, 65° camera"),
        all_views,
    ):
        draw.rectangle((x, 214, x + 34, 219), fill=accent)
        text(x + 52, 201, name, heading)
        text(x + 52, 249, sub, caption, secondary)
        panels.append((view, x, 284))

    for x, source in zip(cols, all_views):
        thumbnail = source.resize(PHONE_SIZE, Image.Resampling.LANCZOS)
        panels.append((thumbnail, x, phone_top + 14))

    for x in cols:
        text(x + 226, phone_top + 29, "SMALL-SCREEN SCALE", bold)
        text(x + 226, phone_top + 68, "20 px per cell across", label, secondary)

    if alternate:
        draw.line((margin, alternate_top - 12, width - margin, alternate_top - 12), fill=rule, width=2)
        text(cols[0], alternate_top + 48, "Straight down", heading)
        text(cols[0], alternate_top + 110, "90° camera, same Meadow crop", caption, secondary)
        for x, view in zip(cols[1:], alternate):
            panels.append((view, x, alternate_top + 24))

        text(cols[0], alternate_top + 201, "SPRITE CELLS AT 64 PX", bold)
        for offset, name, title_text, order in (
            (245, "goblin-walk", "Goblin walk", "East · four phases"),
            (345, "cannon-turn", "Cannon turn", "Clockwise from north"),
        ):
            y = alternate_top + offset
            sheet = open_image(Image, PLATES / f"{name}-2x.png")
            strip = sheet.crop((0, 64, 256, 128)) if name == "goblin-walk" else sheet
            sprite_base = Image.new("RGBA", strip.size, "#d7d1be")
            sprite_base.alpha_composite(strip)
            panels.append((sprite_base.convert("RGB"), cols[0], y + 27))
            text(cols[0], y, title_text, caption)
            text(cols[0] + 160, y + 2, order, label, secondary)

    path = args.output / "comparison.png"
    composite_panels(page, panels, path, args.scratch)
    with Image.open(path) as source:
        art = source.convert("RGB")
    text_palette = page.quantize(64).getpalette()[:64 * 3]
    art_palette = art.quantize(192).getpalette()[:192 * 3]
    palette = Image.new("P", (1, 1))
    palette.putpalette(text_palette + art_palette)
    art.quantize(palette=palette, dither=Image.Dither.NONE).save(path, optimize=True)
    print(f"{path}: {width}×{height}, {path.stat().st_size:,} bytes")


def main():
    from PIL import Image, ImageDraw

    args = parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    args.scratch.mkdir(parents=True, exist_ok=True)
    PLATES.mkdir(parents=True, exist_ok=True)
    pack_sprites(Image, args)
    if not args.sprites_only:
        comparison(Image, ImageDraw, args)


if __name__ == "__main__":
    if "bpy" in sys.modules:
        script_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
        subprocess.run(["python3", __file__, *script_args], check=True)
    else:
        main()
