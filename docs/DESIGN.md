# Tarpit: game design spec

Numbers here are the values tuned in the milestone 6a balance pass, the
milestone 12 balance pass v2 and the milestone 25c horde retune (see
DEVLOG.md for before and after, and `npm run sim` for the evidence).
Anything not in this file or `docs/SCOPE.md` is out of scope.

## Space and time

- Canvas 960 x 580 (v2, milestone 9; v1 was 960 x 540). The map uses the
  top 960 x 480; the HUD uses the bottom 100 px in two rows: stats, the
  next-wave preview and the Special, Start Wave and speed buttons, then the
  build bar.
- Positions are in pixels. Speeds are pixels per second.
- The simulation runs at a fixed 60 ticks per second (`dt = 1/60 s`). It has
  no randomness in v1, so a given sequence of actions always produces the
  same state. Tests assert exact values.
- The 2x speed toggle is a renderer concern: it runs two ticks per frame
  instead of one. The simulation does not know about it.

## Map

One map, one path, and a build grid. The path is a polyline of waypoints from
the spawn (left edge) to the exit (right edge); enemies move along it by
distance travelled.

Path (pixels): (0,240) (160,240) (160,96) (420,96) (420,384) (680,384)
(680,192) (960,192).

Build grid (v2, milestone 8): the 960 x 480 map is a 30 x 15 grid of 32 px
cells. A cell `{ col, row }` has its centre at (col * 32 + 16, row * 32 + 16)
and the integer key `row * 30 + col`. A cell is buildable when it is inside
the grid, its centre is at least 36 px (inclusive) from the path centreline,
its 32 px square does not overlap a landmark, and no tower stands on it. The
one landmark is the exit cottage's box, x 908..944, y 131..168 (milestone
9), which removes cells (28,4) and (29,4); the spawn cave sits on path
cells already. On this map 344 of the 450 cells pass the path and landmark
rules (346 by the path rule alone). Each cell holds at most one tower. Building on a cell outside the grid,
on the path strip or with a non-integer column or row is refused
(`not-buildable`); building on an occupied cell is refused (`cell-occupied`).
Towers fire in cellKey order (row by row, left to right).

## Economy and lives

- Start with 100 gold and 20 lives on Normal (see Difficulty).
- Each kill pays the enemy's bounty. Clearing a wave pays a 25 gold bonus.
- Calling the next wave early (milestone 25c, see Waves) pays the current
  wave's 25 clear bonus at once plus an early bonus of up to 20.
- An enemy reaching the exit costs 1 life (the boss: 5) and is removed.
- Lives at 0 or below: lose, immediately.
- Clearing wave 10 with lives above 0: win. After the win the player may
  keep going into endless waves (milestone 26, see Endless mode), where
  clearing a wave never wins again.
- Sell returns 70% of the total spent on that tower (build plus upgrade),
  rounded down, for a locked tower, plus in full any upgrade bought on it
  during the current setup phase. An unlocked tower (built during the
  current setup phase) is removed for everything spent on it. See Planning
  phase.

## Planning phase

Milestone 25a, from `docs/SCOPE-v4.md`. Each tower carries `locked`,
`unlockedSpend` (gold spent on it this setup phase and refundable in full)
and `upgradedThisPhase`.

- **Lock.** A tower built during setup is unlocked, with `unlockedSpend` =
  its cost. A tower built during a wave is locked at once (`unlockedSpend`
  0). Start Wave locks every tower and zeroes `unlockedSpend` and
  `upgradedThisPhase`. Unlocked towers show a pale dashed outline round
  their cell; it goes when the wave starts.
- **Refund.** Selling an unlocked tower refunds all of `spent` (build plus
  any upgrade bought this phase); the panel's Sell reads "Remove  +50".
  Selling a locked tower refunds its `unlockedSpend` (an upgrade bought
  this setup phase) in full plus 70% of the rest, rounded down, in any
  phase (`towerSellValue`): a Musketeer built earlier for 50 and upgraded
  this setup for 35 sells for 35 + 35 = 70, the same as Undo upgrade then
  Sell; after Start Wave it sells for 70% of 85 = 59. One `sell` event
  with the total; `full` is true only for an unlocked tower.
- **Move.** In setup an unlocked tower can be dragged to any buildable
  cell (same rule as a build) for free; it keeps its type, upgrade,
  targeting mode and spend, and the towers stay in cellKey order.
  `moveTower(state, from, to)` refuses with `game-over`, `not-in-setup`,
  `no-tower`, `locked`, `not-buildable`, `cell-occupied`, checked in that
  order; moving onto its own cell succeeds and changes nothing. Event
  `move {from, to, tower}`.
