"""Original painted props for the Old Keep, drawn in a double-density atlas."""
from pathlib import Path
import math
import random
from PIL import Image, ImageColor, ImageDraw

OUT = Path(__file__).resolve().parents[2] / 'public/assets/act3/siege-actors.webp'
DENSITY = 2
PAINT = 3
ATLAS = Image.new('RGBA', (1024, 680))

INK = '#24242b'
WOOD = '#764b33'
GOLD = '#dca759'
CREAM = '#fff1c9'
DARK = '#2f2b38'


class Brush:
    def __init__(self, width, height):
        self.image = Image.new('RGBA', (width * PAINT, height * PAINT))
        self.draw = ImageDraw.Draw(self.image)
        self.size = (width * DENSITY, height * DENSITY)

    def coords(self, points):
        return [tuple(round(x * PAINT) for x in p) for p in points]

    def box(self, box):
        return [round(x * PAINT) for x in box]

    def fill(self, points, color, outline=None, width=1):
        self.draw.polygon(self.coords(points), fill=color, outline=outline, width=max(1, round(width * PAINT)))

    def path(self, points, color, width=1):
        self.draw.line(self.coords(points), fill=color, width=max(1, round(width * PAINT)), joint='curve')

    def oval(self, box, color, outline=None, width=1):
        self.draw.ellipse(self.box(box), fill=color, outline=outline, width=max(1, round(width * PAINT)))

    def rect(self, box, color, outline=None, width=1):
        self.draw.rectangle(self.box(box), fill=color, outline=outline, width=max(1, round(width * PAINT)))

    def arc(self, box, a, b, color, width=1):
        self.draw.arc(self.box(box), a, b, color, width=max(1, round(width * PAINT)))

    def paste(self, x, y):
        ATLAS.paste(self.image.resize(self.size, Image.Resampling.LANCZOS), (x, y))


def feather(b, at, scale, color=CREAM, rotate=0):
    x, y = at
    cos, sin = math.cos(rotate), math.sin(rotate)

    def turn(points):
        return [(x + (px * cos - py * sin) * scale, y + (px * sin + py * cos) * scale) for px, py in points]

    b.fill(turn([(0, 0), (0.4, -4), (-1.8, -6), (-1.1, -11), (2, -16),
                 (5, -17.5), (5.8, -15), (5.8, -11), (3.8, -8), (4.5, -7), (2.1, -3)]),
           color, '#7c7069', .6)
    b.path(turn([(-.8, 2), (1.4, -5), (3.7, -13)]), '#ae9a82', .65)
    for n in [6, 9, 12]:
        b.path(turn([(n / 4 - .4, -n), (n / 4 + 2.3, -n - 1)]), '#c6b39b', .45)


def arch(b, x, y, w, h, color, edge=None, line=1):
    ring = [(x, y + h), (x, y + w * .6)]
    ring += [(x + w / 2 + w / 2 * math.cos(math.pi + a * math.pi / 16),
              y + w * .6 + w * .6 * math.sin(math.pi + a * math.pi / 16)) for a in range(1, 16)]
    ring += [(x + w, y + w * .6), (x + w, y + h)]
    b.fill(ring, color, edge, line)


def pot(b, x, y, tipped=False):
    if tipped:
        b.fill([(x - 8, y - 4), (x - 1, y - 8), (x + 6, y - 9),
                (x + 11, y - 3), (x + 11, y + 5), (x + 5, y + 10), (x - 3, y + 7)], '#a45531', INK, 2)
        b.oval((x + 3, y - 1, x + 15, y + 10), '#221923', '#dfa166', 1.5)
        b.path([(x + 9, y + 6), (x + 14, y + 10), (x + 14, y + 16)], '#26202b', 4.5)
        b.path([(x + 10, y + 7), (x + 15, y + 11), (x + 15, y + 14)], '#63565a', .8)
        b.path([(x - 4, y + 1), (x, y - 4), (x + 3, y - 6)], '#e89d61', 1.7)
    else:
        b.arc((x - 10, y - 11, x + 10, y + 4), 190, 350, '#f6c886', 2)
        b.fill([(x - 8, y - 2), (x + 8, y - 2), (x + 6, y + 7), (x + 2, y + 10), (x - 4, y + 9), (x - 7, y + 6)], '#aa5733', INK)
        b.oval((x - 9, y - 4, x + 9, y + 1), '#27202a', '#dfa166', 1.25)


