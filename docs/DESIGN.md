# Tarpit: game design spec

> **Frozen as of milestone 28.** This file states every number and rule the
> game uses. Changing any of them needs a `DECISIONS.md` entry (who decided
> and why) and the balance pins updated in the same change
> (`src/sim/balance.suite.ts`, `npm run sim`). Kyle's play notes can reopen
> the spec. `src/sim/designSpec.test.ts` checks the main tables below
> against the code. History (what changed, when, and why) is in `DEVLOG.md`
> and `DECISIONS.md`, not here. Anything not in this file or the scope
> documents is out of scope.

## Space and time

- The canvas is 960 x 580 px. The map uses the top 960 x 480; the HUD uses
  the bottom 100 px in two rows: stats, the next-wave preview and the
  Special, Start Wave and speed buttons, then the build bar.
- Positions are in pixels. Speeds are pixels per second.
- The simulation runs at a fixed 60 ticks per second (`dt = 1/60 s`). It
  has no randomness: a given sequence of actions always produces the same
  state, and tests assert exact values. A time in seconds becomes ticks by
  `round(seconds x 60)`.
- The 2x speed toggle is a renderer concern: it runs two ticks per frame
  instead of one. The simulation does not know about it.

## Maps

Three maps, picked on the title screen. Every map is 960 x 480 px with one
path, a 30 x 15 grid of 32 px cells, a 40 px path strip and the same build
rules. A game is created on a map (`createGame({ map })`, default
`meadow`) and keeps it in `state.map`; movement, targeting, specials,
building and the renderer all read the game's map. `src/sim/map.ts` holds
the `MAPS` registry (`MapId`: `meadow`, `switchback`, `riverbend`).

The path is a polyline of waypoints from the spawn (left edge) to the exit
(right edge); every segment is axis-aligned, and enemies move along it by
distance travelled.

| Map | Waypoints (px) | Length | Buildable |
|---|---|---|---|
| Meadow | (0,240) (160,240) (160,96) (420,96) (420,384) (680,384) (680,192) (960,192) | 1584 | 344 |
| Switchback | (0,96) (560,96) (560,192) (320,192) (320,288) (560,288) (560,384) (960,384) | 1728 | 334 |
| Riverbend | (0,384) (300,384) (300,96) (660,96) (660,384) (960,384) | 1536 | 312 |

Buildable counts are of the 450 cells.

- **Build grid.** A cell `{ col, row }` has its centre at (col x 32 + 16,
  row x 32 + 16) and the integer key `row x 30 + col`. A cell is buildable
  when it is inside the grid, its centre is at least 36 px (inclusive) from
  the path centreline, its 32 px square does not overlap a landmark or
  water (touching edges do not count), and no tower stands on it. Each
  cell holds at most one tower. Building on a cell outside the grid, on the
  path strip, on a landmark or with a non-integer column or row is refused
  with `not-buildable`; on water with `water`; on an occupied cell with
  `cell-occupied`. Towers fire in cellKey order (row by row, left to
  right). On Meadow 346 cells pass the path rule alone.
- **Meadow.** The path runs right, climbs, crosses the top, comes down,
  runs right along the bottom, climbs again and runs out right.
- **Switchback.** Four lanes (y 96, 192, 288, 384) 96 px apart, joined by
  two U-turns (x 560, then x 320) and a step down at x 560 into the last
  lane. One row of cells lies between two lanes and is 48 px from both:
  row 4, columns 10 to 15 (between y 96 and y 192) and row 7, columns 11
  to 17 (between y 192 and y 288). The y 192 lane runs right to left, the
  only leftward segment on any map. Row 10 lies under the y 288 lane, but
  the y 384 lane starts at x 560, so no row 10 cell reaches two lanes.
- **Riverbend.** An arch: the path runs right, climbs, crosses the top,
  comes down and runs out right. The river is the water box x 416..544, y
  160..480 (columns 13 to 16, rows 5 to 14, 40 cells). It runs off the
  bottom edge and never touches the path.
- **Water.** `MapDef.water` is an optional list of boxes. Water blocks
  only building (and moving a tower onto it, refused with `water`); shots,
  ranges, specials and flyers ignore it.
- **Cottage.** Each map has one landmark, its exit cottage, at a fixed
  offset from the exit point: box x = exit x - 52, y = exit y - 61, 36 x
  37. Meadow: x 908, y 131, which removes cells (28,4) and (29,4).
  Switchback and Riverbend (exit (960,384)): x 908, y 323, which removes
  cells (28,10) and (29,10). The spawn cave is drawn on the path's first
  cells and is not a landmark.
- **Drawing.** `draw/map.ts` draws any map from its data: grass, the path,
  water (flat blue filling its box, a 3 px darker bank, top corners
  rounded by 12 px when it runs off the bottom edge, a few pale ripple
  strokes), the cave at the spawn and a cottage in each landmark box. No
  image assets.

## Economy and lives

- Each kill pays the enemy's bounty. Clearing a wave pays a 25 gold bonus.
- Calling the next wave early pays the current wave's 25 clear bonus at
  once plus an early bonus of up to 20 (see Call early).
- An enemy reaching the exit costs its lives cost (1; the boss 5) and is
  removed. Lives at 0 or below: lost, at once.
