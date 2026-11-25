"""Paint the Old Keep's two approach plates, storm and small atmospheric flats.
Run with python3 and Pillow. Coordinates on the plates are the actual board.
"""
import json
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/keep'
SITE = json.loads((ROOT / 'src/sim/keepSite.json').read_text())
S = 2


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
    w, h = 1440, 800
    rng = random.Random(5101)
    billows = noise((w, h), (4, 9), rng).load()
    image = Image.new('RGB', (w, h))
    pix = image.load()
    for y in range(h):
        v = y/h
        for x in range(w):
            u = x/w
            glow = math.exp(-((u-.49)/.31)**2)
            base = rgb((29,39,66), (159,128,129), v**.72)
            base = rgb(base, (247,176,118), glow*v**1.7*.86)
            # Looking up into the cloud shelf: its sun-facing undersides catch the last light.
            n = billows[x,y]/255
            shelf = .58 + .08*math.sin(u*8-v*2) + .09*v
            mass = max(0,min(1,(shelf-n)*5.7))
            edge = max(0, min(1, 3.2*(billows[x,min(h-1,y+9)]-billows[x,y])/50))
            shadow = rgb((23,32,51),(95,88,108),v)
            shadow = rgb(shadow,(192,143,135),edge*.43+max(0,n-.4)*.32)
            pix[x,y] = rgb(base,shadow,mass)
    save(image, 'sky', 88)


class Plate:
    def __init__(self, size):
        self.image = Image.new('RGBA', tuple(round(n*S) for n in size))
        self.draw = ImageDraw.Draw(self.image)
        self.rng = random.Random(size[0]+511)
        self.w,self.h = size

    def xy(self, points):
        return [(round(x*S),round(y*S)) for x,y in points]

    def poly(self, pts, c):
        self.draw.polygon(self.xy(pts),fill=c)

    def line(self, pts, c, width=1):
        self.draw.line(self.xy(pts),fill=c,width=max(1, round(width*S)),joint='curve')

    def oval(self, x,y,rx,ry,c):
        self.draw.ellipse(self.xy([(x-rx,y-ry),(x+rx,y+ry)]),fill=c)


def tree(p,x,y,h,tone):
    r = p.rng
    p.line([(x,y),(x-1,y-h*.9)],colour(tone,-6),h*.035)
    for i in range(8):
        high=(i+1)/9
        basey=y-h*high
        branch=h*(1-high)*.24
        drift=r.uniform(-.9,.9)
        p.poly([(x+drift,basey-h*.23), (x+branch*.56,basey-h*.08),
                (x+branch,basey+r.uniform(0,2)), (x+branch*.36,basey-1),
                (x+1,basey+2), (x-branch*.85,basey+1), (x-branch*.45,basey-h*.07)],tone)
        p.line([(x+drift,basey-h*.18),(x+branch*.72,basey-1)],colour(tone,10),.7)


def mountain(p,horizon):
    # Several folded ridges disappear into lilac rain behind the white horizon.
    for j, (drop, tone) in enumerate([(91,(137,124,143)),(72,(107,109,135)),(44,(80,90,116)),(18,(58,72,91))]):
        pts=[]
        for x in range(-5,p.w+8,5):
            wave=math.sin(x/(51+j*4)+1.1+j*2)*10+math.sin(x/23+j*2)*5
            relief=drop if p.w==480 else drop*(.68+.32*math.sin(x/263+.54))
            pts.append((x,horizon(x)-relief+wave+p.rng.uniform(-1.2,1.2)))
        p.poly(pts+[(p.w,p.h),(0,p.h)],tone)
        for k in range(1,len(pts)-1):
            x,y=pts[k]
            if k%3==0:
                p.poly([pts[k-1],(x,y),(x+12,y+20),(x+4,y+11)],colour(tone,4))
            if j>=2:
                tree(p,x,y+1,p.rng.uniform(2,6)*(j-1),tone)


