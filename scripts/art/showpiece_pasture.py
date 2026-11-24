"""Draw miniature theatre flats for Meadow. Run with python3 + Pillow."""

import json
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/art-showpiece"
S = 4
TILE = 160
ANCHOR = (80, 96)
pieces = {}


class Flat:
    """Drawing coordinates are game pixels measured from the ground pivot."""
    def __init__(self):
        self.image = Image.new("RGBA", (TILE * S, TILE * S))
        self.pen = ImageDraw.Draw(self.image)

    def point(self, p):
        return tuple(round((v + off) * S) for v, off in zip(p, ANCHOR))

    def poly(self, pts, color):
        self.pen.polygon([self.point(p) for p in pts], fill=color)

    def line(self, pts, color, width=1):
        self.pen.line([self.point(p) for p in pts], fill=color, width=max(1, round(width*S)), joint="curve")

    def oval(self, x, y, rx, ry, color):
        self.pen.ellipse([self.point((x-rx, y-ry)), self.point((x+rx, y+ry))], fill=color)


def draw_mill(p):
    # Batter the limestone tower, and turn its cap into the wind.
    p.poly([(-20,-3),(-13,-44),(0,-53),(14,-41),(20,-4),(8,2),(-8,2)], "#665440")
    p.poly([(-18,-5),(-12,-43),(0,-49),(2,-3),(-7,0)], "#e3d0a0")
    p.poly([(0,-49),(12,-41),(18,-5),(3,-1)], "#b7a378")
    rng = random.Random(14)
    for i in range(65):
        y = rng.uniform(-40,-5)
        x = rng.uniform(-13,13) * (1 + y*.009)
        p.line([(x,y),(x+rng.uniform(1,3),y-.2)], rng.choice(["#c5ae82","#ead9af","#b5a07d"]), .6)
    p.poly([(-18,-42),(-11,-52),(1,-59),(12,-53),(18,-44),(5,-39)], "#514443")
    p.poly([(-17,-44),(-8,-53),(2,-57),(8,-52),(-2,-43)], "#a24e3c")
    p.poly([(-3,-42),(7,-53),(12,-50),(16,-45),(5,-41)], "#784538")
    for x in range(-13,6,4):
        p.line([(x,-44),(x+7,-52)],"#c57b54",.7)
    p.line([(-18,-43),(2,-40),(18,-45)], "#4b3c30",2)
    p.poly([(-9,-1),(-9,-12),(-5,-16),(0,-14),(1,-1)], "#45392f")
    p.poly([(-7,-1),(-7,-12),(-4,-14),(-1,-13),(-1,-2)], "#826648")
    p.oval(-3,-7,.7,.7,"#e6cb87")
    for x,y in [(-6,-27),(8,-30),(12,-14)]:
        p.poly([(x-2,y-3),(x+2,y-4),(x+2,y+2),(x-2,y+3)],"#504a3c")
        p.line([(x,y-3),(x,y+2)],"#d4b075",.8)
    # Timber gallery and matching balustrade around the mill.
    for x in (-21,-12,-2,8,19):
        p.line([(x,-16),(x,-11),(x*.76,-6)],"#5f4a35",1.3)
    p.line([(-23,-15),(-8,-11),(3,-11),(21,-16)],"#f6d2a0",1.35)
    p.line([(-23,-11),(-6,-7),(4,-7),(21,-12)],"#71553a",2.2)
    p.line([(-23,-12),(-6,-8),(4,-8),(21,-13)],"#b69966",1.0)


def draw_sails(p):
    # Four framed linen sails; the inner arm is bare and the outer edge laced.
    for k in range(4):
        def rot(x,y):
            a = k*math.pi/2
            return (x*math.cos(a)-y*math.sin(a), x*math.sin(a)+y*math.cos(a))
        p.poly([rot(x,y) for x,y in [(0,-11),(8,-12),(8,-31),(1,-32)]], "#f1dfad")
        p.poly([rot(x,y) for x,y in [(5,-11),(8,-12),(8,-31),(6,-31)]], "#c2ab82")
        for y in (-13,-19,-25,-31):
            p.line([rot(0,y),rot(8,y)], "#866749",.85)
        p.line([rot(7,-12),rot(8,-31)],"#806044",1)
        p.line([rot(0,0),rot(0,-33)],"#62482f",2.25)
        p.line([rot(-.65,-3),rot(-.65,-32)],"#c39a61",.7)
    p.oval(0,0,3,3,"#392f2a")
    p.oval(-.5,-.5,1.8,1.8,"#d9ad70")


