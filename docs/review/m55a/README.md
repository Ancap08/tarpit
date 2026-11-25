# Milestone 55a review

The left side of each comparison is the approved mock-up. The right side is
the production game with `?ui=new`, captured at the same viewport size.

| Screen | Comparison | What differs |
|---|---|---|
| Level, 390 × 844 | [Phone](compare-battle-phone.png) | The full Riverbend board keeps its 1:1 projection. The HUD and dock use the wider control area, and the map has dark side margins. The stats share a line and the preview has its own row for long text. On a phone the six build controls show vector silhouettes and prices. |
| Level, 960 × 580 | [Desktop](compare-battle-desktop.png) | The status block is wider and taller to hold the printed level name, full wave preview and readable type. It reaches over the entrance to Riverbend’s first bend. The six tower names fit on desktop. The board uses the shipped game lighting. |
| Tower choices, 390 × 844 | [Upgrade](compare-upgrade-phone.png) | The sheet sits above the dock and moves for edge towers. The two descriptions use the live game copy. The target and sell controls follow the existing order. |
| Card, 390 × 844 | [Level card](compare-card-phone.png) | The print uses the bundled ground plate. The full existing notice, tax and feat wording wrap into more lines. The game uses Libre Caslon for the title as well as the body. |
| Result, 390 × 844 | [Win](compare-result-win-phone.png) | The result uses the actual earned stars, existing town portrait and reply. The lives and feat readouts take separate lines. The warm veil dims the actual game frame. |

| Additional state | Capture |
|---|---|
| Same Meadow level in the three looks | [Classic](meadow-classic.png), [Painted](meadow-painted.png), [showpiece at dusk](meadow-showpiece.png) |
| 390 × 664, Act Two | [Two taxes active](two-taxes-short.png), [short card](card-short.png), [Map notes reverse](card-short-map-notes.png) |
| Free play | [Reward picker](free-play-boon-picker.png), [Grumblefoot with a held reward](free-play-boss-held-boon.png) |
| Availability and defeat | [Locked and unaffordable towers](locked-and-unaffordable.png), [lost result](result-loss-phone.png) |
| 1024 × 768 | [Tablet level](battle-tablet.png), [tablet card](card-tablet.png) |
| 960 × 580 | [Desktop level](battle-desktop.png), [desktop card](card-desktop.png) |

The recordings use the live clock and real controls. The win recording
stages the final enemy after Play so the tower can earn the win within
the clip. In the build recording the first upgrade is bought, and the
tower earns gold on the wave before the path choices reopen.

- [Build, upgrade and fight](build-and-upgrade.mp4)
- [Open the card, Play and win](card-to-win.mp4)

The battle stills stage the mock-up crowd with the frozen clock. Damage and the arrival animations are visible in the live recordings.
The stills show the range ring in the upgrade comparison, where the
tower is selected.

The dark panels use an opaque fill, so the text pairs are identical on
bright Meadow and showpiece at dusk. The main battle ink on the base
panel is 14.50:1, subdued ink on the raised surface is 8.38:1, and the
mint action label is 11.65:1. Paper ink on cream is 13.83:1. These ratios
are calculated from the renderer colours.

## Frame cost

Chromium on this Mac, 390 × 844 with 40 enemies and 4× CDP CPU throttle.
Each run measures the browser main thread's `TaskDuration` over three
seconds, divided by the number of Phaser frames. Order is off, on, on,
off for each look. The table averages the two runs on each side.

| Look | Switch off | Switch on | Difference |
|---|---:|---:|---:|
| Painted | 14.26 ms | 13.47 ms | −0.79 ms |
| Classic | 12.92 ms | 14.46 ms | +1.54 ms |
| Showpiece | 18.83 ms | 19.83 ms | +1.00 ms |

Main-thread parity is open. There was concurrent local compute during
the final samples, and the two Classic switch-off runs ranged from
8.59 to 17.25 ms. A quieter pass immediately before the last visual
adjustments averaged 7.54 → 9.14 ms for Painted, 7.46 → 8.56 ms for
Classic, and 12.71 → 12.41 ms for showpiece. Both runs show a Classic
cost gap. The [raw final samples](frame-cost.json) include frame and
tick counts.

## Verification

- The full three-project browser run passed 1,698 checks, including
  the two Old Keep cost checks. It reported eight skips.
- All 78 legacy screenshot scenarios matched the pre-change build at
  zero pixel tolerance in Chromium on macOS. The repository’s Linux
  screenshot files were untouched.
- Vitest passed 3,012 tests. The simulation run passed and the
  simulation sources are identical to the starting commit.
