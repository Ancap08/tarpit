# Tarpit: v4 scope and milestones (gameplay lock)

Draft for Kyle's approval, 2026-11-21. "Default" marks the coordinator's
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
