"""Headless Blender: /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 -P scripts/art/keep_castle.py

Model the Old Keep as a painted miniature. Two perspective cameras share the gate's
registration, including a second exposure under a lightning key. Encode both plate
sizes from each render. No source imagery.

Use -- --footing [directory] to render the gate and exhibition lightning plates
alone, and add --siege-strike for the campaign's hard-key exposure.
"""
import json
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
PORTRAIT = (2560, 1920)
WIDE = (3200, 1200)
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
    shader.inputs["Roughness"].default_value = .43 if metallic else .62
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
        bump=nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value=.16
        bump.inputs["Distance"].default_value=.043
        links.new(noise.outputs["Fac"],bump.inputs["Height"])
        links.new(bump.outputs["Normal"],shader.inputs["Normal"])
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
    if ornate and h>1.5:
        for i in range(n):
            a=TAU*(i-.5)/n
            for t,rr in ((.14,.793),(.23,.692),(.34,.557),(.53,.385),(.64,.28)):
                xx=x+rr*r*math.sin(a)
                yy=y-rr*r*math.cos(a)
                rod((xx,yy,z+t*h),(xx+.085*r*math.sin(a),yy-.085*r*math.cos(a),z+t*h+.095*r),
                    .037*r,"patina",.014*r,n=4)
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
    # The clock hands are registered to the face in the runtime scene.
    for yy in (front,y+d/2):
        finial(x,yy,z+h,1.20)


def far():
    for x,y,r,h,cap in [(-7.85,3.4,.69,3.85,2.65),(-6.17,3,.73,5.4,2.95),
                          (-4.65,4,.59,6.7,3.1),(-2.64,3.3,.80,7.05,3.85),
                          (2.38,4.1,.97,8.1,4.05),(4.30,4.35,.54,6.63,2.68),
                          (6.05,3.7,.83,5.76,2.65),(8.17,3.5,.56,4.12,2.07)]:
        spire(x,y,-.5,r,h,cap,7,2,"slate","deep")
    # The old borough follows the ridge beyond the keep. The lower chapter
    # roofs leave gaps between groups of slender needles against the sky.
    for x,y,r,h,cap in [(-12,4,.56,3.4,1.86),(-10.7,4.6,.73,4.75,2.35),
                          (-9.27,4.1,.46,5.35,2.70),(-8.42,4.7,.35,6.45,2.18),
                          (8.42,5.4,.61,5.88,3.62),(9.31,5.3,.40,4.85,2.2),
                          (11.22,5.9,.55,4.10,1.83),(13.49,6.7,.63,3.75,2.12)]:
        spire(x,y,-.5,r,h,cap,8,2,"slate","deep")
    for x in (-5,-1,2,5):
        block(x,3,0,3.6,1.7,3.18,"slate")
        roof(x,3,3.1,1.52,1.61,4,False,"deep")


def crown():
    global layer
    layer="lantern"
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
    # The swinging bell is drawn inside this opening on the pausable clock.
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
    layer="crown"
    drum(-4.36,.41,-.35,1.37,7.06,4,2)
    clock_gable(-4.36,.41,6.67,2.17,1.93,2.16)
    for side in (-1,1):
        pinnacle(-4.36+side*.95,-.55,6.53,.22,1.04)
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
    layer="lantern"
    for j in (0,1,7):
        a=TAU*(j-.5)/8
        xx,yy=x+1.46*math.sin(a),y-1.46*math.cos(a)
        rod((xx,yy,3.73),(xx,yy,7.90),.082,"trim",.058,n=5)
    layer="crown"
    flag(3.61,.77,10.05,.92,.33)
    flag(-4.36,-.67,8.85,.84,.28)


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


def statue(x,y,z,scale):
    """Carved civic mascots. A hooded town surveyor holds a brass plumb bob."""
    def point(dx,dy,dz):
        return x+dx*scale,y+dy*scale,z+dz*scale
    profile(x,y,[(z,.20*scale),(z+.08*scale,.22*scale),(z+.13*scale,.16*scale)],8,"trim")
    profile(x,y,[(z+.13*scale,.17*scale),(z+.48*scale,.105*scale),
                 (z+.62*scale,.16*scale),(z+.69*scale,.07*scale)],7,"bone",aspect=.75)
    profile(x,y,[(z+.65*scale,.065*scale),(z+.76*scale,.125*scale),
                 (z+.84*scale,.11*scale),(z+.89*scale,.035*scale)],7,"ash")
    rod(point(-.13,0,.60),point(-.20,-.10,.45),.05*scale,"bone")
    rod(point(-.20,-.10,.45),point(0,-.17,.51),.04*scale,"trim")
    rod(point(.14,-.02,.60),point(.19,-.12,.55),.045*scale,"bone")
    rod(point(.19,-.12,.55),point(.19,-.12,.33),.009*scale,"bronze")
    profile(x+.19*scale,y-.12*scale,[(z+.24*scale,.004*scale),(z+.31*scale,.042*scale),
            (z+.33*scale,.016*scale)],5,"gold")


def spout(x,y,z,direction=1):
    """Rain frogs. Round cheeks, silly eyes and a projecting split stone lip."""
    block(x,y,z,.24,.26,.13,"ash")
    rod((x,y-.04,z+.09),(x+.05*direction,y-.39,z+.18),.12,"trim",.11)
    head=x+.05*direction
    block(head,y-.38,z+.14,.28,.22,.14,"trim")
    block(head,y-.51,z+.16,.22,.14,.044,"ink")
    block(head,y-.52,z+.13,.26,.13,.031,"bone")
    for side in (-1,1):
        profile(head+side*.092,y-.40,[(z+.24,.044),(z+.29,.062),(z+.32,.027)],7,"bone")
        block(head+side*.092,y-.45,z+.263,.031,.022,.034,"ink")


def watch_brazier(x,y,z):
    profile(x,y,[(z,.21),(z+.09,.23),(z+.17,.13),(z+.45,.087),
                 (z+.53,.21),(z+.67,.25),(z+.70,.23)],8,"bronze")
    for j in range(5):
        a=TAU*j/5
        dx,dy=.095*math.cos(a),.095*math.sin(a)
        profile(x+dx,y+dy,[(z+.62,.045),(z+.79,.087),(z+.97+.09*(j%2),.005)],6,
                "amber" if j%2 else "honey")


