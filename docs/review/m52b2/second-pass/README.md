# Milestone 52b2 second pass

Ten of fourteen targets pass. W6, W9, W10 and W12 still miss. The
level table is the closest result of the bounded tuning pass. The
acceptance thresholds are unchanged.

| Target | Result | Evidence |
|---|---|---|
| W1 | Pass | The half-gate runs breach on all five levels. Good falls from 3/18 to 2/13, 2/14 to 1/9, 3/20 to 2/19, 2/17 to 2/12 and 3/20 to 1/8. Scores are stars/lives. |
| W2 | Pass | With repairs forbidden, Good loses Unbroken on 21, 23 and 25. A full repair costs at least one tower, and the Person and half-gate controls can breach. |
| W3 | Pass | Good holds all five gates. Person breaches and wins all five. |
| W4 | Pass | The no-anti-air-tower control loses 20 lives while the gate stands on each level. |
| W5 | Pass | Feat-mode Good earns Unbroken on 21, 23 and 25. Feat-mode Person earns it on zero of the three. |
| W6 | Miss | Both one-road controls breach on 23 and 25. On 24 the west-only control breaches and wins 2/20. The east-only control wins 1/6 and has 2,324 HP left at its low point. |
| W7 | Pass | Person averages 11.20 lives against Act Two's 13.80, a drop of 2.60. The Act Three ceiling is 12.30. |
| W8 | Pass | All 261 public campaign and Free play run hashes match `origin/main` at `aacf7de`. Both public simulation reports match in all 473 output and 6 diagnostic lines. Act Two starts one life above the handover, has a largest adjacent drop of two lives, and averages 13.80 against Act One's 15.33. |
| W9 | Miss | Four of five levels meet the single-tower limit. The detailed misses are below. |
| W10 | Miss | Good feathers four enemies in wave 5 and three in wave 6. Both the full and unused-window runs win 2/14 and reach the same 372 HP low point. The advantage is zero lives and zero stars. |
| W11 | Pass | The isolated finale Ram breaks the gate when ignored. Tar and feathers leave 782 HP against the same Ram with the same Fire Pot. |
| W12 | Miss | Good opens with a Mortar at (22, 7) with the Survey removed. Both Survey scores are 3/20. Quartering costs Good three lives, from 2/20 without the tax to 2/17 with it. |
| W13 | Pass | Feat-mode Good earns Not a nail on 22 and 24. Feat-mode Person earns it on 22 only. Paying for even a partial repair forfeits it. |
| W14 | Pass | The five stops match the specified introductions, roads, skies and feats. The Ram and King appear only in the finale, in that order. |

## What the first pass showed

- Person averaged 18.00 and lost the gate on 22, 23 and 24. The breaches
  on 22 and 23 cost zero lives. A 12-life line was easy when Harpies
  leaked infrequently and the shared defenses killed the released walkers.
- The 21 repair bought up to 8,300 HP for 49 gold. The price contributed
  to gate survival in mixed runs. All five first-pass Longbow-only runs
  bought zero repairs, and refusing repairs gave the same five scores.
  On 22 the half gate did break in the first pass. The yard defense
  killed the released enemies, leaving the same 2/20 score.
- On 21 first-pass Good leaked eight Harpies in wave 2. It bought Quick
  Draw for its only Longbow. Person put two bows on overlapping stretches
  and leaked none. With only air-coverage weighting changed, the
  original level gave Good 3/20, with its gate low point rising from
  1,992 to 7,437 HP. The tuning pass uses that coverage priority and
  gives Good an incentive to bring one artillery tower alongside the bows.
- The roads still meet on the existing map. Changing gate position and
  putting Troll columns on each approach moved W6 from one of six
  breaches to five of six. The fast air on 24 costs the east-only
  control fourteen lives before its surviving ground coverage clears
  the walkers. The Survey now removes a site Good normally uses. The
  alternate build fills the gap well enough to tie the untaxed score.

## Level data

All five open with Collectors and introduce Harpy pressure in wave 2.
The later waves alternate escorts and Troll columns, with Harpies
present in every wave after the opener. Flights consist of four Harpies
at 0.2-second intervals. The entries below give the previous and
selected values. Repair means HP restored per full step and gold paid
for that step.

