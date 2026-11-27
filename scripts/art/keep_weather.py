"""Paint the Old Keep's two approach plates, storm and small atmospheric flats.
Run with python3 and Pillow. Coordinates on the plates are the actual board.
Encode both plate sizes from the original paintings.
"""
import json
import math
import random
import sys
from statistics import median
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/keep'
SITE = json.loads((ROOT / 'src/sim/keepSite.json').read_text())
S = 4


def rgb(a, b, t):
    t = max(0, min(1, t))
    return tuple(round(p + (q-p)*t) for p, q in zip(a, b))


def colour(c, v):
    return tuple(max(0, min(255, round(x+v))) for x in c)


def noise(size, freq, rng):
    """Octaves of pigment, stretched along the prevailing wind."""
    cloud = Image.new('L', size, 128)
    weight = 0.
    for i, gain in enumerate([1, .56, .32, .19, .11, .07, .04]):
        shape = tuple(max(2, round(x*2**i)) for x in freq)
        octave = Image.frombytes('L', shape, rng.randbytes(math.prod(shape)))
        octave = octave.resize(size, Image.Resampling.BICUBIC)
        cloud = Image.blend(cloud, octave, gain/(weight+gain))
        weight += gain
    return cloud


def sky():
    # Work at half scale for the broad cloud masses, then break up their edges
    # with a separate full-resolution octave of cold vapour.
    w, h = 1440, 800
    rng = random.Random(5101)
    dist = noise((w, h), (4, 7), rng).load()
    cloud = noise((w, h), (5, 13), rng).load()
    fine = noise((w, h), (16, 34), rng).load()
    image = Image.new('RGB', (w, h))
    pix = image.load()
    for y in range(h):
        v = y / h
        for x in range(w):
            u = x / w
            warp = dist[x,y]-128
            sx = max(0, min(w-1, int(x+warp*.8)))
            sy = max(0, min(h-1, int(y+warp*.82+22*math.sin(u*8+v*4))))
            mass = (cloud[sx,sy]-122)/64
            grain = (fine[x,y]-128)/128
            west = math.exp(-((u-.21)/.54)**2)
            # The western opening climbs behind the off-centre shoulder of the
            # keep. The lower, eastern horizon still burns through the rain.
            slit = .26+.33*u+.035*math.sin(u*8)
            hot = math.exp(-((v-slit)/.28)**2)*west
            amber = math.exp(-((v-slit)/.105)**2)*west
            # The sides of the rain shaft stay in shadow. Narrow columns descend
            # from gaps in the western cloud bank and broaden near the horizon.
            rays = (.5+.5*math.sin(u*63-v*12+math.sin(u*29)))**5
            base = rgb((22,35,55),(181,58,48),hot)
            base = rgb(base,(252,160,84),amber*(.78+.16*rays))
            edge = .14+.20*u+.085*math.sin(u*5.5+1)+.065*math.sin(u*9.6)
            shelf = max(0,min(1,(edge-v+.26*mass+.035*grain)*5.4+.58))
            scud = max(0,min(1,(mass+.38*grain-.21)*2.2))
            shield = max(shelf,scud*(.62+.30*(1-amber)))
            lip = max(0,min(1,(cloud[sx,max(0,sy-5)]-cloud[sx,min(h-1,sy+10)])/20))
            undershine = hot * (.19 + .53*lip + .24*(1-shield))
            shade = rgb((9,18,33),(53,69,88),max(0,min(1,.46+.38*grain-.37*mass)))
            shade = rgb(shade,(205,101,84),undershine)
            pix[x,y] = rgb(base,shade,shield)
    image = image.resize((w*2,h*2),Image.Resampling.BICUBIC)
    grain = noise(image.size,(65,87),rng)
    detail = ImageOps.colorize(grain,(110,112,117),(146,144,140))
    image = ImageChops.overlay(image,detail)
    save(image,'sky',91)

class Plate:
    def __init__(self, size):
        self.image = Image.new('RGBA', tuple(round(n*S) for n in size))
        self.draw = ImageDraw.Draw(self.image)
        self.rng = random.Random(size[0]+511)
        self.w,self.h = size
        self.offset_x=0

    def xy(self, points):
        return [(round((x+self.offset_x)*S),round(y*S)) for x,y in points]

    def composite(self,image,x,y):
        self.image.alpha_composite(image,(round((x+self.offset_x)*S),round(y*S)))

    def poly(self, pts, c):
        self.draw.polygon(self.xy(pts),fill=c)

    def line(self, pts, c, width=1):
        self.draw.line(self.xy(pts),fill=c,width=max(1, round(width*S)),joint='curve')

    def oval(self, x,y,rx,ry,c):
        self.draw.ellipse(self.xy([(x-rx,y-ry),(x+rx,y+ry)]),fill=c)


def bent_tree(p,x,y,h):
    """Leafless pollards with split trunks and wind-pruned terminal twigs."""
    rng=p.rng
    bark=rng.choice([(36,32,42),(37,38,47),(43,37,44)])
    def limb(x,y,length,angle,radius,depth):
        endx=x+math.sin(angle)*length
        endy=y-math.cos(angle)*length
        midx=(endx+x)/2+length*.12
        midy=(endy+y)/2
        p.poly([(x-radius,y),(x+radius,y),(midx+radius*.55,midy),
                (endx+radius*.42,endy),(endx-radius*.42,endy),(midx-radius*.55,midy)],bark)
        p.line([(x-radius*.6,y),(midx-radius*.4,midy),(endx,endy)],colour(bark,20),radius*.3)
        if depth:
            limb(endx,endy,length*rng.uniform(.65,.79),angle-.12+rng.uniform(-.36,.42),radius*.54,depth-1)
            limb(midx,midy,length*rng.uniform(.51,.67),angle+rng.choice([-1,1])*rng.uniform(.54,1),radius*.45,depth-1)
    for side in (-1,1):
        p.poly([(x-3,y-2),(x+2,y-2),(x+side*h*.17,y+2),(x+side*h*.09,y+2.5)],bark)
    limb(x,y,h*.39,-.23,h*.042,5)


def range_ridges(p,gy):
    for i,(rise,base) in enumerate([(.37,(106,83,100)),(.28,(73,70,92)),(.19,(49,57,75))]):
        rng=p.rng
        pts=[]
        for x in range(-16,p.w+24,8):
            fold=abs(math.sin(x/(68-i*9)+i*.78))**.69
            y=gy*(1-rise)+30*fold+14*math.sin(x/(82+i*13)+i)+rng.uniform(-3,3)
            pts.append((x,y))
        p.poly(pts+[(p.w,p.h),(0,p.h)],base)
        for j,(x,y) in enumerate(pts[:-1]):
            xx,yy=pts[j+1]
            toe=(xx+9+rng.uniform(-7,22),max(yy,y)+rng.uniform(12,39))
            tone=colour(base,8 if yy>y else -5)
            p.poly([(x,y),(xx,yy),toe],tone)
            if j%3==0 and yy>y:
                p.line([(x,y+.7),(xx-2,yy+2),(toe[0]-5,toe[1]-5)],colour(base,16),.55)
        # Talus seams cross the drapes near their feet.
        for _ in range(p.w*3):
            j=rng.randrange(len(pts)); x,y=pts[j]; k=rng.uniform(3,36)
            x+=rng.uniform(-4,5)+k*.3; y+=k
            p.line([(x,y),(x+4.8,y-1.2),(x+7,y-1.4)],colour(base,rng.uniform(-3,6)),.5)


def rock(p,x,y,w,h,c):
    """One weathered slab. Parallel bedding planes tie the small facets together."""
    rng=p.rng
    pts=[(x-w*.56,y-h*.15),(x-w*.35,y-h*.64),(x+w*.27,y-h*.84),
         (x+w*.55,y-h*.56),(x+w*.37,y-h*.06),(x+w*.03,y+h*.15),(x-w*.42,y+h*.20)]
    p.poly(pts,colour(c,-13))
    p.poly(pts[0:4]+[(x+w*.05,y-h*.31)],colour(c,13))
    p.poly([pts[3],pts[4],pts[5],(x+w*.05,y-h*.31)],colour(c,-3))
    p.line([pts[1],(x-w*.14,y-h*.71),pts[2]],colour(c,28),.7)
    if w>11:
        p.line([(x-w*.44,y),(x-w*.04,y-h*.14),(x+w*.12,y-h*.24)],colour(c,1),.8)
        if rng.random()<.5:
            p.line([(x-w*.21,y-h*.58),(x-w*.08,y-h*.48),(x+w*.03,y-h*.51)],colour(c,5),.6)