- **Undo upgrade.** An upgrade bought in setup, on an unlocked or a locked
  tower, adds its cost to `unlockedSpend` and can be undone until Start
  Wave: `undoUpgrade(state, cell)` refunds the full upgrade cost, reverts
  the tower to base and reduces `spent` and `unlockedSpend`; a locked tower
  stays locked. Refused with `game-over`, `not-in-setup`, `no-tower`,
  `nothing-to-undo`. The panel's Upgrade slot reads "Undo upgrade  +35"
  (14 px) while this is possible. Event `undoUpgrade {cell, tower,
  refund}`. An upgrade bought mid-wave adds nothing to `unlockedSpend` and
  cannot be undone.
- **Drag to place.** Press a build bar button the player can afford and
  drag onto the map; a press becomes a drag past 8 px. The ghost snaps to
  the cell aimed at, with its range and the green or red cell as for
  placement; over a red cell the drag also shows the ghost at 0.35 opacity
  under a red wash, without range (click and two-tap placement show the
  red cell only). On touch the drag aims at the point 48 px above the
  finger and a thin line joins finger and ghost; the drag is valid
  whenever that aim point is on the map, even with the finger over the
  HUD, so the bottom row is reachable, and aims at nothing once the aim
  point is off the map. The mouse aims at itself, and nothing while it is
  over the HUD. Release on a buildable cell builds there; release on
  another cell, with nothing aimed at, or outside the canvas cancels. A
  mouse move that reports no button down (a release the page never saw)
  also cancels the drag. Either way the pick stays selected, as after a bar
  click. A press and release without a drag is a bar click (toggle the
  pick). Works mid-wave too (the new tower is locked).
- **Drag to move.** In setup, press an unlocked tower and drag past 8 px:
  the tower dims at its origin and a ghost follows (same 48 px lift on
  touch); release on a buildable cell moves it, anywhere else cancels. A
  press without a drag selects the tower as before. Locked towers do not
  drag.
- Click and two-tap placement are unchanged. The archetypes never sell an
  unlocked tower (`noAntiAir` sells bows built in earlier phases, which are
  locked), so every archetype result is unchanged.

## Difficulty

Milestone 25, from `docs/SCOPE-v4.md`. Picked on the title menu before
each game (Normal preselected); `createGame({ difficulty })` defaults to
Normal and the level is recorded in `state.difficulty`.

| | Easy | Normal | Hard |
|---|---|---|---|
| Enemy hp | 0.75x | 1x | 1.2x |
| Start gold | 150 | 100 | 80 |
| Lives | 30 | 20 | 15 |

Milestone 25c retuned the table (Easy lives 25 -> 30, Hard hp 1.3x ->
1.2x) so that the lazy build wins on Easy and the best Hard plan wins.
**Hard hp rule** (milestone 25c second pass): no enemy's Hard hp sits 1 or
2 points above a multiple of a tower's base damage (Musketeer 12, Longbow
and Fire Pot impact 4, Cannon 25, Mortar 45; the Tar Pit's 3 is left out,
since every number is 0, 1 or 2 above a multiple of 3), so no Hard enemy
needs one extra shot by accident. The first pass's 13 hp Hard Goblin (one
over the Musketeer's 12) made every Musketeer opening lose on wave 1.
An enemy spawns with `round(base hp x multiplier)`, a whole number (half
rounds up), which is also its full hp for the hp bar and the boss bar.
Bounties, speeds, towers, upgrades and waves are the same on every level.
Normal has multiplier 1, 100 gold and 20 lives, so every Normal number in
this file is the base number.

| Enemy | Easy | Normal | Hard |
|---|---|---|---|
| Goblin | 14 | 19 | 23 |
| Wolf | 15 | 20 | 24 |
| Troll | 675 | 900 | 1080 |
| Harpy | 27 | 36 | 43 |
| Shieldbearer | 53 | 70 | 84 |
| Grumblefoot (boss) | 3000 | 4000 | 4800 |

Title menu: the title and subtitle, a "Difficulty" caption and a row of
three 132 x 42 buttons (Easy, Normal, Hard; the selection highlighted like
the build bar's active pick) at y 244, a band (y 302 to 430) for the map
row of milestone 27 (y 302 to 400) and the high-score line (milestone 26,
centred on y 414; see Endless mode), a 200 x 42
[Play] at y 446, and a prompt line. Clicking a level only selects it; Play
(or Enter or Space) starts the game; Left and Right move the selection.
The selection is kept for the page session. The title reports ready (the
`titleReady()` hook, and its buttons in `uiRects()`) from its first
rendered frame: on a first visit Phaser makes the buttons hit-testable
only from the scene's next update after `create()`, and a click before
that is lost (milestone 26 follow-up; nothing is drawn yet then, so only
a test can click that early). Specs wait with `e2e/title.ts`
`waitForTitle`. On Easy and Hard the HUD shows
the level's name in small muted text under the wave counter (which moves
up 7 px); on Normal there is no tag. The end screens have [Play again]
(same level) and a 100 x 42 [Menu] beside it that returns to the title;
the win screen also has [Keep going] (milestone 26).

## Enemies

