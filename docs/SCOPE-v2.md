# Tarpit: v2 scope and milestones

Draft for Kyle's approval, 2026-11-21. Anything marked "default" is the
coordinator's pick and can be changed. v1 is shipped (see `SCOPE.md`); v2
builds on it with the same roles, checks and one-PR-per-milestone process.

## What v2 adds

Two things Kyle asked for after playing v1:

1. **Build anywhere.** Towers go on any free grid cell that is off the path,
   instead of ten fixed spots.
2. **More weapons.** Three new towers, each with a mechanic the first three
   do not have.

Everything else in v1 stays: one map, one path, 10 waves, three enemies, one
upgrade level, sell at 70%, win and lose screens, 1x/2x, wave preview, shapes
with labels.

## Placement (default design)

- The map is a 30 x 15 grid of 32 px cells (960 x 480). A cell is buildable
  when its centre is at least 36 px from the path centreline (so a 26 px
  tower body never touches the 40 px path strip), it is inside the map, and
  no tower is on it. Range is measured from the cell centre.
- The ten fixed spots are removed.
- The HUD gains a build bar: six tower buttons with name and cost. Pick a
  tower, then click a cell. A ghost tower with its range circle follows the
  pointer: green on a buildable cell, red otherwise. The pick stays active so
  several towers can be placed in a row; Escape, or clicking the button
  again, clears it. Clicking a placed tower opens the upgrade / sell panel as
  in v1.
- To fit the bar, the canvas grows from 960 x 540 to 960 x 580: map 960 x
  480 unchanged on top, HUD 100 px below. Playwright viewport and the
  hard-coded HUD click positions change with it.

## New towers (default starting numbers; the balance pass retunes)

| Tower | Cost | Range | Damage | Fire rate | Mechanic |
|---|---|---|---|---|---|
| Longbow | 40 | 150 | 6 | 2.5/s | cheap, long, fast; the anti-Wolf tower |
| Mortar | 110 | 220, minimum 70 | 45, splash 60 px | 0.33/s | cannot hit enemies closer than 70 px |
| Fire Pot | 70 | 100 | 4 on hit, then burns 5/s for 3 s | 0.8/s | burn does double damage to a tarred enemy; burns do not stack, a new one refreshes |

Upgrades (one level, as in v1):

| Tower | Upgrade cost | Changes |
|---|---|---|
| Longbow | 30 | damage 9, range 170 |
| Mortar | 80 | damage 70, splash 70 px |
| Fire Pot | 50 | burn 8/s for 4 s |

Shapes: Longbow a tall thin green rectangle with a bow arc; Mortar a short
wide grey tube; Fire Pot an orange-red circle with a flame mark. Shots:
Longbow a thin tracer, Mortar a dark arc flash plus splash circle, Fire Pot
an orange flash and a burning enemy gets an orange ring.

## Balance targets for v2 (default)

Same method as v1: headless archetypes on the grid, pinned by tests.
No towers loses by wave 3. Lazy (base Musketeers hugging the path, no
upgrades) loses on wave 6 to 8. Cheap spam (Longbows everywhere) loses on
wave 7 to 9. Sound mixed build using the Tar Pit and Fire Pot combo wins
with 5 to 15 lives and under 150 gold entering wave 10. The same build
without Fire Pots does strictly worse. With unlimited cells, gold is the
only limiter, so expect tuning to land on costs and bounties.

## Out of scope for v2

New maps, new enemies, a second upgrade tier, hotkeys, art packs (Kenney
stays the first post-v2 candidate), sound, saves, mobile layout.

## Milestones

One PR each, same roles: coordinator plans and writes no code, Opus
implements at medium effort, Sonnet verifies, Kyle reviews screenshots and
play feel.

| # | Milestone | Evidence that proves it |
|---|---|---|
| 8 | Grid placement in the simulation: cells, buildable rule, build/upgrade/sell by cell, spots removed, archetypes ported to the grid | Unit tests for the buildable rule at the path edge; headless grid archetypes run |
| 9 | Placement UI: build bar, ghost and range, valid/invalid colouring, 960 x 580 canvas, panel on click | Playwright places towers on cells through real clicks and clears a wave; baselines regenerated |
| 10 | Three new towers in the simulation: Longbow, Mortar with minimum range, Fire Pot with burn and the tar combo | Unit tests per mechanic (minimum range refuses close targets, burn ticks, tar doubles burn); a build using the new towers wins headlessly |
| 11 | New towers in the UI: bar buttons, shapes, labels, shot and burn visuals | Playwright builds each new tower through the bar; new baselines |
| 12 | Balance pass v2: grid archetypes with six towers, targets above | Sim report pinned by tests; Kyle's play notes |
| 13 | Ship v2: README, GIF, devlog retrospective, Pages verified | Kyle finishes a game with the new towers from the public link |

## Open questions for Kyle (before milestone 8)

1. Tower pick stays active after placing (default yes), or clears after one?
2. Canvas grows to 960 x 580 (default), or keep 540 and shrink the map?
3. Names: Longbow, Mortar, Fire Pot. Keep or rename?
4. Anything to add or cut.
