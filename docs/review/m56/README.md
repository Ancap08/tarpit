# Sharper painted pieces

## Comparisons

The sprite sheets show matched poses at the same size in physical pixels on a 390 × 844 phone at DPR 3. The lower rows enlarge each pose 2.4×.

- [All six tower models](pieces-towers.png)
- [Collectors, Hounds, Redcoats, Harpies and Trolls](pieces-enemies.png)
- [Assessor Grumblefoot and King Grumblemaw](pieces-bosses.png)
- [The four Guards](pieces-guards.png)
- [The siege ram](piece-ram.png)

The battles replay the same test fixture with the switch off and on. The ordinary battles show the existing new-interface framing on the right. The 3× crops enlarge pixels from the full device-pixel screenshots.

- [Window Money at 390 × 656](mid-wave-390x656.webp)
- [Window Money at 390 × 844](mid-wave-390x844.webp)
- [The Old Keep gate at 390 × 844](old-keep-390x844.webp)

The difference is visible on a normal phone screen in the shields, the Harpies' wing edges and the Musketeer's barrel. The Keep crowd benefits most from cleaner edges. The broader light leaves the colours a little softer, and the missing heavy ink edge makes some pale pieces less bold against grass. The gain is worth the measured memory on the review builds.

## Sampling

Blender rendered the existing six tower models, seven enemies including both bosses, four Guard roles and five projectile models. The art keeps 16 bearings per tower, four walk poses in each of four directions per enemy, and two poses in each of four directions for each Guard. Every tower level and path uses the same model and pivot. The ram's four poses and the Keep mortar notice use the established code-drawn paths. The frame catalogue preserves the logical canvas and ground anchor while packing only the visible parts.

| Field | Physical samples per game pixel on the 390-wide phone | Source samples per game pixel |
|---|---|---|
| Ordinary, 656 px high | 1.42 | 2 |
| Ordinary, 844 px high | 1.82 | 2 |
| Old Keep, 656 px high | 1.65 across, 2.47 vertically in battle, up to 3.66 vertically in the front rank | 3 for towers, flyers and most shots. 4 for ground enemies and Guards. |
| Old Keep, 844 px high | 2.12 across, 3.18 vertically in battle, up to 4.71 vertically in the front rank | Same source set. At the largest stretch, the ground enemy art supplies about 85% of the vertical samples. |

The ram cell is 360 × 240 px for an 88-game-pixel width. The notice cell is 120 × 80 px for a 34-game-pixel width. Ordinary 2× sampling covers settled pieces on both phones. A short tower upgrade bounce can briefly need 2.19 samples per game pixel at 844 px high.

<details>
<summary>Source cell sizes in pixels</summary>

| Piece | Ordinary | Old Keep |
|---|---:|---:|
| Musketeer | 124 × 98 | 186 × 147 |
| Cannon | 108 × 98 | 162 × 147 |
| Tar Pit | 92 × 98 | 138 × 147 |
| Longbow | 100 × 98 | 150 × 147 |
| Mortar | 108 × 98 | 162 × 147 |
| Fire Pot | 84 × 98 | 126 × 147 |
| Goblin Collector | 104 × 100 | 208 × 200 |
| Revenue Hound | 116 × 100 | 232 × 200 |
| Redcoat Shieldbearer | 112 × 100 | 224 × 200 |
| Royal Harpy | 92 × 100 | 138 × 150 |
| Toll Troll | 152 × 140 | 304 × 280 |
| Assessor Grumblefoot | 216 × 200 | 432 × 400 |
| King Grumblemaw | 220 × 218 | 440 × 436 |
| Guards | — | 360 × 200 |
| Arrow | 28 × 42 | 42 × 63 |
| Cannonball | 34 × 32 | 51 × 48 |
| Mortar shell | 38 × 40 | 57 × 60 |
| Tar glob | 32 × 38 | 48 × 57 |
| Flame | 30 × 36 | 45 × 54 |
| Harpy shadow | 56 × 40 | 56 × 40 |
| Ram | — | 360 × 240 |
| Mortar notice | — | 120 × 80 |

</details>

## Decoded art

Figures use decimal MB. The browser audit counts width × height × four bytes for each unique retained Phaser texture source and the Keep art canvases after drawing the fixture. The renderer has its own backing buffers.

