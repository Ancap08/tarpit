"""Run inside Blender 4.5. See docs/art/spike-v5/README.md for commands."""

import argparse
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import meadow
from cannon import build_cannon
from goblin import build_goblin

SCRATCH = Path("/private/tmp/tarpit-art-scratch")
OUT = HERE.parents[1] / "docs/art/spike-v5"


def linear(channel):
    c = channel/255
    return c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4


def factory(look):
    cache = {}
    clay = look == "clay"
    def mat(name, swatch):
        terrain = name in ("Meadow turf", "Ochre trail", "Studio sweep")
        if terrain:
            swatch = {
                "Meadow turf": "#79984D" if clay else "#557E55",
                "Ochre trail": "#D0A062" if clay else "#BA915C",
                "Studio sweep": "#264143" if clay else "#243641",
            }[name]
        key = (swatch, name.startswith(("Pitch glint", "Black pitch", "Tar blister")))
        if key in cache:
            return cache[key]
        color = [linear(int(swatch[i:i+2],16)) for i in (1,3,5)]
        m = bpy.data.materials.new(f"{look} | {name}")
        cache[key] = m
        m.diffuse_color = (*color, 1)
        m.use_nodes = True
        nodes, links = m.node_tree.nodes, m.node_tree.links
        shader = nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value = (.82 if clay else .40) if not key[1] else .24
        if terrain:
            shader.inputs["Roughness"].default_value = .84 if clay else .68
        shader.inputs["Specular IOR Level"].default_value = .29 if clay else .46
        # Broad variations in pigment. Raised edges catch a scuffed lighter paint colour.
        coord = nodes.new("ShaderNodeTexCoord")
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.8 if clay else 6
        noise.inputs["Detail"].default_value = 3
        links.new(coord.outputs["Generated"],noise.inputs["Vector"])
        ramp = nodes.new("ShaderNodeValToRGB")
        for elem,factor in zip(ramp.color_ramp.elements,(.47,1.30) if terrain else ((.70,1.19) if clay else (.75,1.12))):
            elem.color=(*[min(1,c*factor) for c in color],1)
        links.new(noise.outputs["Fac"],ramp.inputs[0])
        if name in ("Meadow turf","Ochre trail"):
            # Broken pigment on the modelling paste / sponge-stippled grass.
            grain=nodes.new("ShaderNodeTexNoise")
            grain.inputs["Scale"].default_value=76
            grain.inputs["Detail"].default_value=2
            links.new(coord.outputs["Generated"],grain.inputs[0])
            dabs=nodes.new("ShaderNodeValToRGB")
            dabs.color_ramp.elements[0].position=.48
            dabs.color_ramp.elements[1].position=.67
            dabs.color_ramp.elements[1].color=(.42,.42,.42,1)
            links.new(grain.outputs[0],dabs.inputs[0])
            fleck=nodes.new("ShaderNodeMixRGB")
            links.new(dabs.outputs[0],fleck.inputs[0])
            links.new(ramp.outputs[0],fleck.inputs[1])
            fleck.inputs[2].default_value=(*[min(1,c*1.42+.021) for c in color],1)
            links.new(fleck.outputs[0],shader.inputs["Base Color"])
        elif clay or terrain:
            links.new(ramp.outputs[0],shader.inputs["Base Color"])
        else:
            geo = nodes.new("ShaderNodeNewGeometry")
            wear = nodes.new("ShaderNodeValToRGB")
            wear.color_ramp.elements[0].position=.52
            wear.color_ramp.elements[1].position=.60
            wear.color_ramp.elements[1].color=(.40,.40,.40,1)
            links.new(geo.outputs["Pointiness"],wear.inputs[0])
            mix=nodes.new("ShaderNodeMixRGB")
            links.new(wear.outputs[0],mix.inputs[0])
            links.new(ramp.outputs[0],mix.inputs[1])
            mix.inputs[2].default_value=(*[min(1,c*.95+.13) for c in color],1)
            links.new(mix.outputs[0],shader.inputs["Base Color"])
        marks=nodes.new("ShaderNodeTexWave")
        marks.wave_type = "RINGS" if clay else "BANDS"
        marks.rings_direction = "SPHERICAL"
        marks.inputs["Scale"].default_value=3.3 if clay else 18
        marks.inputs["Distortion"].default_value=3.6 if clay else 9
        marks.inputs["Detail Scale"].default_value=1.2
        links.new(coord.outputs["Generated"],marks.inputs["Vector"])
        bump=nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value= .23 if clay else .09
        bump.inputs["Distance"].default_value= .008 if clay else .0016
        links.new(marks.outputs["Fac"],bump.inputs["Height"])
        links.new(bump.outputs[0],shader.inputs["Normal"])
        return m
    return mat