def draw_house(p):
    p.poly([(-23,-3),(-23,-23),(-7,-31),(20,-22),(20,-5),(4,2)], "#6f5945")
    p.poly([(-22,-4),(-22,-20),(-5,-24),(2,-19),(2,0)], "#e6c58d")
    p.poly([(2,0),(2,-20),(12,-32),(20,-23),(20,-5)], "#bfa57b")
    p.poly([(10,-33),(11,-43),(15,-44),(16,-33)], "#865748")
    p.line([(10,-43),(16,-43)],"#c18f72",2)
    p.poly([(-28,-20),(-14,-36),(12,-34),(0,-16)], "#593f35")
    p.poly([(-27,-22),(-14,-36),(12,-34),(-1,-19)], "#b45c40")
    for row in range(4):
        y = -34+row*3.15
        left = -16-row*2.8
        p.line([(left,y),(left+24,y+2)],"#89503a",.8)
        for j in range(4):
            x = left+3+j*6 + row%2*2
            p.line([(x,y+.5),(x-2,y+2.7)],"#d1895d",.8)
    p.line([(-27,-20),(-1,-17),(12,-32),(23,-21)],"#5d4535",2.0)
    for x in (-19,-6):
        p.poly([(x,-15),(x+6,-14),(x+6,-8),(x,-9)],"#635845")
        p.line([(x+3,-15),(x+3,-8)],"#dbb278",.9)
        p.line([(x,-11),(x+6,-10)],"#dbb278",.7)
        p.line([(x-1,-8),(x+7,-7)],"#745135",1.3)
    p.poly([(8,-2),(8,-13),(14,-15),(15,-4)],"#554437")
    for i in range(3):
        p.line([(-21+i*8,-4+i*.7),(-21+i*8,-17+i*.6)],"#957247",1.15)
    p.line([(5,-1),(20,-6)],"#796347",1.5)
    p.oval(14,-8,.65,.65,"#eecb85")


def stalk(p,x,y,h,lean,shade):
    p.line([(x,y),(x+lean*.45,y-h*.55),(x+lean,y-h)],shade,.75)
    for j in range(3):
        y0 = y-h+j*1.35
        p.line([(x+lean,y0+1.5),(x+lean-1.3,y0-.3)],"#c79845",.72)
        p.line([(x+lean+.2,y0+.8),(x+lean+1.7,y0-1.2)],"#f5d682",.82)


def draw_wheat(p):
    rng = random.Random(124)
    p.poly([(-30,-3),(5,-14),(31,-5),(-4,7)],"#9b894f")
    for i in range(7):
        a,b = (-29+i*4.7,-2+i*1.45),(4+i*4.1,-13+i*1.45)
        p.line([a,b],"#857648",1.8)
        p.line([(a[0],a[1]+1.25),(b[0],b[1]+1.25)],"#c3a763",1)
        for j in range(12):
            x=a[0]+(b[0]-a[0])*j/12+rng.uniform(-.8,.8)
            y=a[1]+(b[1]-a[1])*j/12+rng.uniform(-.6,.6)
            stalk(p,x,y,rng.uniform(5.5,9),rng.uniform(-2,1),rng.choice(["#a38642","#d6af59"]))


def draw_willow(p):
    p.poly([(-5,0),(-3,-14),(-8,-31),(-5,-34),(0,-20),(6,-34),(9,-32),(2,-13),(4,0)],"#6c6549")
    p.line([(-3,-1),(-1,-17),(-5,-28)],"#ac9a6c",1.8)
    rng=random.Random(72)
    for i in range(34):
        a=rng.uniform(0,2*math.pi)
        r=math.sqrt(rng.random())
        x=18*math.cos(a)*r
        y=-29+13*math.sin(a)*r
        p.oval(x,y,6,6,rng.choice(["#5d754c","#657e50","#728854","#839568"]))
        for j in range(4):
            dx=x+rng.uniform(-4,4)
            dy=y+rng.uniform(-2,2)
            end=dy+rng.uniform(5,12)
            p.line([(dx,dy),(dx+1,(dy+end)/2),(dx+.3,end)],rng.choice(["#8da271","#9bad76","#bfd097","#768e63"]),1.15)


