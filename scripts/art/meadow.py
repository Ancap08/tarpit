"""Meadow entrance, scenery and four game pieces. One Blender unit is one cell."""

import math
import random
from math import cos, pi, sin

import bpy
from mathutils import Vector

TAU = 2 * pi
rng = random.Random(541)
material = None
parent = None

# Model colours are sRGB swatches. Both looks share them and the geometry.
INK = "#28373B"
BIRCH = "#F1C787"
BARK = "#734733"
CEDAR = "#BD7340"
BRASS = "#EAB052"
MOSS = "#719454"
CANNON_SCALE = .81
GOBLIN_SCALE = .95


def mesh(name, verts, faces, color, smooth=False, bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(material(name, color))
    for face in data.polygons:
        face.use_smooth = smooth
    if bevel:
        mod = obj.modifiers.new("Rubbed corners", 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new("Face normals", 'WEIGHTED_NORMAL')
    return obj


def group(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj


def ringbody(name, center, rings, color, sides=18, smooth=True, wobble=.02):
    """Hand-turned elliptical profiles. Each ring is (z, rx, ry, offset_x, offset_y)."""
    verts = []
    x, y, z = center
    for h, rx, ry, dx, dy in rings:
        for i in range(sides):
            a = TAU*i/sides
            r = 1 + wobble*(sin(3*a+.8) + .45*sin(5*a+1))
            verts.append((x+dx+rx*r*cos(a), y+dy+ry*r*sin(a), z+h))
    faces = [tuple(reversed(range(sides)))]
    for j in range(len(rings)-1):
        for i in range(sides):
            a, b = j*sides+i, j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.append(tuple(range(len(verts)-sides,len(verts))))
    return mesh(name, verts, faces, color, smooth)


def peb(name, pos, radii, color, tilt=0):
    # Asymmetric, softly modelled rather than mathematically spherical.
    rx, ry, rz = radii
    obj = ringbody(name,(0,0,0), [(rz*sin(a),rx*cos(a),ry*cos(a),
                    rx*.035*cos(a*2),0) for a in (-1.54,-1.02,-.51,.03,.55,1.05,1.54)],
                   color, 14)
    obj.location = pos
    obj.rotation_euler.z = tilt
    return obj


def box(name, pos, size, color, bevel=.04):
    x,y,z=(s/2 for s in size)
    verts=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),
           (-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    obj=mesh(name, verts, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],
             color, bevel=bevel)
    obj.location=pos
    return obj


def twig(name, a, b, r, s, color, sides=10):
    delta=Vector(b)-Vector(a)
    obj=ringbody(name,(0,0,0),[(0,r*.88,r*.88,0,0),(.018,r,r,0,0),
               (delta.length*.91,s,s,0,0),(delta.length,s*.86,s*.86,0,0)],color,sides)
    obj.location=a
    obj.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    return obj


def line(name, coords, radius, color, cyclic=False):
    data=bpy.data.curves.new(name,'CURVE')
    data.dimensions='3D'
    data.resolution_u=4
    data.bevel_depth=radius
    data.bevel_resolution=2
    data.use_fill_caps=True
    path=data.splines.new('BEZIER')
    path.bezier_points.add(len(coords)-1)
    for p,v in zip(path.bezier_points,coords):
        p.co=v
        p.handle_left_type=p.handle_right_type='AUTO'
    path.use_cyclic_u=cyclic
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.parent=parent
    data.materials.append(material(name,color))
    return obj


def disc(name, radius, height, color):
    return ringbody(name,(0,0,0),[(0,.94*radius,.94*radius,0,0),
             (.025,radius,radius,0,0),(height-.02,radius,radius,0,0),
             (height,.94*radius,.94*radius,0,0)],color,32)


def board():
    box("Studio sweep",(5,3.5,-.61),(200,200,.12),"#234044",.02)
    box("Walnut board",(5,3.5,-.31),(10.04,7.04,.44),"#74482F",.12)
    box("Honey veneer",(5,3.5,-.22),(10.045,7.045,.055),"#C39254",.025)
    box("Earth",(5,3.5,-.117),(10.01,7.01,.15),"#8E6241",.055)
    box("Meadow turf",(5,3.5,-.038),(10,7,.12),MOSS,.055)
    # Billet marks along the plinth, one per column. Front face only.
    for i in range(10):
        box("Inlay",(i+.5,-.02,-.335),(.11,.022,.026),"#CCA36E",.008)
    # Jointed centrelines have quarter-circle fillets; outer and inner lips stay parallel.
    route=[(0,1.5,0)]
    for i in range(1,18):
        route.append((4.23*i/17,1.5,0))
    for i in range(1,16):
        a=pi/2*i/15
        route.append((4.23+.77*sin(a),2.27-.77*cos(a),a))
    for i in range(1,15):
        route.append((5,2.27+(5.23-2.27)*i/14,pi/2))
    for i in range(1,16):
        a=pi/2*(1-i/15)
        route.append((5.77-.77*sin(a),5.23+.77*cos(a),a))
    for i in range(1,18):
        route.append((5.77+(10-5.77)*i/17,6,0))
    def strip(name,width,z,color):
        verts=[]
        for j,(x,y,a) in enumerate(route):
            for sign in (-1,1):
                w=width+.016*sin(j*.77+sign)+.013*cos(j*.35)
                verts.append((x-sign*w*sin(a),y+sign*w*cos(a),z))
        mesh(name,verts,[(i,i+2,i+3,i+1) for i in range(0,len(verts)-2,2)],color)
    strip("Pressed trail edge",.662,.027,"#957442")
    strip("Ochre trail",.625,.041,"#D8AD76")
    # Scattered indentations in the two wheel ruts, and chalky flecks of grit.
    for i,(x,y,a) in enumerate(route[2:-2]):
        if i%3==1:
            for side in (-1,1):
                w=side*(.38+rng.uniform(-.037,.037))
                px,py=x-w*sin(a),y+w*cos(a)
                peb("Cart rut",(px,py,.042),(rng.uniform(.065,.128),.018,.009),
                    "#B98F61",a)
        if i%2==0:
            w=rng.uniform(-.56,.56)
            peb("Grain",(x-w*sin(a),y+w*cos(a),.047),(.030,.023,.012),"#EDD09A",a)
    # Fine partial registration marks, quiet enough to read as meadow between turns.
    for x in range(1,10):
        for y in range(1,7):
            if grass(x,y,.16):
                for dx,dy in ((.10,0),(0,.10)):
                    line("Grid nick",[(x-dx,y-dy,.025),(x+dx,y+dy,.025)],.008,"#65874D")


def grass(x,y,extra=0):
    def dist(ax,ay,bx,by):
        dx,dy=bx-ax,by-ay
        t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)))
        return math.hypot(x-ax-t*dx,y-ay-t*dy)
    return min(dist(0,1.5,5,1.5),dist(5,1.5,5,6),dist(5,6,10,6))>.66+extra


