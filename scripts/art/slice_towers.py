"""Painted Meadow miniatures. The ground pivot is local zero and +Y is forward."""

from math import cos, sin, tau

import meadow

IRON = "#364454"
GOLD = "#DFAD59"
INK = "#211E27"
WOOD = "#79482D"
PALE = "#F6DFAA"
TEAL = "#348EAF"
COAL = "#61262D"
EMBER = "#EA5625"
AMBER = "#FFBC45"


def _profile(name, dimensions, colors):
    """Turn a vessel or barrel profile around local Z and paint whole bands."""
    sides = 28
    body = meadow.ringbody(
        name, (0, 0, 0), [(z, radius, radius, 0, 0) for z, radius, _ in dimensions],
        colors[0], sides=sides, wobble=.009,
    )
    for color in colors[1:]:
        body.data.materials.append(meadow.material(f"{name} band", color))
    for face in body.data.polygons[1:-1]:
        band = (face.index - 1) // sides
        face.material_index = dimensions[band][2]
        face.use_smooth = dimensions[band][0] != dimensions[band+1][0]
    body.data.polygons[-1].material_index = dimensions[-1][2]
    return body


def _musketeer():
    for x in (-.31, .31):
        meadow.box("Oak platform crosspiece", (x, 0, .07), (.13, .58, .14), WOOD)
    for y in (-.19, 0, .19):
        meadow.box("Honey oak planks", (0, y, .15), (.76, .18, .13), "#AE784C", .024)
    # Keep the figure upright, with daylight between the shako and the gun.
    # A head, two boots and a single straight barrel survive a 25 px rendering.
    for x, y in ((-.09, .09), (.23, -.12)):
        meadow.peb("Brown boot", (x, y, .28), (.124, .171, .099), "#482C29")
        meadow.twig("Buff breeches", (x, y, .30), (x, y-.018, .56),
                   .091, .118, "#E5BD80")

    meadow.ringbody("Deep blue frock coat", (.087, -.066, .45),
                    [(0, .27, .20, 0, 0), (.17, .22, .17, 0, 0),
                     (.37, .25, .19, 0, 0), (.43, .17, .13, 0, 0)],
                    "#245FA1", sides=18)
    meadow.peb("Crimson neckcloth", (.095, .008, .876), (.163, .149, .084), "#C43D37")
    meadow.peb("Warm face", (.095, .04, 1.046), (.221, .197, .225), "#FFC491")
    meadow.peb("Nose", (.085, .208, 1.039), (.079, .067, .062), "#FFD2A7")
    meadow.ringbody("Blue shako with a brass band", (.10, -.02, 1.198),
                    [(0, .252, .210, 0, 0), (.036, .243, .204, 0, 0),
                     (.058, .198, .168, 0, 0), (.238, .224, .186, 0, -.028)],
                    "#26374B", sides=20)
    meadow.line("Brass hatband", [(-.071, .09, 1.265), (.095, .154, 1.259),
                                  (.255, .089, 1.263)], .031, GOLD)
    meadow.peb("Scarlet plume", (.24, -.078, 1.457), (.080, .081, .144), "#CD463C", .22)

    for side, shoulder, elbow, hand in (
            ("Forward", (-.082, .047, .800), (-.252, .157, .633), (-.301, .279, .754)),
            ("Rear", (.234, -.024, .806), (.217, .192, .688), (-.252, .027, .743))):
        meadow.twig(f"{side} coat sleeve", shoulder, elbow, .122, .105, "#286EB1")
        meadow.twig(f"{side} forearm", elbow, hand, .103, .074, "#286EB1")
        meadow.peb(f"{side} hand", hand, (.087, .077, .064), "#F0B788")

    meadow.box("Long walnut stock", (-.31, -.090, .761), (.155, .60, .116), "#815138", .026)
    meadow.box("Walnut butt", (-.31, -.350, .743), (.178, .180, .142), "#815138", .026)
    meadow.twig("Single long steel barrel", (-.31, -.255, .821), (-.31, .966, .888),
               .082, .064, "#2F404C")
    meadow.twig("Lit steel rib", (-.31, -.165, .882), (-.31, .900, .942),
               .023, .020, "#A8BEC6")
    meadow.twig("Brass muzzle", (-.31, .899, .885), (-.31, .980, .890), .077, .077, GOLD)