| Type | HP | Speed | Bounty | Notes |
|---|---|---|---|---|
| Goblin | 19 | 60 | 2 | normal; two Musketeer shots |
| Wolf | 20 | 120 | 2 | fast |
| Troll | 900 | 35 | 8 | tanky |
| Harpy | 36 | 90 | 3 | flying (milestone 22) |
| Shieldbearer | 70 | 45 | 5 | shield (milestone 22) |
| Grumblefoot, the Troll King | 4000 | 25 | 150 | boss: 5 lives on exit, slows capped at 30% (milestone 23) |

Milestone 25c (horde retune) lowered the bounties (before: Goblin 30 hp /
4 gold, Wolf 28 / 5, Troll 700 / 8, Harpy 40 / 7, Shieldbearer 120 / 9),
raised the counts about 2.4 times and set the hp above; speeds are
unchanged. Its first pass (Goblin 12, Wolf 17, Troll 500, Harpy 22) made
the waves denser, not longer; the second pass spread them out and raised
the hp (DEVLOG).

**Flying and shields** (milestone 22, from `docs/SCOPE-v4.md`). A Harpy
flies over the path. Tar Pit, Cannon and Mortar never target it, and a
Cannon or Mortar splash skips it even when it is inside the radius. A Fire
Pot targets it and its impact hits (4 damage), but the burn does not stick:
no surface to burn. Musketeer and Longbow hit it normally. A Shieldbearer
takes half damage from any shot whose base damage is 10 or less: base
Longbow 4 -> 2, upgraded Longbow 9 -> 4.5, Fire Pot impact 4 -> 2, Tar Pit
3 -> 1.5. Shots over 10 (Musketeer 12 and 22, Cannon, Mortar) and burn
damage are full. Hp can be fractional; the 1e-9 death threshold (see Burn)
applies. A `hit` event carries the damage actually dealt. On screen a Harpy
flies 16 px above its path position with a soft ground shadow, above every
other enemy and the tower labels. No tower can tar or burn it, but a
special can (see Special attacks), and then it shows the tar and burn
rings and tints like a walker; a Shieldbearer carries a small grey shield
mark on its left.

**Boss** (milestone 23, from `docs/SCOPE-v4.md`). Grumblefoot, the Troll
King, is one unit at the end of wave 10: wave 10's last group, 65 s after
the wave starts (waveTick 3900), 2 s after the last spawn of the other
groups (the 15th Troll at 63 s; milestone 25c). He walks (every tower can target him and
splash and burn work on him, including the doubled burn under tar) and has
no shield. Slows cap at 30% on him: a stronger slow is applied at 30% for
its full duration (the Tar Pit's 40% and 60% both become 30%, so he walks
25 x 0.7 = 17.5 px/s while tarred), and the `slowed` event carries the
applied 0.3. If he exits he costs 5 lives (at 5 or fewer the game is lost
at once); a kill pays 150. Wave 10 clears only when he is dead or gone (the
usual rule), so a win needs him killed, or exited with lives to spare.
The simulation emits `bossSpawn` after his `spawn` event and `bossDown`
(cause `shot`, `burn` or `exit`) after his `kill` or `exit` event. On
screen he is a 2x sprite (100 px frame) above the walkers and below shots,
hp bars, labels and Harpies, with a wide ground shadow; instead of a small
hp bar, a HUD boss bar shows while he lives: 300 x 14 px centred at the
top of the map (y 24), dark trough, red fill proportional to his hp, 1 px
cream border, "hp / 4000" right-aligned inside, and his name in 14 px on a
dark pill above its left end (y 4 to 22). The wave 10 preview reads
"Next: 20 Wolf, 15 Troll, 12 Harpy, 8 Shieldbearer + Grumblefoot"; a preview
too long for one 16 px line (264 px since milestone 25b, 350 before) wraps
to two 13 px lines, or, if that takes three lines, to two 11 px lines
(milestone 25c; only the wave 10 preview needs it).

A slow effect multiplies speed by `(1 - slow)` for its duration. Slows do not
stack: the strongest slow applies, and a new slow of equal or greater strength
refreshes the duration.

**Special slow channel** (milestone 25c). An enemy has two slow slots:
the tower slot (`slow`, `slowTicksLeft`, set by Tar Pits through
`applySlow`) and the special slot (`specialSlow`, `specialSlowTicksLeft`,
set by the Tar Barrel through `applySpecialSlow`). Each slot follows the
rule above on its own and counts down on its own; neither blocks or
shortens the other, so a Tar Barrel is never wasted on an enemy under a
stronger Tar Pit slow and a Tar Pit hit never cuts the barrel short. The
enemy moves at `(1 - effectiveSlow)`, where `effectiveSlow` is the
stronger of the two active slots, capped by the boss's 30%. An enemy is
"tarred" (burns double) while either slot is active (`isTarred`); the
renderer's tar ring and tint follow the same rule.