def leaf(name, pos, length, width, angle, rise, color):
    x,y,z=pos
    ux,uy=cos(angle),sin(angle)
    def point(u,v,h):
        return (x+u*ux-v*uy,y+u*uy+v*ux,z+h)
    verts=[point(0,0,0),point(length*.42,width, rise*.48),
           point(length,0,rise),point(length*.45,-width,rise*.53),
           point(length*.43,0,rise*.58+width*.42)]
    return mesh(name,verts,[(0,4,1),(1,4,2),(2,4,3),(3,4,0),(3,2,1,0)],color)


def flora():
    for i in range(105):
        x,y=rng.uniform(.14,9.86),rng.uniform(.15,6.85)
        if not grass(x,y,.17):
            continue
        for j in range(rng.randint(2,4)):
            leaf("Grass blade",(x,y,.024),rng.uniform(.06,.14),.017,
                 rng.uniform(0,TAU),rng.uniform(.05,.14),rng.choice(["#8DA25D","#537D48","#A3AC63"]))
    for x0,y0 in [(1.1,3.15),(3.2,5.7),(7.6,1.7),(8.6,4.6),(3.6,.49)]:
        for i in range(5):
            x,y=x0+rng.uniform(-.29,.29),y0+rng.uniform(-.25,.25)
            if not grass(x,y,.12):
                continue
            h=rng.uniform(.10,.20)
            twig("Flower stem",(x,y,.025),(x+.018,y,h),.012,.008,"#4D7948",6)
            for k in range(5):
                a=k*TAU/5
                peb("Yarrow petal",(x+.018+.040*cos(a),y+.040*sin(a),h),
                    (.043,.029,.018),"#FFF0BF",a)
            peb("Pollen",(x+.018,y,h+.014),(.028,.028,.019),"#F2AD35")


