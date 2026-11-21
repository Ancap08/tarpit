# Tarpit: v4 scope and milestones (gameplay lock)

Approved by Kyle on 2026-11-21 (PR 21); extended the same day from his iPad play notes (milestones 25a to 25c). "Default" marks the coordinator's
pick; Kyle can change any of it. v4 adds the gameplay depth and replay
value, then freezes the design so the v5 art pass renders each enemy, tower
and map exactly once. Everything is simulation-first, tested, and
rebalanced with the archetype runs.

## What v4 adds

1. **Enemies that force choices.** A flying enemy that tar and splash
   cannot touch, and a shielded enemy that shrugs off small shots.
2. **A boss** on wave 10 with a health bar.
3. **Targeting modes** per tower: first, last, strongest.
4. **Difficulty levels** on the title screen.
5. **Endless mode** after a win, with a local high score.
6. **Two more maps** and a map picker.
7. **Design freeze**: `docs/DESIGN.md` becomes the frozen spec the art is
   built for; any later gameplay change goes through a new scope.

Draw-your-own-trail is decided at the end of v4 (open question 4).

## Enemies (default starting numbers; the balance milestone retunes)

| Enemy | HP | Speed | Bounty | Rule |
|---|---|---|---|---|
| Harpy (flying) | 40 | 90 | 7 | Flies over the path: Tar Pit, Cannon and Mortar cannot target or splash it; Fire Pot impact hits but its burn does not stick (no surface to burn); Musketeer and Longbow hit normally. Drawn above everything with a ground shadow. |
| Shieldbearer | 120 | 45 | 9 | Shots of 10 damage or less do half damage (Longbow base, Fire Pot impact); Cannon, Mortar, upgraded Musketeer and burn do full damage. |
| Grumblefoot, the Troll King (boss) | 4000 | 25 | 150 | One unit at the end of wave 10 (after the current wave 10 groups). Takes 5 lives if it exits. Slows cap at 30% on him. A boss health bar shows in the HUD while he lives. |

Harpies enter the wave table from wave 4 (small groups), Shieldbearers from
wave 6; the balance milestone sets counts so the existing archetypes still
land in their ranges and a build with no Musketeer or Longbow loses to the
first Harpy wave (proves the counter matters).

## Targeting modes