def field(p,gy):
    r=p.rng
    w,h=p.w,p.h
    horizon=lambda x:gy-28+math.sin(x*.017)*7+math.sin(x*.047)*3
    mask=Image.new('L',p.image.size)
    ridge=[(x,horizon(x)) for x in range(-2,w+4,2)]
    ImageDraw.Draw(mask).polygon(p.xy(ridge+[(w,h),(0,h)]),fill=255)
    # Wet, iron-bearing shale. The long grain runs across, then up, the slope.
    texture=noise(p.image.size,(6,31),r)
    material=ImageOps.colorize(texture,(24,29,44),(119,103,100),mid=(59,60,71))
    p.image.paste(material,mask=mask)
    for _ in range(w*10):
        x=r.uniform(-8,w+7); y=r.uniform(gy-35,h+5)
        if y<horizon(x)+1: continue
        c=material.getpixel((max(0,min(w*S-1,int(x*S))),max(0,min(h*S-1,int(y*S)))))
        dx=r.uniform(2,14)
        p.line([(x,y),(x+dx*.6,y-.7),(x+dx,y-2.1)],colour(c,r.uniform(-13,10)),r.uniform(.4,.85))
    for _ in range(w):
        x=r.uniform(-12,w+12); y=r.uniform(gy-5,h+12)
        if math.sin(x/53+y/73)+math.cos(x/81-y/51)>.65: continue
        width=r.uniform(2.5,19)
        rock(p,x,y,width,width*r.uniform(.30,.58),colour((64,64,74),r.uniform(-9,10)))


def ravine(p,gate,bridge):
    """A continuous cliff on the castle side, runoff below, a ragged near bank."""
    r=p.rng
    gx,gy=gate; bx,by=bridge
    def lip(x):
        d=x-bx
        return by-18+.048*d+9*math.sin(d/46)+3.5*math.sin(d/15)+2*math.sin(d/5.4)
    def depth(x):
        return 31+7*math.sin(x*.031)+4*math.sin(x*.13)
    high=[]; low=[]; rim=[]
    for x in range(-8,p.w+12,3):
        y=lip(x)
        high.append((x,y)); low.append((x+5,y+depth(x)))
        rim.append((x+8,y+depth(x)+18+5*math.sin(x*.045)))
    p.poly(high+rim[::-1],'#303446')
    # Rain-wet cliff fluting and bedding running into the black water.
    for j in range(len(high)-1):
        x,y=high[j]; xx,yy=high[j+1]
        shade=r.uniform(-7,8)+7*math.sin(x*.092)
        p.poly([(x,y),(xx,yy),low[j+1],low[j]],colour((54,51,64),shade))
        if j%3==0:
            p.line([(x,y+2),(x+5,y+depth(x)*.42),(x+3,y+depth(x)*.65)],colour((76,72,84),shade),1.25)
        if j%2==0:
            rock(p,x,y+1,r.uniform(6,16),r.uniform(3,7),colour((83,79,88),shade))
    p.poly(low+rim[::-1],'#354b60')
    for (x,y),(_,z) in zip(low,rim):
        for j in range(4):
            yy=r.uniform(y,z)
            warm=max(0,1-abs(x-bx)/57)
            c=rgb((89,111,130),(196,136,99),warm*.66)
            p.line([(x,yy),(x+r.uniform(1,8),yy-.5)],colour(c,r.uniform(-18,9)),.55)
    for j,(x,y) in enumerate(rim):
        if j%2==0: rock(p,x,y,9+r.random()*13,4+r.random()*4,(63,64,76))
    # Columnar crag toes and joints leave an irregular foundation beneath the wall.
    crown=gy-2
    # Block fields form in groups. The long, tilted bedding differs on either
    # side of each joint; it does not read as a neat course of foundation stone.
    x=-20
    while x<p.w+14:
        width=r.uniform(18,54)
        ridge=crown+8*math.sin(x*.041)+5*math.sin(x*.083)
        h=min(max(6,lip(x)-ridge-4),r.uniform(12,35))
        top=[(x-4,ridge+3),(x+width*.23,ridge-3),(x+width*.66,ridge-6),
             (x+width*.89,ridge-4),(x+width,ridge-2)]
        foot=[(x+width-5,ridge+h*.83),(x+width*.66,ridge+h*.9),
              (x+width*.47,ridge+h+2),(x+width*.28,ridge+h*.87),(x-8,ridge+h)]
        base=colour((62,59,70),r.uniform(-6,8))
        p.poly(top+foot,base)
        for _ in range(round(width*.7)):
            dx=r.uniform(1,width-2); yy=r.uniform(0,h)
            p.line([(x+dx, ridge+yy),(x+dx+r.uniform(1,6),ridge+yy-r.uniform(.4,2.2))],
                   colour(base,r.uniform(-12,15)),r.uniform(.45,1.1))
        p.poly(top+[(x+width*.62,ridge+.5),(x+width*.23,ridge+2),(x-4,ridge+6)],colour(base,23))
        p.line(top[1:4],colour(base,40),.9)
        for _ in range(3):
            dx=r.uniform(0,width); z=r.uniform(3,h*.65)
            p.line([(x+dx,ridge+z),(x+dx+4,ridge+z-1),(x+dx+9,ridge+z-1.4)],colour(base,17),.7)
        for _ in range(4):
            rock(p,x+r.uniform(0,width),ridge+h+r.uniform(-2,2),r.uniform(3,13),r.uniform(2,5),base)
        x+=width*.92
    # Pale streams of rain cut the vertical rock. Broad wet stains surround
    # the narrow white water, and the ends dissipate in broken foam.
    for center in (p.w*.065,p.w*.56,p.w*.93):
        for j in range(r.randrange(4,9)):
            x=center+r.gauss(0,2); top=lip(x)+4; height=depth(x)*r.uniform(.68,1.05)
            start=(x,top); middle=(x+2,top+height*.49); end=(x+4,top+height)
            c=r.choice(['#697588','#9093a0','#707a8b','#646d81'])
            p.line([start,middle,end],c,r.uniform(.5,1.3))
            p.line([(end[0]-2,end[1]),(end[0]+5,end[1]+.3)],'#89909b',.7)
    return lip


def bollard(p,x,y,lit):
    p.poly([(x-3,y+1),(x-3,y-9),(x-1,y-11),(x+3,y-10),(x+3,y)],'#414756')
    p.line([(x-2,y-9),(x-2,y-1)],'#96919a',1)
    p.oval(x,y-10,3.8,1.3,'#ad9d91')
    if lit:
        p.poly([(x-4,y-12),(x+4,y-12),(x+2,y-9),(x-1,y-9)],'#735953')
        p.poly([(x-2.4,y-12),(x-2,y-17),(x,y-15),(x+1.8,y-21),(x+2.8,y-12)],'#ffa348')
        p.line([(x,y-12),(x+1,y-16)],'#fff4ae',1.4)