def tree(x,y,scale,variant):
    global parent
    parent=group("Pollarded hornbeam")
    root=parent
    twig("Twisted trunk",(.02,0,.02),(-.05,.02,1.04),.14,.081,BARK)
    clusters=[(-.02,.05,1.53,.47),(-.37,-.05,1.18,.37),(.32,-.10,1.29,.39),
              (.13,.29,1.21,.31),(-.17,-.31,1.1,.29)]
    forest=["#39734E","#448254","#558D51","#66964F","#357652"]
    if variant:
        forest=["#6A903C","#83A24C","#78994A","#5B873D","#93A448"]
    for j,(cx,cy,cz,r) in enumerate(clusters):
        twig("Bough",(-.03,0,.62),(cx,cy,cz),.068,.036,BARK)
        peb("Leaf crown",(cx,cy,cz),(r,r*.87,r*.95),forest[j],j)
        # Individually pinched leaf pairs on the lit cap.
        for k in range(6):
            a=k*2.4+j
            u=r*(.22+.37*(k%3)/2)
            pos=(cx+u*cos(a),cy+u*sin(a),cz+r*.95*math.sqrt(1-(u/r)**2)-.002)
            leaf("Pressed canopy leaf",pos,.12,.034,a+.42,.014,
                 ["#83AB60","#9BAE5C","#719D59"][j%3] if not variant else "#ACB75E")
    root.location=(x,y,.02)
    root.scale=(scale,)*3
    root.rotation_euler.z=variant*1.6
    parent=None


def spruce(x,y,scale):
    global parent
    parent=group("Carved spruce")
    root=parent
    twig("Fir trunk",(0,0,0),(.03,0,1.10),.13,.069,BARK)
    for j,(h,r,height,col) in enumerate([
            (.32,.49,.71,"#386957"),(.62,.42,.66,"#447D60"),(.91,.32,.62,"#538765"),
            (1.15,.22,.56,"#60956C")]):
        verts=[(.025,0,h+height)]
        n=20
        for ring in range(3):
            for i in range(n):
                a=TAU*i/n+j*.64
                tooth=(i%2)*.084
                rad=(r if i%2 else r*.83)*(1,.97,.66)[ring]
                z=(h+tooth,h+.053+tooth,h+.31+tooth*.3)[ring]
                verts.append((rad*cos(a),rad*sin(a),z))
        faces=[tuple(reversed(range(1,n+1)))]
        for row in range(2):
            for i in range(n):
                ia=1+row*n+i
                ib=1+row*n+(i+1)%n
                faces.append((ia,ib,ib+n,ia+n))
        faces += [(1+2*n+i,1+2*n+(i+1)%n,0) for i in range(n)]
        mesh("Fluted bough tier",verts,faces,col,bevel=.024)
    root.location=(x,y,.025)
    root.scale=(scale,)*3
    parent=None


def fence():
    # A short split-rail fence sets off the flower bank; the tops are hand-hewn.
    nodes=[(.64,4.19), (1.33,4.41), (2.02,4.38), (2.67,4.54)]
    for i,(x,y) in enumerate(nodes):
        twig("Cleft fence post",(x,y,.018),(x+.035*(i%2),y+.014,.43+i%2*.056),
             .076,.058,"#865B3A",6)
        if i:
            px,py=nodes[i-1]
            for h in (.16,.31):
                twig("Split rail",(px-.02,py-.026,h+.018),(x+.02,y-.026,h-.018),
                     .035,.030,"#BB9061",6)