def light(name, pos, target, size, energy, color):
    data=bpy.data.lights.new(name,"AREA")
    data.shape="DISK"
    data.size=size
    data.energy=energy
    data.color=color
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location=pos
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def studio(look, sprites, engine):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.render.engine=engine
    if engine=="CYCLES":
        pref=bpy.context.preferences.addons["cycles"].preferences
        try:
            pref.compute_device_type="METAL"
            pref.refresh_devices()
            for device in pref.devices:
                device.use=device.type=="METAL"
            if any(d.use for d in pref.devices):
                scene.cycles.device="GPU"
        except TypeError:
            pass
        scene.cycles.samples=24 if look=="clay" else 16
        scene.cycles.use_denoising=True
        scene.cycles.max_bounces=4
        scene.cycles.use_adaptive_sampling=False
    else:
        scene.eevee.taa_render_samples=32
    scene.render.film_transparent=sprites
    scene.render.image_settings.file_format="PNG"
    scene.render.image_settings.color_mode="RGBA" if sprites else "RGB"
    scene.render.image_settings.compression=75
    scene.render.resolution_percentage=100
    scene.view_settings.view_transform="AgX"
    scene.view_settings.look="AgX - Medium High Contrast"
    world=bpy.data.worlds.new("Photographer's tent")
    world.use_nodes=True
    bg=world.node_tree.nodes["Background"]
    bg.inputs[0].default_value=(.68,.78,.86,1)
    bg.inputs[1].default_value=.24 if look=="clay" else .19
    scene.world=world
    cx,cy=(0,0) if sprites else (5,3.5)
    def lamp(name,offset,size,energy,color):
        light(name,(cx+offset[0],cy+offset[1],offset[2]),(cx,cy,0),size,energy,color)
    if look=="clay":
        lamp("Muslin softbox",(-5,-2,7),3.8,800,(1,.82,.64))
        lamp("Cream bounce",(3,-2,5),5,185,(1,.93,.82))
        lamp("Back light",(3,5,5),3.5,235,(1,.86,.60))
    else:
        lamp("Daylight key",(-5,-2,7),1.4,780,(1,.92,.79))
        lamp("Blue bounce",(3,-3,5),4,195,(.74,.86,1))
        lamp("Varnish rim",(3,5,4),2,300,(1,.93,.72))
    data=bpy.data.cameras.new("Copy stand")
    camera=bpy.data.objects.new("Copy stand",data)
    bpy.context.collection.objects.link(camera)
    scene.camera=camera
    data.type="ORTHO"
    return scene


def camera(scene,target,angle,width,look,sprites):
    cam=scene.camera
    a=math.radians(angle)
    cam.location=Vector(target)+Vector((0,-math.cos(a),math.sin(a)))*15
    cam.rotation_euler=(math.radians(90-angle),0,0)
    cam.data.ortho_scale=width
    cam.data.dof.use_dof=look=="clay" and not sprites
    cam.data.dof.focus_distance=15
    cam.data.dof.aperture_fstop=3.5


def render(scene,path,w,h,label):
    scene.render.resolution_x,scene.render.resolution_y=w,h
    scene.render.filepath=str(path)
    start=time.perf_counter()
    bpy.ops.render.render(write_still=True)
    elapsed=time.perf_counter()-start
    with (SCRATCH/"times.tsv").open("a") as f:
        print(label,w,h,f"{elapsed:.3f}",sep="\t",file=f)
    print(f"MEASURE {label} {w}x{h} {elapsed:.3f}s",flush=True)


