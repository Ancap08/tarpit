# Milestone 52b2 review

The phone captures below show the verification fix pass. The
[second-pass review](second-pass/README.md) and
[third-pass review](third-pass/README.md) record the earlier tuning.

Open `?keep=21` through `?keep=25` to play the corresponding level
directly. The level map and saved campaign stop at level 20. A private
win shows the town's reply and this run's stars. The original siege
exhibition remains available at `?keep=1` for the earlier rule and art checks.

## Phone captures

These are CSS-pixel captures at 390 × 844 from the production build.
The first five use wave 2 of the actual level. Good plays the first
wave, then the browser advances wave 2 by 16 seconds. The Repair shot
shows level 22 in setup with one repair step of damage staged. The two
finale captures stage the actual Ram and King spawn groups without
their escort. The Ram hits the gate for one second before its capture.
For the yard shot the test reduces the gate to 1 HP before advancing
the simulation through the breach.

| Level | Scene |
| --- | --- |
| 21 Rent Overdue | [Wave 2](390x844-level-21-wave-2.png) |
| 22 Feather Beds | [Wave 2](390x844-level-22-wave-2.png) · [Repair warning](390x844-level-22-repair-warning.png) |
| 23 Both Roads | [Wave 2](390x844-level-23-wave-2.png) |
| 24 Quartering | [Wave 2](390x844-level-24-wave-2.png) |
| 25 The Final Notice | [Wave 2](390x844-level-25-wave-2.png) · [Ram at the gate](390x844-level-25-ram-at-gate.png) · [King in the yard](390x844-level-25-king-in-yard.png) |

The west branch and gate line use the plain siege trace. The existing
plates still contain the painted east road on the west-only stop.
The painted gatehouse and the rule's gate line are visibly separate.
Part c2 owns the art alignment.

## Verification fix pass

Level 21's Person run finishes on 12 lives, losing four each in waves 2
and 5. Good keeps 1,969 gate HP, earns Unbroken at all four small
nudges, and loses the gate when repair is disabled. On levels 22 and 24,
Person finishes with 17 and 8 lives with repair, or 12 and 6 without it.
The five nominal Person runs average 12.20 lives against Act Two's
13.80.

The Royal Survey sweep played all 45 pairs of the ten sites. Nineteen
pairs let Person earn two stars, and eighteen of those cost Good a
star. Good's control without a Survey was 3 stars and 20 lives.
The five rows below tie at 2 stars and 20 lives for Good. The selected
pair keeps Person at two stars on 14 lives and clears both Pillow
Window controls. The pair using (15, 4) with (23, 13) gives the same
scores and covers a Window in each tested layout.

| First site | Second site | Good stars/lives | Person stars/lives |
|---|---|---|---|
| **(13, 7)** | **(23, 13)** | **2/20** | **2/14** |
| (15, 4) | (23, 13) | 2/20 | 2/14 |
| (15, 13) | (22, 7) | 2/20 | 2/20 |
| (15, 13) | (23, 13) | 2/20 | 2/20 |
| (15, 13) | (22, 10) | 2/20 | 2/19 |

The Act Three target test names the expected misses in
[`checkKeep-verifier.test.ts`](../../../src/sim/checkKeep-verifier.test.ts)
and compares the entire list on every `npm test` run. W8 is covered by
the public parity tests and the browser walkthrough.

The complete unit run passed 2,982 tests across 140 files. In isolated
copies, the short pay-off, the one-gold fee and the hundredfold level 21
gate each made a test fail. The public comparison matched 309 full run
records, 473 simulation output lines and 24 campaign images against
`aacf7de`. Both public simulation runs exited zero.

The one full Playwright sweep passed 1,341 tests and skipped eight. Its
16 failures all found the overlap at (15, 4). The 142-case siege rerun
passed on all three projects with the selected pair, and the isolated
Old Keep cost case passed. Lint, typecheck, the 268-row asset check,
build and size checks passed. The production build is 8,376,279 bytes.

## Original tuning record

The observations below describe the first pass before the second,
third and verification passes.

## Tuning gate

`npm run sim:keep` evaluates the private act and exits nonzero on a
miss. Good wins all five with the gate standing. Person wins three
after a breach, on 22, 23 and 24. The six outstanding labels are W1,
W6, W7, W9, W10 and W12.

| Trial | Outcome |
| --- | --- |
| W1, half gate | Good loses ground on 21, 23, 24 and 25. On 22 the gate falls, but both scores are 2 stars and 20 lives. |
| W2, no repair | Good drops one star on 21, 23 and 25. It wins an extra feat star without repair on 22 and 24. |
| W4, no anti-air tower | 14, 12, 20, 20 and 20 lives lost while the gate stood. |
| W6, east-only / west-only lowest gate HP | 23: 0 / 6,353. 24: 2,801 / 7,577. 25: 5,659 / 7,634. The west-only defense loses all lives on 25 before the gate falls. |
| W7, Person's mean lives | 13.80 in Act Two and 18.00 in Act Three. The target for Act Three is at most 12.30. |
| W10, windows unused | Both win 2 stars and 20 lives. One window feathers three enemies and improves the low point from 175 to 255 HP. |
| W11, isolated finale Ram | The ignored Ram breaks the gate. Tar and feathers leave 2,078 HP with the same Fire Pot and Ram. |
| W12, no tax | Removing Survey leaves Good at 3 stars and 20 lives. Removing Quartering improves Good from 2 stars and 19 lives to 2 stars and 20 lives. Good and Person both pay on 24. |

