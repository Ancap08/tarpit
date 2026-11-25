# Milestone 52c2a · The siege scene

The two wet-stone roads meet over the ravine and run to an outer barbican.
Its sill is at the blocker that stops ground enemies. The paved yard
continues uphill to the keep's own door. The left curtain and the guarded
decks overlook the approaches. On wide screens the low eastern causeway
passes the face of the wall with the road and wall both visible.

## Phone setup and battle

Open these levels from the private Act Three sheet with `?act3=1`, or use
`?keep=21&act3=1` through `?keep=25&act3=1`.

| Level | 390 × 844 setup | Sky | Closed branch |
|---|---|---|---|
| 21 · Rent Overdue | [View](390x844-level-21.jpg) | Dusk | West, cross brace and rockfall |
| 22 · Feather Beds | [View](390x844-level-22.jpg) | Dusk | East, cross brace and rockfall |
| 23 · Both Roads | [View](390x844-level-23.jpg) | Night storm | Both open |
| 24 · Quartering | [View](390x844-level-24.jpg) | Night storm | Both open |
| 25 · The Final Notice | [View](390x844-level-25.jpg) | Cold dawn | Both open |

- [Before](390x844-before.jpg) and [after](390x844-level-23.jpg) show the same level 23 opening setup at 390 × 844, compared with c1 commit `9478e5a`.
- [390 × 664](390x664-level-23.jpg), [960 × 580](960x580-level-23.jpg), and [1024 × 768](1024x768-level-23.jpg) show level 23 with its banners and controls.
- [390 × 844 battle](390x844-outer-gate-midwave.jpg) and [390 × 664 battle](390x664-outer-gate-midwave.jpg) show the settled view in wave 1. Each capture has three Collectors from each road held at the sill. The live simulation had 15 enemies and the gate had lost about 101 of its 16,900 HP.
- [Hard lightning exposure](390x844-lightning.jpg) shows the new castle key and the spire shadows on the terrace. [Dawn](390x844-level-25.jpg) loads the clear sky and the same castle plates with their dawn grade.
- [Phone recording](level-23-phone.mp4) shows the level 23 opening, four legal tower placements, the Start Wave touch, the three-speed first wave and the return to setup. The silent 390 × 844 video condenses about 20.5 seconds of play to 15 seconds.

## The door and its registration

The four close-ups use level 21 at the same angle and scale.

| Health | Painted condition |
|---|---|
| Above 2/3 | [Sound timber and straight bars](gate-sound.jpg) |
| Above 1/3 through 2/3 | [Crack and sagging bar](gate-cracked.jpg) |
| Above zero through 1/3 | [Splintered oak and slipping banner](gate-splintered.jpg) |
| Zero or fallen | [Open vault with broken timbers](gate-open.jpg) |

A real repair from 60% on level 23 restores the sound frame. The HUD
keeps showing the finer health changes within a state. These are the
existing simulated gate positions. The painted sill follows the gate
point directly.

| Level | World x | World y |
|---|---:|---:|
| 21 | 738.37 | 292.61 |
| 22 | 662.88 | 346.71 |
| 23 | 764.53 | 336.31 |
| 24 | 748.83 | 303.36 |
| 25 | 752.32 | 306.94 |

The closure anchors are world (610, 444) for the west road and (851, 422)
for the east road. The window targets stay at (540, 325) and (564, 170).
Tower cells stay in `src/sim/keepSite.json`. The Survey cells stay at
(13, 7) and (23, 13), and Quartering stays at (22, 10). The portrait
plaque leaders preserve those anchors. The Survey plaques' unscaled canvas
centres move from (240, 508) to (346, 508), and from (48, 828) to
(48, 888). The Quartering plaque moves from (144, 796) to (334, 838).
The west-only road banner starts at canvas x = 204, clamped as needed.
This clears the gates and keeps the upper Survey plaque clear of the
health bar during the view move.

Portrait uses c1's 730 × 475 castle box and 1.15× to 1.50× move.
Landscape changes its castle box from 1,250 × 335 to 1,150 × 312
canvas pixels to expose the east approach. The gate sprite's logical
frame is 128 × 96 with the sill at (64, 78). The night storm has 114 rain
streaks at High and 28 at Low. It runs the previous repeat interval
15.7 seconds at 1.45×, about 10.83 seconds per cycle. Dusk keeps its
clear weather. The dawn has neither rain nor lightning.