def lower_ward():
    # A terraced row of slate-roofed dwellings fills the gap below the
    # watchtowers. Three unequal bays and a toothed gable soften the symmetry.
    for xx,yy,w,eaves,peak in [(-7.0,.4,2.0,3.65,5.15),(-4.95,.05,2.1,4.0,5.45),
                               (4.58,-.3,1.6,4.18,5.58),(6.37,.5,1.86,3.36,4.77)]:
        front=yy-1.35
        block(xx,yy,0,w,2.67,eaves,"slate")
        verts=[(xx+u,yy+v,h) for v in (-1.42,1.42)
               for u,h in ((-w*.58,eaves),(w*.58,eaves),(0,peak))]
        poly(verts,[(0,1,2),(3,5,4),(0,2,5,3),(2,1,4,5)],"shingle")
        for side in (-1,1):
            rod((xx+side*w*.58,front-.11,eaves),(xx,front-.11,peak),.068,"trim")
            for j in range(1,5):
                q=j/5
                pinnacle(xx+side*w*.56*(1-q),front-.11,eaves+q*(peak-eaves),.065,.22)
            lancet(xx+side*w*.22,front-.035,eaves-.92,.37,.79,glow="amber")
        lancet(xx,front-.12,eaves+.07,.44,.68,glow="honey")
        for i in range(2):
            u=xx+w*.26+i*.25
            block(u,yy+.18,peak-.71,.22,.21,1.22+i*.14,"slate")
            block(u,yy+.18,peak+.48+i*.14,.27,.25,.12,"trim")
        finial(xx,front-.11,peak,.73)
        # Quoins, courses and gallery mouldings give the lower ward human scale.
        for row in range(12):
            z=.12+row*.29
            if z>eaves-.17: break
            for col in range(5):
                a=xx-w*.48+col*w/5+(row%2)*w*.07
                if a+w*.10>xx+w*.48: continue
                block(a+w*.07,front-.003,z,w*.13,.047,.23,
                      rng.choice(("slate","ash","lichen","stone")))
        for z in (eaves-1.07,eaves-.97,eaves-.07):
            block(xx,front-.036,z,w*1.04,.113,.065,"trim")
        for i in (-1,0,1):
            lancet(xx+i*w*.30,front-.07,eaves-2.70,w*.18,1.13,glow="smoke")
    # A rose set into the broad, octagonal Book Hall overlooks the eastern
    # stairs. Its west porch bridges to the lantern rather than copying it.
    xx,yy=4.68,-1.35
    drum(xx,yy,0,1.53,6.19,8,2,"slate")
    roof(xx,yy,6.17,1.72,1.35,8)
    front=yy-1.46
    rose(xx,front,5.08,.76)
    for side in (-1,1):
        pinnacle(xx+side*.90,front+.22,5.85,.21,1.55)
        for level in (2.96,3.75):
            flying(xx+side*2.10,yy-.5,level,-side,.98,1.57)
        drum(xx+side*2.1,yy-.50,0,.24,3.92,6,1)
        pinnacle(xx+side*2.10,yy-.50,3.81,.28,1.37)
    # Chisel-faced bridge piers and paired lancets below the rose window.
    for i in (-1,0,1):
        lancet(xx+i*.44,front-.025,2.52,.32,1.26,glow="smoke" if i else "amber")
    for side in (-1,1):
        xx=side*2.05
        block(xx,-.68,2.2,.55,.61,2.62,"stone")
        lancet(xx,-1.0,3.07,.36,1.24,glow="ink",tracery=False)
        statue(xx,-1.09,3.06,1.16)
        pinnacle(xx,-.71,4.82,.31,1.62)
        flying(xx,-.72,3.50,-side,.92,1.20)
    # The high covered gallery spans the gap between the chapter house and
    # the eastern archive. Light is visible through the arch-shaped openings.
    for j in range(5):
        xx=1.4+j*.53
        block(xx,-.37,3.42,.12,.57,1.21,"ash")
        for side in (-1,1):
            rod((xx,-.66,4.23),(xx+side*.265,-.66,4.56),.067,"trim")
    block(2.46,-.36,3.38,2.37,.67,.12,"trim")
    block(2.46,-.36,4.61,2.42,.75,.14,"slate")


def wall_rise(x):
    t=max(0,min(1,(x-5.6)/12.5))
    return 4.35*t*t*(3-2*t)


def escarpment(x1,x2):
    # The fortress grew out of folded basalt. Continuous serrated strata
    # recede into the hillside. No straight skirt or dangling isolated piers.
    stations=[]
    for j in range(1+round((x2-x1)/.52)):
        x=x1+(x2-x1)*j/round((x2-x1)/.52)
        y=-2.96+(abs(x)-2.07)*(.121 if x<0 else .254)
        stations.append((x,y,rng.uniform(-.26,.18),rng.uniform(-.28,.23),rng.uniform(-.6,.15)))
    # Give the fractured outer face one solid heel. The individual plates
    # of shale still break the surface, but the crag cannot show between
    # the buttresses. Low, sloping toes carry the rock out to the ground.
    heel=[]
    for x,y,dx,dz,bottom in stations:
        toe=-1.97+.15*math.sin(x*1.55)+bottom*.26
        toe-=max(0,min(.16,(-x-9)*.028))
        heel.append(((x,y+.06,-.51+dz*.24),
                     (x+dx*.38,y-.33,-1.22+dz*.42),
                     (x+dx*.38,y-.64,toe+.15),
                     (x+dx*.30,y-.72,toe-.09)))
    for j,(a,b) in enumerate(zip(heel,heel[1:])):
        for k in range(len(a)-1):
            v=[a[k],b[k],b[k+1],a[k+1]]
            tones=("rock","shale","shale-light") if k<2 else ("rock","shale-toe","shale-toe")
            poly(v,[(0,2,1)],tones[(j+k)%3])
            poly(v,[(0,3,2)],tones[(j+2*k+1)%3])
    for side in range(len(stations)-1):
        contours=[]
        for x,y,dx,dz,bottom in stations[side:side+2]:
            contours.append([(x,y+.25,.42+dz),(x+dx,y-.22,.02+dz),
                (x+dx-.15,y-.44,-.54+dz),(x+dx+.16,y-.36,-.83+dz),
                (x+dx-.05,y-.60,-1.32+bottom),(x+dx-.23,y-.63,-1.63+bottom)])
        for k in range(5):
            v=[contours[0][k],contours[1][k],contours[1][k+1],contours[0][k+1]]
            colors=("rock","lichen","slate") if k%2==0 else ("rock","slate","ink")
            poly(v,[(0,2,1)],rng.choice(colors))
            poly(v,[(0,3,2)],rng.choice(colors))
        if side%3==0:
            a,b=contours
            rod(a[3],b[3],.024,"ash",n=4)


