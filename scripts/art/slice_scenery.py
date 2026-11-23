"""Painted scenery with ground pivots and a clear silhouette at 65 degrees."""

from math import atan, cos, sin, sqrt, tau

import bpy

import meadow

peb = meadow.peb
box = meadow.box
twig = meadow.twig
leaf = meadow.leaf
line = meadow.line


def spike_root(builder, *args):
    existing = set(bpy.context.collection.objects)
    builder(*args)
    return next(obj for obj in bpy.context.collection.objects
                if obj not in existing and obj.parent is None)


def cave():
    root = spike_root(meadow.cave)
    root.location = (0, 0, 0)
    # The spike's mouth is pitched up and slightly toward the copy stand.
    root.rotation_euler.z = -.22
    return root


def spruce():
    twig("Exposed fir trunk", (-.033, -.166, 0), (.028, .359, 1.19), .110, .035, "#A06A48")
    twig("Visible fir root", (-.092, -.249, .011), (-.023, -.143, .111), .039, .070, "#8E5A43")
    tiers = (
        (-.016, -.014, .380, .514, -.57, "#284F52"),
        (.055, .142, .629, .381, .22, "#366C62"),
        (-.037, .271, .872, .270, .97, "#4D826B"),
        (.032, .404, 1.083, .166, 1.96, "#81A978"),
    )
    sides = 20
    for x, y, z, radius, angle, color in tiers:
        vertices = []
        for height, shrink, shift in ((0, 1, 0), (.046, .95, .09), (.199, .53, .62)):
            for i in range(sides):
                a = tau * i / sides + angle
                asymmetry = .96 + .11*cos(a-angle) + .060*sin(3*a+angle) + .046*cos(5*a)
                tooth = (.062 if i % 2 else -.032) * shrink
                r = radius * asymmetry * shrink
                vertices.append((x + r*cos(a) + shift*.042*cos(angle),
                                 y + r*sin(a)*.65 + shift*.124,
                                 z + height + tooth))
        vertices.append((x + .051*cos(angle), y + .187, z+.370))
        faces = [tuple(reversed(range(sides)))]
        for row in range(2):
            for i in range(sides):
                a, b = row*sides+i, row*sides+(i+1)%sides
                faces.append((a, b, b+sides, a+sides))
        faces += [(2*sides+i, 2*sides+(i+1)%sides, 3*sides) for i in range(sides)]
        meadow.mesh("Flared fir skirt", vertices, faces, color, smooth=True, bevel=.012)


def oak():
    bark = "#774E38"
    twig("Split oak trunk", (.05, -.024, 0), (-.036, -.026, 1.05), .137, .092, bark)
    for angle in (0, 1.18, 2.72, 4.06, 5.34):
        twig("Exposed clinker root", (.23*cos(angle), .21*sin(angle), .025),
             (.01, -.021, .19), .036, .079, bark)
    crowns = (
        (-.386, .01, 1.04, .37, "#38673F", -.38),
        (.394, -.07, 1.08, .36, "#487943", .29),
        (.03, .345, 1.18, .38, "#4A7940", .85),
        (-.15, -.305, 1.12, .38, "#5F8F48", -.73),
        (-.191, .038, 1.36, .43, "#66984B", -.52),
        (.255, .070, 1.30, .39, "#578B46", .57),
    )
    for index, (x, y, z, r, color, tilt) in enumerate(crowns):
        twig("Crooked oak bough", (-.02, 0, .70), (x, y, z), .068, .026, bark)
        crown = meadow.ringbody("Flattened lobed oak crown", (0, 0, 0), (
            (-.141, r*.38, r*.35, -.04, -.026),
            (-.063, r*.83, r*.64, -.052, -.020),
            (.018, r, r*.76, -.003, .025),
            (.090, r*.87, r*.66, .017, .019),
            (.133, r*.69, r*.49, .005, -.014),
            (.153, r*.31, r*.32, -.041, -.006),
            (.162, r*.05, r*.06, -.021, -.001),
        ), color, sides=30, wobble=.107)
        crown.location = (x, y, z)
        crown.rotation_euler.z = tilt
        for i in range(8):
            a = i * 2.4 + index
            u = r * (.25 + .20 * (i % 3))
            # Overlapping flat oak leaves break up the shoulders of the cluster.
            pos = (x+.74*u*cos(a), y+.72*u*sin(a), z+.152-u*.19)
            v = .08 + .018*(i % 3)
            meadow.mesh("Rounded oak leaves", [
                (pos[0]+dx*cos(a)-dy*sin(a), pos[1]+dx*sin(a)+dy*cos(a), pos[2]+height)
                for dx, dy, height in ((0, 0, 0), (v*.22, v*.48, .013), (v*.74, v*.52, .008),
                                       (v*1.54, v*.34, .006), (v*1.75, 0, .005),
                                       (v*1.44, -v*.43, .006), (v*.64, -v*.52, .008),
                                       (v*.21, -v*.38, .012), (v*.77, 0, .026))
            ], [(i, (i-1)%8, 8) for i in range(8)], ("#789C51", "#83A255", "#67964D")[i%3],
                smooth=True)


