# Tarpit: game design spec

Numbers here are the values tuned in the milestone 6a balance pass and the
milestone 12 balance pass v2 (see DEVLOG.md for before and after, and
`npm run sim` for the evidence).
Anything not in this file or `docs/SCOPE.md` is out of scope.

## Space and time

- Canvas 960 x 580 (v2, milestone 9; v1 was 960 x 540). The map uses the
  top 960 x 480; the HUD uses the bottom 100 px in two rows: stats and the
  wave and speed buttons, then the build bar.
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
- An enemy reaching the exit costs 1 life (the boss: 5) and is removed.
- Lives at 0 or below: lose, immediately.
- Clearing wave 10 with lives above 0: win.
- Sell returns 70% of the total spent on that tower (build plus upgrade),
  rounded down, for a locked tower. An unlocked tower (built during the
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
  Selling a locked tower refunds 70% of `spent`, rounded down, in any
  phase. The `sell` event carries `full`.
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
  placement. On touch the drag aims 48 px above the finger and a thin line
  joins finger and ghost; the mouse aims at itself. Release on a buildable
  cell builds there; release on another cell, over the HUD or outside the
  canvas cancels. Either way the pick stays selected, as after a bar
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
| Enemy hp | 0.75x | 1x | 1.3x |
| Start gold | 150 | 100 | 80 |
| Lives | 25 | 20 | 15 |

An enemy spawns with `round(base hp x multiplier)`, a whole number, which
is also its full hp for the hp bar and the boss bar. Bounties, speeds,
towers, upgrades and waves are the same on every level. Normal is the game
as it was before milestone 25, so every Normal number in this file holds.

| Enemy | Easy | Normal | Hard |
|---|---|---|---|
| Goblin | 23 | 30 | 39 |
| Wolf | 21 | 28 | 36 |
| Troll | 525 | 700 | 910 |
| Harpy | 30 | 40 | 52 |
| Shieldbearer | 90 | 120 | 156 |
| Grumblefoot (boss) | 3000 | 4000 | 5200 |

Title menu: the title and subtitle, a "Difficulty" caption and a row of
three 132 x 42 buttons (Easy, Normal, Hard; the selection highlighted like
the build bar's active pick) at y 244, an empty band (y 302 to 430) kept
for the map row and the high-score line of later milestones, a 200 x 42
[Play] at y 446, and a prompt line. Clicking a level only selects it; Play
(or Enter or Space) starts the game; Left and Right move the selection.
The selection is kept for the page session. On Easy and Hard the HUD shows
the level's name in small muted text under the wave counter (which moves
up 7 px); on Normal there is no tag. The end screens have [Play again]
(same level) and a 100 x 42 [Menu] beside it that returns to the title.

## Enemies

| Type | HP | Speed | Bounty | Notes |
|---|---|---|---|---|
| Goblin | 30 | 60 | 4 | normal |
| Wolf | 28 | 120 | 5 | fast |
| Troll | 700 | 35 | 8 | tanky |
| Harpy | 40 | 90 | 7 | flying (milestone 22) |
| Shieldbearer | 120 | 45 | 9 | shield (milestone 22) |
| Grumblefoot, the Troll King | 4000 | 25 | 150 | boss: 5 lives on exit, slows capped at 30% (milestone 23) |

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
other enemy and the tower labels, never tinted or ringed for tar or burn;
a Shieldbearer carries a small grey shield mark on its left.

**Boss** (milestone 23, from `docs/SCOPE-v4.md`). Grumblefoot, the Troll
King, is one unit at the end of wave 10: wave 10's last group, 26 s after
the wave starts (waveTick 1560), 4 s after the last spawn of the other
groups (the 12th Troll at 22 s). He walks (every tower can target him and
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
"Next: 8 Wolf, 12 Troll, 5 Harpy, 4 Shieldbearer + Grumblefoot"; a preview
too long for one 16 px line (350 px) wraps to two 13 px lines.

A slow effect multiplies speed by `(1 - slow)` for its duration. Slows do not
stack: the strongest slow applies, and a new slow of equal or greater strength
refreshes the duration.

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
dps / 60 damage, doubled if it is slowed by tar at that moment
(`slowTicksLeft > 0`), then its burn timer counts down. So hp can be
fractional; an enemy counts as dead at hp <= 1e-9, which absorbs floating
point error so burn kills land on the tick exact arithmetic gives (a lone
Fire Pot kills a static 30 hp Goblin 216 ticks after its first hit, or 132
under tar). Burn
deaths pay the bounty like any kill.

Range is measured from the tower's cell centre to the enemy's position.

## Waves

A wave is a list of groups. A group spawns `count` enemies of one type,
`interval` seconds apart, starting `delay` seconds after the wave starts.
Groups in a wave run concurrently from the wave start.

| Wave | Groups |
|---|---|
| 1 | 8 Goblin, every 1.0 s |
| 2 | 12 Goblin, every 0.8 s |
| 3 | 8 Goblin every 1.0 s; 6 Wolf every 0.6 s, delay 4 s |
| 4 | 10 Wolf every 0.6 s; 4 Harpy every 1.2 s, delay 2 s |
| 5 | 12 Goblin every 0.7 s; 2 Troll every 3 s, delay 2 s; 3 Harpy every 1.0 s, delay 6 s |
| 6 | 18 Goblin every 0.5 s; 14 Wolf every 0.5 s, delay 5 s; 3 Shieldbearer every 2.0 s, delay 3 s |
| 7 | 10 Wolf every 0.5 s; 10 Troll every 2.5 s, delay 1 s; 4 Harpy every 1.0 s, delay 8 s |
| 8 | 20 Goblin every 0.5 s; 10 Wolf every 0.6 s, delay 6 s; 8 Troll every 3 s, delay 3 s; 3 Shieldbearer every 2.5 s, delay 4 s; 4 Harpy every 1.0 s, delay 10 s |
| 9 | 12 Wolf every 0.5 s; 6 Troll every 2 s |
| 10 | 8 Wolf every 0.5 s, delay 4 s; 12 Troll every 2 s; 5 Harpy every 0.8 s, delay 6 s; 4 Shieldbearer every 2.0 s, delay 2 s; 1 Grumblefoot (boss), delay 26 s |

Milestone 22 added the Harpy and Shieldbearer groups (each wave's last
groups); every older group is unchanged. Milestone 23 added the boss as
wave 10's last group. Wave 9 has none, which keeps the
combo build under 150 gold after wave 9.

Wave flow: the player presses Start Wave. The wave is active until every
enemy in it has spawned and none remain alive. Then the clear bonus is paid
and the next wave can be started. Start Wave is unavailable while a wave is
active. The next-wave preview lists each group's type and count.

Players can build, upgrade and sell at any time, including mid-wave.
Moving a tower and undoing an upgrade are setup-only (Planning phase).

## Tick order

Inside one wave tick: (1) enemies move, then slow timers count down; (2)
enemies at the exit are removed and cost lives (1 each, 5 for the boss; at 0 lives the game is lost
at once); (3) burns tick and burn deaths pay out; (4) towers fire in cell
order, and each kill is removed before the next tower acts; (5) due enemies
spawn, and do not move or get shot that tick; (6) the tick counters
advance; (7) if the wave has fully spawned and no enemy is alive, the clear
bonus is paid. A slow or burn set in step 4 first acts on the next tick.
The authoritative comment is at the top of `src/sim/game.ts`.

## Simulation API shape

Plain TypeScript in `src/sim`, no Phaser, no DOM. One `GameState` object,
pure data. Functions take the state and return a new state or a result;
either mutation or immutability is fine as long as it is consistent and
tested. Required operations: create game, tick, start wave, build tower,
upgrade tower, sell tower, move tower and undo upgrade (milestone 25a), next-wave preview, and a headless runner that
plays a scripted set of actions for tests and balance work.