def battered_tower(p,x,y,size,intact):
    """An oval outer drum in perspective, with broken merlons, courses and slits."""
    r=p.rng; w=size; h=size*(1.8 if intact else 1.2); top=y-h
    p.oval(x+2,y+2,w+2,w*.4,'#3d3c48')
    p.oval(x,y,w,w*.40,'#414451')
    p.poly([(x-w,y),(x-w*.82,top),(x+w*.82,top),(x+w,y)],'#535460')
    for j in range(7):
        t=j/7; yy=y-h*t
        a=w*(1-.18*t)
        for k in range(8):
            f=k/8; ang=math.pi*f; ang2=math.pi*(k+1)/8
            px=x-a*math.cos(ang); qx=x-a*math.cos(ang2)
            z=yy+math.sin(ang)*a*.30; zz=yy+math.sin(ang2)*a*.30
            c=colour((93,88,91),27*math.cos(ang+.66)+r.uniform(-9,6))
            p.poly([(px,z),(qx,zz),(qx,zz-h/7+.5),(px,z-h/7+.5)],c)
            if (k+j)%2: p.line([(px,z),(px,z-h/7)],colour(c,-17),.6)
    p.oval(x,top,w*.85,w*.33,'#938b8c')
    p.oval(x,top,w*.66,w*.22,'#373947')
    for j in range(9):
        a=math.pi*2*j/9
        if not intact and j in (2,3,4,7): continue
        xx=x+w*.75*math.cos(a); yy=top+w*.25*math.sin(a)
        p.poly([(xx-1.7,yy+.9),(xx-1.7,yy-3.9),(xx+1.7,yy-4.5),(xx+2,yy-.1)],'#666370')
        p.line([(xx-1.7,yy-3.9),(xx+1.7,yy-4.5)],'#b5a9a0',.75)
    p.poly([(x-2,y-h*.4),(x-1.7,y-h*.75),(x,y-h*.81),(x+1.6,y-h*.75),(x+1.6,y-h*.4)],'#282b36')
    if intact:
        p.line([(x-.6,y-h*.68),(x-.6,y-h*.48)],'#e4a45e',1)


def broken_ward(p,x,y,width,height):
    """A roofless ward with vacant lancets looking through to the terrain."""
    r=p.rng
    bounds=(round(width+16),round(height+19))
    wall=Plate(bounds)
    def level(u):
        return 5+4*u+10*math.sin(u*math.pi)**2+6*math.sin(u*13)**2
    foot=height+4
    crown=[(5+u*width,level(u)) for u in [j/24 for j in range(25)]]
    outline=crown+[(5+width,foot-width*.10),(4,foot)]
    wall.poly(outline,'#5b5963')
    mask=Image.new('L',wall.image.size)
    md=ImageDraw.Draw(mask)
    md.polygon(wall.xy(outline),fill=255)
    for j in range(math.ceil(height/4)):
        z=foot-j*4.1
        u=-10 if j%2 else -5
        while u<width+6:
            length=r.uniform(7,13); v=u+length
            start=z-u*.10; end=z-v*.10
            tone=colour((88,85,94),r.uniform(-11,13))
            wall.poly([(u,start),(v-.6,end),(v-.6,end-3.6),(u,start-3.65)],tone)
            wall.line([(u+.7,start-3.55),(v-1.3,end-3.55)],colour(tone,14),.55)
            u=v
    for u in (.24,.53,.79):
        xx=5+u*width; base=foot-4-u*width*.10
        aw=width*.105; ah=height*(.58+.06*math.cos(u*15))
        hole=[(xx-aw,base),(xx-aw,base-ah*.58),(xx-aw*.7,base-ah*.78),
              (xx,base-ah),(xx+aw*.68,base-ah*.79),(xx+aw,base-ah*.58),(xx+aw,base)]
        md.polygon(wall.xy(hole),fill=0)
        wall.line(hole[:-1],'#aaa1a0',1.6)
        for side in (-1,1):
            wall.line([(xx+aw*side,base-3),(xx+aw*side,base-ah*.56)],'#aaa3a2',1)
    wall.image.putalpha(mask)
    wall.line(crown,'#aaa2a0',1.2)
    for u in (.05,.37,.68,.95):
        xx=5+u*width; z=foot-u*width*.10
        wall.poly([(xx-2.5,z),(xx-3.2,z-5),(xx-1.9,z-height*.74),
                   (xx+.5,z-height*.78),(xx+2.1,z-5),(xx+4,z+1)],'#686674')
        wall.line([(xx-3,z-4),(xx-1.8,z-height*.72)],'#a79fa0',.8)
    pool(p,x+width*.52,y-width*.04,width*.69,9,(28,29,42),145)
    p.composite(wall.image,x,y-foot)


def wreck(p,x,y,s):
    """Timber frame of a broken handcart, half sunk beside the abandoned ward."""
    def pt(a,b): return (x+a*s,y+b*s)
    for a,b in [(-5,-4),(3,-2),(10,0)]:
        p.line([pt(a-9,b-1),pt(a+5,b-7)],'#4b4148',2.6*s)
        p.line([pt(a-9,b-1.4),pt(a+5,b-7.4)],'#977567',.9*s)
    p.oval(x+4*s,y-2*s,5.2*s,5.8*s,'#483b43')
    for i in range(8):
        a=i*math.pi/4
        p.line([pt(4,-2),pt(4+4.1*math.cos(a),-2+4.65*math.sin(a))],'#907a6b',.8*s)
    p.oval(x+4*s,y-2*s,1.2*s,1.4*s,'#afa198')
    p.line([pt(-6,-2),pt(-21,2)],'#695457',2*s)
    p.line([pt(-5,1),pt(-18,6)],'#76605d',1.5*s)


def ruins(p,pts,turned):
    r=p.rng
    gx,gy=pts[-1]
    for x,y,w,h in ([(286,p.h-135,57,38),(p.w-72,gy+108,48,34),
                        (-12,p.h-42,48,35)] if turned else
                       [(15,p.h-53,87,61),(133,p.h-19,59,40),(325,p.h-68,46,32)]):
        broken_ward(p,x,y,w,h)
        wreck(p,x+w+5,y+3,.8)
    works=([(16,gy+165,13),(p.w-7,p.h-129,21),(24,p.h-39,14)] if turned else
           [(38,p.h-40,26),(153,p.h-56,15),(p.w-39,p.h-40,19)])
    for x,y,s in works:
        y=min(p.h+5,y)
        p.poly([(x-s*2,y+7),(x-s*2,y-3),(x-s*1.6,y-6),(x-s*1.5,y-11),
                (x-s,y-7),(x-s*.5,y-13),(x,y-9),(x,y+5)],'#50535f')
        for k in range(11):
            xx=x-s*2+k*s*.18
            p.line([(xx,y+2),(xx+4,y+1)],'#82818a',.7)
        battered_tower(p,x,y,s,False)
        for _ in range(12):
            xx=x+r.uniform(-1.6,1.6)*s; yy=y+r.uniform(0,.55)*s
            rock(p,xx,yy,r.uniform(2,7),r.uniform(1,4),(71,69,79))
    trees=([(16,p.h-128,86),(51,p.h-15,88),(p.w-34,p.h-169,70),
            (p.w-6,gy+91,45),(37,gy+86,34)] if turned else
           [(4,p.h-63,84),(103,p.h-12,84),(p.w-112,p.h-57,61),(p.w-8,gy+30,36)])
    for x,y,size in trees: bent_tree(p,x,y,size)
    for x,y in ([(60,gy+151),(p.w-58,p.h-70),(99,p.h-105)] if turned else
                [(80,p.h-66),(p.w-60,p.h-60),(p.w-155,p.h-47)]):
        for j in range(6):
            xx=x+j*5.5; yy=y+2*math.sin(j*1.6)-j*.9
            h=r.uniform(9,19)
            p.poly([(xx-1.8,yy+1),(xx-1.6,yy-1),(xx+2,yy-h+2),(xx+3,yy-h-2),(xx+3.4,yy-h+3),(xx+2,yy)],'#453e47')
            p.line([(xx+2.8,yy-h),(xx+.3,yy-1)],'#998075',.75)
        p.line([(x-2,y-4),(x+30,y-9)],'#54494b',2)
    # Impact furrows and the surrounding splinters show the approach has seen a siege.
    for x,y in ([(59,p.h-91),(p.w-88,gy+150),(p.w-40,p.h-36)] if turned else
                [(146,p.h-26),(p.w-142,p.h-117),(p.w-55,p.h-16)]):
        for j in range(9):
            dx=r.uniform(-15,15); dy=r.uniform(-5,5)
            p.line([(x+dx,y+dy),(x+dx+6,y+dy-3),(x+dx+12,y+dy-8)],'#3d3640',1.4)
            p.line([(x+dx+3,y+dy+.7),(x+dx+8,y+dy-4)],'#856c6c',.85)


