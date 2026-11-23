"""Render and pack painted Meadow sprite sheets at 64 and 32 pixels per cell.

Run inside headless Blender. Pass individual asset names after -- to rebuild a
subset. Raw renders stay in scratch. Pillow packing uses the host Python 3.
"""

import argparse
import json
import math
import statistics
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "assets/art-painted"
SCRATCH = Path("/private/tmp/tarpit-art-scratch/slice-frames")
TOWER_ELEVATION = 48
ELEVATION = 65
TILT = math.radians(90 - ELEVATION)
DENSITY = 64
BORDER = 6
TOWERS = ("musketeer", "cannon", "tar-pit", "longbow", "mortar", "fire-pot")
ENEMIES = ("goblin", "wolf", "troll", "harpy", "shieldbearer", "grumblefoot", "grumblemaw")
SCENERY = ("cave", "cottage", "spruce", "oak", "birch", "bush", "berry-bush")
PROJECTILES = ("cannonball", "arrow", "mortar-shell", "tar-glob", "flame")
KINDS = TOWERS + ENEMIES + PROJECTILES + ("harpy-shadow",) + SCENERY
BEARINGS = ("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW")


def frame_layout(kind):
    """Return (label, clockwise degrees, phase) for each row-major cell."""
    if kind in TOWERS:
        return 8, [(label, 22.5 * index, 0) for index, label in enumerate(BEARINGS)]
    if kind in ENEMIES:
        return 4, [(f"{label}-{phase}", 90 * heading, phase)
                   for heading, label in enumerate(BEARINGS[::4]) for phase in range(4)]
    if kind == "oak":
        return 4, [(f"oak-{variant}", 0, variant) for variant in range(4)]
    if kind == "cave":
        # Both screen edges use the same ground pivot for the open and closed eyes.
        return 2, [("E", 0, 0), ("S", 90, 0),
                   ("E-closed", 0, 1), ("S-closed", 90, 1)]
    return 1, [(kind, 0, 0)]


def shadow_radius(kind):
    """World-space radii in the projected ground plane."""
    if kind in TOWERS:
        return .54, .48
    return {
        "goblin": (.20, .15),
        "wolf": (.28, .16),
        "shieldbearer": (.22, .16),
        "troll": (.30, .19),
        "grumblefoot": (.42, .25),
        "grumblemaw": (.52, .31),
        "harpy-shadow": (.32, .20),
        "cave": (.69, .36),
        "cottage": (.65, .43),
        "spruce": (.29, .22),
        "oak": (.34, .23),
        "birch": (.25, .19),
        "bush": (.33, .22),
        "berry-bush": (.34, .22),
    }.get(kind)


def projected_point(x, y, z, bearing, tilt):
    turn = math.radians(bearing)
    return (x * math.cos(turn) + y * math.sin(turn),
            -((-x * math.sin(turn) + y * math.cos(turn)) * math.cos(tilt)
              + z * math.sin(tilt)))


def frame_metadata(kind, columns, frames, vertices, resolution, tilt):
    projected = [projected_point(*vertex, bearing, tilt)
                 for _, bearing, phase in frames for vertex in vertices.get(phase, ())]
    radii = shadow_radius(kind)
    if radii:
        projected.extend([(-radii[0], -radii[1]), radii])
    bounds = []
    for axis in range(2):
        lo = min(0, min(point[axis] for point in projected))
        hi = max(0, max(point[axis] for point in projected))
        # Even sides guarantee an integral 1× anchor after box reduction.
        bounds.append((2 * math.floor((lo * resolution - BORDER) / 2),
                       2 * math.ceil((hi * resolution + BORDER) / 2)))
    return {
        "frameSize": [hi - lo for lo, hi in bounds],
        "anchor": [-lo for lo, _ in bounds],
        "columns": columns,
        "frameOrder": [label for label, _, _ in frames],
    }


def mesh_vertices(bpy, root):
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    vertices = []
    for child in root.children_recursive:
        if child.type not in ("MESH", "CURVE", "SURFACE", "FONT"):
            continue
        evaluated = child.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        vertices.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        evaluated.to_mesh_clear()
    return vertices


def erase(bpy, root):
    for child in reversed(root.children_recursive):
        bpy.data.objects.remove(child, do_unlink=True)
    bpy.data.objects.remove(root, do_unlink=True)