def understory():
    # Little vignettes of broad leaves, shoulder stones and fly agarics.
    for cx,cy in [(1.04,5.05),(3.0,.54),(8.58,1.87),(8.27,4.55),(.57,3.01)]:
        for i in range(6):
            a=TAU*i/6+.4
            leaf("Dock rosette",(cx,cy,.030),rng.uniform(.16,.29),.047,a,
                 rng.uniform(.075,.16),["#59824A","#7F9C55","#98AA64"][i%3])
    for cx,cy in [(.82,4.90),(8.49,1.61),(8.88,1.43)]:
        for i in range(2):
            x,y=cx+i*.105,cy+i*.075
            h=.19-i*.062
            twig("Mushroom stalk",(x,y,.026),(x,y,h),.028,.023,"#E9D5AD")
            peb("Vermilion cap",(x,y,h),(.095-i*.026,.089-i*.025,.060-i*.019),"#C45237")
            for j in range(3):
                a=j*2.2
                peb("Cap fleck",(x+.046*cos(a),y+.040*sin(a),h+.041-i*.014),(.015,.014,.010),"#F4DDB3")
    for x,y,r in [(1.52,2.50,.15),(.85,2.77,.10),(2.76,5.65,.24),(2.94,5.82,.13),
                 (7.80,4.85,.18),(7.94,4.84,.09),(9.21,1.36,.15),(3.83,.47,.13)]:
        peb("Weathered flint",(x,y,.045),(r,r*.77,r*.53),"#929180",x+y)


def cave():
    global parent
    parent=group("Spawn adit")
    root=parent
    # Mouth opens east and slightly skyward so the hollow is visible from overhead.
    for x,y,z,rx,ry,rz,col in [(-.04,0,.37,.51,.81,.53,"#56645C"),(.06,.52,.26,.48,.36,.38,"#708071"),
                (.08,-.54,.21,.47,.35,.30,"#7A8375"),(-.14,.16,.60,.37,.56,.40,"#677665")]:
        peb("Shale outcrop",(x,y,z),(rx,ry,rz),col)
    normal=Vector((.47,-.16,.87)).normalized()
    mouth=group("Stone arch")
    mouth.parent=parent
    mouth.location=(.46,-.015,.61)
    mouth.rotation_euler=normal.to_track_quat('Z','Y').to_euler()
    parent=mouth
    peb("Tunnel shadow",(0,0,0),(.55,.47,.10),"#242A2B")
    peb("Tunnel deep",(0,-.042,.060),(.45,.36,.074),"#171D23")
    for i in range(9):
        a=-.05+pi*1.04*i/8
        o=box("Arch voussoir",(.50*cos(a),.41*sin(a),.06),(.20,.20,.15),
              ["#A5A18A","#8D917F","#B4AF95"][i%3],.047)
        o.rotation_euler.z=a
    for s in (-1,1):
        peb("Lantern eye",(s*.088,.015,.140),(.039,.051,.020),"#F3AF44")
    parent=root
    for k in range(7):
        a=k*2.4
        peb("Moss on shale",(-.03+.28*cos(a),.22+.27*sin(a),.89-.04*(k%2)),
            (.18,.12,.055),"#708549",a)
    root.location=(.49,1.50,.024)
    root.rotation_euler.z=-.47
    parent=None


def longbow():
    global parent
    parent=group("Longbow")
    root=parent
    disc("Bow base",.42,.093,"#594737")
    for s in (-1,1):
        for t in (-1,1):
            twig("Splayed oak leg",(s*.245,t*.20,.08),(s*.16,t*.12,.48),.077,.058,CEDAR)
        twig("Truss",(s*.22,-.16,.16),(-s*.16,-.16,.43),.036,.037,BIRCH)
    box("Timber deck",(0,0,.48),(.55,.45,.13),BARK)
    for i in range(4):
        box("Deck plank",((i-1.5)*.126,0,.55),(.119,.44,.042),CEDAR,.012)
    box("Bow stock",(0,-.02,.635),(.12,.73,.12),"#406F64",.037)
    bow=[(-.47,-.12,.68),(-.36,.075,.69),(-.19,.18,.704),(0,.22,.71),
         (.19,.18,.704),(.36,.075,.69),(.47,-.12,.68)]
    line("Amber bow stave",bow,.053,"#DA912C")
    for side in (-1,1):
        line("Taut flax string",[(side*.47,-.12,.68),(side*.25,-.21,.68),(0,-.31,.68)],.017,"#FBE6AF")
    twig("Nocked bolt",(0,-.36,.708),(0,.42,.708),.025,.021,BIRCH)
    mesh("Broadhead",[(-.082,.33,.72),(0,.54,.72),(.082,.33,.72),(0,.37,.775)],
         [(0,1,3),(1,2,3),(2,0,3),(2,1,0)],"#D0E4D7")
    for s in (-1,1):
        leaf("Bolt fletching",(0,-.20,.72),.17,.034,-pi/2+s*.41,.03,"#D4523C")
    parent=None
    return root


