# Milestone 52c1 review

Open the campaign with `?act3=1`. Winning level 20 opens the third map
sheet. The direct links `?keep=21` through `?keep=25` still open private
trials. Add `&act3=1` to a direct trial to see the new presentation.

## Captures

Each view is at its published viewport size. The wins, misses and gate
states are fixed browser fixtures. The two portrait battle captures step
the same level 24 run forward after its view settles.

| Screen | 390 × 664 | 390 × 844 | 960 × 580 |
|---|---|---|---|
| Third sheet, fresh | [Short](390x664-sheet-fresh.jpg) | [Tall](390x844-sheet-fresh.jpg) | [Desktop](960x580-sheet-fresh.jpg) |
| Third sheet, part-won | [Short](390x664-sheet-part-won.jpg) | [Tall](390x844-sheet-part-won.jpg) | [Desktop](960x580-sheet-part-won.jpg) |
| Level 21 card | [Short](390x664-card-21.jpg) | [Tall](390x844-card-21.jpg) | [Desktop](960x580-card-21.jpg) |
| Level 23 card | [Short](390x664-card-23.jpg) | [Tall](390x844-card-23.jpg) | [Desktop](960x580-card-23.jpg) |
| Level 23 Map notes | [Short, tall fallback](390x664-card-23-notes-fallback.jpg) | | [Desktop](960x580-card-23-notes.jpg) |
| Level 25 card | [Short](390x664-card-25.jpg) | [Tall](390x844-card-25.jpg) | [Desktop](960x580-card-25.jpg) |
| Act Three broadside | [Short](390x664-broadside.jpg) | [Tall](390x844-broadside.jpg) | [Desktop](960x580-broadside.jpg) |
| Unbroken earned | [Short](390x664-feat-earned.jpg) | [Tall](390x844-feat-earned.jpg) | [Desktop](960x580-feat-earned.jpg) |
| Not a nail missed | [Short](390x664-feat-missed.jpg) | [Tall](390x844-feat-missed.jpg) | [Desktop](960x580-feat-missed.jpg) |
| Level 25 ending | [Short](390x664-ending.jpg) | [Tall](390x844-ending.jpg) | [Desktop](960x580-ending.jpg) |
| Two roads in setup | [Short](390x664-roads.jpg) | [Tall](390x844-roads.jpg) | [Desktop](960x580-roads.jpg) |
| Damaged gate and repair quote | [Short](390x664-gate-damaged.jpg) | [Tall](390x844-gate-damaged.jpg) | [Desktop](960x580-gate-damaged.jpg) |
| Last stand countdown | [Short](390x664-gate-last-stand.jpg) | [Tall](390x844-gate-last-stand.jpg) | [Desktop](960x580-gate-last-stand.jpg) |
| Fallen gate | [Short](390x664-gate-fallen.jpg) | [Tall](390x844-gate-fallen.jpg) | [Desktop](960x580-gate-fallen.jpg) |
| Setup and battle view | [Setup](390x664-view-before.jpg) · [Battle](390x664-view-after.jpg) | [Setup](390x844-view-before.jpg) · [Battle](390x844-view-after.jpg) | [Setup](960x580-view-before.jpg) · [Battle, fixed view](960x580-view-during.jpg) |

## Isolation, fit, flow and input

The baseline is `origin/main` at `0bce563`. The branch's starting commit
`6ac5b35` changes only the scope and decisions, so its production build is
the same baseline. The isolation script compares 144 frozen canvas hashes,
36 serialized simulation states, 18 persisted progress and story records,
and 18 cold request inventories with the switch omitted or set to zero.
It covers Classic, Painted and Showpiece on phone and desktop, including
both public map sheets and level 20's card, result and old ending. The inventory normalizes
bundled filename fingerprints and opaque local blob URLs.

The fit matrix exercises five cards and tips, three results per level, both
broadsides, the third sheet and all six setup previews per level. It runs at
390 × 664, 390 × 844, 1024 × 768 and 960 × 580 under normal, tall fallback,
tall Caslon and wide metrics. The checked text has zero overflow. The tall
fallback card uses the Map notes turn-over at 390 × 664. The Gate check
also samples the filled and empty sections of a damaged health bar.

The fresh flow navigates from level 1 through the real campaign screens and
checks the recorded wins and both Act Three story visits. A separate fixture
starts with all 20 old wins and the old ending already read. It crosses
20–21 by keyboard, saves the first siege win and reloads on level 22.
The portrait input checks tap the rendered tower before, during and after
both camera moves, tap a window in battle, pay Quartering during the return
to setup, and check pause, test mode and reduced motion.