def person(b, head_x, smile=True):
    # A blue nightshirt, a crooked stocking cap, and two sleeves leaning out.
    b.fill([(30, 67), (31, 55), (37, 50), (53, 49), (61, 55), (68, 65), (59, 68), (39, 68)],
           '#46697c', INK, 1)
    b.fill([(36, 55), (42, 52), (46, 60), (51, 52), (56, 54), (51, 64), (43, 64)], '#b0b4a0')
    x, y = head_x, 41
    b.oval((x - 8, y - 9, x + 10, y + 11), '#edb580', '#613b36', 1)
    b.fill([(x - 10, y - 5), (x - 7, y - 14), (x + 1, y - 18), (x + 10, y - 16),
            (x + 17, y - 8), (x + 10, y - 10), (x + 10, y - 5)], '#376182', INK)
    b.path([(x - 7, y - 12), (x + 1, y - 15), (x + 9, y - 14)], '#86adba', 2)
    b.path([(x - 10, y - 5), (x + 9, y - 5)], '#d8e4d9', 2)
    b.oval((x + 13, y - 9, x + 18, y - 4), '#f5e7ba', '#615a50', .6)
    b.oval((x - 6, y - 1, x - 3, y + 2), '#382c37')
    b.oval((x + 3, y - 1, x + 6, y + 2), '#382c37')
    b.oval((x - 1, y + 1, x + 4, y + 5), '#d59868')
    b.path([(x - 2, y + 7), (x + 1, y + (8 if smile else 6)), (x + 6, y + 5)], '#783f39', 1.3)


def draw_window(pose):
    b = Brush(96, 84)
    # Stone casing, kept darker than the bedroom light.
    b.oval((9, 69, 88, 82), (27, 28, 37, 125))
    arch(b, 19, 5, 58, 68, '#8c9097', '#282936', 2.5)
    arch(b, 23, 9, 50, 60, '#c8bba1', '#48424b', 1)
    for a in range(7):
        theta = math.pi + a * math.pi / 6
        b.path([(48 + math.cos(theta) * 28, 40 + math.sin(theta) * 33),
                (48 + math.cos(theta) * 24, 39 + math.sin(theta) * 28)], '#696a73', 1.1)
    for y in [44, 54, 64]:
        b.path([(19, y), (26, y)], '#555863')
        b.path([(70, y + 1), (76, y + 1)], '#555863')
    arch(b, 27, 13, 42, 56, '#2e2832', '#6c4b3f', 1.5)
    if pose == 'spent':
        for left in [29, 48]:
            b.fill([(left, 26), (left + 8, 18), (left + 18, 17 if left == 29 else 27),
                    (left + 18, 68), (left, 69)], '#314755', '#272c32', 1)
            for n in [3, 8, 14]:
                b.path([(left + n, 28), (left + n, 67)], '#445660', .6)
            b.path([(left + 2, 39), (left + 17, 39)], '#75695e', 2.4)
            b.path([(left + 2, 58), (left + 17, 58)], '#75695e', 2.4)
        b.oval((43, 49, 47, 53), '#9b7653', INK, .6)
        b.oval((50, 49, 54, 53), '#9b7653', INK, .6)
    else:
        arch(b, 29, 15, 38, 54, '#dc813e')
        arch(b, 31, 17, 34, 53, '#ffbd63')
        arch(b, 35, 20, 26, 47, '#ffe3a1')
        b.path([(48, 15), (48, 56)], '#b17147', 2)
        b.path([(29, 38), (67, 38)], '#b17147', 2)
        for side in [-1, 1]:
            shutter = 48 + side * 20
            b.fill([(shutter, 23), (shutter + side * 13, 21), (shutter + side * 14, 67), (shutter, 70)],
                   '#385769', INK, 1.5)
            for i in [4, 8, 12]:
                b.path([(shutter + side * i, 29), (shutter + side * i, 65)], '#698189', .6)
            for y in [36, 59]:
                b.path([(shutter + side * 2, y), (shutter + side * 13, y - 1)], '#8e775a', 2)
        head = 44 if pose in ('emptyLeft', 'tip') else 53 if pose == 'emptyRight' else 47
        person(b, head, pose not in ('emptyLeft', 'emptyRight'))
        if pose == 'tip':
            b.path([(52, 58), (62, 54), (69, 53)], '#5c8594', 9)
            b.oval((65, 49, 73, 56), '#e5a675', INK, .9)
            pot(b, 73, 58, True)
        elif pose == 'shake':
            b.fill([(51, 55), (54, 48), (64, 47), (69, 43), (79, 46), (88, 45), (86, 53), (90, 61),
                    (85, 65), (72, 65), (60, 69), (52, 64)], '#fff0d6', '#574657', 1.35)
            b.path([(56, 61), (65, 62), (79, 58), (85, 60)], '#cfb39f', 1.6)
            b.path([(56, 55), (65, 51), (76, 50), (84, 49)], '#fff8e7', 1.8)
            b.oval((50, 55, 58, 63), '#e6a575', INK, .7)
            feather(b, (91, 56), .7, rotate=.67)
            feather(b, (81, 71), .55, rotate=-.65)
        else:
            b.oval((31, 60, 40, 67), '#e5a675', INK, .8)
            pot(b, 65, 57)
    b.fill([(19, 68), (77, 68), (81, 72), (76, 78), (21, 78), (14, 73)], '#646372', '#332f3b', 1.3)
    b.path([(19, 69), (75, 69), (78, 71)], '#d5ba96' if pose != 'spent' else '#a79f90', 2)
    b.path([(22, 74), (47, 74), (72, 73)], '#989293', .9)
    return b