def pool(p,x,y,rx,ry,tint,alpha):
    box=(round(rx*2*S),round(ry*2*S))
    light=Image.new('RGBA',box)
    draw=ImageDraw.Draw(light)
    draw.ellipse((box[0]*.23,box[1]*.23,box[0]*.77,box[1]*.77),fill=(*tint,alpha))
    light=light.filter(ImageFilter.GaussianBlur(radius=min(box)*.13))
    p.composite(light,x-rx,y-ry)


def waylights(p,turned):
    """Little copper lanterns on cut-stone mileposts give the road a human scale."""
    for x,y in ([(315,936),(155,796),(210,694)] if turned else [(927,173),(855,393),(714,301)]):
        pool(p,x,y,33,14,(232,139,72),92)
        pool(p,x,y-31,12,12,(254,146,56),105)
        p.poly([(x-6,y+1),(x-6,y-4),(x-3,y-6),(x+6,y-5),(x+7,y),(x+3,y+2)],'#555f64')
        p.poly([(x-3,y-5),(x-2,y-22),(x+2,y-23),(x+3,y-5)],'#59646a')
        p.line([(x-2,y-20),(x-3,y-5)],'#969794',1)
        p.poly([(x-4,y-22),(x-4,y-26),(x+4,y-26),(x+4,y-22)],'#9a876c')
        p.poly([(x-3,y-27),(x-4,y-35),(x+4,y-35),(x+3,y-27)],'#433d3e')
        p.poly([(x-2,y-28),(x-2.5,y-33),(x+1,y-33),(x+1.3,y-28)],'#e2b175')
        p.line([(x-.5,y-32),(x-.5,y-29)],'#ffe9b2',1)
        p.poly([(x-5,y-35),(x,y-39),(x+5,y-35)],'#556771')
        p.line([(x-5,y-35),(x,y-39)],'#b3a99b',.7)


def road(p,path,stairs=True,warm=True):
    r=p.rng
    for radius,tone in [(23,(47,45,55)),(20,(69,66,76)),(18,(124,118,123)),(16,(65,70,84))]:
        p.line(path,tone,radius*2)
        for x,y in path[1:-1]:
            p.oval(x,y,radius,radius,tone)
    # Fan-setts in the outside wedge of every bend. Straight courses below
    # extend over the fan where the two roads meet at an acute angle.
    for x,y in path[1:-1]:
        for band,(inner,outer,count) in enumerate([(0,3.3,4),(3.7,7.2,7),(7.7,11.1,11),(11.6,15,14),(15.4,18.3,14)]):
            for j in range(count):
                start=math.tau*(j+.42*(band%2))/count; end=start+math.tau/count
                def knot(radius,angle): return (x+radius*math.cos(angle),y+radius*math.sin(angle))
                tone=(95,99,112) if band<4 else (132,128,133)
                p.poly([knot(inner,start+.025),knot(outer,start+.025),
                        knot(outer,(start+end)/2),knot(outer,end-.027),knot(inner,end-.027)],colour(tone,r.uniform(-11,10)))
                p.line([knot(outer,start+.05),knot(outer,(start+end)/2)],colour(tone,19),.55)
    for i,(a,b) in enumerate(zip(path,path[1:])):
        dx=b[0]-a[0]; dy=b[1]-a[1]; length=math.hypot(dx,dy)
        ux,uy=dx/length,dy/length; nx,ny=-uy,ux
        def xy(s,t):
            return (a[0]+s*ux+t*nx,a[1]+s*uy+t*ny)
        for side in (-1,1):
            for j in range(0,round(length),8):
                c=r.choice(['#7f8587','#8d8c87','#9c9d97','#656e73'])
                end=min(length,j+7.3)
                p.poly([xy(j,15*side),xy(end,15*side),xy(end,18.4*side),xy(j,18*side)],c)
                p.line([xy(j,18*side),xy(end,18.3*side)],'#a4a5a0',.65)
        # Irregular joints and broken highlights in the wheel-worn cobbles.
        for j in range(0,round(length),5):
            n=-15
            while n<15:
                wide=r.uniform(4.5,10); right=min(15,n+wide)
                start=min(length,j+r.uniform(0,1.3)); end=min(length,j+4.9)
                shade=r.uniform(-12,13)
                c=colour((89,95,112),shade)
                if warm and i>=len(path)-3: c=rgb(c,(155,123,102),.39)
                p.poly([xy(start+.2,n+.35),xy(start,right-.5),xy(end-.4,right),xy(end,n+.65)],c)
                if r.random()<.74:
                    p.line([xy(start+.45,n+.5),xy(start+.35,min(right-.3,n+r.uniform(2,6)))],colour(c,r.uniform(12,31)),.65)
                n=right
        # A few bright seams lie in shallow water between the setts.
        if i < len(path)-2:
            for _ in range(int(length/4)):
                ss=r.uniform(0,length); t=r.uniform(-14,14)
                px,py=xy(ss,t)
                p.line([(px-1.2,py),(px+1.9,py-.25)],'#9b9eaf',.45)
    if not stairs:
        return
    # Broad risers and splayed stone cheek walls rise to the keep's door.
    a,b=path[-2:]
    dx,dy=b[0]-a[0],b[1]-a[1]
    length=math.hypot(dx,dy); nx,ny=-dy/length,dx/length
    def q(t,side,z=0):
        return a[0]+t*dx+side*nx,a[1]+t*dy+side*ny-z
    for j in range(14):
        f=j/14; end=(j+1)/14
        p.poly([q(f,-17),q(f,17),q(end,17),q(end,-17)],rgb((106,102,110),(161,130,105),f*.7))
        p.line([q(f,-17),q(f,17)],'#514c5c',2.1)
        p.line([q(f,-16,.9),q(f,16,.9)],'#aea6a4',1)
        split=r.uniform(-10,10)
        p.line([q(f,split),q(end,split)],'#6a6471',.75)
    for side in (-1,1):
        off=side*21
        p.poly([q(0,off),q(1,off),q(1,off,6),q(0,off,6)],'#505263')
        p.line([q(0,off,6),q(1,off,6)],'#c1adb0',2)
        for t in (0,.5,.92):
            x,y=q(t,off)
            bollard(p,x,y,t==0)


def causeway(p,points,depth):
    """Face of the wet viaduct; each cut arch exposes the rock and water behind it."""
    r=p.rng
    p.line(points,'#434350',47)
    for a,b in zip(points,points[1:]):
        dx,dy=b[0]-a[0],b[1]-a[1]; length=math.hypot(dx,dy)
        nx,ny=-dy/length,dx/length; side=1 if ny>0 else -1
        def pos(t,z):
            return a[0]+t*dx+side*21*nx,a[1]+t*dy+side*21*ny+z
        bays=max(1,round(length/28))
        for bay in range(bays):
            t=bay/bays; end=(bay+1)/bays
            # Intrados curves above the tall pier feet, not simply inked arches.
            edge=[]
            for j in range(17):
                u=j/16; arc=min(1,max(0,(u-.13)/.74))
                opening=math.sin(math.pi*arc)**.52
                edge.append(pos(t+(end-t)*u,depth-(depth-5)*opening))
            p.poly([pos(t,0),pos(end,0)]+edge[::-1],'#545263')
            p.line(edge,'#999099',1.6)
            for j in range(2,15,2):
                x,y=edge[j]
                p.line([(x,y),(x+.5,y-3)],'#393b49',.8)
            p.line([pos(t,3),pos(end,3)],'#7f7782',1.2)
            for j in range(3):
                f=t+(end-t)*j/3
                p.line([pos(f,0),pos(f,3)],'#323644',.8)
            rx,ry=pos(t,depth)
            rock(p,rx,ry,9,r.uniform(3,5),(61,61,74))


def barbican(p,pts):
    a,b=pts[-4:-2]
    dx,dy=b[0]-a[0],b[1]-a[1]; length=math.hypot(dx,dy)
    for side in (-1,1):
        x=b[0]-dy/length*29*side; y=b[1]+dx/length*29*side
        battered_tower(p,x,y,8.5,True)
        pool(p,x,y,21,11,(243,126,65),98)
        bollard(p,x,y-17,True)


