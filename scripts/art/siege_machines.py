"""Paint the siege props as a small, transparent sprite sheet.

Run from the repo with python3 scripts/art/siege_machines.py.
All drawing uses local paths and colors. Coordinates are half-size source px.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[2] / "public/assets/keep"
TILE = (96, 64)
SCALE = 4
INK = "#241e2b"
GOLD = "#c49858"
RIVET = "#eac686"
WOOD = "#765043"
PAPER = "#efce8c"
BRIGHT = "#fff0c3"
RED = "#a9343d"


class Drawing:
    def __init__(self):
        self.image = Image.new("RGBA", tuple(n * SCALE for n in TILE))
        self.draw = ImageDraw.Draw(self.image)

    @staticmethod
    def points(points):
        return [(round(x * SCALE), round(y * SCALE)) for x, y in points]

    def shape(self, points, fill, edge=INK, width=1):
        self.draw.polygon(self.points(points), fill=fill, outline=edge, width=round(width * SCALE))

    def oval(self, x, y, rx, ry, fill, edge=INK, width=1):
        self.draw.ellipse(self.points([(x-rx,y-ry),(x+rx,y+ry)]), fill=fill,
                          outline=edge, width=round(width * SCALE))

    def line(self, points, color, width=1):
        self.draw.line(self.points(points), color, width=round(width * SCALE), joint="curve")

    def tile(self):
        return self.image.resize(tuple(n * 2 for n in TILE), Image.Resampling.LANCZOS)


def seal(p, x, y, r):
    p.oval(x, y, r, r, RED, "#6d2030", 1.15)
    p.oval(x, y, .70*r, .72*r, "#c9504b", "#f48667", .75)
    p.shape([(x-r*.44,y+r*.27),(x-r*.48,y-r*.36),(x-r*.17,y-r*.15),
             (x,y-r*.51),(x+r*.24,y-r*.12),(x+r*.48,y-r*.35),(x+r*.40,y+r*.27)],
            "#ffe29c", None)


def parchment(p, y, ram, *, lifted=False):
    # Rim furthest from the light and the loose corner cast distinct shadows.
    p.shape([(15,y-2),(77,y-7),(88,y+1),(87,y+19),(79,y+24),(18,y+28),(9,y+22),(8,y+6)],
            "#986139", "#986139" if lifted else INK, 1.75)
    p.shape([(12,y+2),(76,y-4),(82,y-1),(82,y+16),(73,y+21),(17,y+26),(11,y+20)],
            PAPER, "#ad784e", 1)
    p.shape([(14,y+3),(75,y-2),(78,y+2),(78,y+6),(13,y+12),(11,y+8)], BRIGHT, None)
    p.line([(15,y+24),(73,y+19),(80,y+15)], "#c79058", 1.2)
    p.oval(78,y+9,9.2,14.9,BRIGHT,"#856047",1.4)
    p.oval(80,y+10,5.8,11.2,"#ae7449","#f0cf96",1)
    p.line([(79,y+17),(83,y+13),(83,y+8),(81,y+5),(79,y+7),(78,y+12)],
           "#603c37",1.1)
    p.oval(13,y+14,5.6,12.1,"#c08c53","#775139",1)
    p.line([(14,y+5),(11,y+9),(11,y+15),(14,y+19),(17,y+16)],"#f4d69e",1.15)
    # Marks on the notice read as officious handwriting at a glance.
    for k,w in enumerate((15,19,11)):
        yy=y+8+k*4
        p.line([(24,yy),(24+w*.43,yy-1),(24+w,yy-2.1)],"#845c47",1)
    p.shape([(50,y),(58,y-1),(58,y+22),(50,y+23)], "#862b42","#612b35",1)
    p.line([(52,y+1),(52,y+19)],"#e17461",1)
    tail=31 if ram else 37
    p.shape([(58,y+15),(65,y+tail),(60,y+tail-4),(55,y+tail+1),(54,y+18)],
            "#b94345","#772a3a",1)
    p.shape([(52,y+14),(48,y+tail+2),(44,y+tail-3),(39,y+tail),(46,y+15)],
            "#c4554a","#772a3a",1)
    seal(p,54,y+16,7.5)


def wagon_wheel(p, x, y, rx, ry, phase):
    p.oval(x,y,rx,ry,INK,"#17171f",1.5)
    p.oval(x,y,rx-2,ry-2,"#67493f",GOLD,.8)
    for i in range(6):
        angle=math.tau*i/6+phase
        dx,dy=math.cos(angle),math.sin(angle)
        p.line([(x+1.6*dx,y+1.6*dy),(x+(rx-2.5)*dx,y+(ry-2.5)*dy)],"#bc8757",1.7)
    p.oval(x,y,2.9,2.9,WOOD,"#c79255",.85)
    p.oval(x-.55,y-.6,1.15,1.15,RIVET,None)


def ram(p, frame, *, lifted=False):
    # A high trestle and brass rail hold the scroll above the running gear.
    if not lifted:
        p.oval(47,51,41,7,"#181820",None)
        p.oval(46,52.6,37,6,(28,25,34,108),None)
    p.shape([(12,39),(74,34),(88,38),(86,46),(15,52),(7,47)],"#4b3b36","#4b3b36" if lifted else INK,1.45)
    p.shape([(8,40),(14,44),(86,36),(88,39),(85,43),(15,48),(8,45)],"#986853","#986853" if lifted else INK,1.15)
    p.line([(15,44),(83,38)],"#e0a471",1.2)
    for x,y in ((26,41),(65,38)):
        p.line([(x-7,y+2),(x+7,y-19),(x+13,y-1)],INK,5.6)
        p.line([(x-7,y+2),(x+7,y-19),(x+13,y-1)],WOOD,3.9)
        p.line([(x-8,y+1),(x+6,y-18)],GOLD,1)
        p.oval(x+1,y-6,1.4,1.4,RIVET,None)
    parchment(p,10+(frame%2)*.65,True,lifted=lifted)
    for x,y in ((23,45.5),(73,45)):
        wagon_wheel(p,x,y,9.4,10.3,frame*math.pi/12)
    p.oval(14,42,1.5,1.1,RIVET,None)
    p.oval(84,39,1.7,1.1,RIVET,None)


def limbs(p, x, y, mirror, swing):
    def arm(points, color, width):
        p.line([(x+u*mirror,y+v) for u,v in points],color,width)
    # Clumsy elbows and mitten hands leave the hammer pose legible in miniature.
    hand=(13,-37) if swing else (16,-19)
    arm([(5,-20),(9,-24),hand],INK,6)
    arm([(5,-20),(9,-24),hand],"#516d86",4.2)
    p.oval(x+hand[0]*mirror,y+hand[1],2.35,2.15,"#edb88a",INK,.7)
    tip=(17,-45) if swing else (24,-24)
    arm([hand,tip],"#51352d",3)
    arm([hand,tip],"#bb865a",1.3)
    u,v=tip
    arm([(u-3,v-2.6),(u+4,v+2.4)],INK,5.5)
    arm([(u-3,v-2.6),(u+4,v+2.4)],"#9da7a8",3.5)


def worker(p, x, y, mirror, swing, blouse):
    p.oval(x,y+1,8,3,"#2b252d",None)
    p.line([(x-3,y-12),(x-4,y-1),(x-8,y)],"#343142",4.2)
    p.line([(x+3,y-12),(x+2,y),(x+8,y)],"#423247",4.5)
    p.shape([(x-5,y-23),(x+3,y-25),(x+7,y-20),(x+7,y-9),(x-6,y-9)],
            blouse,INK,1)
    p.line([(x-5,y-10),(x+6,y-12)],"#d9b28b",1.4)
    p.oval(x,y-28,4.9,5.7,"#e4ad83",INK,1)
    p.oval(x+4.2*mirror,y-26.8,1.8,1.7,"#e7ab7a",INK,.7)
    p.line([(x+2*mirror,y-28.8),(x+2.6*mirror,y-28.5)],INK,1.2)
    p.shape([(x-6,y-29),(x-5,y-34),(x+3,y-35),(x+5,y-31),(x+8,y-30),(x+6,y-28),(x-5,y-27)],
            "#d08a36",INK,1)
    p.line([(x-4,y-33),(x+2,y-34)],"#ffcf77",.9)
    limbs(p,x,y,mirror,swing)


def repair(p, swing):
    # A bright diagonal plank remains over the old split while they work.
    p.shape([(29,43),(57,21),(63,26),(34,48)],"#b37e4d","#4d342c",1.4)
    p.line([(32,43),(58,24)],"#ffcb86",1.45)
    for x,y in ((34,43),(58,25)):
        p.oval(x,y,1.45,1.45,"#332e37","#debd80",.7)
    worker(p,21,54,1,swing,"#4d6f83")
    worker(p,73,54,-1,not swing,"#786886")


def debris(p):
    # The torn front leaf drops forward in one piece; the open atlas frame
    # underneath already has timbers and discarded iron lying in the vault.
    p.shape([(25,47),(27,27),(31,16),(35,11),(40,13),(45,8),(49,12),(55,13),
             (62,22),(65,43),(59,47),(52,44),(48,50),(42,47),(34,50)],
            "#684331",INK,1.6)
    for k in range(7):
        x=29+k*5.1
        y=13+abs(3-k)*3.3
        p.line([(x,y),(x-1,46)],"#38292b",1.5)
        p.line([(x+1,y+1),(x,43)],"#ab7950",.9)
    p.line([(27,32),(43,31),(52,33),(64,31)],"#343d49",4.4)
    p.line([(28,31),(43,30),(52,32),(63,30)],"#858788",1.1)
    for x in (31,40,52,61):
        p.oval(x,31,1.3,1.3,GOLD,None)


def save():
    atlas=Image.new("RGBA",(TILE[0]*8,TILE[1]*4))
    poses = [lambda drawing,i=i: ram(drawing,i) for i in range(4)]
    poses += [lambda drawing: parchment(drawing,14,False),lambda drawing: repair(drawing,False),
              lambda drawing: repair(drawing,True),debris]
    for i,pose in enumerate(poses):
        drawing=Drawing()
        pose(drawing)
        atlas.paste(drawing.tile(),((i%4)*TILE[0]*2,(i//4)*TILE[1]*2))
    OUT.mkdir(parents=True,exist_ok=True)
    atlas.save(OUT/"siege-machines.webp", quality=91, method=6)
    atlas.resize((atlas.width//2,atlas.height//2),Image.Resampling.LANCZOS).save(
        OUT/"siege-machines-half.webp",quality=92,method=6)


if __name__ == "__main__":
    save()