## Loading and frame cost

Keep art on disk went from 4,559,412 to **7,319,844 bytes** of the
10,000,000-byte limit. Decoded source plate memory below is width × height ×
4, in decimal MB, for a single visit. The 390 × 664, 390 × 844, 960 × 580
and 1024 × 768 capture profiles all select the half-size plates. The
full set is reserved for fitted physical widths over the existing
1,280 px portrait or 2,048 px landscape thresholds.

| Sky | Portrait half | Wide half | Portrait full | Wide full |
|---|---:|---:|---:|---:|
| Dusk, with closure | 32.05 MB | 25.59 MB | 128.19 MB | 102.37 MB |
| Night storm | 33.45 MB | 25.92 MB | 133.81 MB | 103.70 MB |
| Dawn | 28.13 MB | 21.68 MB | 112.53 MB | 86.71 MB |

The c1 exhibition sets decode 35.98 MB portrait and 31.43 MB wide at
half size. The new scene loads one orientation, one density and one sky.
Changing orientation releases the previous set before requesting its
replacement. The memory table covers decoded source pixels. Browser
and GPU process memory are unmeasured.

Before and after ran the same level 23 battle with the Act Three view,
four towers and a 40-enemy refill fixture at 390 × 844. Main-thread busy
time uses CDP TaskDuration at 4× CPU throttle, with the median of three
80-frame samples. Frame interval and busy time measure different things.

| Tier | Before, busy ms/frame | After, busy ms/frame | Frame interval p95 before → after | Over 25 ms before → after |
|---|---:|---:|---:|---:|
| High (2) | 7.897 | 8.780 | 16.7 → 16.8 ms | 0 → 0 |
| Low (0) | 6.297 | 6.209 | 16.8 → 16.7 ms | 0 → 0 |

High used about 0.88 ms more main-thread time per frame. Low used about
0.09 ms less. These are Chromium measurements on the development Mac.

## Checks

- Lint, type check, build, size, asset manifest and `npm run sim` passed.
  The built site contains 83 files and uses 11,150,155 bytes. The
  manifest covers 303 rows.
- `npm test` passed 2,982 tests in 140 files.
- The full `PW_PORT=4373 npm run test:e2e` passed 706 desktop, 265 tablet
  and 409 phone checks, with eight skips. It includes all c1 fit, flow
  and touch checks, plus the painted gate's damage, repair, breach and
  asset swap across orientations.
- Both isolated cost checks passed. Low/High was 0.65 in the exhibition
  and 0.68 on level 23, against a ceiling of 0.90.

## Boundaries

The keep silhouette, rock mass and tiered approach give the setup view
more scale. The ground is still flatter than the upper model, especially
along the wide right-hand viaduct and the repeated stone courses. The
barbican is staged to face the viewer in both layouts. In the portrait
night battle, the smaller sprites can bunch into a single silhouette at
the sill. The mobile hardware result is still for Kyle to judge.

Window controls, the Redcoat, the ram, siege sounds and the ending art
belong to the next pass. The simulation and level targets retain their
part b values, including the three recorded misses W2, W3 and W9.

The switch-off comparison matched 144 canvas hashes, 36 serialized
simulation states, 18 stored progress and story records and 18 cold
request inventories. All 18 new WebPs reproduced byte for byte from
the local art scripts.

## Reproduction

Generate the runtime scene plates with the same local art pipeline.

```sh
python3 scripts/art/keep_weather.py --siege
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 -P scripts/art/keep_castle.py -- --siege-gates
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 -P scripts/art/keep_castle.py -- --siege-strike
```

From a production candidate build, pass the c1 build directory to the
capture and comparison scripts.

```sh
PW_PORT=4373 node --experimental-strip-types scripts/art/m52c2aMedia.ts --baseline=/path/to/c1/dist
PW_PORT=4373 node --experimental-strip-types scripts/art/m52c1Browser.ts isolation /path/to/c1/dist
PW_PORT=4373 node --experimental-strip-types scripts/art/m52c1Browser.ts cost /path/to/c1/dist --compare --same-act3
```