def fallen_crossing(terrain,gy):
    """The western ward once had a second crossing. Its vault broke at the crown."""
    p=Plate((149,110))
    r=p.rng
    y0=10
    def local(pts):
        return [(x,y+y0) for x,y in pts]
    def face(pts,c): p.poly(local(pts),c)
    def edge(pts,c,w=1): p.line(local(pts),c,w)
    # The opposite pier ends at the waterline. Detached blocks lie where the
    # deck came down. Leave open water under the jagged crown of the near arch.
    for j in range(23):
        x=r.uniform(88,146); y=r.uniform(16,47)
        rock(p,x,y0+y,r.uniform(4,14),r.uniform(2,6),colour((79,72,82),r.uniform(-9,9)))
    face([(117,28),(115,10),(118,9),(117,1),(126,-1),(128,5),(135,4),(138,25)],'#69616d')
    face([(130,5),(141,2),(144,23),(138,27),(130,27)],'#4c4a58')
    edge([(115,12),(128,9),(139,7)],'#a0989d',1.3)
    for y in (15,19,23):
        edge([(117,y),(132,y-2),(141,y-3)],'#4c4956',.85)
    # The remaining voussoirs lean over the gap. The deep side face is visible
    # underneath and the sunken tow-path provides a scale reference.
    intrados=[(38,87),(41,64),(45,50),(51,39),(60,30),(72,22),(88,14)]
    reverse=[(x+9,y-6) for x,y in intrados]
    face(intrados+reverse[::-1],'#393a49')
    for i in range(1,len(intrados)-1):
        edge([intrados[i],reverse[i]],'#6a6471',1)
    front=[(-7,94),(38,87),*intrados[1:],(85,10),(88,8),(78,6),(81,1),(74,2),
           (74,-2),(64,0),(63,-2),(51,1),(46,5),(38,5),(30,9),(24,9),(23,7),(-8,13)]
    # Small isolated texture/mask prevents any course from crossing the open vault.
    block=Plate((106,110)); mask=Image.new('L',block.image.size)
    pts=[(x+10,y+8) for x,y in front]
    ImageDraw.Draw(mask).polygon(block.xy(pts),fill=255)
    block.poly(pts,'#595864')
    for i in range(17):
        y=100-i*7
        xx=-8 if i%2 else -1
        while xx<105:
            ww=r.uniform(7.5,14); hh=r.uniform(5.7,6.45)
            yy=y-xx*.16; end=yy-ww*.16
            tone=colour((100,91,98),r.uniform(-14,11))
            block.poly([(xx,yy),(xx+ww-.7,end),(xx+ww-.7,end-hh),(xx,yy-hh)],tone)
            block.line([(xx+.8,yy-hh),(xx+ww-1,end-hh)],colour(tone,13),.65)
            xx+=ww
    block.image.putalpha(mask)
    p.image.alpha_composite(block.image,(-10*S,round((y0-8)*S)))
    # The voussoir ring is deeper at the springing and thins at its broken tip.
    extrados=[(29,88),(31,61),(35,45),(41,32),(52,22),(65,14),(81,7)]
    for i in range(len(intrados)-1):
        for j in (0,1):
            t=j*.5; end=t+.48
            def along(points,t):
                a,b=points[i:i+2]
                return (a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]))
            quad=[along(intrados,t),along(intrados,end),along(extrados,end),along(extrados,t)]
            face(quad,colour((138,126,126),r.uniform(-15,6)))
            edge(quad[1:3],'#524d59',.9)
            edge(quad[:2],'#bcb0a7',1)
    top=[(-7,13),(23,7),(24,9),(38,5),(46,5),(51,1),(63,-2),(65,0),(74,-2),(74,2),(81,1)]
    face(top+[(x+10,y-7) for x,y in reversed(top)],'#827d84')
    edge(top,'#b2a5a6',1.4)
    # Left buttress, salt tide line, and a snapped iron rail on top.
    face([(-4,87),(-3,29),(3,25),(5,16),(12,13),(14,46),(17,69),(22,74),(22,90)],'#615c67')
    edge([(6,19),(10,18),(10,46),(13,67),(17,70)],'#a79b9d',1.4)
    for j in range(11):
        x=r.uniform(-1,34); y=r.uniform(74,84)
        edge([(x,y),(x+6,y-1.1),(x+8,y-1.1)],'#85818a',.7)
    for x,y in [(4,10),(19,8),(36,5),(51,2)]:
        edge([(x,y),(x-1,y-8),(x-.4,y-11)],'#353945',1.4)
    edge([(4,1),(19,-1),(35,-4),(50,-8),(55,-7),(59,-2)],'#4a434c',1.25)
    face([(17,0),(26,-2),(26,11),(23,9),(22,13),(18,12)],'#4b6178')
    edge([(17,0),(26,-2)],'#b09c80',.9)
    edge([(18,7),(22,9),(25,6)],'#b49a78',.75)
    for j in range(20):
        x=r.uniform(0,44); y=r.uniform(83,95)-x*.12
        rock(p,x,y0+y,r.uniform(3,12),r.uniform(2,6),colour((70,65,75),r.uniform(-7,7)))
    enlarged=p.image.resize((202*S,126*S),Image.Resampling.LANCZOS)
    terrain.image.alpha_composite(enlarged,(-4*S,(gy+17)*S))


def approach_arcade(p,grade):
    """Stepped ashlar vaults brace the quarry road where it descends to the wall."""
    r=p.rng
    # Each bay rests on the same quarry floor. Their varying rise comes from
    # the actual approach grade; a continuous cornice follows the paving.
    for center in (874,899,924,949,974):
        base=306+2.8*math.sin(center/13); top=grade(center)+12
        if top>base-16: continue
        half=11.2
        shadow='#373744'
        p.poly([(center-half-2,base),(center-half-1,grade(center-half)),
                (center+half+1,grade(center+half)),(center+half+2,base-1)],'#66616a')
        rise=base-top
        for row in range(math.floor(rise/6)):
            y=base-row*6
            for j in range(3):
                left=center-half+j*7.5; right=left+7
                z=1.3 if j%2 else -.3
                c=colour((94,87,98),r.uniform(-7,9))
                p.poly([(left,y+z),(right,y+z-1),(right,y+z-5.9),(left,y+z-4.8)],c)
        # Pointed recess, pale stone arch ring and alternating wedge joints.
        def arch(xradius,apex):
            shoulder=top+11
            return [(center-xradius,base),(center-xradius,shoulder),(center-xradius*.85,top+6),
                    (center-xradius*.51,top+2.6),(center,apex),(center+xradius*.51,top+2.6),
                    (center+xradius*.85,top+6),(center+xradius,shoulder),(center+xradius,base)]
        ring=arch(9.5,top-1.6)
        p.poly(ring,'#aaa1a1')
        intrados=arch(7.4,top+1.5)
        p.poly(intrados,shadow)
        p.line(intrados[:4], '#494855',1.2)
        p.line(intrados[4:8],'#706b76',1.4)
        for side in (-1,1):
            for level in range(round(top+13),round(base),6):
                p.line([(center+7.9*side,level),(center+9.8*side,level-.55)],'#585460',.7)
            for dx,dy in ((4,2.2),(7.5,5.3),(8.9,8.6)):
                p.line([(center+dx*side,top+dy),(center+(dx+.9)*side,top+dy-2)],'#665b66',.75)
        x=center+11.5; head=grade(x)+5
        p.poly([(x-2.2,head),(x+1.5,head-1),(x+2.6,base-9),
                (x+4.7,base-6),(x+4.9,base+1),(x-3,base+2)],'#53515f')
        p.line([(x-2.2,head),(x-2.7,base*.7+head*.3),(x-3,base+1)],'#9e98a0',1.2)
        for z in range(round(head+6),round(base),9):
            p.line([(x-2,z),(x+1.7,z-1)],'#706a75',.7)
        for _ in range(9):
            rock(p,center+r.uniform(-12,12),base+r.uniform(-2,3),r.uniform(2.5,8),r.uniform(1,3.7),(71,67,77))
    # Broken corbel courses and a wet, chipped capstone at the top of the flank.
    for x in range(864,966,7):
        y=grade(x)+5; yy=grade(x+6.6)+5
        p.poly([(x,y),(x+6.6,yy),(x+6.6,yy+3.6),(x,y+4)],colour((116,106,112),r.uniform(-11,6)))
        p.line([(x,y),(x+6.6,yy)],'#b4a5a4',.75)