def add_contact(bpy, kind):
    """Render a centered radial contact decal as part of the Blender frame."""
    radii = shadow_radius(kind)
    if not radii:
        return
    # Offset below the geometry while preserving the projected ground anchor.
    z = -.006
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, -z * math.tan(TILT), z))
    plane = bpy.context.object
    plane.name = f"{kind} contact shadow"
    plane.scale = (radii[0], radii[1] / math.cos(TILT), 1)
    mat = bpy.data.materials.new("Soft centered contact")
    mat.use_nodes = True
    mat.surface_render_method = "BLENDED"
    mat.use_transparency_overlap = False
    plane.data.materials.append(mat)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    uv = nodes.new("ShaderNodeTexCoord")
    distance = nodes.new("ShaderNodeVectorMath")
    distance.operation = "DISTANCE"
    distance.inputs[1].default_value = (.5, .5, 0)
    links.new(uv.outputs["UV"], distance.inputs[0])

    # Smooth quadratic falloff in UV space. This yields 0 at the ellipse rim.
    radial = nodes.new("ShaderNodeMath")
    radial.operation = "MULTIPLY"
    radial.inputs[1].default_value = 2
    links.new(distance.outputs["Value"], radial.inputs[0])
    squared = nodes.new("ShaderNodeMath")
    squared.operation = "MULTIPLY"
    for index in (0, 1):
        links.new(radial.outputs[0], squared.inputs[index])
    falloff = nodes.new("ShaderNodeMath")
    falloff.operation = "SUBTRACT"
    falloff.inputs[0].default_value = 1
    falloff.use_clamp = True
    links.new(squared.outputs[0], falloff.inputs[1])
    coverage = nodes.new("ShaderNodeMath")
    coverage.operation = "MULTIPLY"
    for index in (0, 1):
        links.new(falloff.outputs[0], coverage.inputs[index])
    opacity = nodes.new("ShaderNodeMath")
    opacity.operation = "MULTIPLY"
    opacity.inputs[1].default_value = (56 if kind == "harpy-shadow" else 72) / 255
    links.new(coverage.outputs[0], opacity.inputs[0])

    clear = nodes.new("ShaderNodeBsdfTransparent")
    pigment = nodes.new("ShaderNodeEmission")
    pigment.inputs["Color"].default_value = (.008, .010, .007, 1)
    mix = nodes.new("ShaderNodeMixShader")
    links.new(opacity.outputs[0], mix.inputs[0])
    links.new(clear.outputs[0], mix.inputs[1])
    links.new(pigment.outputs[0], mix.inputs[2])
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(mix.outputs[0], output.inputs["Surface"])


def render_cells(kind):
    import bpy
    from mathutils import Vector
    import render

    cols, frames = frame_layout(kind)
    scene = render.studio("painted", True, "BLENDER_EEVEE_NEXT")
    lamp = bpy.data.objects["Daylight key"]
    lamp.location = (-5, 3, 7)
    lamp.rotation_euler = (-lamp.location).to_track_quat("-Z", "Y").to_euler()
    material = render.factory("painted")
    roots = {}
    vertices = {}
    base_yaws = {}
    if kind != "harpy-shadow":
        if kind in ENEMIES:
            from slice_enemies import build
        elif kind in SCENERY:
            from slice_scenery import build
        else:
            from slice_towers import build
        for phase in sorted({phase for _, _, phase in frames}):
            root = build(kind, material, phase)
            roots[phase] = root
            base_yaws[phase] = root.rotation_euler.z
            vertices[phase] = mesh_vertices(bpy, root)
            for child in root.children_recursive:
                child.hide_render = True

    actor = kind in ENEMIES + TOWERS
    resolution = 192 if actor else DENSITY
    elevation = TOWER_ELEVATION if kind in TOWERS else ELEVATION
    tilt = math.radians(90 - elevation)
    meta = frame_metadata(kind, cols, frames, vertices, resolution, tilt)
    folder = SCRATCH / kind
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "layout.json").write_text(json.dumps(meta))
    if not actor:
        add_contact(bpy, kind)

    width, height = meta["frameSize"]
    ax, ay = meta["anchor"]
    horizontal = (width / 2 - ax) / resolution
    vertical = (ay - height / 2) / resolution
    target = Vector((horizontal, vertical * math.cos(tilt), vertical * math.sin(tilt)))
    # Blender's orthographic sensor fits the larger render dimension.
    render.camera(scene, target, elevation, max(width, height) / resolution, "painted", True)
    scene.render.resolution_x, scene.render.resolution_y = width, height
    for label, bearing, phase in frames:
        root = roots.get(phase)
        if root:
            root.rotation_euler.z = base_yaws[phase] - math.radians(bearing)
            for child in root.children_recursive:
                child.hide_render = False
        scene.render.filepath = str(folder / f"{label}.png")
        bpy.ops.render.render(write_still=True)
        if root:
            for child in root.children_recursive:
                child.hide_render = True
    for root in roots.values():
        erase(bpy, root)