- Clearing wave 10 with lives above 0 wins. After the win the player may
  keep going into endless waves, where clearing a wave never wins again.
- Starting gold and lives depend on the level (see Difficulty).
- Selling a locked tower returns 70% of the total spent on it (build plus
  upgrade), rounded down with integer arithmetic (`floor(spent x 7 /
  10)`), plus in full any upgrade bought on it during the current setup
  phase. An unlocked tower (built during the current setup phase) is
  removed for everything spent on it. See Planning phase.
- Players can build, upgrade and sell at any time, including mid-wave.
  Moving a tower and undoing an upgrade are setup-only.

## Planning phase

Each tower carries `locked`, `unlockedSpend` (gold spent on it this setup
phase, refundable in full) and `upgradedThisPhase`.

- **Lock.** A tower built during setup is unlocked, with `unlockedSpend` =
  its cost. A tower built during a wave is locked at once (`unlockedSpend`
  0). Start Wave locks every tower and zeroes `unlockedSpend` and
  `upgradedThisPhase`. Unlocked towers show a pale dashed outline round
  their cell until the wave starts.
- **Refund.** Selling an unlocked tower refunds all of `spent`; the panel's
  Sell reads "Remove  +50". Selling a locked tower refunds its
  `unlockedSpend` in full plus 70% of the rest, rounded down, in any phase
  (`towerSellValue`): a Musketeer built earlier for 50 and upgraded this
  setup for 35 sells for 35 + 35 = 70, the same as Undo upgrade then Sell;
  after Start Wave it sells for 70% of 85 = 59. One `sell` event with the
  total; `full` is true only for an unlocked tower.
- **Move.** In setup an unlocked tower can be dragged to any buildable cell
  for free; it keeps its type, upgrade, targeting mode, spend and kills,
  and the towers stay in cellKey order. `moveTower(state, from, to)`
  refuses with `game-over`, `not-in-setup`, `no-tower`, `locked`,
  `not-buildable` (or `water`), `cell-occupied`, checked in that order;
  moving onto its own cell succeeds and changes nothing. Event `move
  {from, to, tower}`.
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
  HUD, and aims at nothing once the aim point is off the map. The mouse
  aims at itself, and at nothing while it is over the HUD. Release on a
  buildable cell builds there; release on another cell, with nothing aimed
  at, or outside the canvas cancels. A mouse move that reports no button
  down also cancels the drag. Either way the pick stays selected, as after
  a bar click. A press and release without a drag is a bar click (toggle
  the pick). Works mid-wave too (the new tower is locked).
- **Drag to move.** In setup, press an unlocked tower and drag past 8 px:
  the tower dims at its origin and a ghost follows (same 48 px lift on
  touch); release on a buildable cell moves it, anywhere else cancels. A
  press without a drag selects the tower. Locked towers do not drag.
- Click and two-tap placement work as well as dragging.

## Difficulty

Picked on the title menu before each game (Normal preselected);
`createGame({ difficulty })` defaults to Normal and records the level in
`state.difficulty`.

| | Easy | Normal | Hard |
|---|---|---|---|
| Enemy hp | 0.75x | 1x | 1.2x |
| Start gold | 150 | 100 | 80 |
| Lives | 35 | 20 | 15 |

An enemy spawns with `round(base hp x multiplier)`, a whole number (half
rounds up), which is also its full hp for the hp bar and the boss bar.
Bounties, speeds, towers, upgrades, specials and waves are the same on
every level; every Normal number in this file is the base number.

| Enemy | Easy | Normal | Hard |
|---|---|---|---|
| Goblin | 17 | 23 | 28 |
| Wolf | 15 | 20 | 24 |
| Troll | 713 | 950 | 1140 |
| Harpy | 27 | 36 | 43 |
| Shieldbearer | 53 | 70 | 84 |
| Grumblefoot (boss) | 3000 | 4000 | 4800 |

**Hard hp rule.** No enemy's Hard hp sits 1 or 2 points above a multiple
of a tower's base damage (Musketeer 12, Longbow and Fire Pot impact 4,
Cannon 25, Mortar 45; the Tar Pit's 3 is left out, since every whole
number is 0, 1 or 2 above a multiple of 3), so no Hard enemy needs one
extra shot by accident. Easy is outside the rule. The Hard Goblin's 28 hp
is 4 over 24, so a Musketeer needs three shots for it on Hard and two on
Easy and Normal: that is on purpose.