| Check | Deliberately wrong build | What failed |
|---|---|---|
| Switch-off isolation | Rename the public Level map heading | Scenario 1 reports a different frozen canvas hash. |
| Fit | Replace Gate with a longer label | The 390 × 664 fit check reports that the label does not fit the gate panel. |
| Campaign flow | Keep campaign completion on level 20 | The fresh flow gets `Campaign complete!` where the result should have no completion message. |
| View input | Skip the inverse projection while the camera is moving | At 390 × 844, tapping the rendered tower no longer opens its panel during the move. |

These faults were injected into the disposable production bundle. The
committed build passed the corresponding checks.

## View cost

The same level 23 battle at 390 × 844 maintained 40 enemies and four towers
under 4× Chromium CPU throttling. Main-thread busy time is CDP
`TaskDuration` divided by frames. Each value is the median of three
80-frame samples. The regular frame cadence remained about 60 Hz.

| Tier | Main before, ms/frame | c1 after, ms/frame | Frame interval p95 before → after | Frames over 25 ms before → after |
|---|---:|---:|---:|---:|
| High (2) | 8.109 | 8.065 | 16.7 → 16.8 ms | 0 → 0 |
| Low (0) | 5.876 | 6.399 | 16.7 → 16.7 ms | 0 → 0 |

Low detail used about 0.52 ms more main-thread time per frame in this
comparison. Neither tier missed the measured cadence. The comparison
measures settled battle frames.

To repeat the checks from a production candidate build, pass a compiled
baseline directory to the browser script.

```sh
PW_PORT=4373 node --experimental-strip-types scripts/art/m52c1Browser.ts isolation /path/to/baseline/dist
PW_PORT=4373 node --experimental-strip-types scripts/art/m52c1Browser.ts cost /path/to/baseline/dist --compare
M52C1_REVIEW=1 PW_PORT=4373 npm run test:e2e -- --grep 'Act Three screens fit|keep view preserves'
```

## Art and sound handoff

- Draw the gate from `state.gate` at the `drawGateMarker` seam. It
  supplies world position, angle, current and maximum health, breach
  and Last stand ticks. The old painted threshold still uses the existing
  keep plate registration. At 390 × 844 the painted threshold moves
  from about y = 403 (48% of screen height) to y = 308 (37%). The
  level 23 gate line settles at about y = 508. These are separate
  anchors for c2 to register.
- The windows are at world (540, 325) and (564, 170). Their targets are
  108 × 80 canvas px on portrait and 108 × 52 on landscape. Controls
  read each window's `used` flag. The Survey sites are (13, 7) and (23, 13)
  and Quartering is (22, 10). Their targets are 132 × 80 on portrait
  and 132 × 54 on landscape.
- Use the board layout to place a world object. Use
  `displayedMapPoint` after the layout conversion for a screen overlay.
  The portrait field canvas is 480 × 1194 and its cached castle plate
  uses a 730 × 475 box. The round trip uses 1.15× and 1.50× vertical
  framing with a 1,500 ms move each way. Landscape is 960 × 580 with
  a fixed field view.
- The ending's temporary engraved town mark is centered at (240, 893)
  in portrait and (480, 431) in landscape. Its Continue button begins
  at canvas y = 977 and 474 respectively. The replacement carriage
  needs to fit between the existing story and that button.

## Presentation dimensions

| Element | Earlier presentation | Act Three with the switch on | Reason |
|---|---|---|---|
| Portrait castle plate | 820 × 660 canvas px | 730 × 475 canvas px | Keep the crown in the setup view and reveal the approaches over the move. |
| Portrait opening view | Up to 22% castle push over 3,600 ms | 1.15× setup and 1.50× battle vertical scale, 1,500 ms between them | Give the battle more height and preserve the width of both roads. |
| Portrait Gate plaque | 214 × 60, 58 px below the map top | 214 × 68, 68 px below the map top | Fit the bar or countdown clear of the boss name and health. |
| Window control | 116 × 80 canvas px | 108 × 80 portrait, 108 × 52 landscape | Clear the adjacent field targets and keep an upright label during the move. |
| Wall-site control | 136 × 80 canvas px | 132 × 80 portrait, 132 × 54 landscape | Fit the price or Survey marker at its own site. |

Gate HP, repair prices, wave data and the 60 Hz simulation keep their part b values.

## Checks run

- `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run check:assets` and `npm run check:size` passed. The asset check
  covers 268 manifest rows. The built site is 8.00 MB in 65 files.
- `npm test` passed 2,982 tests in 140 files. `npm run sim` passed
  its balance checks and reference report hash.
- `PW_PORT=4373 npm run test:e2e` passed 1,379 tests with eight
  skips over Chromium desktop, tablet and phone. This includes 22
  new Act Three checks. The same command ran the isolated Keep cost
  check afterwards. It passed with Low at 5.98 ms/frame and High
  at 9.26 ms/frame, a Low/High ratio of 0.65 against the 0.90 ceiling.
