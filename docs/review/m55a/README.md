# Milestone 55a review

The approved mock-up is on the left. The production game with `?ui=new` is
on the right at the same viewport. Phone comparisons use the DPR 3 capture
reduced to the mock-up's 390 CSS px width. The [3× text detail](text-zoom-3x.png)
uses unscaled crops from the first and second passes.

| Screen | Remaining differences |
|---|---|
| [Battle, phone](compare-battle-phone.png) | The full map keeps its proportions with dark side margins. The world uses its live lighting, tower angles, enemy positions and health bars. The example has no selected tower or transient damage numbers. The title is a single-weight line. The controls use the game’s exact labels, including “+17”, and a simple bolt. The build art is smaller to fit all six names and prices. The short phone uses the same numeral size and gives a long Next preview a second row. |
| [Battle, desktop](compare-battle-desktop.png) | The full-width header sits above the board. The map fits between it and the dock, with side margins at 960 × 580. The dock stacks art, name and price rather than putting them side by side. Pause includes its label. The call button prints the bonus inline. Lighting, tower poses and frozen battle state differ as on the phone. |
| [Tower upgrade, phone](compare-upgrade-phone.png) | The drawer fits within the battlefield width and leaves the dock visible. The icon tiles are smaller and darker. The game prints its actual kill count and the existing upgrade explanations. The price has a coin on the right. Target and Sell are quiet buttons, with the sale amount separated from the label. The range circle is smaller on screen because the full board fits between the HUD and dock. |
| [Level card, phone](compare-card-phone.png) | The real notice includes the original tax sentence. The map uses the bundled terrain plate and centred caption. The map note and town’s answer wrap with the existing copy. The tax and feat have bold headings over the original explanations. The square tiles, Best stars and narrower Play button use the game’s control geometry. Back has a visible button border. |
| [Win, phone](compare-result-win-phone.png) | The portrait and stars use the game’s shipped art and earned slots. The lives and feat appear on two lines with their existing wording. The existing reply prints without added quotation marks. The warm veil covers the current battlefield and faintly retains its details. The action layout follows the mock-up. |

The gameplay and copy differences in the table are deliberate. The live
tower drawer continues to cover part of the road when opened. The separate
header fixes the desktop collision, and the road checks cover persistent
battle panels, the boss plate and held-reward slots.

| Additional state | Capture |
|---|---|
| Riverbend at 960 × 580 | [Entrance, both bends and town clear of the HUD](riverbend-road-desktop.png) |
| Meadow with the three looks | [Classic](meadow-classic.png), [Painted](meadow-painted.png), [showpiece at dusk](meadow-showpiece.png) |
| Act Two at 390 × 664 | [Two taxes and the longest next-wave preview on level 20](two-taxes-short.png), [notice](card-short.png), [Map notes reverse](card-short-map-notes.png) |
| Free play | [Reward picker](free-play-boon-picker.png), [Grumblefoot with a held reward](free-play-boss-held-boon.png) |
| Availability and defeat | [Locked and unaffordable towers](locked-and-unaffordable.png), [lost result](result-loss-phone.png) |
| 1024 × 768 | [Tablet level](battle-tablet.png), [tablet card](card-tablet.png) |
| 960 × 580 | [Desktop level](battle-desktop.png), [desktop card](card-desktop.png) |

[Build, upgrade and fight](build-and-upgrade.mp4) shows a tower placed
and upgraded through real touches, then reopened after earning gold.
[Open the card, Play and win](card-to-win.mp4) starts the level through
the real Play button and stages its last enemy so the tower can finish
the level within the recording. Both clips use the live clock at
390 × 844.

## Frame cost

Chromium on macOS at 390 × 844, DPR 3, with 40 enemies and 4× CDP CPU
throttle. Each three-second sample divides elapsed main-thread
`TaskDuration` by the game’s post-render frame count. Each median uses
three runs per setting with off and on interleaved. The low-resolution
world buffer stays separate from the cached device-density interface.

The final run started after the tests, snapshot captures and recordings
had exited. A `ps` check found no other Tarpit build or test job running.

| Look | Switch off | Switch on | Change |
|---|---:|---:|---:|
| Classic | 7.78 ms | 6.55 ms | −15.8% |
| Painted | 8.06 ms | 7.78 ms | −3.5% |

Both medians meet the 5% target. The [raw samples](frame-cost.json)
record each frame count, enemy count and timing.

## Verification

The road clearance matrix exercises Meadow, Switchback and Riverbend
at all four requested sizes. The short-phone matrix exercises one and
two taxes, the longest previews, fixed tall and fallback metrics, and
wide text. The new-interface wide-text cases use 1.09 on macOS and
1.06 elsewhere. The switch-off checks include the absence of the
device-density interface canvas.

- Playwright passed 1,722 checks across the three projects, including the
  two Old Keep timing checks. Eight cases were skipped.
- The macOS wide-text factor changed in 13 cases. All 19 new-interface
  wide-text cases passed on macOS.
- All 78 switch-off screenshots matched the first-pass build pixel for
  pixel on macOS. The committed Linux baselines were untouched.
- Vitest passed 3,012 tests in 144 files. Lint, asset manifest, typecheck,
  build, size budget and simulation also passed.