def tarpit():
    global parent
    parent=group("Tar Pit")
    root=parent
    disc("Pitch base",.435,.074,"#503C31")
    # Low, open timber crib with a pool of pitch breaking through its front wall.
    ringbody("Pitch-soaked ground",(0,0,.071),[(0,.39,.38,0,0),(.064,.42,.385,0,0)],
             "#5E4836",18)
    for x in (-.31,.32):
        timber=box("Sunken retaining timber",(x,.03,.144),(.105,.57,.104),CEDAR,.022)
        timber.rotation_euler.z=x*.48
        for y in (-.178,.23):
            peb("Iron nail",(x-.01,y,.199),(.020,.021,.011),INK)
    box("Broken rear wall",(0,.295,.145),(.55,.097,.105),BARK,.023)
    for x in (-.26,.27):
        box("Split front wall",(x,-.28,.123),(.135,.088,.079),CEDAR,.021)
    peb("Black pitch",(-.012,-.03,.142),(.335,.33,.052),"#211E27")
    for x,y,rx,ry in [(-.08,-.267,.13,.15),(-.029,-.337,.119,.114),(.071,-.37,.083,.051)]:
        peb("Tar spill",(x,y,.125),(rx,ry,.052),"#211E27")
    # A large collapsed bubble and two curved reflective ridges leave black negative space.
    peb("Tar blister",(-.105,.06,.188),(.087,.082,.050),"#302935")
    for r,off in [(.151,-.01),(.224,.013)]:
        path=[(-.08+r*cos(a),.016+r*.65*sin(a),.188+off*.4)
              for a in (.21,.56,1.1,1.63,2.17,2.51)]
        line("Gloss on a tar ripple",path,.013,"#837886")
    line("Pitch glint",[(-.152,.065,.226),(-.14,.10,.234),(-.109,.113,.231)],
         .013,"#BEAFB0")
    parent=None
    return root


def wolf():
    global parent
    parent=group("Wolf")
    root=parent
    disc("Wolf base",.393,.063,"#655447")
    fur, back, pale="#879CA4","#475D69","#E6D3B5"
    for s in (-1,1):
        for t in (-1,1):
            y=t*.24+s*.078
            twig("Wolf haunch",(s*.128,t*.18,.39),(s*.158,y,.155),.082,.042,fur)
            peb("Paw",(s*.158,y+.025,.126),(.053,.089,.053),pale)
    peb("Loping body",(0,-.016,.395),(.175,.32,.152),fur)
    peb("Saddle fur",(0,-.09,.49),(.133,.22,.085),back)
    # A sweeping brush with a cream tip.
    peb("Brush tail",(.106,-.356,.426),(.099,.223,.093),back,.61)
    twig("Brush tip",(.188,-.469,.434),(.303,-.588,.499),.082,.014,pale)
    peb("Ruff",(0,.178,.49),(.205,.18,.201),pale)
    head_start=set(parent.children)
    peb("Wolf mask",(0,.239,.585),(.19,.179,.145),fur)
    for s in (-1,1):
        ear=[(s*.048,.22,.66),(s*.191,.274,.632),(s*.22,.064,.898),(s*.134,.104,.619)]
        mesh("Pointed ear",ear,[(0,1,2),(1,3,2),(3,0,2),(0,3,1)],back,bevel=.012)
        mesh("Ear lining",[(s*.085,.225,.665),(s*.173,.249,.659),(s*.199,.127,.825)],
             [(0,1,2)],"#BC8F84")
        peb("Dark eye stripe",(s*.13,.345,.62),(.053,.054,.045),INK)
        peb("Amber eye",(s*.143,.374,.644),(.021,.023,.019),"#F3C75F")
    twig("Tapered muzzle",(0,.311,.560),(0,.525,.536),.113,.061,pale,12)
    peb("Wolf nose",(0,.531,.554),(.066,.052,.050),INK)
    head=group("Raised wolf muzzle")
    head.parent=root
    pivot=Vector((0,.19,.53))
    for part in set(root.children)-head_start-{head}:
        part.parent=head
        part.location-=pivot
    head.location=pivot
    head.rotation_euler.x=.23
    # A swept cheek ruff and swept-back ears break the round canine silhouette.
    for side in (-1,1):
        mesh("Cheek tuft",[(side*.115,.25,.62),(side*.19,.23,.59),(side*.244,.10,.53),
                         (side*.14,.17,.52)],[(0,1,2),(0,2,3),(0,3,1),(1,3,2)],pale,bevel=.009)
    parent=None
    return root