## Towers

Hits are instant in the simulation (the renderer draws the shot). A tower
fires when its cooldown is zero and a target is in range, then its cooldown
resets to `1 / fireRate` seconds.

Targeting: a tower first takes the enemies it may shoot: in range, outside
a minimum range (the Mortar only targets enemies whose distance is in
[minimum, range], both inclusive; its splash still hits enemies inside the
minimum range), and not flying for Tar Pit, Cannon and Mortar. Among those
it picks by its targeting mode (milestone 24), shown and cycled on the tower
panel's "Target" button (first, last, strongest, first again):

- **First** (the default): furthest along the path (closest to the exit).
  Ties go to the lower enemy id.
- **Last**: closest to the spawn (lowest path distance). Ties go to the
  lower enemy id.
- **Strongest**: highest current hp. Ties go to the furthest along the
  path, then the lower enemy id.

Every tower is built in First; the mode is part of the tower, so selling
and rebuilding resets it. Changing the mode is free and allowed in setup and
during a wave. Splash, slow and burn follow the chosen target.

| Tower | Cost | Range | Damage | Fire rate | Effect |
|---|---|---|---|---|---|
| Musketeer | 50 | 110 | 12 | 1.0/s | single target |
| Cannon | 80 | 90 | 25 | 0.5/s | splash: all enemies within 40 px of the target take full damage |
| Tar Pit | 60 | 90 | 3 | 2.0/s | target slowed 40% for 2 s |
| Longbow | 40 | 150 | 4 | 2.5/s | single target |
| Mortar | 110 | 220, minimum 70 | 45 | 1/3 per s | splash: all enemies within 60 px of the target take full damage |
| Fire Pot | 70 | 100 | 4 | 0.8/s | target burns 5/s for 3 s (see Burn) |

The Longbow, Mortar and Fire Pot (v2, milestone 10) joined the build bar
in milestone 11. Cooldowns are round(60 / fire rate) ticks: Longbow 24,
Mortar 180, Fire Pot 75.

One upgrade per tower:

| Tower | Upgrade cost | Changes |
|---|---|---|
| Musketeer | 35 | damage 22, range 125 |
| Cannon | 60 | damage 40, splash radius 55 |
| Tar Pit | 50 | slow 60%, range 105 |
| Longbow | 30 | damage 9, range 170 |
| Mortar | 80 | damage 70, splash radius 70 |
| Fire Pot | 50 | burn 8/s for 4 s |

Sell refunds after an upgrade: Longbow 49, Mortar 133, Fire Pot 84.

**Burn.** A Fire Pot hit that leaves its target alive sets a burn on it: 5
damage per second for 3 s (180 ticks), or 8/s for 4 s (240 ticks)
upgraded. An impact kill sets no burn. Burns do not stack: a new burn with
dps equal to or greater than the active one replaces it (strength and
duration); a weaker one is ignored. Each tick a burning enemy takes
dps / 60 damage, doubled if it is tarred at that moment (either slow
slot active, milestone 25c; `slowTicksLeft > 0` before), then its burn
timer counts down. So hp can be
fractional; an enemy counts as dead at hp <= 1e-9, which absorbs floating
point error so burn kills land on the tick exact arithmetic gives (a lone
Fire Pot kills a static 30 hp Goblin 216 ticks after its first hit, or 132
under tar). Burn
deaths pay the bounty like any kill.

Range is measured from the tower's cell centre to the enemy's position.

**Kill counts** (milestone 25c). Each tower has `kills`, 0 when built. It
goes up by one for every enemy its shot kills (a splash counts each enemy
it kills) and for every enemy its burn kills: a burn remembers the cell
of the tower that applied it (`burnOwner`; it changes only when a burn is
actually applied) and a burn kill counts for the tower on that cell.
Special kills, including a Fire Arrows burn, count for no tower. Selling
a tower clears its burns' ownership, so a tower rebuilt on the cell
starts from 0; moving and upgrading keep the count. The tower panel shows
it as a 13 px "Kills 43" line above its buttons (names.ts `KILLS_TEXT`);
the panel is 214 x 166 (146 before, plus the 20 px line).

## Special attacks

Milestone 25b, from `docs/SCOPE-v4.md`; milestone 25c raised the Fire
Arrows burn from 10/s to 30/s and gave the Tar Barrel its own slow
channel; milestone 28 retunes (`src/sim/specials.ts` `SPECIAL_DEFS`).

| Special | Unlocks on wave | Radius | Effect |
|---|---|---|---|
| Powder Keg | 1 | 70 px | 80 damage |
| Tar Barrel | 4 | 90 px | slow 0.5 for 240 ticks (4 s); the boss's 30% cap applies |
| Fire Arrows | 7 | 80 px | burn 30/s for 240 ticks (4 s); 10/s before milestone 25c |

