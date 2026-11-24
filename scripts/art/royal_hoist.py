"""Separate the royal cloth from its pole for the loss animation.

Run headless Blender -P royal_hoist.py, then pack_painted.py shared. The
normal town poses provide the very same camera crop as the static atlas.
"""
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from town import OUT, POSES, RAW, clear_model, frame_fit, render_maps, studio, village


def render_layers():
    import bpy
    import meadow as m
    import render
    if any(not (RAW / f"{view}-{pose}.png").exists()
           for view in ("landscape","portrait") for pose in POSES):
        render_maps()
    scene = studio()
    render.camera(scene,(0,0,.72),33,3.6,"painted",True)
    scene.render.resolution_x = scene.render.resolution_y = 256
    for arrangement in ("landscape","portrait"):
        root = m.group("Town")
        m.parent = root
        village(3,False,arrangement == "portrait")
        for part in ("bare","cloth"):
            for ob in root.children_recursive:
                if ob.type == "MESH":
                    cloth = ob.name.startswith(("Royal standard","Gilt three-point"))
                    ob.hide_render = cloth != (part == "cloth")
            scene.render.filepath = str(RAW / f"hoist-{arrangement}-{part}.png")
            bpy.ops.render.render(write_still=True)
        clear_model(root)


def pack():
    from PIL import Image
    for density in (1,2):
        cell = 64*density
        atlas = Image.new("RGBA",(4*cell,cell))
        order = []
        for arrangement in ("landscape","portrait"):
            box, _, size, ox, oy = frame_fit(arrangement, density)
            for part in ("bare","cloth"):
                with Image.open(RAW / f"hoist-{arrangement}-{part}.png") as im:
                    piece = im.convert("RGBA").crop(box).resize(size,Image.Resampling.LANCZOS)
                    atlas.paste(piece,(cell*len(order)+ox,oy))
                order.append(f"{arrangement}-{part}")
        path = OUT / f"royal-hoist-{density}x.png"
        atlas.save(path,optimize=True)
        path.with_suffix(".json").write_text(json.dumps(dict(frameSize=[cell,cell],
            anchor=[cell//2]*2,columns=4,frameOrder=order),indent=2)+"\n")


if __name__ == "__main__":
    if "bpy" in sys.modules:
        render_layers()
        subprocess.run(["python3",str(Path(__file__).resolve())],check=True)
    else:
        pack()
