"""Rebuild the Blender art spike and print the size model. No game runtime is used."""

import argparse
import io
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "docs/art/spike-v5"
SCRIPTS = ROOT / "scripts/art"
SCRATCH = Path("/private/tmp/tarpit-art-scratch")
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"


def project_views():
    for look in ("clay", "painted"):
        for camera in ("tilt", "top"):
            source = SCRATCH / f"{look}-{camera}-64.png"
            shutil.copyfile(source, ART / source.name)
            with Image.open(source) as board:
                board.resize((384,272),Image.Resampling.LANCZOS).save(
                    ART / f"{look}-{camera}-32.png", optimize=True)
                crop = board.crop((64,48,704,496))
                suffix = "-alt" if camera=="top" else ""
                crop.save(SCRATCH / f"cmp-{look}{suffix}.png")
                crop.resize((200,140),Image.Resampling.LANCZOS).save(
                    ART / f"{look}-{camera}-20.png", optimize=True)


def compressed_bytes(image):
    encoded = io.BytesIO()
    image.save(encoded,format="PNG",optimize=True)
    return len(encoded.getvalue())


def estimate():
    # Six grass, straight, bank and bend samples; 3 two-cell scenery stamps.
    # Opaque backgrounds in the stamp proxies make this a planning allowance.
    with Image.open(SCRATCH/"cmp-painted-alt.png") as board:
        for size in (32,64):
            tree = ART if size==64 else SCRATCH/"sheets"
            density = "2x" if size==64 else "1x"
            cannon = (tree/f"cannon-turn-{density}.png").stat().st_size
            goblin = (tree/f"goblin-walk-{density}.png").stat().st_size
            def sample(pos,span):
                x,y=pos
                sample=board.crop((x*64,y*64,(x+span)*64,(y+span)*64))
                return compressed_bytes(sample.resize((size*span,size*span),Image.Resampling.LANCZOS))
            tile=sum(sample(p,1) for p in [(3,0),(0,3),(4,3),(4,5),(7,1),(9,0)])/6
            stamp=sum(sample(p,2) for p in [(1,0),(0,4),(8,4)])/3
            towers = 24*cannon
            enemies = (5+4+9)*goblin
            terrain = round(32*tile+16*stamp)
            print(f"{density}: Cannon {cannon}, Goblin {goblin}, tile {tile:.0f}, "
                  f"stamp {stamp:.0f}, towers {towers}, enemies {enemies}, "
                  f"map kit {terrain}, total {towers+enemies+terrain} bytes")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack-only", action="store_true", help="reuse the scratch renders")
    args=parser.parse_args()
    ART.mkdir(parents=True,exist_ok=True)
    SCRATCH.mkdir(exist_ok=True)
    if not args.pack_only:
        for look in ("clay","painted"):
            for task in ("board","detail","sprites"):
                subprocess.run([BLENDER,"-b","--python-exit-code","1","-P",str(SCRIPTS/"render.py"),
                                "--",task,look],cwd=ROOT,check=True)
    project_views()
    subprocess.run([sys.executable,str(SCRIPTS/"sheets.py"),
                    "--clay",str(SCRATCH/"cmp-clay.png"),
                    "--painted",str(SCRATCH/"cmp-painted.png"),
                    "--clay-alt",str(SCRATCH/"cmp-clay-alt.png"),
                    "--painted-alt",str(SCRATCH/"cmp-painted-alt.png")],check=True,cwd=ROOT)
    estimate()


if __name__=="__main__":
    main()
