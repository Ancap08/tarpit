"""Render the four result-page vignettes. Run headless Blender -P town_portraits.py."""
import math
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
from town import CREAM, GOLD, INK, OUT, RAW, RED, STATES, WOOD, clear_model, house, pennant, resident, studio, timber_fence

PORTRAITS = OUT / "town-portraits"


def apple_tree(x, y, state):
    import meadow as m
    bark = "#754A37"
    m.twig("Old apple trunk",(x,y,.01),(x+.05,y,1.04),.13,.078,bark)
    for dx,dy,z,r in ((-.29,-.03,1.36,.42),(.25,-.04,1.49,.45),
                       (-.08,.13,1.71,.45),(.18,.04,1.83,.32)):
        m.twig("Crooked bough",(x,y,.65),(x+dx,y+dy,z),.07,.035,bark)
        m.peb("Autumn leaves",(x+dx,y+dy,z),(r,r*.74,r*.76),
              "#8E9451" if state >= 2 else "#718B4D")
    for i in range(7 if state == 0 else 3):
        a = i * 2.4
        m.peb("Harvest apple",(x-.05+math.cos(a)*.44,y-.30,1.55+math.sin(a)*.22),
              (.065,.058,.068),"#AD4932")


def market(x, y, state):
    import meadow as m
    blue = "#397D84"
    for side in (-1,1):
        m.twig("Stall upright",(x+side*.58,y,0),(x+side*.58,y,1.13),.042,.038,WOOD)
    for i in range(7):
        a = x-.69+i*.20
        shade = (blue,CREAM)[i%2] if state < 3 else (RED,CREAM)[i%2]
        cloth = m.box("Striped awning",(a,y,1.08),(.204,.63,.038),shade,.011)
        cloth.rotation_euler.x = .23
        m.peb("Scalloped valance",(a,y-.300,.974),(.106,.035,.088),shade)
    m.box("Slatted market counter",(x,y,.28),(1.20,.43,.45),WOOD,.022)
    for i in range(7):
        m.box("Counter facing",(x-.506+i*.168,y-.224,.277),(.151,.038,.41),
              ("#BE8958","#D0A270")[i%2],.016)
    m.box("Counter top",(x,y,.539),(1.27,.52,.072),INK)
    for i in range(max(0,4-state)):
        m.peb("Golden bread",(x-.39+.25*i,y-.02,.619),(.113,.08,.059),"#DE9D4D")


def cart(x, y, state):
    import meadow as m
    for side in (-1,1):
        # The wheel is in a vertical plane. The little hub stands proud of its spokes.
        vy = y+side*.22
        pts = [(x+math.cos(i*math.tau/20)*.193,vy,.21+math.sin(i*math.tau/20)*.193) for i in range(21)]
        m.line("Bentwood wheel rim",pts,.030,INK)
        for i in range(4):
            dx,dz = math.cos(i*math.pi/4)*.17,math.sin(i*math.pi/4)*.17
            m.twig("Spoke",(x-dx,vy,.21-dz),(x+dx,vy,.21+dz),.013,.013,WOOD)
        m.peb("Brass axle pin",(x,vy,.21),(.046,.042,.046),GOLD)
        m.twig("Handcart shaft",(x+.11,vy,.31),(x+.80,vy,.15),.031,.027,WOOD)
    m.box("Cart floor",(x,y,.31),(.75,.42,.08),WOOD)
    for i in range(3-state):
        m.peb("Burlap coin sack",(x-.18+.20*i,y,.445),(.115,.128,.159),"#BB894E")
        m.twig("Gathered neck",(x-.18+.20*i,y,.54),(x-.19+.20*i,y,.62),.045,.067,GOLD)


def laundry(state):
    import meadow as m
    # A drooping string of sky-blue kerchiefs runs from the inn to the market.
    pts = [(0.88,.03,1.52),(1.18,.00,1.37),(1.48,-.015,1.34),(1.76,.01,1.39),(2.13,.02,1.47)]
    if state >= 2:
        pts = [(.88,.03,1.52),(.99,.025,.98),(1.02,.018,.73)]
    m.line("Hemp washing line",pts,.014,INK)
    for i,(x,y,z) in enumerate(pts[1:-1]):
        m.mesh("Kerchief hung by two corners",
               [(x-.09,y,z+.03),(x+.09,y,z),(x+.046,y-.02,z-.215)],
               [(0,1,2)],("#346D80","#E1AE5B","#AA5A46")[i])


