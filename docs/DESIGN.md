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
- Speed is a renderer concern: 2x runs two ticks per frame instead of one,
  3x three. A tap on the speed button toggles 1x and 2x; a press held for
  300 ms runs 3x while it is held (the button reads "3x") and its release
  returns to the speed before it without toggling. The fixed-step loop
  caps a frame at 20 ticks, so 3x at 60 fps (3 ticks a frame) never meets
  the cap. The simulation does not know about speed.

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
  slot (`specialSlow`, `specialSlowTicksLeft`, set by the Tar Barrel and
  its zone through `applySpecialSlow`). Each slot follows the rule on its own and
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
| Cannon | 80 | 105 | - | 25 | 0.5 | 40 | - | - |
| Tar Pit | 60 | 90 | - | 3 | 2 | - | 40% for 2 s | - |
| Longbow | 40 | 150 | - | 4 | 2.5 | - | - | - |
| Mortar | 110 | 220 | 70 | 45 | 1/3 | 60 | - | - |
| Fire Pot | 70 | 100 | - | 4 | 0.8 | - | - | 5/s for 3 s |

One upgrade per tower:

| Tower | Upgrade cost | Range | Damage | Splash | Slow | Burn |
|---|---|---|---|---|---|---|
| Musketeer | 35 | 125 | 22 | - | - | - |
| Cannon | 60 | 105 | 40 | 55 | - | - |
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
including a Fire Arrows burn, count for no tower; a kill by a special's
burn has kill cause `special` (the enemy carries `specialBurn`). Selling a tower clears
its burns' ownership, so a tower rebuilt on the cell starts from 0; moving
and upgrading keep the count. The tower panel (214 x 166) shows it as a
13 px "Kills 43" line above its buttons (`names.ts` `KILLS_TEXT`).

## Special attacks

`src/sim/specials.ts` `SPECIAL_DEFS`.

| Special | Unlock wave | Radius | Damage | Slow | Burn per s | Zone ticks |
|---|---|---|---|---|---|---|
| Powder Keg | 1 | 90 | 30 | - | - | - |
| Tar Barrel | 4 | 100 | - | 0.5 | - | 480 |
| Fire Arrows | 7 | 90 | - | - | 20 | 480 |

- **Charge.** One charge shared by the three specials. `state.specialCharges`
  is 0 or 1 and `state.specialRechargeTicks` counts the refill. A wave start
  (Start Wave or an early call) makes it ready at once (1, recharge 0).
  Using a special spends it and starts the recharge: it is ready again
  1200 wave ticks later (20 s, `SPECIAL_RECHARGE_TICKS`), counted in step 6
  of each wave tick. It does not refill in setup: the wave clear sets the
  charge and the recharge to 0.
- **Use.** `useSpecial(state, type, {x, y})` acts at once, between ticks,
  like a build, on every live enemy whose position is within the radius of
  the aimed point (inclusive: 90 px hits, 90.01 does not), flyers included.
  Refused, in this order, with `game-over`, `not-in-wave` (setup), `locked`
  (`state.wave` < the unlock wave), `no-charge`, `out-of-bounds` (the point
  must be inside 0..960 x 0..480, edges included). A refusal changes
  nothing.
- **Powder Keg.** 30 damage to each enemy inside, shields ignored. No zone.
- **Zones.** The Tar Barrel and Fire Arrows act on the enemies inside at
  once and leave a zone at the point (`state.zones`, each with an id, its
  type, point, radius and `ticksLeft`) for 480 ticks (8 s). Every wave
  tick, in step 2b, each zone (oldest first) gives every live enemy inside
  it, flyers included, its effect for 60 ticks (`ZONE_LINGER_TICKS`), then
  counts down; at 0 it is removed. So an enemy is slowed or burning while
  it is inside and for 60 ticks after it leaves. Several zones can exist at
  once; they do not stack (the slow and burn rules below decide). The wave
  clear removes every zone.