**Title menu.** The title and subtitle, a "Difficulty" caption and a row of
three 132 x 42 buttons (Easy, Normal, Hard; the selection highlighted like
the build bar's active pick) at y 244, a band (y 302 to 430) for the map
row (y 302 to 400) and the high-score line (centred on y 422), a 200 x 42
[Play] at y 446, and the prompt "Pick a difficulty and a map, then press
Play". Clicking a level only selects it; Play (or Enter or Space) starts
the game; Left and Right move the level. The map row: a "Map" caption
centred at (480, 312), then three thumbnail buttons at y 326..398, 132 x
72 px and 16 px apart (row centred on x 480), each a 96 x 48 picture of
the map (scale 0.1, from the map data: grass, path, water, a dot for the
cave and one for the cottage) 3 px from the top and the map's name centred
60 px below the top. Meadow is preselected; the pick is highlighted like
the selected level; a click or tap only selects. Up and Down move the map
(Up to the left, Down to the right, stopping at the ends). Both selections
last the page session; Play again keeps them and Menu returns with them
selected. The title reports ready (the `titleReady()` hook, and its
buttons in `uiRects()`) from its first rendered frame, because Phaser makes
the buttons hit-testable only from the scene's next update after
`create()`; specs wait with `e2e/title.ts` `waitForTitle`.

On Easy and Hard the HUD shows the level's name in small muted text under
the wave counter (which moves up 7 px); on Normal there is no tag. The end
screens have [Play again] (same level and map) and a 100 x 42 [Menu]
beside it that returns to the title; the win screen also has [Keep going].

## Enemies

| Type | HP | Speed | Bounty | Lives cost | Notes |
|---|---|---|---|---|---|
| Goblin | 23 | 60 | 2 | 1 | two Musketeer shots on Easy and Normal, three on Hard |
| Wolf | 20 | 120 | 2 | 1 | fast |
| Troll | 950 | 35 | 8 | 1 | tanky |
| Harpy | 36 | 90 | 3 | 1 | flying |
| Shieldbearer | 70 | 45 | 5 | 1 | shield |
| Grumblefoot, the Troll King | 4000 | 25 | 150 | 5 | boss; slows capped at 30% |

- **Flying.** A Harpy flies over the path. Tar Pit, Cannon and Mortar never
  target it, and a Cannon or Mortar splash skips it even when it is inside
  the radius. A Fire Pot targets it and its impact hits (4 damage), but the
  burn does not stick. Musketeer and Longbow hit it normally. Specials hit
  it (it can be slowed and burned by a special). On screen a Harpy flies
  16 px above its path position with a soft ground shadow, above every
  other enemy and the tower labels.
- **Shield.** A Shieldbearer takes half damage from any shot whose base
  damage is 10 or less: base Longbow 4 -> 2, upgraded Longbow 9 -> 4.5,
  Fire Pot impact 4 -> 2, Tar Pit 3 -> 1.5. Shots over 10 (Musketeer 12
  and 22, Cannon, Mortar), burn damage and specials are full. It carries a
  small grey shield mark on its left.
- **Boss.** Grumblefoot, the Troll King, is one unit at the end of wave 10:
  wave 10's last group, 65 s after the wave starts (waveTick 3900), 2 s
  after the last spawn of the other groups (the 15th Troll at 63 s). He
  walks (every tower can target him; splash and burn work on him,
  including the doubled burn under tar) and has no shield. Slows cap at
  30% on him: a stronger slow is applied at 30% for its full duration (so
  he walks 25 x 0.7 = 17.5 px/s while tarred), and the `slowed` event
  carries the applied 0.3. If he exits he costs 5 lives (at 5 or fewer the
  game is lost at once); a kill pays 150. Wave 10 clears only when he is
  dead or gone. The simulation emits `bossSpawn` after his `spawn` event
  and `bossDown` (cause `shot`, `burn`, `special` or `exit`) after his
  `kill` or `exit` event. On screen he is a 2x sprite (100 px frame) above
  the walkers and below shots, hp bars, labels and Harpies, with a wide
  ground shadow; instead of a small hp bar, a HUD boss bar shows while he
  lives: 300 x 14 px centred at the top of the map (y 24), dark trough,
  red fill proportional to his hp, 1 px cream border, "hp / 4000"
  right-aligned inside, and his name in 14 px on a dark pill above its
  left end (y 4 to 22).
- **Slows.** A slow multiplies speed by `(1 - slow)` for its duration.
  Slows in one slot do not stack: the strongest applies, and a new slow of
  equal or greater strength refreshes the duration; a weaker one is
  ignored. An enemy has two slots: the tower slot (`slow`,
  `slowTicksLeft`, set by Tar Pits through `applySlow`) and the special
  slot (`specialSlow`, `specialSlowTicksLeft`, set by the Tar Barrel
  through `applySpecialSlow`). Each slot follows the rule on its own and
  counts down on its own; neither blocks or shortens the other. The enemy
  moves at `(1 - effectiveSlow)`, where `effectiveSlow` is the stronger of
  the two active slots, capped by the boss's 30%. An enemy is "tarred"
  (burns double) while either slot is active (`isTarred`); the renderer's
  tar ring and tint follow the same rule.
- **Hp.** Hp can be fractional (burn, shields); an enemy counts as dead at
  hp <= 1e-9, which absorbs floating point error.

## Towers

Hits are instant in the simulation (the renderer draws the shot). A tower
fires when its cooldown is zero and a target is in range, then its cooldown
resets to `round(60 / fire rate)` ticks (Musketeer 60, Cannon 120, Tar Pit
30, Longbow 24, Mortar 180, Fire Pot 75). Range is measured from the
tower's cell centre to the enemy's position. Splash hits every enemy within
the splash radius of the target (flyers excepted) for full damage.

| Tower | Cost | Range | Min range | Damage | Fire rate | Splash | Slow | Burn |
|---|---|---|---|---|---|---|---|---|
| Musketeer | 50 | 110 | - | 12 | 1 | - | - | - |
| Cannon | 80 | 90 | - | 25 | 0.5 | 40 | - | - |
| Tar Pit | 60 | 90 | - | 3 | 2 | - | 40% for 2 s | - |
| Longbow | 40 | 150 | - | 4 | 2.5 | - | - | - |
| Mortar | 110 | 220 | 70 | 45 | 1/3 | 60 | - | - |
| Fire Pot | 70 | 100 | - | 4 | 0.8 | - | - | 5/s for 3 s |

One upgrade per tower:

| Tower | Upgrade cost | Range | Damage | Splash | Slow | Burn |
|---|---|---|---|---|---|---|
| Musketeer | 35 | 125 | 22 | - | - | - |
| Cannon | 60 | 90 | 40 | 55 | - | - |
| Tar Pit | 50 | 105 | 3 | - | 60% for 2 s | - |
| Longbow | 30 | 170 | 9 | - | - | - |
| Mortar | 80 | 220 | 70 | 70 | - | - |
| Fire Pot | 50 | 100 | 4 | - | - | 8/s for 4 s |

Slow is strength for seconds; burn is damage per second for seconds. Sell
refunds after an upgrade (locked): Musketeer 59, Cannon 98, Tar Pit 77, Longbow 49, Mortar 133, Fire Pot 84.

**Targeting.** A tower first takes the enemies it may shoot: in range,
outside a minimum range (the Mortar only targets enemies whose distance is
in [70, 220], both inclusive; its splash still hits enemies inside the
minimum range), and not flying for Tar Pit, Cannon and Mortar. Among those
it picks by its targeting mode, shown and cycled on the tower panel's
"Target" button (first, last, strongest, first again):

- **First** (the default): furthest along the path. Ties go to the lower
  enemy id.
- **Last**: closest to the spawn. Ties go to the lower enemy id.
- **Strongest**: highest current hp. Ties go to the furthest along the
  path, then the lower enemy id.

Every tower is built in First; the mode is part of the tower, so selling
and rebuilding resets it. Changing the mode is free and allowed in setup
and during a wave. Splash, slow and burn follow the chosen target.

**Burn.** A Fire Pot hit that leaves its target alive sets a burn on it:
5 damage per second for 3 s (180 ticks), or 8/s for 4 s (240 ticks)
upgraded. An impact kill sets no burn. Burns do not stack: a new burn with
dps equal to or greater than the active one replaces it (strength and
duration); a weaker one is ignored. Each tick a burning enemy takes dps /
60 damage, doubled if it is tarred at that moment, then its burn timer
counts down. Burn deaths pay the bounty like any kill.

**Kill counts.** Each tower has `kills`, 0 when built. It goes up by one
for every enemy its shot kills (a splash counts each enemy it kills) and
for every enemy its burn kills: a burn remembers the cell of the tower
that applied it (`burnOwner`; it changes only when a burn is actually
applied) and a burn kill counts for the tower on that cell. Special kills,
including a Fire Arrows burn, count for no tower. Selling a tower clears
its burns' ownership, so a tower rebuilt on the cell starts from 0; moving
and upgrading keep the count. The tower panel (214 x 166) shows it as a
13 px "Kills 43" line above its buttons (`names.ts` `KILLS_TEXT`).

## Special attacks

`src/sim/specials.ts` `SPECIAL_DEFS`.

| Special | Unlock wave | Radius | Damage | Slow | Slow ticks | Burn per s | Burn ticks |
|---|---|---|---|---|---|---|---|
| Powder Keg | 1 | 70 | 80 | - | - | - | - |
| Tar Barrel | 4 | 90 | - | 0.5 | 210 | - | - |
| Fire Arrows | 7 | 80 | - | - | - | 30 | 240 |

- **Charge.** `state.specialCharges` is 0 or 1. Start Wave sets it to 1;
  the wave clear sets it to 0, so an unused charge does not carry over.
  One special per wave. Calling the next wave early also sets it to 1.
- **Use.** `useSpecial(state, type, {x, y})` acts at once, between ticks,
  like a build, on every live enemy whose position is within the radius of
  the aimed point (inclusive: 70 px hits, 70.01 does not). Refused, in this
  order, with `game-over`, `not-in-wave` (setup), `locked` (`state.wave` <
  the unlock wave), `no-charge`, `out-of-bounds` (the point must be inside
  0..960 x 0..480, edges included). A refusal changes nothing.
- **Effects.** Damage ignores shields and hits flyers. The Tar Barrel slows
  through the special slot (capped at 0.3 on the boss; a weaker barrel slow
  does not replace a stronger active barrel slow; tower slows neither block
  nor shorten it). Fire Arrows go through the normal burn (`applyBurn`, no
  owner): they replace an equal or weaker burn and leave a stronger one,
  and the burn is doubled while the enemy is tarred.
- **Kills.** Enemies the special kills pay their bounty once and are
  removed at once, each with a `kill` event, cause `special` (and
  `bossDown`, cause `special`, for the boss). If that was the last enemy
  of a fully spawned wave, the wave clears on the next tick as usual.
- **Event.** `special {type, x, y, radius, hits}`, then `slowed` for each
  applied slow, then the kills.
- **On screen.** Row 1 of the HUD has a 100 x 42 Special button at x 630,
  left of Start Wave (x 738, 130 wide) and the speed toggle (x 876, 70
  wide); the next-wave preview runs from x 356 to 620. The button is lit
  with a bright pip while a wave runs and the charge is unspent, greyed
  with an empty pip otherwise, and highlighted while its popup is open or
  a special is aimed. Pressing it with one special unlocked selects it;
  with more it opens a popup above it listing the unlocked specials. While
  aiming, a circle of the special's radius (2 px outline, 0.18 fill;
  orange-red keg, dark brown tar barrel, orange-yellow fire arrows) follows
  the mouse over the map; on touch the first tap places it where tapped
  and a drag places it 48 px above the finger with the finger line. A
  mouse press on the map (it fires on the press), a second tap within 24
  px of the placed circle, or the release of a touch drag with the circle
  on the map (even with the finger over the HUD) fires at the circle's
  centre. Escape, the Special button again or any other press on the HUD
  cancels. Aiming and the tower pick or panel never coexist. Effects in
  play: the keg flashes and a ring expands to the radius (0.4 s); the tar
  barrel leaves a dark splat fading over 0.5 s; fire arrows drop 8 streaks
  into the circle, then an orange flash (0.4 s). In test mode effects are
  not drawn.