def draw_fence(p):
    for y in (-8,-4):
        p.line([(-19,y-2),(16,y+4)],"#735d43",2.0)
        p.line([(-19,y-3),(16,y+3)],"#c7aa7d",1.0)
    for x,y in [(-18,-2),(0,1),(16,4)]:
        p.poly([(x-1,y),(x-1,y-11),(x,y-13),(x+2,y-11),(x+2,y+.5)],"#957755")
        p.line([(x-1,y-11),(x-1,y)],"#e0c997",1.0)


def draw_laundry(p):
    for x,y in [(-20,-2),(18,1)]:
        p.line([(x,y),(x,y-24)],"#715d43",2)
        p.line([(x-.5,y),(x-.5,y-24)],"#c7a37a",.7)
    p.line([(-20,-24),(0,-19),(18,-21)],"#625744",.8)
    for x,y,w,h,c in [(-16,-23,6,8,"#eaddbd"),(-8,-21,8,10,"#7496a2"),(3,-20,7,9,"#f5e8ce"),(11,-20,4,7,"#d58a69")]:
        p.poly([(x,y),(x+w,y+.8),(x+w-.6,y+h),(x-.7,y+h-.5)],c)
        p.line([(x+w-1,y+1),(x+w-1.7,y+h-1)],"#adab95",.8)


def draw_honey_cart(p):
    # A two-wheeled honey stall. Jars catch a warm pin of light beneath
    # the scalloped indigo awning, even at a phone's native resolution.
    for x,y in [(-9,-1),(9,0)]:
        p.oval(x,y,4.3,4.2,"#504538")
        p.oval(x,y,3.4,3.3,"#bb975f")
        for k in range(4):
            a=k*math.pi/4
            dx,dy=math.cos(a)*2.8,math.sin(a)*2.8
            p.line([(x-dx,y-dy),(x+dx,y+dy)],"#675340",.7)
        p.oval(x,y,1,1,"#e3c288")
    p.poly([(-15,-4),(-16,-9),(10,-7),(14,-11),(14,-5),(10,-2)],"#8c593c")
    p.line([(-16,-9),(10,-7),(15,-11)],"#e2bf80",1.6)
    p.line([(10,-4),(21,-3)],"#7e6346",1.3)
    for x,y in [(-13,-8),(12,-10)]:
        p.line([(x,y),(x,y-16)],"#755a40",1.2)
    for x,y in [(-9,-9),(-4,-8.6),(1,-8.4),(6,-8.0)]:
        p.oval(x,y-2.1,1.8,2.4,"#db9c49")
        p.line([(x-1.3,y-4.2),(x+1.3,y-4.2)],"#f2d8a0",1.1)
        p.line([(x-.7,y-2.7),(x-.7,y-1.5)],"#f6cf8c",.75)
    for j in range(6):
        x=-18+j*5
        y=-20+j*.3
        c=("#7795a2","#e9d9b3")[j%2]
        p.poly([(x,y),(x+7,y-7),(x+12,y-6.6),(x+5,y+.3)],c)
        p.poly([(x,y),(x+5,y+.3),(x+4.3,y+2.3),(x+1.2,y+2.6)],c)
    p.line([(-11,-27),(18,-25)],"#86725b",1)


def draw_hives(p):
    for x,y in [(-8,-1),(6,2)]:
        p.line([(x-5,y+3),(x+6,y+2)],"#6c583b",2.0)
        p.oval(x,y-2,6.5,2.8,"#a77c40")
        for j in range(6):
            radius=6.1-j*.68
            p.oval(x,y-2-j*1.35,radius,2.35,"#bb8e46")
            p.line([(x-radius+1,y-2-j*1.35),(x,y-1.45-j*1.35),(x+radius-.8,y-2-j*1.35)],"#e6c779",.8)
        p.oval(x-1.4,y-.8,1.3,1,"#463d2e")


