"""Painted Meadow enemies. Each phase builds one miniature facing local +Y."""

from math import cos, sin, tau

import bpy
from mathutils import Matrix, Vector

import meadow
from goblin import build_goblin


# Left and right pairs are forward excursion and lift above the trail.
WALK = (
    ((.16, 0), (-.14, 0)),
    ((-.07, 0), (.10, .09)),
    ((-.14, 0), (.16, 0)),
    ((.10, .09), (-.07, 0)),
)
BOB = (-.015, .019, -.011, .022)
INK = "#261C27"
BONE = "#F5D995"
GOLD = "#EFA743"
LEATHER = "#603C36"
STEEL = "#9DB3B7"

pebble = meadow.peb
profile = meadow.ringbody
taper = meadow.twig
seam = meadow.line


def limb(name, start, end, width, depth, color):
    start, end = Vector(start), Vector(end)
    delta = end - start
    part = pebble(name, (start + end) / 2, (width, depth, delta.length / 2 + .035), color)
    part.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return part


def blade(name, outline, color, thickness=.024):
    """A beveled, thin solid outline with a normal along local +Z."""
    count = len(outline)
    vertices = [(x, y, z + layer * thickness / 2)
                for layer in (-1, 1) for x, y, z in outline]
    faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((j, i, i + count, j + count))
    if sum(outline[i][0] * outline[i - 1][1] - outline[i - 1][0] * outline[i][1]
           for i in range(count)) < 0:
        faces = [tuple(reversed(face)) for face in faces]
    return meadow.mesh(name, vertices, faces, color, bevel=thickness * .26)