| Level | Gold | Enemy HP scale | Gate HP | Yard px | Repair HP/gold | Roads and rule | Waves 1–6 |
|---:|---:|---:|---:|---:|---:|---|---|
| 21 Rent Overdue | 290 | 1.00 | 15,000 → 8,160 | 275 | 8,300/49 → 2,600/90 | East, Unbroken | Collectors, Trolls, Redcoats, Hounds, Trolls and Collectors, Redcoats. |
| 22 Feather Beds | 230 → 235 | 1.00 → 1.12 | 3,850 → 4,800 | 275 → 160 | 750/46 → 1,150/66 | West, two pillow windows, Not a nail | Collectors, Redcoats, Trolls and Hounds, Trolls and Hounds, Redcoats and Trolls, a massed Troll front and Redcoats. |
| 23 Both Roads | 295 → 275 | 1.00 → 1.08 | 14,500 → 15,700 | 275 → 330 | 7,000/54 → 3,200/86 | Both, Survey moves from (22, 10) to (22, 7), Unbroken | Collectors, east Trolls and west Redcoats, roles swap, Hounds, two Troll columns, Redcoats. |
| 24 Quartering | 290 → 285 | 1.00 | 15,500 → 15,800 | 275 → 305 | 6,400/58 → 3,000/92 | Both, 80-gold Quartering at (22, 10), Not a nail | Collectors, west Trolls and east Redcoats, roles swap, Hounds, east Trolls then west Trolls, Redcoats. |
| 25 The Final Notice | 300 → 295 | 1.00 → 1.20 | 14,500 → 14,900 | 275 → 295 | 6,300/62 → 4,300/105 | Both, Ram then King, Unbroken | Collectors, east Trolls and west Redcoats, roles swap, Hounds, two Troll columns, west Ram and east King with Redcoats. |

The higher repair prices compete with tower purchases. Forty gold is
the price of a Longbow and now covers about 697–1,638 HP of repair,
depending on the level. Previously the same amount bought as much as
6,776 HP. W2 measures the benefit of spending that gold on a repair.
It does not put a market price on damage from a particular placement.

The 22 windows now cover 280–510 and 425–720 west trail px, up from
170–360 and 320–510, to reach the late attack as it crowds the gate.
Ram gate damage changes from 440 to 375 per second, with the raised
level HP scale and new gate position. It preserves the ignored versus
feathered contrast. The King lands about 1,320 gate damage in Good's
full run and breaks Person's gate in wave 6. Good kills the Ram before
it reaches the gate in the full run. The isolated Ram trial measures
the threat if it gets there.

The Good purchase weights are 1× → 4× for air coverage and 1× → 2.2×
for opening artillery placement in siege. The artillery weight replaces
the ordinary 2× mix bonus if that bonus already applies. The repair,
feat and Person decision rules retain their previous numbers. The road
preview sums repeated groups of a type on each road so the Harpy
flights do not repeat labels or obscure the other road's counts.

## Bot runs

Each cell gives stars/lives, lowest gate HP, repair count, window hits
per use and Last stand. Zero window hits means no window use. Good and
Person paid the 80-gold Quartering fee on 24, including their feat runs.

| Level | Good | Person | Beginner | Good pursuing the feat | Person pursuing the feat |
|---:|---|---|---|---|---|---|
| 21 | 3/18 · 354 HP · 3 · 0 · no | 1/11 · 0 HP · 0 · 0 · yes | 1/4 · 0 HP · 0 · 0 · yes | 3/18 · 354 HP · 4 · 0 · no · earned | 1/11 · 0 HP · 0 · 0 · yes · missed |
| 22 | 2/14 · 372 HP · 3 · 4+3 · no | 1/10 · 0 HP · 1 · 4 · yes | 0/0 · 0 HP · 0 · 0 · yes | 3/14 · 0 HP · 0 · 3 · yes · earned | 3/12 · 0 HP · 0 · 4 · yes · earned |
| 23 | 3/20 · 2,263 HP · 2 · 3+3 · no | 2/16 · 0 HP · 1 · 0 · yes | 0/0 · 0 HP · 0 · 0 · yes | 3/20 · 3,840 HP · 3 · 3+3 · no · earned | 2/16 · 0 HP · 1 · 0 · yes · missed |
| 24 | 2/17 · 647 HP · 3 · 4+3 · no | 1/8 · 0 HP · 0 · 0 · yes | 0/0 · 0 HP · 0 · 0 · yes | 3/17 · 2,490 HP · 0 · 4+3 · no · earned | 1/8 · 0 HP · 0 · 0 · yes · missed |
| 25 | 3/20 · 208 HP · 3 · 3+4 · no | 1/11 · 0 HP · 2 · 0 · yes | 0/0 · 0 HP · 0 · 0 · yes | 3/20 · 2,593 HP · 4 · 3+4 · no · earned | 1/11 · 0 HP · 2 · 0 · yes · missed |