def draw_sheep(p, grazing):
    for x,y in [(-5,-3),(3,-2),(-2,-4),(5,-4)]:
        p.line([(x,y-2),(x+.4,y+2)],"#5c5548",1.7)
    for x,y,r in [(-5,-6,3.4),(-2,-7.5,4.6),(3,-6.7,4.5),(5,-5,3.2),(0,-4.2,4.3)]:
        p.oval(x,y,r,r*.85,"#d7cdb4")
        p.oval(x-.5,y-1,r*.8,r*.62,"#f4ead1")
    h=-4 if grazing else -8
    p.oval(7,h,2.9,3.2,"#6a6152")
    p.oval(6.4,h-2.6,2.2,1.5,"#e8dfc6")
    p.line([(7.4,h-.8),(9.8,h-1)],"#51483c",1)
    p.oval(8.3,h-.7,.45,.45,"#201e1b")


def draw_hen(p,peck):
    for x in (-1,1.2):
        p.line([(x,-2),(x+.3,.5),(x+1,.8)],"#ac793d",.8)
    p.poly([(-2,-3),(-6,-7),(-5,-3),(-3,-2)],"#655344")
    p.oval(0,-3.7,3.1,2.25,"#d6af78")
    p.oval(-.7,-4,1.8,1.2,"#f0ce94")
    y=-3.4 if peck else -6.2
    p.oval(2.4,y,1.7,1.8,"#f2dcb3")
    p.oval(2.5,y-1.8,1,.8,"#ae4f3e")
    p.poly([(3.5,y-.4),(5.5,y+.2),(3.5,y+.6)],"#dc9a43")


def draw_cat(p,sit):
    p.oval(-.2,-3,4,2.5,"#504a40")
    p.oval(2.8,-5.6,2.1,2,"#64594c")
    for x in (1.2,3.7):
        p.poly([(x-.6,-6.4),(x,-9),(x+1.5,-6.6)],"#66574b")
    p.line([(-3,-3),(-6,-3.5),(-7,-6),(-6.5 if sit else -9,-7.5)],"#4c463d",1.5)
    p.line([(3.3,-5.8),(4.7,-5.9)],"#d8bd85",.55)


def draw_worker(p,rake):
    p.line([(-1,-5),(-2,0)],"#4e5047",1.8)
    p.line([(1.2,-5),(2,0)],"#4e5047",1.7)
    p.poly([(-2,-10),(1,-10),(2.8,-5),(-2.6,-4.8)],"#69828b")
    p.oval(-.2,-11.7,1.7,2,"#cda77b")
    p.oval(-.2,-13.3,2.8,.8,"#caa96a")
    p.oval(-.4,-14.1,1.6,1.2,"#d9bf87")
    if rake:
        p.line([(0,-9),(2,-7.6),(4,-8.2)],"#cca27b",1.3)
        p.line([(1,-13),(6,0)],"#a28350",1.1)
        p.line([(4,.2),(8,-.6)],"#786b49",1.2)
    else:
        p.line([(0,-9),(2,-7),(4,-9)],"#c69b76",1.2)


def draw_bird(p,down):
    y=1.5 if down else -3
    p.poly([(-6,y-1),(-2,-.5),(0,-1),(2,-.4),(6,y-.8),(3,1),(.5,.4),(-1,1),(-4,.3)], "#52605a")


def draw_grass(p):
    rng=random.Random(82)
    for i in range(22):
        x,y=rng.uniform(-6,6),rng.uniform(-1,1.5)
        h=rng.uniform(2,6)
        p.poly([(x-.55,y),(x+rng.uniform(-3,2),y-h),(x+.55,y)],rng.choice(["#9da464","#8c9b5c","#c1bb79","#738450"]))
    p.line([(-2,1),(-1,-4),(1,-6)],"#dfcc83",.75)


def glow(p):
    # Store an amber feathered lamp as a small transparent sprite; glows
    # are batched quads, and do not require a per-frame blur.
    for r in range(40,0,-1):
        a=round(170*(1-r/40)**2.5)
        p.oval(0,0,r,r,"#ffc563"+format(a,"02x"))


def shadow(p):
    for r in range(40,0,-1):
        a=round(160*(1-r/40)**1.5)
        p.oval(0,0,r,r*.6,"#263940"+format(a,"02x"))


def cloud(p):
    for x,y,rx,ry in [(-22,-2,20,10),(3,-5,22,12),(22,0,18,8),(-4,4,24,9)]:
        p.oval(x,y,rx,ry,"#334e58bb")
    p.image=p.image.filter(ImageFilter.GaussianBlur(5*S))