def glow():
    b = Brush(88, 80)
    for y in range(80 * PAINT):
        for x in range(88 * PAINT):
            r = math.hypot((x / PAINT - 44) / 43, (y / PAINT - 40) / 39)
            alpha = int(158 * max(0, 1 - r) ** 1.7)
            if alpha:
                b.image.putpixel((x, y), (255, 159, 68, alpha))
    return b


def kettle(b, x, y):
    b.arc((x-4, y-13, x+12, y+2), 179, 355, '#938775', 1.5)
    b.oval((x-5, y-7, x+11, y+6), '#363d42', '#171e26', 1.2)
    b.path([(x+9, y), (x+13, y-2), (x+15, y-7)], '#626068', 2.8)
    b.path([(x-2, y-4), (x+2, y-5), (x+4, y-5)], '#9b937e', 1.4)
    b.path([(x, y-8), (x+5, y-8)], '#dda77b', .9)


def boot(b, x, y):
    b.fill([(x, y-10), (x+5, y-10), (x+5, y-3), (x+10, y-1), (x+9, y+3), (x-1, y+3)],
           '#444058', '#22212b', .9)
    b.path([(x, y-9), (x+5, y-9)], '#a28b77', 1.4)


def soldier(b, x, y, reclining=False, stride=0):
    # Scarlet coats, cream facings and navy tricorn match the army colors.
    if reclining:
        legs = [(6, 19, 21, 19, 35, 26), (5, 26, 22, 24, 35, 27)]
        body = [(-12, 4), (-4, 3), (10, 10), (14, 19), (5, 28), (-6, 21), (-17, 12)]
    else:
        legs = [(1, 33, -5-stride, 43, -8-stride, 49), (7, 33, 11+stride, 42, 13+stride, 48)]
        body = [(-8, 5), (6, 5), (12, 13), (14, 29), (8, 36), (-10, 35), (-12, 16)]
    for x0, y0, x1, y1, x2, y2 in legs:
        b.path([(x+x0, y+y0), (x+x1, y+y1), (x+x2, y+y2)], '#262330', 8)
        b.path([(x+x0, y+y0-1), (x+x1, y+y1-1), (x+x2, y+y2-1)], '#696b7a', 5.2)
        b.oval((x+x2-1, y+y2-3, x+x2+8, y+y2+3), '#dcd2a6' if reclining else '#302a35', '#34313c', .9)
    b.fill([(x+px, y+py) for px, py in body], '#a73e36', DARK, 1.25)
    b.path([(x-7, y+8), (x-2, y+15), (x+8, y+24)], '#f1dcad', 3.5)
    b.path([(x-12, y+8), (x-13, y+15), (x-4, y+19)], '#ee6850', 4.2)
    b.path([(x+5, y+9), (x+12, y+19), (x+13, y+21)], '#d55a46', 5.8)
    b.oval((x+10, y+18, x+16, y+23), '#edb080', INK, .6)
    for i in range(3):
        b.oval((x+1+i*2, y+10+i*3, x+3+i*2, y+12+i*3), '#f7ca70')
    b.oval((x-10, y-12, x+9, y+8), '#e5aa79', INK)
    b.oval((x+4, y-3, x+11, y+2), '#ecb588', '#ae6951', .7)
    b.path([(x-1, y-3), (x+4, y-4)], '#563e42', 1.1)
    b.path([(x+2, y+3), (x+6, y+3)], '#57363e', 1)
    b.fill([(x-15, y-8), (x-11, y-10), (x-9, y-17), (x, y-13), (x+8, y-17), (x+13, y-7),
            (x+7, y-5), (x-6, y-5)], '#303747', '#ba9766', 1.1)


