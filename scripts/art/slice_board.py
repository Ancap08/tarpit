"""Blender renders for the Meadow ground and the matched-angle study."""

import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import slice_scenery
import render
import slice_enemies
import slice_towers

from build_slice import ROUTE, SCRATCH, STUDY


def studio(engine, transparent):
    scene = render.studio("painted", transparent, engine)
    center = Vector((0, 0, 0)) if transparent else Vector((15, 7.5, 0))
    lights = {"Daylight key": (-5, 3, 7), "Blue bounce": (3, -3, 5),
              "Varnish rim": (3, 5, 4)}
    for name, offset in lights.items():
        lamp = bpy.data.objects[name]
        # Move the ground lights far away so the whole meadow sees the
        # same studio as a single piece. Preserve solid angle and exposure.
        radius = 1 if transparent else 18
        lamp.location = center + Vector(offset) * radius
        lamp.rotation_euler = (-Vector(offset)).to_track_quat("-Z", "Y").to_euler()
        lamp.data.size *= radius
        lamp.data.energy *= radius**2
    return scene


def camera_study():
    scene = studio("BLENDER_EEVEE_NEXT", True)
    paint = render.factory("painted")
    for kind, _, _, bearing in STUDY:
        if kind in ("spruce", "birch"):
            builder = slice_scenery
        elif kind in ("wolf", "troll", "goblin"):
            builder = slice_enemies
        else:
            builder = slice_towers
        root = builder.build(kind, paint)
        root.rotation_euler.z -= math.radians(bearing)
        for angle in (90, 65, 48):
            render.camera(scene, (0,0,0), angle, 3, "painted", True)
            render.render(scene, SCRATCH/f"study-{kind}-{angle}.png", 192, 192,
                          f"study-{kind}-{angle}")
        for obj in root.children_recursive:
            obj.hide_render = True


def swatch(hex_color):
    return tuple(render.linear(int(hex_color[i:i+2], 16)) for i in (0,2,4)) + (1,)