def field(p,horizon):
    """Layer wet shale, banks of spruce and wiry grass over ground pigment."""
    r=p.rng
    w,h=p.w,p.h
    pts=[(x,horizon(x)) for x in range(-2,w+5,2)]
    mask=Image.new('L',p.image.size)
    ImageDraw.Draw(mask).polygon(p.xy(pts+[(w,h),(0,h)]),fill=255)
    texture=noise(p.image.size,(9,22),r)
    material=ImageOps.colorize(texture,(28,44,51),(102,114,108),mid=(59,75,76))
    p.image.paste(material,mask=mask)
    for i in range(w*10):
        x,y=r.uniform(-8,w+7),r.uniform(0,h)
        if y<horizon(x)+1: continue
        c=material.getpixel((max(0,min(w*S-1,int(x*S))), max(0,min(h*S-1,int(y*S)))))
        dx=r.uniform(2,12)
        p.line([(x,y),(x+dx*.7,y-.4),(x+dx,y-1.3)],colour(c,r.uniform(-12,9)),r.uniform(.4,1))
    for i in range(round(w*.16)):
        x=r.uniform(-15,w+15); y=horizon(x)+r.uniform(2,37)
        tree(p,x,y,r.uniform(7,24),r.choice([(44,61,75),(51,67,77),(59,74,82)]))
    # Schist breaks into broad slabs and brittle planes, predominantly across the slope.
    for i in range(w//3):
        x,y=r.uniform(-10,w+10),r.uniform(0,h+5)
        # Rock outcrops follow a vein instead of uniformly stippling the ground.
        if math.sin(x/37+y/83)+math.cos(x/71-y/48)>.6: continue
        if y<horizon(x)+20: continue
        a=r.uniform(3,19); b=a*r.uniform(.21,.47)
        if r.random()<.12: a*=1.8; b*=1.7
        shade=r.uniform(-11,10)
        top=colour((87,98,102),shade); left=colour((50,62,72),shade)
        p.poly([(x-a,y+2),(x-a*.6,y-b),(x+a*.75,y-b*1.6),(x+a,y-b*.8),
                (x+a*.55,y+1),(x-a*.7,y+b*.7)],left)
        p.poly([(x-a,y),(x-a*.6,y-b),(x+a*.75,y-b*1.6),(x+a*.3,y-b*.5)],top)
        p.line([(x-a*.57,y-b),(x+a*.75,y-b*1.6)],colour(top,18),.65)
    for i in range(w*3):
        x,y=r.uniform(0,w),r.uniform(0,h)
        if y<horizon(x)+5: continue
        h1=r.uniform(1,4)
        c=r.choice(['#425454','#4c5653','#667268','#757767','#505c60','#655b64'])
        p.line([(x-2,y-h1*.65),(x,y),(x+1,y-h1),(x+.8,y),(x+4,y-h1*.61)],c,.65)
    # Violet heather and russet sedges grow in pockets between runs of exposed bedrock.
    for _ in range(w//4):
        x,y=r.uniform(0,w),r.uniform(0,h)
        if y<horizon(x)+16: continue
        for _ in range(r.randint(2,9)):
            dx=x+r.gauss(0,6); dy=y+r.gauss(0,2)
            p.line([(dx-2,dy-1),(dx,dy),(dx+1,dy-3)],'#4b5850',.85)
            p.line([(dx,dy-1.2),(dx+1.8,dy-3.6)],r.choice(['#8b777e','#81727a','#8f886b','#807765']),.85)
    # Asymmetric woods frame the field. The silhouette tapers toward the gate.
    for x,y,scale in ([(18,527,.84),(467,739,1.1),(-8,855,1.1),(435,417,.6)] if w==480 else
                       [(35,301,.9),(85,414,1.12),(4,445,1.4),(219,284,.75),(935,397,.9)]):
        for j in range(14):
            xx=x+r.uniform(-53,53)*scale; yy=y+r.uniform(-18,18)*scale
            if yy>horizon(xx): tree(p,xx,yy,r.uniform(17,50)*scale,r.choice([(36,51,58),(40,58,64),(43,63,67)]))


def burn(p,turned):
    """A stream undercuts the keep's bedrock and passes under the gate bridge."""
    r=p.rng
    controls=([(0,486),(68,495),(135,456),(201,447),(263,439),(320,420),(418,416),(480,398)]
              if turned else [(0,384),(78,365),(118,338),(233,325),(329,295),(434,284),(510,246),(608,217),(707,200),(770,171)])
    points=[]
    for (x1,y1),(x2,y2) in zip(controls,controls[1:]):
        n=math.ceil((x2-x1)/3)
        for j in range(n):
            f=j/n
            x=x1+(x2-x1)*f
            points.append((x,y1+(y2-y1)*f+1.5*math.sin(x*.09)+.78*math.sin(x*.22)))
    top=[]; bottom=[]
    for x,y in points:
        width=(1-x/p.w)*10+3+1.8*math.sin(x*.06)
        top.append((x,y-width*.3))
        bottom.append((x,y+width*1.42))
    p.poly([(x,y-4-2*math.sin(x*.07)) for x,y in top]+bottom[::-1],'#39434b')
    p.poly(top+bottom[::-1],'#495e68')
    p.line([(x,y+1) for x,y in top],'#83918f',.75)
    for ((x,y),(_,end)) in zip(top,bottom):
        for j in range(2):
            yy=r.uniform(y+1,end)
            c=rgb((94,123,132),(162,134,117),max(0,1-abs(x-(194 if turned else 433))/47))
            p.line([(x,yy),(x+r.uniform(1,7),yy-.25)],colour(c,r.uniform(-19,15)),.65)
        if r.random()<.12:
            w=r.uniform(2.8,7); b=r.uniform(1,3)
            p.poly([(x-w,y),(x-w*.4,y-b),(x+w*.55,y-b*.7),(x+w,y+.4),(x+.5,y+1.1)],'#536469')
            p.line([(x-w*.4,y-b),(x+w*.55,y-b*.7)],'#8d9290',.8)


def waylights(p,turned):
    """Little copper lanterns on cut-stone mileposts give the road a human scale."""
    for x,y in ([(271,849),(73,693),(252,532)] if turned else [(862,192),(713,352),(578,303)]):
        p.poly([(x-6,y+1),(x-6,y-4),(x-3,y-6),(x+6,y-5),(x+7,y),(x+3,y+2)],'#555f64')
        p.poly([(x-3,y-5),(x-2,y-22),(x+2,y-23),(x+3,y-5)],'#59646a')
        p.line([(x-2,y-20),(x-3,y-5)],'#969794',1)
        p.poly([(x-4,y-22),(x-4,y-26),(x+4,y-26),(x+4,y-22)],'#9a876c')
        p.poly([(x-3,y-27),(x-4,y-35),(x+4,y-35),(x+3,y-27)],'#433d3e')
        p.poly([(x-2,y-28),(x-2.5,y-33),(x+1,y-33),(x+1.3,y-28)],'#e2b175')
        p.line([(x-.5,y-32),(x-.5,y-29)],'#ffe9b2',1)
        p.poly([(x-5,y-35),(x,y-39),(x+5,y-35)],'#556771')
        p.line([(x-5,y-35),(x,y-39)],'#b3a99b',.7)


def road(p,path):
    r=p.rng
    p.line(path,'#354449',49)
    p.line(path,'#555d5c',43)
    p.line(path,'#9c9991',36)
    p.line(path,'#475463',32)
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
                c=colour((98,106,116),shade)
                if i>=len(path)-3: c=rgb(c,(141,119,96),.32)
                p.poly([xy(start+.2,n+.35),xy(start,right-.5),xy(end-.4,right),xy(end,n+.65)],c)
                if r.random()<.74:
                    p.line([xy(start+.45,n+.5),xy(start+.35,min(right-.3,n+r.uniform(2,6)))],colour(c,r.uniform(12,31)),.65)
                n=right
    # Gate bridge: its parapets climb diagonally into the gate with the actual path.
    a,b=path[-2:]; dx,dy=b[0]-a[0],b[1]-a[1]; l=math.hypot(dx,dy)
    for side in (-1,1):
        off=(-dy/l*22*side,dx/l*22*side)
        q=lambda t,z:(a[0]+t*dx+off[0],a[1]+t*dy+off[1]-z)
        p.poly([q(0,0),q(1,0),q(1,8),q(0,8)],'#495564')
        p.line([q(0,8),q(1,8)],'#bab7ac',2)
        for j in range(8):
            p.line([q(j/8,2),q(j/8,7)],'#65717e',.65)
        for t in (0,.5,1):
            x,y=q(t,0)
            p.poly([(x-3,y),(x+3,y),(x+3,y-13),(x-3,y-13)],'#637180')
            p.oval(x,y-13,4,1.9,'#b9b4a7')
        # The first bridge pier carries a copper brazier.
        x,y=q(0,16); p.poly([(x-4,y),(x+4,y),(x+2,y+4),(x-2,y+4)],'#654944')
        p.poly([(x-2,y),(x-1,y-5),(x+.4,y-3),(x+2,y-9),(x+2.8,y-1)],'#efae58')
        p.oval(x,y-1,1.4,1.9,'#fff0b8')


def landscape(turned):
    p=Plate((480,960) if turned else (960,480))
    pts=[(480-q['y'],q['x']) if turned else (q['x'],q['y']) for q in SITE['path']]
    def horizon(x):
        if turned: return 369+10*math.sin(x/80)+4*math.sin(x/24)
        ridge=[(-8,224),(140,210),(228,243),(350,218),(450,229),(535,190),
               (615,198),(724,130),(790,160),(861,105),(911,84),(970,82)]
        for (x0,y0),(x1,y1) in zip(ridge,ridge[1:]):
            if x<=x1:
                t=max(0,(x-x0)/(x1-x0))
                return y0+(y1-y0)*t*t*(3-2*t)+3*math.sin(x/16)
        return 80
    mountain(p,horizon); field(p,horizon); burn(p,turned)
    # A low bedrock terrace sits under the outermost courses. Its broken toes
    # bury the curtain wall in the hillside and cast contact shadows by the water.
    gx,gy=pts[-1]
    length=235 if turned else 202
    for dx in range(-length,length,5):
        x=gx+dx
        y=gy-4-abs(dx/length)**1.4*5
        tongue=5+5*math.sin(x*.075)+p.rng.uniform(1,6)
        p.poly([(x-7,y-2),(x+11,y-3),(x+13,y+tongue*.5),(x+4,y+tongue),(x-9,y+tongue+2)],
               p.rng.choice(['#3b484e','#435052','#4c5657']))
        p.line([(x-7,y+tongue*.66),(x+2,y+tongue*.36),(x+7,y+tongue*.4)],'#697172',.8)
    road(p,pts); waylights(p,turned)
    save(p.image,'portrait' if turned else 'landscape',89)


def flats():
    # Uneven spectral bands for fast foreground fog and optically soft cloud veils.
    for name,w,h,freq in [('mist',480,84,(3,4)),('drift',660,154,(4,6))]:
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
                c=rgb((91,107,135),(190,181,177),n) if name=='drift' else rgb((113,142,161),(191,204,210),n)
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
    # A machicolation gallery projects from the gable in the rotated view.
    # Build its hanging stone vault down from the same deck as a wall-walk pad.
    p=Plate((44,64))
    p.poly([(4,8),(39,8),(36,23),(32,27),(30,42),(25,49),(23,58),(20,61),
            (18,51),(13,47),(11,29),(6,22)],'#283342')
    p.poly([(4,9),(18,13),(19,40),(22,55),(18,51),(14,44),(10,28),(5,21)],'#647280')
    p.poly([(18,13),(32,12),(31,35),(24,49),(22,56),(19,40)],'#535b67')
    p.poly([(32,12),(39,8),(36,24),(32,29),(31,39),(25,49),(30,35)],'#394450')
    for j in range(4):
        y=17+j*6
        p.line([(8+j*.9,y),(18,y+3),(31-j*.55,y+2),(36-j*.8,y-1)],'#3e4c5c',.85)
        p.line([(9+j*.9,y+1),(16,y+2.6)],'#84909a',.65)
        for x in ([13,26] if j%2 else [16,21,30]):
            p.line([(x,y-3),(x,y+1)],'#455365',.65)
    p.poly([(21,33),(20.8,23),(23.8,18),(26.8,23),(26.3,32)],'#887b77')
    p.poly([(22,32),(22,23.5),(24,20.5),(25.7,23.5),(25.5,32)],'#293342')
    p.line([(23.8,23),(23.8,29.5)],'#d2ae80',1)
    for x in (8,16,30,37):
        p.poly([(x-2,9),(x+2,9),(x+1,17),(x,20),(x-2,17)],'#6d7380')
        p.line([(x-1.5,10),(x-.8,16)],'#abb1b0',.8)
    p.line([(3,7),(16,11),(30,10),(40,6)],'#ab9e8a',1.4)
    save(p.image,'gallery',92)
    w=128; t=Image.new('RGBA',(w,w)); pix=t.load()
    for y in range(w):
        for x in range(w):
            dist=math.hypot((x-64)/64,(y-64)/64)
            a=max(0,1-dist)**3
            pix[x,y]=(255,175+round(65*a),99+round(114*a), round(255*a))
    save(t,'glow',92)


def save(im,name,quality):
    path=OUT/(name+'.webp')
    im.save(path,'WEBP',quality=quality,method=6)
    print(name,im.size,path.stat().st_size)


if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    sky(); landscape(True); landscape(False); flats()