def gateway(yf):
    """Build the masonry around an open vault and the diminishing bays behind it."""
    floor=-.16
    depth=1.34
    def contour(width,height,y,lift=floor):
        shape=arch(width,height)
        return [(u,y,lift+v) for u,v in [*shape[1:],shape[0]]]
    front=contour(1.60,2.69,yf)
    back=contour(.91,1.89,yf+depth,.010)
    for i,(a,b) in enumerate(zip(front,front[1:])):
        if abs(a[0]-b[0])>.001:
            panel([a,b,(b[0],yf,3.22),(a[0],yf,3.22)],"stone")
        panel([a,back[i],back[i+1],b],"slate" if i in (0,7) else "rock")
    for side in (-1,1):
        block(side*1.135,yf+.75,floor,.67,1.5,3.38,"stone")
    block(0,yf+.74,3.14,2.95,1.48,.10,"stone")
    for width,height,inner_w,inner_h,relief,stone in (
            (2.09,3.11,1.85,2.96,.01,"ash"),(1.85,2.96,1.70,2.80,.037,"slate"),
            (1.70,2.80,1.57,2.69,.053,"trim")):
        outer=contour(width,height,yf-relief)
        inner=contour(inner_w,inner_h,yf-relief-.005)
        for i in range(len(front)-1):
            a,b=Vector(outer[i]),Vector(outer[i+1])
            c,d=Vector(inner[i]),Vector(inner[i+1])
            n=max(1,round((b-a).length/.19))
            for j in range(n):
                t1,t2=(j+.018)/n,(j+.982)/n
                panel([a.lerp(b,t1),a.lerp(b,t2),c.lerp(d,t2),c.lerp(d,t1)],
                      stone if (j+i)%4 else "trim")
    for w,h,rr,stone in ((1.86,2.965,.032,"bone"),(1.67,2.79,.022,"bronze")):
        rib=contour(w,h,yf-.073)
        for a,b in zip(rib,rib[1:]):
            rod(a,b,rr,stone,n=6)

    # Receding brick vaults, irregular wet paving and an open postern at the
    # bend of the passage. The floor is continuous across the threshold.
    for i in range(4):
        t=(i+.35)/4
        ring=[Vector(a).lerp(Vector(b),t) for a,b in zip(front,back)]
        for a,b in zip(ring,ring[1:]):
            rod(a,b,.050-.02*t,"ash" if i%2==0 else "lichen",n=5)
        for side in (-1,1):
            xx=side*(.735-.36*t)
            y=yf+depth*t
            z=1.06-.29*t
            rod((xx+side*.09,y,z-.14),(xx,y-.055,z-.05),.023,"bronze")
            profile(xx,y-.055,[(z-.10,.032),(z,.065),(z+.02,.064)],6,"bronze")
            profile(xx,y-.055,[(z+.012,.041),(z+.072,.042),(z+.132,.005)],6,"honey")
    for row in range(14):
        start=row/14
        end=(row+1)/14-.004
        width=.84-.36*start
        for col in range(4):
            a=-width+width*.5*col
            b=a+width*.5-.009
            panel([(a,yf+(depth+.025)*start,floor+.17*start),(b,yf+(depth+.025)*start,floor+.17*start),
                   (b,yf+(depth+.025)*end,floor+.17*end),(a,yf+(depth+.025)*end,floor+.17*end)],
                  rng.choice(("slate","rock","lichen","stone")))
    # A warm side door gives the viewer a scale reference deep inside.
    end=yf+depth+.025
    block(0,end+.04,.002,1.13,.08,2.09,"slate")
    # The bend is open to a dark adjoining court; a small, lit window
    # and offset masonry jamb sit beside it on the weathered rear wall.
    for row in range(9):
        for col in range(4):
            xx=-.49+col*.255+(row%2)*.055
            block(xx,end-.008,.026+row*.171,.23,.035,.152,
                  rng.choice(("rock","slate","lichen")))
    for w,h,at,mat in ((.74,1.43,.045,"ash"),(.64,1.32,.055,"bronze"),(.57,1.27,.064,"ink")):
        panel([(-.07+u,end-at,.009+z) for u,z in arch(w,h)],mat)
    panel([(-.31,end-.069,.03),(.20,end-.069,.03),(.17,end-.069,.095),
           (-.19,end-.069,.118)],"slate")
    lancet(.368,end-.046,.48,.14,.39,glow="smoke")
    for side in (-1,1):
        block(side*.42,end-.02,.01,.09,.08,1.53,"ash")
    # The raised grate is iron lattice with rivets. It stops well over a
    # standing figure's head and throws a real shadow on the first bay.
    for i in range(-6,7):
        x=i*.118
        upper=2.55-.84*(abs(x)/.80)**1.34
        tip=1.27+.07*abs(x)
        rod((x,yf+.13,tip+.12),(x,yf+.13,upper),.025,"iron",n=4)
        rod((x,yf+.13,tip+.14),(x,yf+.13,tip),.046,"iron",.001,n=4)
    for z,w in ((1.53,1.53),(1.80,1.39),(2.04,1.07),(2.27,.65)):
        block(0,yf+.12,z,w,.045,.057,"iron")
        for i in range(-6,7,2):
            if abs(i*.118)<w*.48:
                block(i*.118,yf+.083,z+.02,.033,.027,.029,"bronze")


