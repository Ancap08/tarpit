"""Hand-shaped goblin miniature in four walking poses, facing local +Y."""

from math import cos, radians, sin, tau

import bpy
from mathutils import Matrix, Vector


def build_goblin(mat, phase=0):
    """Build one miniature at the origin. Each phase is a full mesh pose."""
    palette = {
        "skin": mat("Goblin lime", "#A7C644"),
        "nose": mat("Goblin nose", "#BDD554"),
        "ear": mat("Goblin inner ear", "#BC815A"),
        "brow": mat("Goblin brows", "#3C4C21"),
        "eye": mat("Goblin ivory", "#F5E8AD"),
        "ink": mat("Goblin ink", "#29211D"),
        "cloth": mat("Goblin aubergine", "#592D50"),
        "scarf": mat("Goblin red scarf", "#B63F43"),
        "boot": mat("Goblin boots", "#49382E"),
        "cuff": mat("Goblin leather cuff", "#78563E"),
        "plinth": mat("Goblin plinth", "#55473D"),
        "top": mat("Goblin plinth top", "#82715B"),
    }
    root = bpy.data.objects.new("Goblin · march %d" % (phase % 4), None)
    bpy.context.collection.objects.link(root)

    def attach(obj, name, color):
        obj.name = name
        obj.parent = root
        obj.data.materials.append(palette[color])
        for face in obj.data.polygons:
            face.use_smooth = True
        return obj

    def oval(name, location, radii, color):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=24, ring_count=16, location=location,
        )
        obj = attach(bpy.context.object, name, color)
        obj.scale = radii
        return obj

    def segment(name, start, end, width, depth, color):
        start, end = Vector(start), Vector(end)
        axis = end - start
        obj = oval(name, (start + end) / 2, (width, depth, axis.length / 2 + width / 2), color)
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = axis.to_track_quat("Z", "Y")
        return obj

    def profile(name, rings, colors, steps=28):
        """Stack shaped cross-sections from bottom to top."""
        verts = []
        for x, y, z, rx, ry in rings:
            verts.extend(
                (x + rx * cos(tau * i / steps), y + ry * sin(tau * i / steps), z)
                for i in range(steps)
            )
        faces = [tuple(reversed(range(steps)))]
        for row in range(len(rings) - 1):
            for i in range(steps):
                a = row * steps + i
                b = row * steps + (i + 1) % steps
                faces.append((a, b, b + steps, a + steps))
        faces.append(tuple(range(len(verts) - steps, len(verts))))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        attach(obj, name, colors[0])
        if len(colors) > 1:
            mesh.materials.append(palette[colors[1]])
            mesh.polygons[-1].material_index = 1
        for index in (0, -1):
            mesh.polygons[index].use_smooth = False
        return obj

    def ear(side, points):
        # A pinched, sculpted shell with a recessed warm face and lime rim.
        outline = [Vector((side * x, y + lean, z + bob + side * ear_flick * (x - .12) / .27)) for x, y, z in points]
        center = sum(outline, Vector((0, 0, 0))) / len(outline)
        rim = [center.lerp(p, .76) + Vector((0, .035, 0)) for p in outline]
        recess = center + Vector((0, .021, 0))
        back = center - Vector((0, .027, 0))
        n = len(outline)
        verts = outline + rim + [recess, back]
        faces = []
        for i in range(n):
            j = (i + 1) % n
            faces.extend(((i, j, n + j, n + i), (n + i, n + j, 2 * n), (j, i, 2 * n + 1)))
        # Mirroring in X reverses the face winding.
        if side < 0:
            faces = [tuple(reversed(face)) for face in faces]
        name = "Pointed ear"
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        attach(obj, name, "skin")
        mesh.materials.append(palette["ear"])
        for i in range(n):
            mesh.polygons[3 * i + 1].material_index = 1

    profile("Chamfered round base", [
        (0, 0, .000, .255, .255),
        (0, 0, .009, .284, .284),
        (0, 0, .037, .284, .284),
        (0, 0, .053, .263, .263),
    ], ("plinth", "top"), steps=48)

    # Forward offsets and lift for left and right feet. These are contact and
    # passing poses, with the hands counter-swinging against the feet.
    left, right, bob, lean, sway, twist, nod, ear_flick = (
        ((.157, .000), (-.151, .011), -.009, .006, -.026, 18, -5, .020),
        ((-.065, .000), (.103, .082), .010, .024, -.039, 8, 4, -.010),
        ((-.158, .014), (.153, .000), -.009, .004, .026, -18, -4, -.018),
        ((.109, .085), (-.063, .000), .009, .022, .039, -8, 5, .010),
    )[phase % 4]

    for side, (stride, lift) in ((-1, left), (1, right)):
        x = side * .091
        hip = (x * .7, lean - .018, .285 + bob)
        knee = (x, stride * .65 + .036, .181 + lift * .46)
        ankle = (x, stride - .020, .097 + lift)
        segment("Bent trouser leg", hip, knee, .061, .056, "cloth")
        segment("Boot shaft", knee, ankle, .047, .044, "boot")
        oval("Boot cuff", (x, knee[1], knee[2] - .008), (.054, .051, .026), "cuff")
        oval("Round-toed boot", (x, stride + .022, .093 + lift), (.072, .096, .040), "boot")

        shoulder = (side * .137 + sway * .6, lean - side * twist * .0028, .429 + bob)
        elbow = (side * .207 + sway * .4, lean - stride * .67 - .019, .329 + bob)
        hand = (
            side * .211 + sway * .35,
            lean - stride * 1.10 + .022,
            .247 + bob + abs(stride) * .40,
        )
        segment("Puffed tunic sleeve", shoulder, elbow, .057, .052, "cloth")
        segment("Green forearm", elbow, hand, .038, .036, "skin")
        oval("Mitten fist", hand, (.057, .050, .056), "skin")
        oval("Curled thumb", (hand[0] - side * .024, hand[1] + .031, hand[2] + .005),
             (.023, .023, .029), "nose")

    profile("Flared tunic", [
        (sway * (z - .249) / .227, lean, z + bob, rx, ry)
        for z, rx, ry in (
            (.249, .126, .078), (.263, .145, .089), (.295, .134, .094),
            (.353, .123, .094), (.414, .142, .091), (.451, .126, .073),
            (.476, .076, .056),
        )
    ], ("cloth",))
    oval("Neckerchief collar", (sway, lean + .014, .476 + bob), (.112, .088, .042), "scarf")
    oval("Neckerchief knot", (sway + .061, lean + .097, .465 + bob), (.042, .034, .032), "scarf")
    segment("Hanging neckerchief", (sway + .065, lean + .090, .463 + bob),
            (sway + .113, lean + .091, .403 + bob), .027, .017, "scarf")

    # A wide dome and low cheekbones give the head a blocky, readable outline.
    body_objects = set(root.children)
    profile("Sculpted goblin head", [
        (x, lean + y, z + bob, rx, ry)
        for x, y, z, rx, ry in (
            (.000, .028, .499, .059, .060), (.000, .028, .514, .108, .094),
            (.005, .030, .552, .161, .118), (.003, .012, .594, .172, .129),
            (.000, .006, .634, .168, .126), (-.004, -.002, .680, .146, .111),
            (-.008, -.003, .722, .112, .083), (-.010, -.001, .749, .058, .045),
            (-.010, .000, .757, .016, .014),
        )
    ], ("skin",))
    ear(1, [
        (.117, .016, .661), (.202, -.027, .679), (.307, -.091, .720),
        (.378, -.105, .745), (.349, -.011, .673), (.311, .043, .604),
        (.229, .044, .550), (.149, .043, .569),
    ])
    ear(-1, [
        (.122, .023, .657), (.206, -.033, .702), (.308, -.121, .749),
        (.388, -.123, .753), (.355, -.038, .687), (.297, .021, .625),
        (.223, .039, .567), (.145, .034, .578),
    ])

    def face(name, x, y, z, radii, color):
        return oval(name, (x, y + lean, z + bob), radii, color)

    for side in (-1, 1):
        x = side * .078
        face("Deep eye socket", x, .113, .626, (.057, .035, .046), "brow")
        face("Ivory eye", x, .135, .625, (.036, .026, .029), "eye")
        face("Dark pupil", x + .006, .157, .628, (.016, .012, .018), "ink")
        brow = face("Mischievous heavy brow", x, .125, .655, (.061, .031, .023), "brow")
        brow.rotation_euler.y = -side * .34
        face("High cheek", side * .109, .108, .571, (.051, .038, .037), "skin")

    face("Smirk", .019, .140, .552, (.081, .016, .023), "ink").rotation_euler.y = -.13
    face("Small ivory snaggletooth", .071, .157, .559, (.015, .010, .020), "eye")
    face("Nose bridge", -.011, .141, .609, (.038, .060, .048), "skin")
    face("Broad hooked nose", -.016, .187, .586, (.058, .080, .041), "nose")

    # Lift the features toward the overhead camera. The pivot stays high on
    # the cranium so the neck stays tucked into the scarf on every frame.
    pivot = Vector((0, lean + .022, .648 + bob))
    head_turn = (
        Matrix.Translation(pivot + Vector((sway * .5, .008, 0)))
        @ Matrix.Rotation(radians(twist * .48), 4, "Z")
        @ Matrix.Rotation(radians(sway * 224), 4, "Y")
        @ Matrix.Rotation(radians(49 + nod), 4, "X")
        @ Matrix.Translation(-pivot)
    )
    for obj in root.children:
        if obj not in body_objects:
            obj.matrix_basis = head_turn @ obj.matrix_basis

    return root