| Visit | Switch off | Switch on |
|---|---:|---:|
| First Watch, 844 | 35.87 MB | 22.11 MB |
| Act One finale, 844 | 35.89 MB | 33.80 MB |
| Window Money, 656 | 35.99 MB | 29.80 MB |
| Window Money, 844 | 35.99 MB | 32.73 MB |
| Act Two finale, 844 | 35.94 MB | 38.32 MB |
| Free play, 844 | 35.86 MB | 38.10 MB |
| Showpiece Free play, 844 | 38.43 MB | 40.67 MB |
| Old Keep 21, 844 | 40.21 MB | 43.12 MB |
| Old Keep 22, 844 | 43.01 MB | 45.93 MB |
| Old Keep 23, 844 | 48.07 MB | 50.99 MB |
| Old Keep 24, 844 | 48.08 MB | 51.00 MB |
| Old Keep 25, 656 and 844 | 54.82 MB | 65.50 MB |

Both phone limits hold. The finale leaves 4.50 MB within the 70 MB budget. Ordinary fields load the level's roster and shots, with one still for each locked tower button. The gold cheat fetches the additional bearings and shots. The Keep lights the loaded frames in place, including the hit poses, and keeps only the small unlit tower portraits for the build bar.

## Cold download

The generated sharp set is 3,201,808 bytes across 45 files, including the ordinary and Keep variants, frame data and the scenery and siege effect packs. The built site is 14,909,038 bytes. The figures below sum unique response bodies from a fresh browser, including the service worker's precache and the selected visit's on-demand requests. HTTP compression and headers can change wire totals.

| Fresh visit | Switch off | Switch on | Sharp files within switch-on total |
|---|---:|---:|---:|
| Title before Play | | 1,786,134 B | 0 B |
| First Watch | | 2,455,130 B | 512,952 B |
| Free play on Meadow | 2,865,652 B | 3,072,178 B | 1,181,914 B |
| Showpiece Free play | | 3,175,726 B | 1,181,914 B |
| Old Keep 25 | 3,457,620 B | 4,224,390 B | 1,765,548 B |

The warmed sharp Free play visit also reopened offline.

## Frame cost

Chromium using ANGLE Metal on the M4, with a phone viewport at DPR 3, 40 enemies, 12 towers and CDP CPU throttling at 4×. Each number is the median across three three-second samples. The two builds and switch states were interleaved. Process inspection showed no concurrent test suites or builds. Chromium processes from the previous measurement were exiting at the start.

| Viewport | Stock off, main ms/frame | Stock on, main ms/frame | This branch off, main ms/frame | This branch on, main ms/frame | This branch off → on, frame median | This branch off → on, frame p95 |
|---|---:|---:|---:|---:|---:|---:|
| 390 × 844 | 2.92 | 4.45 | 3.08 | 4.42 | 16.60 → 16.70 ms | 18.00 → 18.40 ms |
| 390 × 656 | 3.29 | 4.41 | 2.49 | 4.46 | 16.70 → 16.60 ms | 17.90 → 18.90 ms |

The full switch costs more main-thread time than stock off at both heights. The stock build already showed a switch cost, and the switched builds are within 0.05 ms per frame of each other. All conditions delivered about 60 fps. The strict off-to-on main-thread target remains open.

## Verification

- Lint, type check, build, size and the 401-row asset manifest passed. The pack audit checked 57 logical sheets and 506 trimmed frame placements.
- Vitest passed 3,013 tests across 144 files. The follow-up asset, frame and look tests passed 96 cases. The simulation output matched the stock run byte for byte.
- The production-browser isolation audit matched 30 frozen screenshot hashes, 15 simulation hashes and 15 request and texture inventories. It included stock Painted, Showpiece and Classic. The sharp-path audit exercised both phone heights, all five Act Three levels, the gold cheat, texture release, a restart and offline replay.
- The three-project Playwright pass recorded 1,775 passes, nine skips and three failures. The failure-injection test had been routing the stock atlas URL. Its updated checks passed all six stock and sharp cases across Chromium, tablet and phone. The third failure was the viewport timing threshold under concurrent tests. It passed in isolation. Both Keep cost tests passed separately.

## Reproducing the review

The raw renders and browser captures use a temporary directory. The Blender and Pillow stages are in [m56-pieces.py](../../../scripts/art/m56-pieces.py). The browser audit, download and frame measurements are in [m56-review.ts](../../../scripts/art/m56-review.ts). The comparison generator is [m56-sheets.py](../../../scripts/art/m56-sheets.py). The isolation run compares against the brief commit, `1b7664d`.