The W9 numbers use stars/lives. Nudge order is HP −2%, HP +2%, gold −10,
gold +10. Feat trials include these same nudges. The new levels reuse the
late and finale limits.

| Level | Failing checks | Good under nudges | Other values at the miss |
| ---: | --- | --- | --- |
| 21 | L2, L1m, L6, V1 | 3/12, 3/12, 3/12, 3/20 | Beginner 2/12. Good loses with 15% less gold. Musketeer and Longbow each earn 3/20 alone. |
| 22 | V1 | 2/20, 2/20, 2/20, 2/20 | Musketeer 2/20 and Longbow 3/20 alone. |
| 23 | L1m, L6, F1, V1 | 3/20, 3/20, 1/9, 1/6 | Good loses with 15% more gold. Unbroken attempts also score 1/9 and 1/6 at ±10 gold. Musketeer 2/13 and Longbow 2/16 alone. |
| 24 | P1, L1m, F1, V1, R6 | 2/19, 1/11, 2/19, 1/10 | Person trails by 9 lives. Feathers earns 3/14. Not a nail misses at HP +2% and gold +10. Longbow alone 3/13. |
| 25 | F1, V1, L8 | 3/20, 3/20, 2/14, 3/20 | Unbroken drops to 2/14 at gold −10. Finale Good has 20 lives against the 12–16 target. Musketeer 2/15 and Longbow 2/18 alone. |

The first layouts put the gate too close to the join or the Mortar's
inner ring. Even eight Trolls could cost Good over 13,000 gate HP in a
wave once enough reached it together. The selected gate position and
repair steps let Good recover from early damage without saving Person
from later breaches. Several of those breaches still cost zero lives
because the shared defenses can finish the ground enemies in the yard.

The next tuning pass should start with separate pressure on the two
approaches before the join and concentrated air pressure after the first
wave. That gives the single-tower and Person trials different problems
to solve. Give Feather Beds a late tarred group in a window's stretch
whose release materially changes the score if the gate breaks. Put the
Survey on a site whose removal affects the wave while that site is
useful. The thresholds stay as commissioned.

## Deliberately wrong builds

Each run changed one rule or input in a disposable module transform and
checked that the named target reported a miss. None of the transforms
are in the implementation.

| Target | Wrong build | Diagnostic |
| --- | --- | --- |
| W1 | Give the half-HP control full HP. | Five tied scores, so all five controls miss. |
| W2 | Refuse Act Three repairs. | 0 of 5 levels improve with repair. |
| W3 | Start the gate at 1 HP. | Good holds on zero levels. |
| W4 | Let the gate stop Harpies. | Zero lives lost while the gate stands on all five levels. |
| W5 | Give Unbroken even after a breach. | Person earns Unbroken on 21, 23 and 25, above the two-level limit. |
| W6 | Start with 100 times the tuned gate HP. | The gate stands in all six one-road runs. |
| W7 | Double starting gold on 21. | Person averages 16.60 lives against Act Two's 13.80, still above 12.30. |
| W9 | Spawn all 40 opening Collectors at once on 22. | L5 reports 40 walkers in three seconds against the limit of six. |
| W10 | Make Good leave the windows unused. | Both runs finish 2/20 and bottom out at 175 HP with zero windows used. |
| W11 | Give the Ram ordinary blocker damage against the gate. | The ignored Ram leaves 14,344 HP, so it fails to break the gate. |
| W12 | Drop the tax when creating the game. | Both comparisons tie, including Quartering at 2/20 with and without the tax. |
| W13 | Treat a paid repair as eligible for Not a nail. | The paid-repair forfeiture check returns false. |
| W14 | Put pillow windows on level 21. | The opening level fails its rule-introduction check. |

## W8 and browser verification

The baseline was a clean export of `origin/main` at `aacf7de`.
Nine bot policies played all 20 public levels and all nine Free play
map-and-difficulty combinations. All 261 hashes match, including the
serialized state, logs, counters, stars and barrel impact. Both public
simulation runs exited zero with identical 473-line reports and six
diagnostic lines. The Act Two step is still 15.33 to 13.80 mean Person
lives, with one more life at the handover and a largest drop of two lives.

The desktop and phone campaign walkthroughs generated 24 matching
images of the old campaign maps, cards, results and level 20 ending.
The candidate also completed its tablet walkthrough. The private
route test replays a win while retaining the same saved progress.

The full browser command on port 4373 had 1,272 passes and eight skips
across Chromium desktop, tablet and phone. The separate one-worker
Keep performance check passed with median main-thread cost of 7.19 ms
per frame on low detail and 10.83 ms on high at 4× CPU throttling.
The seven new phone cases passed in the full run. Port 4373 was released.

All 2,949 unit tests passed. Lint, typecheck, production build, the
268-row asset manifest and both size budgets passed. Production is
8,374,094 bytes of the 20 MB budget. Keep art uses 4,559,412 of 8,000,000
bytes.
