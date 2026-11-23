"""Blender renders for the three painted grounds and matched-angle Meadow study."""

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

from build_slice import ROUTES, SCRATCH, STUDY


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


def painted_surface(map_id):
    """The trail is the union of 20-pixel-radius capsules along the map route."""
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

    points = [(x/32, 15-y/32) for x,y in ROUTES[map_id]]
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
    palettes = {
        "meadow": ("354F42", "7E8D54", "436748", "5B7A4A", "6C8551"),
        "switchback": ("4C5245", "9A9364", "626E50", "788257", "8C8960"),
        "riverbend": ("2F5549", "70945F", "3C6952", "537D58", "66885A"),
    }
    grass = colors(pigment, list(zip((.20,.84,.39,.55,.68), palettes[map_id])))
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
    if map_id == "riverbend":
        # The spring occupies the simulation's 4 by 10 blocked cells. Ripple
        # patterns, shallows and banks all remain inside its actual edges.
        xyz = nodes.new("ShaderNodeSeparateXYZ")
        connect(xyz.inputs[0], position)
        x,y = xyz.outputs["X"],xyz.outputs["Y"]
        bank = calc("MINIMUM", calc("MINIMUM", calc("SUBTRACT", x, 13),
                                    calc("SUBTRACT", 17, x)), calc("SUBTRACT", 10, y))
        # Curve the head of the spring and vary the banks by a few pixels.
        # Even at the widest point, the shallows stay within the water box.
        corner_x = calc("MAXIMUM", 0, calc("SUBTRACT", calc("ABSOLUTE",
                        calc("SUBTRACT", x, 15), 0), 1.58))
        corner_y = calc("MAXIMUM", 0, calc("SUBTRACT", y, 9.58))
        radius = calc("SQRT", calc("ADD", calc("MULTIPLY", corner_x, corner_x),
                                  calc("MULTIPLY", corner_y, corner_y)), 0)
        bank = calc("MINIMUM", bank, calc("SUBTRACT", .42, radius))
        bank = calc("SUBTRACT", bank, calc("MULTIPLY", noise(position,1.35,2), .14))
        current = noise(calc("MULTIPLY", position, (1.1,3.7,1), True), 1.1, 2, .7)
        water = colors(current, [(.23,"356B76"),(.79,"47858A"),(.50,"387A82")])
        water = mix(smooth_edge(.075,.35,bank), swatch("70978A"), water)
        water = mix(smooth_edge(.025,.10,bank), swatch("415E52"), water)
        color = mix(smooth_edge(-.004,.018,bank), color, water)
    shader = nodes.get("Principled BSDF")
    connect(shader.inputs["Base Color"], color)
    shader.inputs["Roughness"].default_value = .93
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = .012
    bump.inputs["Strength"].default_value = .12
    connect(bump.inputs["Height"], brush)
    connect(shader.inputs["Normal"], bump.outputs[0])
    return material