def portrait_wings(p,gy,props):
    """Extend the pigment at the board edges into the phone's non-playable margins.

    Each half has a different shear and rock line. Sampling before the road and
    plinths are painted keeps every playable feature within the simulated board.
    """
    ws=120
    base=Image.new('RGBA',p.image.size)
    with Image.open(OUT/'sky.webp') as sky_plate:
        base.paste(sky_plate.resize((p.w*S,(gy+30)*S),Image.Resampling.BICUBIC),(0,0))
    base.alpha_composite(p.image)
    extension=Plate((ws*2,p.h))
    for i in (0,1):
        mesh=[]
        # The edge itself is pixel registered. At the far margin vary the
        # sampling angle and vertical relief to break mirrored cloud shapes.
        def sample(x,y):
            d=ws-x if i==0 else x
            t=d/ws
            sx=(.55+.16*math.sin(y/79+i*2.4))*d
            sy=y+t*(6*math.sin(y/47+i)-9*math.sin(y/133))+t*t*5
            return ((sx if i==0 else p.w-.25-sx)*S,min(p.h-.25,max(0,sy))*S)
        for y in range(0,p.h,24):
            for x in range(0,ws,15):
                x2=min(ws,x+15); y2=min(p.h,y+24)
                coords=[sample(x,y),sample(x,y2),sample(x2,y2),sample(x2,y)]
                quad=tuple(value for pt in coords for value in pt)
                mesh.append(((x*S,y*S,x2*S,y2*S),quad))
        wing=base.transform((ws*S,p.h*S),Image.Transform.MESH,mesh,Image.Resampling.BICUBIC)
        extension.image.alpha_composite(wing,(i*ws*S,0))
    extension.image.alpha_composite(props.crop((0,0,ws*S,p.h*S)),(0,0))
    extension.image.alpha_composite(props.crop(((p.w+ws)*S,0,(p.w+2*ws)*S,p.h*S)),(ws*S,0))
    for x,y,size in [(35,gy+145,37),(16,930,73),(205,gy+117,43),(199,939,69)]:
        bent_tree(extension,x,y,size)
    for x,y,w,h in [(6,gy+181,45,33),(165,892,56,38)]:
        broken_ward(extension,x,y,w,h)
    for x,y in [(36,gy+167),(23,850),(178,813),(208,940)]:
        for _ in range(14):
            dx=extension.rng.uniform(-21,21); dy=extension.rng.uniform(-4,5)
            rock(extension,x+dx,y+dy,extension.rng.uniform(3,11),extension.rng.uniform(2,6),(65,63,75))
    save(extension.image,'wings',89)


def landscape(turned):
    p=Plate((480,960) if turned else (960,480))
    # The simulation continues beyond the painted approach up the physical
    # stair to the portal. Its penultimate point is the stair foot.
    pts=[(480-q['y'],q['x']) if turned else (q['x'],q['y']) for q in SITE['path'][:-1]]
    # Continue the entry road beyond the frame so the first collector steps
    # onto continuous paving at the exact simulation spawn point.
    x,y=pts[0]; dx=x-pts[1][0]; dy=y-pts[1][1]
    length=math.hypot(dx,dy)
    pts[0]=(x+dx*44/length,y+dy*44/length)
    gx,gy=pts[-1]
    range_ridges(p,gy)
    field(p,gy)
    ravine(p,(gx,gy),pts[-4] if turned else pts[-3])
    if turned:
        # Paint clipped trees and ruined towers in one pass across the board
        # boundary so their portions in the margins have the same geometry.
        props=Plate((p.w+240,p.h))
        props.w=p.w
        props.offset_x=120
        props.rng.setstate(p.rng.getstate())
        ruins(props,pts,True)
        portrait_wings(p,gy,props.image)
        p.image.alpha_composite(props.image.crop((120*S,0,(p.w+120)*S,p.h*S)))
        p.rng.setstate(props.rng.getstate())
    else:
        fallen_crossing(p,gy)
        ruins(p,pts,False)
    # In landscape the entry lane sits high in front of the curtain wall. Its
    # own transparent pass lets both the skyline and its undercroft show through.
    deck=p if turned else Plate((960,480))
    if not turned:
        r=deck.rng
        # The exposed approach is quarried into a continuous rock spur; the
        # retaining piers stand against it all the way down to the moat.
        grade=lambda x:124+(960-x)*1.22+4*math.sin(x/7.8)
        spur=[(x,grade(x)) for x in range(849,967,3)]
        toe=[(x-3,gy+20+3*math.sin(x/14)+r.uniform(-3,4)) for x,y in spur]
        deck.poly(spur+toe[::-1],'#454655')
        for j,(x,y) in enumerate(spur[:-1]):
            xx,yy=spur[j+1]
            ex,ey=toe[j]
            deck.poly([(x,y),(xx,yy),toe[j+1],(ex,ey)],colour((69,66,79),9*math.sin(x*.11)+r.uniform(-5,5)))
            for _ in range(9):
                z=r.uniform(y+2,ey-3)
                deck.line([(x,z),(xx+3,z-2),(xx+6,z-2.7)],colour((79,73,85),r.uniform(-9,12)),r.uniform(.6,1.2))
            if j%3==0:
                rock(deck,x,y+4,r.uniform(10,20),r.uniform(4,9),(83,77,82))
                rock(deck,ex,ey,r.uniform(12,22),r.uniform(4,10),(68,65,75))
        approach_arcade(deck,grade)
        causeway(deck,pts[:5],23)
    causeway(deck,pts[-6:-1],23 if turned else 19)
    road(deck,pts)
    barbican(deck,pts)
    waylights(deck,turned)
    if not turned:
        # The great stair is in the architecture pass. Draw its threshold
        # over the last riser where the diagonal approach meets it head-on.
        deck.poly([(gx-40,gy-29),(gx+40,gy-29),(gx+47,gy+4),(gx-47,gy+4)],(0,0,0,0))
        save(deck.image.crop((512*S,0,p.w*S,p.h*S)),'road-wide',89)
    save(p.image,'portrait' if turned else 'landscape',89)


def siege_skies():
    w,h=900,360
    for name in ('night','dawn'):
        r=random.Random(523 if name=='night' else 525)
        clouds=noise((w,h),(6,12),r)
        grain=noise((w,h),(73,59),r)
        image=Image.new('RGB',(w,h))
        pix=image.load()
        for y in range(h):
            v=y/(h-1)
            for x in range(w):
                u=x/(w-1)
                yy=max(0,min(h-1,round(y+26*math.sin(u*4.1+v*1.7))))
                n=(clouds.getpixel((x,yy))-123)/70
                texture=(grain.getpixel((x,y))-122)/98
                if name=='night':
                    clearing=math.exp(-((u-.72)/.37)**2-((v-.49)/.37)**2)
                    blue=rgb((9,15,30),(76,110,145),clearing)
                    shelf=.34+.17*math.cos(u*5.2)-v*.34
                    shadow=max(0,min(1,(n+shelf)*3.3))
                    colour_at=rgb(blue,(10,17,33),shadow*.87)
                    colour_at=rgb(colour_at,(95,128,154),max(0,.33-abs(n+shelf-.06)*2)*clearing)
                    pix[x,y]=colour(colour_at,texture*5)
                else:
                    heat=math.exp(-((u-.09)/.51)**2-((v-.53)/.15)**2)
                    blue=rgb((34,67,106),(160,186,195),v**.73)
                    colour_at=rgb(blue,(246,181,123),heat*.91)
                    wisps=max(0,n-.12)*math.exp(-((v-.51-.11*math.sin(u*3))/.13)**2)
                    pix[x,y]=colour(rgb(colour_at,(228,205,203),wisps*.52),texture*2)
        save(image.resize((w*2,h*2),Image.Resampling.BICUBIC),'sky-'+name,91)