def guard(role, striking):
    """Four frontier fighters. Weapons move with the striking hand."""
    axeman, swordsman, archer, captain = range(4)
    coat = ("#37638B", "#397FB6", "#226979", "#214A89")[role]
    trim = ("#C89861", "#F5E6BB", "#A4C7AE", "#F1C152")[role]
    skin = ("#B76E43", "#865337", "#E6A779", "#B77654")[role]
    girth = (.205, .159, .141, .168)[role]
    for side in (-1, 1):
        x, y = .084 * side, .052 * side
        limb("Braced leg", (x, 0, .27), (x, y, .08), .054, .047, "#394251")
        pebble("Boot", (x, y + .026, .055), (.065, .088, .050), LEATHER)
    pebble("Town blue wool", (0, 0, .327), (girth, .126, .181), coat)
    taper("Buff shoulder strap", (.091, .080, .456), (-.089, .114, .242), .031, .024, trim)
    pebble("Face", (0, .032, .514), (.111, .100, .109), skin)
    pebble("Nose", (0, .126, .513), (.037, .038, .035), skin)
    for side in (-1, 1):
        pebble("Eye", (side * .048, .117, .548), (.019, .016, .013), INK)

    if role == axeman:
        pebble("Copper beard", (0, .084, .472), (.123, .089, .083), "#AE542D")
        pebble("Cobalt knit cap", (0, -.014, .595), (.146, .134, .065), "#4387BD")
        pebble("Folded cap band", (0, .006, .566), (.147, .132, .033), "#244569")
    elif role == swordsman:
        pebble("Steel kettle brim", (0, -.005, .580), (.168, .150, .037), "#C4D6DE")
        pebble("Steel kettle helmet", (0, -.010, .612), (.118, .109, .079), "#8AAABF")
        pebble("Blue helmet ridge", (0, -.015, .673), (.026, .104, .032), coat)
        shield = ((-.14,.10),(.12,.11),(.14,-.035),(0,-.17),(-.12,-.065))
        for size, dz, dye in [(1, 0, trim), (.79, .022, "#337AC3")]:
            blade("Kite shield", [(-.177+x*size,.081+y*size,.412+y*.45+dz)
                                  for x,y in shield], dye, .034)
    elif role == archer:
        profile("Pointed spruce hood", (0,-.016,.488), (
            (0,.141,.123,0,0),(.090,.152,.126,0,-.018),
            (.164,.105,.093,.008,-.062),(.227,.021,.019,.014,-.165),
        ), "#297B70")
        pebble("Hood opening", (0, .093, .545), (.085, .050, .068), "#433D36")
        pebble("Hooded face", (0, .117, .538), (.065, .039, .053), skin)
        # The bow is slung across the back. The near hand uses a knife.
        bow = [(-.207,.092,.456),(-.221,-.117,.541),(-.135,-.263,.599),
               (.003,-.297,.625),(.125,-.245,.633)]
        seam("Bent yew bow", bow, .025, "#D4A369")
        seam("Bowstring", [bow[0], bow[-1]], .009, BONE)
    else:
        brim = ((0,.232),(.203,-.126),(.119,-.164),(-.175,-.138),(-.202,-.102))
        for z, dye in [(.588,trim),(.608,"#203249")]:
            blade("Cockaded triangular brim", [(x,y,z+abs(x)*.18) for x,y in brim], dye, .027)
        pebble("Hat crown", (0,-.012,.639), (.102,.105,.063), "#273B50")
        pebble("Gold cockade", (-.123,-.032,.657), (.040,.045,.027), trim)
        for side in (-1,1):
            pebble("Officer's shoulder knot", (side*.140,-.009,.439),(.061,.072,.034),trim)

    hand = Vector((girth+.014, .174 if striking else .038, .352))
    limb("Sleeve", (.112,-.008,.419), hand, .059, .055, coat)
    pebble("Hand", hand, (.054,.055,.053), skin)
    if role != swordsman:
        limb("Left sleeve", (-.121, -.005, .417), (-girth, .088, .347), .063, .059, coat)
        pebble("Left hand", (-girth, .095, .341), (.047,.055,.044), skin)
    reach = Vector((.068, .96 if striking else .59, .24 if striking else .80)).normalized()
    def weapon_point(width, length):
        return hand + Vector((width, 0, 0)) + reach * length
    if role == axeman:
        taper("Axe haft", weapon_point(0,-.11), weapon_point(0,.348), .031,.028, "#A77542")
        blade("Broad axe bit", [weapon_point(x,y) for x,y in
              ((-.055,.190),(.066,.203),(.174,.103),(.217,.223),(.190,.386),
               (.101,.343),(-.055,.334))], "#E9E4CD", .080)
    else:
        length = (.0,.457,.235,.418)[role]
        curve = .106 if role == captain else 0
        taper("Leather hilt", weapon_point(0,-.083), weapon_point(0,.084), .030,.033, LEATHER)
        taper("Crossguard", weapon_point(-.077,.082), weapon_point(.076,.082), .022,.022, trim)
        blade("Steel edge", [weapon_point(x,y) for x,y in (
            (-.033,.084),(.040,.084),(.043+curve*.40,length*.76),
            (curve,length),(-.026+curve*.28,length*.75))], "#DDE9ED", .030)
        if role == captain:
            seam("Sabre knuckle bow", [weapon_point(0,-.067),weapon_point(.085,-.05),
                 weapon_point(.082,.069),weapon_point(.050,.084)], .015, trim)