Person loses lives to:

- **21** Nine Harpies in wave 2 while the gate stands. The Trolls break it in that wave and are stopped in the yard.
- **22** Seven Trolls and three Harpies in waves 5 and 6 after the wave 4 breach.
- **23** Four Trolls after the wave 5 breach. No Harpies leak in this run.
- **24** Twelve Harpies in wave 2 while the gate stands. The wave 5 breach costs zero lives.
- **25** Six Harpies in wave 2 and three in wave 3 while the gate stands. The King breaches it in the finale and dies in the yard.

21 is the only Beginner win and teaches one system. Person finishes
five lives higher on 23 than on 21, so the opening is not the gentlest
by that measure. The intended penalty for a Person breach occurs on
22 and 23. The intended losses to air while the gate stands occur on
21, 24 and 25.

## W9 margins

Nudges appear in the order HP −2%, HP +2%, opening gold −10, opening
gold +10. The feather bot's constraint caps its advantage over Good.
It allows the loss measured on 22.

| Level | Good under nudges | Precise misses |
|---:|---|---|
| 21 | 3/20, 3/17, 2/15, 3/18 | P1 deficit 7, limit 6. V1 Musketeer and Longbow each earn 3/20, limit one star. F1 feat at gold −10 earns 2/15. L6 Good at gold −15% falls from 3 stars to zero, two stars beyond the one-star tolerance. |
| 22 | 2/14, 2/14, 2/14, 1/7 | L1m at gold +10 misses one star and six lives of the 13-life margin. F1 on the same nudge earns 1/7, two stars short. L6 Person at gold −15% moves from 1/10 to 3/18, one star outside tolerance. |
| 23 | 3/20, 2/20, 3/20, 3/20 | F1 at gold −10 earns 2/17. L6 Person at gold −15% goes from 2/16 to 0/0, one star outside tolerance. |
| 24 | 2/20, 2/17, 2/17, 2/20 | P1 deficit 9, three lives over the limit. |
| 25 | 3/20, 2/20, 3/20, 3/20 | P1 deficit 9, three lives over the limit. F1 at HP +2% earns 2/20 after a breach. L8 Good ends at 20, four lives over the finale ceiling. |

Keep the four acceptance thresholds. The one-road defense still has
coverage after the join, so the shared road and yard are part of W6's
remaining problem. W9 exposes reliable generalist coverage on the
single east road and a large change in purchases at small budget
increments. On W10 the windows change late movement while every Good
leak happens in wave 2. A score benefit needs the windows to help
during the decisive pressure, such as a window over a threatened
patch that can actually be kept tarred. On W12 closing the Mortar site
changes the opening but the alternate battery compensates. These are
reasons to revisit the encounter and how the mechanics interact, with
the existing score tests intact.

## Shipped tips

**21**

- Use high ground to reach farther. The wall is ours.
- Mend the gate between waves. Keep bows for Royal Harpies.
- Gate down? Towers fire double for a moment. Hold the yard.

**22**

- Tap a lit window to feather tarred tax collectors. (Click on desktop.)
- One pillow per window. Make the King count them.

**23**

- We paid for both roads. Put towers on both.
- The Survey closes one spot. Use the rest of the wall.

**24**

- Pay off the Redcoat in setup to build on his spot.
- He eats for free. Pay him off only if you need the spot.

**25**

- Tar and feather the Ram. Return the notice to sender.
- Keep towers in reach of the gate for the King.

Both replacements fit the 61-character limit at 58 and 56 characters.
Measured with the shipped Phaser text style, the replacement rows fit
the 764 px landscape and 392 px portrait wrap widths, with space
remaining before the button in both layouts.

## Phone captures

These 390 × 844 Chromium captures use the production build. The first
five show the actual level in wave 2 after Good plays the opening wave.
The finale cases stage its real Ram and King groups without the escort.
The yard case lowers the gate to 1 HP before advancing through the
breach. The plain gate markers and west road still use the siege trace.