Each tower has a mode: **first** (furthest along the path, today's rule),
**last** (closest to the spawn), **strongest** (highest current hp, ties
to first). Default: first. The tower panel gets a cycle button showing the
mode. Mode is part of the tower state, so sell and rebuild resets it.

## Difficulty (default)

| | Easy | Normal | Hard |
|---|---|---|---|
| Enemy hp | 0.75x | 1x | 1.3x |
| Start gold | 150 | 100 | 80 |
| Lives | 25 | 20 | 15 |

Chosen on the title screen (three buttons; Normal preselected). Normal is
the current game: all milestone 12 targets hold on Normal. Easy must let
the lazy build win; Hard must make the combo build lose at least 5 more
lives than on Normal (balance milestone pins both).

## Endless mode and high score (default)

After a win on wave 10 (boss dead), the win screen offers **Keep going**.
Waves 11+ are generated: the wave 8 to 10 tables cycle with hp x 1.15 per
cycle, plus one Harpy group per wave, no second boss. Score = waves cleared
on that run. The highest score per difficulty is kept in `localStorage` and
shown on the title screen. Losing in endless shows the lose screen with
"Reached wave N" as today. Everything stays deterministic (no randomness).

## Maps (default)

Three maps, same grid rules, picked on the title screen with a thumbnail:
1. **Meadow** (today's path).
2. **Switchback**: a long zig-zag with three tight turns, more cells near
   the path, favouring splash.
3. **Riverbend**: a wide S curve with a river tile strip that is also
   unbuildable (first use of a non-path unbuildable region), favouring long
   range.
Waypoints are chosen in the map milestone; path length 1500 to 1800 px each.
Each map has its own archetype runs and balance pins; the cottage and cave
move with the path.

## Additions from Kyle's iPad play notes (2026-11-21)

Kyle played v3/v4-in-progress on the iPad: "we got the idea of it correct",
now make it fun. Three additions, built before endless, maps and the
balance lock, as milestones 25a to 25c.

### Placement and the planning phase (25a)

- **Drag to place.** Press a tower on the bar and drag onto the map. The
  ghost floats 48 px above the touch point so the finger does not hide it
  (no offset for the mouse), snaps to cells, shows green or red with its
  range; release on a buildable cell to build; release over the HUD or an
  unbuildable cell to cancel. Tap-tap (touch) and click (mouse) placement
  stay.
- **Planning phase.** Everything bought during a setup phase (builds and
  upgrades) is "unlocked" until Start Wave is pressed. An unlocked tower can
  be dragged to another buildable cell for free and removed for a full
  refund of what was spent on it this phase. Pressing Start Wave locks
  everything: no moving, and sell returns 70% as today. Towers bought during
  a wave lock at once. Unlocked towers show a dashed outline.
- An upgrade bought in setup on a tower locked earlier is refundable on its
  own ("Undo upgrade") until the wave starts; the tower itself stays locked.

### Special attacks (25b)

- One charge per wave, granted at wave start, unused charges do not carry
  over. A HUD button opens the unlocked specials; pick one, then tap the
  map; a circle previews the area; tap again (touch) or click (mouse) to
  fire. Usable only during a wave.
- Unlocks by wave reached (default starting numbers; 25c and 28 retune):

| Special | From wave | Effect |
|---|---|---|
| Powder Keg | 1 | 80 damage to every enemy within 70 px |
| Tar Barrel | 4 | 50% slow for 4 s on every enemy within 90 px (boss cap applies) |
| Fire Arrows | 7 | burn 10 per second for 4 s on every enemy within 80 px, doubled on tarred enemies as with the Fire Pot |

- Specials hit flying enemies too, and shields do not reduce them.
- Deterministic: a special is a player action with a tick and a position;
  headless scripts can use them, and the archetypes get a stated policy.

### Horde retune, early call, kill counts (25c)

- **Horde waves.** Roughly two to three times the enemies per wave with
  less hp each; total bounty per wave rises; the overall challenge stays:
  every archetype target from milestone 12 and 22 holds on Normal. Easy and
  Hard are retuned here too (Easy: the lazy build wins; Hard: the combo
  build loses at least 5 more lives than on Normal but can still win).
- **Call early.** While a wave is running and all its enemies have spawned,
  Start Wave becomes "Call next wave" and pays a bonus of 1 gold per
  remaining second of a fixed 20 s grace, at most 20; the new wave's
  enemies join the field. Not available before wave 10's boss.
- **Kill counts.** Each tower counts its kills; the panel shows it.
- **Performance.** 120 enemies and 25 towers at 60 fps in headless Chromium
  as a floor; Kyle checks the iPad.

## Out of scope for v4 (v5 or later)

Art, sound, juice, world effects (moved from v3 to v5), draw-your-own-trail
unless chosen in question 4, saves beyond the high score, multiplayer, a
second upgrade tier.

## Milestones

One PR each, same roles: coordinator plans and writes no code, Opus
implements at medium effort, Sonnet verifies, Kyle plays and approves.

| # | Milestone | Evidence that proves it |
|---|---|---|
| 22 | Harpy and Shieldbearer in the simulation and the renderer (placeholder sprites), wave table updated | Unit tests per rule (Harpy untargetable by Tar/Cannon/Mortar, no burn; Shieldbearer halves small shots); a build with no Musketeer or Longbow loses to the first Harpy wave headlessly; Playwright shows both types |
| 23 | Grumblefoot: boss unit, 5-life exit, slow cap, HUD health bar | Unit tests; headless combo build kills him; Playwright reaches wave 10 with the bar visible; baseline |
| 24 | Targeting modes in the simulation and the panel | Unit tests for first/last/strongest with ties; Playwright cycles the mode and sees a different target; baseline of the panel |
| 25 | Difficulty levels and the title menu | Unit tests on multipliers; Playwright starts each level and checks gold, lives and an enemy's hp; baseline of the title menu |
| 25a | Drag placement and the planning phase: drag from the bar with a lifted ghost, free move and full refund until Start Wave, undo for setup upgrades | Unit tests for lock, move and refund rules; Playwright drags by touch and mouse, moves a tower, undoes, then confirms 70% after the wave starts; baseline with an unlocked tower |
| 25b | Special attacks: Powder Keg, Tar Barrel, Fire Arrows, one charge per wave, unlock by wave, HUD button and area preview | Unit tests per special (flyers hit, shields ignored, boss slow cap, tar doubling); Playwright fires each by touch and mouse; baseline of the aim preview |
| 25c | Horde retune with Easy and Hard, call-early bonus, tower kill counts, performance floor | Sim report with every archetype target on Normal plus the Easy and Hard targets; revert notes; a 120-enemy frame-time test; Kyle's play notes |
| 26 | Endless mode and local high score | Unit tests on wave generation and scaling; Playwright wins, keeps going, loses, sees the score on the title; determinism test |
| 27 | Two new maps and the map picker | Map data tests (path length, 36 px rule, buildable counts, river region); archetype runs per map; Playwright plays a wave on each; baselines per map |
| 28 | Balance lock: every archetype on every map and difficulty against the targets; `docs/DESIGN.md` rewritten as the frozen spec | Sim report pinned by tests; revert matrix; Kyle's play notes; a "frozen" banner in DESIGN.md |
| 29 | Ship v4: README, GIF, retrospective | Kyle finishes a game on Hard, then an endless run, from the public link |

## Open questions for Kyle (before milestone 22)

1. Names: Harpy, Shieldbearer, Grumblefoot the Troll King. Keep or rename?
2. Boss costs 5 lives on exit (default), or an instant loss?
3. Difficulty affects hp, gold and lives (default), or hp only?
4. Draw-your-own-trail: in v4 as milestone 27b (one more PR), in v5, or
   dropped?