def draw_camp():
    b = Brush(122, 76)
    b.oval((7, 59, 117, 74), (28, 27, 34, 139))
    b.fill([(11, 49), (29, 42), (104, 44), (108, 62), (91, 66), (12, 60)], '#55413c', INK, 1.3)
    b.path([(13, 57), (33, 72)], '#b58b61', 2.5)
    b.path([(31, 57), (13, 68)], '#947353', 2.5)
    b.path([(86, 60), (106, 72)], '#b58b61', 2.5)
    b.path([(105, 59), (85, 69)], '#947353', 2.5)
    b.fill([(13, 46), (31, 42), (102, 43), (106, 59), (13, 56)], '#c6ad80', '#51453d', 1)
    b.fill([(53, 42), (88, 44), (97, 59), (97, 64), (79, 64), (64, 59)], '#556d71', '#3e555d', 1)
    b.path([(61, 44), (70, 58), (85, 61), (95, 61)], '#86a19f', 2.1)
    b.oval((19, 42, 41, 53), '#f4deb0', '#7b6353', 1)
    soldier(b, 39, 28, True)
    b.path([(14, 56), (104, 60)], '#e0b984', 1.7)
    boot(b, 41, 66)
    boot(b, 54, 65)
    kettle(b, 101, 64)
    return b


def draw_packed(stride):
    b = Brush(66, 76)
    b.oval((7, 63, 56, 73), (27, 25, 36, 133))
    b.fill([(7, 24), (17, 20), (27, 27), (26, 43), (10, 48), (3, 41)], '#57473d', '#241f29', 1.4)
    b.fill([(3, 24), (9, 20), (21, 20), (27, 26), (24, 30), (6, 29)], '#5c8491', INK)
    b.path([(7, 25), (22, 26)], '#a2b6a7', 1.5)
    b.path([(10, 27), (13, 45)], '#e3c08d', 1.5)
    soldier(b, 32, 18, stride=stride)
    kettle(b, 49, 41)
    return b


def draw_survey():
    b = Brush(100, 64)
    b.oval((6, 41, 94, 59), (26, 26, 34, 111))
    pegs = [(10, 44, 2), (19, 28, -1), (81, 26, 2), (93, 44, -2), (80, 61, -1), (25, 60, 2)]
    for i, (x, y, slant) in enumerate(pegs):
        xx, yy, ss = pegs[(i+1) % len(pegs)]
        b.path([(x+slant, y-12), ((x+xx)/2, (y+yy)/2-6), (xx+ss, yy-12)], '#372e32', 3.8)
        b.path([(x+slant, y-13), ((x+xx)/2, (y+yy)/2-7), (xx+ss, yy-13)], '#c6a073', 2.1)
    for x, y, slant in pegs:
        b.fill([(x-2, y), (x+1, y+1), (x+slant+3, y-19), (x+slant, y-23), (x+slant-2, y-20)],
               '#a47b54', INK, .65)
        b.path([(x-2+slant, y-19), (x-1, y-2)], '#e2b887', .8)
        b.path([(x-3+slant, y-13), (x+3+slant, y-12)], '#dbb982', 1.7)
    b.path([(28, 44), (31, 16), (69, 16), (72, 44)], '#624c40', 4.8)
    b.fill([(2, 9), (98, 9), (99, 28), (94, 31), (1, 31)], '#ca9b68', '#5b423b', 1.6)
    b.path([(5, 12), (95, 11)], '#f4d4a4', 1.7)
    b.path([(4, 29), (95, 30)], '#9e6b4f', 1.6)
    b.oval((43, 27, 57, 41), '#973f36', '#572d36', 1.2)
    b.oval((45, 29, 55, 39), '#b85b47', '#e3916b', .6)
    b.fill([(47, 36), (46, 32), (49, 34), (50, 31), (52, 34), (54, 32), (53, 36)], '#e6a372')
    return b