- **Effects.** The Tar Barrel slows by 0.5 through the special slot
  (capped at 0.3 on the boss; a weaker special slow does not replace a
  stronger active one; tower slows neither block nor shorten it). Fire
  Arrows burn at 20 per second through the normal burn (`applyBurn`, as a
  special's burn): they replace an equal or weaker burn and leave a
  stronger one, and the burn is doubled while the enemy is tarred, so tar
  and fire on one enemy burn 40 per second.
- **Kills.** Enemies a special kills pay their bounty once and are
  removed, each with a `kill` event, cause `special` (and `bossDown`, cause
  `special`, for the boss); a burn kill from Fire Arrows counts the same.
  If that was the last enemy of a fully spawned wave, the wave clears on
  the next tick as usual.
- **Event.** `special {type, x, y, radius, hits, zoneId?}` (`zoneId` for the
  Tar Barrel and Fire Arrows), then `slowed` for each slow applied on
  landing, then the kills.
- **On screen.** Row 1 of the HUD has a 100 x 42 Special button at x 630,
  left of Start Wave (x 738, 130 wide) and the speed button (x 876, 70
  wide); the next-wave preview runs from x 356 to 620. While a wave runs
  and the charge is ready the button is lit with a bright pip that pulses
  (no pulse in test mode). While the charge refills it is greyed, a dark
  amber fill grows from its left edge under the label as the recharge runs,
  and the label is the countdown in whole seconds ("Wait 12s", in place of
  "Special"). In setup and after the game
  it is greyed with an empty pip. It is highlighted while its popup is open
  or a special is aimed. Pressing it with one special unlocked selects it;
  with more it opens a popup above it listing the unlocked specials.
- **Aiming.** While a special is aimed a banner over the top of the map
  says what to do ("Click the trail to throw the Powder Keg", "Tap the
  trail to drop the Tar Barrel"; a smaller second line says how to cancel
  and, on touch, how to hold), and a circle of the special's radius (3 px
  outline over a pale edge, 0.22 fill, a light cross with a dark outline
  at the centre, drawn above the sprites;
  orange-red keg, dark brown tar barrel, orange-yellow fire arrows) shows
  where it lands. With a mouse the circle follows the pointer over the map
  and a click on the map fires there. On touch a tap on the map fires at
  the tap; a press held 300 ms or moved past the drag threshold is a hold:
  the circle shows 48 px above the finger with the finger line, and the
  release fires at the circle's centre. As for tower drags the lifted point
  decides: the finger may be over the HUD (so a hold reaches the bottom
  rows), and the release cancels only when the lifted point is off the map
  or the finger is on the Special button. There is no second confirming tap. Escape, the Special button
  again or any other press on the HUD cancels; a cancel spends nothing.
  Aiming and the tower pick or panel never coexist.
- **Landing.** The keg: a flash and a ring expanding to the radius
  (0.4 s), a short camera shake (220 ms) and a scorch mark that fades over
  2 s. The Tar Barrel: a splash ring (0.3 s), then a tar puddle drawn from
  its zone for as long as the zone lasts, with a light rim broken into
  uneven arcs and two glints so its edge reads on grass and trail. Fire Arrows: arrows falling into
  the circle (0.4 s), then a burning patch drawn from its zone. Zones fade
  over their last second. A label at the spot for 1.5 s reads "3 hit" (the
  enemies inside when it landed) or "Missed" (`names.ts`). In play effect
  times are real time, the same at any speed; in test mode they count 1/60 s
  per simulation tick, nothing fades or flickers and there is no shake.

## Gold cheat

`grantCheatGold(state)` adds 500 gold (`CHEAT_GOLD`), sets `state.cheated`
and emits `cheat {gold}`; it works in setup and during a wave and is
refused with `game-over` once the game is won or lost. Nothing else in the
simulation reads `cheated`. On screen, five presses on the Gold readout
(the area x 8 to 112 of HUD row 1) within 2 s call it; four, or presses
spread over more than 2 s, do not. A cheated game shows "cheat used" in
small type under the Gold number and saves no best score for the rest of
that game (the stored best stays as it was); Play again starts a clean
game.

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
charge is made ready (1, recharge 0), event `earlyCall {wave, bonus}` (the new wave) and then
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
  gold, lives, towers, kill counts and the special charge (0, not
  refilling) are kept.
  Event `endlessStart`.
- **After that** Start Wave plays wave 11, 12, and so on. Clearing a wave
  pays the 25 bonus and returns to setup; it never sets `won`, so the game
  ends only by losing. The planning phase, the special charge (all three
  unlocked) and call early work as before, with no `last-wave` refusal.
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
a lost or abandoned run and in a game that was never continued, but not
in a game where the gold cheat was used (Gold cheat). A save
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
happens that tick); (2b) each zone, oldest first, slows or burns the live
enemies inside it for 60 ticks, then counts down and is removed at 0;
(3) burns tick and burn deaths pay out; (4) towers fire
in cell order, each counting its cooldown down by 1 first, and each kill is
removed before the next tower acts and counts for the tower (or the burn's
owner); (5) due enemies spawn at distance 0, and do not move or get shot
that tick; (6) the tick counters advance and the special recharge counts
down (at 0 the charge is ready); (7) if the wave has fully
spawned and no enemy is alive, the clear bonus is paid and the game goes to
`setup` (or `won` after wave 10 in a game that is not endless), the
special charge and recharge go to 0 and the zones are removed. A slow or
burn set in step 4 first acts on the next tick; a zone's burn acts in
step 3 of the same tick. Towers act only during wave ticks. Once the game
is won or lost a tick only clears `state.shots`, so the last tracer or
splash is drawn once. The authoritative comment is at the top of `src/sim/game.ts`.