def gate():
    global layer
    # Curtain and grounded rubble. The path continues directly off the centre stair.
    for s in (-1,1):
        layer="gate"
        escarpment(*((-25,-1.42) if s<0 else (1.42,25)))
        if s<0:
            ashlar_wall(-23,-.45,-2.07,-3.03,2.47)
        else:
            ashlar_wall(2.07,-3.03,12,-.5,2.47)
            ashlar_wall(12,-.5,24,5.5,3.36)
        # Gun platforms occupy the two low salients of the curtain. A short
        # dogleg stair connects each actual walkable deck to the higher wall.
        xx=s*3.87
        # A broad projecting drum carries the crew. Its deck falls away
        # toward the drain above the centre machicolation; the camera sees
        # the deck behind the outer parapet even from the foot of the stair.
        drum(xx,-4.18,-1.33,1.20,2.10,10,0)
        profile(xx,-4.18,[(-1.56,1.49),(-1.24,1.43),(-1.12,1.33),
                          (-.97,1.22),(-.88,1.22)],10,"slate")
        perimeter=[]
        for j in range(10):
            a=TAU*(j+.5)/10
            dx,dy=1.40*math.sin(a),-1.24*math.cos(a)
            perimeter.append((xx+dx,-4.03+dy,.94+dy*.45))
        for j,P in enumerate(perimeter):
            Q=perimeter[(j+1)%len(perimeter)]
            L=(P[0],P[1],P[2]-.23)
            R=(Q[0],Q[1],Q[2]-.23)
            panel([P,Q,R,L],"ash")
            panel([P,Q,(xx,-4.03,.94)],"slate" if j%3 else "lichen")
            rod(P,Q,.058,"trim",n=5)
            if P[1]>-4.48:
                block(P[0],P[1],P[2],.19,.17,.20,"stone")
                block(P[0],P[1],P[2]+.16,.22,.19,.06,"trim")
        # Low rear battlement leaves the central setting free for a marked
        # tower site; regularly laid paving makes the working deck legible.
        for row in range(-3,4):
            yy=row*.23
            half=1.24*math.sqrt(max(0,1-(yy/1.13)**2))
            rod((xx-half,-4.03+yy,.947+yy*.45),(xx+half,-4.03+yy,.947+yy*.45),.010,"ash",n=4)
            for col in (-1,0,1):
                dx=col*.49+(row%2)*.23
                rod((xx+dx,-4.03+yy,.947+yy*.45),(xx+dx,-3.82+yy,1.04+yy*.45),
                    .008,"ash",n=4)
        for j in range(8):
            block(xx+s*(.23+j*.095),-3.66+j*.15,.32,.77,.22,.58+j*.15,"slate")
            block(xx+s*(.23+j*.095),-3.71+j*.15,.88+j*.15,.79,.12,.05,"trim")
        for xx in (4.65,8.17,12.08,16.1,20.48):
            yy=-3.03+(xx-1.46)*.19
            drum(s*xx,yy,.0,.55 if xx<5 else .77,2.49 if xx<5 else 2.87,8,1)
            merlons(s*xx,yy,2.48 if xx<5 else 2.86,.58 if xx<5 else .80,10)
        for j in range(10):
            xx=3.5+j*1.89
            yy=-3.07+(xx-2.07)*(.122 if s<0 else .254)
            # Tapered foundations that sink between the fractured faces.
            profile(s*xx,yy-.25,[(-1.38,.56),(-.99,.52),(.07,.37),(1.71,.19),
                    (1.86,.24),(1.95,.15)],4,"ash",rot=math.pi/4,aspect=1.8)
            if j%2==0:
                watch_brazier(s*xx,yy+.24,2.13)
                spout(s*xx,yy-.22,1.80,s)
        layer="portal-tower"
        spire(s*1.50,-3.05,-.18,.69,3.27,1.04,8,1)
        for k in range(3):
            xx=s*(1.38+.14*k)
            pinnacle(xx,-3.36+k*.16,3.10,.105,.57+.09*k)
        layer="gate"
        for j in range(35):
            xx=2.0+j*.59
            yy=-3.12+(xx-1.46)*(.121 if s<0 else .254)
            r=rng.uniform(.43,.80)
            profile(s*xx,yy,[(-.62,r*.92),(-.38,r*1.1),(-.11,r*.83),(.04,r*.26)],5,
                    rng.choice(("rock","slate","lichen")),rot=rng.random(),aspect=.65)
    layer="portal"
    yf=-3.70
    gateway(yf)
    for zz in (3.06,3.18):
        block(0,-2.91,zz,2.99,1.58,.10,"trim")
    for i in range(7):
        block(-1.30+i*.43,-3.60,3.24,.26,.32,.32,"stone")
    for s in (-1,1):
        # Niches flank the vaulted arch. Each statue sits below a projecting
        # five-sided canopy with a finial and a hood mould.
        lancet(s*1.16,yf-.024,1.82,.38,.84,glow="ink",tracery=False)
        statue(s*1.16,yf-.085,1.82,.72)
        profile(s*1.16,yf-.055,[(2.63,.29),(2.70,.28),(2.86,.11),(2.94,.025)],5,"trim")
        spout(s*1.31,yf,2.89,s)
        x=s*1.19
        rod((x,yf,1.31),(x,yf-.29,1.63),.049,"iron")
        profile(x,yf-.29,[(1.55,.055),(1.73,.13),(1.78,.13)],8,"bronze")
        profile(x,yf-.29,[(1.73,.065),(1.87,.095),(2.06,.003)],7,"honey")
        # Crossbar for a runtime hanging banner on the gate towers.
        rod((s*1.58-.25,-3.80,2.89),(s*1.58+.25,-3.80,2.89),.027,"gold")
    layer="portal-stair"
    for i in range(8):
        block(0,-3.72-i*.155,-.58,1.66+i*.065,.17,.47-i*.048,"ash" if i%2 else "trim")
        block(0,-3.796-i*.155,-.152-i*.048,1.69+i*.065,.045,.045,"bone")
    for s in (-1,1):
        rod((s*.91,-3.77,.18),(s*1.16,-4.87,-.18),.065,"bronze")
        for j in (0,3,7):
            profile(s*(.91+j*.035),-3.77-j*.155,[(-.52,.076),(.18-j*.049,.076)],6,"trim")