- **Charge.** `state.specialCharges` is 0 or 1. Start Wave sets it to 1;
  the wave clear sets it to 0, so an unused charge does not carry over
  (the next wave starts with 1, never 2). One special per wave. Calling
  the next wave early (milestone 25c) also sets it to 1.
- **Use.** `useSpecial(state, type, {x, y})` acts at once, between ticks,
  like a build, on every live enemy whose position is within the radius of
  the aimed point (inclusive: 70 px hits, 70.01 does not). Refused, in this
  order, with `game-over`, `not-in-wave` (setup), `locked` (`state.wave` <
  the unlock wave), `no-charge`, `out-of-bounds` (the point must be inside
  0..960 x 0..480, edges included). A refusal changes nothing.
- **Flyers and shields.** Specials hit flying enemies: a Harpy takes the
  keg's damage and can be slowed and burned by a special, although no
  tower can tar or burn it. Shields do not reduce specials: a
  Shieldbearer takes the full 80.
- **Slow and burn rules.** The Tar Barrel slows through its own channel
  (`applySpecialSlow`, milestone 25c; see the special slow channel under
  Enemies): capped at 0.3 on the boss, a weaker barrel slow does not
  replace a stronger active barrel slow, and tower slows neither block nor
  shorten it. Fire Arrows go through the normal burn (`applyBurn`, no
  owner): they replace an equal or weaker burn and leave a stronger one;
  the burn ticks in the usual step and is doubled while the enemy is
  tarred (60 damage over 60 ticks instead of 30).
- **Kills.** Enemies the special kills pay their bounty once and are
  removed at once, each with a `kill` event, cause `special` (and
  `bossDown`, cause `special`, for the boss). If that was the last enemy
  of a fully spawned wave, the wave clears on the next tick as usual.
- **Event.** `special {type, x, y, radius, hits}`, then `slowed` for each
  applied slow, then the kills.
- **Headless.** A script action `{type: 'special', special, x, y,
  atWaveTick}` fires when the wave tick counter reaches `atWaveTick`; a
  WaveScript may carry `timed`, per wave, a list of them. Milestone 25c
  adds two timed actions: `{type: 'callEarly', atWaveTick}` (see Waves)
  and `{type: 'clusterSpecial', atWaveTick}`, which fires the best
  unlocked special at the densest cluster in the live state at that tick.
  **Cluster policy:** `densestCluster(state)` takes every live enemy
  (flyers too) as a candidate centre and counts the live enemies within
  70 px (`CLUSTER_RADIUS`, inclusive) of it; the largest count wins, ties
  go to the cluster containing the lowest enemy id, then to the lower
  candidate id; the aim is the centroid of that cluster's positions.
  `bestUnlockedSpecial(wave)` is the first unlocked of Fire Arrows, Tar
  Barrel, Powder Keg (so the keg on waves 1 to 3, the barrel on 4 to 6,
  fire arrows from 7). With no enemy alive nothing fires and the charge
  is kept. The archetypes comboBuild, comboBuildNoFire, noAntiAir,
  bossRush and hardBuild fire one cluster special per wave at
  `CLUSTER_POLICY_TICKS` = 164, 109, 291, 398, 749, 651, 668, 1241, 1194,
  713 (waves 1 to 10), chosen by a scan of comboBuild on Normal: for each
  wave in turn the first tick at which the densest cluster is largest.
  `comboNoSpecials` is the combo plan without them. The informational
  `comboWithKegs` plays the combo build plus one Powder Keg per wave at
  wave tick 600 aimed at (420, 232), the path point 700 px from the spawn
  on the long downhill.

On screen (milestone 25b): row 1 of the HUD has a 100 x 42 Special button
at x 630, left of Start Wave (x 738, 130 wide) and the speed toggle (x 876,
70 wide); the next-wave preview runs from x 356 to 620. The button is lit
with a bright pip while a wave runs and the charge is unspent, greyed with
an empty pip otherwise, and highlighted while its popup is open or a
special is aimed. Pressing it with one special unlocked selects it; with
more it opens a popup above it listing the unlocked specials (locked ones
are not listed). While aiming, a circle of the special's radius (2 px
outline, 0.18 fill; orange-red keg, dark brown tar barrel, orange-yellow
fire arrows) follows the mouse over the map; on touch the first tap places
it where tapped and a drag places it 48 px above the finger with the
finger line. A mouse press on the map (it fires on the press, not the
release), a second tap within 24 px of the placed circle, or
the release of a touch drag with the circle on the map (even with the
finger over the HUD) fires at the circle's centre. Escape, the Special
button again or any other press on the HUD cancels. Aiming and the tower
pick or panel never coexist. Effects in play: the keg flashes and a ring
expands to the radius (0.4 s); the tar barrel leaves a dark splat fading
over 0.5 s; fire arrows drop 8 streaks into the circle, then an orange
flash (0.4 s). In test mode effects are not drawn.

## Waves