def smoke(p):
    for x,y,rx,ry in [(-4,1,5,3),(0,-1,5,4),(5,0,4,2.5)]:
        p.oval(x,y,rx,ry,"#f4e2cacc")
    p.image=p.image.filter(ImageFilter.GaussianBlur(1.1*S))


def sunwash(p):
    # Broken, oblique rays seen through the canopy outside the diorama.
    n=80
    tile=Image.new("RGBA",(n,n))
    for y in range(n):
        for x in range(n):
            u,v=x/(n-1),y/(n-1)
            across=u*.8-v*.51
            bands=sum(strength*math.exp(-((across-centre)/width)**2)
                      for centre,width,strength in [(-.10,.08,.7),(.11,.025,.23),(.23,.065,.75),(.44,.035,.23)])
            falloff=(1-u)**1.55*(1-v)**1.2
            tile.putpixel((x,y),(255,217,141,round(110*min(1,(.38+bands)*falloff))))
    p.image.paste(tile.resize((n*S,n*S),Image.Resampling.BILINEAR),p.point((-40,-40)))


def vignette(p):
    n=64
    small=Image.new("RGBA",(n,n))
    for y in range(n):
        for x in range(n):
            r=((2*x/(n-1)-1)**2 + (2*y/(n-1)-1)**2)**.5
            a=max(0,min(1,(r-.48)/.94))
            small.putpixel((x,y),(52,43,61,round(68*a*a)))
    p.image.paste(small.resize((n*S,n*S),Image.Resampling.BILINEAR),p.point((-32,-32)))


def make():
    drawings={"mill":draw_mill,"sails":draw_sails,"cottage":draw_house,"wheat":draw_wheat,
              "honeyCart":draw_honey_cart,"willow":draw_willow,"fence":draw_fence,"laundry":draw_laundry,"hives":draw_hives,
              "ewe":lambda p:draw_sheep(p,False),"graze":lambda p:draw_sheep(p,True),
              "hen":lambda p:draw_hen(p,False),"peck":lambda p:draw_hen(p,True),
              "cat":lambda p:draw_cat(p,True),"catTail":lambda p:draw_cat(p,False),
              "rake":lambda p:draw_worker(p,True),"run":lambda p:draw_worker(p,False),
              "wingUp":lambda p:draw_bird(p,False),"wingDown":lambda p:draw_bird(p,True),
              "grass":draw_grass,"lamp":glow,"shade":shadow,"cloud":cloud,"smoke":smoke,"sunwash":sunwash,"vignette":vignette}
    for name,draw in drawings.items():
        flat=Flat()
        draw(flat)
        box=flat.image.getbbox()
        # Integral game-pixel frames, with transparent padding for texture filtering.
        x,y,w,h=[math.floor(box[0]/S)-2,math.floor(box[1]/S)-2,math.ceil(box[2]/S)+2,math.ceil(box[3]/S)+2]
        if name in ("vignette","sunwash"):
            radius=32 if name=="vignette" else 40
            x,y=ANCHOR[0]-radius,ANCHOR[1]-radius
            w,h=x+radius*2,y+radius*2
        pieces[name]=(flat.image.crop((x*S,y*S,w*S,h*S)),ANCHOR[0]-x,ANCHOR[1]-y)
    layout={}
    atlas=Image.new("RGBA",(256*S,512*S))
    x=y=row=0
    for name,(img,ax,ay) in pieces.items():
        w,h=img.width//S,img.height//S
        if x+w>256:
            x=0
            y+=row
            row=0
        atlas.paste(img,(x*S,y*S))
        layout[name]=[x,y,w,h,ax,ay]
        x+=w
        row=max(row,h)
    atlas=atlas.crop((0,0,256*S,(y+row)*S))
    OUT.mkdir(parents=True,exist_ok=True)
    for d in (1,2):
        atlas.resize((256*d,(y+row)*d),Image.Resampling.LANCZOS).save(
            OUT/f"showpiece-pasture-{d}x.webp",quality=90,method=6,exact=True)
    (OUT/"showpiece-pasture.json").write_text(json.dumps(layout,separators=(",",":"))+"\n")


if __name__=="__main__":
    make()
