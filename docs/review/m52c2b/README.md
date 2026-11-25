# Milestone 52c2b · The things in the siege

The painted siege is available on the Act Three campaign sheet with
`?act3=1` and on the direct trials with `?keep=21&act3=1` through
`?keep=25&act3=1`. The existing result leads to the carriage on the first
campaign ending after the level 25 win.

## Captures

| Scene | Evidence |
|---|---|
| Bedroom window | [Lit](390x844-window-lit.jpg) · [Pillow in motion](390x844-window-mid-shake.jpg) · [Shutters closed](390x844-window-spent.jpg) |
| The Final Notice | [Arrival](390x844-ram-arriving.jpg) · [At the sill](390x844-ram-at-gate.jpg) · [Feathered retreat](390x844-ram-feathered.jpg) |
| Quartering | [Camp and pay sign](390x844-quartering-before.jpg) · [Packing up](390x844-quartering-departing.jpg) · [Site open](390x844-quartering-paid.jpg) |
| Royal Survey | [Both condemned sites](390x844-royal-survey.jpg) |
| Gate | [Against a Toll Troll](390x844-barbican-and-toll-troll.jpg) · [Shudder](390x844-gate-shudder.jpg) · [Repair crew](390x844-gate-repair.jpg) · [Door falling](390x844-gate-falling.jpg) · [Last stand](390x844-last-stand.jpg) |
| Mortar | [Notice in flight](390x844-notice-shell.jpg) |
| Ending | [390 × 844](390x844-ending.jpg) · [960 × 580](960x580-ending.jpg) |

| Battle sky | 390 × 844 | 390 × 664 |
|---|---|---|
| Dusk | [28 held at the gate](390x844-gate-crowd-dusk.jpg) | [Short phone](390x664-gate-crowd-dusk.jpg) |
| Night storm | [25 held at the gate](390x844-gate-crowd-night.jpg) | [Short phone](390x664-gate-crowd-night.jpg) |
| Cold dawn | [25 held at the gate](390x844-gate-crowd-dawn.jpg) | [Short phone](390x664-gate-crowd-dawn.jpg) |

