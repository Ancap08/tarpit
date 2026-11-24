"""Render the original collector's coin sack, then run pack_painted.py shared."""
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from town import GOLD, INK, OUT, RAW, studio


def render_sack():
    import bpy
    import meadow as m
    import render
    scene = studio()
    m.parent = m.group("Lifted bag of town coin")
    m.ringbody("Bulging buckskin purse",(0,0,0),(
        (.01,.20,.14,0,0),(.07,.375,.211,-.015,0),(.22,.40,.243,-.025,0),
        (.38,.365,.210,-.025,0),(.51,.24,.134,0,0),(.61,.115,.098,.038,0),
        (.68,.122,.100,.047,0),(.80,.181,.139,.038,0),(.84,.165,.121,.015,0)),
        "#D9964A",sides=30,wobble=.075)
    m.twig("Bound neck",(.038,0,.604),(.042,0,.674),.145,.133,INK)
    for i in (0,1):
        x = .106+i*.048
        m.line("Knotted cord",[(.08,-.104,.64),(x+.035,-.13,.63),(x+.09,-.13,.51-i*.046)],
               .018,"#F1C77F")
    m.peb("Stamped leather coin medallion",(-.065,-.221,.28),(.163,.040,.165),"#875335")
    m.peb("Town gold",(-.065,-.250,.28),(.134,.022,.135),GOLD)
    m.twig("Minted impression",(-.080,-.273,.213),(-.053,-.273,.352),.016,.017,"#B88029")
    for i in range(3):
        a = i-.8
        m.twig("Gathered pleat",(.024+a*.091,-.102,.59),
               (a*.23,-.16,.430),.016,.007,"#94613B")
    RAW.mkdir(parents=True, exist_ok=True)
    render.camera(scene,(0,0,.406),17,1.05,"painted",True)
    scene.render.resolution_x = scene.render.resolution_y = 160
    scene.render.filepath = str(RAW / "sack.png")
    bpy.ops.render.render(write_still=True)


def pack():
    from PIL import Image, ImageFilter
    with Image.open(RAW/"sack.png") as source:
        im = source.convert("RGBA")
        for density in (1,2):
            w = 22*density
            face = im.resize((w,w),Image.Resampling.LANCZOS)
            # A fine leather edge keeps the sack readable over turf and trail.
            stroke = Image.new("RGBA",face.size,(62,40,30))
            stroke.putalpha(face.getchannel("A").filter(ImageFilter.MaxFilter(1+2*density)))
            stroke.alpha_composite(face)
            file = OUT / f"sack-{density}x.png"
            stroke.save(file,optimize=True)
            file.with_suffix(".json").write_text(json.dumps(dict(frameSize=[w,w],anchor=[w//2]*2,
                columns=1,frameOrder=["sack"]),indent=2)+"\n")


if __name__ == "__main__":
    if "bpy" in sys.modules:
        render_sack()
        subprocess.run(["python3",str(Path(__file__).resolve())],check=True)
    else:
        pack()