def scatter_details(map_id):
    """Batch low painted relief into one mesh; there are no scenery sprites here."""
    rng = random.Random({"meadow":734, "switchback":421, "riverbend":1708}[map_id])
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

    points = [(x/32,15-y/32) for x,y in ROUTES[map_id]]
    def on_grass(x,y,margin=.07):
        if map_id == "riverbend" and 12.92 < x < 17.08 and y < 10.08:
            return False
        for (ax,ay),(bx,by) in zip(points,points[1:]):
            dx = x-min(max(x,min(ax,bx)),max(ax,bx))
            dy = y-min(max(y,min(ay,by)),max(ay,by))
            if dx*dx+dy*dy < (.625+margin)**2:
                return False
        return True

    # Tufts follow patches rather than a regular jittered tile grid.
    for _ in range(78 if map_id == "switchback" else 146):
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
    if map_id == "switchback":
        beds = beds[::4]
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
    for _ in range(72 if map_id == "switchback" else 26):
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
    if map_id == "switchback":
        # Weathered, low shelves with a split crest and small downhill scree.
        # They sit flush enough with the grass to keep tower pads readable.
        for cx,cy in [(1.3,2),(3.8,13.65),(7.9,5.6),(12,1.3),(22.4,10.7),
                      (24.6,13.6),(26.7,5.4),(29.9,9.2)]:
            for _ in range(14):
                x,y = rng.gauss(cx,.63),rng.gauss(cy,.26)
                size = rng.uniform(.12,.43)
                if on_grass(x,y,.6):
                    dab(x,y,.010,size,size*.44,.31,size*.27,
                        rng.choice(("8B8B78","A2A18A","9B9983","8E927F")),6)
                    dab(x-.02,y+.025,.025,size*.48,size*.15,.31,size*.25,"999984",5)
    if map_id == "riverbend":
        # Broken brush arcs catch the water's light in small groups. A few
        # clusters of reeds lean inward from the banks, away from tower cells.
        for _ in range(53):
            x,y = rng.uniform(13.35,16.65), rng.uniform(0,9.75)
            width = rng.uniform(.12,.36)
            for shift in (0, .09) if rng.random() < .28 else (0,):
                strip=[]
                for i in range(9):
                    t=i/8
                    px=x+(t-.5)*width*2
                    py=y+shift+.043*math.sin(t*math.pi)
                    strip.extend([(px,py,.009),(px,py+.035*math.sin(t*math.pi),.009)])
                shape(strip,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(8)],
                      rng.choice(("A4C7BD","82AEAB","9EC3B9")))
        for side in (13.14,16.86):
            for _ in range(39):
                x=side+rng.uniform(-.07,.07)
                y=rng.uniform(0,9.62)
                size=rng.uniform(.045,.13)
                dab(x,y,.009,size,size*.72,rng.uniform(0,3),size*.28,
                    rng.choice(("798C79","82917D","647F71")),7)
        for x,y,side in [(13.05,1.8,1),(13.07,5.8,1),(13.10,9.65,1),
                         (16.9,3.3,-1),(16.94,8.2,-1)]:
            for _ in range(26):
                bx=x+side*rng.uniform(0,.21)
                by=y+rng.uniform(-.35,.29)
                a=(0 if side==1 else math.pi)+rng.uniform(-1.05,1.05)
                leaf(bx,by,rng.uniform(.095,.35),.027,a,rng.uniform(.08,.24),
                     rng.choice(("708957","849358","9E9E69","527957")))
        # Timber road deck above the head of the spring. No extra water or
        # implied side path is painted into buildable ground.
        shape([(13.18,11.35,.022),(16.82,11.35,.022),(16.82,12.65,.022),
               (13.18,12.65,.022)],[(0,1,2,3)],"6E5845")
        for i in range(14):
            x=13.25+i*.25
            shade=rng.choice(("A57F55","AE885C","A7835C","AD8A63"))
            shape([(x,11.43,.028),(x+.235,11.43,.028),(x+.235,12.57,.028),
                   (x,12.57,.028)],[(0,1,2,3)],shade)
            for j in range(2):
                gx=x+rng.uniform(.035,.18)
                gy=rng.uniform(11.6,12.38)
                dab(gx,gy,.033,rng.uniform(.08,.23),.012,math.pi/2,.003,"92724E",5)
        for y in (11.36,12.50):
            shape([(13.20,y,.039),(16.8,y,.039),(16.8,y+.12,.039),
                   (13.20,y+.12,.039)],[(0,1,2,3)],"72573B")
            for x in (13.20,15,16.8):
                dab(x,y+.055,.042,.098,.088,.4,.07,"6A513E",8)
                dab(x,y+.055,.105,.074,.065,.4,.01,"BC9C71",8)
        # Stone culvert at the spring head explains the raised road on the
        # bank above it. The opening faces downstream, inside the water.
        for i in range(13):
            a=math.pi*i/12
            x=15+.59*math.cos(a)
            y=9.76+.21*math.sin(a)
            dab(x,y,.021,.11,.13,a,rng.uniform(.07,.12),
                rng.choice(("78887C","879283","9A9C86")),6)
        for i in range(3):
            y=9.65-i*.10
            dab(15,y,.015,.34+i*.09,.020,0,.008,"85AEA3",9)
    mesh = bpy.data.meshes.new("Pasture brushwork")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Ground details", mesh)
    bpy.context.collection.objects.link(obj)
    paint = render.factory("painted")
    for color in materials:
        mesh.materials.append(paint("Ground flecks", "#"+color))
    mesh.polygons.foreach_set("material_index", index)


def ground(map_id="meadow"):
    scene = studio("CYCLES",False)
    bpy.ops.mesh.primitive_plane_add(size=2, location=(15,7.5,0))
    plane = bpy.context.object
    plane.scale = (15.1,7.6,1)
    plane.data.materials.append(painted_surface(map_id))
    scatter_details(map_id)
    render.camera(scene,(15,7.5,0),90,30,"painted",False)
    render.render(scene,SCRATCH/f"{map_id}.png",1920,960,f"{map_id}-ground")


if __name__ == "__main__":
    SCRATCH.mkdir(parents=True, exist_ok=True)
    camera_study() if sys.argv[-1] == "study" else ground(sys.argv[-1] if sys.argv[-1] in ROUTES else "meadow")
