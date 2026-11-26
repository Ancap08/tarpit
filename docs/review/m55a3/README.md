# Milestone 55a3 · iPhone interface review

The left panels recreate the layout in the owner's three Safari screenshots from the pre-polish build. The right panels show the rebuilt game at the same viewport size. The owner's JPEGs were reviewed separately. Both wave captures show a Musketeer, a Longbow, and the first wave. The rebuilt capture matches the owner's 10 gold, 20 lives, and 48 Collectors next. The pre-polish capture is from a slightly later tick with 14 gold.

| First Watch | 390 × 656, Safari page area | 390 × 844 |
|---|---|---|
| Level card | [Side by side](compare-656-card.png) · [Rebuilt](656-card.png) | [Side by side](compare-844-card.png) · [Rebuilt](844-card.png) |
| Setup | [Side by side](compare-656-setup.png) · [Rebuilt](656-setup.png) | [Side by side](compare-844-setup.png) · [Rebuilt](844-setup.png) |
| Wave 1 | [Side by side](compare-656-wave.png) · [Rebuilt](656-wave.png) | [Side by side](compare-844-wave.png) · [Rebuilt](844-wave.png) |

[12-second recording at 390 × 656](656-first-watch.mp4) · Card → Play → build a Musketeer and a Longbow by touch → Start Wave.

| More views | Captures |
|---|---|
| 390 × 656 in each look | [Classic](classic.png) · [Painted](656-wave.png) · [Showpiece](showpiece.png) |
| Status at 390 × 656 | [One tax and Riverbend's extended river](656-one-tax.png) · [Two taxes and the permit tally](656-two-taxes.png) · [Long level name](656-long-name.png) |
| Many rules at 390 × 656 | [Notice](656-many-rules.png) · [Map notes](656-many-rules-map.png) |
| Results at 390 × 656 | [Victory](656-result.png) · [Loss](656-result-loss.png) |
| Wider views | [1024 × 768 tablet](tablet.png) · [960 × 580 desktop](desktop.png) |

## Measured changes

| Viewport | Playable board before | Playable board after | Gain |
|---|---:|---:|---:|
| 390 × 656 | 226.9 CSS px | 239.4 CSS px | 12.5 CSS px |
| 390 × 664 | 229.6 CSS px | 242.5 CSS px | 12.9 CSS px |
| 390 × 844 | 291.9 CSS px | 307.9 CSS px | 16.0 CSS px |

The measurements use the visible map bounds for First Watch. In portrait, the new canvas is 1314 units tall for untaxed levels and 1344 for taxed levels, down from 1388. The header above the board drops from 230 to 140 units, or 170 with a tax row. The two outer terrain cells on each side provide the extension. The 1× texture bakes a 6–24% shade into those gutters.

The inline stat captions go from 24 to 21 units and the values from 38 in Inter or 40 in the device font to 26. The level name starts at 23 rather than 25 units. The readability floor still applies. Wave pip radius grows from 3.6 to up to 4.6 units. The phone boss name goes from 22 to 21 Inter units so the full name fits beside the entrance at the wide-text margin.

The portrait tower cards go from 94 to 110 units tall for their three rows. Portrait height grows from 36 to 46 units for Painted art, roughly 17 to 23 CSS px at 390 × 656. The art, name and price centres move from 18, 48 and 75.5 to 26, 62 and 91 units from the top. The Inter size for the names stays at 18.5 units or the readability floor. The price stays at 25 units. Musketeer and Longbow receive 22 and 12 extra width units, up from 12 and zero, to fit at the bundled-font margin. The action row goes from 94 to 92 units. The cyan upgrade dots grow from a 3-unit to a 3.6-unit radius in portrait. The tower spots gain a 20-unit visible outline inside a 24-unit tile, up from 18 units. The bright stroke grows from 1.2 to 2.1 units and the shade supplies contrast on light ground.

The card grows from about 274 to 365 CSS px wide at 390 × 656. The map art grows from about 248 to 340 CSS px wide. Content sets the sheet height, and the stars share the action bar with Tips and Play. On the result the portrait title drops from 98 to 86 units for victory and from 70 to 66 for loss. The shared gap drops from 16 to 14 units. The ordinary result has an opaque paper backdrop to remove the faint battle controls that showed through.

In the old dock, the permit tally sat across the Musketeer and Cannon portraits. It now sits beside the taxes. The old dock began and ended on different edges from the action row. Both rows now share their outer insets. Available prices use gold and insufficient-gold prices use warm pink. The portrait dock still shows all six towers in order.

At 390 × 844 a newly held reward would have widened the fitted canvas and shrunk the entire interface. The reward now fits at the edge without resizing it. The first-visit Tips confirmation also moves if it would land where the card's Play button had been.

Nine switch-off captures match byte for byte across the card, setup and wave at 390 × 656, 1024 × 768 and 960 × 580.

## What still shows

At 390 × 656 the short preview leaves some space for a two-line preview. Gold, Lives and Wave are smaller than in the Clean mock-up so the board can use that height. The shaded gutter edge is easiest to see in Showpiece, where the pasture lighting changes inside the board. The paper around First Watch stays open below the actions on a tall screen. The map features and tower portraits still use the shipped art. The 390 × 656 captures and recording come from a DPR 3 Chromium touch viewport. The rebuilt layout is pending a check on the owner's iPhone.

## Frame cost

Live 390 × 656 DPR 3 WebGL play, 40 enemies throughout each sample and 4× CPU throttling. Each cell is the median of three 3.5-second samples. Showpiece ran at its highest fixed detail. The preflight process list showed no art render, browser test, or simulation job, and the host reported 69.7% idle CPU.

| Look | Switch off, main-thread ms/frame | Switch on, main-thread ms/frame | Change | Median frame interval, off → on |
|---|---:|---:|---:|---:|
| Classic | 9.34 | 7.40 | −20.7% | 16.7 → 16.7 ms |
| Painted | 10.05 | 8.32 | −17.2% | 16.7 → 16.6 ms |
| Showpiece | 17.72 | 12.06 | −31.9% | 17.0 → 16.6 ms |

[Raw frame-cost samples](frame-cost.json)

## Verification

Lint, asset manifest, typecheck, production build, and size budget passed. The build is 11.16 MiB against a 20 MiB limit. Vitest passed 3,013 tests across 144 files. The simulation passed 139 reported checks.

The three-project Playwright sweep covered 1,934 cases. It returned 1,902 passes, 9 skips, and 23 failures. A local rebuild started before the sweep finished, so that sweep spans two bundles. All 23 failures passed on targeted reruns after the corrections. Eight additional cases checked the normal and margin Inter fits, long names, and Tips. Both serial Old Keep cost tests also passed. The skips include WebKit, which was unavailable locally.