def draw_dawn():
    b = Brush(384, 92)
    r = random.Random(52)
    # Two colored washes cross on the horizon, with inked crags and an old keep.
    top = ImageColor.getrgb('#405c73')
    horizon = ImageColor.getrgb('#f8ca8d')
    for y in range(60):
        t = min(1, (y/51)**.83)
        b.rect((0, y, 384, y+1), tuple(int(a + (z-a)*t) for a, z in zip(top, horizon)))
    for x,y,w in [(150, 18, 65), (299, 10, 67), (273, 30, 43), (347, 29, 45), (68, 13, 39)]:
        b.fill([(x, y+3), (x+w*.2, y+1), (x+w*.45, y+1), (x+w*.56, y-1),
                (x+w*.83, y), (x+w, y+2), (x+w*.48, y+4)], '#caa9a1')
    b.oval((299, 20, 331, 53), '#ffe4aa')
    b.fill([(0, 44), (32, 33), (51, 36), (78, 30), (99, 39), (127, 39), (144, 43), (168, 34),
            (192, 41), (220, 38), (260, 46), (285, 44), (306, 51), (336, 43), (359, 46), (384, 43),
            (384, 72), (0, 66)], '#8f7e80')
    b.fill([(0, 48), (16, 45), (26, 41), (55, 43), (82, 47), (100, 43), (121, 47), (148, 49),
            (181, 53), (195, 50), (235, 55), (269, 51), (300, 54), (330, 54), (352, 49), (384, 49),
            (384, 74), (0, 72)], '#5e666c')
    b.fill([(8, 49), (18, 42), (33, 42), (50, 43), (61, 48), (73, 53), (45, 59), (0, 61)], '#434f60')
    for x,y,w in [(24, 34, 7), (38, 29, 9), (53, 37, 7), (15, 41, 8), (63, 43, 7)]:
        b.rect((x, y, x+w, y+12), '#3a485d')
        b.fill([(x-1, y+1), (x+w/2, y-w), (x+w+1, y+1)], '#364256')
        b.path([(x+1, y+3), (x+1, y+10)], '#7a7775', .8)
        b.rect((x+w/2, y+5, x+w/2+1.5, y+8), '#e8b675')
    b.fill([(0, 69), (32, 63), (71, 67), (101, 60), (139, 62), (199, 65), (229, 61), (278, 61),
            (301, 57), (348, 57), (384, 52), (384, 92), (0, 92)], '#535850')
    b.fill([(0, 92), (0, 78), (73, 76), (151, 74), (229, 65), (304, 63), (356, 56), (384, 55),
            (384, 57), (354, 59), (306, 67), (220, 73), (149, 83), (80, 89), (72, 92)], '#b58867')
    b.path([(0, 79), (82, 76), (147, 77), (229, 66), (303, 64), (359, 57), (384, 56)], '#e9c195', .9)
    b.path([(0, 90), (90, 84), (155, 81), (228, 71), (307, 67)], '#805d53', .8)
    for i in range(350):
        x, y = r.uniform(0, 384), r.uniform(60, 92)
        tint = r.choice(['#a28c7f', '#726f68', '#6c6461', '#8f7867'])
        b.path([(x, y), (x + r.random()*4, y-.2)], tint, r.uniform(.45, .9))
    return b