| Level | Capture |
|---:|---|
| 21 | [Wave 2](390x844-level-21-wave-2.png) |
| 22 | [Wave 2](390x844-level-22-wave-2.png) |
| 23 | [Wave 2](390x844-level-23-wave-2.png) |
| 24 | [Wave 2](390x844-level-24-wave-2.png) |
| 25 | [Wave 2](390x844-level-25-wave-2.png) · [Ram at gate](390x844-level-25-ram-at-gate.png) · [King in yard](390x844-level-25-king-in-yard.png) |

## Verification

Lint, typecheck, the asset manifest check, build and size check passed.
All 2,949 unit tests passed across 138 files. The production site uses
8,374,785 bytes of the 20 MB budget. The Keep art uses 4,559,412 bytes
of its 8 MB budget.

On port 4373, the three-project browser suite passed 1,272 tests with
eight skips. The isolated Old Keep performance case passed separately,
with median main-thread costs of 5.94 ms per frame on low detail and
9.30 ms on high detail at 4× CPU throttle. All seven private-level phone
cases passed, including replay with the same saved progress. The
desktop and phone campaign comparison produced 24 byte-identical
captures against main, including the public maps and level 20 ending.
The seven second-pass captures were inspected at 390 × 844. Port 4373
was released.

The Act Three tuning gate exited 1 for the four reported misses. The
scope says to remove the `?keep=1` exhibition route when level 21 exists.
The branch still uses it for the original art and siege checks. The five
playable levels remain available via `?keep=21` through `?keep=25`.

## Changed spawn groups

