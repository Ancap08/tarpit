"""Render the existing Keep and outer ward away from the production assets.

Blender -b --python-exit-code 1 -P scripts/mockups/m58/miniatures.py -- SCRATCH
"""
import json
import math
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "art"))
import keep_castle as keep
import render


def point(entry):
    return entry["x"], entry["y"]


def render_plate(scene, path, target, span, pitch, yaw, size):
    pitch, yaw = map(math.radians, (pitch, yaw))
    direction = Vector((math.sin(yaw) * math.cos(pitch),
                        -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    camera = scene.camera
    camera.location = Vector(target) + 32 * direction
    camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
    camera.data.ortho_scale = span
    scene.render.resolution_x, scene.render.resolution_y = size
    bpy.context.view_layer.update()
    scene.render.filepath = str(path.with_suffix(".png"))
    bpy.ops.render.render(write_still=True)
    sill = world_to_camera_view(scene, camera, Vector((0, -.14, 0)))
    return sill.x * size[0], (1 - sill.y) * size[1]


def main(scratch):
    scene = render.studio("painted", True, "BLENDER_EEVEE_NEXT")
    for obj in list(bpy.data.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    scene.eevee.taa_render_samples = 16
    scene.view_settings.view_transform = "Standard"
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .29

    keep.stone_palette()
    for name, color in {
        "stone": "74786D", "slate": "596861", "ash": "818579", "trim": "929489",
        "bone": "ADA893", "rock": "616960", "wood": "635044", "ink": "2F3837",
        "shingle": "4B6568", "verdigris": "547371", "deep": "3D5559",
        "lichen": "747963", "blue": "366D76",
    }.items():
        keep.pigment(name, color)
    for name, color, energy in (
        ("amber", "E9A362", .32), ("honey", "F8C782", .49), ("ruby", "AD755E", .33),
        ("saffron", "FFB95F", .48), ("smoke", "BA865C", .28),
    ):
        keep.pigment(name, color, energy)

    for layer, build in (("far", keep.far), ("crown", keep.crown), ("gate", keep.gate)):
        keep.layer = layer
        build()
        if layer == "crown":
            keep.lower_ward()
    keep.layer = "outer"
    keep.outer_ward()
    keep.gate_condition(0)
    keep.assemble()
    for obj in keep.plates["outer"]:
        obj.scale.z = .84
    for obj in list(bpy.data.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    render.light("Cloud-filtered key", (-6, -6, 13), (0, 0, 2), 10, 1950, (1, .96, .85))
    render.light("Cool sky fill", (5, 8, 12), (0, 0, 2), 14, 1250, (.83, .92, 1))

    def show(near):
        for group, objects in keep.plates.items():
            for obj in objects:
                obj.hide_render = (group == "outer") != near

    show(False)
    render_plate(scene, scratch / "distant-keep", (0, 0, 6.7), 55, 14, 7, (1480, 580))
    show(True)
    metadata = {}
    for layout in ("phone", "wide"):
        data = json.loads((scratch / f"{layout}-gate.json").read_text())
        a, b = map(point, data["road"][9:11])
        pitch = 52
        # The projected inward axis follows the approach at the simulation sill.
        yaw = math.degrees(math.atan2((b[0] - a[0]) * math.sin(math.radians(pitch)), a[1] - b[1]))
        metadata[layout] = render_plate(scene, scratch / f"ward-{layout}",
                                       (0, .26, 1.52), 6.4, pitch, yaw, (496, 432))
    (scratch / "ward-sills.json").write_text(json.dumps(metadata, indent=2) + "\n")


if __name__ == "__main__":
    main(Path(sys.argv[sys.argv.index("--") + 1]))