# Opaque body height in logical pixels. Fit all four walk phases together
# so walking moves the limbs without making the entire figure pulse.
BODY_HEIGHT = {"goblin": 38, "wolf": 38, "shieldbearer": 38, "harpy": 38,
               "troll": 56, "grumblefoot": 84, "grumblemaw": 92}
CONTACT_WIDTH = {"goblin": 24, "wolf": 28, "shieldbearer": 27,
              "troll": 36, "grumblefoot": 52, "grumblemaw": 58}
INK = (30, 28, 30)


def actor_frames(kind, frames, raw):
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

    tower = kind in TOWERS
    target = BODY_HEIGHT.get(kind, 40) * 2
    groupsize = 1 if tower else 4
    boxes = [frame.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox()
             for frame in frames]
    # A common horizontal scale preserves the broadside of a weapon or wings.
    # Use a separate vertical fit per heading for foreshortened poses.
    typical = statistics.median(box[3] - box[1] for box in boxes)
    contact_w = (33 if tower else CONTACT_WIDTH.get(kind, 0)) * 2
    contact_h = round(contact_w * .29)
    max_width = 55 if tower else BODY_HEIGHT[kind] * 1.35
    normal_sx = target / typical
    if kind == "harpy":
        # Keep a common horizontal fit throughout the flap cycle. Allow
        # two logical pixels for the existing silhouette outline.
        max_width = 40
        widest = max(box[2] - box[0] for box in boxes)
        normal_sx = min(normal_sx, max_width * 2 / widest)
    pivot_x = raw["anchor"][0]
    placements = []
    for i, (image, box) in enumerate(zip(frames, boxes)):
        start = i // groupsize * groupsize
        group = boxes[start:start + groupsize]
        usual_height = statistics.median(b[3] - b[1] for b in group)
        height = box[3] - box[1]
        # Limit projected height changes from a raised club or a folding wing.
        # Limbs still animate, but no ordinary pose shrinks below 36 px.
        fitted = max(target - 4, min(target + 4, height * target / usual_height))
        sy = fitted / height
        sx = normal_sx
        if tower:
            sx = max(sx, 28 * 2 / (box[2] - box[0]))
        sx = min(sx, max_width * 2 / (box[2] - box[0]))
        # The Harpy's separate trail shadow stays at the ground anchor.
        foot_y = 4 if tower else -10 if kind == "harpy" else 0
        crop = image.crop(box)
        rgb = ImageEnhance.Color(crop.convert("RGB")).enhance(1.22)
        rgb = ImageEnhance.Contrast(rgb).enhance(1.10)
        rgb.putalpha(crop.getchannel("A"))
        body = rgb.resize((round(crop.width * sx), round(crop.height * sy)),
                          Image.Resampling.LANCZOS)
        placements.append((body, round((box[0] - pivot_x) * sx),
                           foot_y - body.height))

    # Export one integral 1x ground pivot for the entire heading/cycle atlas.
    left = min(-contact_w // 2, *(x for _, x, _ in placements))
    right = max(contact_w // 2 + 1, *(x + im.width for im, x, _ in placements))
    top = min(y for _, _, y in placements)
    ax = 2 * math.ceil((5 - left) / 2)
    ay = 2 * math.ceil((5 - top) / 2)
    size = (ax + 2 * math.ceil((right + 5) / 2),
            ay + 2 * math.ceil((contact_h / 2 + 6) / 2))
    images = []
    body_bounds = []
    for body, x, y in placements:
        piece = Image.new("RGBA", size)
        bounds = (ax - contact_w // 2, ay - contact_h // 2,
                  ax + contact_w // 2, ay + contact_h // 2)
        if tower:
            pen = ImageDraw.Draw(piece)
            pen.ellipse(bounds, fill=INK)
            x0, y0, x1, y1 = bounds
            pen.ellipse((x0 + 2, y0 + 2, x1 - 2, y1 - 3), fill="#b7a486")
            pen.ellipse((x0 + 4, y0 + 3, x1 - 4, y1 - 5), fill="#736754")
        elif contact_w:
            # A tapered ground shadow gives the feet contact without a base.
            shadow = Image.new("RGBA", (contact_w, contact_h), INK)
            alpha = Image.new("L", shadow.size)
            alpha.putdata([
                round(56 * max(0, 1 - ((2 * x + 1) / contact_w - 1)**2
                                  - ((2 * y + 1) / contact_h - 1)**2)**2)
                for y in range(contact_h) for x in range(contact_w)
            ])
            shadow.putalpha(alpha)
            piece.paste(shadow, bounds[:2])
        face = Image.new("RGBA", size)
        face.paste(body, (ax + x, ay + y))
        stroke = Image.new("RGBA", size, INK)
        stroke.putalpha(face.getchannel("A").filter(ImageFilter.MaxFilter(5)))
        piece.alpha_composite(stroke)
        piece.alpha_composite(face)
        body_bounds.append(face.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox())
        images.append(piece)
    return dict(raw, anchor=[ax, ay], frameSize=list(size), bodyBounds=body_bounds), images


def indexed_piece(image):
    from PIL import Image

    # The outermost pixels are ink. Give them their own alpha ramp and use
    # the rest of the palette for the solid painted interior.
    alpha = image.getchannel("A")
    indexed = image.convert("RGB").quantize(224, dither=Image.Dither.NONE)
    palette = indexed.getpalette()[:224 * 3] + list(INK) * 32
    indexed.putpalette(palette)
    fringe = alpha.point(lambda a: 224 + round(a * 31 / 255))
    indexed.paste(fringe, mask=alpha.point(lambda a: 255 if a < 247 else 0))
    indexed.info["transparency"] = bytes([255] * 224 + [round(i * 255 / 31) for i in range(32)])
    return indexed


def pack(kind):
    from PIL import Image

    folder = SCRATCH / kind
    meta = json.loads((folder / "layout.json").read_text())
    frames = []
    for label in meta["frameOrder"]:
        with Image.open(folder / f"{label}.png") as source:
            if list(source.size) != meta["frameSize"]:
                raise ValueError(f"{kind} {label} has the wrong size")
            frames.append(source.convert("RGBA"))
    actor = kind in TOWERS + ENEMIES
    if actor:
        meta, frames = actor_frames(kind, frames, meta)
    cols = meta["columns"]
    order = meta["frameOrder"]
    rows = len(order) // cols
    width, height = meta["frameSize"]
    if len(order) % cols or len(set(order)) != len(order):
        raise ValueError(f"{kind}: invalid cell order")
    atlases = {density: Image.new("RGBA", (cols * width * density // 2,
                                          rows * height * density // 2))
               for density in (1, 2)}
    for index, (label, full) in enumerate(zip(order, frames)):
        half = full.resize((width // 2, height // 2), Image.Resampling.BOX)
        for density, frame in ((1, half), (2, full)):
            w, h = frame.size
            bounds = frame.getchannel("A").getbbox()
            if not bounds or min(bounds[0], bounds[1], w - bounds[2], h - bounds[3]) < 1:
                raise ValueError(f"{kind} {label} {density}× needs alpha clearance: {bounds}")
            atlases[density].paste(frame, (index % cols * w, index // cols * h))

    OUT.mkdir(parents=True, exist_ok=True)
    for density, atlas in atlases.items():
        scaled = dict(meta, frameSize=[value * density // 2 for value in meta["frameSize"]],
                      anchor=[value * density // 2 for value in meta["anchor"]])
        if actor:
            scaled["bodyBounds"] = [[round(v * density / 2) for v in box]
                                    for box in meta["bodyBounds"]]
        path = OUT / f"{kind}-{density}x.png"
        output = indexed_piece(atlas) if actor else atlas
        output.save(path, optimize=True)
        path.with_suffix(".json").write_text(json.dumps(scaled, indent=2) + "\n")
        print(f"{path.name}: {atlas.width}×{atlas.height}, {len(order)} frames, {path.stat().st_size:,} bytes")


def main(args):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kinds", nargs="*")
    parser.add_argument("--pack-only", action="store_true")
    parsed = parser.parse_args(args)
    kinds = parsed.kinds or KINDS
    for kind in kinds:
        if kind not in KINDS:
            parser.error(f"unknown asset {kind}")
    if parsed.pack_only:
        for kind in kinds:
            pack(kind)
        return
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(HERE))
    for kind in kinds:
        render_cells(kind)
        subprocess.run(["python3", str(Path(__file__).resolve()), "--pack-only", kind], check=True)


if __name__ == "__main__":
    if "bpy" in sys.modules:
        main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    else:
        main(sys.argv[1:])
