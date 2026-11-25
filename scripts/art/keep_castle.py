"""Headless Blender: /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 -P scripts/art/keep_castle.py

Model the Old Keep as a painted miniature. Orthographic plates share the gate's
registration, including a second exposure under a lightning key. No source imagery.
"""
import math
import random
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import render

OUT = HERE.parents[1] / "public/assets/keep"
rng = random.Random(51)
TAU = math.tau
W, H = 1280, 960
materials = {}
geometry = defaultdict(lambda: ([], []))
layer = "far"
plates = {}


def pigment(name, hexcolor, emission=0, metallic=0):
    color = tuple(render.linear(int(hexcolor[i:i+2], 16)) for i in (0, 2, 4))
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = .56
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    else:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        noise = nodes.new("ShaderNodeTexNoise")
        coords = nodes.new("ShaderNodeTexCoord")
        links.new(coords.outputs["Object"], noise.inputs["Vector"])
        noise.inputs["Scale"].default_value = 3.7
        noise.inputs["Detail"].default_value = 3
        ramp = nodes.new("ShaderNodeValToRGB")
        for stop, scale in zip(ramp.color_ramp.elements, (.54, 1.29)):
            stop.color = (*[min(1, c*scale) for c in color], 1)
        links.new(noise.outputs["Fac"], ramp.inputs[0])
        links.new(ramp.outputs[0], shader.inputs["Base Color"])
    materials[name] = material


def poly(points, faces, mat):
    verts, polys = geometry[layer, mat]
    offset = len(verts)
    verts.extend(points)
    polys.extend(tuple(offset+i for i in face) for face in faces)


def panel(points, mat):
    poly(points, [tuple(range(len(points)))], mat)


def block(x,y,z,w,d,h,mat):
    v = [(x+w*a/2, y+d*b/2,z+h*c) for c in (0,1)
         for a,b in ((-1,-1),(1,-1),(1,1),(-1,1))]
    poly(v, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], mat)


