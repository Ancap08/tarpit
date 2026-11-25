# Milestone 52b1 review

The Old Keep opens with Quartering at `?keep=1`. Add `&survey=1` to see Royal
Survey at the same site. Both runs have two roads, two pillow windows, a Ram
in wave 3 and the Not a nail exhibition feat.

## Captures

The frozen browser tests set the board and advance the simulation for each
capture. The window capture pair uses a real click or touch tap between
frames. The two groups hold against the same gate, and its health drops
from 480 to 477. The Ram capture shows its own 3 HP per tick after the
crowd has been replaced for the test.

| Scene | 390 × 844 | 960 × 580 |
| --- | --- | --- |
| Both roads in use, shared gate under attack | [Phone](390x844-two-roads.png) | [Desktop](960x580-two-roads.png) |
| Lit window with a tarred crowd | [Phone](390x844-window-lit.png) | [Desktop](960x580-window-lit.png) |
| Spent window and retreating crowd | [Phone](390x844-window-spent.png) | [Desktop](960x580-window-spent.png) |
| Ram at the gate | [Phone](390x844-ram-at-gate.png) | [Desktop](960x580-ram-at-gate.png) |
| Quartered site showing 35 gold | [Phone](390x844-quartering.png) | [Desktop](960x580-quartering.png) |
| Surveyed site | [Phone](390x844-royal-survey.png) | [Desktop](960x580-royal-survey.png) |

## W8 and checks

The comparison used a clean archive of `origin/main` at `a36cdd85`.
Nine policies each played all 20 campaign levels and all nine map and
difficulty combinations in Free play. All 261 serialized runs matched,
including terminal state, action log, counters, stars, and barrel impact.
The ordered comparison manifest had SHA-256
`6843ac83141f721b7633c5fd9a3090c485dae1c944941280e8ea2696eb86d875`
on each build. Both simulation commands exited zero. All 473 standard
output lines and six balance diagnostics matched. Person's Act One and
Act Two means stayed at 15.33 and 13.80 lives, with a handover of one life
and a largest drop of two lives.

The title, level 1 and Meadow Free play matched in 36 frozen comparisons
across Classic, Painted and Showpiece at desktop, tablet and both phone
heights. Each comparison matched the screenshot, serialized state, UI
rectangles, saved data and cold request inventory. JS filenames were
matched by their unhashed names and browser-generated blob URLs by count.
No comparison requested a Keep asset with the switch off.

Lint, typecheck, build, asset manifest and size checks passed. The site
was 8,368,300 bytes against the 20 MB budget. The Keep art was 4,559,412
bytes against 8 MB. All 2,940 unit tests passed. The full three-project
browser run had 1,266 passes and eight skips, including the separate
one-worker Keep cost test. After the headless bot changes, a fresh
production build passed all 66 targeted browser cases for the siege
controls, Keep isolation and the campaign bot hook. No screenshot
baselines were updated.

## Tests against intentionally wrong rules

Each row describes an isolated change in a disposable source copy and the
assertion that failed in `src/sim/siegeRules.test.ts`.

| Wrong rule | Failed assertion |
| --- | --- |
| Spawn every group on the main road | Both spawn records omit their road and the west group misses its entrance. |
| Omit the roads from Next preview data | Both preview entries lack the expected road fields. |
| Let west walkers bypass the gate | After one contact tick the shared gate has 0.3 HP instead of 0.2 HP. |
| Use the east length to check both exits | The west walker stays live and the town still has 20 lives instead of 19. |
| End a wave after only the east spawn quota is satisfied | The phase becomes `won` while a west spawn is pending. |
| Target by distance travelled | First chooses enemy 1 instead of 2. |
| Ignore the west centreline for build clearance | A cell on the branch becomes buildable. |
| Use the east firing mask on both roads | There is no shot at the in-range west walker. |
| Snap a blocker only to the east trail | An aim 63 px from the west entrance is accepted instead of refused. |
| Keep the shared guard exclusive to the east road | The second walker has no guard contact instead of contacting guard 0. |
| Forbid flinching across road ids | The shared-stretch walker has no flinch timer instead of 13 ticks remaining. |
| Omit west enemies from a keg at the join | One hit and kill instead of two. |
| Let the player shake in setup | The result is success with zero hits instead of `not-in-wave`. |
| Keep a shaken window lit | The window's `used` field stays false. |
| Ignore a window's coverage interval | The window reports five hits instead of three. |
| Include dry enemies in window targets | The window reports four hits instead of three. |
| Let the Ram do its ordinary blocker damage to the gate | The gate has 479.9333… HP instead of 477. |
| Use the Tar Pit’s retreat length in the window | After one tick the Ram has 87 retreat ticks instead of 62. |
| Count a Ram exit as a boss exit | The town has 15 lives instead of 19. |
| Allow tower construction on a quartered site | The build succeeds instead of returning `not-buildable`. |
| Free Quartering without debiting gold | The receipt leaves 100 gold instead of 65. |
| Allow construction on a surveyed site | The build succeeds on the closed site. |
| Forget that a repair was purchased | The win awards three stars instead of two. |
| Have Good and Person sample only the east road | Both bots return no purchase with west-only traffic. |
| Have Beginner walk only the east road | Beginner upgrades instead of building the west site. |
| Have Person pay without keeping its reserve | Person accepts a payoff with 104 gold. |
| Make Good disregard the value of a Ram at a window | Good skips the window instead of choosing window 0. |
| Let Person shake before its reaction tick | Person chooses window 0 at tick 89. |
| Give Beginner a window action | Beginner now offers a window action. |
| Let feat-seeking bots buy repairs | The feat policy calls for a repair. |
| Tie opening gold to earlier replays | Repeated serialized runs differ in state and action logs. |

## Tuning handoff

The Ram deals 180 gate HP per second. Against the exhibition's 480 HP,
that is 160 contact ticks on its own. The 63-tick retreat moves a Ram
31.5 trail px, and then it must cover those pixels again. The exhibition
keeps the 52a gate and yard numbers. Choose Act Three gate HP and repair
increments against measured total attack time for each roster.

The window and payoff decisions are optional methods on the bot policies,
so the W10 and W12 controls can turn off either action while retaining
other choices. Good and Person keep their ordinary repair thresholds.
Their feat policies decline repairs when pursuing Not a nail. The
campaign balance gate currently admits the three public Free play maps.
The campaign balance gate and public route to the Keep are part of the next
levels and screens work. W8 comparisons cover the existing campaign and
Free play; the new-level tuning targets still need their level fixtures.

At the exhibition numbers, opening Quartering and Royal Survey gave the
same results in both variants. Good and Person won with 18 lives, and
Beginner won with 17. The gate fell in every run. Good shook both windows
for three hits apiece. Person and Beginner used neither. No policy paid
off the exhibition site or bought a repair. The focused rule tests also
exercise circumstances where payoff and repair change bot decisions.

Road coordinates, window coverage, tax site and render anchors are in
[Converging roads and siege rules](../../DESIGN.md#converging-roads-and-siege-rules).