## Waves

A wave is a list of groups. A group spawns `count` enemies of one type,
`interval` seconds apart, starting `delay` seconds after the wave starts;
enemy `i` of a group spawns on waveTick `round((delay + i x interval) x
60)`. Groups in a wave run concurrently from the wave start.

| Wave | Groups | Enemies | Total hp | Bounty | Last spawn |
|---|---|---|---|---|---|
| 1 | 20 Goblin every 2.5 s | 20 | 460 | 40 | 47.5 s |
| 2 | 32 Goblin every 0.9 s | 32 | 736 | 64 | 27.9 s |
| 3 | 22 Goblin every 1 s; 12 Wolf every 1.5 s, delay 4.5 s | 34 | 746 | 68 | 21 s |
| 4 | 10 Harpy every 1.5 s; 30 Goblin every 1 s, delay 3 s | 40 | 1050 | 90 | 32 s |
| 5 | 40 Goblin every 1 s; 3 Troll every 8 s, delay 10 s; 10 Harpy every 1.2 s, delay 8 s | 53 | 4130 | 134 | 39 s |
| 6 | 45 Goblin every 1 s; 35 Wolf every 1 s, delay 9 s; 6 Shieldbearer every 1.5 s, delay 0.5 s | 86 | 2155 | 190 | 44 s |
| 7 | 26 Wolf every 1.5 s; 13 Troll every 4.5 s, delay 1 s; 16 Harpy every 1 s, delay 8 s | 55 | 13446 | 204 | 55 s |
| 8 | 50 Goblin every 1.5 s; 25 Wolf every 1.5 s, delay 6.75 s; 13 Troll every 5 s, delay 3 s; 6 Shieldbearer every 6 s, delay 4 s; 14 Harpy every 1.2 s, delay 10 s | 108 | 14924 | 326 | 73.5 s |
| 9 | 30 Wolf every 1 s; 10 Troll every 2 s, delay 2 s | 40 | 10100 | 140 | 29 s |
| 10 | 20 Wolf every 1.5 s, delay 4 s; 15 Troll every 4.5 s; 12 Harpy every 1.5 s, delay 6 s; 8 Shieldbearer every 5 s, delay 2.5 s; 1 Grumblefoot (boss), delay 65 s | 56 | 19642 | 386 | 65 s |