def profile(x,y,levels,n,mat,rot=0,aspect=1):
    # Face centred towards camera, so its tracery sits flush on the stone.
    verts = [(x+r*math.sin(rot+TAU*(i-.5)/n), y-r*aspect*math.cos(rot+TAU*(i-.5)/n),z)
             for z,r in levels for i in range(n)]
    faces = [tuple(reversed(range(n)))]
    for j in range(len(levels)-1):
        faces.extend((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for i in range(n))
    faces.append(tuple(range(len(verts)-n,len(verts))))
    poly(verts,faces,mat)


def rod(a,b,r,mat,r2=None,n=6):
    a,b = Vector(a),Vector(b)
    direction = (b-a).normalized()
    side = direction.cross(Vector((0,1,0)))
    if side.length < .01:
        side = direction.cross(Vector((1,0,0)))
    side.normalize()
    up = direction.cross(side)
    verts = [p + radius*(side*math.cos(TAU*i/n)+up*math.sin(TAU*i/n))
             for p,radius in ((a,r),(b,r if r2 is None else r2)) for i in range(n)]
    poly(verts,[tuple(reversed(range(n))),tuple(range(n,2*n))]+
         [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],mat)


def merlons(x,y,z,r,n):
    profile(x,y,[(z-.16,r*.96),(z-.07,r*1.08),(z,r*1.08)],n,"trim")
    for i in range(n):
        a = TAU*i/n
        xx,yy = x+r*.92*math.sin(a),y-r*.92*math.cos(a)
        block(xx,yy,z,r*.32,r*.32,r*.33,"stone")
        block(xx,yy,z+r*.31,r*.36,r*.36,r*.065,"trim")


def face_point(x,y,z,angle,u,v,depth=0):
    return (x+u*math.cos(angle)+depth*math.sin(angle),
            y+u*math.sin(angle)-depth*math.cos(angle),z+v)


def arch(w,h):
    return [(-w/2,0),(w/2,0),(w/2,.64*h),(.455*w,.74*h),
            (.29*w,.86*h),(0,h),(-.29*w,.86*h),(-.455*w,.74*h),(-w/2,.64*h)]


def lancet(x,y,z,w,h,angle=0,glow="amber",tracery=True):
    def shape(width,height,lift,depth,mat):
        panel([face_point(x,y,z,angle,u,v+lift,depth) for u,v in arch(width,height)],mat)
    shape(w*1.31,h*1.12,-h*.045,.013,"trim")
    shape(w*1.13,h*1.045,-h*.014,.024,"ink")
    shape(w*.91,h*.925,.025*h,.036,glow)
    if tracery and h>.60:
        # Honey glass below the transom, a red kite fired into the apex.
        panel([face_point(x,y,z,angle,u*w,v*h,.043) for u,v in
               ((-.36,.08),(.36,.08),(.36,.25),(-.36,.25))],"honey" if glow=="amber" else glow)
        panel([face_point(x,y,z,angle,u*w,v*h,.043) for u,v in
               ((0,.65),(.17,.755),(0,.86),(-.17,.755))],"ruby")
    def line(u,v,U,V,r):
        rod(face_point(x,y,z,angle,u*w,v*h,.045),
            face_point(x,y,z,angle,U*w,V*h,.045),w*r,"iron",n=4)
    if tracery:
        line(0,.01,0,.88,.04)
        for sign in (-1,1):
            line(0,.54,sign*.35,.73,.033)
        line(-.45,.34,.45,.34,.032)
    a,b=[face_point(x,y,z,angle,k*w,0,.046) for k in (-.67,.67)]
    rod(a,b,.05*w,"trim",n=4)


def drum(x,y,base,r,h,n=8,windows=2,stone="stone"):
    profile(x,y,[(base,r*1.08),(base+.16,r),(base+h,r*.97)],n,stone)
    # Individual quarry blocks on the visible facets, coursed around each corner.
    for i in range(n):
        a=TAU*i/n
        if math.cos(a)<-.03:
            continue
        width=2*r*math.sin(math.pi/n)
        for j in range(int(h/.235)):
            v=j*.235+.07
            radius=r*(1-.03*v/h)
            xx=x+math.sin(a)*radius*math.cos(math.pi/n)
            yy=y-math.cos(a)*radius*math.cos(math.pi/n)
            u=-width*.5-(j%2)*width*.22
            while u<width*.48:
                end=min(width*.48,u+width*rng.uniform(.29,.58))
                start=max(-width*.48,u)
                if end-start>.045 and rng.random()<.46:
                    panel([face_point(xx,yy,base+v,a,k,vv,.007) for k,vv in
                           ((start,0),(end,0),(end,.205),(start,.205))],rng.choice(("ash","lichen","stone","slate")))
                u=end+.023
        for tier in range(windows):
            height=min(1.65*r,h/(windows+1)*.81)
            v=h*(tier+.46)/(windows+.20)
            radius=r*(1-.03*v/h)*math.cos(math.pi/n)
            lancet(x+math.sin(a)*radius,y-math.cos(a)*radius,base+v,
                   min(width*.46,r*.47),height,a,rng.choice(("amber","honey","amber","smoke")))
    for v in (.12,h-.21,h-.07):
        profile(x,y,[(base+v,r*.99),(base+v+.04,r*1.035),(base+v+.105,r*1.026)],n,"trim")


def finial(x,y,z,scale):
    rod((x,y,z),(x,y,z+.47*scale),.035*scale,"bronze",.010*scale)
    profile(x,y,[(z+.19*scale,.018*scale),(z+.25*scale,.075*scale),
                 (z+.32*scale,.018*scale)],6,"gold")


def roof(x,y,z,r,h,n=8,ornate=True,metal="verdigris"):
    rings=[(0,1),(.035,1.055),(.085,.86),(.41,.48),(.74,.215),(1,.013)]
    profile(x,y,[(z+t*h,r*s) for t,s in rings],n,metal)
    # Stepped slate laps taper with the ogee. Lead ribs and little gilded knees
    # hold their highlights even where the slate disappears into cloud.
    for j in range(1,max(3,int(h/.25))):
        q=j/max(3,int(h/.25))
        for (t,s),(tt,ss) in zip(rings,rings[1:]):
            if t<=q<=tt:
                rad=r*(s+(ss-s)*(q-t)/(tt-t))
                profile(x,y,[(z+h*q,rad*1.02),(z+h*q+.025,rad*1.03),(z+h*q+.045,rad*.99)],n,
                        "shingle" if j%3 else metal)
                break
    for i in range(n):
        a=TAU*(i-.5)/n
        pts=[(x+r*s*math.sin(a),y-r*s*math.cos(a),z+t*h) for t,s in rings[1:]]
        for p,b in zip(pts,pts[1:]):
            rod(p,b,max(.008,r*.015),"patina" if ornate else "shingle",n=4)
    finial(x,y,z+h,max(.46,r*.7))


def spire(x,y,base,r,shaft,cap,n=8,windows=2,stone="stone",metal="verdigris"):
    drum(x,y,base,r,shaft,n,windows,stone)
    roof(x,y,base+shaft,r*1.21,cap,n,metal=metal)


def pinnacle(x,y,z,r,h):
    profile(x,y,[(z,r),(z+.08,r*1.2),(z+h*.52,r*.80),(z+h*.56,r*.96),
                 (z+h*.61,r*.69),(z+h,.012)],4,"trim",rot=math.pi/4)
    finial(x,y,z+h,.40)


def flying(x,y,z,sign,span,rise):
    # Concave soffit and stepped weathering slope between a tall pier and nave.
    outline=[(0,0),(.15,.08),(.25,.40),(.44,.62),(.72,.79),(1,.83),
             (1,1.08),(.79,.98),(.53,.81),(.28,.58),(0,.40)]
    verts=[(x+sign*u*span,y+d,z+v*rise) for d in (-.13,.13) for u,v in outline]
    count=len(outline)
    poly(verts,[tuple(reversed(range(count))),tuple(range(count,count*2))]+
         [(i,(i+1)%count,count+(i+1)%count,i+count) for i in range(count)],"trim")
    for a,b in zip(outline[6:],outline[7:]):
        rod((x+sign*a[0]*span,y-.13,z+a[1]*rise),(x+sign*b[0]*span,y-.13,z+b[1]*rise),.045,"bone",n=4)


def rose(x,y,z,r):
    def disk(radius, depth, mat):
        panel([(x+radius*math.sin(i*TAU/48),y-depth,z+radius*math.cos(i*TAU/48))
               for i in range(48)],mat)
    def ring(cx,cz,rad,wire,depth,mat,count=32):
        pts=[(cx+rad*math.sin(TAU*i/count),y-depth,cz+rad*math.cos(TAU*i/count)) for i in range(count)]
        for i in range(count):
            rod(pts[i],pts[(i+1)%count],wire,mat,n=5)
    disk(r*1.18,.01,"trim")
    disk(r*1.07,.025,"ink")
    disk(r,.04,"ruby")
    for i in range(10):
        a=i*TAU/10
        def p(rad,angle):
            return (x+rad*r*math.sin(angle),y-.055,z+rad*r*math.cos(angle))
        vertices=[p(.18,a),p(.50,a-.22),p(.85,a-.10),p(.96,a),p(.85,a+.10),p(.50,a+.22)]
        panel(vertices,"amber" if i%2 else "saffron")
        for j in range(6):
            rod(vertices[j],vertices[(j+1)%6],.025*r,"iron",n=4)
        ring(x+.65*r*math.sin(a),z+.65*r*math.cos(a),r*.13,.023*r,.068,"bronze",12)
    ring(x,z,r,.045*r,.065,"bone")
    ring(x,z,r*.255,.04*r,.075,"bronze")
    disk(r*.205,.08,"honey")


def flag(x,y,z,w,h):
    rod((x,y,z-.17),(x,y,z+.12),.029,"gold")
    vs=[(x+w*i/8,y-.12*math.sin(i*.81),z-.045*math.sin(i*.61)-h*j*(1-.34*(i==8)))
        for j in (0,1) for i in range(9)]
    poly(vs,[(i,i+1,i+10,i+9) for i in range(8)],"blue")
    rod((x,y,z+.1),(x,y,z-.53),.022,"bronze")


def clock_gable(x,y,z,w,h,d):
    """The west watch has a saddle roof and twin crocketed gables."""
    half=w/2
    verts=[(x+u,y+v,z+t) for v in (-d/2,d/2)
           for u,t in ((-half,0),(half,0),(0,h))]
    poly(verts,[(0,1,2),(5,4,3),(0,2,5,3),(2,1,4,5)],"verdigris")
    front=y-d/2-.04
    for side in (-1,1):
        points=[(x+side*half,front,z),(x,front,z+h)]
        rod(*points,.071,"trim")
        for j in range(1,6):
            u=j/6
            off=half*(1-u)
            rod((x+side*off,front,z+h*u),(x+side*(off+.059),front,z+h*u+.09),.045,"bone",.014)
        for j in range(1,9):
            u=j/9
            xx=x+side*half*(1-u)
            rod((xx,y-d/2,z+h*u),(xx,y+d/2,z+h*u),.025,"shingle",n=4)
    panel([(x-half*.9,front,z),(x+half*.9,front,z),(x,front,z+h*.9)],"slate")
    # A brass moon dial with hour indices and two black iron hands.
    cz=z+.5
    for rad,depth,mat in ((.35,.015,"trim"),(.30,.032,"bronze"),(.269,.050,"amber")):
        panel([(x+rad*math.sin(i*TAU/32),front-depth,cz+rad*math.cos(i*TAU/32)) for i in range(32)],mat)
    for i in range(12):
        a=i*TAU/12
        rod((x+.218*math.sin(a),front-.063,cz+.218*math.cos(a)),
            (x+.26*math.sin(a),front-.063,cz+.26*math.cos(a)),.012,"iron",n=4)
    rod((x,front-.072,cz),(x-.105,front-.072,cz+.12),.022,"iron",n=4)
    rod((x,front-.072,cz),(x+.155,front-.072,cz+.085),.015,"iron",n=4)
    for yy in (front,y+d/2):
        finial(x,yy,z+h,1.20)


def far():
    for x,y,r,h,cap in [(-7.85,3.4,.69,3.85,2.65),(-6.17,3,.73,5.4,2.95),
                          (-4.65,4,.59,6.7,3.1),(-2.64,3.3,.80,7.05,3.85),
                          (2.38,4.1,.97,8.1,4.05),(4.30,4.35,.54,6.63,2.68),
                          (6.05,3.7,.83,5.76,2.65),(8.17,3.5,.56,4.12,2.07)]:
        spire(x,y,-.5,r,h,cap,7,2,"slate","deep")
    for x in (-5,-1,2,5):
        block(x,3,0,3.6,1.7,3.18,"slate")
        roof(x,3,3.1,1.52,1.61,4,False,"deep")


def crown():
    # Unequal towers give the keep a recognisable skyline. An open bell stage
    # carries a second little roof and the great lantern's many gabled pinnacles.
    x,y=-.52,.72
    drum(x,y,-.35,1.50,8.88,8,3)
    profile(x,y,[(7.79,1.49),(8.02,1.78),(8.24,1.66),(8.39,1.59)],8,"trim")
    drum(x,y,8.36,1.18,1.63,8,1)
    # A flared skirt and recessed, pierced belfry break the outline before
    # the tall topmost spire. Each pillar stands clear of the dark bell.
    roof(x,y,9.89,1.38,.93)
    profile(x,y,[(10.39,.83),(10.50,.91),(10.58,.90)],8,"bone")
    profile(x,y,[(10.55,.42),(10.82,.28),(11.05,.11)],8,"bronze")
    for j in range(8):
        a=TAU*(j-.5)/8
        xx,yy=x+.71*math.sin(a),y-.71*math.cos(a)
        profile(xx,yy,[(10.49,.13),(10.61,.10),(11.04,.081),(11.16,.14)],6,"trim")
    roof(x,y,11.09,.96,1.94)
    for i in range(8):
        a=TAU*i/8
        xx,yy=x+1.43*math.sin(a),y-1.43*math.cos(a)
        pinnacle(xx,yy,7.85,.22,1.72 if i%2==0 else 1.30)
    # The watch tower is square; the old bell and the rose keep distinct
    # silhouettes against its long slate ridge.
    drum(-3.36,.41,-.35,1.37,7.06,4,2)
    clock_gable(-3.36,.41,6.67,2.17,1.93,2.16)
    for side in (-1,1):
        pinnacle(-3.36+side*.95,-.55,6.53,.22,1.04)
    for xx,yy,r,h,cap in [(3.61,.77,1.10,6.87,3.34),
                           (-6.52,.86,.68,4.01,2.15),(6.68,.86,.72,4.85,2.3)]:
        spire(xx,yy,-.35,r,h,cap)
        for side in (-1,1):
            pinnacle(xx+side*.81*r,yy-.45*r,h-.51,.15*r,1.12*r)
    # Chapter house, crossing roof and west front. Independent sloping masonry
    # arches throw the vivid negative spaces between the adjacent spires.
    for xx,sign in [(-5.30,1),(5.59,-1)]:
        drum(xx,-.37,0,.48,4.46,6,1)
        pinnacle(xx,-.37,4.4,.52,1.81)
        flying(xx,.06,3.38,sign,1.38,1.88)
        flying(xx,.06,2.73,sign,1.38,1.38)
    for xx,sign in [(-2.51,1),(2.70,-1)]:
        # The arch springs from the lateral pier, clear of the window face.
        profile(xx,.0,[(3.0,.21),(4.57,.20),(4.74,.25),(4.89,.19)],6,"ash")
        flying(xx,.0,4.77,sign,abs(x-xx)-.88,2.05)
        flying(xx,.0,4.10,sign,abs(x-xx)-.88,1.57)
    block(.38,-.75,-.21,3.39,2.49,4.98,"stone")
    verts=[(xx,yy,zz) for yy in (-2.03,.5) for xx,zz in ((-1.45,4.74),(2.21,4.74),(.38,7.04))]
    poly(verts,[(0,1,2),(5,4,3),(0,2,5,3),(1,4,5,2)],"deep")
    panel([(-1.31,-2.055,4.7),(2.06,-2.055,4.7),(.38,-2.055,6.78)],"stone")
    for side in (-1,1):
        rod((.38+side*1.84,-2.10,4.72),(.38,-2.10,7.03),.105,"bone",n=5)
        pinnacle(.38+side*1.49,-2.07,4.71,.19,1.20)
    rose(.38,-2.072,4.95,.77)
    for i in range(3):
        lancet(-.48+.84*i,-2.01,2.18,.48,1.46,glow=("amber","honey","amber")[i])
    # A pair of steep slate dormers and their inset gold panes break up
    # the right tower roof. Stone ribs follow the arrises of the tall drums.
    for xx,yy,zz,scale in ((3.61,-.37,7.22,.66),):
        panel([(xx-scale*.48,yy,zz),(xx+scale*.48,yy,zz),(xx,yy,zz+scale*1.1)],"trim")
        lancet(xx,yy-.02,zz+.03,.26*scale,.65*scale,glow="honey",tracery=False)
        for sign in (-1,1):
            rod((xx+sign*scale*.53,yy-.02,zz),(xx,yy-.02,zz+scale*1.16),.037,"patina")
    for j in (0,1,7):
        a=TAU*(j-.5)/8
        xx,yy=x+1.46*math.sin(a),y-1.46*math.cos(a)
        rod((xx,yy,3.73),(xx,yy,7.90),.082,"trim",.058,n=5)
    flag(3.61,.77,10.05,.92,.33)
    flag(-3.36,-.67,8.85,.84,.28)


def ashlar_wall(x1,y1,x2,y2,height):
    dx,dy=x2-x1,y2-y1
    span=math.hypot(dx,dy)
    a=math.atan2(dy,dx)
    def pos(u,v,d=0):
        return face_point(x1,y1,-.37,a,u,v,d)
    def course(u1,u2,v1,v2,front,back,mat):
        verts=[pos(u,v,d) for d in (back,front) for u,v in ((u1,v1),(u2,v1),(u2,v2),(u1,v2))]
        poly(verts,[(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(2,3,7,6)],mat)
    course(0,span,0,height,.0,-1.45,"ink")
    for row in range(math.ceil(height/.28)):
        top=min(height,row*.28+.274)
        u=-.42*(row%2)
        while u<span-.02:
            end=min(span,u+rng.uniform(.67,1.02))
            if end>max(0,u)+.02:
                course(max(0,u),end,row*.28,top,rng.uniform(.014,.044),-.03,
                       rng.choice(("stone","stone","ash","slate","lichen")))
            u=end+.015
    course(0,span,height-.24,height-.13,.12,-1.50,"trim")
    course(0,span,height-.12,height,.16,-1.51,"stone")
    for j in range(math.ceil(span/.65)):
        u=(j+.5)*span/math.ceil(span/.65)
        course(u-.185,u+.185,height,height+.33,.13,-.23,"stone")
        course(u-.211,u+.211,height+.29,height+.39,.165,-.26,"trim")
        course(u-.15,u+.15,height,height+.22,-1.19,-1.44,"slate")
    # Blind arcading and carved corbels beneath the wall-walk cast shadows
    # onto the coursed stone. A few arrow slits interrupt the rank.
    for j in range(12):
        u=(j+.5)*span/12
        for k in (-1,1):
            rod(pos(u+k*.22,height-.69,.092),pos(u+k*.19,height-.51,.092),.030,"ash",n=4)
            rod(pos(u+k*.19,height-.51,.092),pos(u,height-.37,.092),.032,"trim",n=4)
        course(u-.067,u+.067,height-.40,height-.23,.16,-.01,"trim")
    for u in (span*.25,span*.70):
        x,y,z=pos(u,.68,.05)
        lancet(x,y,z,.15,.71,a,"smoke",False)


def gate():
    # Curtain and grounded rubble. The path continues directly off the centre stair.
    for s in (-1,1):
        if s<0:
            ashlar_wall(-9.38,-1.53,-1.46,-3.03,2.47)
        else:
            ashlar_wall(1.46,-3.03,9.38,-1.53,2.47)
        # Gun platforms occupy the two low salients of the curtain. A short
        # dogleg stair connects each actual walkable deck to the higher wall.
        xx=s*3.87
        drum(xx,-4.03,-.46,1.0,1.22,8,0)
        profile(xx,-4.03,[(.73,1.03),(.82,1.13),(.94,1.12)],8,"trim",aspect=.92)
        for j in range(10):
            a=TAU*(j+.5)/10
            if math.cos(a)<-.3:
                continue
            bx,by=xx+1.03*math.sin(a),-4.03-.91*math.cos(a)
            block(bx,by,.94,.23,.20,.17,"ash")
        for j in range(8):
            block(xx+s*(.23+j*.095),-3.66+j*.15,.32,.77,.22,.58+j*.15,"slate")
            block(xx+s*(.23+j*.095),-3.71+j*.15,.88+j*.15,.79,.12,.05,"trim")
        for xx in (4.65,8.17):
            yy=-3.03+(xx-1.46)*.19
            drum(s*xx,yy,.0,.55 if xx<5 else .77,2.49 if xx<5 else 2.87,8,1)
            merlons(s*xx,yy,2.48 if xx<5 else 2.86,.58 if xx<5 else .80,10)
        spire(s*1.55,-3.05,-.18,.77,3.49,1.56,8,1)
        for j in range(13):
            xx=2.0+j*.59
            yy=-3.12+(xx-1.46)*.19
            r=rng.uniform(.43,.80)
            profile(s*xx,yy,[(-.62,r*.92),(-.38,r*1.1),(-.11,r*.83),(.04,r*.26)],5,
                    rng.choice(("rock","slate","lichen")),rot=rng.random(),aspect=.65)
    block(0,-2.91,-.27,2.95,1.5,3.49,"stone")
    for zz in (2.8,3.15):
        block(0,-2.91,zz,2.99,1.58,.13,"trim")
    for i in range(7):
        block(-1.30+i*.43,-3.60,3.24,.26,.32,.32,"stone")
    # Deep recessed pointed doorway, concentric carved ribs and wedge voussoirs.
    yf=-3.70
    for w,h,depth,color in [(2.06,3.13,.005,"trim"),(1.83,2.93,.025,"ash"),
                             (1.63,2.75,.045,"bronze"),(1.54,2.70,.059,"ink"),
                             (1.35,2.55,.069,"wood")]:
        panel([(u,yf-depth,v-.16) for u,v in arch(w,h)],color)
    for s in (-1,1):
        for i in range(8):
            block(s*.925,yf-.047,-.15+i*.235,.158,.082,.211,"ash" if i%3 else "bone")
        for i in range(1,5):
            u=i/5
            xx=s*(.92*(1-u)+.015)
            zz=2.01+1.02*(1-(1-u)**1.43)
            block(xx,yf-.058,zz-.08,.17,.078,.14,"bone")
    # The shutter is lifted. Its teeth silhouette against the warm wall
    # inside, the open space underneath stays almost black.
    panel([(u,yf-.071,v-.16) for u,v in arch(1.31,2.45)],"passage")
    # A succession of barrel-vault ribs leads the eye through the grille.
    for w,h,offset,col in ((1.18,2.16,.072,"tunnel"),(.98,1.93,.073,"vault"),
                           (.84,1.72,.074,"tunnel"),(.69,1.54,.075,"vault"),
                           (.56,1.36,.076,"tunnel"),(.43,1.17,.077,"embers")):
        panel([(u,yf-offset,v-.13+(1.3-w)*.16) for u,v in arch(w,h)], col)
    for i in range(-5,6):
        xx=i*.113
        upper=2.28-1.27*abs(xx)**1.55
        tip=.80+.14*abs(xx)
        rod((xx,yf-.094,tip+.14),(xx,yf-.094,upper),.036,"iron",n=4)
        rod((xx,yf-.094,tip+.18),(xx,yf-.094,tip),.063,"iron",.001,n=4)
    for z,w in ((1.11,1.22),(1.47,1.22),(1.80,1.12)):
        block(0,yf-.095,z,w,.053,.083,"iron")
    for i in range(5):
        block(0,yf-.073,-.13+i*.047,1.25-.17*i,.015,.023,"patina")
    for s in (-1,1):
        x=s*1.19
        rod((x,yf,1.31),(x,yf-.29,1.63),.049,"iron")
        profile(x,yf-.29,[(1.55,.055),(1.73,.13),(1.78,.13)],8,"bronze")
        profile(x,yf-.29,[(1.73,.065),(1.87,.095),(2.06,.003)],7,"honey")
        # Crossbar for a runtime hanging banner on the gate towers.
        rod((s*1.58-.25,-3.80,2.89),(s*1.58+.25,-3.80,2.89),.027,"gold")
    for i in range(8):
        block(0,-3.72-i*.155,-.58,1.66+i*.065,.17,.47-i*.048,"ash" if i%2 else "trim")
        block(0,-3.796-i*.155,-.152-i*.048,1.69+i*.065,.045,.045,"bone")
    for s in (-1,1):
        rod((s*.91,-3.77,.18),(s*1.16,-4.87,-.18),.065,"bronze")
        for j in (0,3,7):
            profile(s*(.91+j*.035),-3.77-j*.155,[(-.52,.076),(.18-j*.049,.076)],6,"trim")


def assemble():
    for (name,mat),(verts,faces) in geometry.items():
        mesh=bpy.data.meshes.new(name+" "+mat)
        mesh.from_pydata(verts,[],faces)
        mesh.materials.append(materials[mat])
        obj=bpy.data.objects.new(mesh.name,mesh)
        bpy.context.collection.objects.link(obj)
        plates.setdefault(name,[]).append(obj)


def run():
    global layer
    scene=render.studio("painted",True,"BLENDER_EEVEE_NEXT")
    for obj in list(bpy.data.objects):
        if obj.type=="LIGHT":
            bpy.data.objects.remove(obj,do_unlink=True)
    for name,swatch in {
        "stone":"526070","slate":"475565","ash":"62707D","lichen":"536165",
        "trim":"7C8993","bone":"A2AEB3","rock":"464855","wood":"472E2D",
        "verdigris":"20434D","shingle":"2B414F","deep":"273446","patina":"528184",
        "bronze":"9E7841","iron":"161B23","passage":"211B21","ink":"242A38","gold":"DBA755","blue":"347FC1",
    }.items():
        pigment(name,swatch,metallic=.23 if name in ("verdigris","gold","bronze","patina") else 0)
    # The hallway receives torchlight indirectly. These tiny recessed bands
    # are hand-painted values, independent of the exterior specular lights.
    for name,swatch in (("tunnel","281D28"),("vault","653C34"),("embers","B06739")):
        pigment(name,swatch)
        material=materials[name]
        tree=material.node_tree
        emission=tree.nodes.new("ShaderNodeEmission")
        emission.inputs["Color"].default_value=tuple(render.linear(int(swatch[i:i+2],16)) for i in (0,2,4))+(1,)
        tree.links.new(emission.outputs[0],tree.nodes.get("Material Output").inputs["Surface"])
    for name,swatch,energy in (("amber","FC8529",1.45),("honey","FFB74B",2.35),
                               ("ruby","C4524D",1.35),("saffron","FFAD51",2),("smoke","BA7948",.75)):
        pigment(name,swatch,energy)
    for layer,build in (("far",far),("crown",crown),("gate",gate)):
        build()
    assemble()
    render.camera(scene,(0,0,6.14),9,20.6,"painted",True)
    scene.render.resolution_x=W
    scene.render.resolution_y=H
    scene.eevee.taa_render_samples=12
    scene.world.node_tree.nodes["Background"].inputs[1].default_value=.11
    render.light("Moon through cloud",(-8,-7,16),(0,0,5),7,850,(.48,.65,1))
    render.light("Dusk edge",(6,3,11),(0,0,5),3.5,3400,(.64,.83,1))
    render.light("Last sun",(-10,4,5),(0,0,3),4,1900,(1,.42,.22))
    render.light("Moon on the curtain",(-6,-9,5),(0,-2,1),8.5,680,(.48,.62,1))
    render.light("Gate braziers",(0,-6,.7),(0,-1,3),2.6,260,(1,.33,.075))
    render.light("Rose reflection",(3,-3,3),(0,0,5),2.2,110,(1,.34,.10))
    render.light("Lightning",(4,-7,14),(0,0,5),3,8700,(.63,.81,1))
    bolt=bpy.data.objects["Lightning"]
    OUT.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tarpit-keep-") as temp:
        for name in ("far","crown","gate","lightning"):
            for part,objects in plates.items():
                for obj in objects:
                    obj.hide_render=name not in (part,"lightning")
            scene.view_settings.exposure=-.55 if name!="lightning" else -.15
            bolt.hide_render=name!="lightning"
            path=Path(temp)/f"{name}.png"
            scene.render.filepath=str(path)
            bpy.ops.render.render(write_still=True)
            webp = path.with_suffix(".webp")
            subprocess.run([shutil.which("cwebp") or "/opt/homebrew/bin/cwebp",
                            "-quiet", "-q", "91", "-alpha_q", "100",
                            str(path), "-o", str(webp)], check=True)
            destination = OUT / webp.name
            if not destination.exists() or destination.read_bytes() != webp.read_bytes():
                shutil.copyfile(webp, destination)
    from bpy_extras.object_utils import world_to_camera_view
    for label,point in {"gate":(0,-4.9,-.48),"torch":(1.19,-3.99,1.89),
                        "banner":(1.58,-3.8,2.89),"wallWalk":(-3.87,-4.03,.94)}.items():
        p=world_to_camera_view(scene,scene.camera,Vector(point))
        print(label,round(p.x*W),round((1-p.y)*H))


if __name__=="__main__":
    run()
