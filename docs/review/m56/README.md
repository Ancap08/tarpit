# Lifted pieces

Lifted is the Painted and Showpiece art behind `?ui=new`. All six towers retain their 16 bearings, original footprints and existing markers for both upgrade paths. The seven enemy and boss models retain their 16 walk poses. The four Guards retain all 32 idle and strike poses. The pack includes all four ram poses, five projectile models and the Keep mortar notice. The tower dock and panel draw the baked southeast pose from the same art used on the board. The Keep's dock retains neutral preview lighting. Its battlefield uses the level's dusk or moonlit palette.

## Phone comparisons

The sprite sheets use 390 × 844 at DPR 3 and show each matched pose at actual phone pixel scale and 2.4×. The battlefield pairs show the same game state with the switch off and on, with 3× crops.

- [Six towers](pieces-towers.png) · [Five regular enemies](pieces-enemies.png) · [Two bosses](pieces-bosses.png) · [Four Guards](pieces-guards.png) · [Ram](piece-ram.png) · [Shots](pieces-shots.png)
- [Window Money at 390 × 656](mid-wave-390x656.webp) · [390 × 844](mid-wave-390x844.webp)
- [Meadow by day at 390 × 656](grass-day-390x656.webp) · [Old Keep west road at dusk at 390 × 656](dusk-road-390x656.webp)
- [Old Keep at night, 30 held, at 390 × 656](old-keep-390x656.webp) · [390 × 844](old-keep-390x844.webp)
- [Dock and open tower panel at 390 × 656](portraits-390x656.webp)
- [Option C reference sheets](options/README.md)

The deeper ground shadows show up most on Meadow and in the Window Money swatches. At dusk the rim and inner shading help separate the exposed armor, Harpy wings and Troll shoulders. The concentrated road groups still overlap. At the night gate, the shield edges and forward ranks remain visible with 30 walkers held on the sill. The deepest bodies form one mass behind the front rank, and the foot shadows have little contrast against the wet stone.

I compared the live art with the original Option C sheets and the same 18-enemy night fixture. The night palette and soft edge are close to the mock-up. The live troop rims are slightly denser, and their inner edges have a small value step. The tower and Harpy-shadow settings match Option C. Window Money shows main's wider ground and larger dock, so its screen positions differ from the mock-up. The ram and Keep notice soften the original outer stroke while keeping the marks on the wood and parchment.

## Baked finish

| Setting | Option C | Shipped Lifted |
|---|---|---|
| Rim color | `#201b19` | Same |
| Tower and shot dilation, Gaussian blur, opacity multiplier | 1.12 game px, 0.88 px, 66% | Same |
| Enemy, Guard and ram dilation, Gaussian blur, opacity multiplier | 1.12 game px, 0.88 px, 66% | 1.18 game px, 0.78 px, 72% |
| Body contrast on the 0–255 channel scale | Add `0.16 × (luma − 103) + 2` | Same, plus up to +4 in the crowd interior and up to −21 through its 0.8 px inner feather |
| Ground shadow | 108/255 source alpha, 1.45 px blur | Towers 108/255. Walkers, Guards and ram 122/255. Same blur. |
| Source ellipse | Towers 38 × 8 game px. Walkers and Guards 18–52 × 6. | Same, plus 72 × 10 for the ram |
| Flying shadow | 0.85 px expansion, 0.5 px blur, 1.85× alpha | Same |

The earlier Soft pack had no outer feather or extra contrast. Its ground-contact shadow peaked at 56/255 wherever a piece had one. Lifted layers its ellipse with that contact shadow below the body. Dusk and moonlight color the body before the dark feather is painted, as in the mock-up. The game loads only the applicable Keep palette and generates its usual hit frames on load. The finish uses the existing sprite draws.