def _cannon():
    meadow.box("Smoked oak carriage", (0, -.162, .193), (.425, .655, .221), "#624438", .045)
    meadow.box("Dark trail shoe", (0, -.415, .122), (.433, .181, .108), IRON, .025)
    for side in (-1, 1):
        meadow.box("Blued carriage cheek", (side*.162, -.07, .277),
                   (.144, .45, .194), "#425866", .038)
        wheel = _profile("Steel tire and wood wheel", [
            (0, .237, 0), (.027, .282, 0), (.128, .282, 1),
            (.152, .253, 1), (.152, .216, 2), (.139, .203, 2),
        ], ("#26333D", "#806048", "#604235"))
        wheel.location = (side*.326, -.085, .285)
        wheel.rotation_euler.y = side * tau/4
        for spoke in range(5):
            angle = tau*spoke/5 + .20
            meadow.twig("Wheel spoke", (side*.474, -.085, .285),
                        (side*.474, -.085+.229*cos(angle), .285+.229*sin(angle)),
                        .049, .042, "#A67C57")
        meadow.peb("Steel wheel hub", (side*.492, -.085, .285),
                   (.064, .104, .104), "#6C8C99")

    tube = _profile("Long cannon barrel", [
        (0, .110, 0), (.055, .174, 0), (.147, .169, 0),
        (.746, .133, 0), (.819, .175, 1), (.906, .175, 1),
        (.934, .157, 1), (.934, .110, 2), (.778, .097, 2),
    ], ("#435B70", "#D1D9DE", INK))
    tube.location = (0, -.321, .394)
    tube.rotation_euler.x = -1.37
    meadow.twig("Pewter barrel highlight", (0, -.187, .574), (0, .406, .645),
               .030, .023, "#7F99A6")


def _tar_pit():
    for x, y in ((-.242, -.170), (.242, -.170), (0, .265)):
        meadow.twig("Iron pot foot", (x, y, .018), (x*.80, y*.80, .215),
                   .075, .096, "#353238")
    _profile("Bellied iron pitch pot", [
        (.112, .238, 0), (.162, .330, 0), (.281, .405, 0), (.414, .412, 0),
        (.502, .349, 0), (.540, .341, 0), (.560, .391, 1), (.609, .399, 1),
        (.632, .379, 1), (.632, .326, 2), (.578, .308, 2),
    ], ("#4D4851", "#A48461", "#201D27"))
    # Half the bail rises above the back lip, like a heavy hanging kettle.
    # Short hinge buttons leave one uninterrupted belly under the liquid.
    arch = [(.36*cos(i*tau/24), -.070 - .12*sin(i*tau/24),
             .48 + .40*sin(i*tau/24)) for i in range(13)]
    meadow.line("Forged kettle bail", arch, .039, "#626168")
    for x in (-.365, .365):
        meadow.peb("Bail hinge button", (x, -.071, .489), (.070, .067, .066), "#A88A68")
    for x, y, radius in ((-.103, .065, .105), (.130, -.070, .069)):
        meadow.peb("Tar bubble", (x, y, .584), (radius, radius*.93, radius*.59), "#342E3C")
        meadow.peb("Tar glint", (x-.023, y-.013, .583+radius*.49),
                   (radius*.49, radius*.26, .016), "#B9A9B1")
    meadow.line("Pitch overflowing the lip", [(.072, .261, .588), (.080, .350, .639),
                                              (.088, .397, .554), (.101, .405, .393),
                                              (.111, .349, .235)],
                .058, "#241E28")


