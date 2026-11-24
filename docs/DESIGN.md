# Tarpit: game design spec

> **Frozen as of milestone 42.** This file states every number and rule the
> game uses. Changing any of them needs a `DECISIONS.md` entry (who decided
> and why) and the balance pins updated in the same change
> (`src/sim/balance.suite.ts`, `npm run sim`). Kyle's play notes can reopen
> the spec. `src/sim/designSpec.test.ts` checks the main tables below
> against the code. History (what changed, when, and why) is in `DEVLOG.md`
> and `DECISIONS.md`, not here. Anything not in this file or the scope
> documents is out of scope.

## Theme and names

King Grumblemaw sends his collectors to take the town's gold. The next-wave
preview uses short names and the existing count style. Boss bars and entrance
banners use full names. The portrait preview wraps across the status strip. Taxed levels give it
two full lines below the tax names. Boss labels scale down when their measured height exceeds
the name pill or health bar. The simulation and balance report retain their original
identifiers and labels.

| Id | Display name | Short name |
|---|---|---|
| goblin | Goblin Collector | Collector |
| wolf | Revenue Hound | Hound |
| shieldbearer | Redcoat Shieldbearer | Redcoat |
| harpy | Royal Harpy | Harpy |
| troll | Toll Troll | Toll Troll |
| boss | Assessor Grumblefoot | Grumblefoot |
| grumblemaw | King Grumblemaw | Grumblemaw |

The Guards are an Axeman, a Swordsman, an Archer and a Captain.

## Theme and screens

