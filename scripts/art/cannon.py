"""Procedural tabletop Cannon. Its barrel points along local +Y."""

from math import cos, pi, sin

import bpy
from mathutils import Vector


def _finish(obj, name, root, material, bevel=0):
    obj.name = name
    obj.parent = root
    obj.data.materials.append(material)
    if bevel:
        rounded = obj.modifiers.new("Rounded clay edges", "BEVEL")
        rounded.width = bevel
        rounded.segments = 3
        normals = obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")
        normals.keep_sharp = True
    return obj


def _block(name, location, dimensions, root, material, bevel):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _finish(obj, name, root, material, bevel)


def _disc(name, location, radius, depth, root, material, bevel, axis=(0, 0, 1)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32, radius=radius, depth=depth, location=location
    )
    obj = bpy.context.object
    obj.rotation_euler = Vector(axis).to_track_quat("Z", "Y").to_euler()
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    return _finish(obj, name, root, material, bevel)


def _barrel(root, iron, brass, bore):
    # From the breech to the open muzzle, then through the recessed bore.
    # The two end faces seal the breech and the back of the recessed bore.
    profile = (
        (-0.425, 0.031, 0),
        (-0.417, 0.053, 0),
        (-0.388, 0.057, 0),
        (-0.364, 0.043, 0),
        (-0.355, 0.043, 0),
        (-0.350, 0.103, 0),
        (-0.339, 0.128, 0),
        (-0.306, 0.129, 0),
        (-0.298, 0.119, 0),
        (-0.215, 0.123, 0),
        (0.155, 0.096, 0),
        (0.295, 0.099, 1),
        (0.309, 0.145, 1),
        (0.339, 0.166, 1),
        (0.421, 0.166, 1),
        (0.438, 0.148, 1),
        (0.438, 0.099, 1),
        (0.427, 0.086, 2),
        (0.186, 0.065, 2),
        (0.183, 0.012, 2),
    )
    sides = 40
    vertices = []
    faces = []
    for y, radius, _material_index in profile:
        for side in range(sides):
            angle = 2 * pi * side / sides
            vertices.append((radius * cos(angle), y, 0.385 + 0.16 * y + radius * sin(angle)))
    for ring in range(len(profile) - 1):
        for side in range(sides):
            next_ring = ring + 1
            next_side = (side + 1) % sides
            faces.append((
                ring * sides + side,
                next_ring * sides + side,
                next_ring * sides + next_side,
                ring * sides + next_side,
            ))
    faces.append(tuple(range(sides)))
    faces.append(tuple(reversed(range(len(vertices) - sides, len(vertices)))))
    mesh = bpy.data.meshes.new("Cannon barrel profile")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Tapered barrel with recessed bore", mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    for material in (iron, brass, bore):
        mesh.materials.append(material)
    for face in mesh.polygons[:-2]:
        ring = face.index // sides
        face.material_index = profile[ring][2]
        face.use_smooth = ring not in (15, 18)
    mesh.polygons[-1].material_index = 2


def build_cannon(mat):
    """Link the clay miniature to the current collection and return its root."""
    root = bpy.data.objects.new("Cannon", None)
    bpy.context.collection.objects.link(root)

    iron = mat("Cannon blued iron", "#38485A")
    bore = mat("Cannon bore and tire", "#191C24")
    brass = mat("Cannon brass", "#E6AD55")
    red = mat("Cannon vermilion", "#B53427")
    axle_cap = mat("Cannon ochre red hubs", "#E46136")
    timber = mat("Cannon dark timber", "#6E382A")
    base_edge = mat("Cannon base edge", "#3D3030")
    base_top = mat("Cannon base clay", "#9D7254")

    _disc("Dark pedestal rim", (0, 0, 0.030), 0.478, 0.060, root, base_edge, 0.012)
    _disc("Inset pedestal top", (0, 0, 0.062), 0.452, 0.036, root, base_top, 0.012)

    _block("Wooden carriage bed", (0, -0.054, 0.153), (0.43, 0.60, 0.131), root, timber, 0.035)
    for x in (-0.17, 0.17):
        cheek = _block("Red carriage cheek", (x, -0.062, 0.254), (0.116, 0.58, 0.168), root, red, 0.032)
        cheek.rotation_euler.x = 0.17
        _block("Raised trunnion seat", (x, 0.006, 0.318), (0.112, 0.256, 0.13), root, red, 0.026)
    for y in (-0.292, 0.189):
        _block("Carriage crossbeam", (0, y, 0.217), (0.4, 0.093, 0.067), root, timber, 0.017)

    x_axis = (1, 0, 0)
    for side in (-1, 1):
        x = side * 0.289
        y, z = 0.006, 0.266
        _disc("Iron wheel tire", (x, y, z), 0.195, 0.09, root, bore, 0.016, x_axis)
        face_x = side * 0.332
        _disc("Red wheel face", (face_x, y, z), 0.170, 0.027, root, red, 0.014, x_axis)
        for offset in (-0.066, 0.058):
            # Inlaid timber joints are shallow and stay inside the red rim.
            _block("Wheel timber seam", (side * 0.345, y, z + offset), (0.010, 0.274, 0.013), root, timber, 0.004)
        _disc("Painted wheel hub", (side * 0.356, y, z), 0.078, 0.046, root, axle_cap, 0.012, x_axis)
        _disc("Brass hub pin", (side * 0.382, y, z), 0.032, 0.025, root, brass, 0.006, x_axis)
        _disc("Brass trunnion end", (side * 0.227, y, 0.388), 0.056, 0.028, root, brass, 0.010, x_axis)

    _barrel(root, iron, brass, bore)
    return root