A wave is a list of groups. A group spawns `count` enemies of one type,
`interval` seconds apart, starting `delay` seconds after the wave starts.
Groups in a wave run concurrently from the wave start.

| Wave | Groups | Enemies | Total hp | Bounty |
|---|---|---|---|---|
| 1 | 20 Goblin, every 1.2 s | 20 | 380 | 40 |
| 2 | 32 Goblin, every 0.9 s | 32 | 608 | 64 |
| 3 | 22 Goblin every 1.0 s; 12 Wolf every 1.5 s, delay 4.5 s | 34 | 658 | 68 |
| 4 | 10 Harpy every 1.5 s; 30 Goblin every 1.0 s, delay 3 s | 40 | 930 | 90 |
| 5 | 40 Goblin every 1.0 s; 3 Troll every 8 s, delay 10 s; 10 Harpy every 1.2 s, delay 8 s | 53 | 3820 | 134 |
| 6 | 45 Goblin every 1.0 s; 35 Wolf every 1.0 s, delay 9 s; 6 Shieldbearer every 1.5 s, delay 0.5 s | 86 | 1975 | 190 |
| 7 | 26 Wolf every 1.5 s; 13 Troll every 4.5 s, delay 1 s; 16 Harpy every 1.0 s, delay 8 s | 55 | 12796 | 204 |
| 8 | 50 Goblin every 1.5 s; 25 Wolf every 1.5 s, delay 6.75 s; 13 Troll every 5 s, delay 3 s; 6 Shieldbearer every 6 s, delay 4 s; 14 Harpy every 1.2 s, delay 10 s | 108 | 14074 | 326 |
| 9 | 30 Wolf every 1.0 s; 10 Troll every 2 s, delay 2 s | 40 | 9600 | 140 |
| 10 | 20 Wolf every 1.5 s, delay 4 s; 15 Troll every 4.5 s; 12 Harpy every 1.5 s, delay 6 s; 8 Shieldbearer every 5 s, delay 2.5 s; 1 Grumblefoot (boss), delay 65 s | 56 | 18892 | 386 |

Total hp and bounty are on Normal, without the 25 clear bonus. Milestone
22 added the Harpy and Shieldbearer groups; milestone 23 the boss as wave
10's last group. Milestone 25c (horde retune) changed every group: 524
enemies over the ten waves (217 before), every wave with more enemies and
more bounty than before (DEVLOG has the before and after table), wave 4
sending its Harpies first, then Goblins.

**Wave rules** (milestone 25c second pass, pinned in `waves.test.ts` and
`balance.test.ts`):

- **Spawn rate (A1).** In any 3 s (180 ticks) of any wave at most 6
  walkers and at most 4 flyers spawn.
- **Length (A2).** comboBuild on Normal, with no early calls, clears every
  wave at least 15% later than before milestone 25c (before, in ticks:
  951, 1447, 1162, 1321, 3101, 1705, 4199, 3788, 1992, 4640), and the ten
  waves take 540 to 800 s of wave time (614 s; 405 s before).
- **Density (A3).** comboBuild on Normal never has more than 35 enemies
  alive at once (22 at most).
- **Counts (A4)** stay between 2 and 3 times the 217 before 25c, with
  every wave above its old count and bounty; **spawn window (A5)**: every
  wave's last spawn within 90 s (wave 8 the longest, 73.5 s), the boss 2 s
  after wave 10's last other spawn.

Wave flow: the player presses Start Wave. The wave is active until every
enemy in it has spawned and none remain alive. Then the clear bonus is paid
and the next wave can be started. Start Wave is unavailable while a wave is
active, except to call the next wave early. The next-wave preview lists
each group's type and count.

**Call early** (milestone 25c, `callNextWave(state)` in `game.ts`). While a
wave runs and every one of its enemies has spawned, the next wave can be
called at once. Refused, in this order, with `game-over`, `not-in-wave`
(setup), `last-wave` (the current wave is the last, or the next wave holds
the boss: wave 9 cannot call wave 10; never in an endless game, which
has no last wave and no boss, milestone 26) and `still-spawning`; a refusal
changes nothing. A call clears the current wave at once: it pays the 25
clear bonus (event `waveClear`) plus the early bonus, `min(20,
ceil(secondsRemaining))` with `secondsRemaining = max(0, 20 - seconds
since the wave's last spawn)`. The last spawn happens during the tick with
waveTick = `lastSpawnTick(wave)`; right after it 0 s have passed (bonus
20), and each later tick adds 1/60 s, so the bonus is 19 from 60 ticks
later and 0 from 1200 ticks later (a call is still allowed at 0). Enemies
still alive stay on the field: they move, exit, cost lives and pay
bounties as usual, and the called wave's clear check waits for them too
(a wave clears only when all its own enemies have spawned and no enemy at
all is alive; verifier correction, the first text said no clear check
waits for them). Then the next
wave starts its spawn schedule from waveTick 0 (the wave counter goes up),
the special charge is set to 1 (an unused one does not carry over), event
`earlyCall {wave, bonus}` (the new wave) and then `waveStart`. Towers are
locked already mid-wave, so nothing new locks. Each wave pays its clear
bonus once: an early-called wave when it is called, the others at their
clear. On screen, Start Wave reads "Call next  +14" (names.ts
`callEarlyLabel`, 14 px so it fits the 130 px button) with the current
bonus while a call would succeed, and pressing it calls; otherwise it
reads "Start Wave" as before. `ui().callEarly` reports `{available,
bonus}`.