Total hp and bounty are on Normal, without the 25 clear bonus. The ten
waves hold 524 enemies. Wave 1 is deliberately gentle: one
Goblin every 2.5 s, so a single Musketeer stops all of them on Easy and
Normal (three shots per Goblin on Hard make it a real wave there). Kyle's
play notes decide whether it stays this long.

**Wave rules** (`balance.suite.ts` R1 to R5):

- **R1 spawn rate.** In any 3 s (180 ticks, the window `[t, t + 180)`) of
  any wave at most 6 walkers and at most 4 flyers spawn.
- **R2.** Every wave has at least as many enemies as, and more bounty than,
  this reference table (enemies, bounty): 8 and 32, 12 and 48, 14 and 62,
  14 and 78, 17 and 85, 35 and 169, 24 and 158, 45 and 249, 18 and 108,
  30 and 357.
- **R3.** The ten waves hold 434 to 651 enemies.
- **R4.** Every wave's last spawn is within 90 s; the boss comes 2 s after
  wave 10's last other spawn.
- **R5.** comboBuild on Meadow, Normal, without early calls clears each
  wave no sooner than 1.15 times these reference ticks: 951, 1447, 1162,
  1321, 3101, 1705, 4199, 3788, 1992, 4640; the ten waves take 540 to 800
  s of wave time; at most 35 enemies are alive at once.

**Wave flow.** The player presses Start Wave. The wave is active until
every enemy in it has spawned and none remain alive (old-wave survivors
after an early call included). Then the clear bonus is paid and the next
wave can be started. Start Wave is unavailable while a wave is active,
except to call the next wave early. The next-wave preview lists each type
once in first-group order with its counts summed ("Next: 20 Goblin"); a
preview too long for one 16 px line (264 px) wraps to two 13 px lines, or,
if that takes three lines, to two 11 px lines. The wave 10 preview reads
"Next: 20 Wolf, 15 Troll, 12 Harpy, 8 Shieldbearer + Grumblefoot".

## Call early