Both looks use the same printed furniture. The title is a parchment broadside
pinned to wood boards, with a capital masthead, a red proclamation ribbon and
a town silhouette. A double keyline frames the paper. Brass-edged wood
plaques carry cream lettering. Town blue marks a selection and the King's
red marks a warning. The ink is #352216, parchment #f1dfb5, wood #422919,
brass #b68a48, blue #254a57 and red #843629. Unavailable actions and
unaffordable purchases use a flat grey plaque (#494847) with dim lettering
(#a29f99) and no brass trim. Text contrast is 3.46:1, compared with
10.25:1 on a ready plaque. Locked choices keep their lock.

The page preloads both Libre Caslon Text weights and shows “Loading” in
plain type on parchment. Boot waits up to one second for both Latin faces
before Phaser measures text. If either weight fails or misses the deadline,
the session uses Courier New
with a monospace fallback. The service worker caches both weights. Running
totals, prices and timers use the typewriter digits because Caslon's figures
have different advances. Star awards and locks are drawn shapes.

The HUD is a wooden counter. The landscape coin has 5 px of clearance from
the brass frame and 6 px from the Gold label. Large balances leave at least
4 px before Lives. The level
map traces a road between ten plaques on each act’s parchment sheet, with
brass locks, star slots and a blue next stop. A four-pointed star marks the
feat slot on a second-act plaque. Cards and results use dark type on paper. The reward offer
uses the same paper for each choice. Wave and boss banners use blue and red
respectively. Each banner line fits inside 24 px of horizontal padding, and
the plaque leaves at least 8 px at either map edge. Tall text expands the
plaque vertically and leaves at least 2 px between lines. Changing the look
changes the battlefield art.

During a campaign level or Free play, the Pause plaque and P open a
parchment panel over the dimmed battlefield. Resume is selected first.
Arrows select an action and Enter or Space activates it. P, Escape and
Resume return to play. Restart changes to “Confirm restart” on its first
activation. The second starts the same level, or the same Free play map
and difficulty, from the beginning. Level map returns to the campaign
road. Menu returns to the Free play picker. Mute still works on the HUD
and from M.

## Space and time

- The canvas is 960 x 580 px. The map uses the top 960 x 480; the HUD uses
  the bottom 100 px in two rows: stats, the next-wave preview and the
  Special, Start Wave and speed buttons, then the build bar and mute. Pause
  spans both rows at the right edge.
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
  strokes) and the cave at the spawn. The upright town is a separate layer
  on the refused cells beside the exit.

## Economy and lives

- Each kill pays the enemy's bounty. Clearing a wave pays a 25 gold bonus.
  Clearing campaign waves 5, 10 and 15 also offers a reward.
- Calling the next wave early pays the current wave's 25 clear bonus at
  once plus an early bonus of up to 20 (see Call early).
- An enemy reaching the exit costs its lives cost (1 for regular enemies,
  5 for Grumblefoot and 10 for Grumblemaw) and is removed. The game ends
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
| Added HP per act-2 wave | 0% | 28% | 21.3% |
| Start gold | 150 | 100 | 80 |
| Lives | 35 | 20 | 15 |

Through wave 10, multiply base hp by the difficulty multiplier. Starting on
wave 11, each wave adds the listed percentage of the enemy’s original difficulty HP. The campaign factor is 1 plus that rate times the number of waves past ten, up to ten steps. Endless carries forward the wave-20 factor.
Round the product once, half up, for the enemy's starting and maximum hp.
Scheduled enemies and summoned Wolves use the same rule. The table below
gives base difficulty hp before wave growth.
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

**Hard hp rule (waves 1–10).** No ordinary enemy's Hard hp sits 1 or 2 points above
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

In landscape, the campaign level or Easy/Hard tag sits below the wave
counter. The 18 px counter moves up 9 px and the 12 px tag sits 12 px
below row centre. Their fixed heights (22 and 15 px) leave a 2.5 px gap.
Portrait sets both labels at 20 px on one line with a 7 px gap.
Normal Free play has no tag. The end
screens have [Play again] (same level and map) and a 100 x 42 [Menu]
beside it that returns to the title; the win screen also has [Keep going].

## Enemies

| Type | HP | Speed | Bounty | Lives cost | Blocker damage/s | Notes |
|---|---|---|---|---|---|---|
| Goblin | 23 | 60 | 2 | 1 | 6 | two Musketeer shots on Easy and Normal, three on Hard |
| Wolf | 20 | 120 | 2 | 1 | 8 | fast |
| Troll | 950 | 35 | 8 | 1 | 45 | tanky |
| Harpy | 36 | 90 | 3 | 1 | 0 | flying |
| Shieldbearer | 70 | 45 | 5 | 1 | 12 | shield |
| Assessor Grumblefoot | 4000 | 25 | 150 | 5 | 300 | boss; slows capped at 30% |
| Grumblemaw | 5600 | 14 | 75 | 10 | 400 | boss; slows capped at 30% |

- **Flying.** A Harpy flies over the path. Tar Pit, Cannon and Mortar never
  target it, and a Cannon or Mortar splash skips it even when it is inside
  the radius. A Fire Pot targets it and its impact hits (4 damage), but the
  burn does not stick. Musketeer and Longbow hit it normally. The keg and zones hit
  it. Harpies fly straight over a Barricade. On screen a Harpy flies
  16 px above its path position with a soft ground shadow, above every
  other enemy and the tower labels.
- **Shield.** A Shieldbearer takes half damage from any shot whose effective
  damage is 10 or less: base Longbow 4 -> 2, upgraded Longbow 9 -> 4.5,
  Fire Pot impact 4 -> 2, Tar Pit 3 -> 1.5. Shots over 10 (Musketeer 12
  and 22, Cannon, Mortar), burn damage and specials are full. It carries a
  small grey shield mark on its left. Keen Arrows raises an upgraded
  Longbow shot to 11.25, so it bypasses the shield.
- **Bosses.** Assessor Grumblefoot, is the last spawn of wave 10
  at 65 s (waveTick 3900), 2 s after the last Troll. Grumblemaw is the last
  scheduled spawn of wave 20. Both walk without a shield. Every tower can
  target them. Splash, burn and tar apply, with slows capped at 30% for
  the effect's full duration. At the cap Grumblefoot walks at 17.5 px/s and Grumblemaw at 9.8 px/s,
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

### Feathers

A Tar Barrel tars the enemies inside its radius on impact and immediately
feathers each eligible enemy, including Harpies. Enemies that enter the
puddle later receive the slow. A path B Tar Pit shot feathers a surviving
ground target if either its tower slow or its Tar Barrel slow is active. A
shot that cannot feather its target applies its usual slow. Both bosses keep their slow cap and are immune to feathers and flinching.
Each enemy emits one `feathered {enemyId, x, y}` event at the start of its only retreat.

| Tower run ticks | Barrel run ticks | Flinch ticks |
|---:|---:|---:|
| 88 | 72 | 16 |

A runner follows the same trail backward at its own walking speed from the enemy table. It passes
through Guards and Barricades without either side attacking, and leaves
any previous guard contact. Slows and Forced March affect forward walking
only. Slow timers, zones, burns, tar's burn multiplier and tower shots
keep operating. At the entrance the runner stops at distance zero and
ends its run immediately. After its last run tick it walks forward,
meeting blockers as usual. Its feathers remain after the run.

A runner that reaches or passes another enemy on the trail makes it flinch
once in its life. The crossing uses both enemies' start and end distances
from the same tick. Tied enemies must move past each other. On the following
ticks a flinching enemy halts and neither fights nor holds a guard's attention.
A flinch pauses the run timer until movement resumes. In every look, body
feathers remain after the 520 ms puff. The sprite faces back along the road
while it runs and leans 15 degrees during a flinch. Each batch of feather
hits plays one 0.165 s synthesized puff.

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
| Musketeer | A | Sharpshooter | 85 | 200 | - | 45 | 1 | - | - | - |
| Musketeer | B | Volley | 85 | 125 | - | 22 | 2.8 | - | - | - |
| Cannon | A | Heavy Shot | 140 | 105 | - | 40 | 0.5 | 105 | - | - |
| Cannon | B | Quick Loader | 140 | 105 | - | 40 | 1 | 55 | - | - |
| Tar Pit | A | Deep Tar | 110 | 105 | - | 3 | 2 | - | 78% for 2 s | - |
| Tar Pit | B | Feathers | 110 | 145 | - | 3 | 2 | - | 64% for 2.55 s | - |
| Longbow | A | War Bow | 70 | 170 | - | 16 | 2.5 | - | - | - |
| Longbow | B | Quick Draw | 70 | 170 | - | 9 | 4.5 | - | - | - |
| Mortar | A | Siege Shell | 190 | 220 | 70 | 140 | 1/3 | 70 | - | - |
| Mortar | B | Wide Burst | 190 | 220 | 70 | 80 | 1/3 | 150 | - | - |
| Fire Pot | A | Inferno | 120 | 125 | - | 4 | 1 | - | - | 17/s for 1 s |
| Fire Pot | B | Lasting Flames | 120 | 100 | - | 4 | 1 | - | - | 8/s for 8 s |

The slow column gives strength and duration. The burn column gives damage
per second and duration. A locked level-2 Musketeer, Cannon, Tar Pit,
Longbow, Mortar and Fire Pot sell for 59, 98, 77, 49, 133 and 84 gold.
At level 3 their locked refunds are 119, 196, 154, 98, 266 and 168 gold.

The level-2 panel offers two cards. Each shows the path name, its price
and the change from the level-2 stats. Both show "Not enough gold" when
the tower's owner cannot afford the upgrade. At level 3 the heading shows
the path name. Undo appears alongside the cards or the final path while
the latest purchase is refundable. Target and Sell share a row at levels
2 and 3, using the full inner width below Close. Tower actions and landscape
build buttons leave at least 12 px between the name and amount on the
reference Mac layout. Build button names and costs sit 6 px from their edges.
The panel stays inside the map and clears the selected tower.
Touch targets on the portrait phone measure at least 44 CSS px on both axes.

| Path name | Panel line |
|---|---|
| Sharpshooter | Farther, harder shots |
| Volley | Fires much faster |
| Heavy Shot | A much bigger blast |
| Quick Loader | Fires twice as fast |
| Deep Tar | Slows enemies to a crawl |
| Feathers | Feathers tarred enemies. They run back. |
| War Bow | Hits almost twice as hard |
| Quick Draw | Fires almost twice as fast |
| Siege Shell | Hits much harder |
| Wide Burst | Blast reaches twice as far |
| Inferno | Hotter, shorter burns |
| Lasting Flames | Burns twice as long |

The first upgrade adds a gold ring. A level-3 tower keeps the ring and
has a dark-backed badge 10 map px right and 10 px above its centre.
The same shapes appear in landscape, portrait, test mode and the move preview.

| Path mark | Shape | Color |
|---|---|---|
| A | diamond | #f2c94c |
| B | two dots | #76e6e8 |

**Targeting.** A tower first takes the enemies it may shoot: in range,
outside a minimum range (the Mortar only targets enemies whose distance is
in [70, 220], both inclusive; its splash still hits enemies inside the
minimum range), and not flying for Tar Pit, Cannon and Mortar. Among those
the Feathers upgrade prefers enemies without feathers. Within that preference,
and for every other tower, it picks by its targeting mode, shown and cycled on the tower panel's
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
value in the table below. The dark ink effect text is 18 px in landscape and
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
reward is held, the 132 px tower buttons narrow to 118 px for the Musketeer,
113 px for Longbow and 103 px for the others, with 4 px gaps. The reward icons start at x=678. Classic labels go from 16 to
14 px. In portrait and smaller landscape windows the icons sit
in a column beside the board. The portrait preview keeps its full 468 px.
Hover or tap an icon to read its name and effect for up to 2.8 s.

The win and loss screens list the names under “Rewards” in 14 px text in
landscape and 20 px in portrait. The portrait list wraps above the buttons.
Turning the device keeps the run, any open offer and all chosen rewards.
Reloading starts a new run.

| Boon | ID | After wave | Value | Effect |
|---|---|---|---|---|
| Long Barrels | longBarrels | 5 | 1.3 | Cannon and Mortar maximum range multiplier |
| Keen Arrows | keenArrows | 5 | 1.11 | Longbow damage multiplier |
| War Chest | warChest | 5 | 80 | Gold gained immediately |
| Sticky Tar | stickyTar | 10 | 2 | Tar Pit and Tar Barrel slow duration multiplier |
| Hot Coals | hotCoals | 10 | 2.11 | Damage multiplier for all burns |
| Quick Hands | quickHands | 10 | 0.57 | Special recharge time multiplier |
| Stone Walls | stoneWalls | 15 | 4 | Lives gained immediately |
| Veteran Crews | veteranCrews | 15 | 1.11 | Tower fire rate multiplier |
| Bigger Blasts | biggerBlasts | 15 | 1.3 | Cannon, Mortar and Powder Keg splash radius multiplier |

## Special attacks

`src/sim/specials.ts` `SPECIAL_DEFS`.

| Special | Unlock wave | Radius | Damage | Slow | Burn per s | Zone ticks |
|---|---|---|---|---|---|---|
| Powder Keg | 1 | 90 | 60 | - | - | - |
| Barricade | 3 | 0 | - | - | - | - |
| Tar Barrel | 4 | 100 | - | 0.5 | - | 660 |
| Guards | 6 | 0 | - | - | - | - |
| Fire Arrows | 7 | 90 | - | - | 26 | 660 |

- **Charge.** All five specials share one charge. A Tar Barrel spends it for
  3300 wave ticks (55 s). Each other special spends it for 1200 wave ticks
  (20 s). Quick Hands scales the wait at cast time to 1881 ticks (31.35 s)
  after a barrel or 684 ticks (11.4 s) after another special.
  Each wave start grants one ordinary refill, including an early call,
  automatic dispatch and the first endless wave. It makes an ordinary
  charge ready and subtracts 1200 ticks from a barrel wait, or 684 if
  Quick Hands was held when the barrel landed. Credit stops at ready.
  The remaining barrel wait pauses during setup. Picking a reward during
  setup leaves that wait and its wave-start credit in place. Only one special
  can fire in a simulation tick, even across an early call. During a wave
  the button counts down the remaining seconds, rounded up, and its fill
  shows the fraction of the original wait already paid.
- **Use.** `useSpecial(state, type, {x, y})` acts at once, between ticks,
  like a build. The keg and zones affect every live enemy inside their
  effective radius (inclusive), flyers included.
  Refused, in this order, with `game-over`, `not-in-wave` (setup), `locked`
  (`state.wave` < the unlock wave), `no-charge`, `out-of-bounds` (the point
  must be inside 0..960 x 0..480, edges included). A refusal changes nothing.
- **Barricade.** Snap to the nearest point on the trail centreline. Measure
  the end clearances along the trail. Exact limits are legal. Equally near
  segments use the first in path order. An invalid aim keeps the charge and
  the standing wall. A successful placement replaces the previous Barricade
  at full hp. Even an early-call refill cannot place a second wall in the same tick.
  The wall persists across wave transitions until destroyed or
  replaced. It deals no damage and has the same hp on every difficulty and
  with every reward.

| Blocker | HP | Maximum snap distance (px) | Minimum distance from either end (trail px) |
|---|---|---|---|
| Barricade | 324 | 40 | 64 |

- **Guards.** Use the same snap, end clearances and refusals as the wall.
  The first guard stands on the snap point. Place the rest at equal trail
  distances back toward the cave, following the trail around corners.
  The squad spans 36 trail px. The shared 64 px cave clearance therefore
  leaves room for all four guards at every legal anchor. Shields do not
  reduce guard damage. A new squad replaces every surviving guard.
  It can share the trail with a Barricade.
  The only reward affecting deployment is Quick Hands on the shared charge.

| Squad | Number | HP each | Damage per second | Lifetime in ticks | Spacing in trail px |
|---|---|---|---|---|---|
| Guards | 4 | 72 | 10 | 720 | 12 |

- **Contact.** The state holds one list of blockers, each tagged as a wall or
  a guard. At identical
  distances the wall takes contact first. Each guard strikes one walker in
  contact, choosing the earliest arrival tick and then the lowest enemy id.
  Each kill pays the enemy bounty and counts as a special kill.
  Placement emits `squadPlaced`, each strike emits `guardStrike`, a fallen guard emits `guardDown`, and the last death,
  expiry or replacement emits `squadGone`.
  A walker reaching or crossing the first live blocker stops exactly
  at it, including on the breaking tick. Walkers may stack. Each contributes
  its enemy type's blocker damage/s divided by 60. Difficulty, act-two hp
  growth and slows leave attack strength unchanged. A walker already past
  the blocker continues. Harpies fly over it. Target order, burn, slow,
  tower hits, kill credit and bounty all use the usual rules at that position.
  A blocker placed at the exit would hold nobody. Walkers at the exit distance count as out, so a castle wall there will need the exit check moved.
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
  landing and a `feathered` event for each newly feathered enemy, then the kills.
- Barricade placement emits the usual `special` event with its snapped
  coordinates, trail angle, zero radius and zero hits. Each attack emits
  `blockerHit`. Destruction emits one `blockerBreak`.
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
- **Guards on screen.** The five unlocked choices fit above the controls
  with full-size touch targets. The Guards preview marks every foot position.
  On a refused cast, the aim stays open with a plain-language reason. The
  soldiers face upstream, stand about as tall as Goblins and use enemy-size
  hp bars. Their feet alternate sides of the trail, within 10 px across
  and 6 px along the trail from each simulation point. At contact the
  lower figure draws in front. Live contact animates
  the held weapon, a death drops the soldier, and expiry cues a salute and departure.
  Test mode and reduced motion use still poses. The four sounds distinguish
  arrival, striking, falling and departure. Strike sounds share the horde budget.
  Wave 6 shows the unlock hint once per visit. Painted uses four
  bearings with idle and strike poses on every map.
- **Barricade aiming and impact.** The pointer circle and touch magnifier
  show the placement area. A bar across the trail marks the snap point.
  An invalid aim marks the pointer and explains how to move it. The placed
  timber wall carries an hp bar and shows a count beside it when more than
  three walkers are held. Held walkers overlap in two short ranks across the
  trail, with larger walkers and bosses in front. Every held sprite centre
  stays within 36 game pixels of the wall point in both layouts, so even
  the smallest splash aimed at a held sprite reaches the whole crowd.
  Each wounded walker's hp bar follows its sprite. Attackers lunge, the
  wood shakes, and broken beams scatter.
  Reduced motion and test mode hold the impact still.
  The hit sound is limited to one request per tick and one start per 260 ms
  under the shared horde budget. Placing and breaking have separate sounds. Wave 3 shows
  the unlock hint once per visit.
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
refused with `game-over` once the game is won or lost. In campaign levels
the mark lifts the tower and upgrade limits for that run. The level’s own
specials still open on wave 1. Additional specials open on their usual Free
play waves and use the same charge. On screen, five presses on the Gold readout
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
| 11 | 33 Goblin every 0.85 s; 14 Shieldbearer every 1.5 s, delay 5.76 s; 14 Harpy every 1.1 s, delay 11.52 s | 61 | 2861 | 178 | 27.2 s |
| 12 | 35 Wolf every 0.75 s; 11 Troll every 1.5 s, delay 0.375 s; 14 Harpy every 1 s, delay 5 s | 60 | 18171 | 200 | 25.5 s |
| 13 | 39 Goblin every 0.75 s; 14 Shieldbearer every 1.5 s, delay 0.375 s; 16 Harpy every 0.75 s, delay 4 s | 69 | 4500 | 196 | 28.5 s |
| 14 | 29 Wolf every 1.48 s; 14 Troll every 2.6 s, delay 0.375 s; 17 Harpy every 2 s, delay 12 s | 60 | 30706 | 221 | 44 s |
| 15 | 14 Goblin every 1.5 s, delay 3 s; 19 Wolf every 1.7 s, delay 3 s; 19 Troll every 2 s, delay 8 s; 16 Harpy every 0.75 s, delay 9.36 s | 68 | 46378 | 266 | 44 s |
| 16 | 33 Goblin every 2 s; 20 Shieldbearer every 2.36 s, delay 2.304 s; 19 Harpy every 2.2 s; 15 Troll every 2.25 s, delay 12 s | 87 | 45820 | 343 | 64 s |
| 17 | 31 Wolf every 1.44 s; 15 Troll every 1.1 s, delay 2 s; 20 Harpy every 2.16 s | 66 | 46149 | 242 | 43.2 s |
| 18 | 23 Goblin every 1.7 s; 15 Troll every 1.25 s, delay 8 s; 9 Shieldbearer every 5 s, delay 3 s; 19 Harpy every 2.8 s, delay 8 s | 66 | 52161 | 268 | 58.4 s |
| 19 | 33 Wolf every 1.85 s; 15 Troll every 2.25 s; 21 Harpy every 2.75 s, delay 4 s | 69 | 55137 | 249 | 59.2 s |
| 20 | 8 Wolf every 1.55 s; 5 Shieldbearer every 2 s, delay 4 s; 8 Harpy every 1.65 s, delay 5 s; 6 Troll every 1.7 s, delay 9 s; 1 Grumblemaw (boss), delay 19.5 s | 28 | 45974 | 188 | 19.5 s |

Total hp and bounty are on Normal, before pack calls and the 25 clear
bonus. The twenty waves hold 1158 scheduled enemies. Wave 1 sends one
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
once in first-group order with its counts summed ("Next: 20 Collector"); a
preview too long for one 16 px line (264 px) wraps to two 13 px lines, or,
if that takes three lines, to two 11 px lines. The landscape counter fits
this logical wrap into 222 px of display width, leaving 8 px before Special. The wave 10 preview reads
"Next: 20 Hound, 15 Toll Troll, 12 Harpy, 8 Redcoat + Grumblefoot".

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
spawn schedule from waveTick 0 (the wave counter goes up), credits one
ordinary special refill, then emits `earlyCall {wave, bonus}` (the new wave)
followed by `waveStart`. Each wave pays its clear bonus once. On screen, Start Wave
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
  gold, lives, towers, kill counts, rewards and any remaining barrel wait
  are kept.
  Event `endlessStart`.
- **After that** Start Wave plays wave 21, 22, and so on. Clearing a wave
  pays the 25 bonus and returns to setup; it never sets `won`, so the game
  ends only by losing. The planning phase, the special charge (all three
  unlocked) and call early work as before, with no `last-wave` refusal.
- **Generated waves** (`waveDef(n)` in `waves.ts`; waves 1 to 20 are the
  table). For n >= 21: `k = n - 21`, `cycle = floor(k / 3) + 1`; the
  groups of table wave 18, 19 or 20 for `k % 3` = 0, 1, 2, without the bosses;
  plus one Harpy group of `min(16, 8 + 2 x cycle)` Harpies, one every 0.75
  s, starting 2 s after the base wave's last spawn. The first cycle adds 5%
  to wave 20's hp scaling. The multiplier is `1.05 x 1.8 ^ (cycle - 1)`
  (`ENDLESS_START_HP`, then `ENDLESS_HP_GROWTH` per completed cycle).
  An enemy spawns with `round(base hp x level
  multiplier x wave-20 campaign factor x endless multiplier)` (one rounding,
  half up). If the campaign and endless factors multiply to anything other
  than 1, the hp bar uses the spawned enemy's `maxHp`. Bounties,
  speeds and lives costs do not change. The 90 s spawn-window rule (R1)
  does not apply; the spawn-rate
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

| Wave | Cycle | Base | Extra Harpies | Enemies | Endless hp x | Total hp (Normal) | Bounty | Last spawn |
|---|---|---|---|---|---|---|---|---|
| 21 | 1 | 18 | 10 from 60.4 s | 76 | 1.05 | 65668 | 298 | 67.15 s |
| 22 | 1 | 19 | 10 from 61.2 s | 79 | 1.05 | 63969 | 279 | 67.95 s |
| 23 | 1 | 20 | 10 from 19.5 s | 37 | 1.05 | 27373 | 143 | 26.25 s |
| 24 | 2 | 18 | 12 from 60.4 s | 78 | 1.89 | 118696 | 304 | 68.65 s |
| 25 | 2 | 19 | 12 from 61.2 s | 81 | 1.89 | 115644 | 285 | 69.45 s |
| 26 | 2 | 20 | 12 from 19.5 s | 39 | 1.89 | 49785 | 149 | 27.75 s |

Endless hp at cycles 1, 2, 3 (Easy / Normal / Hard): Goblin 18/92/91, 33/165/163, 59/297/294; Troll 748/3791/3747, 1347/6823/6744, 2424/12281/12139; Harpy 28/144/142, 51/259/256, 92/465/460.

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
ticks. Inside one wave tick: (1) runners and flinches move as described under
Enemies. Other enemies move at `(1 - effectiveSlow)`,
stopping at the first live blocker their step reaches. All walkers attack
from the same starting set of blockers. After every walker has moved,
resolve the guards' return strikes and the walkers' combined damage.
Both sides can land their last blow. Pay guard kills as special kills,
remove broken blockers, then remove guards whose last lifetime tick has
elapsed. Their lifetime also counts down on setup ticks and freezes at
the win or loss screen. They can advance again on the next tick. Both slow
timers count down as usual; (2) enemies at the exit are removed and
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
clears the charge, retains any outstanding barrel wait, removes the zones, and goes to `setup`
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

Milestone 34. The Classic terrain is drawn in code; `npm run sim` is unchanged. The recipe is in
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
  and 3 glints; chimney smoke from the town (below); tree
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

## Looks

The title screen offers Classic and Painted. Painted is the default for a fresh browser. Test mode defaults to Classic. The game stores the choice as `tarpit.look` on this browser.
`?look=classic` and `?look=painted` set the look for a visit. The choice applies to all three maps in Free play and the campaign.

- Painted loads one ground image for the selected map and a shared atlas
  of towers, enemies, scenery and effects with its frame data. On Play it selects 2× when the
  device pixel ratio times the displayed canvas scale reaches 1.5 and 1×
  otherwise. A cold load uses 1× on a data-saving connection, on 3G or
  slower, or with an estimated downlink of 2 Mbps or less. A browser
  without a speed estimate tries the selected map’s 1× ground first when the
  screen calls for 2×. If the ground takes at least two seconds, the rest
  loads at 1×. Otherwise the high-density screen gets 2×.
  Atlas dimensions and anchors are in texture pixels and are divided by
  density for drawing in game coordinates. The service worker caches painted
  files on first use for offline play. Play shows “Loading painted art 0%”
  from the click, then the percentage of the selected files ready.
  Worker startup, the speed check and all files share one 25-second limit.
  A failure or timeout starts Classic and shows a banner until wave 1.
  Packed art loads on demand. A cold start requests three painted files, or four when it probes
  the 1× ground before loading 2×. On Meadow the 1× target is under five seconds at 1.6 Mbps down
  and 150 ms latency.
- All three grounds use the same trail width and simulation path. Meadow
  has flowering pasture, Switchback has a pale trail with a dark cut edge through dry grass and low shale shelves,
  and Riverbend has reed-lined water and a timber deck on its upper trail.
  The Riverbend spring fills the 40 water cells. The grass between its
  head and the timber deck remains buildable under the usual trail rule.
- The code-drawn Barricade sits across the painted trail in either layout.
  Held enemies use their painted sprites, grouped within 36 game pixels of
  the wall. Larger walkers draw in front of smaller ones. The wall and pile
  sort with towers and scenery by their trail positions on screen. The count
  appears beside the wall hp bar from four held enemies. On a horizontal
  stretch, that group sits 28 px toward the exit, clear of the pile. The placement marker
  and refusal text use the same rules as Classic.
- Towers use 16 clockwise headings from north. Enemies walk in four
  directions, advancing one of four poses per 6 game pixels walked. Test
  mode holds the first pose for each direction. The ground turns with the
  portrait map and the pieces stay upright, with their headings turned a
  quarter turn. The ground anchor sets both placement and draw order, so
  a piece nearer the bottom of the screen covers one behind it. Flyers
  draw above walkers.
- Painted omits the name label and its “+” on placed towers. A gold ring
  over the base marks levels 2 and 3. At level 3, a gold diamond marks
  path A and paired cyan dots mark path B. Placed towers
  turn to aim. The six build buttons and the placement ghost show the
  same southeast bearing (atlas frame 6) in both layouts. Build images fit
  within 32 × 22 px in landscape and 46 × 38 px in portrait. Landscape
  names and prices use 14 px text, or 13 px in the compact bar. Buttons
  retain their price and hit area. The tower panel, reward icons and special icons are shared
  with Classic.
- The King's collectors wear red and gold. The green goblin wears a tricorn
  and carries a coin satchel. The grey-brown hound has a pale muzzle and a
  red studded collar. The Redcoat carries a crown shield, the Harpy carries
  a sealed writ, and the Toll Troll has tusks and swings a striped gate bar.
  The orange Assessor wears a
  short maroon coat and carries a ledger. His horns flank his powdered wig,
  and two tusks rise from his square jaw. The King wears a crown and
  fur-edged cape and carries a sceptre. The exit town flies its blue coin flag until it is taken.
- Each painted squad keeps its four blue-clad townsfolk in squad order
  throughout the fight: Axeman, Swordsman, hooded Archer and Captain.
  All four strike within arm's reach. Classic uses its original guard drawing.
- Ground enemies use a feathered contact shadow. Towers stand on discs.
  In play, a turning walker blends its old and new compass views over
  100 ms with both views on the same stride. The Harpy spans at most
  42 game pixels including its outline (1.31 cells). Its talons sit
  5 px above the art anchor and the sprite floats another 3 px above the
  trail, plus its existing bob. Its separate shadow stays on the ground.
- Hurt enemies have a 30 × 4 px health bar 4 px above their painted
  silhouette, with a 1 px dark outline. Bars leave at least 1 px between
  outlines. A healthy walker also gets a bar when a foreground
  silhouette more than 30% larger by bounding-box area covers its centre.
  Boss health stays in the HUD.
- The painted cave sits 22 px along the trail from the spawn, opening to
  the right in landscape and down in portrait. Its two golden eyes blink
  on the living map's clock. The town chimney emits four puffs on a 4.8-second cycle.
  Test mode and reduced motion hold the open eyes and smoke at time zero.
  Painted omits cloud shadows to keep the ground shading visible.
- A valid Painted placement has an ivory fill and rail inside a charcoal rim.
  A blocked cell has a coral fill and rail with a charcoal X. The magnifier
  shows the same marker. Painted tar uses a 70% base fill and the fire zone
  has a 6 px dark stroke beneath its 3 px flame-coloured rim.
- During the 80 ms hit flash, the enemy's current Painted pose mixes 28% white
  into each coloured pixel and keeps its original opacity. Both poses brighten
  during a turn. In test mode the hit flag still lasts one tick.

## The town and the story

The town occupies part of the four cells already refused beside the exit.
All three maps use columns 28–29 (zero-based). Meadow uses rows 4–5,
Switchback and Riverbend rows 10–11. The last 22 px beside the road's
centreline stay clear. A cottage, fence, flag and residents fit in 62 × 42
game pixels in landscape. In portrait they stand upright in a separate
42 × 62 arrangement. The town draws below towers, walkers and health bars.

Campaign conditions use the star boundaries. In Free play the boundaries
are 18/20 (90%) and 12/20 (60%) of starting lives, rounded up to a whole
life. The high and middle boundaries are 32 and 21 on Easy, 18 and 12 on
Normal, and 14 and 9 on Hard. Zero or fewer lives always means taken.

| Condition | Painted town |
|---|---|
| Untouched | Tall blue coin flag, intact fence, lit windows, residents outside, light chimney smoke |
| Scuffed | Broken rail, blue sailcloth roof patch, one neighbour outside, dusty smoke |
| Battered | Blue flag at half height, damaged fence, shuttered window, residents indoors, thick smoke |
| Taken | Red crown banner over the battered town |

Classic uses a flat cottage, coloured window, raised or lowered flag and
state-dependent smoke. Crossing a boundary raises a brief puff of dust.
A collector that reaches the road end carries a coin sack out of the
town square. Its diameter is 10 + 4 × √(lives cost) game pixels and its
flight lasts 720 ms. Reduced motion shows the purse at a fixed point on
the route. Sacks draw below enemy health bars and remain inside the map.
On a win, the people come outside with hats in the air and the blue flag
at full height, even when the fence needs mending. On a loss, the red
crown banner rises. The result appears immediately. Test mode and reduced
motion hold the finished pose. These drawings read the simulation without
changing placement or combat.

The result paper has a dedicated 2:1 illustration of the condition in
which the town finished. Its 480 × 240 colour plate loads on demand. A
printed silhouette fills the space immediately and stays available offline.
The picture sits to the left of the results in landscape and above them
in portrait. A 38% veil keeps the town on the battlefield visible.

All twenty campaign cards print the King's notice. Wins print the town's
reply in blue. Losses print the Crown's thanks in red. The opening
proclamation and reply precede the first map. Winning level 10 keeps
“The King went home with empty pockets.” and adds “He will be back with
new ideas.” The first visit to Act Two shows the King's new-tax notice
and the town's reply. Continue opens the requested map or level card.

The full Ending follows a level 20 win when the player chooses Level map
or Play again. Continue carries out that choice. The first rendered frame
of each broadside records `opening`, `secondAct` or `ending` in
`tarpit.seenBroadsides`, beside the tips record. A returning player who saw
the same Ending at level 10 keeps that receipt. Level 20 still shows
“Campaign complete!” and goes straight to the chosen destination. A denied
write falls back to the current session. Rotation preserves the page and
the destination.

## Showpiece (experimental)

Open `?look=showpiece` and play campaign level 1 or Free play Meadow. The
title still offers Classic and Painted. Other levels and maps use Painted.
The optional renderer and one matching-density farm atlas load on Play.
An unavailable experiment gives way to the already-loaded Painted field
after at most eight additional seconds. The URL leaves the saved Look alone.

The mill, apiary and pasture change from morning to lamplight over the
waves. Workers head inside when the collectors arrive. Crews follow their
tower's firing cycle. Spent arrows, craters and dropped finery share 64
reusable marks. Traffic darkens 40 short stretches of the trail. These
layers yield to placement, zones, combatants and health bars. The first
arrival draws the map up to 4.8% closer for 2.3 seconds. Artillery gives
a short kick. The HUD stays still and map input follows the displayed view.
During tower placement, scenery fades to 12% opacity. It returns when the
pick or drag ends. A piece overlapping a new tower fades out with a dust
puff, and returns when the footprint is free. These fades take 300 ms.
Reduced motion and frozen test mode show the settled state immediately.

The pasture's daylight also falls on the exit town, its people, sacks and
banner. The townsfolk toss their hats while fireworks open over the field.
All showpiece motion uses the map's unscaled play clock. The show's result
screen keeps Pause available for the celebration and the banner hoist.
Resume continues the same pose. The detail governor excludes paused time
from its cooldown and skips the first two frames after Resume.

Detail starts high. A 750 ms window averaging over 20 ms per frame lowers
it one tier. To gain a tier, consecutive windows must average under 17.5 ms
for at least 10 seconds. The first drop also blocks recovery for 30 seconds.
Each further drop in the same game doubles that wait, including after a
rotation. Farm details fade across each tier boundary over 300 ms.
Scenery normally refreshes once per 120, 65 or 32 ms at low, medium or
high detail. Fades refresh at 32 ms. Building or changing waves triggers
an immediate update.
Test mode holds the scene still. Reduced motion keeps the lighting cues
and grounded poses. With the switch, `window.__tarpit.showpiece()` reports
the active tier (0–2) and mark count. Adding `&perf=1` displays the tier
and records drawing costs. Benchmarks can add `&showpieceTier=0`, `1`
or `2` to hold that tier.

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
  page or a paused game stops every voice and suspends the context.
  The title can resume sound on becoming visible. A hidden game stays silent
  when it returns, including through mute changes, until the player resumes
  or leaves the run. Without Web Audio, or if the context fails, the game is
  silent with no error. Phaser's own sound manager is off
  (`audio.noAudio`), so it makes no context. Sounds play only while the
  context runs and the page shows.
- **Test mode** (`?test=1`): the engine is installed disabled; nothing is
  created and nothing plays (the mute setting and M still work).
- **Mute.** A speaker drawn in code (two waves when on, a red cross when
  muted). Mute sits beside Pause during play, 42 × 42 in landscape
  and 70–80 px square in portrait to keep Pause at least 44 CSS px at both tested heights. In the title’s top right corner it is 42 × 42
  in landscape and 70 × 70 in portrait. The M key toggles it anywhere (in the README and
  `audio().hint`; no hint is drawn on the button, where it was too small
  to read). Muting sets the mute gain to 0 at once and stops every voice;
  unmuting during play sounds a tap. Stored in `localStorage` under `tarpit.muted` ("1"
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
  (960 x 480) and two HUD rows underneath. An 80 × 80 Pause plaque at
  (876, 490) spans the right end of the counter. Immediately to its left,
  speed sits above mute, each 42 × 42 at x=828. Special and Start Wave
  keep their 100 and 130 px widths at x=586 and x=692. Landscape tower
  buttons start at x=6 and measure 132 × 42 with 4 px gaps.
- **Portrait** uses a centred 480 x 1194 canvas in Free play and untaxed levels. A held reward adds the side rail described above. From the top: a 76 px status strip
  (gold, lives, wave and level tag in one row, "cheat used" at its right
  end, the next-wave preview on up to two lines under them), the map
  turned a quarter turn clockwise (480 x 960, spawn at the top, cottage at
  the bottom), then the controls: a row of the six tower buttons (75 x 70,
  each the tower's map shape over its cost, because a name at 18 px does
  not fit 75 px) and a lower row with Special, Start Wave, speed, mute and Pause.
  Both rows have 5 px outer margins and 4 px gaps. Of the 470 px inner
  width, Special uses 108 px and speed uses 70 px. Mute and Pause are
  matching squares centred on the row. They use 70 px at 390 × 844 and
  80 px at 390 × 664 to keep Pause at least 44 CSS px. Start Wave takes
  the remaining 136 or 116 px. Its 23 px label wraps to two lines when
  needed. Call next shows its bonus on the second line. A blocked call
  shows its reason alone. The boss warning reads “Boss next” in both layouts,
  with one word per line on the phone. Tips, unlock hints and cards use the
  same control names “Special” and “Start Wave” printed on the HUD. Special has a status dot
  and shows the seconds remaining while recharging. At 390 × 844 the row
  labels retain at least 12 CSS px. At 390 × 664 Special and wave labels
  retain at least 11 CSS px and speed retains at least 12 CSS px.
  The next-wave preview starts at y=28. Two 23 px lines fit above the brass edge at y=74. At 390 × 844 the 20 px type reads at 14.1 CSS px and a 70 px button measures 49.5 CSS px.
  On a 390 x 763 CSS px phone (standalone, inside the safe areas) the
  canvas fits at 0.639: buttons are 44.7 CSS px, 20 px text 12.8 CSS px and a
  map cell 20.5 CSS px. With Safari's bars (390 x 664) the scale is 0.556:
  buttons 38.9, text 11.1 and cells 17.8 CSS px.
- **Taxed portrait levels** use a 480 × 1232 canvas. The 108 px status strip
  has a row for gold, lives, wave and level, a row for taxes and the cheat
  mark, then two 24 px preview lines starting at y=58. Stats, previews and
  tower prices use 21 px type. The tax names and tower tally use 23 px.
  When the cheat mark is visible, the tax row lists names only and the build
  bar shows the permit count. Aiming uses the preview space for the action and
  its touch or mouse hint. The map still measures 480 × 960. Both control
  rows are 73 px tall with 2 px outer margins. Tower plaques are 76 px
  wide with 4 px gaps. The lower plaques have 2 px gaps, a 115 px Special
  and a 73 px speed button. The two icon buttons grow from 73 to 82 px at
  the shorter phone height. The wave plaque takes the remaining width.
  Blocked calls and call bonuses use 21 px type with at least 1 px at each
  side. “Last wave” also takes two lines. Special reserves 19 px for its
  left inset and status dot. At 390 × 664 all HUD labels measure at least
  11.1 CSS px, with 12 CSS px for taxes, the tally and speed. At 390 × 844
  the minimum is 12 CSS px.
  The boss name and HP use 21 px type in 28 px boxes. On a feat result,
  23 px text and 82 px buttons keep the controls readable and tappable
  at the shorter height.
- **The transform.** `src/game/layout.ts` owns every world-to-screen and
  screen-to-world conversion. Portrait: screen x = 480 - world y, screen
  y = status strip height + world x (world x runs down the screen, world y right to left).
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
  (280 x 70). The Free play picker stacks the title, the difficulty row (144 x 70), the map
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
  A paused run carries its paused clock into the rebuilt scene. The panel
  reopens with Resume selected and a fresh Restart confirmation.

- **Pausing.** Setup and an active wave can both pause. The fixed-step
  accumulator keeps its remainder. Simulation ticks, recharge, effect clocks,
  enemy animations, particles, tweens and scene timers freeze. Resume counts
  only active time. A 3× hold returns to its previous speed. A build pick,
  tower panel, drag or special aim clears without spending a charge or gold.
  While the panel is open, only its actions and mute accept input.
  Pause puts away a reward offer and restores the same choices on Resume.
  A boss banner continues from the time at which it paused. The tips and
  ordinary result screens keep their own controls and ignore P.

## Touch and phones

Milestone 35 (`src/game/pageLock.ts`, `src/game/touchAssist.ts`). Mouse
input never goes through any of this: placement and selection with a
mouse stay exact in every layout.

- **Leaving play.** When the document becomes hidden or the browser sends
  `pagehide` (including a phone lock), a running game opens Pause. Becoming
  visible leaves the panel up until the player acts. A window blur with a
  still-visible page releases interrupted holds. Frozen browser tests can
  opt into automatic pause with `?test=1&autoPause=1`. Both live play and tests
  expose `window.__tarpit.paused()`, `pause()` and `resume()`.
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
  whose scope is exactly its base. On first install, the worker reuses
  content-hashed core assets already in the HTTP cache. It fetches fresh
  copies of the other core files and reloads all core files on update.
  Install then calls `skipWaiting`. Activate deletes every
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
  answer is returned as it is; a 2xx answer is kept. Painted art is
  fetched this way at the density in use and is then available offline
  for that density in this build.
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
  trail order. When a pass fills, repeat the walk excluding all cells already used. **greedyMusket** uses the
  first pass and upgrades each Musketeer before buying the next.
  **longbowSpam** buys base Longbows on the first pass. The trail order
  walks the path in 96 px steps from 96 px and takes, at each step, the
  nearest free buildable cell within 72 px.
- **comboBuild** opens with two Longbows. Meadow buys 31 opening actions,
  buying its third bow at (15,6) before the first Tar Pit and Fire Pot. Switchback buys 15, with bows at
  (14,7), (18,7) and (20,7) covering the folded lanes. Riverbend buys 31,
  with the first Tar Pit at (12,4) and bows at (10,6) and (12,6).
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
  already covers the boss approach with its existing Mortars. Each Hard plan buys Siege Shell for its first Mortar. Riverbend also specializes its Mortar at (17,7) at the start of act 2 and turns to reinvestment after its artillery purchases.
- **Act-2 spending.** In every setup after the fixed purchases, buy the cheapest affordable second upgrade on an owned level-2 tower (path A for each type, cell order breaks ties). Otherwise upgrade a base tower of the main type or build that type on the next free trail cell. Combo, wide and Hard make one reinvestment purchase per setup until the last campaign setup, when they spend their reserve. The artillery, burn and musket specialists spend up to 180 gold per setup, allowing their first affordable purchase even when it costs more. They also spend their reserve before the boss. After losing at least three combat lives in one wave, the combo, wide and Hard references may spend up to 425 gold in the next setup. The Stone Walls grant is excluded when counting losses. Hard buys Longbows. Combo and wide buy Longbows on Meadow and Switchback. On Riverbend combo buys Tar Pits and wide buys Cannons. Artillery buys Mortars, burn buys Fire Pots and musket buys Musketeers. Wide skips all second upgrades. The fixed-only control stops after the identical fixed plan.
- **endlessIdle** and **endlessGreedy** play the same reinvesting combo throughout the campaign. Idle stops buying at victory. Greedy invests in Siege Shell Mortars, buying the branch wherever it is available before upgrading or adding another Mortar. Both keep using specials.
- Meadow only (they throw for another map): **soundBuild** (Musketeers, Cannons and a Tar Pit),
  **soundBuildNoTar** (its Tar Pit cells removed), **comboStrongest**
  (every tower set to Strongest).
- **artilleryBuild** keeps four opening bows, then buys three Cannons and two Mortars in alternation. **musketBuild** keeps two opening Mortars and adds four Musketeers on Meadow and Switchback, two on Riverbend. Both specialize the first new gun before expanding.
- **burnBuild** keeps up to three opening Mortars and adds a Fire Pot, Tar Pit and Fire Pot in that order. On Switchback they cover the folded lanes from (9,4), (13,10) and (15,11). All three specialists use the combo's specials policy.
- **Cluster special** (`clusterSpecial` timed action): fire the first
  unlocked of Fire Arrows, Tar Barrel, Powder Keg at the centroid of the
  densest cluster of live enemies within 70 px of a live enemy.

The check-only **comboBarricade** buys from the same plan as comboBuild.
With the charge ready and no wall standing from wave 3, it places a wall
on Meadow at (420,312), Switchback at (368,288) or Riverbend at (322,96).
These chokes lie in reach of the plan's splash weapons. Otherwise it uses
the existing firing policy. All original archetypes use their original specials.

**The special policy** (`src/sim/specialPolicy.ts`): how every archetype
that fires specials fires them, on every map and level, the way a person
would. It looks every 30 wave ticks while the charge is ready. Candidate
points lie every 30 px along the path; a point works for a special if its
circle catches at least 3 enemies. If a Troll or either boss is in a crowd,
the Tar Barrel and Fire Arrows take turns (Tar Barrel first; before wave 7
the Tar Barrel takes every turn), fired at the working point with a big
one inside. Otherwise, if a point works for the Powder Keg, the keg is
thrown there. Otherwise it waits. The best point catches the most enemies;
ties go to the point nearest the exit. The simulator also measures the combo
with each special omitted in turn. The unused-barrel control spends the full
barrel recharge at every barrel opportunity, with the same wave-start credit,
and advances the alternating turn. During the shared wait the policy holds
its next turn. It checks the crowd again on its first eligible look.
When the policy omits Tar Barrel or Fire Arrows,
the other takes its turn. The headless recorder fires each choice and writes it into the
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
- **N4** The reinvesting combo wins Normal.
- **S1** With default rewards and specials, it wins with 9 to 15 lives.
- **S2** The combo loses lives on at least three act-2 waves, at most four on any wave. The Hard plan on Hard also loses lives on at least three waves, at most five per wave.
- **S3** In balance tests, scale act-2 spawn HP by 0.95 and 1.05 before rounding. Both perturbed campaigns must win. Final lives must stay within four of the ordinary Normal combo and within five of the ordinary Hard plan on Hard.
- **V2** Its fixed plan loses in act 2 or wins with at least five fewer lives.
- **S4** The reinvesting wide build wins within five lives of the combo and buys no second upgrades.
- **V4** Lazy wins Easy with at least eight lives, loses Normal in waves 7–14 and loses Hard by wave 8. The Hard plan wins Hard with at least three lives.
- **V5** The Normal combo and the Hard plan on Hard both kill Grumblemaw. An exit costs ten lives.
- **S7** All 27 reward combinations win. For each offer, hold the other two picks fixed in each of their nine combinations. The best and worst choices finish within six lives.
- **V7** Meadow meets all four campaign timing and wave-shape targets.
- **P1** For each tower, comboBuild and that tower’s specialist compare A and B on all three maps with default rewards and specials on Normal. The paths finish with different lives in at least one of the six comparisons. Each path wins or ties the lives comparison at least once. For the Tar Pit, each path must win outright on a different map (milestone 49 R1).
- **P2** Every one of those A/B gaps is at most nine lives.
- **P3** The two paths trade places between a lone Troll and ten Goblins in the combat examples.
- **P4** At equal gold each tower has a path that beats another level-2 copy by at least one life, and at least one comparison in which the copy wins or ties.
- **S5** On each map, comboBuild wins with specials. If comboNoSpecials wins, it finishes at least three lives behind. If it loses, it reaches wave 17 or later.
- **S6** Removing Fire Pots can gain at most one life per map. Keeping them gives the combo more lives on at least two maps.
- **N7** noAntiAir lets at least half of wave 4's Harpies exit and loses
  by wave 12.
- **N8** oneMusket lets at most 6 of wave 1's enemies exit.
- **S9** On Meadow, soundBuild outlasts soundBuildNoTar, measured in simulation ticks.
- **N9** On Meadow, the combo fires at least 30 specials and at least 80% catch three or more enemies.
- **N10c** Each reward is strictly best among its offer on a named build,
  map and difficulty (Normal or Hard), ranked by lives then kills.
- **N10d** Each reward changes lives or defeat wave for at least three
  distinct build/map pairs. Difficulty alone does not create a new pair.
  Both runs play the same build. The comparison neutralizes just the
  selected effect and keeps the other two picks active. Purchases respond
  to each run’s own gold, and the normal pick action runs in both games.
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

- **S8** After the Normal combo wins, the idle build loses on the second through sixth endless wave. Continued reinvestment lasts at least two waves longer and loses by the fourteenth endless wave. Every measured endless run ends below the safety cap.

The campaign wave rules R1 to R4 hold too.

Barricade checks:

- **K1** The original Barricade change preserved the Free play report byte for byte. Milestone 49 re-locks the report for the new Tar Pit path B.
- **K2** On Normal the Barricade combo gains at least one life on two maps and loses at most two on any map.
- **K3** On each map, run one campaign per legal trail distance on a 48 px grid starting 64 px from spawn. Use comboBuild's tower plan on Normal and Hard and place a Barricade at that campaign's point whenever the shared charge is ready from wave 3, even if a wall still stands. The best point gains at most six ending lives over comboBuild. No point turns a Hard loss into a win. Walls alone lose by wave 4, including a full-lives start at their unlock wave.
- **K4** Each lone boss destroys a full wall within 120 ticks. In a paired continuation from actual Grumblemaw contact, the wall delays his exit by at most 300 ticks. Both branches retain all towers and recorded casts and let him survive lethal damage so the exit can be timed.
- **K5** Ten Goblins arriving together deal one hp per tick and break the wall on tick 324.
- **K6** A Harpy takes the same number of ticks to reach the exit with or without a wall.
- **K7** A wall spends the shared charge. Quick Hands shortens recharge. A second placement in the same tick is refused.

Guards checks:

- **G1** The original Guards change preserved the milestone 39 report and all nine comboBuild end states after accounting for the new blocker representation. Milestone 49 retains the six Meadow and Riverbend state locks and re-locks the three Switchback states that bought a path B Tar Pit.
- **G2** Play a separate campaign at each legal point on the Barricade's 48 px trail grid. Follow the comboBuild tower plan and use every ready charge for Guards from wave 6. On Normal and Hard, no point may gain more than five lives over comboBuild or turn a Hard loss into a win. On at least two Normal maps, a point must gain at least one life.
- **G3** With no towers, squads must lose by wave 8 on every difficulty, including a fresh full-lives start at the unlock.
- **G4** Check the exact ticks and remaining hp for lone Goblin, Wolf and Troll fights, a crowd of ten Goblins, and expiry during contact. Neither boss may lose more than 180 ticks crossing a squad.
- **G5** Flyers keep their original travel time. With both a squad and a wall on the trail, the first blocker reached takes the contact.
- **G6** Guards spend the shared charge. Quick Hands changes only recharge. Even an early call cannot fund two casts on one tick.

### Known weaknesses

The following observations and measured matrix are the accepted milestone 49
reference. Milestone 50 measurements are in `DEVLOG.md` under “Milestone 50”.

- Giving every zone turn to Fire Arrows earns 17 lives on Meadow and 20 on Riverbend. The alternating policy earns 14 on each map.
- The largest Tar Pit path gap is seven lives. Deep Tar leads the Riverbend burn build 9 to 2. Feathers leads the Riverbend combo build 16 to 14.
- The Meadow Normal combo takes 1,316.5 s at 1x, just 3.5 s under the 22-minute limit.
- Before milestone 49, a player who replaced a broken Barricade and spent spare charges on other specials could win Switchback Hard with comboBuild's tower plan. At trail distance 1168 this policy finishes with eight lives. K3 measures spending every available charge on the wall from wave 3.

## Measured matrix

The milestone 37 “Closing pass” in DEVLOG records the Normal results.

`npm run sim` ends with this table. “W 13” means a win with 13 lives.
“L 8” means defeat on wave 8. The endless rows count from campaign wave 1.

| Archetype | Meadow easy | Meadow normal | Meadow hard | Switchback easy | Switchback normal | Switchback hard | Riverbend easy | Riverbend normal | Riverbend hard |
|---|---|---|---|---|---|---|---|---|---|
| noTowers | L 2 | L 1 | L 1 | L 2 | L 1 | L 1 | L 2 | L 1 | L 1 |
| oneMusket | L 3 | L 2 | L 2 | L 3 | L 2 | L 2 | L 3 | L 2 | L 2 |
| lazyBuild | W 33 | L 8 | L 2 | W 37 | L 8 | L 2 | W 31 | L 8 | L 2 |
| greedyMusket | L 18 | L 8 | L 2 | W 22 | L 12 | L 2 | L 18 | L 8 | L 2 |
| longbowSpam | L 10 | L 8 | L 7 | L 15 | L 8 | L 8 | L 10 | L 8 | L 7 |
| noAntiAir | L 8 | L 5 | L 5 | L 8 | L 5 | L 5 | L 7 | L 5 | L 5 |
| comboBuild | W 39 | W 14 | W 3 | W 39 | W 11 | L 19 | W 39 | W 14 | W 1 |
| wideBuild | W 39 | W 13 | W 1 | W 39 | W 15 | L 19 | W 39 | W 10 | L 15 |
| comboBuildNoFire | W 38 | W 13 | L 8 | W 39 | W 10 | L 10 | W 37 | W 12 | L 7 |
| comboNoSpecials | W 39 | W 8 | L 7 | W 39 | L 18 | L 9 | W 38 | W 3 | L 3 |
| hardBuild | W 39 | W 20 | W 9 | W 39 | W 21 | W 15 | W 39 | W 21 | W 8 |
| artilleryBuild | W 39 | W 20 | W 7 | W 39 | W 24 | W 14 | W 39 | W 6 | L 10 |
| burnBuild | W 39 | W 15 | W 4 | W 39 | W 24 | W 14 | W 39 | W 9 | L 15 |
| musketBuild | W 39 | L 19 | L 16 | W 39 | W 24 | W 14 | W 39 | L 18 | L 15 |
| endlessIdle | L 37 | L 25 | L 24 | L 36 | L 25 | L 19 | L 36 | L 25 | L 24 |
| endlessGreedy | L 40 | L 28 | L 27 | L 39 | L 27 | L 19 | L 38 | L 27 | L 27 |
| soundBuild | L 15 | L 7 | L 2 | - | - | - | - | - | - |
| soundBuildNoTar | L 10 | L 7 | L 2 | - | - | - | - | - | - |
| comboStrongest | W 14 | L 5 | L 3 | - | - | - | - | - | - |

## Levels and campaign

A level has a numeric id, map id, a finite list of wave groups, starting gold
(100–300), enemy HP scale, first HP growth wave (or none), allowed towers,
maximum tower level, allowed specials and reward waves.
Names, notices, town replies and twist lines are keyed by id in `src/game/names.ts`. Combat, enemy
stats, prices, upgrade paths, reward effects and special effects are shared
with Free play. HP uses the Normal base. Starting at the first growth wave,
each successive wave adds another 28% of that scaled base. The campaign gate
checks nominal HP before varying it in the L3 and L6 trials. Each wave uses the
level’s HP rule with no separate wave multiplier.

Up to three ascending reward waves use the three existing reward menus in order.
An allowed special opens on wave 1. Tower, upgrade and special restrictions
are checked before a purchase or cast changes the game. Clearing the last
wave wins. Every level starts with the same life count. A loss earns zero stars.
The first act awards the highest star count whose life minimum is met.

| Starting lives | Minimum lives for two stars | Minimum lives for three stars |
|---:|---:|---:|
| 20 | 12 | 18 |

Level 1 starts open. Open levels form a contiguous prefix. A saved win
beyond a gap counts toward unlocking the following level after the player
fills the gap. A gold-cheat win counts as a pass with zero stars. Replay
keeps the best stars, including after a cheated win. The browser stores
passes and stars in version 2 of `tarpit.campaign`. It also reads stars
earned in version 1. If storage fails, progress lasts for the page session.
Free play keeps its own score table.

### Taxes and skill stars

Levels 11–20 use the full arsenal at tier 3, all five specials, 20 starting
lives and a fixed HP scale. Each has one or two taxes. Free play and the first
ten levels use their original rules.

| Tax | Rule |
|---|---|
| Window Tax | Pay the base price plus the nearest whole gold to base × rate × previous towers built. Sold towers still count. Upgrades and moves are exempt. |
| Frozen Purse | Kills pay zero. Each cleared wave pays the listed lump in place of the standard clear payment. Calling early still pays the lump and the early-call bonus. |
| Forced March | Multiply every collector’s movement speed by 1 + rate, including flyers, bosses and summoned packs. Slows and blockers operate as usual. |
| Curfew | Multiply maximum reach by 1 − rate, including both upgrade paths and range boons. The Mortar keeps its 70 px minimum. |
| No Loitering | After a clear, the next wave starts when the stated number of seconds of setup has elapsed. The clock waits for a reward choice. Players can start sooner and can still call a wave early during combat. Both the opening and the final wave wait for the player. |
| Rationing | The cap counts towers standing. A sale frees a place. Upgrading uses no place. |

| Tunable rate or delay | Minimum | Maximum |
|---|---:|---:|
| Window Tax | 0.05 | 0.1 |
| Forced March | 0.15 | 0.25 |
| Curfew | 0.1 | 0.2 |
| No Loitering (seconds) | 8 | 15 |

A win earns one star and finishing with at least 12 lives earns two. A third
star on a feat level also requires the named feat. **Not a penny** requires
zero escaped enemies, including before any Stone Walls reward. **Bare hands**
requires zero successful special casts. **Few hands** limits successful tower
builds across the whole run, including towers later sold. Moves and upgrades
are exempt. Saved stars keep their previous meaning and the best result wins.

### Bot decisions

- All three bots buy between waves, use the live gold balance, and start each wave normally. None sells, calls early or reads a later wave.
- **Good** scores affordable placements and upgrades by the extra damage and slowing they provide per gold along the trail, sampled every 24 px. It uses the next preview's counts of flyers, small walkers and heavy enemies. It favors earlier coverage, overlaps for splash and tar/fire, and new air coverage where little exists. After two towers it favors the first Cannon against crowds, Mortar against heavies, Tar Pit, and Fire Pot alongside tar. Repeated types receive a diminishing placement score. It compares both second-upgrade paths. Good spends its opening gold and keeps 30 gold in later setups.
- Good scores each offered reward and takes the first highest score. On menu one it counts two points per Cannon or Mortar for Long Barrels, one per Longbow for Keen Arrows, and four for War Chest. On menu two it counts slowing towers plus Tar Barrel for Sticky Tar, twice the number of burning towers plus two for Fire Arrows for Hot Coals, and three for Quick Hands if a special is available. On menu three Stone Walls scores five (twelve at four lives or fewer), Veteran Crews scores one third of the tower count, and Bigger Blasts scores the artillery count plus one for Powder Keg.
- Every 30 wave ticks Good applies the existing crowd policy for keg and zones, limited to available specials. It also checks for at least three walkers approaching a legal blocker position 50–140 px ahead, covered by a tower. A splash tower adds one to the blocker score. A blocker must beat the current cast's hit count, and its kind must be absent from the trail. Guards get the first blocker tie.
- **Person** uses Good’s purchase scores and reward choices. For the chosen tower type, successive placements rotate through the first, second and third highest-scoring cells. During combat it makes at most one decision per three seconds. It acts 1.5 seconds after each charge becomes ready, including the opening charge. If the next wave opens before another look is due, it repeats the previous opening cast at the charge deadline. Its candidate points are centres of 48 px cells along the trail. It prefers Good’s qualifying cast, then a cast covering fewer enemies, then a legal cast even on an empty trail.

- **Feathers-forced Good and Person** keep the ordinary player’s shopping,
  cast opportunities and aim grid. Each buys Feathers whenever it buys a Tar
  Pit path. Where the barrel is available, it aims for the largest eligible
  crowd at that opportunity. C6 compares each outcome with ordinary Good
  and permits at most four additional lives and no additional third star.

- **Beginner** spends on the cheapest allowed tower in the map's trail-cell order. When it cannot place another, it can buy one affordable upgrade, taking path A at the second upgrade. It takes the first reward and uses no specials.

In Normal Free play, Good must win or lose on each map the same way as
comboBuild. Both win on all three maps. Good finishes with 20 lives on each.
ComboBuild finishes with 14 on Meadow, 11 on Switchback and 14 on Riverbend,
so Good's largest lead is nine lives on Switchback.

Person also wins all three Normal maps, with 20, 20 and 19 lives respectively.
Campaign stars are calibrated to a capable builder with slow hands. Person uses
Good’s purchase optimiser and finishes Burn Line with 16 lives to Good’s 13.
Beginner is the only measure of weak play. Real players decide whether the
star targets feel right.

On feat-bearing or taxed levels, after the opening, Good spends 0.5 seconds
per purchase and Person and Beginner spend 3 seconds. A wave can start while
they are deciding. Each starts manually once shopping finishes. Tax removal
trials keep this same clock. With Frozen Purse the capable bots spend available
funds without holding the usual 30 gold in reserve. In feat mode each bot keeps its usual timing, aim, reward and placement choices. It forgoes
specials for Bare hands, stops new builds at the Few hands limit, and uses
its ordinary leak-prevention strategy for Not a penny.

### Acceptance

The level record can declare an ending boss. A separate context names the introduced mechanic and the difficulty band. Each band sets the acceptable star counts and whether Person must win with specials disabled.

| Band | Good minimum | Person minimum | Beginner minimum | Beginner maximum | Win without specials |
|---|---:|---:|---:|---:|---|
| intro | 3 | 2 | 1 | 3 | yes |
| middle | 2 | 2 | 0 | 2 | yes |
| transition | 2 | 1 | 0 | 1 | yes |
| late | 2 | 1 | 0 | 1 | no |
| finale | 2 | 1 | 0 | 1 | no |

| Gate measure | Accepted values |
|---|---|
| Level duration (minutes) | 4–9 |
| Campaign average (minutes per level) | 6–8 |
| Waves per level | 5–10 |
| Nominal HP scale | 0.85–1.35 |
| Starting gold | 100–300 |
| Finale lives | 12–16 |
| Last scheduled spawn (seconds), maximum | 90 |
| Enemies alive, maximum | 40 |
| Opening enemies, maximum | 60 |
| Closing enemies without a boss, minimum | 20 |
| Person deficit behind Good, maximum lives | 6 |
| Feature advantage for Good, minimum lives or a star | 2 |
| Feature advantage for Person, minimum lives | 1 |
| Mean lives drop, minimum | 3 |
| L3 HP factors | 0.98–1.02 |
| L3 starting gold offsets | -10–10 |
| L6 HP factors | 0.95–1.05 |
| L6 starting gold factors | 0.85–1.15 |
| T1 minimum lives gained by removing one tax, or one more star | 3 |
| F3 minimum lives saved by specials on Bare hands | 3 |
| F3 minimum extra builds above the Few hands limit | 3 |
| V1 maximum stars with one tower type | 1 |
| L1m new-level minimum spare lives above the two-star line at a nudge | 1 |
| S1 comparison stops before the second act | 3 |
| S1 minimum drop in Person’s mean lives | 1.5 |
| S1 maximum drop in Person’s lives between adjacent second-act stops | 5 |
| R6 maximum extra lives for the feather bot over Good | 3 |

- P1 checks Person’s stars and surviving lives against Good. P2 runs Person with an empty list of allowed specials. The two bands that allow a loss still report that run.
- L1 and L2 apply the Good and Beginner star limits in the band table. L1m requires Good to keep its band minimum at HP ×0.98, HP ×1.02, starting gold −10 and starting gold +10, varying one input at a time on every level.
- L3 checks the feature advantage at nominal settings and at each endpoint of the two L3 ranges, varying one input at a time. In campaign order the controls remove Cannon, Tar Pit, Fire Pot, all anti-air towers, Mortar, Barricade, Guards and Fire Arrows together, the second upgrade, then all specials. Both boss encounters keep their boss during these trials. Good must lose the nominal anti-air control. Each context declares every tower, special, tower tier and scheduled enemy type that first appears at that stop, including the opening kit. The removal trials measure the featured mechanic. A campaign fails L3 for a missing, unavailable or repeated introduction.
- L4 allows Beginner to rise at most one star between adjacent levels. Good’s lives may rise only once in succession.
- L5 checks durations at 1× without early calls. Good must stay within the peak count. R1 allows six walkers and four flyers in each sliding three-second window. Person must keep all opening lives. The closing wave must meet the enemy minimum or contain a boss, and must include any declared ending boss.
- L6 varies HP and starting gold separately at the listed endpoints, rounding scaled gold to the nearest integer. Good and Person may each move at most one star. Both must still win intro and middle levels.
- L7 checks the record and requires terminal runs with no refused actions.
- L8 checks Good’s finale lives and the difference between the first and last thirds’ mean lives. Each cohort contains the campaign length divided by three, rounded down, with at least one level. A single-level list has no mean-drop comparison.

The second act uses the late band through level 19 and the finale band on
level 20. The original level 10 keeps its finale check. L4 and L8 span all
twenty levels. The twenty-level L8 compares the first and last six stops.

- T1 removes each tax separately, leaving the other tax, feat, waves and economy in place. Person must gain at least three lives or one star at nominal and under each of the four L1m nudges.
- T2 requires Person to earn at least two stars under the taxes at nominal, and at least one at each nudge.
- T3 compares first appearances with the declared tax introduction in campaign order. A new tax must appear alone.
- F1 requires three stars for feat-mode Good at nominal and each of the four L1m nudges. Beginner must miss the third star at nominal.
- F2 rejects a level if ordinary Person or feat-mode Person earns three stars at nominal. No campaign stop may award Person an accidental feat. Ordinary Good can earn Not a penny because leak prevention is already its normal strategy.
- F3 compares ordinary Person with the same player pursuing Bare hands. Specials must save at least three lives. For Few hands, ordinary Person must build at least three towers beyond the feat limit. Not a penny has no additional F3 test.
- V1 runs Good once per permitted tower type in late and finale bands, keeping the full special and upgrade options. Each single-type run must finish below two stars. The frozen first act is exempt to preserve its shipped levels, scores and saved-star meaning. A single type earns at least two stars on eight first-act levels. Longbows pass seven, and either Cannon or Mortar passes Hold the Bend.
- L1m also applies to each new level. At each nudge Good must retain its required stars. A required two-star finish for Good or taxed Person must have at least one life to spare. Nominal star awards use the original thresholds.
- S1 compares Person’s nominal lives across the second act against the final three stops of the first act. The first new stop must leave at least as many lives as the preceding finale. The second-act mean must drop by at least 1.5 lives and no adjacent second-act drop may exceed five.

- R6 runs the feather bot at nominal settings. It uses Good’s opening until two upgraded damage towers are standing, reserving the last Rationing slot for a Tar Pit if necessary. Where the third tier is available, it buys a Tar Pit on a useful firing lane and saves for path B. Further Tar Pits also take path B. A ready barrel goes to a crowd of at least three enemies still eligible for feathers. The bot otherwise uses Good’s decisions. It may finish up to three lives above Good and may earn a third star only on a level where ordinary Good earns one. The gate reports path B towers, barrel casts and successful featherings.

### Campaign measurements

This table records the accepted milestone 49 campaign. The milestone 50
measurements and failed gate labels are in `DEVLOG.md`.

Stars/lives give each bot’s highest award and surviving lives. Time counts Good’s combat ticks at 60 Hz. Enemies includes summons. Peak is the greatest number alive after any tick.

| ID | Name | Map | Waves | Enemies | Gold | HP scale | Growth from | Max tier | Reward waves | Good | Person | Beginner | Minutes | Peak alive | Wave 1 |
|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|---:|---:|
| 1 | First Watch | Meadow | 6 | 324 | 100 | 1 | — | 2 | — | 3/20 | 3/20 | 3/20 | 5.79 | 6 | 44 |
| 2 | Pack Trail | Meadow | 6 | 225 | 100 | 1.25 | 1 | 2 | — | 3/20 | 3/20 | 1/3 | 4.51 | 17 | 6 |
| 3 | The Switchback | Switchback | 7 | 572 | 160 | 1.14 | 2 | 2 | — | 3/20 | 3/20 | 2/16 | 6.97 | 10 | 47 |
| 4 | Burn Line | Switchback | 7 | 206 | 285 | 1.35 | 3 | 2 | — | 2/13 | 2/16 | 0/0 | 6.54 | 21 | 13 |
| 5 | Wings Over the River | Riverbend | 7 | 656 | 180 | 1.27 | — | 2 | — | 3/20 | 3/20 | 1/2 | 7.79 | 12 | 25 |
| 6 | Heavy Feet | Riverbend | 7 | 331 | 270 | 1 | — | 2 | — | 2/15 | 2/14 | 0/0 | 8.41 | 10 | 56 |
| 7 | Hold the Bend | Meadow | 8 | 738 | 245 | 1.3 | — | 2 | — | 2/16 | 2/12 | 0/0 | 8.13 | 28 | 53 |
| 8 | Stand Fast | Switchback | 7 | 517 | 295 | 1.28 | — | 2 | — | 2/12 | 2/13 | 0/0 | 8.08 | 30 | 36 |
| 9 | The King's Assessor | Riverbend | 7 | 535 | 255 | 1 | 6 | 3 | 5 | 3/20 | 3/20 | 0/0 | 7.57 | 17 | 42 |
| 10 | Last Light | Meadow | 7 | 633 | 280 | 0.925 | 5 | 3 | 5 | 2/16 | 2/13 | 0/0 | 8.89 | 19 | 36 |
| 11 | Window Money | Riverbend | 6 | 326 | 245 | 0.91 | — | 3 | 1 | 2/20 | 2/14 | 0/0 | 5.91 | 23 | 21 |
| 12 | The Quickstep | Switchback | 7 | 466 | 260 | 1.14 | — | 3 | 1 | 2/19 | 2/15 | 0/0 | 6.73 | 30 | 38 |
| 13 | Eight Bells | Riverbend | 7 | 319 | 285 | 0.85 | — | 3 | 1 | 3/20 | 2/14 | 0/0 | 5.63 | 17 | 31 |
| 14 | Short Measure | Meadow | 6 | 331 | 240 | 0.93 | — | 3 | — | 3/20 | 2/14 | 0/0 | 5.53 | 19 | 27 |
| 15 | Pay Day | Riverbend | 6 | 285 | 255 | 1.08 | — | 3 | 2 | 2/14 | 2/13 | 0/0 | 5.81 | 9 | 40 |
| 16 | Three Permits | Meadow | 6 | 292 | 245 | 1 | — | 3 | 1 | 2/14 | 2/13 | 0/0 | 5.72 | 11 | 40 |
| 17 | Closing Time | Switchback | 7 | 387 | 220 | 0.94 | — | 3 | 1 | 2/20 | 2/14 | 0/0 | 6.33 | 23 | 58 |
| 18 | Three at the Gate | Meadow | 6 | 280 | 260 | 1 | — | 3 | 3 | 2/14 | 2/13 | 0/0 | 5.14 | 13 | 49 |
| 19 | The Sash Levy | Meadow | 6 | 350 | 245 | 0.94 | — | 3 | 1 | 2/14 | 2/14 | 0/0 | 5.82 | 31 | 47 |
| 20 | The Last Writ | Riverbend | 8 | 509 | 245 | 0.925 | — | 3 | — | 2/13 | 2/13 | 0/0 | 8.98 | 12 | 53 |

Good clears the first ten stops in 72.70 combat minutes, with a 4.00-life
mean drop. Across all twenty stops Good takes 134.31 combat minutes.
Mean surviving lives drop from 18.00 on levels 1–6 to 14.83 on levels 15–20.

Fractions below are shares of the base price, speed or range. The purse pays
gold, the delay counts seconds at 1×, and the cap counts towers standing.

| Stop | Window Tax | Frozen Purse | Forced March | Curfew | No Loitering | Rationing | Feat | Build limit | Feat Good |
|---:|---:|---:|---:|---:|---:|---:|---|---:|---|
| 11 | 0.085 | — | — | — | — | — | noSpecials | — | 3/15 |
| 12 | — | — | 0.2 | — | — | — | maxTowers | 5 | 3/13 |
| 13 | — | — | — | — | 8 | — | noLeaks | — | 3/20 |
| 14 | — | — | — | 0.15 | — | — | noLeaks | — | 3/20 |
| 15 | — | 80 | — | — | — | — | noSpecials | — | 3/12 |
| 16 | — | — | — | — | — | 3 | noSpecials | — | 3/12 |
| 17 | — | — | — | 0.2 | 8 | — | maxTowers | 2 | 3/14 |
| 18 | — | — | 0.18 | — | — | 3 | noSpecials | — | 3/12 |
| 19 | 0.05 | — | — | 0.1 | — | — | maxTowers | 5 | 3/13 |
| 20 | — | 80 | — | 0.2 | — | — | noSpecials | — | 3/13 |

Pack Trail builds up from three-Goblin ranks to groups of six. Heavy Feet ends with a column of 20 Trolls, which Mortars can hit on Riverbend beyond the reach of the installed short-range towers. Hold the Bend has the most spawns. Stand Fast combines shielded ground formations with air pressure. The King's Assessor sends upgraded towers against Trolls and a shielded escort before Grumblefoot. Last Light closes with Grumblemaw.

## Campaign screens

The first screen offers **Campaign** and **Free play**. Under the title it reads “Taxation is theft” and
“The King wants your gold. Keep it.” Free play opens the
map and difficulty picker. Its best scores belong to the selected map and
difficulty. Campaign shows the opening broadside on the first visit, then
opens the level map and reads the saved campaign stars.

Each act fits on one map without scrolling. Its trail crosses five stops
and returns across five in landscape. In portrait it winds down five rows
of two. The plaque beside Back names the other act. Act Two unlocks after
level 10, including a gold-cheat pass. Pressing its lock says “Win level
10 first”. A fresh visit opens the act of the next open, unwon level. After
all twenty wins it opens Act Two. Back from a card keeps the act being browsed.
Each stop shows its level number
and three star slots. The number has a fixed-height box with at least 4 px
of clearance above the stars. The map, card and result draw filled stars
for earned slots and outlines for empty slots. On a feat level, the third slot
has four points in all three views. The first open level without a win is highlighted.
Tapping a locked stop names the first open level still to win. Back returns to
the first screen. An open stop shows a card with the King's notice, level name, map,
twist, new equipment or enemies, and best stars. Act Two cards list each
tax name and amount under “In force” and print the name and task for
the third star. Notices, tax amounts and build limits read the level record.
The card measures the printed lines. If there is insufficient room for the
map and tactics, “Map notes” turns the card over and “Notice” turns it
back. Play and best stars stay available on both pages. Portrait card body
type is 26 game pixels, at least 14 CSS pixels on the 390 × 664 phone.

The first Play on each level opens a tips panel with up to three short instructions. Action words
match the input used to open the panel. A mouse builds with one click on
the square. Touch arms the square with the first tap and builds with the
second. Panel buttons ignore pointer presses until the opening pointer has
been released and at least 400 ms have elapsed since opening. Got it sits
clear of the card’s Play button in both layouts and starts the level. On later visits Play starts the level directly and Tips
reopens the instructions. Got it on a reopened panel returns to the card.
Escape returns to the card from either panel. Enter and Space activate
the selected button. Turning the device keeps the panel and its action.
Got it marks the level seen under `tarpit.seenTips`. Leaving the first
panel with Back or Escape keeps it available on the next Play. Free play skips
this panel. Test mode follows the same rules unless a test calls
`setTipsEnabled(false)` to skip first-visit tips.

The paired Remove/Sell label and refund use a 6 px inset to separate three-digit amounts. The build bar keeps every tower in its usual slot. Towers unavailable in
this level appear dimmed with a lock and cannot be selected. The tower
panel offers upgrades up to the level’s tier limit. At a campaign cap
below tier three, it shows “Max for this level” beside the kill count. From wave one, the specials menu lists the level’s specials. Wave unlock
hints appear only for specials available in that run, including extras
made available by the gold cheat.

The game shows the level number and counts waves against the level's own
length. A win shows this run's stars and lives. A gold-cheat win shows
three empty slots and explains that it saved no stars. Passing opens the
next level and offers Next level when another level exists. An uncheated
win gives the life target when lives alone determine the next award.
Act Two wins show all three slots and name the earned feat or the
requirement for a missed feat. A cheated run earns zero stars and misses
the feat. Next level opens the next card. Winning level 20 shows the
campaign-complete message. Play again restarts the same level. Level map
shows the player’s saved bests. A loss offers
Try again and Level map, with the loss reply and no feat verdict or star row.
Turning the device keeps the current screen and
level selection. Both looks use the same campaign controls.

Arrow keys move the highlight, Enter or Space activates it, and Escape goes
back. The first screen opens on Campaign, the map on the next unwon open
stop, the card on Play, and the result on its first button. On the map the
arrow keys visit open stops. Right from stop 10 crosses to 11 once unlocked.
Left from 11 returns to 10. Rotating keeps the focused stop.