## Effects

Milestone 31. Effects are drawing only: the simulation is instant-hit and
applies damage on the tick a tower fires; no rule, number or outcome
depends on them (`npm run sim` is unchanged). The maths is in
`src/game/fx/fxMath.ts`, the drawing in `src/game/fx/effects.ts`.

- **Projectiles.** Each shot is drawn flying from the muzzle to the point
  the simulation recorded (`shot.to`), even if the target has since died or
  moved. Travel times in game time (so 2x and 3x shorten them): Musketeer
  110 ms (8 px ball with a bright trail, muzzle flash, smoke), Fire Pot
  150 ms (a gout of fire up to 20 px wide), Longbow 220 ms (16 px arrow
  with a pale trail, slight arc), Tar Pit 240 ms (16 px glob, low arc),
  Cannon 260 ms (16 px ball, low arc up to 22 px, flash and smoke), Mortar
  320 ms (20 to 24 px shell, high arc of 40 to 90 px, a clear shadow on
  the ground). The impact (a bright flash, then a bold ring out to the
  splash radius for Cannon and Mortar, with dust and sparks; tar splat;
  fire burst) and the enemy's hit flash and knock (2 px, 1 px for a Troll
  or the boss, gone in 120 ms) are drawn on arrival. An enemy killed by a
  shot in flight keeps walking along the trail at its last speed, walk
  cycle running, until the shot lands; then the death puff (sized to the
  enemy) and the gold label show.
- **Towers.** The barrel, bow or tube turns toward its current target at
  10 rad/s of game time (about 570 degrees a second), never a snap, and
  kicks back 2 to 4 px for 160 ms when it fires. Build, upgrade and sell
  pop (280, 320 and 240 ms of scale bounce with dust; a sparkle for an
  upgrade).
- **Gold and moments.** A kill's bounty floats up as "+N"; kills within
  56 px and 350 ms share one label. Wave start ("Wave 3") and clear
  ("Wave 3 cleared", "+N gold") banners show for 1.5 s above the map's
  middle, under the HUD, take no input, and never stack: a new banner cuts
  the current one to 250 ms and replaces any waiting one. The boss
  arrives with his name, the map darkening to 45% for 1.4 s and a 5 px
  shake for 0.4 s. His death is the biggest effect in the game: three
  rings (80, 120 and 160 px) starting 160 ms apart and lasting 0.9 s
  each, 110 sparks with dust and smoke, a large "+150" that never groups
  with other kills, a 220 ms white flash and an 8 px shake for 0.6 s.
  An enemy getting through flashes the cottage red and the Lives number
  red, shaking it 3 px, for 0.6 s.