def distance_to_road(point,path):
    x,y=point
    distance=math.inf
    for (ax,ay),(bx,by) in zip(path,path[1:]):
        dx,dy=bx-ax,by-ay
        t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)))
        distance=min(distance,math.hypot(x-ax-t*dx,y-ay-t*dy))
    return distance


def siege_yard(p,foot,paths,sites,turned):
    """Quarried terraces fan out below the keep, with a dressed centre and loose edges."""
    r=p.rng
    fx,fy=foot
    # Jagged quarry shoulders put the planted wall on a mass of rock.
    for side in (-1,1):
        step=19
        limit=p.w*.52 if turned else 440
        for i in range(round(limit/step)):
            x=fx+side*(47+i*step)
            y=fy-17+16*math.sin(i*.57)+min(i,8)*2.2
            depth=r.uniform(19,51)*(1-i/(limit/step+12)*.36)
            base=colour((53,58,71),r.uniform(-10,11))
            rim=[(x-15,y+2),(x-9,y-10),(x+5,y-14),(x+15,y-5)]
            toe=[(x+17,y+depth*.69),(x+5,y+depth),(x-13,y+depth*.83)]
            p.poly(rim+toe,base)
            p.poly(rim[:3]+[toe[-1]],colour(base,16))
            p.poly(rim[2:]+toe[:2],colour(base,-17))
            p.line(rim[1:3],colour(base,38),1)
            for j in range(8):
                z=r.uniform(2,depth*.74)
                p.line([(x-12,y+z),(x+1,y+z-3),(x+10,y+z-2)],colour(base,r.uniform(-16,17)),.8)
            for _ in range(3):
                rock(p,x+r.uniform(-15,17),y+depth+r.uniform(-4,5),r.uniform(8,24),r.uniform(4,10),base)

    # Worn flags above the ravine, with alternating joints and exposed shale at the edges.
    for row in range(26 if turned else 15):
        y=fy-12+row*(5.7 if turned else 4.9)
        half=38+row*(3.6 if turned else 5.3)
        middle=fx+row*(-2.15 if turned else 3.25)
        for x in range(round(middle-half),round(middle+half),12):
            if r.random()<(abs(x-middle)/half)**3*.72:
                continue
            left=x+(row%2)*6+r.uniform(-1,1)
            c=colour((77,79,83),r.uniform(-15,15))
            p.poly([(left,y),(left+11.4,y-.64),(left+12,y+4),(left+.8,y+4.8)],c)
            p.line([(left+.5,y),(left+10,y-.53)],colour(c,24),.65)
            if r.random()<.22:
                p.line([(left+4,y),(left+5.3,y+2.5),(left+4.6,y+4)],colour(c,-26),.65)

    def clear(x,y,padding=0):
        return (all(distance_to_road((x,y),path)>25+padding for path in paths) and
                all(math.hypot(x-sx,y-sy)>24+padding for sx,sy in sites))

    # Dark rain basins with fractured reflections. Keep the wheel tracks and plinths clear.
    for _ in range(84 if turned else 61):
        x=r.uniform(20,p.w-20); y=r.uniform(fy+28,p.h-8)
        if not clear(x,y,8) or abs(y-fy-88)<15:
            continue
        w=r.uniform(8,28); h=r.uniform(3,8)
        p.oval(x,y,w,h,(48,51,61))
        p.oval(x+1,y-.5,w*.9,h*.75,(43,57,72))
        for j in range(4):
            yy=y+r.uniform(-h*.61,h*.5)
            xx=x+r.uniform(-w*.7,w*.35)
            p.line([(xx,yy),(xx+w*r.uniform(.13,.56),yy-.35)],colour((96,108,117),r.uniform(-28,11)),.55)

    # Place larger props by hand and stop smaller scatter at the playable edges.
    positions=([(68,674),(245,625),(435,699),(518,818),(331,883),(586,915)] if turned else
               [(442,363),(536,407),(671,398),(732,447),(897,462),(959,401)])
    for i,(x,y) in enumerate(positions):
        if not clear(x,y,9):
            continue
        pool(p,x,y,36,12,(24,25,37),155)
        if i%3==1:
            wreck(p,x,y,1.35)
        elif i%3==2:
            for j in range(6):
                xx=x+j*6-15; yy=y+j*.6
                p.line([(xx-2,yy),(xx+3,yy-r.uniform(9,21))],'#75645f',2.2)
            p.line([(x-15,y-5),(x+17,y-6)],'#544545',2.5)
        else:
            pool(p,x,y,40,15,(241,124,49),105)
            p.poly([(x-4,y),(x+4,y),(x+2,y-10),(x-2,y-10)],'#5d535b')
            p.oval(x,y-13,8,3,'#8d6761')
            p.poly([(x-6,y-13),(x-3,y-22),(x-1,y-17),(x+2,y-26),(x+5,y-16),(x+6,y-13)],'#e7914d')
            p.line([(x-2,y-13),(x+1,y-18),(x+2,y-13)],'#ffe0a0',1.6)


def castle_contact(p, foot, turned, plates):
    """Project the rendered rock toe over the painting, at the game's scale."""
    layout = 'portrait' if turned else 'landscape'
    plate = 'gate' if turned else 'gate-wide'
    width, height = (730, 475) if turned else (1150, 312)
    anchor = json.loads((ROOT / 'src/game/keep/projection.json').read_text())[layout]['foot']
    left = foot[0] - width * anchor[0] / 1280
    top = foot[1] - height * anchor[1] / 960
    with Image.open(plates / f'{plate}.webp') as image:
        alpha = image.getchannel('A').resize((width, height), Image.Resampling.BILINEAR)
    toes = []
    for x in range(max(0, math.ceil(left)), min(p.w, math.floor(left + width))):
        column = alpha.crop((int(x - left), 0, int(x - left) + 1, height))
        opaque = column.point(lambda value: 255 if value > 207 else 0).getbbox()
        if opaque:
            toes.append((x, top + opaque[3]))
    return [(x, median([y for _, y in toes[max(0, i-3):i+4]])) for i, (x, _) in enumerate(toes)]


def seat_castle(p, toes):
    """Let the rock's lower folds continue into wet shale and loose talus."""
    mask = Image.new('L', p.image.size)
    draw = ImageDraw.Draw(mask)
    for depth, opacity in [(66,20), (48,34), (30,53), (18,82), (9,118)]:
        draw.polygon(p.xy([(x,y-23) for x,y in toes] + [(x,y+depth) for x,y in reversed(toes)]), fill=opacity)
    mask = mask.filter(ImageFilter.GaussianBlur(7*S))
    damp = ImageOps.colorize(ImageOps.grayscale(p.image), (16,23,34), (131,126,137))
    p.image.paste(damp, mask=mask)

    # Keep the nearer facets broad and leave gaps of painted ground between
    # them. The same slate grays turn gradually back into the ravine palette.
    flakes = Plate((p.w,p.h))
    r = flakes.rng
    for i in range(0,len(toes),17):
        x,y = toes[i]
        for reach, length, height, light in [(4,29,15,0), (14,24,11,8), (26,14,7,13)]:
            xx=x+r.uniform(-8,8)
            yy=y+reach+r.uniform(-3,5)
            rock(flakes,xx,yy,r.uniform(.6,1.35)*length,height,colour((40,45,55),light+r.uniform(-9,9)))
    rgba = flakes.image
    soft = rgba.filter(ImageFilter.GaussianBlur(.58*S))
    p.image.alpha_composite(Image.blend(rgba,soft,.72))


def wall_shadow(p, toes):
    """Darkest where the wall meets the rock, softer across the landing."""
    shade = Image.new('L',p.image.size)
    draw = ImageDraw.Draw(shade)
    for reach, strength in [(22,44), (12,87), (6,158)]:
        draw.polygon(p.xy([(x,y-9) for x,y in toes]+[(x+2,y+reach) for x,y in reversed(toes)]),fill=strength)
    shade = shade.filter(ImageFilter.GaussianBlur(3.2*S))
    p.image.paste((15,21,31,255),mask=shade)


