# Milestone 55a review

The approved mock-up is on the left. The production game with `?ui=new` is
on the right at the same viewport. Phone comparisons use the DPR 3 capture
reduced to the mock-up's 390 CSS px width. The five comparisons and both
recordings were captured again after Inter was bundled. The
[device sans and Inter comparison](compare-font-phone.png) shows the same
390 × 844 Riverbend frame, with native 3× crops of its status block and
build bar. The [earlier text detail](text-zoom-3x.png) shows the first two
passes.

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

| Earlier supporting capture | State |
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

These samples are from the pass before Inter was bundled.

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

The current canvas check measured “Musketeer 186” at 64 px in Chromium.
Inter's 400 advance was 442.78 px and its 600 advance was 454.45 px.
WebKit was unavailable on this machine. The browser checks held the same-origin
request before first paint, released it after the one-second deadline in a
separate case, and compared the device-font label bounds and pixels before and
after the late response. The service worker cached Inter on the first opted-in
visit and served it to a fresh offline launch. A switch-off install neither
requested nor cached the font.

With the switch off, the title, battle, tower drawer and result matched
the pre-Inter build byte for byte at all four viewports in Classic.

The full three-project Playwright run passed 1,768 cases and skipped nine.
It found one phone case where the upgrade drawer covered an edge tower.
After the geometry fix, the targeted run passed 142 cases, including that
case, with the WebKit case skipped. Both Old Keep timing cases passed
separately. Vitest passed 3,013 tests in 144 files. Lint, typecheck,
simulation, build and asset checks passed. The build is 11,696,250 bytes
against the 20 MiB size budget.

### Label sizes with Inter

Measured CSS px in the fit matrix. The native and wide Inter runs used the
same sizes. An em dash marks a control the matrix did not display at that
viewport. The event heading row uses the standard banner size.

| Label group | 390 × 664 | 390 × 844 | 1024 × 768 | 960 × 580 |
|---|---:|---:|---:|---:|
| Status captions, preview, tower metadata, Target, upgrade heading, Undo, boss HP, cheat mark | 11.48 | 14.59 | 14.93 | 12.01 |
| Status numerals | 18.18 | 23.11 | 30.93 | 24.88 |
| Level name, Ready | 11.96 | 15.20 | 14.93 | 12.01 |
| Taxes, permit tally | 12.44 | 15.81 | 14.93 | 12.01 |
| Wave control, Special, tower prices | 11.96 | 15.20 | 16.00 | 12.87 |
| Speed | 12.44 | 15.81 | 16.00 | 12.87 |
| Tower names | 11.10 | 11.25 | 14.93 | 12.01 |
| Build confirmation | 11.48 | 14.59 | 17.07 | — |
| Tower title | 13.87 | 17.63 | 24.53 | 19.73 |
| Upgrade, Sell | 11.48 | 14.59 | 17.07 | 13.73 |
| Upgrade choices | 12.44 | 15.81 | 18.13 | 14.59 |
| Upgrade descriptions | 11.10 | 13.99 | 16.00 | 12.87 |
| Upgrade reasons, held-boon description, damage numbers | 11.10 | 13.99 | 14.93 | 12.01 |
| Special choices, barrel caption | 11.96 | 15.20 | 17.07 | 13.73 |
| Boss name | 11.10 | 13.38 | 16.00 | 12.87 |
| Reward title, event heading | 14.35 | 18.24 | 32.00 | 25.74 |
| Reward names | 11.48 | 14.59 | 24.53 | 19.73 |
| Reward descriptions | 11.48 | 14.59 | 19.20 | 15.44 |
| Event detail | 11.48 | 14.59 | 18.13 | 14.59 |
| Held-boon name | 11.48 | 14.59 | 21.33 | 17.16 |
| Gold numbers | 11.10 | 12.16 | 18.13 | 14.59 |
| Boss bounty | 16.26 | 20.67 | 36.27 | 29.17 |
| Pause, reward shortcut keys | — | — | 14.93 | 12.01 |
| Aim instruction and hint | — | — | 19.20 and 13.87 | 15.44 and 11.15 |

### Layout changes for Inter

| Element | Device sans → Inter, in layout units unless noted | Reason |
|---|---|---|
| Portrait status numerals | 40 → 38 | The 390 × 844 setting now draws at 23.11 CSS px, close to the mock-up's 23 px. |
| Call and blocked wave labels | 24 → 25 in portrait, 14 → 15 in landscape | Start, call and blocked states use the same size. |
| Portrait tower-name group | 20 or 23 before fitting → 18.5 or the readability floor. Its centre moves from 49 to 48. | All six semibold names fit, including Musketeer, whose tile gets 12 units from the shared width budget. |
| Portrait tower prices and art | Price size 26 → 25 and centre 76 → 75.5. Art centre 21 → 18, Painted art height 32 → 36. | Clear space between the names, prices and taller portraits. |
| Portrait permit tally | Centre 20 → 19.5 and stroke 2 → 1. | Keep the tally clear of the first two names. |
| Portrait boss | Name size 25 → 22 or the readability floor. Plate width 265 → 265–310. | Keep full boss names in the tested states and leave the road and cave clear. |
| Tower drawer | Portrait edge width 418 → 438 for upgrade choices and 456 for other states. Sell's share 43% → 46%. Target can use two lines. The cap notice moves to a second metadata line and adds 6 landscape header units. | Keep the path name, cap notice, strongest targeting label and sale value visible at fixed sizes while leaving the selected edge tower clear. |

### Earlier checks

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
