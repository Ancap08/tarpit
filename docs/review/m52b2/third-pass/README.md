# Milestone 52b2 third pass

Eleven of fourteen targets pass. W6, W9 and W12 remain open. The simulation gate exits 1 and uses the existing thresholds on every level, including 21.

| Target | Result | Evidence |
|---|---|---|
| W1 | Pass | Half the gate costs Good at least two lives or a star on each level. Full/half scores in level order are 3/18 versus 2/13, 2/16 versus 3/13, 3/20 versus 2/20, 2/18 versus 0/0, and 3/20 versus 1/8. Scores are stars/lives. |
| W2 | Pass | Repair improves the score on 21, 23 and 25. A full repair costs at least one tower and breaches remain possible. |
| W3 | Pass | Good holds all five gates. Person wins all five after a breach. |
| W4 | Pass | The no-anti-air control loses 20 lives while the gate stands on each level. |
| W5 | Pass | Feat-mode Good earns Unbroken on 21, 23 and 25. Feat-mode Person earns it on none. |
| W6 | Miss | Five of six one-road trials breach. The east-only bot on 24 wins 1/10 and holds at 1,741 HP, down from 2,324 HP. |
| W7 | Pass | Person averages 11.80 lives, down 2.00 from Act Two's 13.80. |
| W8 | Pass | All 261 public campaign and Free play run hashes match the local `origin/main` comparison at `aacf7de`. The 473 simulation output lines and six diagnostics also match. All 24 public browser captures match byte for byte, including both acts' maps and the level 20 ending on desktop and phone. |
| W9 | Miss | 22 and 23 pass all existing checks. 21 misses P1, V1, F1 and L6. Musketeer-only and Longbow-only each win 3/20. 24 misses P1. 25 misses L8 at 20 lives against the 12–16 finale band. |
| W10 | Pass | Using a window wins 2/16 with 295 minimum gate HP. With both windows unused, Good wins 1/11 after the gate falls in wave 3. |
| W11 | Pass | The isolated Ram breaks the gate when ignored. Tar and feathers leave 1,044 HP against the same Ram and Fire Pot. |
| W12 | Miss | Royal Survey costs Good an extra repair and drops the gate low point from 2,287 to 1,456 HP. Both runs end 3/20. Quartering costs two lives, from 2/20 to 2/18. |
| W13 | Pass | Feat-mode Good earns Not a nail on both levels. Person earns it on 22. Buying any repair forfeits the feat. |
| W14 | Pass | All five introductions, routes, skies and feats match the level table. The Ram and King appear only in the finale, in that order. |

## What the controls showed

- Level 21 trials put a Troll column behind the wave 3 Redcoats and shortened the yard. Ten added Trolls in one trial held Musketeer and Longbow to 1/6 and 1/7, but Good's gate fell and Person finished on three lives. Variants that held the gate gave the single-tower builds enough yard coverage to score two or more stars. The chosen table retains level 21's second-pass data. The exemption requires the single-tower case to be the sole miss.
- Level 22's first window covers the gate threshold and the second covers the far yard. Good's measured use is in wave 2 at 40.5 seconds and catches three Harpies and one Redcoat. Without windows Good leaks six Harpies in wave 2 and three Trolls in wave 6 after the wave 3 breach.
- On level 23 closing more of the west battery could reduce the score. In one three-site trial Good won 2/15 versus 3/20 without the Survey, but lost the gate and Person lost the level. The two locations selected here close Good's usual Mortar positions in the initial taxed and untaxed openings and keep the full W9 checks passing.
- On level 24 the east-only defence fights the west column on the shared stretch. Several trials broke its gate but also broke Good's full defence. The selected late west assault keeps Good standing at 278 HP with the Quartering fee paid.
- Finale trials that pushed Good to 15 or 16 lives also breached Good's gate or left Person below its acceptance margin. In the selected table Good holds, its Person gap is five lives and all its W9 checks pass except the 16-life ceiling.

## Person-like losses

| Level | Where the lives went |
|---|---|
| 21 | Nine Harpies in wave 2. The Trolls break the gate in that wave and are stopped in the yard. |
| 22 | Eight Trolls and two Harpies in waves 5 and 6, after the wave 4 breach. |
| 23 | One Harpy in wave 3 and four Trolls after the wave 5 breach. |
| 24 | Twelve Harpies in wave 2. The wave 5 breach costs zero lives. |
| 25 | Five Harpies in wave 2. The finale breach costs zero lives. |

## Phone captures

390 × 844 CSS pixels. The wave 2 cases use the actual private levels after
Good finishes wave 1. The finale cases stage the real Ram and King groups
without their escort and lower the gate to 1 HP for the yard case.

| Level | Evidence |
|---|---|
| 21 | [Wave 2](390x844-level-21-wave-2.png) |
| 22 | [Wave 2](390x844-level-22-wave-2.png) |
| 23 | [Wave 2](390x844-level-23-wave-2.png) |
| 24 | [Wave 2](390x844-level-24-wave-2.png) |
| 25 | [Wave 2](390x844-level-25-wave-2.png), [Ram at the gate](390x844-level-25-ram-at-gate.png), [King in the yard](390x844-level-25-king-in-yard.png) |

## Checks

Lint, typecheck, the 268-row asset manifest, build, size and the public
simulation passed. The site is 8,375,193 bytes of the 20 MB budget.
All 2,950 unit tests passed across 138 files. Playwright passed 1,272
tests across desktop, tablet and phone, with eight skips. The isolated
Old Keep cost case passed separately. The public browser comparison
passed on all three projects on the main export. All Playwright runs
used port 4173.

The exact Tap and Click tips fit the shipped renderer in 12 combinations
of size and font metrics. On desktop the wide-metrics line was 748 canvas
pixels against a 764 px wrap width. On the phone the ordinary tip was
384 px against 392 px. Both surveyed markers fit inside the phone canvas.

Restoring the dry-target exclusion and making the Survey check only
the first site in an isolated source copy caused three focused failures.
They caught the dry crowd, the bot's dry Ram choice, and construction
on the second surveyed site.