- **Shakes** move only the map (boss entrance, boss death, and the Powder
  Keg's 6 px for 0.22 s). While one runs the main camera shows only the
  map rows, its background is grass, and its offset never scrolls down;
  a second, still camera draws the HUD rows. So no shake shows the page
  behind the canvas and the HUD never moves.
- **Caps.** Live projectiles 96, impacts 48, gold labels 10, particles 120
  per emitter; past a cap the oldest is recycled. Slots are allocated once.
- **Reduced motion.** When `prefers-reduced-motion: reduce` matches there
  are no camera shakes (the Powder Keg's included), no darkening or
  full-screen flash and no Lives shake; everything else stays.
- **Test mode.** `?test=1` creates no effects: shots are the old fading
  tracers, barrels snap to each shot, and hits and kills react at once, so
  the screenshot baselines are unchanged.

## Layouts

Milestone 32b. No game rule changes: the simulation, its numbers, the maps
and the best scores are the same in both layouts; only where things are
drawn and where touches land differ.

- **When.** A window taller than it is wide gets the portrait layout; any
  other window (square included) gets the landscape one. Desktop windows
  follow the same rule. The milestone 14 "turn your device" card is gone.
- **Landscape** is the 960 x 580 canvas as before: the map at the top
  (960 x 480), the HUD's two rows under it. Its frames did not move.
- **Portrait** is a 480 x 1194 canvas. From the top: a 76 px status strip
  (gold, lives, wave and level tag in one row, "cheat used" at its right
  end, the next-wave preview on up to two lines under them), the map
  turned a quarter turn clockwise (480 x 960, spawn at the top, cottage at
  the bottom), then the controls: a row of the six tower buttons (75 x 70,
  each the tower's map shape over its cost, because a name at 18 px does
  not fit 75 px) and a row with Special (130 x 70), Start Wave (214 x 70)
  and speed (114 x 70). The tower buttons are 4 px apart and the second row's 6 px; both rows start 5 px from the edge. Portrait text is 18 px or more.
  On a 390 x 763 CSS px phone (standalone, inside the safe areas) the
  canvas fits at 0.639: buttons are 44.7 CSS px, text 11.5 CSS px and a
  map cell 20.5 CSS px. With Safari's bars (390 x 664) the scale is 0.556:
  buttons 38.9, text 10.0 and cells 17.8 CSS px.
- **The transform.** `src/game/layout.ts` owns every world-to-screen and
  screen-to-world conversion. Portrait: screen x = 480 - world y, screen
  y = 76 + world x (world x runs down the screen, world y right to left).
  Landscape is the identity. World-space Graphics (map, zones, towers,
  range circles, ghost, projectiles, impacts) take the transform whole;
  sprites, text, hp bars, particles and banners are placed through it and
  stay upright. Anything with an up (arcs, the ghost's and the aim's lift,
  flyers' lift, shadows, the Fire Pot's flame, the Longbow's post, the
  falling fire arrows, the cottage) uses the top of the screen. The touch
  lift (drag ghost and special aim) is 48 canvas px in landscape, as
  before, and 48 CSS px on screen in portrait (`input.ts` `liftPx`: 75
  canvas px on a 390 x 763 phone); a finger may rest on the controls to
  reach the bottom rows, and a press that starts on the controls still
  cancels aiming. Sprites
  face the way they move on the screen; Wolves and the boss have only side
  frames, so walking down the screen they show their right-facing side.
- **Portrait arrangements.** Tower labels are not drawn (a readable label
  spans two or three cells). The tower panel (220 x 70 buttons, 70 px
  close) opens beside the tower inside the map. The special popup opens
  above the controls. While aiming, the instruction replaces the preview
  in the status strip (the main line, then the hint's sentences that fit
  one line: on touch "Special again cancels." is left out) and nothing is
  drawn over the map. Wave and boss banners stay centred 150 and 200 px
  below the map's top (canvas y 196 to 280 and 246 to 346): under the
  cave's 30 px and far above the cottage at the map's foot. The boss bar
  is a 360 px bar at the map's top. A shake moves the map sideways only
  (the strip is above it and the controls below), with grass at the
  uncovered side. End screens stack their buttons
  (280 x 70). The title stacks the title, the level row (144 x 70), the map
  row (144 x 116), the best line, Play (260 x 80) and the prompt.
- **Switching.** When the window changes shape (`layoutSwitch.ts`) the
  canvas takes the new size and the running scene rebuilds: the title keeps
  its picks; a game keeps its simulation state, its recorded waves cleared
  and its tick accumulator, so no tick is lost or run twice. The switch
  clears the pick, a drag, the panel, the special popup and aiming, and
  returns the speed to 1x; effects in flight start fresh. Requests
  coalesce: a burst of resizes queues one restart, which carries the game
  and is drawn for the window's shape when it runs; a scene drawn for
  another layout than the window's rebuilds on its next frame.

## Install and offline

Milestone 32a. No game rule changes. `public/manifest.webmanifest` (name,
colours `#111418`, icons 192, 512 and a maskable 512, display standalone,
no orientation, no `id`, so the start URL identifies the app) uses relative
`start_url` and `scope` (`./`), so it works under `/` and `/tarpit/`; `index.html` links it and carries the iOS tags
(apple-touch-icon 180, web-app capable, `black-translucent` status bar,
title). The icons are drawn by `scripts/make-icons.ts` (run by hand). The
game's parent box sits inside `env(safe-area-inset-*)`.

The service worker (`src/sw/sw.ts`, rules in `src/sw/rules.ts`) is written
to `<base>sw.js` after each production build by `scripts/sw-build.ts`. The
page registers it after `load`, then calls `update()`, in production builds
only and never under `?test=1` or `?perf=1`. Cache rules:

- One cache per build, `tarpit|<scope path>|<hash>` (for example
  `tarpit|/tarpit/|4a6c930af73c`): the hash covers every built file, so any
  change makes a new cache. Cache Storage and worker registrations are
  shared by the whole origin (other project sites on `github.io`, another
  copy of the game under another path), so the game only ever deletes
  caches with its own scope's prefix and only unregisters the registration
  whose scope is exactly its base. Install fills it with every file of the build
  (past the HTTP cache), then calls `skipWaiting`; activate deletes every
  other cache with this scope's prefix, then calls `clients.claim`.
- The page (navigations, the scope root, `index.html`): network first
  (`no-cache`, so it revalidates). A 2xx answer is served, so a new deploy
  shows on the next open. If the network fails, answers not ok (an outage's
  404 or 5xx), or has not answered after 3 s (`PAGE_TIMEOUT_MS`), the worker
  serves the copy of the page that this worker's build cached at install;
  with no cached copy it waits for the network. A network page is never
  written to the cache.
- `assets/` (content-hashed names): cache first. A miss (for example an old
  tab asking for the previous build's file) goes to the network, and its
  answer is returned as it is; a 2xx answer is kept.
- Other files in scope (manifest, icons): as the page, with their own
  cached copies as the fallback.
- Anything else (not GET, another origin, outside the scope, `sw.js`) is
  not handled. `localStorage` (best scores) is never touched.

Old and new files cannot mix: a cache holds one build, filled at install and
never overwritten by a network page, so a fallback page and its files are
always one build; online, a page names only its own hashed files, and a
hashed name always means the same bytes.

Recovery. A broken worker is repaired by deploying a fixed `sw.js`: the
page checks it past the HTTP cache on every online open, and the new worker
takes over at once. To retire the worker, build with `TARPIT_SW=off`: that
`sw.js` deletes this scope's caches, unregisters itself and reloads open
pages from the network, and the page registers nothing and removes any
worker it finds. A page that cannot load at all still recovers at the
browser's own update check of `sw.js`, within about a day. Deleting `sw.js`
from a deploy does not remove installed workers.

## Simulation API shape

Plain TypeScript in `src/sim`, no Phaser, no DOM. One `GameState` object,
pure data, changed in place. Operations: create game, tick, start wave,
build tower, upgrade tower, sell tower, move tower, undo upgrade, set
targeting, use special, the gold cheat, call the next wave early,
continue into endless waves, next-wave preview, and a headless runner (`headless.ts`) that plays
a scripted set of actions for tests and balance work.

Test hooks (`window.__tarpit`, `?test=1`) include `startGame(difficulty?,
map?)`, `runScript(name, untilWave?)` (an archetype recorded on the running
game's level and map), `continueEndless()`, `bestScore(difficulty, map?)`,
`ui()` (with `ui().special`: the charge, `ready`, `rechargeTicks`, the
special aimed, `aimPoint`, `banner`, `holding`, the landing `labels` and
the `zones`), `uiRects()` (with `gold`, the cheat's tap area),
`titleReady()`, `step(n)`, `state()`, `events()`, `hudText()`,
`setSpeed(1 | 2 | 3)`, `speed()` and `cheatGold()`. `spawnHorde` works only with `?test=1` or `?perf=1`; without
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
  allows, plus the special policy (below).
  **comboBuildNoFire**: its purchases without the Fire Pot cells.
  **comboNoSpecials**: the plan with no specials. **noAntiAir**: the combo
  purchases, selling its Musketeers and Longbows before wave 4 and building
  none after. comboBuildNoFire and noAntiAir are replayed with the policy,
  so their specials are fired for their own game.
- **hardBuild**: the map's Hard plan, the combo plan's cells bought in the
  Hard order (the opening and anti-air Longbows and their upgrades first,
  then three upgraded Longbow pairs with the first Tar Pit, then the first
  Fire Pot and the pair's upgrades, then the rest), plus the special
  policy.
- **endlessIdle**: comboBuild, then Keep going and no more purchases.
  **endlessGreedy**: the same, then each endless setup upgrades the
  un-upgraded tower with the cheapest upgrade, or builds a Longbow on the
  trail order. Both fire the special policy in every wave, endless ones
  included.
- Meadow only (they throw for another map): **soundBuild** (Musketeers, Cannons and a Tar Pit),
  **soundBuildNoTar** (its Tar Pit cells removed), **comboStrongest**
  (every tower set to Strongest).
- **Cluster special** (`clusterSpecial` timed action): fire the first
  unlocked of Fire Arrows, Tar Barrel, Powder Keg at the centroid of the
  densest cluster of live enemies within 70 px of a live enemy.

**The special policy** (`src/sim/specialPolicy.ts`): how every archetype
that fires specials fires them, on every map and level, the way a person
would. It looks every 30 wave ticks while the charge is ready. Candidate
points lie every 30 px along the path; a point works for a special if its
circle catches at least 3 enemies. If a Troll or the boss is in a crowd,
the Tar Barrel and Fire Arrows take turns (Tar Barrel first; before wave 7
the Tar Barrel takes every turn), fired at the working point with a big
one inside. Otherwise, if a point works for the Powder Keg, the keg is
thrown there. Otherwise it waits. The best point catches the most enemies;
ties go to the point nearest the exit. A forbidden special is skipped (target
S2), and in the Tar Barrel and Fire Arrows' turns the other takes its
place. The headless recorder fires each choice and writes it into the
script's timed list (`timed`), so `playScripted` and the browser's
`runScript` replay the same game.

## Balance targets

Asserted by `src/sim/balance.suite.ts` (run per map by
`balance-meadow.test.ts`, `balance-switchback.test.ts`,
`balance-riverbend.test.ts`). Maps may differ in difficulty; every map
sits inside every band.

Normal, every map:

- **T1** noTowers loses by wave 3.
- **T2** lazyBuild loses on wave 6 to 9.
- **T3** longbowSpam loses on wave 7 to 9.
- **T4** comboBuild wins with 5 to 19 lives.
- **T5** comboBuildNoFire is strictly worse than comboBuild (fewer lives,
  or lost).
- **T6** comboBuild has at least 3 more lives than comboNoSpecials, and
  comboNoSpecials wins (a player who never fires a special can still win
  Normal).
- **T7** noAntiAir lets at least 75% of wave 4's Harpies exit, survives
  wave 4 and loses on wave 5 to 8.
- **T8** oneMusket lets at most 6 of wave 1's enemies exit.
- **T9** (Meadow) comboBuild has under 200 gold entering wave 10;
  soundBuild loses strictly later than soundBuildNoTar (by tick).
- **S2** (Meadow) forbidding the special policy any one of the three
  specials makes the combo strictly worse (lives, then kills), checked for
  each of the three.
- **S3** (Meadow) in a full comboBuild game the policy fires at least 15
  specials in the ten waves and at least 80% of them catch 3 or more
  enemies.

Easy, every map: **E1** lazyBuild wins with at least 8 lives; **E2**
noTowers loses; **E3**
oneMusket lets at most 3 of wave 1's enemies exit.

Hard, every map: **H1** hardBuild wins; **H2** lazyBuild survives wave 1
and loses by wave 5; **H3** comboBuild has at least 5 fewer lives than on
Normal, or loses on wave 8 or later; **H4** the Hard hp rule.

The wave rules R1 to R5 (Waves) hold too.

Two facts behind these results:

- `comboBuildNoFire` and `noAntiAir` are the combo's purchases with some
  actions removed, replayed with the special policy, so their specials
  are fired for their own game.
- On Hard the specials matter most: hardBuild wins every map with them
  (Riverbend with 2 lives), and the combo plan with no specials loses on
  Meadow on wave 3.

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
| noAntiAir | L 7 | L 5 | L 5 | L 7 | L 5 | L 4 | L 7 | L 5 | L 5 |
| comboBuild | W 35 | W 16 | L 8 | W 35 | W 19 | W 8 | W 34 | W 16 | L 8 |
| comboBuildNoFire | W 34 | W 11 | L 7 | W 35 | W 17 | W 7 | W 32 | W 8 | L 7 |
| comboNoSpecials | W 34 | W 11 | L 3 | W 35 | W 16 | W 1 | W 34 | W 7 | L 7 |
| hardBuild | W 35 | W 20 | W 10 | W 35 | W 20 | W 14 | W 35 | W 19 | W 2 |
| endlessIdle | L 19 | L 16 | L 8 | L 20 | L 17 | L 14 | L 19 | L 15 | L 8 |
| soundBuild | W 14 | L 7 | L 2 | - | - | - | - | - | - |
| soundBuildNoTar | W 4 | L 7 | L 2 | - | - | - | - | - | - |
| comboStrongest | W 9 | L 7 | L 2 | - | - | - | - | - | - |