Ordinary fields retain 2 source samples per game pixel. At the Keep, towers, flyers and conventional shots use 3×, and Guards and regular ground enemies use 4×. King Grumblemaw uses 3.25× instead of the earlier 4× at the Keep. This puts the finale under 70 MB while preserving the rest of the roster at its previous density. It supplies 89% of the most stretched 390 × 656 front-rank samples and 69% at 390 × 844. Those figures are 3.25 / 3.66 and 3.25 / 4.71 respectively.

## Decoded art and site size

Decimal MB. The audit counted unique retained Phaser image and canvas sources and the Keep’s panorama canvases, at four bytes per pixel. The separate render buffers are outside these figures.

| Visit | Switch off | Lifted |
|---|---:|---:|
| First Watch, 844 | 35.87 | 25.18 |
| Act One finale, 844 | 35.89 | 38.59 |
| Window Money, 656 | 35.99 | 34.98 |
| Window Money, 844 | 35.99 | 37.33 |
| Act Two finale, 844 | 35.94 | 43.53 |
| Free play, 844 | 35.86 | 43.29 |
| Showpiece Free play, 844 | 38.43 | 45.86 |
| Old Keep 21, 844 | 40.21 | 50.90 |
| Old Keep 22, 844 | 43.01 | 53.70 |
| Old Keep 23, 844 | 48.07 | 58.76 |
| Old Keep 24, 844 | 48.08 | 58.77 |
| Old Keep 25, 656 and 844 | 54.82 | 68.12 |

The sharper set is 5,631,371 bytes across 64 files. It includes the piece atlases, 19 moonlit alternates, layout, scenery and Keep siege-effect packs. The full site is 17,344,630 bytes. The level card may fetch its 1× terrain/scenery preview before Play. The Lifted battle loads its roster without fetching the shared stock sprite atlas.

## Frame cost

390 × 656, DPR 3, 40 enemies, 12 towers, and 4× Chromium CPU throttle on the Mac M4 with ANGLE Metal. Each row is the median of three interleaved three-second samples. A process check found no competing tests, renders or builds. Desktop apps and window services were active. The stock-sprites case used a temporary build of the merged checkout with only the ordinary sharp-art selection forced off, retaining the polished interface.

| Condition | Main-thread task ms/frame | Frame interval median | Frame interval p95 |
|---|---:|---:|---:|
| Switch off | 3.36 | 16.60 ms | 18.20 ms |
| Switch on, today’s sprites | 4.82 | 16.70 ms | 18.60 ms |
| Switch on, Lifted | 4.77 | 16.70 ms | 18.40 ms |

Each sample rendered 180 frames and advanced 180 ticks. Lifted was within 0.06 ms of the switched stock sprites. The combined switch still uses 1.41 ms more main-thread time per frame than off, so the strict off-to-on cost target remains open.

## Verification and reproduction

The production-browser audit compares against the fetched main revision after the iPhone polish. It matched 30 frozen screenshot hashes, 15 state hashes, and 15 request and texture inventories. It also checked the sharp roster and memory limits, locked tower icons, the gold cheat’s on-demand poses, restart and texture release. The dock and open tower panel used the same live Musketeer texture frame. The geometry audit checked 57 logical sheets, 506 frame placements and all 19 moonlit variants.

Lint, typecheck, build, size and the 441-row manifest passed. Vitest passed 3,013 tests in 144 files. The simulation output matched byte for byte. The full Playwright command completed on one unchanged build, with 865 desktop, 385 tablet and 678 phone passes, including the two separately scheduled Keep cost cases. Eight cases were skipped.

[Blender and Pillow packer](../../../scripts/art/m56-pieces.py) · [Lifted finish](../../../scripts/art/m56_finish.py) · [Browser captures and audits](../../../scripts/art/m56-review.ts) · [Comparison sheet generator](../../../scripts/art/m56-sheets.py)

Use a temporary folder for the Blender poses and audit captures. The browser script expects a build of the fetched main revision under its `baseline` subfolder for isolation, and the merged stock-sprites comparison build under `stock/dist` for timing. The archived Option C composites were built from the Soft atlases at commit `c8a91c6`.
