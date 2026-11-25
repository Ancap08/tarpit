"""Render three higher-density Painted poses to the supplied scratch directory.

Run with headless Blender. Reuse the shipped geometry and camera elevations,
with broader lighting and smooth materials for the comparison.
"""

import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import render
import slice_enemies
import slice_sheets
import slice_towers


def smooth_material(name, swatch):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (
        *(render.linear(int(swatch[i:i + 2], 16)) for i in (1, 3, 5)), 1
    )
    shader.inputs["Roughness"].default_value = .47
    return material


def pose(directory, kind, bearing, elevation, build):
    scene = render.studio("painted", True, "BLENDER_EEVEE_NEXT")
    scene.eevee.taa_render_samples = 64
    scene.view_settings.look = "AgX - Medium High Contrast"
    key = bpy.data.objects["Daylight key"]
    key.location = (-4, 2, 7)
    key.rotation_euler = (-key.location).to_track_quat("-Z", "Y").to_euler()
    key.data.size = 4.5
    key.data.energy = 1250
    root = build(kind, smooth_material, 0)
    tilt = math.radians(90 - elevation)
    density = 512
    bounds = slice_sheets.frame_metadata(
        kind, 1, [("sample", bearing, 0)], {0: slice_sheets.mesh_vertices(bpy, root)},
        density, tilt,
    )
    root.rotation_euler.z -= math.radians(bearing)
    width, height = bounds["frameSize"]
    ax, ay = bounds["anchor"]
    vertical = (ay - height / 2) / density
    target = Vector(((width / 2 - ax) / density, vertical * math.cos(tilt), vertical * math.sin(tilt)))
    render.camera(scene, target, elevation, max(width, height) / density, "painted", True)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.filepath = str(directory / f"{kind}-smooth.png")
    bpy.ops.render.render(write_still=True)


out = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
out.mkdir(parents=True, exist_ok=True)
for name, angle, camera, builder in (
    ("cannon", 135, slice_sheets.TOWER_ELEVATION, slice_towers.build),
    ("shieldbearer", 180, slice_sheets.ELEVATION, slice_enemies.build),
    ("harpy", 180, slice_sheets.ELEVATION, slice_enemies.build),
):
    pose(out, name, angle, camera, builder)
