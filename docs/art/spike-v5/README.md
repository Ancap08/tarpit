# Meadow in miniature

**Take the painted miniatures forward at 65° from the horizon.** The cooler meadow separates the amber bow, red gun carriage and black pitch, and the shadow beneath the cannonball makes the shot read as airborne. That angle shows the wheels and faces while keeping the rows and columns aligned. I would ship the scripted rendering pipeline. I would give the characters and their smallest silhouettes to an artist before shipping the art.

For the painted set, allow **0.82 MB at 1× or 2.71 MB at 2×**, roughly **2–4 minutes per batch**, and **12–20 artist-days** for a production pass. The image estimates use measured PNGs. The person-time estimate assumes reuse of the rigs and four poses per enemy.

![Current game and two tabletop finishes, with matched Meadow crops and actual-size phone samples](comparison.png)

## What the images show

The source is the first two bends of Meadow, game pixels x 0–319 and y 64–287. I used ten columns and seven rows to keep both bends and the cave entrance together. Each candidate uses the same models, positions and trail width of 1.25 cells. The screenshot shows its original wave and HUD-free map crop. The diorama stages the six requested pieces around the same trail. [Original frame](../../../e2e/__screenshots__/visual.spec.ts/new-towers.png)

The scale is horizontal pixels per cell. A 32 px cell is 32 × 32 from overhead and 32 × 29 at 65°. The board has no camera yaw or perspective. The 64 px images are native renders, the 32 px images are filtered reductions, and the 20 px images crop away the studio margin. Open a phone crop at 100% to judge it.

| View | 64 px per cell | 32 px per cell | 20 px per cell |
|---|---|---|---|
| Painted, 65° | [The club, wheel hubs and tar spill separate.](painted-tilt-64.png) | [The bow and black pit read fastest.](painted-tilt-32.png) | [The Wolf reads as a pale quadruped. Its species is uncertain.](painted-tilt-20.png) |
| Painted, overhead | [Best view of the trail and footprints.](painted-top-64.png) | [The wheel faces and Troll’s expression disappear.](painted-top-32.png) | [The Cannon depends heavily on its red sides and brass muzzle.](painted-top-20.png) |
| Clay, 65° | [Warmest finish, with soft shadows around the bases.](clay-tilt-64.png) | [The Troll’s broad shoulders and club survive.](clay-tilt-32.png) | [The small green Goblin loses its expression.](clay-tilt-20.png) |
| Clay, overhead | [The bow stave is clear, the spruce becomes a rosette.](clay-top-64.png) | [The circle beneath the Wolf competes with its body.](clay-top-32.png) | [The three enemies separate mainly by size and colour.](clay-top-20.png) |

- [Comparison sheet](comparison.png) — 2,056 × 1,425. The five large panels match the source crops pixel for pixel. The lower row isolates what the tilt contributes.
- [Clay detail](clay-detail.png) — the barrel and cudgel show tool marks. The shallow focus and matte colour sell the material better here than at game size.
- [Painted detail](painted-detail.png) — the cannonball has a distinct shadow and the bore has depth. The rounded Troll still looks assembled from simple forms.
- [Goblin walk](goblin-walk-2x.png) — four phases across, north/east/south/west down. Turning the face upward and counter-swinging the hands made the side walk visible.
- [Cannon turn](cannon-turn-2x.png) — eight bearings clockwise from north. A single brass muzzle marks the firing end, including directions where the bore is hidden.

## Sprite and build cost

Each proof frame occupies a transparent 64 × 64 cell. The ground pivots, in pixels from the top left, are approximately (32, 44.85) for the Goblin and (32, 37.65) for the Cannon. Every direction and phase uses the same pivot within its sheet. The 1× estimates use actual 32 × 32 alpha-aware reductions packed in scratch.

| Painted PNG assets | 1× bytes | 2× bytes | Basis |
|---|---:|---:|---|
| Cannon proof | 12,832 | 43,199 | Eight cells |
| Goblin proof | 19,155 | 64,476 | Sixteen cells |
| All towers | 307,968 | 1,036,776 | Six types × four appearances × eight directions |
| All enemies | 344,790 | 1,160,568 | Five ordinary 16-frame cycles plus two larger bosses |
| Shared map pieces | 169,637 | 517,616 | 32 terrain tiles and 16 larger scenery stamps |
| **Estimated art total** | **822,395** | **2,714,960** | Lossless PNG payload, one density |