`callNextWave(state)` in `game.ts`. While a wave runs and every one of its
enemies has spawned, the next wave can be called at once. Refused, in this
order, with `game-over`, `not-in-wave` (setup), `last-wave` (the current
wave is the last, or the next wave holds the boss: wave 9 cannot call wave
10; never in an endless game) and `still-spawning`; a refusal changes
nothing. A call clears the current wave at once: it pays the 25 clear bonus
(event `waveClear`) plus the early bonus, `min(20, ceil(secondsRemaining))`
with `secondsRemaining = max(0, 20 - seconds since the wave's last
spawn)`. The last spawn happens during the tick with waveTick =
`lastSpawnTick(wave)`; right after it 0 s have passed (bonus 20), and each
later tick adds 1/60 s, so the bonus is 19 from 60 ticks later and 0 from
1200 ticks later (a call is still allowed at 0). Enemies still alive stay
on the field: they move, exit, cost lives and pay bounties as usual, and
the called wave's clear check waits for them too. The next wave starts its
spawn schedule from waveTick 0 (the wave counter goes up), the special
charge is set to 1, event `earlyCall {wave, bonus}` (the new wave) and then
`waveStart`. Each wave pays its clear bonus once. On screen, Start Wave
reads "Call next  +14" (`names.ts` `callEarlyLabel`, 14 px) with the
current bonus while a call would succeed, and pressing it calls; otherwise
it reads "Start Wave". `ui().callEarly` reports `{available, bonus}`.

## Endless mode

- **Keep going.** The win screen (wave 10 cleared) has three buttons:
  [Keep going] (the primary: highlighted, on the left, 170 x 42), [Play
  again] (180 x 42) and [Menu] (100 x 42), 16 px apart, centred in a 520 x
  230 panel (the lose screen has a 460 px panel and two buttons). [Keep
  going] calls `continueEndless(state)`: allowed only in phase `won`,
  refused with `not-won` otherwise; a refusal changes nothing. It sets
  `state.endless = true` and the phase to `setup` with wave 10 cleared;
  gold, lives, towers, kill counts and the special charge (0) are kept.
  Event `endlessStart`.
- **After that** Start Wave plays wave 11, 12, and so on. Clearing a wave
  pays the 25 bonus and returns to setup; it never sets `won`, so the game
  ends only by losing. The planning phase, one special charge per wave
  (all three unlocked) and call early work as before, with no `last-wave`
  refusal.