def horse(b, x, y, scale, lighter=False):
    def p(points, color, outline=None, width=1):
        b.fill([(x+px*scale, y+py*scale) for px,py in points], color, outline, width)
    coat = '#aa714c' if lighter else '#8d563e'
    p([(4, 15), (-2, 14), (-7, 20), (-6, 25), (-12, 25), (-12, 17), (-8, 10), (-2, 11)], '#49383c', INK)
    p([(2, 18), (10, 16), (13, 25), (7, 32), (5, 39), (0, 40), (0, 35), (3, 29)],
      '#6e483c', INK)
    p([(25, 18), (31, 17), (31, 26), (36, 33), (34, 37), (29, 36), (28, 31), (24, 26)],
      '#6e483c', INK)
    p([(0, 11), (7, 7), (20, 9), (24, 6), (28, -1), (33, -4), (34, -11), (38, -6),
       (39, -11), (42, -6), (42, -2), (48, 7), (47, 12), (41, 13), (36, 8), (34, 22),
       (28, 25), (12, 24), (5, 27), (1, 24), (-1, 18)], coat, INK, 1.2)
    p([(21, 10), (26, 5), (28, -2), (34, -8), (36, -5), (35, -1), (31, 2), (31, 7), (28, 12)],
      '#4d3939')
    p([(1, 14), (4, 10), (13, 11), (19, 13), (25, 10), (22, 15), (12, 16)], '#ca9667')
    p([(6, 23), (12, 23), (15, 31), (22, 34), (22, 39), (17, 39), (12, 35), (7, 33), (5, 28)], coat, INK, 1)
    p([(30, 23), (35, 22), (39, 26), (42, 34), (48, 36), (49, 40), (43, 40), (37, 35), (34, 28)], coat, INK, 1)
    p([(39, -4), (42, 1), (45, 7), (43, 8), (39, 4)], '#e3c69c')
    b.oval((x+36*scale, y-1.5*scale, x+38.5*scale, y+1.1*scale), '#28202a')
    b.path([(x+39*scale, y-3*scale), (x+39*scale, y+7*scale), (x+46*scale, y+8*scale)], '#533f3c', 1.7)
    b.path([(x+19*scale, y+10*scale), (x+27*scale, y+15*scale), (x+34*scale, y+17*scale)], '#e1af73', 2.1)
    b.oval((x+26.5*scale, y+12.5*scale, x+31*scale, y+17.5*scale), '#e4bf80', '#745045', .8)


def draw_coach():
    b = Brush(231, 76)
    b.oval((5, 58, 228, 73), (40, 34, 42, 85))
    horse(b, 156, 30, .91)
    horse(b, 176, 32, .96, True)
    b.path([(107, 49), (160, 52), (204, 47)], '#352a33', 3.5)
    b.path([(112, 47), (175, 49), (197, 46)], '#c59767', 1)
    # Curling gilded trim over royal plum paint, spoiled by tar.
    b.path([(17, 47), (24, 57), (75, 59), (107, 53), (118, 43)], '#302a35', 7)
    b.fill([(12, 19), (32, 9), (72, 9), (94, 15), (100, 24), (102, 47), (91, 57), (41, 61),
            (18, 54), (10, 45)], '#86454b', '#3e2d37', 1.8)
    b.fill([(7, 20), (13, 13), (32, 8), (71, 7), (90, 10), (97, 16), (103, 20), (97, 24),
            (24, 23), (13, 25)], '#38384c', '#463139', 1.65)
    b.path([(12, 19), (34, 14), (71, 13), (89, 15), (98, 21)], '#bd9265', 1.8)
    b.path([(19, 49), (35, 54), (77, 53), (91, 49)], '#e0af68', 1.6)
    b.path([(22, 28), (25, 45), (35, 52)], '#cc825d', 1.2)
    b.path([(78, 25), (82, 46), (77, 54)], '#d5ae72', 1.3)
    b.fill([(40, 22), (67, 23), (74, 27), (74, 44), (66, 48), (39, 48), (32, 43), (33, 28)],
           '#382d37', '#dda063', 1.75)
    b.fill([(34, 26), (42, 25), (44, 41), (39, 47), (33, 42)], '#9d454d')
    b.fill([(64, 25), (72, 27), (73, 42), (65, 46), (63, 39)], '#a35552')
    # The King is facing the horses. His nose is in the air, away from the window.
    b.fill([(49, 43), (56, 38), (62, 39), (67, 46), (47, 46)], '#b84d4a', '#55353a', .8)
    b.path([(49, 44), (55, 42), (63, 43)], '#e5d3aa', 2.4)
    b.oval((48, 28, 63, 42), '#817493', '#512e43', .7)
    b.fill([(59, 32), (66, 34), (62, 36), (64, 39), (59, 42), (52, 42), (50, 38)], '#bab1cb')
    b.oval((48, 34, 52, 38), '#594468', '#483245', .5)
    b.path([(59, 32), (62, 32)], '#4d3138', 1)
    b.path([(59, 39), (63, 38)], '#4d3138', .9)
    b.fill([(60, 39), (63, 39), (64, 36), (65, 39), (63, 41)], '#fff0ce')
    b.fill([(50, 31), (49, 25), (53, 27), (55, 23), (57, 27), (61, 24), (62, 30)],
           '#ebbb69', '#7d533f', .7)
    b.path([(52, 29), (60, 28)], '#fff093', 1)
    b.oval((54.5, 26.5, 57.5, 29.5), '#cf3850', '#522d42', .6)
    b.fill([(9, 21), (18, 21), (24, 25), (35, 25), (32, 32), (26, 37), (25, 44), (23, 45),
            (21, 37), (17, 32), (9, 33)], '#30262e', '#492e39', .95)
    b.fill([(78, 23), (91, 18), (97, 20), (103, 29), (100, 34), (95, 32), (93, 43), (91, 43),
            (89, 37), (84, 34), (83, 40), (81, 38)], '#2d252e', '#492e39', .95)
    b.path([(10, 23), (19, 23), (26, 27), (31, 27)], '#736268', 1.15)
    b.path([(79, 25), (88, 23), (90, 20), (98, 23)], '#736268', 1.15)
    for x, y, s, a in [(12,28,.64,.4),(21,36,.55,-.55),(30,30,.52,1.25),(19,44,.66,-1.18),
                        (85,37,.6,-.43),(95,29,.8,.65),(97,40,.56,-.83),(89,42,.58,.26),
                        (78,54,.65,1.2),(31,53,.56,-1.15),(18,19,.71,-.26),(70,10,.61,-.4)]:
        feather(b, (x,y), s, rotate=a)
    # A driver and reins on the front footboard.
    b.path([(100, 40), (121, 43), (116, 50), (104, 51)], '#5f4a48', 3.5)
    b.fill([(103, 26), (108, 25), (116, 29), (121, 36), (115, 41), (103, 42), (101, 35)], '#395970', INK)
    b.oval((103, 17, 112, 28), '#d4956a', INK, .7)
    b.fill([(98, 20), (102, 16), (102, 12), (108, 14), (114, 12), (113, 21)], '#3e424e', '#c1a279', .7)
    b.path([(109, 28), (116, 32), (122, 31)], '#87a3a3', 2.3)
    b.path([(121, 31), (158, 39), (194, 38), (220, 40)], '#563f37', .95)
    return b