def smoke(state, x, y, z):
    import meadow as m
    if state == 0:
        return
    for i in range(3 if state == 1 else 5):
        r = .076 + .022*i
        m.peb("Curl of woodsmoke",(x+.091*i+.020*i*i,y+.01*i,z+.10*i-.008*i*i),(r*(1.12+.12*i),r*.77,r*.86),
              (("#D1C4AA","#B9AFA2","#A6A09B") if i < 2 else ("#E2D3B7","#CDC3B2","#BAB2A9"))[state-1])


def square(state):
    import meadow as m
    # An irregular bank gives the miniature a finished silhouette on parchment.
    colors = ["#9DA670","#A7A06B","#938C64","#857A62"]
    m.ringbody("Bank of the high street",(0,0,0),(
        (-.17,1.86,.65,0,.03),(-.12,2.67,1.01,0,.03),(-.015,2.88,1.14,0,0),
        (0,2.70,1.05,0,0)),colors[state],sides=68,wobble=.035)
    for i in range(22):
        a = i*2.40
        x = 2.55*math.cos(a)
        y = .89*math.sin(a)
        m.peb("Stone at the edge of the common",(x,y,.017),(.093,.058,.042),"#8C8372",a)
    m.peb("Ochre square",(0,-.30,.003),(1.92,.62,.026),"#C5A178")
    apple_tree(-2.12,.23,state)
    # Two distinct roof heights, a narrow front shop, and the market wagon.
    house(-1.16,.39,.93,state,.23)
    house(.15,.23,1.50,state,-.31)
    market(1.87,.27,state)
    timber_fence(-2.36,-.30,1.06,state)
    pennant(-1.77,-.27,1.84,state,False)
    cart(1.49,-.47,state)
    laundry(state)
    smoke(state,.60,.49,1.87)
    if state < 2:
        resident(-.67,-.77,1.06,"#549F95","#D99E77","#ECBE74",state == 0)
    if state == 0:
        resident(.70,-.79,.87,"#BD5140","#E2B488","#B37B49",True)
    if state < 2:
        # The baker's brindled cat curls its tail by the market cart.
        x,y = 1.05,-.65
        m.peb("Cat in the square",(x,y,.123),(.142,.092,.128),"#C98348")
        m.peb("Cat face",(x-.088,y-.03,.265),(.107,.091,.093),"#E7AE70")
        for side in (-1,1):
            m.twig("Pointed ear",(x-.09+side*.06,y-.009,.31),
                   (x-.09+side*.086,y,.385),.046,.005,"#A06743")
            m.peb("Bright cat eye",(x-.092+side*.042,y-.11,.273),(.011,.009,.014),INK)
        m.line("Question-mark tail",[(x+.091,y,.08),(x+.178,y,.13),(x+.204,y,.28),
                                     (x+.175,y,.34),(x+.148,y,.32)],.030,"#A6693D")
    for i in range(5 if state < 2 else 2):
        x,y = -1.81+.111*i,-.66-abs(math.sin(i))*.08
        m.twig("Hollyhock stem",(x,y,0),(x,y,.17+.031*(i%2)),.014,.010,"#507049")
        m.peb("Hollyhock blossom",(x,y,.19+.031*(i%2)),(.049,.034,.043),("#CE7773",CREAM)[i%2])


def render_pictures():
    import bpy
    import meadow as m
    import render
    RAW.mkdir(parents=True,exist_ok=True)
    scene = studio()
    scene.eevee.taa_render_samples = 24
    render.camera(scene,(.073,0,.88),23,6.29,"painted",True)
    scene.render.resolution_x,scene.render.resolution_y = 720,360
    for state,label in enumerate(STATES):
        root = m.group("Frontier high street")
        m.parent = root
        square(state)
        scene.render.filepath = str(RAW / f"portrait-page-{label}.png")
        bpy.ops.render.render(write_still=True)
        clear_model(root)


def compress():
    from PIL import Image
    PORTRAITS.mkdir(parents=True,exist_ok=True)
    for label in STATES:
        with Image.open(RAW / f"portrait-page-{label}.png") as image:
            image.resize((480,240), Image.Resampling.LANCZOS).save(PORTRAITS / f"{label}.webp",quality=91,method=6)


if __name__ == "__main__":
    if "bpy" in sys.modules:
        render_pictures()
        subprocess.run(["python3",str(Path(__file__).resolve())],check=True)
    else:
        compress()
