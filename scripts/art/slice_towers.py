"""Painted Meadow miniatures. The ground pivot is local zero and +Y is forward."""

from math import cos, pi, sin, tau

import meadow
from cannon import build_cannon

IRON = "#364454"
GOLD = "#DFAD59"
INK = "#211E27"
WOOD = "#79482D"
PALE = "#F6DFAA"
TEAL = "#247F94"
VIOLET = "#77688E"
COAL = "#61262D"
EMBER = "#EA5625"
AMBER = "#FFBC45"


def _footing(edge, top, radius=.475):
    meadow.disc("Pedestal edge", radius, .085, edge)
    meadow.ringbody("Painted pedestal top", (0, 0, .063),
                    [(0, radius-.026, radius-.026, 0, 0),
                     (.034, radius-.046, radius-.046, 0, 0)], top)


def _musketeer():
    _footing("#394248", "#57726B")
    # Step toward the firing line, with the trailing boot behind the coat.
    for x, y, turn in ((-.15, .12, -.13), (.22, -.18, -.43)):
        meadow.peb("Leather gaiter", (x, y, .16), (.103, .176, .084), WOOD, turn)
        meadow.twig("Tan breeches", (x, y-.025, .17), (.055 + x*.62, -.079, .31),
                   .086, .090, "#C49A68")
    coat = meadow.ringbody("Blue field coat", (.063, -.087, .252),
                          [(0, .205, .15, 0, 0), (.12, .187, .133, 0, 0),
                           (.224, .203, .153, -.026, .032), (.29, .119, .110, -.049, .066)],
                          TEAL)
    coat.rotation_euler.z = -.25
    meadow.twig("Cream crossbelt", (-.113, -.193, .472), (.193, -.219, .299),
               .036, .034, PALE)
    meadow.peb("Red neckcloth", (.035, .035, .533), (.113, .120, .064), "#BB4935")
    meadow.peb("Face", (.022, -.014, .600), (.139, .146, .141), "#D69362")
    meadow.peb("Nose", (-.017, .104, .584), (.050, .069, .047), "#E4A577")
    meadow.peb("Navy hat brim", (.034, -.035, .681), (.180, .171, .041), "#243444", -.17)
    hat = meadow.ringbody("Cocked felt hat", (.034, -.035, .683),
                          [(0, .183, .16, 0, 0), (.048, .173, .153, 0, 0),
                           (.095, .121, .105, 0, .012)], "#2C435A",
                          sides=3, smooth=False)
    hat.rotation_euler.z = .36
    meadow.line("Ochre brim stitching", [(-.084, -.101, .711), (.061, -.201, .707),
                                         (.175, -.126, .708)], .017, GOLD)
    plume = meadow.peb("Ivory cockade plume", (.144, -.122, .750),
                       (.060, .171, .043), PALE, .72)
    plume.rotation_euler.x = -.37
    meadow.peb("Red cockade", (.105, -.068, .771), (.047, .054, .029), "#C64B38")

    front_hand, back_hand = (-.249, .227, .457), (-.247, -.072, .509)
    for start, elbow, grip in (((-.107, .019, .493), (-.169, .103, .423), front_hand),
                               ((.212, -.024, .483), (.126, .105, .406), back_hand)):
        meadow.twig("Coat upper arm", start, elbow, .088, .079, TEAL)
        meadow.twig("Aiming sleeve", elbow, grip, .079, .067, TEAL)
        meadow.peb("Pale cuff", grip, (.074, .065, .058), PALE)
    stock = meadow.box("Carved walnut butt", (-.249, -.201, .507),
                       (.148, .284, .105), "#A45F34", .036)
    stock.rotation_euler.x = .12
    meadow.twig("Warm walnut fore-end", (-.249, -.153, .497), (-.249, .365, .512),
               .069, .047, "#A66E3E")
    # Show the blued silhouette beside the hat, with a lit strip down the barrel.
    meadow.twig("Extended steel barrel", (-.249, -.142, .555), (-.249, .602, .594),
               .058, .047, "#304054")
    meadow.twig("Lit barrel rib", (-.249, -.094, .604), (-.249, .544, .625),
               .024, .016, "#98ADB5")
    for y in (.149, .380, .563):
        z = .555 + (y + .142) * .039 / .744
        meadow.twig("Brass barrel band", (-.249, y, z), (-.249, y+.039, z+.002),
                   .057, .056, GOLD)
    meadow.peb("Dark muzzle opening", (-.249, .606, .594),
               (.029, .013, .027), INK)


def _mortar():
    _footing("#433C4C", "#8E8093")
    for x in (-.185, .185):
        meadow.box("Heavy oak sled runner", (x, -.018, .148), (.168, .69, .139),
                   "#6A513F", .036)
        meadow.box("Iron shoe", (x, .287, .171), (.172, .11, .15), IRON, .026)
        meadow.peb("Pewter trunnion", (x*1.47, .018, .316), (.061, .106, .106), VIOLET)
    meadow.box("Purple iron cradle", (0, -.02, .25), (.483, .43, .20), VIOLET, .044)
    profile = [
        (0, .152, .152, 0, 0), (.034, .190, .190, 0, 0), (.215, .206, .206, 0, 0),
        (.263, .242, .242, 0, 0), (.324, .240, .240, 0, 0),
        (.345, .219, .219, 0, 0), (.345, .167, .167, 0, 0),
        (.319, .147, .147, 0, 0), (.141, .125, .125, 0, 0),
    ]
    tube = meadow.ringbody("Short mortar with open bore", (0, 0, 0), profile, IRON,
                           sides=36, wobble=.014)
    tube.location = (0, -.108, .27)
    tube.rotation_euler.x = -.62
    tube.data.materials.append(meadow.material("Pewter muzzle lip", "#B6A7C4"))
    tube.data.materials.append(meadow.material("Mortar bore", INK))
    for face in tube.data.polygons[1:-1]:
        band = (face.index - 1) // 36
        face.material_index = 1 if band in (3, 4, 5) else 2 if band > 5 else 0
        face.use_smooth = band != 5
    tube.data.polygons[-1].material_index = 2


