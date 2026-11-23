"""Painted scenery with ground pivots and a clear silhouette at 65 degrees."""

from math import atan, cos, sin, tau

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


def cave(eyes_open):
    root = spike_root(meadow.cave)
    if not eyes_open:
        for child in root.children_recursive:
            if child.name.startswith("Lantern eye"):
                bpy.data.objects.remove(child, do_unlink=True)
    root.location = (0, 0, 0)
    # The spike's mouth is pitched up and slightly toward the copy stand.
    root.rotation_euler.z = -.22
    return root


def spruce():
    twig("Exposed fir trunk", (-.033, -.166, 0), (.028, .359, 1.19), .110, .035, "#766851")
    twig("Visible fir root", (-.092, -.249, .011), (-.023, -.143, .111), .039, .070, "#72634F")
    tiers = (
        (-.016, -.014, .380, .514, -.57, "#456357"),
        (.055, .142, .629, .381, .22, "#50725F"),
        (-.037, .271, .872, .270, .97, "#5A7C63"),
        (.032, .404, 1.083, .166, 1.96, "#6B896B"),
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


def oak(variant):
    # Crown centres and radii describe four silhouettes: a broad mature crown,
    # a high fork, a wind-bent crown and a low, round sapling.
    crowns = (
        ((-.386, .01, 1.04, .36), (.394, -.07, 1.08, .35), (.03, .345, 1.18, .36),
         (-.15, -.305, 1.12, .34), (-.191, .038, 1.36, .40), (.255, .070, 1.30, .37)),
        ((-.25, -.09, 1.00, .31), (.24, -.09, 1.16, .32), (.23, .16, 1.32, .33),
         (-.14, .13, 1.48, .34), (.12, .07, 1.59, .30)),
        ((-.23, -.21, .89, .31), (.18, -.20, .99, .34), (.52, .06, 1.02, .33),
         (.14, .20, 1.13, .43), (.40, .11, 1.23, .35)),
        ((-.21, .03, .85, .29), (.23, -.10, .92, .27), (.05, .22, .95, .27),
         (-.06, -.06, 1.08, .36)),
    )[variant]
    lean_x, lean_y, height = ((-.04, -.03, 1.05), (.05, .12, 1.27),
                             (.23, .15, .97), (-.01, .02, .88))[variant]
    bark = "#72644B"
    twig("Split oak trunk", (.03, -.024, 0), (lean_x, lean_y, height), .130, .074, bark)
    for angle in (.18, 2.72, 4.06, 5.34):
        twig("Exposed oak root", (.18*cos(angle), .18*sin(angle), .025),
             (.023, -.021, .16), .029, .069, bark)
    foliage = ("#496B4D", "#517450", "#557951", "#5E8057", "#678858", "#608156")
    for index, (x, y, z, r) in enumerate(crowns):
        tilt = (-.38, .29, .85, -.73, -.52, .57)[index]
        twig("Crooked oak bough", (lean_x*.62, lean_y*.62, height*.62),
             (x, y, z), .059, .024, bark)
        crown = meadow.ringbody("Flattened lobed oak crown", (0, 0, 0), (
            (-.141, r*.38, r*.35, -.04, -.026),
            (-.063, r*.83, r*.64, -.052, -.020),
            (.018, r, r*.76, -.003, .025),
            (.090, r*.87, r*.66, .017, .019),
            (.133, r*.69, r*.49, .005, -.014),
            (.153, r*.31, r*.32, -.041, -.006),
            (.162, r*.05, r*.06, -.021, -.001),
        ), foliage[index], sides=30, wobble=.107)
        crown.location = (x, y, z)
        crown.rotation_euler.z = tilt
        for i in range(6):
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
            ], [(i, (i-1)%8, 8) for i in range(8)], ("#6C8B58", "#74935D", "#668758")[i%3],
                smooth=True)


def birch():
    bark = "#AFA28B"
    twig("Ivoried birch trunk", (-.02, 0, 0), (.10, .06, 1.84), .090, .038, bark)
    for i in range(6):
        z = .19 + i * .171
        y = -.073 + .012 * i
        x = -.020 + .011 * i
        line("Birch bark scar", [(x-.037, y+.007, z), (x-.007, y, z+.014),
                                (x+.038, y+.006, z+.004)], .010, "#77675D")
    twigs = (
        (-.27, -.03, .99, .54, "#7A8150"),
        (.31, -.15, 1.23, .73, "#858B51"),
        (-.23, .18, 1.42, 2.44, "#8B8F52"),
        (.22, .12, 1.66, 1.07, "#959956"),
        (.03, -.05, 1.84, -1.10, "#9A9A56"),
    )
    for index, (x, y, z, tilt, color) in enumerate(twigs):
        twig("Pale birch branch", (.015, .018, z-.32), (x, y, z),
             .039, .018, bark)
        bough = peb("Upright yellow leaves", (x, y, z), (.163, .229, .202), color, tilt)
        bough.rotation_euler.y = (-1 if x < 0 else 1) * .31
        for i in range(5):
            a = i * 2.4 + tilt
            leaf("Long birch leaf", (x+.094*cos(a), y+.103*sin(a), z+.151),
                 .179, .036, a, .061 - .032*(i % 2), ("#9D9D5B", "#83864D", "#9A9D60")[(index + i) % 3])


def bush(berries):
    shades = ("#49694D", "#597B52", "#618054") if berries else ("#607A51", "#698457", "#748B5B")
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
             "#758B59" if berries else "#819662")
        if berries and index < 6:
            peb("Muted rose berry", (x+.031, y, z+.024), (.039, .038, .033),
                ("#A46659", "#8C584E", "#AC7560")[index % 3])


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
    # The town pennon hangs outside the front gable, in the cottage's own cell.
    twig("Town flagstaff", (-.60,-.49,.015), (-.60,-.49,1.49), .022,.019, umber)
    peb("Brass pole finial", (-.60,-.49,1.51), (.037,.037,.043), "#F9BB52")
    corners = [(-.59,-.50,1.12),(-.40,-.54,1.14),(-.20,-.50,1.11),
               (-.29,-.57,.979),(-.20,-.61,.852),(-.40,-.65,.891),(-.59,-.61,.865)]
    meadow.mesh("Town's blue swallowtail", [(x,y,z+.33) for x,y,z in corners], [(0,1,5,6),(1,2,3,5),(3,4,5)], "#235BA2")
    coin = peb("Town coin on blue", (-.445,-.602,1.34), (.066,.022,.070), "#FFD169")
    coin.rotation_euler.x = -.38
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
            return cave(eyes_open=phase == 0)
        root = meadow.group(kind)
        meadow.parent = root
        if kind == "cottage":
            cottage()
        elif kind == "spruce":
            spruce()
            root.scale = (.89,) * 3
        elif kind == "oak":
            oak(phase)
            root.scale = ((.86, .76, .82, .68)[phase],) * 3
            root.rotation_euler.z = (.18, -.43, 1.10, -1.72)[phase]
        elif kind == "birch":
            birch()
            root.scale = (.75,) * 3
        else:
            bush(kind == "berry-bush")
            root.scale = (.92, .92, .80)
        return root
    finally:
        meadow.parent, meadow.material = previous