def wolf(phase):
    coal, fur, grey, ivory = "#243343", "#5189AD", "#99CAE1", "#FFEECE"
    bob = BOB[phase] / 2
    pebble("Dark saddle", (0, -.039, .360 + bob), (.173, .251, .124), coal)
    pebble("High slate shoulders", (0, .090, .404 + bob), (.180, .164, .145), fur)
    pebble("Pale chest", (0, .150, .339 + bob), (.124, .103, .115), ivory)
    pebble("Lean haunch", (0, -.190, .327 + bob), (.128, .126, .117), fur)
    for index, side in enumerate((-1, 1)):
        for front in (False, True):
            pair = index if front else 1 - index
            reach, lift = WALK[phase][pair]
            y = .139 if front else -.190
            x = side * (.132 if front else .113)
            knee = (x + side * .033, y + (.047 if front else -.068) + reach * .55, .187)
            ankle = (x + side * .038, y + reach * .90, .068 + lift)
            limb("Bent foreleg" if front else "Bent hindleg",
                 (x * .83, y, .346 + bob), knee, .053, .053, fur)
            limb("Pale lower leg", knee, ankle, .038, .037, grey)
            pebble("Dark paw", (ankle[0], ankle[1] + .030, .039 + lift), (.052, .064, .039), coal)

    # The broad scarlet band sits behind the ears, above the pale ruff.
    pebble("Scarlet hunt collar", (0, -.027, .466 + bob), (.178, .089, .113), "#B21F37")
    for side in (-1, 1):
        pebble("Brass collar stud", (side * .115, -.038, .553 + bob),
               (.041, .037, .027), GOLD)
    wag = (.023, .060, -.005, -.031)[phase]
    tail_base = (-.045, -.218, .365 + bob)
    tail_bend = (-.211 + wag, -.348, .391 + bob)
    tail_tip = (-.346 + wag, -.522, .310 + bob)
    limb("Swept bushy tail", tail_base, tail_bend, .078, .065, fur)
    limb("Broad dark tail brush", tail_bend, tail_tip, .089, .060, coal)
    taper("Tail brush point", tail_bend, (-.399 + wag, -.585, .303 + bob), .065, .012, grey)

    turn = (.24, .32, .27, .19)[phase]
    def head(x, y, z):
        return (x*cos(turn)+y*sin(turn), .147+y*cos(turn)-x*sin(turn), z+bob)

    pebble("Angular skull", head(0, .047, .486), (.164, .162, .125), fur)
    snout = pebble("Long light muzzle", head(0, .192, .475), (.118, .153, .081), ivory, -turn)
    snout.rotation_euler.x = -.08
    pebble("Darker lower jaw", head(0, .209, .432), (.082, .125, .034), grey, -turn)
    pebble("Broad dark nose", head(0, .322, .470), (.087, .054, .048), coal, -turn)
    for side in (-1, 1):
        for tuft in range(2):
            taper("Angular pale cheek guard", head(side*.094, .069+tuft*.028, .485-tuft*.048),
                  head(side*(.221-tuft*.011), -.050-tuft*.018, .405-tuft*.034),
                  .073, .013, ivory if tuft == 0 else grey, 7)
        taper("Splayed charcoal ear", head(side*.092, -.019, .526),
              head(side*.241, -.056, .723), .098, .008, coal, 7)
        taper("Pale inner ear", head(side*.115, .043, .536),
              head(side*.230, -.026, .698), .056, .010, ivory, 7)
        pebble("Amber eye", head(side*.091, .141, .537), (.036, .035, .028), GOLD)
        pebble("Eye center", head(side*.101, .159, .547), (.013, .014, .014), INK)


