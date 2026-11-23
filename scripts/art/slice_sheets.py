"""Render and pack painted Meadow sprite sheets at 64 and 32 pixels per cell.

Run inside headless Blender. Pass individual asset names after -- to rebuild a
subset. Raw renders stay in scratch. Pillow packing uses the host Python 3.
"""

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "assets/art-painted"
SCRATCH = Path("/private/tmp/tarpit-art-scratch/slice-frames")
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
    if kind == "cave":
        # The portal opens along the trail at both screen edges.
        return 2, [("E", 0, 0), ("S", 90, 0)]
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


def projected_point(x, y, z, bearing):
    turn = math.radians(bearing)
    return (x * math.cos(turn) + y * math.sin(turn),
            -((-x * math.sin(turn) + y * math.cos(turn)) * math.cos(TILT)
              + z * math.sin(TILT)))


def frame_metadata(kind, columns, frames, vertices):
    projected = [projected_point(*vertex, bearing)
                 for _, bearing, phase in frames for vertex in vertices.get(phase, ())]
    radii = shadow_radius(kind)
    if radii:
        projected.extend([(-radii[0], -radii[1]), radii])
    bounds = []
    for axis in range(2):
        lo = min(0, min(point[axis] for point in projected))
        hi = max(0, max(point[axis] for point in projected))
        # Even sides guarantee an integral 1× anchor after box reduction.
        bounds.append((2 * math.floor((lo * DENSITY - BORDER) / 2),
                       2 * math.ceil((hi * DENSITY + BORDER) / 2)))
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

    meta = frame_metadata(kind, cols, frames, vertices)
    folder = SCRATCH / kind
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "layout.json").write_text(json.dumps(meta))
    add_contact(bpy, kind)

    width, height = meta["frameSize"]
    ax, ay = meta["anchor"]
    horizontal = (width / 2 - ax) / DENSITY
    vertical = (ay - height / 2) / DENSITY
    target = Vector((horizontal, vertical * math.cos(TILT), vertical * math.sin(TILT)))
    # Blender's orthographic sensor fits the larger render dimension.
    render.camera(scene, target, ELEVATION, max(width, height) / DENSITY, "painted", True)
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


def styled_frame(Image, ImageFilter, kind, folder, label, size):
    with Image.open(folder / f"{label}.png") as source:
        if list(source.size) != size or source.mode != "RGBA":
            raise ValueError(f"{kind} {label} expected RGBA frame {size}, got {source.mode} {source.size}")
        sprite = source.copy()
    if kind not in ENEMIES:
        return sprite
    # Isolate the model's alpha above the contact's maximum before adding a rim.
    opacity = sprite.getchannel("A").point(lambda value: max(0, value - 72))
    opacity = opacity.filter(ImageFilter.MaxFilter(3))
    outline = Image.new("RGBA", tuple(size), (27, 28, 24, 0))
    outline.putalpha(opacity.point(lambda value: round(value * 84 / 183)))
    outline.alpha_composite(sprite)
    return outline


def pack(kind):
    from PIL import Image, ImageFilter

    folder = SCRATCH / kind
    meta = json.loads((folder / "layout.json").read_text())
    cols = meta["columns"]
    order = meta["frameOrder"]
    rows = len(order) // cols
    width, height = meta["frameSize"]
    if len(order) % cols or len(set(order)) != len(order):
        raise ValueError(f"{kind}: invalid cell order")
    atlases = {density: Image.new("RGBA", (cols * width * density // 2,
                                          rows * height * density // 2))
               for density in (1, 2)}
    for index, label in enumerate(order):
        full = styled_frame(Image, ImageFilter, kind, folder, label, meta["frameSize"])
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
        path = OUT / f"{kind}-{density}x.png"
        atlas.save(path, optimize=True)
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