def draw_wheel():
    b = Brush(34, 34)
    b.oval((1, 1, 33, 33), '#64443d', '#2b2730', 1.5)
    b.oval((5.2, 5.2, 28.8, 28.8), (0, 0, 0, 0), '#dfac75', 1.4)
    b.arc((2.8, 2.8, 31.2, 31.2), 183, 340, '#d0a078', 1.4)
    for i in range(10):
        a = math.pi*i/5
        x, y = 17 + math.cos(a)*12, 17 + math.sin(a)*12
        b.path([(17, 17), (x, y)], '#91674e', 2.4)
        b.path([(17, 16), (x, y-.7)], '#c39467', .7)
    b.oval((12.5, 12.5, 21.5, 21.5), '#dfb77d', '#4f3a3a', 1.15)
    b.oval((15, 15, 19, 19), '#77534b')
    return b


for i, pose in enumerate(['lit', 'tip', 'shake', 'spent', 'emptyLeft']):
    draw_window(pose).paste(i * 192, 0)
draw_window('emptyRight').paste(0, 168)
glow().paste(192, 168)
draw_camp().paste(368, 168)
draw_survey().paste(612, 168)
draw_packed(2).paste(812, 168)
draw_packed(-2).paste(768, 336)
draw_dawn().paste(0, 336)
draw_coach().paste(0, 520)
draw_wheel().paste(464, 520)

loose = Brush(24, 24)
feather(loose, (9, 21), 1.13, rotate=.43)
loose.paste(534, 520)
drop = Brush(16, 22)
drop.fill([(7, 2), (12, 10), (14, 15), (12, 19), (7, 21), (3, 19), (2, 15), (4, 10)], '#302332', '#a58b83', .6)
drop.path([(6, 12), (5, 16), (6, 18)], '#9c736f', 1.3)
drop.paste(584, 520)

OUT.parent.mkdir(parents=True, exist_ok=True)
ATLAS.save(OUT, 'WEBP', quality=92, method=6, exact=True)