def watch_gallery(x,y,z,r,hand):
    """Built-out tower stations, with a rear landing tied into the gate."""
    drum(x,y,-1.12,r*.74,z+.77,8,1,"slate")
    profile(x,y,[(-1.27,r*.92),(-1.03,r*.88),(-.93,r*.74)],8,"rock")
    # Behind the cage the short, barrel-vaulted gallery returns into the wall.
    block(x,y+.59,z-.29,r*1.28,1.35,.24,"slate")
    for side in (-1,1):
        rod((x+side*r*.44,y+.95,z-1.18),(x+side*r*.66,y-.04,z-.21),.09,"trim",.13)
    ring=[]
    for j in range(8):
        a=TAU*(j+.5)/8
        dx,dy=r*math.sin(a),r*math.cos(a)
        ring.append((x+dx,y+dy,z+.57*dy))
    for j,a in enumerate(ring):
        b=ring[(j+1)%8]
        panel([a,b,(x,y,z)],"slate" if j%3 else "ash")
        panel([a,b,(b[0],b[1],b[2]-.22),(a[0],a[1],a[2]-.22)],"ash")
        rod(a,b,.039,"trim",n=4)
        if a[1]>y+.19 or (hand*(a[0]-x)>.72*r):
            block(a[0],a[1],a[2],.15,.12,.15,"slate")
            block(a[0],a[1],a[2]+.13,.175,.15,.044,"bone")
    for j in (-2,-1,0,1,2):
        yy=r*j*.20
        rod((x-r*.72,y+yy,z+yy*.57+.008),(x+r*.72,y+yy,z+yy*.57+.008),.013,"ash",n=4)
    for side in (-1,1):
        dx=side*r*.32
        rod((x+dx,y-r*.70,z-r*.70*.57+.01),(x+dx,y+r*.70,z+r*.70*.57+.01),.014,"ash",n=4)
    # A shield and keel corbel anchor the projecting machinery to the pier.
    front=y-r*.70
    panel([(x-r*.23,front-.03,z-.68),(x+r*.23,front-.03,z-.68),
           (x+r*.18,front-.03,z-.90),(x,front-.03,z-1.03),
           (x-r*.18,front-.03,z-.90)],"blue")
    rod((x-r*.16,front-.044,z-.79),(x,front-.044,z-.88),.021,"gold")
    rod((x,front-.044,z-.88),(x+r*.16,front-.044,z-.79),.021,"gold")


def assemble():
    for (name,mat),(verts,faces) in geometry.items():
        mesh=bpy.data.meshes.new(name+" "+mat)
        if name=="gate":
            verts=[(x,y,z+wall_rise(x)) for x,y,z in verts]
        mesh.from_pydata(verts,[],faces)
        mesh.materials.append(materials[mat])
        obj=bpy.data.objects.new(mesh.name,mesh)
        bpy.context.collection.objects.link(obj)
        obj["part"]=name
        if name.startswith("portal"):
            obj.scale=(1.43,1,2.12)
        if name in ("far","crown","lantern"):
            obj.location.z=2.62 if name=="far" else 2.18
        group="gate" if name.startswith("portal") else "crown" if name=="lantern" else name
        plates.setdefault(group,[]).append(obj)


def stone_palette():
    for name,swatch in {
        "stone":"526070","slate":"475565","ash":"62707D","lichen":"536165",
        "trim":"7C8993","bone":"A2AEB3","rock":"464855","wood":"472E2D",
        "shale":"5C5B66","shale-light":"696675","shale-toe":"343B49",
        "verdigris":"20434D","shingle":"2B414F","deep":"273446","patina":"528184",
        "bronze":"9E7841","iron":"161B23","passage":"211B21","ink":"242A38","gold":"DBA755","blue":"347FC1",
    }.items():
        pigment(name,swatch,metallic=.23 if name in ("verdigris","gold","bronze","patina") else 0)
    for name,swatch,energy in (("amber","FC8529",1.45),("honey","FFB74B",2.35),
                               ("ruby","C4524D",1.35),("saffron","FFAD51",2),("smoke","BA7948",.75)):
        pigment(name,swatch,energy)


def outer_ward(expanded=False):
    """An open vault and two flanking drums across the shared road."""
    yf=0
    shape=arch(1.89,2.26)
    rim=shape[1:]+[shape[0]]
    outer=arch(2.45,2.65)
    trim=outer[1:]+[outer[0]]
    for i,(a,b) in enumerate(zip(rim,rim[1:])):
        u,z=a; v,w=b
        panel([(u,yf,z),(v,yf,w),(v,.94,w),(u,.94,z)],"ink" if i%2 else "slate")
        aa,bb=trim[i:i+2]
        if u!=v:
            panel([(u,yf,z),(v,yf,w),(bb[0],yf,3.01),(aa[0],yf,3.01)],"stone")
        rod((u,-.029,z),(v,-.029,w),.037,"bone",n=5)
        A,B=Vector((*aa,0)),Vector((*bb,0))
        C,D=Vector((*a,0)),Vector((*b,0))
        courses=max(2,round((B-A).length/.23))
        for j in range(courses):
            k=(j+.03)/courses
            l=(j+.97)/courses
            stones=[A.lerp(B,k),A.lerp(B,l),C.lerp(D,l),C.lerp(D,k)]
            panel([(x,-.021,z) for x,z,_ in stones],rng.choice(("ash","slate","trim","stone")))
    block(0,.42,-.19,2.08,1.45,.19,"slate")
    for row in range(5):
        for col in range(7):
            x=-.88+col*.28+(row%2)*.07
            block(x,-.24+row*.24,-.025,.26,.22,.032,rng.choice(("slate","ash","rock")))
    block(0,.45,2.76,2.98,1.12,.27,"stone")
    block(0,.45,2.91,3.20,1.18,.11,"trim")
    for x in (-1.21,-.61,0,.61,1.21):
        block(x,.05,3.02,.38,.27,.28,"stone")
        block(x,.05,3.27,.44,.32,.07,"trim")
    for side in (-1,1):
        x=side*1.72
        block(side*1.31,.43,-.12,.78,1.1,2.93,"stone")
        height=4.36 if expanded else 3.55
        drum(x,.3,-.15,.66,height,n=8,windows=2 if expanded else 1)
        merlons(x,.3,4.25 if expanded else 3.44,.66,8)
        for z in (.05,1.13,3.72 if expanded else 2.91):
            profile(x,.3,[(z,.665),(z+.07,.71),(z+.13,.71),(z+.17,.665)],8,"slate")
        lantern_x=side*1.28
        watch_brazier(lantern_x,-.53,.10)
        render.light(f"Barbican lamp {side}",(lantern_x,-.62,1.16),(x,-.18,1.54),.65,43,(1,.37,.08))
    if expanded:
        barbican_wings()


