# Milestone 55b1 · Remaining paper pages

The captures use Playwright WebKit with iPhone or iPad emulation for the touch views, and desktop WebKit for 960 × 580. The 390 × 656 canvas is the Safari page area from the polish pass. The stills use `?test=1`. The recording uses live motion and real taps.

[12 seconds at 390 × 656](656-title-to-play.mp4) · Title → Campaign → level 1 → First Watch card → Play in Painted.

## 390 × 656 review

| Page | Captures | What I saw |
|---|---|---|
| Title | [New](656-title.png) · [Old and new](656-compare-title.png) · [Owner mark](656-owner-mark.png) | The seal, masthead and engraving make Campaign the clear starting point. Look and mute sit high above the main panel, especially at 390 × 844. |
| Free play | [Picker with a best score](656-free-play.png) | The score clears the maps and Play. The three thumbnail maps are schematic. |
| Act One | [Fresh](656-act-1-fresh.png) · [Part won](656-act-1-part-won.png) · [Lock message](656-map-lock.png) · [Old and new](656-compare-map.png) | Dark green marks the next stop. The empty message line leaves a small strip above the act control until a lock is tapped. |
| Act Two | [Fresh](656-act-2-fresh.png) · [Part won](656-act-2-part-won.png) | The third slot has four points and the legend explains it. A stop is approximately 66 × 57 CSS px. |
| Act Three | [Fresh](656-act-3-fresh.png) · [Part won](656-act-3-part-won.png) | The five-stop route follows the ridgeline toward the keep. The open space either side is more visible than on the ten-stop maps. |
| Tips | [Level 1 touch tips](656-tips.png) | Each instruction has its own row. Got it clears the original Play target. |
| Broadsides | [Act One](656-broadside-1.png) · [Act Two](656-broadside-2.png) · [Act Three](656-broadside-3.png) | The letter sizes to its copy. The second act's short notice uses the same village vignette as the other two. |
| Act closes | [Level 10](656-close-10.png) · [Level 20](656-close-20.png) | These are the owner previews. Their short letters use a compact card with the return control above it. |
| Endings | [Level 20](656-ending-20.png) · [Level 25](656-ending-25.png) | Level 20 has a drawn carriage. Level 25 uses the existing painted scene. The two illustrations have different visual weight. |
| Owner | [Owner's page](656-owner.png) | The numbered tips form their own grid. The session reset occupies a full row, which keeps its long label clear of the button edge. |
| Pause | [Menu](656-pause.png) · [Confirm restart](656-pause-confirm.png) | The paper is centered over the field. Mute stays visible through a small opening in the dim layer. |
| Load and recovery | [First load](656-first-loading.png) · [Painted progress](656-painted-loading.png) · [Painted fallback](656-painted-fallback.png) · [Keep loading](656-keep-loading.png) · [Keep failure](656-keep-failure.png) | The progress label stays in the Play control. Painted's fallback is a small notice over the field. The Keep error gives Back to title the full width of the card. |

## Other fitted sizes

| Viewport | Title | Act One | Act One broadside |
|---|---|---|---|
| 390 × 664 | [Title](664-title.png) | [Map](664-map.png) | [Broadside](664-broadside.png) |
| 390 × 844 | [Title](844-title.png) | [Map](844-map.png) | [Broadside](844-broadside.png) |
| 1024 × 768 | [Title](tablet-title.png) | [Map](tablet-map.png) | [Broadside](tablet-broadside.png) |
| 960 × 580 | [Title](desktop-title.png) | [Map](desktop-map.png) | [Broadside](desktop-broadside.png) |

The tall phone adds room around the title and notices while the map uses the height for the trail. Landscape places the two title actions on a row. At both landscape sizes the map road and reading sheet leave more space at their sides.

## Other reachable screens

The Keep [level card](656-keep-card.png), its [Map notes reverse](656-keep-notes.png), and [Keep results](656-keep-result.png) used the earlier paper-and-wood treatment. They now use the printed card and result. Free play's win and loss screens and the Act One and Two results already used the printed result. The [landscape reward choices](desktop-reward-keys.png) kept three wooden number badges after 55a. They now use the dark battle treatment. The reward cards, held boons, upgrade choice, special targeting and other battle pop-ups were already in the Clean interface. The Keep battlefield's legacy HUD, gate, repair, road banners, windows, taxes and last stand are part of the next pass.

[Pause in the Keep](656-keep-pause.png) uses the same paper panel over the narrower Keep board. Pause already confirmed Restart. Its Level map and Menu actions continue directly to their destinations. Look and mute are the available settings.

Phone text geometry was checked in WebKit at all three phone heights with the bundled face, fixed tall Caslon, fixed tall fallback and 1.09× Caslon advance widths. Reduced-motion and frozen test mode were checked independently. The captures represent emulation. An iPhone with Safari's real browser bars is the device check for the next milestone.

## Frame cost

Three alternating samples at 390 × 656, DPR 3, with motion enabled in Chromium's Canvas renderer. The median of the run averages fell from 0.257 to 0.107 ms per frame on the title and from 0.607 to 0.164 ms on the level map. Median frame intervals were 16.6–17.0 ms across runs. This measures Phaser's main-thread step and render work during entry. The browser compositor and physical iPhone are outside the measurement. [Sample data](frame-cost.json)

## Verification

- Lint, typecheck, asset manifest, production build and size checks passed. The build was 11.17 MiB against a 20 MiB budget.
- The unit run passed 2,942 tests. Concurrent runs caused timeouts in 21 tests and prevented another 50 from running. All 71 passed in targeted reruns with two workers and longer default time budgets.
- The simulation passed its balance targets and both public campaign gates.
- The uninterrupted Playwright run on port 4573 passed 1,992 tests across Chromium, tablet and phone. Eight configured skips remained. The two sequential Keep cost cases passed. An earlier run was stopped after a verification script rebuilt its served bundle. The completed run used one build, verified by SHA-256 before and after.
- Eight supplemental WebKit tests passed against the same build. The switch-off isolation spec passed. Linux screenshot baseline comparisons are disabled on this macOS run.
