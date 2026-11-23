# Tarpit: game design spec

> **Frozen as of milestone 37.** This file states every number and rule the
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
  Clearing campaign waves 5, 10 and 15 also offers a reward.
- Calling the next wave early pays the current wave's 25 clear bonus at
  once plus an early bonus of up to 20 (see Call early).
- An enemy reaching the exit costs its lives cost (1 for regular enemies,
  5 for Grumblefoot and 6 for Grumblemaw) and is removed. The game ends
  in a loss when lives reach zero or below.
- Clearing wave 20 with lives above 0 wins. After the win the player may
  keep going into endless waves, where clearing a wave never wins again.
- Starting gold and lives depend on the level (see Difficulty).
- Selling a locked tower returns 70% of the total spent on it (build plus
  both upgrades), rounded down with integer arithmetic (`floor(spent x 7 /
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
  Wave: `undoUpgrade(state, cell)` refunds the latest upgrade price, lowers
  the tower by one level and reduces `spent` and `unlockedSpend`; a locked tower
  stays locked. Refused with `game-over`, `not-in-setup`, `no-tower`,
  `nothing-to-undo`. Undo upgrade shows the refund. Buying both upgrades in one setup allows two undos, most recent first. Event `undoUpgrade {cell, tower,
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
| Grumblemaw (boss) | 4200 | 5600 | 6720 |

**Hard hp rule.** No ordinary enemy's Hard hp sits 1 or 2 points above
a multiple
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
| Grumblemaw | 5600 | 38 | 300 | 6 | boss; slows capped at 30% |

- **Flying.** A Harpy flies over the path. Tar Pit, Cannon and Mortar never
  target it, and a Cannon or Mortar splash skips it even when it is inside
  the radius. A Fire Pot targets it and its impact hits (4 damage), but the
  burn does not stick. Musketeer and Longbow hit it normally. Specials hit
  it (it can be slowed and burned by a special). On screen a Harpy flies
  16 px above its path position with a soft ground shadow, above every
  other enemy and the tower labels.
- **Shield.** A Shieldbearer takes half damage from any shot whose effective
  damage is 10 or less: base Longbow 4 -> 2, upgraded Longbow 9 -> 4.5,
  Fire Pot impact 4 -> 2, Tar Pit 3 -> 1.5. Shots over 10 (Musketeer 12
  and 22, Cannon, Mortar), burn damage and specials are full. It carries a
  small grey shield mark on its left. Keen Arrows raises an upgraded
  Longbow shot to 11.25, so it bypasses the shield.
- **Bosses.** Grumblefoot, the Troll King, is the last spawn of wave 10
  at 65 s (waveTick 3900), 2 s after the last Troll. Grumblemaw is the last
  scheduled spawn of wave 20. Both walk without a shield. Every tower can
  target them. Splash, burn and tar apply, with slows capped at 30% for
  the effect's full duration. At the cap Grumblefoot walks at 17.5 px/s and Grumblemaw at 26.6 px/s,
  and `slowed` carries the applied 0.3. The wave clears after they and all remaining
  enemies are defeated or exit. `bossSpawn` follows `spawn`, and
  `bossDown` (cause `shot`, `burn`, `special` or `exit`) follows `kill` or
  `exit`. Both boss events carry `enemyType` and `enemyId`. A boss has a
  wide ground shadow and a named HUD bar showing current and maximum hp.
  Grumblefoot uses a 2x sprite (100 px frame), above walkers and below
  shots, hp bars, labels and Harpies. Grumblemaw uses the same sheet at
  3x (150 px frame), lifted 45 px, with a drawn gold crown.
- **Grumblemaw's pack calls.** Crossing two thirds or one third of full
  hp emits `packCall` with the crossed threshold (numerator 2 or 1 over
  3) and schedules 8 Wolves from the cave. The first Wolf spawns in
  the next spawn step and the rest every 30 ticks. Both packs can spawn
  concurrently. A hit that crosses both thresholds triggers both calls if
  Grumblemaw survives it. Lethal damage starts no new pack; previously
  called Wolves still arrive. The wave waits for all scheduled Wolves and
  surviving enemies.
- **Slows.** A slow multiplies speed by `(1 - slow)` for its duration.
  Slows in one slot do not stack: the strongest applies, and a new slow of
  equal or greater strength refreshes the duration; a weaker one is
  ignored. An enemy has two slots: the tower slot (`slow`,
  `slowTicksLeft`, set by Tar Pits through `applySlow`) and the special
  slot (`specialSlow`, `specialSlowTicksLeft`, set by the Tar Barrel and
  its zone through `applySpecialSlow`). Each slot follows the rule on its own and
  counts down on its own; neither blocks or shortens the other. The enemy
  moves at `(1 - effectiveSlow)`, where `effectiveSlow` is the stronger of
  the two active slots, capped at 30% for either boss. An enemy is "tarred"
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
the splash radius of the target (flyers excepted) for full damage. The
base tables precede reward modifiers. Veteran Crews multiplies fire rate
before the cooldown is rounded.

| Tower | Cost | Range | Min range | Damage | Fire rate | Splash | Slow | Burn |
|---|---|---|---|---|---|---|---|---|
| Musketeer | 50 | 110 | - | 12 | 1 | - | - | - |
| Cannon | 80 | 105 | - | 25 | 0.5 | 40 | - | - |
| Tar Pit | 60 | 90 | - | 3 | 2 | - | 40% for 2 s | - |
| Longbow | 40 | 150 | - | 4 | 2.5 | - | - | - |
| Mortar | 110 | 220 | 70 | 45 | 1/3 | 60 | - | - |
| Fire Pot | 70 | 100 | - | 4 | 0.8 | - | - | 5/s for 3 s |

The first upgrade takes a tower from level 1 to level 2:

| Tower | Upgrade cost | Range | Damage | Splash | Slow | Burn |
|---|---|---|---|---|---|---|
| Musketeer | 35 | 125 | 22 | - | - | - |
| Cannon | 60 | 105 | 40 | 55 | - | - |
| Tar Pit | 50 | 105 | 3 | - | 60% for 2 s | - |
| Longbow | 30 | 170 | 9 | - | - | - |
| Mortar | 80 | 220 | 70 | 70 | - | - |
| Fire Pot | 50 | 100 | 4 | - | - | 8/s for 4 s |

A newly built tower is level 1. The first upgrade takes it to level 2.
At level 2 one click or tap buys path A or B for the same price. Its
full level-3 row replaces the previous stats before rewards apply.
The Mortar keeps its 70 px minimum range on either path. A level-3 tower
cannot buy another upgrade. A path request requires a level-2 tower, a
valid path, enough gold and a game still in progress. A refused purchase
leaves the tower, gold and events unchanged. The upgrade event records
the level and, for level 3, the chosen path.

| Tower | Path | Name | Cost | Range | Min range | Damage | Fire rate | Splash | Slow | Burn |
|---|---|---|---|---|---|---|---|---|---|---|
| Musketeer | A | Sharpshooter | 85 | 155 | - | 35 | 1 | - | - | - |
| Musketeer | B | Volley | 85 | 125 | - | 22 | 2 | - | - | - |
| Cannon | A | Heavy Shot | 140 | 105 | - | 40 | 0.5 | 85 | - | - |
| Cannon | B | Quick Loader | 140 | 105 | - | 40 | 1 | 55 | - | - |
| Tar Pit | A | Deep Tar | 110 | 105 | - | 3 | 2 | - | 80% for 2 s | - |
| Tar Pit | B | Wide Tar | 110 | 155 | - | 3 | 2 | - | 60% for 2 s | - |
| Longbow | A | War Bow | 70 | 170 | - | 16 | 2.5 | - | - | - |
| Longbow | B | Quick Draw | 70 | 170 | - | 9 | 4.5 | - | - | - |
| Mortar | A | Siege Shell | 190 | 220 | 70 | 120 | 1/3 | 70 | - | - |
| Mortar | B | Wide Burst | 190 | 220 | 70 | 70 | 1/3 | 140 | - | - |
| Fire Pot | A | Inferno | 120 | 100 | - | 4 | 0.8 | - | - | 15/s for 4 s |
| Fire Pot | B | Lasting Flames | 120 | 100 | - | 4 | 0.8 | - | - | 8/s for 8 s |

The slow column gives strength and duration. The burn column gives damage
per second and duration. A locked level-2 Musketeer, Cannon, Tar Pit,
Longbow, Mortar and Fire Pot sell for 59, 98, 77, 49, 133 and 84 gold.
At level 3 their locked refunds are 119, 196, 154, 98, 266 and 168 gold.

The level-2 panel offers two cards. Each shows the path name, its price
and the change from the level-2 stats. Both show "Not enough gold" when
the tower's owner cannot afford the upgrade. At level 3 the heading shows
the path name. Undo appears alongside the cards or the final path while
the latest purchase is refundable. Target and Sell share a row at levels
2 and 3. The panel stays inside the map and clears the selected tower.
Touch targets on the portrait phone measure at least 44 CSS px on both axes.

The first upgrade adds a gold ring. A level-3 tower keeps the ring and
has a dark-backed badge 10 map px right and 10 px above its centre.
A gold diamond marks path A and two cyan dots mark path B in landscape,
portrait, test mode and the move preview.


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
and upgrading keep the count. The tower panel shows it as a
13 px "Kills 43" line above its buttons (`names.ts` `KILLS_TEXT`).

## Boons

Clearing waves 5, 10 and 15 offers three fixed rewards in order. The
player picks one with `pickBoon(state, id)` before starting the next
wave. The pending offer is `state.pendingBoon` with the cleared wave and
its options. The chosen reward is stored in `state.boons` and lasts for the
run, including endless. Tower rewards apply to existing and new towers.
War Chest grants its gold on pick, and Stone Walls grants its lives on
pick. A pick is refused with `no-boon-pending` when no offer is pending
and `boon-not-offered` when the id is outside the offer. Start Wave is
refused with `boon-pending` until the player chooses. The simulation
emits `boonOffered` with the cleared wave and options. Picking clears the
offer and emits `boonPicked` with the wave and selected id.

Each reward card shows its name, a drawn icon and a short sentence using the
value in the table below. The cream effect text is 18 px in landscape and
22 px in portrait and can wrap to two lines. The three cards sit in a row
in landscape (296 x 168 px, 14 px gap) and a column in portrait
(448 x 112 px, 12 px gap). Sticky Tar shows a boot pulling strands from a
tar puddle. Quick Hands shows a clock with motion lines.

Click or tap a card, or press 1, 2 or 3. While the offer is open, the map
ignores placement and selection and Start Wave reads “Pick a reward”.
After a pick, a banner shows the reward name and “Reward picked”. The map
ignores new presses for 300 ms of real time so a second tap cannot select
a tower underneath the card. HUD buttons remain usable.

Held rewards appear in pick order. Each icon has its own hit area of at
least 44 x 44 CSS px. When the landscape canvas fits at full size, the
icons share the build row with the six tower buttons. Once the first
reward is held, those buttons narrow from 140 to 116 px and their labels
from 16 to 14 px. In portrait and smaller landscape windows the icons sit
in a column beside the board. The portrait preview keeps its full 468 px.
Hover or tap an icon to read its name and effect for up to 2.8 s.

The win and loss screens list the names under “Rewards” in 14 px text in
landscape and 18 px in portrait. The portrait list wraps above the buttons.
Turning the device keeps the run, any open offer and all chosen rewards.
Reloading starts a new run.

| Boon | ID | After wave | Value | Effect |
|---|---|---|---|---|
| Long Barrels | longBarrels | 5 | 1.3 | Cannon and Mortar maximum range multiplier |
| Keen Arrows | keenArrows | 5 | 1.25 | Longbow damage multiplier |
| War Chest | warChest | 5 | 100 | Gold gained immediately |
| Sticky Tar | stickyTar | 10 | 2 | Tar Pit and Tar Barrel slow duration multiplier |
| Hot Coals | hotCoals | 10 | 1.8 | Damage multiplier for all burns |
| Quick Hands | quickHands | 10 | 0.62 | Special recharge time multiplier |
| Stone Walls | stoneWalls | 15 | 3 | Lives gained immediately |
| Veteran Crews | veteranCrews | 15 | 1.1 | Tower fire rate multiplier |
| Bigger Blasts | biggerBlasts | 15 | 1.4 | Cannon, Mortar and Powder Keg splash radius multiplier |

## Special attacks

`src/sim/specials.ts` `SPECIAL_DEFS`.

| Special | Unlock wave | Radius | Damage | Slow | Burn per s | Zone ticks |
|---|---|---|---|---|---|---|
| Powder Keg | 1 | 90 | 60 | - | - | - |
| Tar Barrel | 4 | 100 | - | 0.5 | - | 660 |
| Fire Arrows | 7 | 90 | - | - | 26 | 660 |

- **Charge.** One charge shared by the three specials. `state.specialCharges`
  is 0 or 1 and `state.specialRechargeTicks` counts the refill. A wave start
  (Start Wave or an early call) makes it ready at once (1, recharge 0).
  Using a special spends it and starts the recharge: it is ready again
  1200 wave ticks later (20 s, `SPECIAL_RECHARGE_TICKS`). Quick Hands
  lowers this interval to 744 ticks (12.4 s). The counter runs in step 6
  of each wave tick. Wave clear resets the charge and the recharge to 0.
- **Use.** `useSpecial(state, type, {x, y})` acts at once, between ticks,
  like a build, on every live enemy whose position is within the effective
  radius of the aimed point (inclusive), flyers included.
  Refused, in this order, with `game-over`, `not-in-wave` (setup), `locked`
  (`state.wave` < the unlock wave), `no-charge`, `out-of-bounds` (the point
  must be inside 0..960 x 0..480, edges included). A refusal changes nothing.
- **Powder Keg.** 60 damage to each enemy inside, shields ignored. No zone.
- **Zones.** The Tar Barrel and Fire Arrows act on the enemies inside at
  once and leave a zone at the point (`state.zones`, each with an id, its
  type, point, radius and `ticksLeft`) for 660 ticks (11 s). Every wave
  tick, in step 2b, each zone (oldest first) gives every live enemy inside
  it, flyers included, its effect, then counts down and is removed at 0.
  The effect stays for 60 ticks after an enemy leaves
  (`ZONE_LINGER_TICKS`). Sticky Tar extends the slow linger to 120 ticks.
  Several zones can exist at once; they do not stack (the slow and burn rules below decide). The wave
  clear removes every zone.
- **Effects.** The Tar Barrel slows by 0.5 through the special slot
  (capped at 0.3 on either boss; a weaker special slow does not replace a
  stronger active one; tower slows neither block nor shorten it). Fire
  Arrows burn at 26 per second through the normal burn (`applyBurn`, as a
  special's burn): they replace an equal or weaker burn and leave a
  stronger one, and the burn is doubled while the enemy is tarred, so tar
  and fire on one enemy burn 52 per second before rewards.
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

The campaign has two acts. Waves 1 to 10 end with Grumblefoot. Waves 11
to 20 end with Grumblemaw. Clearing wave 20 opens endless play.

A wave is a list of groups. A group spawns `count` enemies of one type,
`interval` seconds apart, starting `delay` seconds after the wave starts;
enemy `i` of a group spawns on waveTick `round((delay + i x interval) x
60)`. Groups in a wave run concurrently from the wave start.

| Wave | Groups | Enemies | Total hp | Bounty | Last spawn |
|---|---|---|---|---|---|
| 1 | 20 Goblin every 2.5 s | 20 | 460 | 40 | 47.5 s |
| 2 | 32 Goblin every 0.9 s | 32 | 736 | 64 | 27.9 s |
| 3 | 22 Goblin every 1 s; 12 Wolf every 1.5 s, delay 4.5 s | 34 | 746 | 68 | 21 s |
| 4 | 10 Harpy every 1 s; 30 Goblin every 1 s, delay 3 s | 40 | 1050 | 90 | 32 s |
| 5 | 40 Goblin every 1 s; 3 Troll every 10 s, delay 10 s; 10 Harpy every 1.2 s, delay 8 s | 53 | 4130 | 134 | 39 s |
| 6 | 45 Goblin every 1 s; 35 Wolf every 1 s, delay 9 s; 6 Shieldbearer every 1.5 s, delay 0.5 s | 86 | 2155 | 190 | 44 s |
| 7 | 26 Wolf every 1.5 s; 13 Troll every 4.4 s, delay 1 s; 16 Harpy every 1 s, delay 8 s | 55 | 13446 | 204 | 53.8 s |
| 8 | 50 Goblin every 1.5 s; 25 Wolf every 1.5 s, delay 6.75 s; 13 Troll every 4.9 s, delay 3 s; 6 Shieldbearer every 6 s, delay 4 s; 14 Harpy every 1.2 s, delay 10 s | 108 | 14924 | 326 | 73.5 s |
| 9 | 30 Wolf every 1 s; 10 Troll every 2 s, delay 2 s | 40 | 10100 | 140 | 29 s |
| 10 | 20 Wolf every 1.5 s, delay 4 s; 15 Troll every 4.5 s; 12 Harpy every 1.5 s, delay 6 s; 8 Shieldbearer every 5 s, delay 2.5 s; 1 Grumblefoot (boss), delay 65 s | 56 | 19642 | 386 | 65 s |
| 11 | 33 Goblin every 0.85 s; 14 Shieldbearer every 1.5 s, delay 5.76 s; 14 Harpy every 1.1 s, delay 11.52 s | 61 | 2243 | 178 | 27.2 s |
| 12 | 35 Wolf every 1.45 s; 11 Troll every 4 s, delay 5.04 s; 14 Harpy every 2.6 s, delay 12.24 s | 60 | 11654 | 200 | 49.3 s |
| 13 | 39 Goblin every 0.95 s; 14 Shieldbearer every 2 s, delay 8.64 s; 16 Harpy every 1.9 s, delay 7.2 s | 69 | 2453 | 196 | 36.1 s |
| 14 | 29 Wolf every 1.85 s; 14 Troll every 3.8 s, delay 3.6 s; 17 Harpy every 2.5 s, delay 11.52 s | 60 | 14492 | 221 | 53 s |
| 15 | 22 Goblin every 1.75 s; 19 Wolf every 1.7 s, delay 22.79 s; 12 Troll every 4.6 s, delay 3.6 s; 16 Harpy every 2.8 s, delay 9.36 s | 69 | 12862 | 226 | 54.2 s |
| 16 | 33 Goblin every 1.7 s; 20 Shieldbearer every 2.95 s, delay 2.88 s; 19 Harpy every 2.75 s, delay 7.2 s | 72 | 2843 | 223 | 58.933 s |
| 17 | 31 Wolf every 1.8 s; 16 Troll every 3.65 s, delay 3.6 s; 20 Harpy every 2.7 s, delay 7.2 s | 67 | 16540 | 250 | 58.5 s |
| 18 | 36 Goblin every 1.7 s; 18 Troll every 3 s, delay 3.6 s; 11 Shieldbearer every 5 s, delay 2.16 s; 19 Harpy every 2.8 s, delay 7.92 s | 84 | 19382 | 328 | 59.5 s |
| 19 | 33 Wolf every 1.85 s; 23 Troll every 2.65 s, delay 2.88 s; 21 Harpy every 2.75 s, delay 6.48 s | 77 | 23266 | 313 | 61.483 s |
| 20 | 20 Wolf every 1.55 s; 15 Shieldbearer every 2 s, delay 4 s; 18 Harpy every 1.65 s, delay 5 s; 12 Troll every 1.7 s, delay 27.5 s; 1 Grumblemaw (boss), delay 48.2 s | 66 | 19098 | 565 | 48.2 s |

Total hp and bounty are on Normal, before pack calls and the 25 clear
bonus. The twenty waves hold 1209 scheduled enemies. Wave 1 sends one
Goblin every 2.5 s, so a single Musketeer stops all of them on Easy and
Normal (three shots per Goblin on Hard make it a real wave there). Kyle's
play notes decide whether it stays this long.

**Wave rules** (`balanceTargets.ts`):

- **R1** In any 3 s (180 ticks, the window `[t, t + 180)`) of a
  campaign wave, at most 6 walkers and 4 flyers spawn on the schedule.
  Each campaign wave's last scheduled spawn is within 90 s. The
  Grumblemaw packs are triggered by damage.
- **R2** Act 2 schedules 1.2 to 2 times as many enemies as act 1.
- **R3** comboBuild on Meadow, Normal, without early calls takes 560 to
  720 seconds in act 2, at most 100 seconds per act-2 wave and at most
  22 minutes for the full campaign. Act 2 peaks at 40 enemies or fewer.
- **R4** The same run clears each act 1 wave no sooner than 1.15 times
  these reference ticks: 951, 1447, 1162, 1321, 3101, 1705, 4199, 3788,
  1992, 4640. Act 1 takes 540 to 800 s of wave time, with at most 35
  enemies alive at once.

**Wave flow.** The player presses Start Wave. The wave is active until
every scheduled enemy and called Wolf has spawned and none remain alive,
including survivors from an early call. Then the clear bonus is paid.
The next wave can start after any reward pick. During a wave, the button
calls the next wave when early calls are allowed. The next-wave preview lists each type
once in first-group order with its counts summed ("Next: 20 Goblin"); a
preview too long for one 16 px line (264 px) wraps to two 13 px lines, or,
if that takes three lines, to two 11 px lines. The wave 10 preview reads
"Next: 20 Wolf, 15 Troll, 12 Harpy, 8 Shieldbearer + Grumblefoot".

## Call early

`callNextWave(state)` in `game.ts`. While a wave runs and every one of its
enemies has spawned, the next wave can be called at once. Refused, in this
order, with `game-over`, `not-in-wave` (setup), `boon-wave` (from or into
campaign wave 5, 10 or 15), `last-wave` (from or into campaign wave 20)
and `still-spawning`. The campaign restrictions do not apply in endless.
A refusal changes nothing. A call clears the current wave at once and
pays the 25 clear bonus (event `waveClear`) plus the early bonus, `min(20, ceil(secondsRemaining))`
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

- **Keep going.** The win screen (wave 20 cleared) has three buttons:
  [Keep going] (the primary: highlighted, on the left, 170 x 42), [Play
  again] (180 x 42) and [Menu] (100 x 42), 16 px apart, centred in a 520 x
  230 panel (the lose screen has a 460 px panel and two buttons). [Keep
  going] calls `continueEndless(state)`: allowed only in phase `won`,
  refused with `not-won` otherwise; a refusal changes nothing. It sets
  `state.endless = true` and the phase to `setup` with wave 20 cleared;
  gold, lives, towers, kill counts, rewards and the special charge (0, not
  refilling) are kept.
  Event `endlessStart`.
- **After that** Start Wave plays wave 21, 22, and so on. Clearing a wave
  pays the 25 bonus and returns to setup; it never sets `won`, so the game
  ends only by losing. The planning phase, the special charge (all three
  unlocked) and call early work as before, with no `last-wave` refusal.
- **Generated waves** (`waveDef(n)` in `waves.ts`; waves 1 to 20 are the
  table). For n >= 21: `k = n - 21`, `cycle = floor(k / 3) + 1`; the
  groups of table wave 18, 19 or 20 for `k % 3` = 0, 1, 2, without the bosses;
  plus one Harpy group of `min(16, 8 + 2 x cycle)` Harpies, one every 0.75
  s, starting 2 s after the base wave's last spawn; hp multiplier `1.8 ^
  cycle` (`ENDLESS_HP_GROWTH`). An enemy spawns with `round(base hp x level
  multiplier x wave multiplier)` (one rounding, half up) and carries it as
  `maxHp`, which the hp bar uses. Bounties, speeds and lives costs do not
  change. The 90 s spawn-window rule (R1) does not apply; the spawn-rate
  rule (R1) does. The Hard hp rule does not apply. `waveDef` throws for n
  < 1 and for a non-integer n. Live play continues while lives remain. Headless runs stop at 200
  (`ENDLESS_WAVE_CAP`).
- **Score.** `wavesCleared(state)` (`game.ts`, derived, no state field):
  `state.wave` in `setup` or `won`, else `state.wave - 1`. A win scores 20,
  a loss on wave 7 scores 6.
- **On screen.** The HUD wave counter reads "Wave 21" in an endless game
  (no "/20"; "Wave 20" right after Keep going). The preview merges repeated
  types ("24 Harpy"). The lose screen reads "Reached wave 25" (no "of
  20"). Words in `names.ts`: `END_TEXT.keepGoing`, `waveCounterText`,
  `reachedWaveText`, `bestScoreText`.

| Wave | Cycle | Base | Extra Harpies | Enemies | Hp x | Total hp (Normal) | Bounty | Last spawn |
|---|---|---|---|---|---|---|---|---|
| 21 | 1 | 18 | 10 from 61.5 s | 94 | 1.8 | 35527 | 358 | 68.25 s |
| 22 | 1 | 19 | 10 from 63.48 s | 87 | 1.8 | 42533 | 343 | 70.233 s |
| 23 | 1 | 20 | 10 from 48.2 s | 75 | 1.8 | 24950 | 295 | 54.95 s |
| 24 | 2 | 18 | 12 from 61.5 s | 96 | 3.24 | 64228 | 364 | 69.75 s |
| 25 | 2 | 19 | 12 from 63.48 s | 89 | 3.24 | 76800 | 349 | 71.733 s |
| 26 | 2 | 20 | 12 from 48.2 s | 77 | 3.24 | 45151 | 301 | 56.45 s |

Endless hp at cycles 1, 2, 3 (Easy / Normal / Hard): Goblin 31/41/50, 56/75/89, 101/134/161; Troll 1283/1710/2052, 2309/3078/3694, 4155/5540/6648; Harpy 49/65/78, 87/117/140, 157/210/252.

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

Builds, upgrades, sells, moves, reward picks, specials and early calls act between
ticks. Inside one wave tick: (1) enemies move at `(1 - effectiveSlow)`,
then both slow timers count down; (2) enemies at the exit are removed and
cost their lives (at 0 lives the game is lost at once and nothing else
happens that tick); (2b) each zone, oldest first, slows or burns the live
enemies inside it for the linger duration, then counts down and is
removed at 0;
(3) burns tick and burn deaths pay out; (4) towers fire
in cell order, each counting its cooldown down by 1 first, and each kill is
removed before the next tower acts and counts for the tower (or the burn's
owner); (5) due enemies, including called Wolves, spawn at distance 0
and first move or take damage on a later tick; (6) the tick counters advance and the special recharge counts
down (at 0 the charge is ready); (7) if all scheduled enemies and called
Wolves have spawned and none are alive, the game pays the clear bonus,
resets the charge and recharge, removes the zones, and goes to `setup`
(or `won` after campaign wave 20). Campaign waves 5, 10 and 15 also
offer a reward. A slow or
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
  the current one to 250 ms and replaces any waiting one. Grumblefoot
  arrives with his name, the map darkening to 45% for 1.4 s and a 5 px
  shake for 0.4 s. His fall has three rings (80, 120 and 160 px) starting 160 ms apart and lasting 0.9 s
  each, 110 sparks with dust and smoke, a large "+150" that never groups
  with other kills, a 220 ms white flash and an 8 px shake for 0.6 s.
  Act II opens on wave 11 with an “Act II” banner above “Wave 11”.
  Grumblemaw uses his own named bar and entrance banner. Each pack call
  shows a banner and three expanding rings at the cave for 1.1 s. His
  entrance and fall shakes are 1.3x as strong as Grumblefoot's, and his
  three fall rings are 1.4x as wide. His burst has up to 120 sparks,
  55 dust and 32 smoke particles, with a separate “+300” bounty.
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
- **Test mode.** `?test=1` skips live effects such as particles and shake.
  Shots are fading tracers, barrels snap to each shot, and hits and kills
  react at once. The reward, Act II, Grumblemaw's entrance and pack-call
  cues are available for frozen browser frames.

## Map decoration

Milestone 34. Drawing only: no rule, number or map data changes, no art
files; `npm run sim` is unchanged. The recipe is in
`src/game/decor/recipe.ts`, the motion in `src/game/decor/motion.ts`, the
drawing in `src/game/decor/livingMap.ts` and `src/game/draw/map.ts`.

- **A fixed recipe per map.** Every choice is a hash of the map id and a
  position or index (no `Math.random`), so a map looks the same on every
  run and device. The pattern is laid out in world space (the 960 x 480
  map), so portrait shows the same place turned with the map; the list
  does not depend on the layout.
- **Ground.** Lighter and darker grass patches with soft edges, about 85
  tufts (73 or 74 still, 12 swaying), 130 to 170 small flowers with a
  small centre in 12 beds of 8 to 12 (cream, yellow, lilac), 12 stones. The trail has a soft darker
  margin, faint colour spots, two faint worn tracks about 8 px either side
  of the centreline in short broken dashes (7 to 22 px) that wander up to
  2 px sideways, and about 75 pebbles; it stays one continuous tan strip.
  The river has a soft damp bank; its old ripple strokes became moving
  ripples.
- **Trees and bushes.** 8 to 14 trees and 8 to 14 bushes per map
  (Meadow 8 and 8, Switchback 12 and 10, Riverbend 13 and 11), one per
  cell, on buildable cells only: the cell centre at least two cells (64
  px) from the trail centreline, at least one cell clear of the river and
  the cottage, and not under the boss bar or the aim banner in either
  layout (the aim banner's box comes from its widest text, `names.ts`
  `aimBannerMaxWidth`, 477 px). They may stand under the wave and boss
  banners, which show for 1.5 s. Trees come in four flat shapes, lit from
  the upper left, each in three sizes: a round canopy (about 35%), a
  taller canopy of overlapping lobes (25%), a conifer of three stacked
  triangles (25%) and a small light sapling (15%); the clearance rules use
  each shape's real extent (8 to 17 px). Cells are taken round-robin across 6 x 3 regions of the map (5 x
  5 cells each), so growth covers the whole map. Building a tower on a
  tree's or bush's cell hides it (with a small puff in play); selling or
  moving the tower away brings it back. While a tower is being placed (a
  pick or a drag) every tree and bush fades to 30%, so the placement
  highlight reads as it does over grass; a buildable cell never looks
  blocked.
- **What moves** (in play): on Riverbend 14 little wave crests (short
  shallow arches lying across the flow) drifting downstream at 14 px/s,
  and 3 glints; 4 chimney smoke puffs, each rising 26 px over 4.8 s; tree
  tops and the swaying tufts move up to 1.5 px on a 3.4 s cycle, each with
  its own phase; 2 cloud shadows (300 x 180 px, at most about 5% darker)
  drift at 5 to 7 px/s and wrap round; a bird crosses high once every 23 s
  (7 s across); a butterfly flutters by a flower bed, two cells or more
  from the trail, for 7 s every 17 s; a pair of eyes in the cave mouth
  blinks every few seconds. Everything is pooled: at most 2 clouds, 4
  smoke puffs, 14 ripples, 3 glints, 1 bird, 1 butterfly and 4 build
  puffs.
- **Cost.** The ground is one full-map image drawn every frame. With
  WebGL (what players get) that costs nothing measurable; on the Canvas
  fallback on a phone under heavy CPU throttling (20x) it costs about 46%
  of frames.
- **Order.** All of it draws under the zones, the placement highlight,
  towers, enemies, shots, hp bars, banners and the HUD. The static ground
  is drawn once into one image per map and layout; a layout switch or
  Play again rebuilds it and releases the old one.
- **Reduced motion.** With `prefers-reduced-motion: reduce` nothing
  moves: the clouds, smoke, water, tufts, trees and eyes hold the frame at
  time 0, and no bird or butterfly comes. Build puffs still show.
- **Test mode.** `?test=1` shows the same frame at time 0 (clouds and
  smoke where time 0 puts them, the ripples, eyes open, no bird, no
  butterfly, no puffs), so every run is identical.

## Sound

Milestone 33 (with its follow-up and six new cues in milestone 36).
Every sound is synthesized with the Web Audio API. The game has no audio
files, samples, music or volume slider.
Sounds follow the renderer's events and change no rule, number or outcome
(`npm run sim` is unchanged). Code: `src/game/audio/`.

- **Recipes** (`recipes.ts`): each sound is data, a list of oscillator or
  noise layers with an envelope (attack, hold, exponential decay to -80
  dB, then 0), an optional pitch slide and an optional filter sweep.
  `synth.ts` schedules a recipe on any `BaseAudioContext`, so the same
  code plays live and renders offline. Headroom rule: every sound on its
  own peaks at or below 0.9 before the limiter, measured offline
  (`e2e/sound-render.spec.ts`).
- **The list** (stated lengths): Musketeer crack 0.08 s and tick 0.05 s;
  Longbow twang 0.18 s and thud 0.10 s; Cannon thump 0.22 s and boom
  0.40 s; Mortar pop with a falling whistle 0.26 s (it ends inside the
  320 ms flight at 1x) and deep boom 0.56 s; Tar Pit glob 0.13 s and splat
  0.15 s; Fire Pot whoosh 0.24 s and crackle 0.15 s; hit tick 0.02 s;
  death pops 0.09 s (Goblin, Harpy), 0.14 s (Wolf, Shieldbearer), 0.30 s
  (Troll); exit warning 0.45 s; build 0.21 s, first upgrade 0.32 s, second upgrade 0.219 s (G5 then E6), sell 0.25 s,
  refused 0.27 s (two round falling notes), button tap 0.03 s, tower select
  0.13 s; Powder Keg 0.76 s, Tar Barrel 0.35 s, Fire Arrows 0.55 s, charge
  ready 0.36 s; wave start horn 0.70 s, wave clear chime 0.51 s, Call next
  0.35 s; Grumblefoot's arrival 1.40 s and fall 1.41 s; win 1.76 s and lose
  1.93 s; the gold cheat's coin 0.42 s (triangles with a low-passed edge).
  The reward offer is a descending chime (0.468 s) and the pick a rising
  pair (0.363 s). Act II starts with three brass notes (0.615 s).
  Grumblemaw's pack call is a two-part howl (0.510 s), his arrival a
  rising roar (1.298 s) and his fall a descending rumble (1.444 s).
- **Small speakers.** Phones and tablets barely play below about 150 Hz,
  so every low sound (Cannon thump and boom, Mortar boom, Troll death,
  exit warning, Powder Keg, Tar Barrel, both bosses' arrivals and falls:
  `LOW_SOUNDS`) has a mid layer between 200 and 900 Hz: a triangle body an
  octave or two above the thump and a band-passed noise crack. Through the
  phone stand-in (a 200 Hz high-pass, 24 dB/octave) each keeps at least
  half its RMS (0.56 to 0.81; before the mid layers the Cannon boom kept
  0.19, the Mortar boom 0.16, the Keg 0.30).
- **Levels.** Each sound's short-term loudness (the RMS of its loudest
  50 ms, before the master chain) is set to sit in its tier's band
  (`LEVEL_TIERS`, checked offline). Each tower's impact is louder than
  its shot.

  | Tier | Sounds | Band | Set to |
  |---|---|---|---|
  | Tick | hit | 0.008 to 0.02 | 0.012 |
  | Shot | the six shots | 0.05 to 0.065 | 0.06 (Musketeer 0.055) |
  | Impact | the six impacts, the death pops | 0.068 to 0.11 | 0.09 (Musketeer 0.07, Fire Pot 0.08; deaths 0.08, 0.09, 0.10) |
  | Action | build, both upgrades, sell, refused, tap, select, coin, reward offer and pick | 0.045 to 0.10 | 0.08 (tap 0.05, select 0.07) |
  | Moment | exit, charge ready, wave clear, Call next, wave horn, Act II, pack call | 0.11 to 0.17 | 0.12, 0.12, 0.14, 0.14, 0.165, 0.158, 0.148 |
  | Big | specials, both bosses' arrivals and falls, win, lose | 0.17 to 0.26 | 0.17 to 0.23, with Grumblemaw arrival 0.241 and fall 0.243 |

  In the scripted 10 s busy wave the mix gets 5.0 dB louder when the
  wave horn sounds and 5.3 dB when the Powder Keg does. Grumblemaw's
  arrival, pack call and fall lift the mix by 6.9, 3.2 and 5.8 dB.
  The test requires at least 3 dB per cue. Grumblemaw's arrival and fall
  are the loudest two cues by 50 ms RMS.
- **Triggers.** `fx/effects.ts` plays the sounds of the events it routes:
  a shot when the tower fires; its impact, the hit tick and the death pop
  when the drawn projectile lands (the effects' own arrival); a kill
  without a projectile (burn, special) at once; the boss's fall with his
  burst (no death pop for him). An early call plays Call next instead of
  the horn; the win or lose jingle replaces the last wave's chime.
  The reward offer chime takes the place of the usual clear chime, and
  the Act II fanfare takes the place of the wave 11 horn. A reward pick
  and pack call each have a cue. Grumblemaw uses his own arrival and fall
  sounds.
  `GameScene` adds a tower select, a refused action (a failed build,
  upgrade, sell, move, undo or special, or a click or tap on a blocked
  cell with a pick) and the charge becoming ready (the recharge reaching
  0; a wave start's fresh charge has the horn). Every button click taps,
  except Start Wave (the horn) and the mute button.
- **Thinning** (`mixer.ts`, real time from `performance.now()`): the same
  sound started again within 50 ms is dropped; within 120 ms for the
  smallest sounds (hit tick, Musketeer tick, small death pop) and 400 ms
  for the exit warning. Each start's level is `max(0.3, 1 / (1 + 0.25 n))`
  for n starts of that sound in the last 400 ms.
- **Budget for busy sounds:** hit ticks, shots, impacts and deaths share
  20 starts in any second. Past it, such a sound still starts if it has
  not sounded for 500 ms (a beat), so each stays audible at least twice a
  second when it is asked for. Player actions, moments and big sounds
  are not limited. In the 120-enemy horde with 25 towers: 21 starts a
  second at 1x and 24 at 3x (33 and 90 before the budget).
- **Voice cap:** 16 voices at once. At the cap a new sound pushes out the
  live voice that ranks lowest (priority, then level, then age) if that
  voice's priority is not above its own, with a 5 ms fade; otherwise the
  new sound is dropped. Priorities: hit tick 0, shots 1, impacts and
  deaths 2, player actions 3, wave moments, exit and charge 4, boss,
  specials and jingles 5.
- **Master chain** (`synth.ts`): every voice -> level 0.55 -> limiter
  (`DynamicsCompressorNode`: threshold -3 dB, knee 0, ratio 20, attack
  2 ms, release 100 ms) -> mute gain -> output. The limiter is a safety
  net, not a squeeze: 40 shots, 40 impacts and 40 deaths in half a second
  peak at 0.51 thinned and 0.92 unthinned, and the limiter's deepest gain
  reduction is 0.0 dB and 0.8 dB (measured offline against the same mix
  with the limiter bypassed, lined up for its look-ahead, in 20 ms
  windows; at most 3 dB is tested), so it does not pump.
- **Speed:** a sound starts at the context's current time and is never
  pitched or sped up; at 2x and 3x more shots come per real second and
  thinning and the budget handle them.
- **Starting and stopping** (`engine.ts`): no `AudioContext` exists until
  the player's first pointerdown, pointerup, touchend, click or keydown
  (capture listeners on `window` create it, or resume it later). A hidden
  page stops every voice and suspends the context; it resumes when the
  page shows. Without Web Audio, or if the context fails, the game is
  silent with no error. Phaser's own sound manager is off
  (`audio.noAudio`), so it makes no context. Sounds play only while the
  context runs and the page shows.
- **Test mode** (`?test=1`): the engine is installed disabled; nothing is
  created and nothing plays (the mute setting and M still work).
- **Mute.** A speaker drawn in code (two waves when on, a red cross when
  muted): landscape, 42 x 42 at the right end of HUD row 2 (x 904, under
  the speed button; the build bar's buttons went from 148 to 140 px) and
  in the title's top right corner; portrait, 70 x 70 at the end of
  controls row 2 (Start Wave 170 and speed 82 wide) and in the title's
  corner. The M key toggles it anywhere (in the README and
  `audio().hint`; no hint is drawn on the button, where it was too small
  to read). Muting sets the mute gain to 0 at once and stops every voice;
  unmuting plays a tap. Stored in `localStorage` under `tarpit.muted` ("1"
  muted, anything else sound on; default on) with the best scores' care:
  blocked or full storage never throws and the choice holds for the
  session.
- **Hooks:** `window.__tarpit.audio()` (enabled, muted, label, hint,
  context state, live voices, counts requested, played, thinned and
  capped by name), `setMuted()`, and `audioLab` (offline rendering,
  `lab.ts`). `npm run sounds -- <folder>` writes every sound and a 10 s
  busy wave into `m33-sounds.wav`, and the same through the phone
  stand-in into `m33-sounds-phone.wav`, for listening (never committed).

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
  and speed (114 x 70); milestone 33 narrowed Start Wave to 170 and speed
  to 82 for the 70 x 70 mute button at the row's end ("Sound"). The tower buttons are 4 px apart and the second row's 6 px; both rows start 5 px from the edge. Portrait text is 18 px or more.
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
  spans two or three cells). The base tower panel (220 x 70 buttons, 70 px
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

## Touch and phones

Milestone 35 (`src/game/pageLock.ts`, `src/game/touchAssist.ts`). Mouse
input never goes through any of this: placement and selection with a
mouse stay exact in every layout.

- **Page lock.** `index.html` fixes `html` and `body` (`position: fixed`,
  `overflow: hidden`, `overscroll-behavior: none`) so the document has
  nothing to scroll, and gives `html`, `body`, `#game` and everything in
  them `touch-action: none`, no text selection, no callout and no tap
  highlight. iOS Safari ignores `user-scalable=no`, so a pinch or double
  tap that starts on the letterbox bars beside a portrait canvas (plain
  `body` before this) zoomed the page. `installPageLock()` also prevents,
  at the document and non-passive, Safari's `gesturestart`,
  `gesturechange` and `gestureend`, any `touchmove` with two or more
  touches, a one-finger `touchmove` that started off the canvas, and
  `dblclick`. It never prevents `touchstart` or `touchend`, so taps, drags,
  the five-tap gold cheat and Phaser's own window listeners are unchanged.
- **Recovery.** On `visualViewport` `resize` and `scroll`, window `scroll`,
  `resize`, `orientationchange`, `pageshow` and a return to the page, a
  check runs 150 ms after the last event (`recoveryFor`): a scale more than
  0.01 from 1 or an offset or scroll of 0.5 CSS px or more is put back.
  It scrolls to the origin and, for a scale, rewrites the viewport meta
  content to an equivalent spelling (`initial-scale=1` and
  `initial-scale=1.0`, alternating), at most once a second. That rewrite is
  only a first attempt: iOS ignores `maximum-scale` for a pinch, Apple does
  not promise that a changed meta tag drops the zoom, and `scrollTo` does
  not move a pinch-zoomed view. So, whatever the browser does, `#game` is
  placed on what is actually visible (`boxFitFor`): when the visual
  viewport is zoomed or offset, `#game` takes its rectangle
  (`offsetLeft`, `offsetTop`, `width`, `height`, in layout-viewport CSS px,
  less the safe-area insets divided by the scale), so the canvas fits and
  centres in the visible area even if the page stays zoomed; at scale 1
  with no offset it returns to `index.html`'s insets (or, while a Safari
  toolbar is mid-change, the visible size at the origin). The box moves on
  every viewport event and the canvas refits at once (Phaser re-reads the
  canvas bounds, so taps map to the right cells), then again after the
  check, through the layout switch (`layoutSwitch.ts` `refit()`: no switch
  unless the shape changed, GameScene restarts coalesce). Placing the box
  fires no viewport event, so nothing loops. The layout is chosen from the
  visual viewport at scale 1, else the layout viewport, never a zoomed
  view, so a zoom never flips the layout or restarts the game.
- **Snap.** On touch (a bar drag, a planning-phase move and tap
  placement), when the cell under the lifted point cannot take the tower
  (trail margin, water, the cottage, occupied, the map's edge) the ghost
  moves to another cell (`snapCell`). The candidates are the cells within
  1.5 cells, centre to centre, of the cell under the point (its eight
  neighbours) that can take the tower and that the straight line from the
  lifted point reaches without crossing the trail's centreline, water or
  the cottage (leaving a water or cottage box the point starts in is not
  crossing). The nearest to the lifted point wins, except that a candidate
  toward the finger (its offset has a positive part toward the bottom of
  the screen: world +y in landscape, world +x in portrait) loses to any
  other candidate at most 25% farther. Remaining ties go to the lower cell
  key (the upper row, then the left column, in world terms). A move may go
  back home. A ring at the lifted point and a line to the cell show the
  snap. Red shows only with no candidate, and a release then cancels; a
  lifted point off the map never snaps. Gold plays no part. A tap on a
  tower still selects it, even with a pick. Against the first rule (nearest
  only), 49 points in every unbuildable cell: Meadow 3.1%, Switchback 0.1%
  and Riverbend 6.6% of the points that snapped now find no candidate
  (each of those snaps crossed the trail, water or the cottage); none of
  the remaining snaps crosses one.
- **Magnifier.** When a 32 px cell is under 28 CSS px on screen (phones,
  portrait and landscape; not the tablet or desktop), a touch drag, move
  or special aim hold shows a 200 x 200 canvas px view of the map at 2x,
  centred on the target cell (or the aim point) and kept inside the map.
  It is a second Phaser camera on the same scene (no input, the aim banner
  and its own frame ignored), so it shows the live game, the cell
  highlight, ghost, range and aim cross; it costs one more pass over the
  display list while a drag lasts. It sits in a top corner of the map on
  the side away from the finger, keeps its side until the finger (56 px)
  or the target (24 px) would touch it, then takes the other top corner,
  then a bottom corner. It goes when the hold ends, is cancelled or the
  game ends; a layout switch or Play again destroys it with the scene.
- **Nearest tower.** With no pick and no aiming, a touch tap on no tower's
  cell within 0.75 of a cell (24 px) of a tower's centre selects the
  nearest tower (ties to the lower cell key). Further away it closes the
  panel as before.

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
targeting, pick a reward, use a special, the gold cheat, call the next wave early,
continue into endless waves, next-wave preview, and a headless runner (`headless.ts`) that plays
a scripted set of actions for tests and balance work.

Test hooks (`window.__tarpit`, `?test=1`) include `startGame(difficulty?,
map?)`, `runScript(name, untilWave?, boons?)` (an archetype recorded on the running
game's level and map), `continueEndless()`, `bestScore(difficulty, map?)`,
`ui()` (with `ui().special`: the charge, `ready`, `rechargeTicks`, the
special aimed, `aimPoint`, `banner`, `holding`, the landing `labels` and
the `zones`), `pendingBoon()`, `pickBoon(id)`, `heldBoons()`, `bossOnField()`,
`uiRects()` (including `reward:<id>`, `boon:<id>` and `gold`, the cheat's tap area),
`titleReady()`, `upgradeAt(col, row, path?)`, `step(n)`, `state()`, `events()`, `hudText()`,
`setSpeed(1 | 2 | 3)`, `speed()` and `cheatGold()`. `spawnHorde` works only with `?test=1` or `?perf=1`; without
them `window.__tarpit` keeps five read-only hooks.

## Archetypes

The archetypes (`src/sim/headless.ts`) are scripted players. Each records
its script by playing on a level and map and returns a `WaveScript`
(per wave: setup actions; `timed`: actions at wave ticks; `mapId`;
`endless`; optional picks by offer wave in `boons`). When a script has no
pick for an offer, it selects the first reward. `playScripted` and the
browser's `runScript` replay it.

- **noTowers**: builds nothing.
- **oneMusket**: one base Musketeer on the first cell of the map's trail
  order before wave 1, nothing else. It measures wave 1 for a first-time
  player.
- **lazyBuild**: before each wave, base Musketeers while affordable, on the
  trail order. Once the first pass is full, it repeats the trail
  walk with the first pass's cells excluded. **greedyMusket** uses the
  first pass and upgrades each Musketeer before buying the next.
  **longbowSpam** buys base Longbows on the first pass. The trail order
  walks the path in 96 px steps from 96 px and takes, at each step, the
  nearest free buildable cell within 72 px.
- **comboBuild** opens with two Longbows. Meadow buys 31 opening actions,
  including its third bow at (15,6). Switchback buys 15, with bows at
  (14,7), (18,7) and (20,7) covering the folded lanes. Riverbend buys 31,
  with the first Tar Pit at (10,1) and bows at (10,6) and (12,6).
  The map's act-two queue covers all six tower types. Meadow specializes
  one of each. Switchback upgrades its second existing Mortar, specializes
  both Mortars and three bows, and buys its Cannon and Musketeer. Riverbend
  specializes two bows and two Mortars. Each map spends its branch money
  as soon as the next purchase is affordable. **wideBuild** follows the
  same opening and replaces each branch with another level-2 tower of the
  same type and total cost on a free firing lane.
  **comboBuildNoFire**: its purchases without the Fire Pot cells.
  **comboNoSpecials**: the plan with no specials. **noAntiAir**: the combo
  purchases, selling its Musketeers and Longbows before wave 4 and building
  none after. comboBuildNoFire and noAntiAir are replayed with the policy,
  so their specials are fired for their own game.
- **hardBuild**: the map’s paired-Longbow opening followed by its combo
  purchases in the Hard order (the opening and anti-air Longbows and their upgrades first,
  then three upgraded Longbow pairs with the first Tar Pit, then the first
  Fire Pot and the pair's upgrades, then the rest), plus the special
  policy. The Hard opening uses two Longbows on every map. In act 2 the Meadow
  and Riverbend plans buy one extra Mortar and upgrade it. Switchback
  already covers the boss approach with its existing Mortars. Each Hard plan buys Siege Shell for its first Mortar.
- **endlessIdle**: comboBuild, then Keep going and no more purchases.
  **endlessGreedy**: the same campaign. In endless setup it buys the
  cheapest remaining upgrade while affordable, breaking ties by cell
  order. Once all towers are upgraded, it fills free trail-order cells
  with Longbows. Both use the special policy through endless.
- Meadow only (they throw for another map): **soundBuild** (Musketeers, Cannons and a Tar Pit),
  **soundBuildNoTar** (its Tar Pit cells removed), **comboStrongest**
  (every tower set to Strongest).
- **artilleryBuild** keeps up to four opening Longbows and spends its
  second-act money on two upgraded Cannons and two upgraded Mortars.
  **burnBuild** keeps one opening Mortar and reinforces with two upgraded
  Tar Pit and Fire Pot pairs. Both choose open sites by path coverage;
  Fire Pots prefer a cell next to their Tar Pit. Both use the same
  specials policy as the combo. **musketBuild** keeps at most one opening Mortar and then adds six upgraded Musketeers.
- **Cluster special** (`clusterSpecial` timed action): fire the first
  unlocked of Fire Arrows, Tar Barrel, Powder Keg at the centroid of the
  densest cluster of live enemies within 70 px of a live enemy.

**The special policy** (`src/sim/specialPolicy.ts`): how every archetype
that fires specials fires them, on every map and level, the way a person
would. It looks every 30 wave ticks while the charge is ready. Candidate
points lie every 30 px along the path; a point works for a special if its
circle catches at least 3 enemies. If a Troll or either boss is in a crowd,
the Tar Barrel and Fire Arrows take turns (Tar Barrel first; before wave 7
the Tar Barrel takes every turn), fired at the working point with a big
one inside. Otherwise, if a point works for the Powder Keg, the keg is
thrown there. Otherwise it waits. The best point catches the most enemies;
ties go to the point nearest the exit. A forbidden special is skipped (target
N9), and in the Tar Barrel and Fire Arrows' turns the other takes its
place. The headless recorder fires each choice and writes it into the
script's timed list (`timed`), so `playScripted` and the browser's
`runScript` replay the same game.

## Balance targets

Asserted by `src/sim/balance.suite.ts` (run per map by
`balance-meadow.test.ts`, `balance-switchback.test.ts`,
`balance-riverbend.test.ts`). Maps may differ in difficulty; every map
sits inside every band.

Normal, every map unless specified:

- **N1** noTowers loses by wave 3.
- **N2** lazyBuild loses on wave 7 to 14.
- **N3** longbowSpam loses on wave 8 to 16.
- **U1** comboBuild wins with 8 to 17 lives. This replaces N4.
- **U2** Removing just its second upgrades costs at least five lives or loses the game.
- **U3** wideBuild buys additional level-2 towers with the same budget. It wins Easy and finishes Normal within six lives of comboBuild.
- **U4** Each tower has an A win and a B win in a matched Normal or Hard reference campaign, ranked by lives then kills.
- **U5** Reversing all branches of any one type in the Normal combo preserves victory within five lives.
- **U6** For each tower, a path and an equally expensive level-2 copy have a tie or a winning example in each direction.
- **U7** On every map hardBuild wins Hard with at least three lives, lazyBuild loses Hard by wave eight and wins Easy with at least eight lives.
- **U8** R1 through R4 hold, including the 22-minute Meadow limit.
- **N5** comboBuildNoFire is strictly worse than comboBuild by lives or loss.
- **N6** comboNoSpecials wins. comboBuild wins with at least 3 more lives.
- **N7** noAntiAir lets at least half of wave 4's Harpies exit and loses
  by wave 12.
- **N8** oneMusket lets at most 6 of wave 1's enemies exit.
- **N9** On Meadow, soundBuild lasts longer than soundBuildNoTar. Forbidding
  any one special makes the combo strictly worse by lives and then kills.
  The policy fires at least 30 specials and at least 80% catch 3 or more
  enemies.
- **N10a** comboBuild wins with all 27 combinations on each map. The
  unit suite runs nine combinations per map: the defaults, each single
  substitution and the two diagonals of non-default choices.
- **N10b** For each offer, fixing the other picks at their defaults,
  the difference between the best and worst final lives is at most four.
- **N10c** Each reward is strictly best among its offer on a named build,
  map and difficulty (Normal or Hard), ranked by lives then kills.
- **N10d** Each reward changes lives or defeat wave for at least three
  distinct build/map pairs. Difficulty alone does not create a new pair.
  Both runs play the same build. The comparison neutralizes just the
  selected effect and keeps the other two picks active. Purchases respond
  to each run’s own gold, and the normal pick action runs in both games.
- **B1** The default combo kills Grumblemaw on Normal and the Hard plan
  kills him on Hard, on every map.
- **B2** The Normal combo without specials wins on all maps and
  Grumblemaw escapes on at least two.
- **B3** The Easy lazy build wins on every map with at least eight lives,
  whether the boss dies or escapes.
- **N11** A Powder Keg kills a Harpy or Wolf in one hit and inflicts at
  least 5% of a Troll's health.

Easy, every map:

- **E1** lazyBuild wins with at least 8 lives.
- **E2** noTowers loses.
- **E3** oneMusket lets at most 3 of wave 1's enemies exit.

Hard, every map:

- **H1** hardBuild wins.
- **H2** lazyBuild loses on wave 2 to 8.
- **H3** comboBuild has at least 5 fewer lives than on Normal or loses on
  wave 12 or later.
- **H4** The Hard hp rule holds.

Endless, every map:

- **X1** On Normal, endlessIdle loses on the second through fifth
  endless wave.
- **X2** On Normal, endlessGreedy loses on a later endless wave than
  endlessIdle, by the twelfth endless wave.
- **X3** The six measured endless runs per map (idle and greedy on Easy,
  Normal and Hard) end in loss below the headless cap.

The campaign wave rules R1 to R4 hold too.

## Measured matrix

On Meadow Normal the default combo finishes in 21:46.9 of wave time.
Waves 11–20 take 667.3 seconds, with an 89.0-second longest wave and 23
enemies alive at peak. It kills Grumblemaw on wave tick 5336. All three
Normal combos and all three Hard plans kill him. Without specials he
escapes on Meadow and Riverbend, costing six lives on each.

All 27 pick combinations win on each map. With the other choices fixed at
their defaults, the wave 5, 10 and 15 offers span 4/0/3 lives on Meadow, 0/0/3 on
Switchback and 3/0/3 on Riverbend, respectively. The separate build comparisons exercise all
nine strict winners. The simulator prints their scores and affected
build/map pairs.

`npm run sim` ends with this table. “W 13” means a win with 13 lives.
“L 8” means defeat on wave 8. The endless rows count from campaign wave 1.

| Archetype | Meadow easy | Meadow normal | Meadow hard | Switchback easy | Switchback normal | Switchback hard | Riverbend easy | Riverbend normal | Riverbend hard |
|---|---|---|---|---|---|---|---|---|---|
| noTowers | L 2 | L 1 | L 1 | L 2 | L 1 | L 1 | L 2 | L 1 | L 1 |
| oneMusket | L 3 | L 2 | L 2 | L 3 | L 2 | L 2 | L 3 | L 2 | L 2 |
| lazyBuild | W 22 | L 8 | L 2 | W 29 | L 8 | L 2 | W 19 | L 8 | L 2 |
| greedyMusket | W 26 | L 8 | L 2 | W 30 | L 20 | L 2 | W 27 | L 8 | L 2 |
| longbowSpam | L 10 | L 8 | L 7 | L 18 | L 8 | L 8 | L 10 | L 8 | L 7 |
| noAntiAir | L 8 | L 5 | L 5 | L 8 | L 5 | L 5 | L 7 | L 5 | L 5 |
| comboBuild | W 38 | W 17 | L 20 | W 38 | W 17 | L 20 | W 37 | W 16 | L 20 |
| wideBuild | W 38 | W 17 | W 4 | W 38 | W 17 | W 4 | W 37 | W 16 | L 20 |
| comboBuildNoFire | W 37 | W 9 | L 7 | W 38 | W 16 | L 10 | W 36 | W 14 | L 7 |
| comboNoSpecials | W 38 | W 4 | L 3 | W 38 | W 9 | L 9 | W 37 | W 2 | L 3 |
| hardBuild | W 38 | W 23 | W 15 | W 38 | W 23 | W 18 | W 38 | W 23 | W 14 |
| artilleryBuild | W 38 | W 13 | W 2 | W 38 | W 23 | W 13 | W 38 | W 13 | L 10 |
| burnBuild | W 32 | W 15 | W 2 | W 38 | W 17 | W 9 | W 38 | W 14 | L 10 |
| musketBuild | W 38 | W 15 | W 2 | W 38 | W 23 | W 9 | W 38 | W 14 | L 10 |
| endlessIdle | L 28 | L 25 | L 20 | L 27 | L 24 | L 20 | L 28 | L 25 | L 20 |
| endlessGreedy | L 30 | L 28 | L 20 | L 30 | L 27 | L 20 | L 30 | L 27 | L 20 |
| soundBuild | L 20 | L 7 | L 2 | - | - | - | - | - | - |
| soundBuildNoTar | L 10 | L 7 | L 2 | - | - | - | - | - | - |
| comboStrongest | W 13 | L 5 | L 2 | - | - | - | - | - | - |