def _fire_pot():
    _footing("#453A38", "#7A5F53")
    for x, y in ((-.29, -.22), (.29, -.22), (0, .30)):
        meadow.twig("Splayed iron leg", (x, y, .09), (x*.67, y*.67, .36),
                   .061, .054, IRON)
    meadow.ringbody("Terracotta fire pot", (0, 0, .17),
                    [(0, .16, .16, 0, 0), (.048, .237, .237, 0, 0),
                     (.15, .303, .303, 0, .008), (.225, .301, .301, 0, .016),
                     (.27, .265, .265, 0, .028), (.27, .235, .235, 0, .029)],
                    "#AB4133", sides=28)
    meadow.ringbody("Charred bowl lip", (0, .03, .425),
                    [(0, .28, .28, 0, 0), (.029, .292, .292, 0, 0),
                     (.054, .268, .268, 0, 0), (.054, .232, .232, 0, 0),
                     (.023, .21, .21, 0, 0)], COAL, sides=28)
    for t in range(6):
        a = t * tau/6 + .35
        meadow.peb("Red coals", (.15*cos(a), .03+.15*sin(a), .469),
                   (.071, .087, .038), EMBER, a)
    _flame_body(.02, .055, .464, 1.25)
    meadow.twig("Terracotta pouring spout", (0, .205, .421), (0, .411, .467),
               .104, .078, "#BC5836")


def _flame_body(x, y, z, scale):
    # An asymmetric outer flame and a brighter lobe with separate silhouettes.
    outer_shape = [(0, .085, .097, 0, 0), (.06, .14, .137, 0, 0),
                   (.12, .119, .114, -.013, .031), (.20, .105, .079, -.026, .064),
                   (.27, .067, .047, .024, .10), (.34, .008, .012, .09, .147)]
    for name, color, shape in (
            ("Orange flame", EMBER, outer_shape),
            ("Honey flame core", AMBER, [(.012, .069, .076, .018, -.026),
                                         (.074, .085, .077, .01, -.045),
                                         (.15, .052, .053, .057, -.051),
                                         (.228, .006, .008, .058, -.001)])):
        rings = [tuple(n*scale for n in ring) for ring in shape]
        meadow.ringbody(name, (x, y, z), rings, color, sides=16, wobble=.04)


def _ball():
    meadow.peb("Cast iron ball", (0, 0, 0), (.153, .151, .150), IRON)


def _arrow():
    meadow.twig("Honey ash shaft", (0, -.211, 0), (0, .149, 0),
               .031, .033, "#E5B36F")
    head = meadow.mesh("Forged pewter broadhead",
                       [(-.086, .084, 0), (0, .259, 0), (.086, .084, 0),
                        (0, .129, .042), (0, .129, -.036)],
                       [(0, 1, 3), (1, 2, 3), (2, 0, 3),
                        (1, 0, 4), (2, 1, 4), (0, 2, 4)], "#ADBCC1")
    head.data.materials.append(meadow.material("Blued broadhead bevel", "#647C89"))
    for face in (1, 2, 4):
        head.data.polygons[face].material_index = 1
    for side in (-1, 1):
        meadow.peb("Vermilion fletching", (side*.045, -.150, .009),
                   (.045, .076, .023), "#D14C32", side*.43)


def _shell():
    meadow.peb("Mortar shell", (0, 0, 0), (.178, .184, .176), IRON)
    meadow.twig("Bronze fuse socket", (0, .039, .131), (0, .065, .164),
               .066, .056, "#C29450")
    meadow.line("Lit curled fuse", [(0, .067, .16), (.007, .095, .193),
                                   (.045, .112, .209)], .020, WOOD)
    meadow.peb("Fuse ember", (.046, .114, .211), (.044, .044, .027), AMBER)


def _glob():
    meadow.peb("Black pitch", (0, .021, 0), (.14, .137, .114), "#211E27", .28)
    meadow.peb("Tar blister tail", (.008, -.091, -.04), (.091, .141, .063), "#211E27", -.19)
    meadow.line("Pitch glint", [(-.092, -.015, .079), (-.057, .040, .116),
                                (.017, .084, .103)], .018, "#A08C9D")


def _flame():
    _flame_body(0, 0, -.102, .89)


def build(kind, mat, phase=0):
    """Build a single tower or projectile and return its Blender object root.

    The static models accept the same phase argument as the shared sprite renderer.
    """
    if kind == "cannon":
        return build_cannon(mat)
    previous_parent, previous_material = meadow.parent, meadow.material
    meadow.material = mat
    try:
        if kind == "longbow":
            return meadow.longbow()
        if kind == "tar-pit":
            # The broken front wall faces local +Y in slice assets.
            root = meadow.tarpit()
            for obj in root.children:
                obj.location.x *= -1
                obj.location.y *= -1
                obj.rotation_euler.z += pi
            return root
        builder = {
            "musketeer": _musketeer,
            "mortar": _mortar,
            "fire-pot": _fire_pot,
            "cannonball": _ball,
            "arrow": _arrow,
            "mortar-shell": _shell,
            "tar-glob": _glob,
            "flame": _flame,
        }[kind]
        root = meadow.group(kind)
        meadow.parent = root
        builder()
        return root
    finally:
        meadow.parent, meadow.material = previous_parent, previous_material