def harpy(phase):
    plum, russet, coral, cream = "#492343", "#A73263", "#F07191", "#FFF1B7"
    bob = (.010, .046, .012, .029)[phase]
    root_height = .60 + bob
    pebble("Wine-red feathered body", (0, -.035, root_height), (.181, .228, .144), plum)
    pebble("Pale throat and breast", (0, .084, root_height + .078), (.114, .157, .096), cream)
    for side in (-1, 1):
        lift = (0, .081, .018, .049)[phase] + side * .009
        ankle = (side * .078, -.047, .418 + lift)
        limb("Raked shin", (side * .069, -.022, root_height - .064),
             ankle, .026, .024, GOLD)
        for offset in (-.028, .028):
            taper("Hooked talon", ankle, (ankle[0] + offset, .056, ankle[2] - .036),
                  .021, .007, cream, 8)
        shoulder = (side * .093, .010, root_height + .064)
        flap = (.022, .234, -.121, .106)[phase]
        span = (.331, .277, .323, .310)[phase]
        wrist = (side * span, .030, root_height + .074 + flap * .58)
        limb("Broad wing shoulder", shoulder, wrist, .111, .084, russet)
        # Primaries form a stepped edge with much less sweep than the old swept V.
        for i in range(5):
            base = Vector(shoulder).lerp(Vector(wrist), .13 + i * .21)
            end = (base.x + side * (.028 + i * .020),
                   base.y - (.222 - i * .027),
                   base.z + flap * (.08 + i * .08) - .032)
            limb("Plum-edged flight feather", base, end, .062, .030, plum)
            limb("Painted flight feather", base + Vector((0, 0, .025)),
                 Vector(end).lerp(base, .21) + Vector((0, 0, .024)),
                 .047, .020, russet if i % 2 else coral)
    z = root_height
    limb("Crimson court sash", (-.138, -.125, z+.102), (.130, .096, z+.101),
         .052, .050, "#BD2136")
    # Carry the sealed writ crosswise, projecting beyond the breast.
    a, b = Vector((-.202, .095, .425+bob)), Vector((.209, .148, .415+bob))
    taper("Rolled parchment", a, b, .052, .052, "#FFF2C6")
    taper("Vermilion writ seal", a.lerp(b,.57), a.lerp(b,.73), .056, .056, "#A52430")
    for x in (-.056, 0, .056):
        limb("Split plum tail", (x * .4, -.131, root_height),
             (x, -.311 - (.028 if x == 0 else 0), root_height - .035), .037, .025, plum)
    pebble("Harpy head", (0, .107, root_height + .178), (.126, .123, .106), coral)
    circlet = [(.113*cos(i*tau/12), .107+.105*sin(i*tau/12), root_height+.245)
               for i in range(12)]
    seam("Open gold circlet", circlet, .018, GOLD, cyclic=True)
    pebble("Circlet jewel", (0,.203,root_height+.250), (.028,.026,.025), "#CB243E")
    pebble("Gold hooked beak", (0, .207, root_height + .168), (.071, .111, .057), GOLD)
    for side in (-1, 1):
        taper("Crest feather", (side * .039, .047, root_height + .208),
              (side * .097, -.044, root_height + .328), .047, .004, plum)
        pebble("Bright eye mask", (side * .052, .181, root_height + .229), (.040, .035, .028), cream)
        pebble("Black eye", (side * .052, .204, root_height + .233), (.018, .019, .016), INK)


def shieldbearer(phase):
    red, mail, skin = "#B62538", "#41597B", "#E1A456"
    bob = BOB[phase] * .62
    pebble("Scarlet surcoat", (0, -.017, .325 + bob), (.178, .126, .169), red)
    limb("White shoulder belt", (.142,.030,.436+bob), (-.108,.098,.287+bob), .035,.027,"#FFF3DD")
    pebble("Wide belt", (0, .021, .271 + bob), (.179, .115, .038), LEATHER)
    pebble("Brass buckle", (0, .130, .280 + bob), (.047, .020, .041), GOLD)
    for side, (reach, lift) in zip((-1, 1), WALK[phase]):
        x = side * .094
        limb("Mail gaiter", (x, -.031, .272 + bob), (x, reach, .084 + lift), .057, .055, mail)
        pebble("Work boot", (x, reach + .028, .045 + lift), (.075, .103, .045), LEATHER)
        arm = (side * .200, .064 - reach / 2, .332 + bob)
        limb("Red wool sleeve", (side * .124, -.020, .421 + bob), arm, .064, .058, red)
        pebble("Gauntlet", arm, (.058, .053, .058), STEEL)
    pebble("Helmet dome", (0, -.008, .567 + bob), (.170, .144, .150), STEEL)
    pebble("Copper face slot", (0, .101, .536 + bob), (.100, .060, .058), skin)
    pebble("Scarlet helmet stripe", (0, -.018, .667 + bob), (.059, .122, .048), red)
    pebble("Nasal guard", (0, .156, .570 + bob), (.026, .030, .061), STEEL)
    # The block is carried high and almost flat so the enamel reads from every bearing.
    cx, cy = -.229, .157 - WALK[phase][0][0] * .28
    outline = ((-.205, .015), (0, -.282), (.205, .015),
               (.190, .134), (0, .193), (-.190, .134))

    def plate(points, scale, height):
        return [(cx + x * scale, cy + y * scale, .499 + y * .30 + bob + height)
                for x, y in points]

    blade("Beveled gunmetal kite rim", plate(outline, 1, 0), "#252A45", .060)
    blade("Bright silver kite rim", plate(outline, .94, .034), "#F0E5C6", .031)
    blade("Oxblood shield face", plate(outline, .79, .055), "#751D36", .025)
    crown = ((-.117,-.064),(.117,-.064),(.145,.092),(.060,.033),
             (0,.131),(-.060,.033),(-.145,.092))
    blade("Gold crown badge", plate([(x, -y) for x, y in crown], 1, .079), "#FFD769", .019)