def siege_ground(turned, castle_plates=OUT):
    # Portrait includes the margins on the same plate so west-road paving can
    # straddle the display edge without an obvious seam against the canyon.
    p=Plate((720,960) if turned else (960,480))
    def point(q):
        return (600-q['y'],q['x']) if turned else (q['x'],q['y'])
    east=list(map(point,SITE['path'][:-1]))
    branch=SITE['otherRoads'][0]
    west=list(map(point,branch['approach']))+[east[branch['joinIndex']]]
    start,following=east[:2]
    east[0]=tuple(a+(a-b)*.7 for a,b in zip(start,following))
    # A short continuation runs out past the west spawn without widening the path in play.
    west.insert(0,(west[0][0]-38,west[0][1]+35) if turned else (west[0][0]-29,west[0][1]+51))
    sites=[point({'x':s['col']*32+16,'y':s['row']*32+16}) for s in SITE['buildSites']]
    foot=east[-1]
    range_ridges(p,foot[1]+12)
    field(p,foot[1])
    ravine(p,foot,east[-4] if turned else east[-3])
    siege_yard(p,foot,[east,west],sites,turned)
    if not turned:
        fallen_crossing(p,foot[1]-27)
        ruins(p,east,False)
    else:
        for x,y,w,h in [(12,731,58,52),(512,796,65,51),(24,898,62,49),(600,907,69,47)]:
            broken_ward(p,x,y,w,h)
            wreck(p,x+w+13,y+6,1.18)
            bent_tree(p,x+w-4,y-9,63)
    toes = castle_contact(p,foot,turned,castle_plates)
    seat_castle(p,toes)
    # The two decks join as one surface. In wide view the eastern span is a
    # low, open causeway, with the curtain wall visible between its piers.
    causeway(p,west[1:],24 if turned else 16)
    causeway(p,east[:5],24 if turned else 17)
    causeway(p,east[-6:-1],28 if turned else 18)
    road(p,west,stairs=False,warm=False)
    road(p,east)
    wall_shadow(p,toes)
    lamps=( [(400,930),(311,830),(329,704),(183,653),(135,734),(275,579),(431,776)]
            if turned else [(903,184),(925,357),(810,448),(588,460),(677,439),(701,323),(635,347)] )
    for x,y in lamps:
        pool(p,x,y,27,11,(239,142,66),110)
        pool(p,x,y-18,15,14,(255,139,62),100)
        bollard(p,x,y,True)
    save(p.image,'siege-portrait' if turned else 'siege-wide',90)
    if not turned:
        # Where the road bends around the eastern spur, only the narrow deck
        # passes in front of the curtain. The old tall retaining arcade is gone.
        deck=Plate((960,480))
        causeway(deck,east[:5],12)
        road(deck,east[:5],stairs=False,warm=False)
        box=(832*S,96*S,960*S,320*S)
        over=deck.image.crop(box)
        alpha=over.getchannel('A')
        fade=Image.new('L',over.size)
        for yy in range(over.height):
            strength=round(255*max(0,min(1,(310-yy/S-96)/49)))
            ImageDraw.Draw(fade).line([(0,yy),(over.width,yy)],fill=strength)
        over.putalpha(ImageChops.multiply(alpha,fade))
        save(over,'siege-east-deck',91)


def blockade():
    """The unused approach ends at a rockfall and a fallen timber cross brace."""
    p=Plate((128,96))
    pool(p,64,78,56,15,(18,22,32),177)
    for j in range(26):
        xx=p.rng.uniform(35,92); yy=76+p.rng.uniform(-8,8)
        size=p.rng.uniform(8,23)
        rock(p,xx,yy,size,size*p.rng.uniform(.42,.69),(87,91,102))
    for points in [[(40,56),(87,78)],[(41,78),(85,53)]]:
        p.line(points,'#392e35',8)
        p.line([(x,y-1.7) for x,y in points],'#ac7956',2.7)
        a,b=points
        for t in (.18,.72):
            xx=a[0]+(b[0]-a[0])*t; yy=a[1]+(b[1]-a[1])*t
            p.oval(xx,yy,1.4,1.4,'#d5a36f')
    save(p.image,'siege-blockade',93)


def gate_atlas(frames,output):
    """Pack the four transparent Blender plates, preserving their registration."""
    with Image.open(frames[0]) as first:
        width,height=first.size
    atlas=Image.new('RGBA',(2*width,2*height))
    for i,frame in enumerate(frames):
        with Image.open(frame) as plate:
            atlas.paste(plate,((i%2)*width,(i//2)*height))
    atlas.save(output)


def flats():
    # Uneven spectral bands for fast foreground fog and optically soft cloud veils.
    for name,w,h,freq in [('mist',960,168,(3,4)),('drift',1320,308,(4,6))]:
        rng=random.Random(w)
        turbulence=noise((w,h),freq,rng)
        tex=Image.new('RGBA',(w,h))
        pixels=tex.load()
        for yy in range(h):
            y=yy/h*2-1
            for xx in range(w):
                x=xx/w*2-1; n=turbulence.getpixel((xx,yy))/255
                env=max(0,1-x*x)**2*max(0,1-(y+.17*math.sin(x*5))**2)**3
                opacity=round(220*max(0,(n-.30)*2.1)*env)
                c=rgb((18,29,49),(73,86,108),n) if name=='drift' else rgb((113,142,161),(191,204,210),n)
                pixels[xx,yy]=(*c,opacity)
        save(tex,name,86)
    # A wet octagonal plinth with chipped facets and a brass surveyor's cross.
    p=Plate((36,30))
    outer=[(1,11),(6,4),(26,3),(34,9),(34,18),(28,24),(8,25),(1,19)]
    p.poly([(x,y+4) for x,y in outer],'#293740')
    p.poly(outer,'#8a918b')
    inner=[(3,12),(8,6),(26,5),(32,10),(32,17),(26,22),(9,23),(3,18)]
    p.poly(inner,'#435762')
    p.line(outer[:4],'#c5ae7f',1)
    p.oval(18,14,9,6.5,'#948c73')
    p.oval(18,14,7.6,5.3,'#4c6069')
    p.line([(11,14),(25,14)],'#c3b898',1.2)
    p.line([(18,9),(18,19)],'#dbcb9e',1.4)
    for x,y in [(7,9),(28,9),(7,20),(28,19)]:p.oval(x,y,.8,.7,'#c4ab79')
    save(p.image,'plinth',94)
    w=256; t=Image.new('RGBA',(w,w)); pix=t.load()
    for y in range(w):
        for x in range(w):
            dist=math.hypot((x-w/2)/(w/2),(y-w/2)/(w/2))
            a=max(0,1-dist)**3
            pix[x,y]=(255,175+round(65*a),99+round(114*a), round(255*a))
    save(t,'glow',92)


def save(im,name,quality):
    path=OUT/(name+'.webp')
    im.save(path,'WEBP',quality=quality,method=6)
    print(name,im.size,path.stat().st_size)
    half=im.resize((im.width//2,im.height//2),Image.Resampling.LANCZOS)
    half_path=OUT/(name+'-half.webp')
    half.save(half_path,'WEBP',quality=quality,method=6)
    print(name+'-half',half.size,half_path.stat().st_size)


if __name__=='__main__':
    if '--gate-atlas' in sys.argv:
        gate_atlas(sys.argv[2:-1],sys.argv[-1])
    elif '--footing' in sys.argv:
        if len(sys.argv) > 2:
            OUT = Path(sys.argv[2])
            OUT.mkdir(parents=True,exist_ok=True)
        siege_ground(True, OUT)
        siege_ground(False, OUT)
    else:
        OUT.mkdir(parents=True,exist_ok=True)
        if '--siege' not in sys.argv:
            sky(); landscape(True); landscape(False); flats()
        siege_skies()
        siege_ground(True)
        siege_ground(False)
        blockade()