The 390 × 844 recordings each run for 12 seconds.
[Window on the gate crowd](window-on-the-gate-crowd.mp4) uses the
level 22 west window on 28 enemies on its true stretch.
[Ram and the King](ram-and-the-king.mp4) shows the wheels, the slam,
and the feathered reversal with the King behind. The recordings are
silent browser captures. Pitch, timing and synthesis details are in
[the design spec](../../DESIGN.md#act-three-siege-cues).

The capture fixture places the ranks, sets the gate health for the two
damage moments, and supplies campaign progress for the ending. It
activates the real windows, repair, payment, Mortar and campaign controls.
The breach comes from enemy damage. The stills and films are straight
production browser output. The two night frames show lit characters
and a readable tower under the ordinary storm grade. Dense ranks
still overlap. The separate notice-shell capture shows the lit
parchment and ribbon under the storm grade.

## Placement

| Item | c2a | c2b |
|---|---|---|
| Painted gate | 128 × 96, sill at (64, 78) | 224 × 174, sill at (112, 144.17). The visible rise is about 133 logical px, against about 86 px for an enlarged Toll Troll. |
| Upper Survey, portrait | Plaque centre (346, 508) | Site centre (240, 508). The projected board centre stays below the Gate plaque, at y ≥ 224. |
| Lower Survey, portrait | Plaque centre (48, 888) | Site centre (48, 828). The target clamps at the left edge and centres on x = 56. |
| Quartering pay centre, portrait | (334, 838) | (187, 835), beside the camp on the original site at (144, 796). |
| Quartering pay centre, landscape | (720, 336) | (793, 386). |
| Portrait status block | 76 px high, stats at y = 15 | 38 px high, stats at y = 20. Aim instructions expand it to 76 px. |
| Ending illustration centre | (240, 893) portrait and (480, 431) landscape | (240, 827) and (480, 379). |

The window controls keep their c1 centres, world (540, 325) and (564, 170).
The camera move, build plinths, gate contact point, road signs and Continue
buttons use their c1 registration. The simulated shell arc, enemy contact
points, HP, prices, wave data and countdown ticks use the existing rules.

## Asset reproduction

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 -P scripts/art/keep_castle.py -- --siege-barbican
python3 scripts/art/siege_machines.py
python3 scripts/art/siege_actors.py
PW_PORT=4373 node --experimental-strip-types scripts/art/m52c2bMedia.ts
```

The paired gate and machine WebPs and the actor atlas reproduced byte
for byte. Runtime Keep art went from 7,319,844 to **7,657,132 bytes**
of the 10,000,000-byte cap. The build contains 88 files. Phone plate
loads use at most **36.67 MB** of decoded siege plate and actor source
pixels on the night storm, up from **33.45 MB**. This measures pixel
storage for the selected source plates and actor atlas. Browser and GPU
process memory and physical-phone playback remain unmeasured.

## Checks

- Lint, typecheck, build, site size and all 334 manifest rows passed.
- The unit run passed 2,994 tests in 142 files. `npm run sim` passed
  its balance checks and the reference report hash.
- The full browser run on port 4373 passed 710 Chromium desktop,
  265 tablet and 410 phone checks, with eight skips. It includes
  the c1 layout, flow and touch-through-camera checks, the live
  two-road fan test and the four sound checks.
- The isolated phone cost tests passed. Low vs High was 6.07 vs
  9.05 ms/frame in the Keep exhibition and 6.97 vs 9.77 on Both
  Roads, for ratios of 0.67 and 0.71 against the 0.90 ceiling.
- Against c2a commit `8ac6f23`, the switch-off run matched 144 public
  canvas hashes, 36 simulation states, 18 saved progress and story
  records, and 18 cold request inventories. The ten legacy direct Keep
  visits also matched 20 screenshot hashes, ten simulation states and
  ten plate inventories. The worker's install list excludes the new
  atlas and scenery.

## Frame cost

The 390 × 844 Chromium phone profile ran under 4× CPU throttling.
Main-thread time is CDP TaskDuration per frame, reported as the median
of three 80-frame samples. The 40-enemy fixture uses the same level 23
layout, four towers and refill rule before and after. The second
fixture touches the second bedroom while 30 enemies are held at the
true west sill on level 23, and verifies that all 30 are feathered.
The 25 ms column counts long intervals across the 240 measured frames.

| Fixture | Tier | Main-thread ms/frame before → after | Frame interval p95 before → after | Over 25 ms before → after |
|---|---|---:|---:|---:|
| 40 enemies, four towers | High | 8.15 → 8.81 | 16.7 → 16.7 ms | 0 → 0 |
| 40 enemies, four towers | Low | 6.23 → 6.83 | 16.8 → 16.7 ms | 0 → 0 |
| 30 held, window used | High | 12.56 → 15.45 | 16.8 → 16.8 ms | 2 → 5 |
| 30 held, window used | Low | 9.90 → 10.58 | 16.8 → 16.7 ms | 0 → 0 |

The simultaneous feather reaction is the heaviest measured scene on
High. Its 15.45 ms median and five long intervals leave less headroom
than the ordinary 40-enemy scene.

```sh
PW_PORT=4373 node --experimental-strip-types scripts/art/m52c1Browser.ts cost /path/to/c2a/dist --compare --same-act3
PW_PORT=4373 node --experimental-strip-types scripts/art/m52c1Browser.ts crowd /path/to/c2a/dist
PW_PORT=4373 node --experimental-strip-types scripts/art/m52c1Browser.ts isolation /path/to/c2a/dist --direct-keep
```

## Boundaries

At the sill, heads and equipment separate by colour and silhouette.
The densest ranks still obscure some individual feet. Range and special
previews draw the true road contact point. The Ram backs up by the
existing 31.5 trail px before resuming its approach. That short reversal
reads through the facing change, the spinning wheels and the feathers.
The earlier balance misses W2, W3 and W9 remain recorded in the rules
suite.