def troll(phase, rank=0):
    skin, stone, shadow, cloth = (
        ("#A5353C", "#DC756A", "#54232C", "#5B3A38"),
        ("#DB693B", "#FFC869", "#702F3B", "#68304A"),
        ("#817493", "#BAB1CB", "#594468", "#AE3E56"),
    )[rank]
    bob = BOB[phase]
    roll = (-.032, -.019, .030, .022)[phase]
    pebble("Rounded working back", (roll, -.068, .500 + bob), (.252, .203, .210), skin)
    pebble("Wide shoulder ridge", (roll, -.029, .601 + bob), (.300, .162, .134), skin)
    if rank == 0:
        pebble("Dark stone backplate", (roll, -.144, .654 + bob), (.202, .139, .083), shadow)
        pebble("Pale slate backplate", (roll + .024, -.140, .720 + bob),
               (.115, .086, .025), "#C7B4A5")
    elif rank == 1:
        pebble("Short oxblood frock coat", (roll, -.125, .603 + bob),
               (.270, .195, .169), "#AC3440")
        for side in (-1, 1):
            limb("Buff turned lapel", (roll + side*.185, .014, .693+bob),
                 (roll + side*.092, .100, .476+bob), .043, .032, BONE)
    else:
        # Sweep the cape behind the feet. Its scalloped ermine hem shows in all four headings.
        outline = ((-.16, .015, .695), (.16, .015, .695), (.29, -.22, .50),
                   (.26, -.38, .36), (.08, -.41, .34), (-.12, -.39, .35),
                   (-.28, -.36, .37), (-.29, -.21, .50))
        blade("King's velvet train", [(roll+x,y,z+bob) for x,y,z in outline], "#B3293C", .046)
        for x in range(-2, 3):
            dx = x * .104
            pebble("Ermine cape hem", (roll+dx, -.391+abs(dx)*.18, .353+bob+abs(dx)*.10),
                   (.069,.048,.036), "#F6DFBA")
        for side in (-1,1):
            limb("Cape fold", (roll+side*.12,-.036,.682+bob),
                 (roll+side*.18,-.363,.397+bob), .049,.028, "#D9404C")
    pebble("Painted knee-length hide apron", (0, -.003, .335 + bob), (.215, .157, .101), cloth)
    pebble("Broad leather belt", (0, .011, .406 + bob), (.226, .163, .046), LEATHER)
    pebble("Belt buckle", (0, .166, .403 + bob), (.054, .022, .042), GOLD if rank else BONE)
    for side, (reach, lift) in zip((-1, 1), WALK[phase]):
        if rank == 0:
            pebble("Coin purse", (side*.192,.106,.387+bob), (.078,.064,.077), "#B67938")
            pebble("Purse clasp", (side*.192,.112,.449+bob), (.042,.040,.024), GOLD)
        x = side * .146
        knee = (x, .042 + reach * .48, .189 + lift * .4)
        foot = (x, .044 + reach, .054 + lift)
        limb("Stocky thigh", (x, -.020, .324 + bob), knee, .089, .085, shadow)
        limb("Bent shin", knee, foot, .072, .068, skin)
        pebble("Broad bare foot", foot, (.110, .120, .054), skin)
        for i in (-1, 0, 1):
            pebble("Stone toenail", (x + i * .047, foot[1] + .085, foot[2] + .025),
                   (.029, .028, .023), stone)

        shoulder = (side * .224 + roll, -.060, .597 + bob)
        elbow = (side * .306 + roll, -reach * .53 - .024, .417 + bob)
        fist = (side * .333 + roll, -reach + .075, .316 + bob + abs(reach) * .20)
        limb("Heavy upper arm", shoulder, elbow, .102, .090, skin)
        limb("Heavy forearm", elbow, fist, .088, .079, skin)
        pebble("Knuckle", fist, (.103, .088, .092), stone)
        if side == 1 and rank != 2:
            start = Vector(fist) + Vector((.020, -.077, -.084))
            mid = Vector(fist) + Vector((.044, .105, .147))
            end = Vector(fist) + Vector((.055, .236, .263))
            if rank == 1:
                # Large bound account book with exposed page block and a gilt clasp.
                x, y, z = fist
                for title, dz, dims, color in (
                    ("Lower ledger cover", .065, (.25,.34,.032), "#493139"),
                    ("Ivory page block", .095, (.232,.319,.052), "#FFD79A"),
                    ("Upper ledger cover", .132, (.25,.34,.032), "#54333D"),
                    ("Ledger clasp", .155, (.25,.047,.016), GOLD),
                ):
                    meadow.box(title, (x, y+.028, z+dz), dims, color, .010)
                meadow.box("Ledger lettering panel", (x,y+.117,z+.157),
                           (.141,.072,.014), "#F1D19A", .005)
                meadow.box("Ledger spine", (x-.109,y+.028,z+.133),
                           (.033,.343,.048), "#7C4940", .008)
            else:
                tip = end + Vector((.045,.104,.052))
                for i in range(5):
                    taper("Painted toll bar", start.lerp(tip,i/5), start.lerp(tip,(i+1)/5),
                          .057,.057, "#F7DFC0" if i % 2 else "#A32A3B", 8)
        elif rank == 2:
            if side == 1:
                grip = Vector(fist)
                tip = grip + Vector((.018, .273, .348))
                taper("Regal sceptre haft", grip-Vector((0,.073,.090)), tip, .029,.035, "#824734")
                pebble("Sceptre gold orb", tip, (.075,.075,.075), GOLD)
                taper("Sceptre ruby finial", tip, tip+Vector((0,.028,.104)), .051,.009, "#CA374B")
            limb("Bronze gauntlet cuff", elbow,
                 Vector(elbow).lerp(Vector(fist), .46), .105, .094, "#AF723D")
        if rank:
            pebble("Shoulder pauldron", (shoulder[0], -.048, .635 + bob),
                   (.139, .138, .090), "#D49252" if rank == 2 else "#843243")
            pebble("Pauldron rivet", (shoulder[0], .013, .699 + bob),
                   (.039, .035, .022), GOLD)

    face_y = .103 + (0, .028, .005, -.019)[phase]
    pebble("Forward-lumped skull", (roll, face_y, .696 + bob), (.188, .169, .137), skin)
    pebble("Broad lower jaw", (roll, face_y + .079, .636 + bob), (.160, .111, .073), stone)
    pebble("Mouth crease", (roll, face_y + .161, .662 + bob), (.105, .027, .025), INK)
    pebble("Hammer nose", (roll, face_y + .135, .726 + bob), (.064, .070, .048), stone)
    for side in (-1, 1):
        pebble("Troll ear", (roll + side * .158, face_y - .013, .706 + bob),
               (.061, .069, .047), shadow)
        pebble("Heavy raised brow", (roll + side * .082, face_y + .083, .779 + bob),
               (.066, .063, .030), shadow).rotation_euler.y = side * .28
        pebble("Amber eyes", (roll + side * .082, face_y + .126, .749 + bob),
               (.038, .033, .028), BONE)
        taper("Curved ivory tusk", (roll + side * .100, face_y + .156, .630 + bob),
              (roll + side * .115, face_y + .170, .709 + bob), .031, .007, BONE)
    if rank == 1:
        # Broad centre part and paired banks of rolled, powdered hair.
        for side in (-1, 1):
            pebble("Parted powdered wig", (roll+side*.074, face_y-.047, .826+bob),
                   (.091,.140,.066), "#F5E6CF")
            for i in range(3):
                pebble("Rolled wig curl", (roll+side*(.147+.009*i), face_y+.044-i*.071,
                       .780+bob-.012*i), (.061,.054,.063), "#FFF0DA" if i%2 == 0 else "#CEC1AF")
    if rank == 2:
        # Broad crown band with raised points readable from the copy stand.
        profile("Grumblemaw's gold crown band", (roll, face_y - .024, .794 + bob), (
            (0, .135, .110, 0, 0), (.027, .148, .122, 0, 0),
            (.082, .169, .138, 0, -.005), (.097, .163, .134, 0, -.005),
        ), GOLD, sides=24)
        for i in range(5):
            angle = tau * i / 5 + tau / 4
            x, y = cos(angle), sin(angle)
            taper("Gold crown point", (roll + x * .132, face_y - .024 + y * .111, .861 + bob),
                  (roll + x * .172, face_y - .024 + y * .151, .990 + bob),
                  .047, .017, GOLD)
        pebble("Crown ruby", (roll, face_y + .102, .879 + bob),
               (.047, .040, .039), "#CF3850")