def main():
    p=argparse.ArgumentParser()
    p.add_argument("task",choices=["board","sprites","bench","detail","cost"])
    p.add_argument("look",choices=["clay","painted"])
    p.add_argument("--engine",choices=["CYCLES","BLENDER_EEVEE_NEXT"])
    p.add_argument("--density",type=int,default=64)
    args=p.parse_args(sys.argv[sys.argv.index("--")+1:])
    SCRATCH.mkdir(exist_ok=True)
    (SCRATCH/"frames").mkdir(exist_ok=True)
    OUT.mkdir(exist_ok=True,parents=True)
    sprite=args.task in ("sprites","cost")
    if args.engine is None:
        args.engine="BLENDER_EEVEE_NEXT" if sprite else "CYCLES"
    scene=studio(args.look,sprite,args.engine)
    mat=factory(args.look)
    if not sprite:
        meadow.assemble(mat,build_goblin,build_cannon)
        if args.task=="detail":
            # Raking inspection angle used only to compare the two physical finishes.
            target=Vector((3.46,3.06,.42))
            offset=Vector((3.2,-5.7,3.5)).normalized()
            scene.camera.location=target+15*offset
            scene.camera.rotation_euler=(-offset).to_track_quat('-Z','Y').to_euler()
            scene.camera.data.ortho_scale=6.35
            scene.camera.data.dof.use_dof=args.look=="clay"
            scene.camera.data.dof.focus_distance=15
            scene.camera.data.dof.aperture_fstop=6.3
            render(scene,OUT/f"{args.look}-detail.png",800,426,f"{args.look}-detail")
            return
        for angle,tag in [(65,"tilt"),(90,"top")]:
            camera(scene,(5,3.5,0),angle,12,args.look,False)
            if args.task=="bench":
                render(scene,SCRATCH/f"bench-{args.look}-{args.engine}-{tag}.png",768,544,
                       f"bench-{args.look}-{args.engine}-{tag}")
                continue
            d=args.density
            render(scene,SCRATCH/f"{args.look}-{tag}-{d}.png",12*d,round(8.5*d),
                   f"{args.look}-{tag}-{scene.cycles.device}")
        return
    # Keep the projection, pivot and lamps fixed for every cell. Render each pose once per direction.
    if args.task=="cost":
        root=build_goblin(mat,0)
        root.scale=(meadow.GOBLIN_SCALE,)*3
        root.rotation_euler.z=-math.pi/2
        camera(scene,(0,0,.475),65,1.0,args.look,True)
        for size in (64,64,128,192):
            render(scene,SCRATCH/f"cost-{args.look}-{args.engine}-{size}.png",size,size,
                   f"cost-{args.look}-{args.engine}")
        return
    frame_dir=SCRATCH/("frames" if args.look=="painted" else "clay-frames")
    frame_dir.mkdir(exist_ok=True)
    models=[build_goblin(mat,i) for i in range(4)]+[build_cannon(mat)]
    for root in models:
        for o in root.children_recursive:
            o.hide_render=True
    for i,root in enumerate(models):
        scale=meadow.CANNON_SCALE if i==4 else meadow.GOBLIN_SCALE
        root.scale=(scale,)*3
        camera(scene,(0,0,.209 if i==4 else .475),65,1.0,args.look,True)
        for o in root.children_recursive:
            o.hide_render=False
        for n in range(8 if i==4 else 4):
            root.rotation_euler.z=-math.radians(n*(45 if i==4 else 90))
            name=f"cannon-{n}" if i==4 else f"goblin-{'NESW'[n]}-{i}"
            render(scene,frame_dir/f"{name}.png",64,64,f"{args.look}-{name}")
        for o in root.children_recursive:
            o.hide_render=True


if __name__=="__main__":
    main()