def birch():
    bark = "#E7DAB7"
    twig("Ivoried birch trunk", (-.02, 0, 0), (.10, .06, 1.84), .090, .038, bark)
    for i in range(6):
        z = .19 + i * .171
        y = -.073 + .012 * i
        x = -.020 + .011 * i
        line("Birch bark scar", [(x-.037, y+.007, z), (x-.007, y, z+.014),
                                (x+.038, y+.006, z+.004)], .010, "#77675D")
    twigs = (
        (-.27, -.03, .99, .54, "#B7973A"),
        (.31, -.15, 1.23, .73, "#CFAC45"),
        (-.23, .18, 1.42, 2.44, "#DDB748"),
        (.22, .12, 1.66, 1.07, "#E4C251"),
        (.03, -.05, 1.84, -1.10, "#F1CE5B"),
    )
    for index, (x, y, z, tilt, color) in enumerate(twigs):
        twig("Pale birch branch", (.015, .018, z-.32), (x, y, z),
             .039, .018, bark)
        bough = peb("Upright yellow leaves", (x, y, z), (.163, .229, .202), color, tilt)
        bough.rotation_euler.y = (-1 if x < 0 else 1) * .31
        for i in range(5):
            a = i * 2.4 + tilt
            leaf("Long birch leaf", (x+.094*cos(a), y+.103*sin(a), z+.151),
                 .179, .036, a, .061 - .032*(i % 2), ("#F0CB54", "#D9AC3F", "#EAD071")[(index + i) % 3])


def bush(berries):
    shades = ("#416845", "#56824A", "#6F8E47") if berries else ("#65884A", "#7DA657", "#98B758")
    width = .27 if berries else .32
    for index, (x, y, lift) in enumerate(((0, 0, .21), (-.21, .045, .145),
                                         (.20, .08, .16), (.04, -.16, .125))):
        peb("Low broadleaf", (x, y, lift), (width-.023*index, .229-.018*index, .181),
            shades[index % len(shades)], index)
    for index in range(11):
        a = index * 2.4
        r = (.10 + .087 * (index % 3)) if berries else (.14 + .080 * (index % 3))
        x, y = r*cos(a), r*sin(a)
        z = .365 - r*.31
        leaf("Pointed bush leaf" if berries else "Painted dock leaf", (x, y, z),
             .162 if berries else .190, .040 if berries else .059, a, .025,
             "#94A94F" if berries else "#ACBF65")
        if berries and index < 8:
            peb("Crimson berry", (x+.031, y, z+.029), (.055, .054, .048),
                ("#D45154", "#A83248", "#EA6556")[index % 3])