KINDS = ("goblin", "wolf", "troll", "harpy", "shieldbearer", "grumblefoot", "grumblemaw")


def build(kind, mat, phase=0):
    """Return a ground-pivoted root. Harpy height is baked into its mesh pose."""
    if kind != "guard":
        phase %= 4
    if kind == "goblin":
        palette = {
            "Goblin lime": "#9FCF36",
            "Goblin nose": "#C9E34A",
            "Goblin inner ear": "#DB8B53",
            "Goblin brows": "#273B19",
            "Goblin aubergine": "#391F44",
            "Goblin red scarf": "#DE4050",
        }

        def paint(name, color):
            return mat(name, palette.get(name, color))

        root = build_goblin(paint, phase)
        head_parts = ("Sculpted goblin head", "Pointed ear", "Deep eye socket",
                      "Ivory eye", "Dark pupil", "Mischievous heavy brow",
                      "High cheek", "Smirk", "Small ivory snaggletooth",
                      "Nose bridge", "Broad hooked nose")
        pivot = Vector((0, .027, .530))
        enlarge_head = (Matrix.Translation(pivot)
                        @ Matrix.Diagonal((1.12, 1.24, 1.14, 1))
                        @ Matrix.Translation(-pivot))
        for part in root.children:
            if part.name.startswith("Chamfered round base"):
                bpy.data.objects.remove(part, do_unlink=True)
            else:
                if part.name.startswith(head_parts):
                    part.matrix_basis = enlarge_head @ part.matrix_basis
                part.location.z -= .053
        previous = meadow.parent, meadow.material
        meadow.parent, meadow.material = root, mat
        try:
            z = .697 + BOB[phase]
            # Turned-up corners expose the face from the overhead camera.
            brim = [(-.179,-.082,z+.041),(-.047,-.127,z+.015),(.169,-.092,z+.044),
                    (.112,.039,z+.014),(.015,.142,z+.052),(-.110,.054,z+.010)]
            blade("Ochre bound brim", brim, "#D39945", .036)
            blade("Three-corner felt brim", [(x*.91,y*.91,h+.016) for x,y,h in brim],
                  "#42303E", .024)
            pebble("Collector hat crown", (0,-.016,z+.039), (.095,.083,.064), "#59404B")
            pebble("Leather coin satchel", (.157,-.043,.300), (.088,.093,.101), "#A6662D")
            pebble("Gold satchel flap", (.167,-.049,.375), (.086,.084,.032), GOLD)
        finally:
            meadow.parent, meadow.material = previous
        return root

    if kind not in KINDS and kind != "guard":
        raise ValueError(f"Unknown Meadow enemy: {kind}")

    root = meadow.group(f"{kind} · cycle {phase}")
    previous = meadow.parent, meadow.material
    meadow.parent, meadow.material = root, mat
    try:
        if kind == "guard":
            guard(phase // 2, phase % 2 == 1)
        elif kind == "wolf":
            wolf(phase)
        elif kind == "harpy":
            harpy(phase)
        elif kind == "shieldbearer":
            shieldbearer(phase)
        else:
            rank, scale = {"troll": (0, 1.0), "grumblefoot": (1, 1.32),
                           "grumblemaw": (2, 1.68)}[kind]
            troll(phase, rank)
            root.scale = (scale,) * 3
    finally:
        meadow.parent, meadow.material = previous
    return root