def barbican_wings():
    """Curtain walls run into staggered rock abutments at either shoulder."""
    for side in (-1,1):
        for section in range(2):
            x=side*(2.72+section*.9)
            y=.49+section*.30
            h=1.59-section*.31
            block(x,y,-.31,1.05,.8,h+.31,"stone")
            block(x,y,h,1.10,.89,.13,"slate")
            block(x,y-.03,h+.11,1.15,.93,.105,"trim")
            for offset in (-.34,.15):
                block(x+offset,y-.30,h+.21,.23,.25,.28,"stone")
                block(x+offset,y-.31,h+.49,.28,.29,.076,"trim")
            for course in range(round(h/.24)+1):
                for j in range(4):
                    nw=x-.51+j*.25+(course%2)*.08
                    right=min(nw+.237,x+.508)
                    if right-nw < .055:
                        continue
                    z=course*.22-.16
                    panel([(nw,y-.407,z),(right,y-.407,z),(right,y-.407,z+.209),
                           (nw,y-.407,z+.209)],rng.choice(("stone","slate","ash","lichen")))
        bx=side*4.06
        for off,z,r in ((-.26,-.28,.40),(.11,-.34,.49),(.31,-.36,.30)):
            # Faceted bedrock swallows the tails of the wall instead of
            # leaving a crisp, freestanding end at the crag.
            profile(bx+side*off,1.08,[(z,r),(z+.30,r*1.09),(z+.72,r*.55)],
                    5,rng.choice(("rock","deep","slate")),rot=off)


def gate_condition(state):
    if state==3:
        # Split oak and torn hinges clear the centre of the exposed vault.
        for i in range(12):
            side=(-1,1)[i%2]
            a=(side*(.59+.07*(i%5)),-.08-.08*(i%3),.04+.04*(i%3))
            b=(a[0]+side*.46,a[1]-.30+(i%5)*.14,a[2]+.09*(i%2))
            rod(a,b,.09,"wood",.045,n=4)
            if i%3==0:
                rod(a,(a[0]+side*.26,a[1]-.06,a[2]+.13),.035,"bronze",n=4)
        return
    for i in range(10):
        x=(i-4.5)*.18
        h=2.22-abs(x)*.84
        lean=(.14 if i>4 else -.29) if state==2 else 0
        heel=.05 if state<2 else .07+(i%4)*.027
        y=-.087 if state<2 else -.11-(i%3)*.047
        cap=h-(.25 if state==2 and i in (2,4,5) else 0)
        panel([(x-.083,y,heel),(x+.083,y,heel),(x+.093+lean,y,cap-.12),
               (x-.027+lean,y,cap),(x-.08+lean,y,cap-.09)],"wood")
        rod((x-.055,y-.004,heel+.03),(x-.051+lean,y-.004,cap-.14),.011,"bronze",.005,n=4)
        if state==2 and i%2==0:
            rod((x+.06,y-.011,.28),(x-.02+lean,y-.014,cap*.62),.019,"ink",n=4)
    bars = [[(-.89, .61), (.89, .61)], [(-.89, 1.12), (.89, 1.12)]]
    if state==1:
        bars[1]=[(-.89,1.12),(-.09,1.09),(.41,.94),(.89,.88)]
    if state==2:
        bars=[[(-.89,.41),(-.22,.50),(-.04,.74)],[(.15,.97),(.42,.72),(.94,.64)]]
    for bar in bars:
        for (x,z),(u,v) in zip(bar,bar[1:]):
            rod((x,-.147,z),(u,-.147,v),.079,"iron",n=4)
            rod((x,-.181,z+.039),(u,-.181,v+.039),.016,"trim",n=4)
            for i in range(4):
                t=(i+.25)/4
                block(x+(u-x)*t,-.192,z+(v-z)*t,.045,.049,.042,"gold")
    if state>=1:
        split=[(.14,1.80),(.09,1.58),(.24,1.36),(.12,1.08),(.19,.84),(.03,.47),(.08,.17)]
        for (x,z),(u,v) in zip(split,split[1:]):
            rod((x,-.19,z),(u,-.19,v),.019 if state==1 else .028,"ink",n=4)
    if state<2:
        flag(.66,-.18,2.43,.57,.71)
    else:
        rod((.39,-.18,2.26),(.92,-.16,1.66),.035,"bronze",n=4)
        panel([(.45,-.20,2.23),(.86,-.19,1.73),(1.08,-.23,1.13),
               (.83,-.28,1.27),(.59,-.22,1.73)],"blue")
        rod((.83,-.29,1.27),(1.08,-.24,1.13),.025,"gold",n=4)