def _longbow():
    for side in (-1, 1):
        for front in (-1, 1):
            meadow.twig("Splayed oak stand leg",
                       (side*.254, front*.239, .031), (side*.149, front*.156, .471),
                       .092, .075, "#8F4D2D")
        meadow.twig("Side brace", (side*.237, -.200, .142), (side*.145, .171, .458),
                   .070, .057, "#CB8549")
    meadow.box("Stand deck", (0, -.058, .446), (.489, .475, .147), "#A9683D", .049)
    meadow.box("Forest-green bow rest", (0, -.059, .532), (.148, .559, .13), "#35776A", .029)
    bow = [(-.501, -.130, .577), (-.386, .053, .583), (-.222, .171, .593),
           (0, .219, .609), (.222, .171, .593), (.386, .053, .583), (.501, -.130, .577)]
    meadow.line("Dark bow backing", bow, .083, "#713B2C")
    meadow.line("Amber bow stave", [(x, y, z+.037) for x, y, z in bow], .065, "#FFB84C")
    for x, y, z in (bow[0], bow[-1]):
        meadow.peb("Ivory bow tip", (x, y, z), (.079, .068, .074), PALE)
        meadow.twig("Flax bowstring", (x, y, z+.018), (0, -.356, .645),
                   .033, .033, PALE)
    meadow.twig("Nocked arrow", (0, -.360, .657), (0, .457, .700), .042, .037, PALE)
    meadow.mesh("Pewter broadhead", [(-.108, .377, .688), (0, .558, .702),
                (.108, .377, .688), (0, .405, .763)],
                [(0, 1, 3), (1, 2, 3), (2, 0, 3), (2, 1, 0)], "#D3DEE0")
    for side in (-1, 1):
        meadow.peb("Red fletching", (side*.045, -.266, .666),
                   (.059, .101, .034), "#D85537", side*.39)


def _mortar():
    for x in (-.276, .276):
        meadow.box("Heavy oak sled runner", (x, -.078, .089),
                   (.218, .848, .178), "#9C623F", .046)
        for y in (-.425, .285):
            meadow.box("Pewter skid shoe", (x, y, .101), (.224, .162, .168), "#91A3AD", .036)
    meadow.box("Violet mortar cradle", (0, -.085, .179), (.587, .517, .205), "#66547E", .05)
    tube = _profile("Short mortar with wide open bore", [
        (0, .194, 0), (.072, .253, 1), (.154, .254, 0), (.415, .264, 0),
        (.462, .309, 1), (.527, .305, 1), (.551, .284, 1),
        (.551, .179, 2), (.526, .158, 2), (.260, .117, 2),
    ], ("#635173", "#B8AAC8", INK))
    tube.location = (0, -.175, .255)
    tube.rotation_euler.x = -.72


def _fire_pot():
    for x, y in ((-.331, -.258), (.331, -.258), (0, .342)):
        meadow.twig("Splayed iron brazier leg", (x, y, .014), (x*.60, y*.60, .343),
                   .076, .069, IRON)
    _profile("Dark iron brazier", [
        (.168, .122, 0), (.219, .220, 0), (.343, .363, 0),
        (.398, .385, 1), (.443, .382, 1), (.463, .347, 1),
        (.463, .268, 2), (.399, .228, 2),
    ], ("#303745", "#697781", COAL))
    for x, spread, height in ((-.142, -.220, .342), (.131, .215, .522)):
        meadow.ringbody("Tapering vermilion flame", (x, .015, .418),
                        [(0, .108, .103, 0, 0), (height*.21, .123, .110, spread*.13, .018),
                         (height*.47, .101, .085, spread*.35, .025),
                         (height*.72, .059, .052, spread*.63, .051),
                         (height, .009, .010, spread, .091)], EMBER, sides=18)
        meadow.ringbody("Amber tongue", (x, -.041, .424),
                        [(0, .061, .052, 0, 0), (height*.23, .070, .068, spread*.10, .005),
                         (height*.49, .035, .041, spread*.24, .008),
                         (height*.72, .008, .009, spread*.48, .034)], AMBER, sides=14)
    # A broad central gold flame overlaps the two separate orange tips.
    # The gap between the outer tips should never look like an empty bowl.
    meadow.ringbody("Golden central flame", (.010, -.045, .421),
                    [(0, .156, .128, 0, 0), (.11, .159, .131, -.017, -.012),
                     (.255, .124, .102, -.032, .010), (.386, .082, .068, 0, .022),
                     (.548, .043, .039, .078, .020), (.678, .006, .007, .052, .061)],
                    "#FFB32E", sides=18)
    meadow.peb("Glowing coals in the bowl", (.017, -.122, .438),
               (.120, .074, .031), "#D86B36")


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
    previous_parent, previous_material = meadow.parent, meadow.material
    meadow.material = mat
    try:
        builder = {
            "cannon": _cannon,
            "longbow": _longbow,
            "tar-pit": _tar_pit,
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