Group numbers give count, interval and delay in seconds, matching
the [design spec](../../../DESIGN.md#private-act-three). E and W
indicate road. A flight entry gives the number of four-Harpy groups,
their first delay and the gap between the starts of consecutive groups.

| Level | Wave | First pass | Second pass |
|---:|---:|---|---|
| 21 | 2 | E Troll, 8, 5.6, 0 · E Harpy, 14, 3.15, 5 | E Troll, 8, 5.6, 0 · E Harpy flights ×8, first 8, every 6.3 |
| 21 | 3 | E Redcoat, 43, 0.95, 0 | E Redcoat, 43, 0.95, 0 · E Harpy flights ×3, first 8, every 8.2 |
| 21 | 4 | E Hound, 45, 0.95, 0 · E Harpy, 14, 3.15, 8 | E Hound, 45, 0.95, 0 · E Harpy flights ×8, first 5, every 5.6 |
| 21 | 5 | E Troll, 14, 3.65, 0 · E Collector, 20, 2.4, 7 | E Troll, 10, 3.5, 0 · E Collector, 20, 2.4, 7 · E Harpy flights ×6, first 8, every 7 |
| 21 | 6 | E Redcoat, 52, 0.85, 0 · E Harpy, 26, 1.83, 0.4 | E Redcoat, 52, 0.85, 0 · E Harpy flights ×10, first 5, every 5.1 |
| 22 | 1 | W Collector, 40, 1, 0 | W Collector, 28, 1.3, 0 |
| 22 | 2 | W Redcoat, 49, 0.93, 0 · W Harpy, 14, 3.15, 8 | W Redcoat, 34, 1.26, 0 · W Harpy flights ×10, first 5, every 4.2 |
| 22 | 3 | W Troll, 9, 6.3, 0 · W Hound, 21, 2.2, 7 | W Troll, 9, 5.8, 0 · W Hound, 16, 2.8, 8 · W Harpy flights ×8, first 11, every 4.8 |
| 22 | 4 | W Hound, 43, 0.96, 0 · W Harpy, 28, 1.55, 0 | W Troll, 6, 4.6, 4 · W Hound, 31, 1.51, 4 · W Harpy, 34, 0.8, 2 |
| 22 | 5 | W Redcoat, 46, 0.95, 0 · W Troll, 12, 4.4, 3 | W Redcoat, 38, 1.23, 0 · W Troll, 10, 4.8, 3 · W Harpy flights ×5, first 8, every 8.8 |
| 22 | 6 | W Hound, 52, 0.91, 0 · W Harpy, 49, 1.05, 0 | W Troll, 4, 0.3, 4 · W Troll, 12, 1.9, 8 · W Redcoat, 22, 1.8, 12 · W Harpy flights ×9, first 7, every 5.35 |
| 23 | 2 | E Troll, 8, 6.4, 0 · W Redcoat, 37, 1.37, 0 · W Harpy, 15, 3.2, 5 | E Troll, 5, 7, 0 · W Redcoat, 26, 1.6, 0 · W Harpy flights ×5, first 9, every 7 |
| 23 | 3 | E Redcoat, 31, 1.6, 0 · W Hound, 32, 1.54, 0 | E Redcoat, 30, 1.65, 0 · W Troll, 8, 6.1, 0 · E Harpy flights ×9, first 6, every 4.5 |
| 23 | 4 | E Hound, 30, 1.6, 0 · W Hound, 24, 2.1, 0 · E Harpy, 36, 1.45, 0 | E Hound, 30, 1.6, 0 · W Hound, 24, 2.05, 0 · W Harpy flights ×11, first 1, every 4.4 |
| 23 | 5 | E Troll, 13, 4.4, 0 · W Troll, 10, 5.4, 4 | E Troll, 13, 2.7, 0 · W Troll, 13, 2.7, 4 · E Harpy flights ×6, first 9, every 7.2 |
| 23 | 6 | E Redcoat, 38, 1.5, 0 · W Redcoat, 33, 1.75, 0 · W Harpy, 41, 1.4, 0 | E Redcoat, 36, 1.46, 0 · W Redcoat, 29, 1.84, 0 · W Harpy flights ×8, first 6, every 6.1 |
| 24 | 2 | W Troll, 8, 6.4, 0 · E Redcoat, 37, 1.37, 0 · W Harpy, 15, 3.2, 5 | W Troll, 6, 7, 0 · E Redcoat, 33, 1.5, 0 · W Harpy flights ×5, first 8, every 8.5 |
| 24 | 3 | W Redcoat, 36, 1.6, 0 · E Hound, 35, 1.56, 0 | W Redcoat, 35, 1.45, 0 · E Troll, 9, 5.9, 0 · E Harpy flights ×8, first 10, every 5.1 |
| 24 | 4 | W Hound, 30, 1.6, 0 · E Hound, 24, 2.1, 0 · W Harpy, 37, 1.45, 0 | W Hound, 30, 1.6, 0 · E Hound, 24, 2.05, 0 · W Harpy flights ×8, first 3, every 6.1 |
| 24 | 5 | E Troll, 13, 4.8, 0 · W Troll, 12, 4.9, 3 | E Troll, 11, 4, 0 · W Troll, 13, 4, 11 · E Harpy flights ×7, first 6, every 6.8 |
| 24 | 6 | W Redcoat, 46, 1.45, 0 · E Redcoat, 33, 1.95, 0 · E Harpy, 42, 1.35, 0 | W Redcoat, 41, 1.35, 0 · E Redcoat, 32, 1.8, 0 · E Harpy flights ×9, first 4, every 5.8 |
| 25 | 2 | E Troll, 9, 6.1, 0 · W Redcoat, 39, 1.4, 0 · W Harpy, 15, 3.2, 5 | E Troll, 7, 6.4, 0 · W Redcoat, 34, 1.51, 0 · W Harpy flights ×5, first 8, every 8 |
| 25 | 3 | E Redcoat, 36, 1.7, 0 · W Hound, 35, 1.6, 0 | E Redcoat, 32, 1.58, 0 · W Troll, 9, 5.8, 0 · E Harpy flights ×5, first 8, every 8.5 |
| 25 | 4 | E Hound, 32, 1.6, 0 · W Hound, 27, 2.1, 0 · E Harpy, 39, 1.45, 0 | E Hound, 30, 1.6, 0 · W Hound, 25, 2.05, 0 · W Harpy flights ×8, first 4, every 6.1 |
| 25 | 5 | E Troll, 13, 4.8, 0 · W Troll, 12, 5.2, 3 | E Troll, 10, 4.8, 0 · W Troll, 10, 4.8, 3 · E Harpy flights ×6, first 10, every 8 |
| 25 | 6 | W Ram, 1, 0, 13 · E Redcoat, 29, 1.6, 0 · W Redcoat, 23, 2, 0 · W Harpy, 34, 1.6, 0 · E Harpy, 18, 2.8, 8 · E King, 1, 0, 51 | W Ram, 1, 0, 12 · E Redcoat, 28, 1.8, 0 · W Redcoat, 22, 2.35, 0 · E Harpy flights ×13, first 6, every 4.55 · E King, 1, 0, 24 |