The requested tower budget includes level 1, level 2 and two level-3 branches. The current design spec has one upgrade per tower. I budgeted the larger proposed set, including eight directions even for a stationary pit. For bosses I allowed 2× and 3× the ordinary frame width and multiplied the Goblin bytes by four and nine respectively. For terrain I measured six RGB tile crops and three two-cell-square scenery crops from the painted overhead view. The kit is shared across maps. Density, empty pixels and atlas packing will affect actual compression. These figures cover the requested pieces, walking and turning. Additional attacks, deaths and effects would need their own allowance.

Using the brief’s **1.4 MB** current build and **20 MB** budget, adding one density gives about **2.22 MB** or **4.11 MB**. Including both gives **4.94 MB** before credit for replaced art. MB is decimal here. These are download-size estimates. The **5,267,299 bytes** in this review folder include comparison and detail images that a player would never download.

## Time on this Mac

Blender 4.5.11 LTS, Apple M4 Mac mini, 10-core GPU and 16 GB memory. Times surround one headless render through PNG write. They exclude Blender launch, model construction and sheet assembly.

| Finish | 768 × 544 board, 65° / overhead | 800 × 426 detail | 64 px Goblin, mean of 16 | 64 px Cannon, mean of 8 |
|---|---:|---:|---:|---:|
| Clay | 1.74 / 1.42 s | 1.48 s | 0.20 s | 0.20 s |
| Painted | 2.32 / 1.69 s | 1.93 s | 0.21 s | 0.21 s |

The board and detail use Cycles on Metal with denoising, 24 samples for clay and 16 for paint. EEVEE at 32 samples rendered the second overhead view in each benchmark in 0.58–0.67 s, but the soft contact under the clay pieces weakened and the painted board lost the Cycles curvature wear. For transparent sprites the finish held up in a side-by-side check. EEVEE at 32 samples was faster there, so both sprite runs use it.

The full estimate covers 192 tower frames, 80 ordinary enemy frames, 32 boss frames and 48 map assets. A painted Goblin at 128 and 192 px took 0.18 and 0.20 s in EEVEE, used as boss-size timing proxies. Charging the map frames at approximately the same rate gives about 72 seconds of render calls for paint. Allow 2–4 minutes for rendering, loading models and packing in batches. The 1× set can be reduced from the 2× frames in the same run.

## Production call

At 32 px I can distinguish these three towers without labels. At 20 px the bow and pit still have strong shapes, and I can follow the three enemies by size and colour. I would hesitate to call the Wolf a wolf on an unfamiliar board. Its pale ruff eats into the muzzle, and the green Goblin becomes a head on a base. I would darken the Wolf’s back, exaggerate its ear-to-muzzle profile, and test a one-pixel contrasting rim on the Goblin against both trail and grass. Dense-wave recognition, play on a physical phone, and the complete roster remain unverified.

The trees repeat their canopy pieces, the terrain stipple is uniform, and the Troll’s hands and club lack the character of a hand-sculpted miniature. Scripting earns its keep on repeatable cameras, variants, rotations, lighting, packing and exports. My artist allowance is 3–5 days for silhouettes and colour keys, 6–10 for modelling, upgrade branches and gait, and 3–5 for scenery and native-size revisions. Gameplay integration and device testing are additional.

## Rebuild and verification

Rebuild from the art worktree on this Mac.

```sh
python3 scripts/art/build_spike.py
```

The script uses the installed Blender, Python/Pillow, system fonts and FFmpeg. Geometry, paint, surface marks, lighting, depth of field and shadows are procedural. All intermediate frames and the timing log go to `/private/tmp/tarpit-art-scratch/`. `--pack-only` reuses those frames. The 1× proof sheets are under its `sheets/` directory.

I inspected all 17 review PNGs. Checks covered their dimensions, both camera crops at all three densities, the five large comparison panels, and all 48 packed cells across 1× and 2×. Each cell matched its ordered source or reduction and had transparent clearance on every edge. This art-only spike changed no game rules or code and ran no game tests.

Next logical thing: Kyle can judge the painted 20 px crop. If the direction earns another pass, put all six tower silhouettes and a crowded enemy wave on one phone-sized board before commissioning the upgrade art.