def painted_surface():
    """One flat material. The trail is the union of seven 20-pixel capsules."""
    material = bpy.data.materials.new("Painted pasture, earth and worn verge")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    position = nodes.new("ShaderNodeNewGeometry").outputs["Position"]

    def connect(socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            links.new(value, socket)
        else:
            socket.default_value = value

    def calc(operation, a, b, vector=False):
        node = nodes.new("ShaderNodeVectorMath" if vector else "ShaderNodeMath")
        node.operation = operation
        connect(node.inputs[0], a)
        connect(node.inputs[1], b)
        return node.outputs["Value" if vector and operation == "DISTANCE" else 0]

    def noise(coord, scale, detail, distortion=0):
        node = nodes.new("ShaderNodeTexNoise")
        connect(node.inputs[0], coord)
        node.inputs["Scale"].default_value = scale
        node.inputs["Detail"].default_value = detail
        node.inputs["Distortion"].default_value = distortion
        return node.outputs["Fac"]

    def colors(factor, stops):
        ramp = nodes.new("ShaderNodeValToRGB")
        connect(ramp.inputs[0], factor)
        points = ramp.color_ramp.elements
        for i, (pos, color) in enumerate(stops):
            point = points[i] if i < 2 else points.new(pos)
            point.position, point.color = pos, swatch(color)
        return ramp.outputs[0]

    def mix(factor, a, b):
        node = nodes.new("ShaderNodeMixRGB")
        for sock, value in zip(node.inputs, (factor,a,b)):
            connect(sock, value)
        return node.outputs[0]

    points = [(x/32, 15-y/32) for x,y in ROUTE]
    distance = None
    for (ax,ay),(bx,by) in zip(points,points[1:]):
        lo = (min(ax,bx), min(ay,by), 0)
        hi = (max(ax,bx), max(ay,by), 0)
        nearest = calc("MINIMUM", calc("MAXIMUM", position, lo, True), hi, True)
        d = calc("DISTANCE", nearest, position, True)
        distance = d if distance is None else calc("MINIMUM", distance, d)

    # Large scumbled fields of cool and warm green, with smaller directional
    # bristle marks. All textures are sampled in cells, not frame coordinates.
    dragged = calc("MULTIPLY", position, (.72,1.85,1), True)
    glaze = noise(dragged, .37, 2.3, .65)
    brush = noise(dragged, 4.8, 2, .75)
    pigment = calc("ADD", calc("MULTIPLY", glaze, .80), calc("MULTIPLY", brush,.20))
    grass = colors(pigment, [(.20,"354F42"),(.84,"7E8D54"),(.39,"436748"),
                             (.55,"5B7A4A"),(.68,"6C8551")])
    # Stipple from a short, dry brush. Keep tiny distinct flecks inside
    # the broad green washes, mirroring the painted finish on the figures.
    flecks = noise(calc("MULTIPLY", position, (1.1,1.45,1), True), 12, 1.5, .3)
    fleck_opacity = calc("MULTIPLY", calc("MAXIMUM", 0,
                         calc("SUBTRACT", flecks, .49)), .72)
    earth = colors(noise(dragged, 1.6, 3, .35),
                   [(.20,"B69366"),(.80,"C8A77A"),(.48,"C1A071")])
    granules = noise(position, 9, 2)
    sand = calc("MINIMUM", .21, calc("MAXIMUM", 0, calc("MULTIPLY",
               calc("SUBTRACT", noise(position, 19, 1, .1), .57), 1.2)))
    earth = mix(sand, earth, swatch("D9BF98"))
    shifted = calc("ADD", distance, calc("MULTIPLY", calc("SUBTRACT", granules,.50), .057))

    def smooth_edge(start, end, sampled_distance=shifted):
        n = nodes.new("ShaderNodeMapRange")
        n.interpolation_type = "SMOOTHSTEP"
        connect(n.inputs["Value"], sampled_distance)
        n.inputs["From Min"].default_value = start
        n.inputs["From Max"].default_value = end
        return n.outputs[0]
    # Give the full road a continuous dark umber cut edge and a quiet grass
    # shoulder. The original 40-pixel field of travel stays in the same place.
    grass = mix(calc("MULTIPLY", fleck_opacity, smooth_edge(.73, 1.36, distance)),
                grass, swatch("9EA275"))
    soil = mix(smooth_edge(.565, .624), earth, swatch("786244"))
    color = mix(smooth_edge(.669, .705), soil, grass)
    shader = nodes.get("Principled BSDF")
    connect(shader.inputs["Base Color"], color)
    shader.inputs["Roughness"].default_value = .93
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = .012
    bump.inputs["Strength"].default_value = .12
    connect(bump.inputs["Height"], brush)
    connect(shader.inputs["Normal"], bump.outputs[0])
    return material


def scatter_details():
    """Batch low painted relief into one mesh; there are no scenery sprites here."""
    rng = random.Random(734)
    vertices, faces, materials, index = [], [], {}, []
    def shape(points, polygons, color):
        base = len(vertices)
        vertices.extend(points)
        material_index = materials.setdefault(color, len(materials))
        for face in polygons:
            faces.append(tuple(base+i for i in face))
            index.append(material_index)

    def dab(x,y,z,length,width,angle,height,color,n=7):
        ca,sa = math.cos(angle), math.sin(angle)
        points = [(x-.08*length*ca,y-.08*length*sa,z+height)]
        for i in range(n):
            a = math.tau*i/n
            l = length*math.cos(a) * rng.uniform(.93,1.07)
            w = width*math.sin(a) * rng.uniform(.90,1.10)
            points.append((x+ca*l-sa*w, y+sa*l+ca*w, z))
        shape(points,[(0,1+i,1+(i+1)%n) for i in range(n)],color)

    def leaf(x,y,length,width,a,height,color):
        c,s = math.cos(a), math.sin(a)
        def point(l,w,z):
            return (x+c*l-s*w,y+s*l+c*w,z)
        shape([point(0,0,.005),point(length*.48,width,height*.35),
               point(length,0,height),point(length*.52,-width,height*.48),
               point(length*.47,0,height*.70)], [(0,4,1),(1,4,2),(2,4,3),(3,4,0)],color)

    points = [(x/32,15-y/32) for x,y in ROUTE]
    def on_grass(x,y,margin=.07):
        for (ax,ay),(bx,by) in zip(points,points[1:]):
            dx = x-min(max(x,min(ax,bx)),max(ax,bx))
            dy = y-min(max(y,min(ay,by)),max(ay,by))
            if dx*dx+dy*dy < (.625+margin)**2:
                return False
        return True

    # Tufts follow patches rather than a regular jittered tile grid.
    for _ in range(146):
        cx,cy = rng.uniform(-.2,30.2), rng.uniform(-.2,15.2)
        wind = rng.uniform(0,math.tau)
        for _ in range(rng.randrange(2,10)):
            x,y = rng.gauss(cx,.54),rng.gauss(cy,.30)
            if on_grass(x,y,.28):
                for _ in range(rng.randrange(2,5)):
                    leaf(x,y,rng.uniform(.065,.20),rng.uniform(.013,.032),
                         wind+rng.uniform(-1.45,1.45),rng.uniform(.025,.10),
                         rng.choice(("5B8053","63865A","829D63","9DAA72")))
    beds = [(1.8,4.1),(2.1,12.1),(5.9,1.4),(8.2,7.1),(11.15,14.25),
            (16.6,6.45),(18,1.0),(20.8,12.6),(23.7,4.35),(26,13.3),(28.7,1.45)]
    for j,(cx,cy) in enumerate(beds):
        for _ in range(rng.randrange(7,14)):
            x,y = rng.gauss(cx,.37),rng.gauss(cy,.21)
            if not on_grass(x,y,.66):
                continue
            a = rng.uniform(0,math.tau)
            leaf(x,y,.12,.032,a,.05,"4D7653")
            leaf(x,y,.10,.028,a+2.2,.055,"73964C")
            size = rng.uniform(.029,.053)
            for k in range(5):
                b = a+k*math.tau/5
                dab(x+size*.74*math.cos(b),y+size*.74*math.sin(b),.037,
                    size*.76,size*.49,b,.017,("E6D7A7","CABB83","ADA9B8")[j%3],5)
            dab(x,y,.06,size*.46,size*.46,0,.014,"B98F62",6)
    # Four patches of wild clover. Each trefoil is three folded, veined leaves.
    # The difference in leaf scale breaks up the distant flower-and-grass pattern.
    for cx,cy in [(2.10,11.55),(9.85,2.82),(15.76,7.60),(27.40,4.32)]:
        for _ in range(27):
            x,y = rng.gauss(cx,.44),rng.gauss(cy,.28)
            if not on_grass(x,y,.51):
                continue
            turn = rng.uniform(0,math.tau)
            length = rng.uniform(.06,.17)
            for i in range(3):
                a = turn+i*math.tau/3
                l = length*rng.uniform(.85,1.15)
                dab(x+.49*l*math.cos(a), y+.49*l*math.sin(a), .018,
                    l*.60, l*.44, a, .020, rng.choice(("728E54","739452","88A164")))
                leaf(x,y,l*.83,.009,a,.040,"9DA772")
    # Flat lichen-flecked stones in outcrops, small enough to build over.
    for _ in range(26):
        cx,cy = rng.uniform(0,30),rng.uniform(0,15)
        for i in range(rng.randint(2,5)):
            x,y = cx+rng.gauss(0,.17),cy+rng.gauss(0,.12)
            if on_grass(x,y,.35):
                s = rng.uniform(.055,.17)
                dab(x,y,.005,s,s*.65,rng.uniform(0,4),s*.48,
                    rng.choice(("989F88","939982","849185")),7)
    for (ax,ay),(bx,by) in zip(points, points[1:]):
        length=math.hypot(bx-ax,by-ay)
        dx,dy=(bx-ax)/length,(by-ay)/length
        angle=math.atan2(dy,dx)
        for side in (-1,1):
            u=.45
            while u < length-.45:
                half=rng.uniform(.08,.26)
                offset=side*(.27+.035*math.sin(u*1.5))
                x,y=ax+u*dx-offset*dy, ay+u*dy+offset*dx
                dab(x,y,.004,half,.013,angle,.0008,
                    rng.choice(("BC996A","C9A878","BC9A70")),8)
                u+=half*2+rng.uniform(.12,.49)
        for _ in range(round(length*3)):
            u,offset=rng.uniform(0,length),rng.uniform(-.56,.56)
            x,y=ax+u*dx-offset*dy, ay+u*dy+offset*dx
            size=rng.uniform(.018,.044)
            dab(x,y,.006,size,size*.68,angle+rng.uniform(-1.1,1.1),size*.38,
                rng.choice(("B4916D","D2B68E","A79378","CBAF89")),6)
    mesh = bpy.data.meshes.new("Pasture brushwork")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Ground details", mesh)
    bpy.context.collection.objects.link(obj)
    paint = render.factory("painted")
    for color in materials:
        mesh.materials.append(paint("Ground flecks", "#"+color))
    mesh.polygons.foreach_set("material_index", index)


def ground():
    scene = studio("CYCLES",False)
    bpy.ops.mesh.primitive_plane_add(size=2, location=(15,7.5,0))
    plane = bpy.context.object
    plane.scale = (15.1,7.6,1)
    plane.data.materials.append(painted_surface())
    scatter_details()
    render.camera(scene,(15,7.5,0),90,30,"painted",False)
    render.render(scene,SCRATCH/"meadow.png",1920,960,"slice-ground")


if __name__ == "__main__":
    SCRATCH.mkdir(parents=True, exist_ok=True)
    camera_study() if sys.argv[-1] == "study" else ground()