- **Generated waves** (`waveDef(n)` in `waves.ts`; waves 1 to 10 are the
  table). For n >= 11: `k = n - 11`, `cycle = floor(k / 3) + 1`; the
  groups of table wave 8, 9 or 10 for `k % 3` = 0, 1, 2, without the boss;
  plus one Harpy group of `min(16, 8 + 2 x cycle)` Harpies, one every 0.75
  s, starting 2 s after the base wave's last spawn; hp multiplier `1.6 ^
  cycle` (`ENDLESS_HP_GROWTH`). An enemy spawns with `round(base hp x level
  multiplier x wave multiplier)` (one rounding, half up) and carries it as
  `maxHp`, which the hp bar uses. Bounties, speeds and lives costs do not
  change. The 90 s spawn-window rule (R4) does not apply; the spawn-rate
  rule (R1) does. The Hard hp rule does not apply. `waveDef` throws for n
  < 1 and for a non-integer n. The live game has no wave cap (headless runs
  stop at 200, `ENDLESS_WAVE_CAP`); hp leaves the exact-integer range near
  wave 200, which no build reaches.
- **Score.** `wavesCleared(state)` (`game.ts`, derived, no state field):
  `state.wave` in `setup` or `won`, else `state.wave - 1`. A win scores 10,
  a loss on wave 7 scores 6.
- **On screen.** The HUD wave counter reads "Wave 11" in an endless game
  (no "/10"; "Wave 10" right after Keep going). The preview merges repeated
  types ("24 Harpy"). The lose screen reads "Reached wave 15" (no "of
  10"). Words in `names.ts`: `END_TEXT.keepGoing`, `waveCounterText`,
  `reachedWaveText`, `bestScoreText`.

| Wave | Cycle | Base | Extra Harpies | Enemies | Hp x | Total hp (Normal) | Bounty | Last spawn |
|---|---|---|---|---|---|---|---|---|
| 11 | 1 | 8 | 10 from 75.5 s | 118 | 1.6 | 24474 | 356 | 82.25 s |
| 12 | 1 | 9 | 10 from 31 s | 50 | 1.6 | 16740 | 170 | 37.75 s |
| 13 | 1 | 10 | 10 from 65 s | 65 | 1.6 | 25612 | 266 | 71.75 s |
| 14 | 2 | 8 | 12 from 75.5 s | 120 | 2.56 | 39307 | 362 | 83.75 s |
| 15 | 2 | 9 | 12 from 31 s | 52 | 2.56 | 26954 | 176 | 39.25 s |
| 16 | 2 | 10 | 12 from 65 s | 67 | 2.56 | 41140 | 272 | 73.25 s |

Endless hp at cycles 1, 2, 3 (Easy / Normal / Hard): Goblin 28/37/44, 44/59/71, 71/94/113; Troll 1140/1520/1824, 1824/2432/2918, 2918/3891/4669; Harpy 43/58/69, 69/92/111, 111/147/177.

## High score

The best waves cleared per map and difficulty, in `localStorage` under
`tarpit.best`:

    { "v": 1, "best": { "meadow": { "easy": 12, "normal": 10 } } }

keyed by map id, then level. `src/game/highScore.ts` parses (anything
malformed is ignored part by part: bad JSON, another or no version, a map
entry that is not an object, an unknown level, a score that is not a whole
number of at least 1; unknown keys are skipped), merges (keeps the larger)
and serializes. The store reads and writes inside try/catch and also keeps
the table in memory, so with storage blocked or full the best lasts for the
page session and nothing throws. GameScene sends `wavesCleared` to the
store after every run of ticks and every early call when it went up, and
the store keeps it if it beats the stored best: every wave clear counts, in
a lost or abandoned run and in a game that was never continued. A save
writes the whole value back as `{"v":1,"best":...}` built from what was
parsed, so unknown levels, unknown top-level keys and a stored `v` other
than 1 are dropped on the next new best.

The title shows one 18 px line centred at (480, 422), midway between the
map row's bottom (y 398) and Play's top (y 446): "Best on Riverbend,
Normal: 12 waves" ("1 wave" for one) for the selected map and level,
changing with either selection; no line when that pair has no score.

## Tick order

Builds, upgrades, sells, moves, specials and early calls act between
ticks. Inside one wave tick: (1) enemies move at `(1 - effectiveSlow)`,
then both slow timers count down; (2) enemies at the exit are removed and
cost their lives (at 0 lives the game is lost at once and nothing else
happens that tick); (3) burns tick and burn deaths pay out; (4) towers fire
in cell order, each counting its cooldown down by 1 first, and each kill is
removed before the next tower acts and counts for the tower (or the burn's
owner); (5) due enemies spawn at distance 0, and do not move or get shot
that tick; (6) the tick counters advance; (7) if the wave has fully
spawned and no enemy is alive, the clear bonus is paid and the game goes to
`setup` (or `won` after wave 10 in a game that is not endless). A slow or
burn set in step 4 first acts on the next tick. Towers act only during
wave ticks. The authoritative comment is at the top of `src/sim/game.ts`.

## Simulation API shape

Plain TypeScript in `src/sim`, no Phaser, no DOM. One `GameState` object,
pure data, changed in place. Operations: create game, tick, start wave,
build tower, upgrade tower, sell tower, move tower, undo upgrade, set
targeting, use special, call the next wave early, continue into endless
waves, next-wave preview, and a headless runner (`headless.ts`) that plays
a scripted set of actions for tests and balance work.

Test hooks (`window.__tarpit`, `?test=1`) include `startGame(difficulty?,
map?)`, `runScript(name, untilWave?)` (an archetype recorded on the running
game's level and map), `continueEndless()`, `bestScore(difficulty, map?)`,
`ui()`, `uiRects()`, `titleReady()`, `step(n)`, `state()`, `events()` and
`hudText()`. `spawnHorde` works only with `?test=1` or `?perf=1`; without
them `window.__tarpit` keeps five read-only hooks.

## Archetypes

The archetypes (`src/sim/headless.ts`) are scripted players. Each records
its script by playing on a level and map and returns a `WaveScript`
(per wave: setup actions; `timed`: actions at wave ticks; `mapId`;
`endless`), so `playScripted` and the browser's `runScript` replay it.

- **noTowers**: builds nothing.
- **oneMusket**: one base Musketeer on the first cell of the map's trail
  order before wave 1, nothing else. It measures wave 1 for a first-time
  player.
- **lazyBuild**: before each wave, base Musketeers while affordable, on the
  trail order. **greedyMusket**: the same, upgrading each Musketeer before
  buying the next. **longbowSpam**: base Longbows on the trail order.
  The trail order walks the path in 96 px steps from 96 px and takes, at
  each step, the nearest free buildable cell within 72 px.
- **comboBuild**: the map's combo plan (31 actions: Longbows, a Tar Pit
  and Fire Pot pair, an anti-air Longbow, Mortars, upgrades, later
  Longbows, a second pair, a Cannon), each action bought as soon as gold
  allows, plus the stored special list for that plan, level and map.
  **comboBuildNoFire**: its script without the Fire Pot cells.
  **comboNoSpecials**: the plan with no specials. **noAntiAir**: the combo
  script that sells its Musketeers and Longbows before wave 4 and builds
  none after.
- **hardBuild**: the map's Hard plan, the combo plan's cells bought in the
  Hard order (the opening and anti-air Longbows and their upgrades first,
  then three upgraded Longbow pairs with the first Tar Pit, then the first
  Fire Pot and the pair's upgrades, then the rest), plus its stored
  special list.
- **endlessIdle**: comboBuild, then Keep going and no more purchases.
  **endlessGreedy**: the same, then each endless setup upgrades the
  un-upgraded tower with the cheapest upgrade, or builds a Longbow on the
  trail order. Endless waves 11 on fire one cluster special at the tick of
  the table wave they repeat (`CLUSTER_POLICY_TICKS_BY_MAP`; on Meadow
  1241, 1754 and 713).
- Meadow only (they throw for another map): **soundBuild** (Musketeers, Cannons and a Tar Pit),
  **soundBuildNoTar** (its Tar Pit cells removed), **comboStrongest**
  (every tower set to Strongest).
- **Cluster special** (`clusterSpecial` timed action): fire the first
  unlocked of Fire Arrows, Tar Barrel, Powder Keg at the centroid of the
  densest cluster of live enemies within 70 px of a live enemy.

**Special lists.** `npm run sim:specials` (`specialSearch.ts`) searches,
for each plan (combo, hard), level and map, a wave-by-wave greedy list
and writes it to `specialLists.ts`. For each wave in order, the earlier
waves fixed, it plays the wave with no special and with every candidate:
each unlocked special at every 60th wave tick of the wave (1 s), aimed at
the centre of each cell whose centre is within 16 px of the path (76 cells
on Meadow, 100 on Switchback, 76 on Riverbend), candidates that hit the
same enemies counted once and candidates that hit nothing skipped. The
best outcome for that wave wins: fewest lives lost, then most kills by the
wave's end, then the earliest clear; ties keep "no special", then the
earlier candidate. So a stored special always does strictly better on its
wave than none.

## Balance targets

Asserted by `src/sim/balance.suite.ts` (run per map by
`balance-meadow.test.ts`, `balance-switchback.test.ts`,
`balance-riverbend.test.ts`). Maps may differ in difficulty; every map
sits inside every band.

Normal, every map:

- **T1** noTowers loses by wave 3.
- **T2** lazyBuild loses on wave 6 to 9.
- **T3** longbowSpam loses on wave 7 to 9.
- **T4** comboBuild wins with 5 to 18 lives.
- **T5** comboBuildNoFire is strictly worse than comboBuild (fewer lives,
  or lost).
- **T6** comboNoSpecials is strictly worse than comboBuild and reaches wave
  8.
- **T7** noAntiAir lets at least 75% of wave 4's Harpies exit, survives
  wave 4 and loses on wave 5 to 8.
- **T8** oneMusket lets at most 6 of wave 1's enemies exit.
- **T9** (Meadow) comboBuild has under 200 gold entering wave 10;
  soundBuild loses strictly later than soundBuildNoTar (by tick); the combo
  without the Tar Barrel uses in its special list does strictly worse
  (lives, then kills).

Easy, every map: **E1** lazyBuild wins with at least 8 lives; **E2**
noTowers loses; **E3**
oneMusket lets at most 3 of wave 1's enemies exit.

Hard, every map: **H1** hardBuild wins; **H2** lazyBuild survives wave 1
and loses by wave 5; **H3** comboBuild has at least 5 fewer lives than on
Normal, or loses on wave 8 or later; **H4** the Hard hp rule.

The wave rules R1 to R5 (Waves) hold too.

Two facts behind these results:

- `comboBuildNoFire` and `noAntiAir` are the combo's script with some
  actions removed, and they fire the combo's stored special list, which
  was searched for the full combo, not for them. So T5 and T7 measure
  those builds with specials aimed for another game.
- On Hard the winning results depend on the searched special lists. A
  player who aims worse than a wave-by-wave search does not get them:
  hardBuild on Hard with no specials wins on Meadow with 2 lives (9 with
  its list) and loses on Riverbend on wave 8 (wins with its list), and
  the combo plan with no specials loses on Meadow on wave 3.

## Measured matrix

`npm run sim` ends with this table. "W 13": won with 13 lives; "L 8":
lost on wave 8 (endlessIdle: the endless wave it was lost on).

| Archetype | Meadow easy | Meadow normal | Meadow hard | Switchback easy | Switchback normal | Switchback hard | Riverbend easy | Riverbend normal | Riverbend hard |
|---|---|---|---|---|---|---|---|---|---|
| noTowers | L 2 | L 1 | L 1 | L 2 | L 1 | L 1 | L 2 | L 1 | L 1 |
| oneMusket | L 3 | L 2 | L 2 | L 3 | L 2 | L 2 | L 3 | L 2 | L 2 |
| lazyBuild | W 10 | L 8 | L 2 | W 20 | L 8 | L 2 | W 9 | L 8 | L 2 |
| greedyMusket | W 34 | L 8 | L 2 | W 33 | W 1 | L 2 | W 35 | L 8 | L 2 |
| longbowSpam | W 2 | L 8 | L 7 | W 24 | L 8 | L 8 | W 2 | L 8 | L 7 |
| noAntiAir | L 7 | L 5 | L 4 | L 7 | L 5 | L 4 | L 7 | L 5 | L 4 |
| comboBuild | W 35 | W 14 | L 8 | W 35 | W 18 | W 6 | W 35 | W 16 | L 8 |
| comboBuildNoFire | W 34 | W 4 | L 7 | W 35 | W 13 | L 8 | W 30 | W 5 | L 5 |
| comboNoSpecials | W 34 | W 11 | L 3 | W 35 | W 16 | W 1 | W 34 | W 7 | L 7 |
| hardBuild | W 35 | W 20 | W 9 | W 35 | W 20 | W 13 | W 35 | W 19 | W 5 |
| endlessIdle | L 18 | L 14 | L 8 | L 20 | L 16 | L 14 | L 18 | L 15 | L 8 |
| soundBuild | W 11 | L 7 | L 2 | - | - | - | - | - | - |
| soundBuildNoTar | L 10 | L 7 | L 2 | - | - | - | - | - | - |
| comboStrongest | W 9 | L 7 | L 2 | - | - | - | - | - | - |
