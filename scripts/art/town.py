"""Original miniatures for the town atlas. Run with headless Blender -P town.py.

TARPIT_ART_SCRATCH selects the raw render folder; host Python/Pillow downsamples
the two arrangements into centered frames. Then run pack_painted.py shared.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from art_paths import SCRATCH_ROOT

OUT = HERE.parents[1] / "assets/art-painted"
RAW = SCRATCH_ROOT / "town"
STATES = ("untouched", "scuffed", "battered", "taken")
POSES = (*STATES, "untouched-cheer", "scuffed-cheer", "battered-cheer")
BLUE, RED, GOLD = "#2161A1", "#AB2A34", "#FFC458"
WOOD, INK, CREAM = "#975C36", "#52352D", "#F4D9A8"


def resident(x, y, scale, coat, skin, hat, cheer=False):
    import meadow as m
    parent = m.parent
    root = m.group("Neighbour in Sunday clothes")
    root.parent = parent
    root.location = (x, y, 0)
    root.scale = (scale,) * 3
    m.parent = root
    for side in (-1, 1):
        m.twig("Stocking", (side*.102, 0, .05), (side*.09, 0, .34), .062, .078, "#544B46")
        m.peb("Boot", (side*.105, -.044, .055), (.09, .115, .059), INK)
    m.ringbody("Frock coat", (0, 0, 0), ((.23,.205,.145,0,0),(.48,.142,.13,0,0),
               (.58,.186,.127,0,0),(.62,.108,.10,0,0)), coat)
    m.twig("Neckerchief", (-.082,-.122,.59), (.046,-.132,.43), .049,.019, CREAM)
    m.peb("Face", (0,-.01,.743), (.158,.147,.172), skin)
    m.peb("Nose", (0,-.154,.729), (.047,.048,.042), skin)
    for side in (-1,1):
        m.peb("Eye", (side*.061,-.146,.775), (.014,.014,.020), INK)
        hand = (side*(.32 if cheer else .197), -.037, .82 if cheer else .31)
        elbow = (side*.256, -.029, .61 if cheer else .427)
        m.twig("Sleeve", (side*.145,0,.554), elbow, .078,.063, coat)
        m.twig("Wrist", elbow, hand, .05,.044, skin)
        m.peb("Hand", hand, (.064,.058,.066), skin)
    z = 1.19 if cheer else .862
    brim = m.peb("Broad felt brim", (-.059 if cheer else 0,0,z), (.245,.184,.039), hat)
    brim.rotation_euler.y = -.30 if cheer else -.081
    crown = m.peb("Pinched felt crown", (-.059 if cheer else 0,.007,z+.079), (.137,.125,.103), hat)
    crown.rotation_euler.y = brim.rotation_euler.y
    m.parent = parent
    return root


def pennant(x, y, height, state, cheer):
    import meadow as m
    m.twig("Peeled larch pole", (x,y,.01), (x,y,height+.05), .038,.032, INK)
    m.peb("Golden acorn finial", (x,y,height+.075), (.065,.065,.095), GOLD)
    z = height - (.59 if state == 2 and not cheer else 0)
    king = state == 3
    color = RED if king else BLUE
    # Folded cloth with a swallowtail for the town and a long square royal standard.
    tail = .73 if king else .51
    verts = [(x+dx,y+dy,z-dz) for dx,dy,dz in (
        (0,0,0),(.40,-.095,.015),(.79,.01,.04),(.68 if not king else .80,-.003,tail*.60),
        (.83,-.02,tail),(.42,-.12,tail-.02),(0,-.03,tail))]
    m.mesh("Royal standard" if king else "Town pennant", verts,
           [(0,1,5,6),(1,2,3,5),(3,4,5)], color)
    if king:
        points = [(.15,.47),(.14,.23),(.26,.32),(.35,.15),(.44,.32),(.57,.21),(.53,.47)]
        m.mesh("Gilt three-point crown", [(x+dx,y-.14,z-dz) for dx,dz in points],
               [tuple(range(len(points)))], GOLD)
    else:
        m.peb("Minted coin badge", (x+.31,y-.115,z-.259), (.123,.023,.140), GOLD)


def timber_fence(x, y, width, state):
    import meadow as m
    for i in range(3):
        a = x + i*width/2
        lean = -.18 if i == 2 and state >= 1 else 0
        m.twig("Oak gatepost", (a,y,0),(a+lean,y,.43),.061,.049,WOOD)
        m.peb("Pale end grain", (a+lean,y,.43),(.050,.052,.035),CREAM)
    for i in range(2):
        a = x + i*width/2
        for z in (.12,.31):
            end = z if i == 0 or not state else .035
            if state >= 2 and (i == 1 or z == .31):
                continue
            m.twig("Split rail", (a,y,z),(a+width/2-.04,y,end),.044,.041,"#DAA766")


def house(x, y, size, state, turn=-.21):
    import bpy
    import meadow as m
    import slice_scenery
    parent = m.parent
    root = m.group("Tiled cottage")
    root.parent = parent
    m.parent = root
    slice_scenery.cottage()
    for ob in list(root.children):
        if ob.name.startswith(("Town flagstaff","Brass pole finial","Town's blue","Town coin")):
            bpy.data.objects.remove(ob, do_unlink=True)
        elif state >= 2 and ob.name.startswith(("Honey window light","Weathered teal door")):
            swatch = "#2D363B" if state == 3 else "#EEA848"
            ob.data.materials[0] = m.material("Lamplit dusk", swatch)
        elif state >= 1 and ob.name.startswith("Individual terracotta"):
            damaged = abs(ob.location.y) < .21 and ob.location.x < -.28
            if state >= 2:
                damaged = damaged or ob.location.x > .15 or ob.location.y > .26
            if damaged:
                ob.data.materials[0] = m.material("Weathered slates", "#725851" if state < 3 else "#5D514E")
    if state in (1,2):
        # A broad sailcloth patch reads even on the phone's little roof.
        patch = m.box("Sailcloth roof patch", (.31,-.10,.834), (.60,.77,.050),
                      "#4C9796" if state == 1 else "#74695E",.015)
        patch.rotation_euler.y = .63
        for seam_y in (-.43,.23):
            m.twig("Lashing across the patch", (.52,seam_y,.686),(.09,seam_y,1.002),.016,.016,CREAM)
    if state >= 2:
        for dz in (0,.099):
            shutter = m.box("Storm shutter plank", (.240,-.50,.298+dz), (.287,.038,.071), WOOD,.008)
            shutter.rotation_euler.y = -.14
    if state == 3:
        m.box("Crown seizure writ",(-.2,-.501,.30),(.12,.016,.164), CREAM,.01)
        m.peb("Wax seal",(-.185,-.516,.253),(.023,.013,.026), RED)
    root.location = (x,y,0)
    root.scale = (size,)*3
    root.rotation_euler.z = turn
    m.parent = parent
    return root


def village(state, cheer, portrait):
    import meadow as m
    cottage = house(-.08 if portrait else .07,.04,1.30 if portrait else 1.1,state)
    if portrait:
        pennant(-.59,.53,2.05,state,cheer)
        timber_fence(-.68,-.83,.81,state)
        positions = ((.49,-.92),(-.50,-.68))
    else:
        pennant(-1.20,.18,1.44,state,cheer)
        timber_fence(-1.30,-.59,.96,state)
        positions = ((.92,-.34),(.54,-.69))
    if state < 2 or cheer:
        resident(*positions[0],.76,"#35847B","#A96E4F","#F4C266",cheer)
    if state == 0 or cheer:
        resident(*positions[1],.65,BLUE,"#DFAB7C","#913E33",cheer)
    return cottage


def studio():
    import render
    import meadow
    scene = render.studio("painted", True, "BLENDER_EEVEE_NEXT")
    meadow.material = render.factory("painted")
    scene.eevee.taa_render_samples = 12
    return scene


def clear_model(root):
    import bpy
    for ob in reversed(root.children_recursive):
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.objects.remove(root, do_unlink=True)


def render_maps():
    import bpy
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector
    import meadow as m
    import render
    RAW.mkdir(parents=True, exist_ok=True)
    scene = studio()
    for arrangement in ("landscape","portrait"):
        portrait = arrangement == "portrait"
        render.camera(scene,(0,0,.72),33,3.6,"painted",True)
        scene.render.resolution_x = scene.render.resolution_y = 256
        for i,label in enumerate(POSES):
            root = m.group("Town square")
            m.parent = root
            cottage = village(i if i < 4 else i-4,i >= 4,portrait)
            bpy.context.view_layer.update()
            chimney = world_to_camera_view(scene, scene.camera, cottage.matrix_world @ Vector((.331,.173,1.216)))
            (RAW / f"{arrangement}-chimney.json").write_text(json.dumps([chimney.x*256,(1-chimney.y)*256]))
            scene.render.filepath = str(RAW / f"{arrangement}-{label}.png")
            bpy.ops.render.render(write_still=True)
            if i >= 4:
                # Preserve the full silhouette for the common camera fit. The
                # win scene moves each felt hat independently of its owner.
                residents = [obj for obj in root.children if obj.name.startswith("Neighbour")]
                hats = [[part for part in resident.children if part.name.startswith(
                    ("Broad felt brim", "Pinched felt crown"))] for resident in residents]
                for hat in hats:
                    for part in hat:
                        part.hide_render = True
                scene.render.filepath = str(RAW / f"{arrangement}-{label}-bare.png")
                bpy.ops.render.render(write_still=True)
                if i == 4:
                    for n,hat in enumerate(hats):
                        for obj in root.children_recursive:
                            if obj.type == "MESH":
                                obj.hide_render = obj not in hat
                        scene.render.filepath = str(RAW / f"{arrangement}-hat-{n}.png")
                        bpy.ops.render.render(write_still=True)
            clear_model(root)


def frame_fit(arrangement, density):
    """Shared crop and placement for base towns and their animated parts."""
    from PIL import Image
    boxes = []
    for pose in POSES:
        with Image.open(RAW / f"{arrangement}-{pose}.png") as frame:
            boxes.append(frame.getchannel("A").getbbox())
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes),
           max(b[2] for b in boxes), max(b[3] for b in boxes))
    width, height = box[2] - box[0], box[3] - box[1]
    max_width, max_height = (42, 62) if arrangement == "portrait" else (62, 42)
    factor = min(max_width / width, max_height / height) * density
    size = (round(width * factor), round(height * factor))
    cell = 64 * density
    return box, factor, size, (cell - size[0]) // 2, (cell - size[1]) // 2


def pack():
    from PIL import Image
    for density in (1,2):
        cell = 64*density
        atlas = Image.new("RGBA",(7*cell,2*cell))
        labels = []
        tossed = Image.new("RGBA", (4*cell,cell))
        hat_labels = []
        for row,arrangement in enumerate(("landscape","portrait")):
            images = [Image.open(RAW / f"{arrangement}-{label}{'-bare' if 'cheer' in label else ''}.png")
                      .convert("RGBA") for label in POSES]
            box, factor, size, ox, oy = frame_fit(arrangement, density)
            for i,(im,label) in enumerate(zip(images,POSES)):
                atlas.paste(im.crop(box).resize(size,Image.Resampling.LANCZOS),(i*cell+ox,row*cell+oy))
                labels.append(f"{arrangement}-{label}")
            for hat in (0,1):
                with Image.open(RAW / f"{arrangement}-hat-{hat}.png") as image:
                    piece = image.convert("RGBA").crop(box).resize(size,Image.Resampling.LANCZOS)
                    tossed.paste(piece, (len(hat_labels)*cell+ox,oy))
                hat_labels.append(f"{arrangement}-hat-{hat}")
            cx,cy = json.loads((RAW/f"{arrangement}-chimney.json").read_text())
            print(f"{density}x {arrangement}: extent {size}, chimney at {round(ox+(cx-box[0])*factor)},{round(oy+(cy-box[1])*factor)}")
        hat_path = OUT / f"tossed-hat-{density}x.png"
        tossed.save(hat_path,optimize=True)
        hat_path.with_suffix(".json").write_text(json.dumps(dict(frameSize=[cell,cell],anchor=[cell//2]*2,
            columns=4,frameOrder=hat_labels), indent=2)+"\n")
        path = OUT / f"town-{density}x.png"
        atlas.save(path,optimize=True)
        path.with_suffix(".json").write_text(json.dumps(dict(frameSize=[cell,cell],anchor=[cell//2]*2,
            columns=7,frameOrder=labels),indent=2)+"\n")


if __name__ == "__main__":
    if "bpy" in sys.modules:
        render_maps()
        subprocess.run(["python3",str(Path(__file__).resolve())],check=True)
    else:
        pack()