def cottage():
    cream, oak, umber = "#F6D8A5", "#8D5739", "#573831"
    box("Medley stone footing", (0, 0, .073), (1.105, .878, .145), "#817E70", .046)
    box("Honey plaster walls", (0, 0, .318), (1.02, .808, .505), cream, .038)
    meadow.mesh("Plaster gables",
                [(-.51, y, .533) for y in (-.405, .405)]
                + [(.51, y, .533) for y in (-.405, .405)]
                + [(0, y, .94) for y in (-.405, .405)],
                [(0, 2, 4), (3, 1, 5), (1, 0, 4, 5), (2, 3, 5, 4), (1, 3, 2, 0)],
                cream, bevel=.016)
    for x in (-.478, .478):
        for y in (-.391, .391):
            box("Oak corner post", (x, y, .325), (.087, .072, .504), oak, .014)
    box("Front gable beam", (0, -.416, .539), (1.00, .053, .069), oak, .015)
    for side in (-1, 1):
        start, end = (side*.586, -.480, .568), (0, -.480, .998)
        twig("Carved fascia", start, end, .039, .030, umber)
    box("Central gable timber", (0, -.423, .677), (.062, .042, .274), oak, .012)

    pitch = .73
    colors = ("#C16749", "#DF8456", "#B4543F", "#D67650", "#E39461")
    roof_angle = atan(pitch)
    for side in (-1, 1):
        base = box("Deep red roof backing", (side*.286, 0, .774), (.720, 1.035, .062),
                   "#A74737", .022)
        base.rotation_euler.y = side * roof_angle
        # Ceramic courses overlap down the roof. Tile ends are hand-rounded.
        for row in range(5):
            x = .069 + row*.120
            for tile in range(6):
                y = -.433 + tile*.169 + (.022 if row % 2 else 0)
                slab = box("Individual terracotta pan tile",
                           (side*x, y, 1.014-pitch*x + .006*sin(3*row+tile)),
                           (.173, .172, .041), colors[(tile+2*row+(side==1)) % len(colors)], .019)
                slab.rotation_euler.y = side * roof_angle
    for index in range(7):
        peb("Rounded ridge tile", (0, -.451 + .150*index, 1.011), (.081, .082, .048),
            colors[(index+1) % len(colors)])

    box("Buff stone chimney", (.331, .173, .958), (.173, .191, .483), "#8D6554", .024)
    for z in (.917, 1.006, 1.096):
        box("Chimney mortar seam", (.331, .173, z), (.179, .195, .014), "#BD967C", .006)
    box("Chimney cap", (.331, .173, 1.188), (.225, .230, .050), "#593A33", .016)
    box("Sooty chimney hole", (.331, .173, 1.216), (.125, .132, .012), "#241E20", .005)

    box("Recessed door surround", (-.204, -.419, .261), (.245, .063, .337), umber, .026)
    box("Weathered teal door", (-.204, -.459, .259), (.177, .037, .280), "#437776", .016)
    for x in (-.235, -.174):
        box("Door board seam", (x, -.480, .261), (.010, .011, .249), "#385653", .003)
    peb("Brass latch", (-.155, -.487, .271), (.024, .019, .021), "#F4B05A")
    box("Carved doorstep", (-.204, -.484, .045), (.294, .156, .088), "#A8A18C", .023)
    box("Window surround", (.239, -.430, .352), (.261, .061, .208), umber, .020)
    box("Honey window light", (.238, -.464, .354), (.187, .020, .135), "#F6BA59", .005)
    box("Window mullion", (.238, -.478, .355), (.021, .013, .136), oak, .004)
    box("Window sash", (.238, -.480, .355), (.184, .012, .018), oak, .004)
    box("Window sill", (.238, -.470, .243), (.266, .077, .038), "#C4895A", .010)


KINDS = ("cave", "cottage", "spruce", "oak", "birch", "bush", "berry-bush")


def build(kind, mat, phase=0):
    """Build a static miniature at the ground origin for the shared renderer."""
    if kind not in KINDS:
        raise ValueError(f"Unknown Meadow scenery: {kind}")
    previous = meadow.parent, meadow.material
    meadow.material = mat
    try:
        if kind == "cave":
            return cave()
        root = meadow.group(kind)
        meadow.parent = root
        if kind == "cottage":
            cottage()
        elif kind == "spruce":
            spruce()
        elif kind == "oak":
            oak()
        elif kind == "birch":
            birch()
        else:
            bush(kind == "berry-bush")
        return root
    finally:
        meadow.parent, meadow.material = previous