def troll():
    global parent
    parent=group("Troll")
    root=parent
    disc("Troll base",.49,.082,"#624733")
    blue,light,shade="#4F8F8E","#76B5A2","#386E72"
    for s in (-1,1):
        peb("Boot",(s*.193,.049,.17),(.133,.188,.099),"#764D37")
        peb("Trouser",(s*.16,-.01,.31),(.137,.14,.21),"#82553C")
    peb("Broad back",(0,-.014,.552),(.332,.22,.278),blue)
    ringbody("Hide belt",(0,0,0),[(.39,.292,.19,0,0),(.46,.322,.209,0,0)],"#674337")
    box("Buckle",(0,.207,.435),(.106,.045,.075),BRASS,.013)
    for s in (-1,1):
        peb("Shoulder",(s*.285,.011,.659),(.171,.17,.153),blue)
        twig("Thick arm",(s*.32,.018,.65),(s*.39,.125,.44+s*.045),.139,.105,blue)
        peb("Knuckles",(s*.39,.146,.434+s*.04),(.12,.13,.112),light)
    head_start=set(parent.children)
    peb("Hunched head",(0,.107,.82),(.232,.209,.189),light)
    for s in (-1,1):
        peb("Troll ear",(s*.22,.091,.834),(.084,.066,.083),blue)
        peb("Amber eye",(s*.105,.271,.845),(.062,.049,.055),"#F4DC8C")
        peb("Pupil",(s*.107,.303,.861),(.030,.025,.034),INK)
        brow=peb("Heavy brow",(s*.105,.257,.891),(.096,.060,.045),shade)
        brow.rotation_euler.y=-s*.24
    peb("Broad jaw",(0,.252,.72),(.194,.12,.093),blue)
    peb("Bulbous nose",(0,.317,.813),(.11,.09,.073),"#96B491")
    for s in (-1,1):
        twig("Ivory tusk",(s*.12,.31,.742),(s*.138,.327,.816),.037,.008,"#F9E6B2")
    # Ridged burnt-orange mohawk runs front to back, unmistakable from overhead.
    for i in range(5):
        peb("Oxide crest",(0,.23-i*.067,.986-.016*abs(2-i)),(.057,.069,.065),"#C3603B")
    head=group("Upturned troll face")
    head.parent=root
    pivot=Vector((0,.08,.77))
    for part in set(root.children)-head_start-{head}:
        part.parent=head
        part.location-=pivot
    head.location=pivot
    head.rotation_euler.x=.69
    twig("Club handle",(-.38,.19,.38),(-.48,-.09,.65),.053,.064,BARK)
    twig("Gnarled cudgel",(-.47,-.06,.62),(-.57,-.34,.86),.095,.119,CEDAR)
    twig("Club rim",(-.53,-.25,.782),(-.543,-.28,.811),.114,.116,"#54473E")
    parent=None
    return root


def assemble(mat, build_goblin, build_cannon):
    global material
    material=mat
    rng.seed(541)
    board()
    cave()
    flora()
    tree(1.30,5.37,1.03,0)
    tree(2.46,6.09,.73,1)
    spruce(8.95,2.09,1.03)
    understory()
    fence()
    for build,x,y,angle in [
        (build_cannon,3.50,3.50,142),(longbow,6.50,3.50,74),(tarpit,6.50,1.50,15),
        (build_goblin,2.01,1.50,-146),(wolf,6.97,6,-102),(troll,5.00,3.86,132)]:
        obj=build(mat) if build in (build_goblin,build_cannon) else build()
        if build in (build_goblin,build_cannon):
            obj.scale=(GOBLIN_SCALE if build==build_goblin else CANNON_SCALE,)*3
        obj.location=(x,y,.046)
        obj.rotation_euler.z=math.radians(angle)
    peb("Cannonball",(2.87,2.70,.65),(.105,.105,.105),"#343944")