def write_webp(path,output,size):
    encoder=[shutil.which("cwebp") or "/opt/homebrew/bin/cwebp","-quiet","-q","87","-alpha_q","95"]
    subprocess.run([*encoder,str(path),"-o",str(output/path.with_suffix(".webp").name)],check=True)
    subprocess.run([*encoder,"-resize",str(size[0]//2),str(size[1]//2),str(path),
                    "-o",str(output/f"{path.stem}-half.webp")],check=True)


def render_barbican(expanded=False):
    global layer
    scene=render.studio("painted",True,"BLENDER_EEVEE_NEXT")
    for obj in list(bpy.data.objects):
        if obj.type=="LIGHT":
            bpy.data.objects.remove(obj,do_unlink=True)
    stone_palette()
    layer="barbican"
    outer_ward(expanded)
    for state in range(4):
        layer=f"door-{state}"
        gate_condition(state)
    assemble()
    scene.world.node_tree.nodes["Background"].inputs[1].default_value=.29
    render.light("Barbican sky",(-4,-5,8),(0,0,1),4,840,(.56,.74,1))
    render.light("Barbican sunset",(-4,-1,5),(0,0,1),2,280,(1,.54,.27))
    cam=scene.camera
    cam.data.type="ORTHO"
    cam.data.ortho_scale=9.75 if expanded else 5.55
    cam.location=(1.40,-14,5.4) if expanded else (2.25,-14,5.4)
    cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.shift_y=(116/140-.5)*.625 if expanded else (78/96-.5)*.75
    scene.view_settings.exposure=-.13 if expanded else -.51
    scene.eevee.taa_render_samples=24
    size=(640,400) if expanded else (512,384)
    scene.render.resolution_x,scene.render.resolution_y=size
    OUT.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tarpit-barbican-") as temp:
        frames=[]
        for state in range(4):
            for i in range(4):
                for obj in plates[f"door-{i}"]:
                    obj.hide_render=i!=state
            frame=Path(temp)/f"door-{state}.png"
            scene.render.filepath=str(frame)
            bpy.ops.render.render(write_still=True)
            frames.append(str(frame))
        atlas=Path(temp)/("siege-barbican.png" if expanded else "siege-gates.png")
        subprocess.run(["python3",str(HERE/"keep_weather.py"),"--gate-atlas",*frames,str(atlas)],check=True)
        write_webp(atlas,OUT,(size[0]*2,size[1]*2))


def run():
    global layer
    scene=render.studio("painted",True,"BLENDER_EEVEE_NEXT")
    for obj in list(bpy.data.objects):
        if obj.type=="LIGHT":
            bpy.data.objects.remove(obj,do_unlink=True)
    stone_palette()
    for layer,build in (("far",far),("crown",crown),("gate",gate)):
        build()
        if layer=="crown":
            lower_ward()
    # The quarter-turned board puts its remote gate station on a different
    # flank. These placements project to the actual marked cells at each lens.
    layer="portrait-gallery"
    watch_gallery(1.57,-5.0,2.418,.77,1)
    layer="wide-gallery"
    watch_gallery(-2.228,-4.75,4.696,.89,-1)
    watch_gallery(6.675,-2.73,3.504,.91,1)
    # On the broad hillside the archive has a pair of outlying, ribbed
    # observatory towers. They stagger down behind its rose-topped chapel.
    layer="east-watch"
    spire(7.15,2.36,-.35,.70,8.81,2.89,8,2,"slate","deep")
    spire(8.27,2.87,-.30,.42,7.26,2.08,8,2,"stone","verdigris")
    for side in (-1,1):
        pinnacle(7.15+side*.60,1.99,8.06,.15,1.26)
    assemble()
    cam=scene.camera
    cam.data.type="PERSP"
    cam.data.sensor_fit="HORIZONTAL"
    cam.location=(2.75,-34,2.52)
    cam.rotation_euler=(math.radians(96),0,math.radians(5.20))
    scene.eevee.taa_render_samples=12
    scene.eevee.shadow_pool_size="1024"
    scene.world.node_tree.nodes["Background"].inputs[1].default_value=.21
    render.light("Moon through cloud",(-9,-8,19),(0,0,5),7,2150,(.47,.67,1))
    render.light("Dusk edge",(8,4,16),(0,0,7),3.2,6700,(.51,.83,1))
    render.light("Last sun",(-11,4,8),(0,0,4),3.8,5300,(1,.28,.085))
    render.light("Moon on the curtain",(-6,-12,8),(0,-2,1),7,870,(.49,.69,1))
    render.light("Gate reflected fire",(0,-7,1.2),(0,-2,4),2.9,270,(1,.29,.055))
    render.light("First passage lamp",(-.62,-3.43,2.02),(.46,-2.75,.54),.27,14,(1,.41,.10))
    render.light("Last passage lamp",(.44,-2.78,1.54),(-.25,-2.34,1.01),.24,7,(1,.40,.095))
    render.light("Rose reflection",(3,-4,5),(0,0,7),2,175,(1,.36,.10))
    for side in (-1,1):
        render.light("Door torch "+str(side),(side*1.77,-4.72,3.97),
                     (side*1.72,-3.2,4.29),.83,60,(1,.29,.034))
        for j in range(4):
            xx=3.5+j*3.78
            yy=-3.07+(xx-2.07)*(.122 if side<0 else .254)
            render.light(f"Fire {side} {j}",(side*xx,yy-.69,2.76),
                         (side*xx,yy+.45,1.76),.70,85,(1,.34,.07))
    render.light("Lightning",(9,-7,18),(0,0,4),1.25,17000,(.58,.80,1))
    bolt=bpy.data.objects["Lightning"]
    args=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    strike="--siege-strike" in args
    footing="--footing" in args
    directories=[arg for arg in args if not arg.startswith("--")]
    preview=bool(directories) and not footing
    output=Path(directories[-1]) if directories else OUT
    if strike:
        for obj in scene.objects:
            if obj.type=="LIGHT" and obj!=bolt:
                obj.data.energy *= .12 if "Fire" not in obj.name else .55
        scene.world.node_tree.nodes["Background"].inputs[1].default_value=.035
        bolt.data.type="SUN"
        bolt.data.angle=math.radians(.32)
        bolt.data.energy=8.3
        bolt.data.color=(.69,.83,1)
        bolt.rotation_euler=Vector((-18,17,-26)).to_track_quat('-Z','Y').to_euler()
        scene.view_settings.look="AgX - Very High Contrast"
    output.mkdir(parents=True,exist_ok=True)
    from bpy_extras.object_utils import world_to_camera_view
    def projected(point):
        u=world_to_camera_view(scene,cam,Vector(point))
        return u.x,1-u.y
    anchors={
        "foot":(0,-4.88,-.479*2.12),"doorCrown":(0,-3.70,(2.69-.16)*2.12),
        "torchL":(-1.19*1.43,-3.99,1.89*2.12),"torchR":(1.19*1.43,-3.99,1.89*2.12),
        "flagL":(-1.58*1.43,-3.8,2.89*2.12),"flagR":(1.58*1.43,-3.8,2.89*2.12),
        "bell":(-.52,.72,11.08+2.18),"clock":(-4.36,-.76,7.17+2.18),
        "dialRight":(-4.36+.269,-.76,7.17+2.18),"bellWidth":(-.52+.44,.72,11.08+2.18),
        "rose":(4.68,-2.87,5.08+2.18),"westWindow":(-4.36,-.57,3.52+2.18),
        "eastWindow":(3.61,-.32,4.57+2.18),"roofL":(-4.36,-.75,6.72+2.18),
        "roofR":(3.61,-.30,6.52+2.18),"chimney":(6.37+.49,.68,4.77+.74+2.18),
        "chainTopL":(-.93*1.43,-3.78,.83*2.12),"chainFootL":(-1.13*1.43,-4.87,-.15*2.12),
        "chainTopR":(.93*1.43,-3.78,.83*2.12),"chainFootR":(1.13*1.43,-4.87,-.15*2.12),
        "threshold":(0,-3.70,-.16*2.12),"grilleTip":(0,-3.57,1.27*2.12),
        "walkL":(-4.5,-2,2.19),"walkR":(4.5,-2,2.19),
        "platformL":(-3.87,-4.03,.94),"platformR":(3.87,-4.03,.94),
        "crownTip":(-.52,.72,13.36+2.18)}
    for side in (-1,1):
        for j in range(3):
            xx=3.5+j*3.78
            yy=-3.07+(xx-2.07)*(.122 if side<0 else .254)
            anchors[f"brazier{side}_{j}"]=(side*xx,yy+.24,3.03+wall_rise(side*xx))
    registration={}
    with tempfile.TemporaryDirectory(prefix="tarpit-keep-") as temp:
        for suffix,size,lens,recession in [("",PORTRAIT,49,1),("-wide",WIDE,31,.79)]:
            scene.render.resolution_x,scene.render.resolution_y=size
            scene.render.resolution_percentage=32 if preview else 100
            scene.eevee.taa_render_samples=4 if preview else 12
            cam.data.lens=lens
            portal_scale=1.26 if suffix else 1
            # Compact landscape framing retains the open aperture above a
            # Troll. Its stair and the ground inside the threshold stay put.
            for obj in plates["gate"]:
                part=obj["part"]
                if part in ("portal","portal-tower"):
                    rise=portal_scale if part=="portal" else 1+(portal_scale-1)*.46
                    obj.scale.z=2.12*rise
                    obj.location.z=.16*2.12*(rise-1)
            lantern_shift=-5.72 if suffix else 0
            for group in ("far","crown"):
                for obj in plates[group]:
                    obj.location.x=lantern_shift if obj["part"]=="lantern" else 0
                    obj.scale.z=recession
                    obj.location.z=(2.18 if group=="crown" else 2.62)*recession
            cam.data.shift_y=0
            bpy.context.view_layer.update()
            # Put the toe of the stair at 92% in both camera gates.
            _,toe=projected(anchors["foot"])
            cam.data.shift_y=(.92-toe)*size[1]/size[0]
            bpy.context.view_layer.update()
            print("REGISTRATION",suffix or "portrait",flush=True)
            upper={"bell","clock","dialRight","bellWidth","rose","westWindow","eastWindow",
                   "roofL","roofR","chimney","crownTip"}
            points={}
            registration["landscape" if suffix else "portrait"]=points
            for label,(xx,yy,zz) in anchors.items():
                if label in ("bell","bellWidth","crownTip"):
                    xx+=lantern_shift
                if label in upper:
                    zz*=recession
                if label in ("doorCrown","threshold","torchL","torchR","flagL","flagR","grilleTip"):
                    zz=zz*portal_scale+.16*2.12*(portal_scale-1)
                u,v=projected((xx,yy,zz))
                points[label]=[round(u*1280,1),round(v*960,1)]
                print(label,*points[label],flush=True)
            if strike:
                exposures=("lightning",)
            elif footing:
                exposures=("gate","lightning")
            else:
                exposures=("lightning","composite") if preview else ("far","crown","gate","lightning")
            for name in exposures:
                for part,objects in plates.items():
                    for obj in objects:
                        if part=="east-watch":
                            obj.hide_render=not suffix or name not in ("crown","lightning","composite")
                        elif part.endswith("-gallery"):
                            wanted="wide-gallery" if suffix else "portrait-gallery"
                            obj.hide_render=part!=wanted or name not in ("gate","lightning","composite")
                        else:
                            obj.hide_render=name not in (part,"lightning","composite")
                scene.view_settings.exposure=-.7 if strike else -.32 if name!="lightning" else -.16
                bolt.hide_render=name!="lightning"
                path=Path(temp)/f"{'strike' if strike else name}{suffix}.png"
                scene.render.filepath=str(path)
                bpy.ops.render.render(write_still=True)
                if preview:
                    shutil.copyfile(path,output/path.name)
                    continue
                write_webp(path,output,size)
    registration_file=(output/"projection.json" if preview else HERE.parents[1]/"src/game/keep/projection.json")
    if not strike and not footing:
        registration_file.write_text(json.dumps(registration,indent=2)+"\n")


if __name__=="__main__":
    if "--siege-gates" in sys.argv or "--siege-barbican" in sys.argv:
        render_barbican("--siege-barbican" in sys.argv)
    else:
        run()