Players can build, upgrade and sell at any time, including mid-wave.
Moving a tower and undoing an upgrade are setup-only (Planning phase).

## Endless mode

Milestone 26, from `docs/SCOPE-v4.md` ("Endless mode and high score").

- **Keep going.** The win screen (wave 10 cleared, boss dead or gone) has
  three buttons: [Keep going] (the primary: highlighted, on the left,
  170 x 42), [Play again] (180 x 42) and [Menu] (100 x 42), 16 px apart,
  centred in a 520 x 230 panel (460 before; the lose screen keeps 460 and
  its two buttons). [Keep going] calls `continueEndless(state)`
  (`game.ts`): allowed only in phase `won`, refused with `not-won`
  otherwise (an endless game never reaches `won`, so "already endless" is
  `not-won` too); a refusal changes nothing. It sets `state.endless =
  true` (false from `createGame`) and the phase to `setup` with wave 10
  cleared; gold, lives, towers, kill counts and the special charge (0
  after the clear) are kept. Event `endlessStart`. The end screen goes
  away; the boss is already gone, so there is no boss bar.
- **After that** Start Wave plays wave 11, 12, and so on. Clearing a wave
  pays the 25 bonus and returns to setup; it never sets `won`, so the game
  ends only by losing. The planning phase, one special charge per wave
  (all three specials are unlocked, Fire Arrows included) and call early
  work as before; call early has no `last-wave` refusal in an endless
  game. A game that is not continued is the game before milestone 26:
  `won` on wave 10.
- **Generated waves** (`waveDef(n)` in `waves.ts`; waves 1 to 10 are the
  table). For n >= 11: `k = n - 11`, `cycle = floor(k / 3) + 1`; the
  groups of table wave 8, 9 or 10 for `k % 3` = 0, 1, 2, without the boss;
  plus one Harpy group of `min(16, 8 + 2 x cycle)` Harpies, one every
  0.75 s, starting 2 s after the base wave's last spawn; hp multiplier
  `1.6 ^ cycle`. An enemy spawns with `round(base hp x level multiplier x
  wave multiplier)` (one rounding, half up) and carries it as `maxHp`,
  which the hp bar uses (table-wave enemies have no `maxHp`). Bounties,
  speeds and lives cost do not change. The 90 s spawn-window limit does
  not apply; the longest endless window is 86.75 s (wave 8 based waves
  from cycle 4: 75.5 + 15 x 0.75). The spawn-rate rule (A1) holds on the
  merged schedule (pinned for waves 11 to 40). The Hard hp rule is not
  applied to endless hp. `waveDef` throws for n < 1 (and for a
  non-integer n). The live game has no wave cap (only the headless runs
  stop at 200), and hp leaves the exact-integer range near wave 200: the
  Troll's spawn hp passes `Number.MAX_SAFE_INTEGER` on wave 200 on Normal
  and Hard (cycle 64) and wave 203 on Easy. Accepted: no build gets near
  it.
- **Hp growth 1.6 per cycle, not the scope's 1.15.** At 1.15 the idle
  combo build lived to wave 25 on Normal (target 11 to 16): the combo lost
  no life until the hp passed about 2x. 1.6 (about 1.17 per wave) puts the
  idle build at wave 15 and the greedy one at 18. The Harpy group is the
  scope's: it barely moves the result (DEVLOG milestone 26).
- **Score.** `wavesCleared(state)` (`game.ts`, derived, no state field):
  `state.wave` in `setup` or `won`, else `state.wave - 1`. Every wave
  before the current one has cleared (at its clear or when the next was
  called early), so a call-early clear counts. A win scores 10, a loss on
  wave 7 scores 6.
- **On screen.** The HUD wave counter reads "Wave 11" in an endless game
  (no "/10"; "Wave 10" right after Keep going). The preview lists each
  type once in first-group order with the counts summed, so the extra
  Harpies join the base wave's ("Next: 50 Goblin, 25 Wolf, 13 Troll, 6
  Shieldbearer, 24 Harpy" before wave 14 reads 26 Harpy); the two-line
  and small-font rules fit every endless preview. The lose screen reads
  "Reached wave 15" (no "of 10"). Words in `names.ts`: `END_TEXT.keepGoing`,
  `waveCounterText`, `reachedWaveText`, `bestScoreText`.

| Wave | Cycle | Base | Extra Harpies | Enemies | Hp x | Total hp (Normal) | Bounty | Last spawn |
|---|---|---|---|---|---|---|---|---|
| 11 | 1 | 8 | 10 from 75.5 s | 118 | 1.6 | 23084 | 356 | 82.25 s |
| 12 | 1 | 9 | 10 from 31 s | 50 | 1.6 | 15940 | 170 | 37.75 s |
| 13 | 1 | 10 | 10 from 65 s | 65 | 1.6 | 24412 | 266 | 71.75 s |
| 14 | 2 | 8 | 12 from 75.5 s | 120 | 2.56 | 37143 | 362 | 83.75 s |
| 15 | 2 | 9 | 12 from 31 s | 52 | 2.56 | 25674 | 176 | 39.25 s |
| 16 | 2 | 10 | 12 from 65 s | 67 | 2.56 | 39220 | 272 | 73.25 s |

Endless hp at cycles 1, 2, 3 (Easy / Normal / Hard): Goblin 23/30/36,
36/49/58, 58/78/93; Troll 1080/1440/1728, 1728/2304/2765,
2765/3686/4424; Harpy 43/58/69, 69/92/111, 111/147/177.

**Headless** (informational, `npm run sim` "Endless" table, cap
`ENDLESS_WAVE_CAP` = 200 waves; a run still alive there reports
`capped`). A WaveScript with `endless: true` presses Keep going after the
win and plays on. `endlessIdle`: comboBuild, then no purchases.
`endlessGreedy`: comboBuild, then in each endless setup, while gold
allows, upgrade the un-upgraded tower with the cheapest upgrade (wait if
it is not affordable yet), else build a Longbow on the next free cell of
`TRAIL_CELL_ORDER`, else nothing. Both fire one cluster special per
endless wave at the `CLUSTER_POLICY_TICKS` tick of the table wave it
repeats (1241, 1194, 713). Targets on Normal: idle loses on wave 11 to
16 (15); greedy further than idle, at least wave 14, lost by 40 (18).

## High score

Milestone 26. The best waves cleared per map and difficulty, in
`localStorage` under `tarpit.best`:

    { "v": 1, "best": { "meadow": { "easy": 12, "normal": 10 } } }

keyed by map id, then level, so later maps need no migration; today's
only map id is `meadow`. `src/game/highScore.ts` parses (anything
malformed is ignored part by part: bad JSON, another or no version, a
map entry that is not an object, an unknown level, a score that is not a
whole number of at least 1; unknown keys are skipped), merges (keeps the
larger) and serializes. The store reads and writes inside try/catch and
also keeps the table in memory, so with storage blocked or full the best
lasts for the page session and nothing throws. GameScene sends
`wavesCleared` to the store after every run of ticks and every early call
when it went up, and the store keeps it if it beats the stored best: every
wave clear counts, in a lost or abandoned run and in a game that was never
continued (a loss on wave 7 stores 6, a win 10).
A save writes the whole value back as `{"v":1,"best":...}` built from
what was parsed, so unknown levels, unknown top-level keys and a stored
`v` other than 1 are dropped on the next new best (accepted; pinned in
`highScore.test.ts`).

Title menu: one 18 px line centred at (480, 414), "Best on Normal: 12
waves" ("1 wave" for one) for the selected level, changing with the
selection; no line when that level has no score. Test hooks
(`window.__tarpit`, `?test=1`): `continueEndless()`,
`bestScore(difficulty)`, `ui().bestLine` on the title, `keepGoing` in
`uiRects()` on the win screen, and `runScript('endlessIdle' |
'endlessGreedy', untilWave)` (untilWave may be past 10).

## Tick order

Specials (milestone 25b) and early calls (milestone 25c) act between ticks, like builds. Inside one wave tick: (1) enemies move at `(1 - effectiveSlow)`, then both slow timers count down; (2)
enemies at the exit are removed and cost lives (1 each, 5 for the boss; at 0 lives the game is lost
at once); (3) burns tick and burn deaths pay out; (4) towers fire in cell
order, and each kill is removed before the next tower acts and counts for
the tower (or the burn's owner); (5) due enemies
spawn, and do not move or get shot that tick; (6) the tick counters
advance; (7) if the wave has fully spawned and no enemy is alive, the clear
bonus is paid. A slow or burn set in step 4 first acts on the next tick.
The authoritative comment is at the top of `src/sim/game.ts`.

## Simulation API shape

Plain TypeScript in `src/sim`, no Phaser, no DOM. One `GameState` object,
pure data. Functions take the state and return a new state or a result;
either mutation or immutability is fine as long as it is consistent and
tested. Required operations: create game, tick, start wave, build tower,
upgrade tower, sell tower, move tower and undo upgrade (milestone 25a), use special (milestone 25b), call the next wave early (milestone 25c), continue into endless waves (milestone 26), next-wave preview, and a headless runner that
plays a scripted set of actions for tests and balance work.
