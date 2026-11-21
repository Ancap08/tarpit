# Tarpit: game design spec (v1)

Numbers here are the values tuned in the milestone 6a balance pass (see
DEVLOG.md for before and after, and `npm run sim` for the evidence).
Anything not in this file or `docs/SCOPE.md` is out of scope.

## Space and time

- Canvas 960 x 540. The map uses the top 960 x 480; the HUD uses the bottom
  60 px.
- Positions are in pixels. Speeds are pixels per second.
- The simulation runs at a fixed 60 ticks per second (`dt = 1/60 s`). It has
  no randomness in v1, so a given sequence of actions always produces the
  same state. Tests assert exact values.
- The 2x speed toggle is a renderer concern: it runs two ticks per frame
  instead of one. The simulation does not know about it.

## Map

One map, one path, ten build spots. The path is a polyline of waypoints from
the spawn (left edge) to the exit (right edge); enemies move along it by
distance travelled. Build spots are fixed points off the path, each holding at
most one tower.

Path (pixels): (0,240) (160,240) (160,96) (420,96) (420,384) (680,384)
(680,192) (960,192).

Build spots, ids 0 to 9: (96,160) (96,320) (240,176) (240,240) (340,176)
(500,160) (500,304) (600,304) (760,112) (760,272). Spot 0 is 64 px from the
path; every other spot is exactly 80 px from its nearest path segment, and
every spot is at least 50 px from every other.

A spot is invalid for building if it is already occupied; spots are never
on the path by construction.

## Economy and lives

- Start with 100 gold and 20 lives.
- Each kill pays the enemy's bounty. Clearing a wave pays a 25 gold bonus.
- An enemy reaching the exit costs 1 life and is removed.
- Lives at 0 or below: lose, immediately.
- Clearing wave 10 with lives above 0: win.
- Sell returns 70% of the total spent on that tower (build plus upgrade),
  rounded down.

## Enemies

| Type | HP | Speed | Bounty | Notes |
|---|---|---|---|---|
| Goblin | 30 | 60 | 4 | normal |
| Wolf | 28 | 120 | 5 | fast |
| Troll | 500 | 35 | 11 | tanky |

A slow effect multiplies speed by `(1 - slow)` for its duration. Slows do not
stack: the strongest slow applies, and a new slow of equal or greater strength
refreshes the duration.

## Towers

Hits are instant in the simulation (the renderer draws the shot). A tower
fires when its cooldown is zero and a target is in range, then its cooldown
resets to `1 / fireRate` seconds.

Targeting: the enemy in range that is furthest along the path (closest to the
exit). Ties go to the lower enemy id.

| Tower | Cost | Range | Damage | Fire rate | Effect |
|---|---|---|---|---|---|
| Musketeer | 50 | 110 | 12 | 1.0/s | single target |
| Cannon | 80 | 90 | 25 | 0.5/s | splash: all enemies within 40 px of the target take full damage |
| Tar Pit | 60 | 90 | 3 | 2.0/s | target slowed 40% for 2 s |

One upgrade per tower:

| Tower | Upgrade cost | Changes |
|---|---|---|
| Musketeer | 35 | damage 22, range 125 |
| Cannon | 60 | damage 40, splash radius 55 |
| Tar Pit | 50 | slow 60%, range 105 |

Range is measured from the tower's spot to the enemy's position.

## Waves

A wave is a list of groups. A group spawns `count` enemies of one type,
`interval` seconds apart, starting `delay` seconds after the wave starts.
Groups in a wave run concurrently from the wave start.

| Wave | Groups |
|---|---|
| 1 | 8 Goblin, every 1.0 s |
| 2 | 12 Goblin, every 0.8 s |
| 3 | 8 Goblin every 1.0 s; 6 Wolf every 0.6 s, delay 4 s |
| 4 | 10 Wolf every 0.6 s |
| 5 | 12 Goblin every 0.7 s; 2 Troll every 3 s, delay 2 s |
| 6 | 18 Goblin every 0.5 s; 14 Wolf every 0.5 s, delay 5 s |
| 7 | 10 Wolf every 0.5 s; 7 Troll every 2.5 s, delay 1 s |
| 8 | 20 Goblin every 0.5 s; 10 Wolf every 0.6 s, delay 6 s; 4 Troll every 3 s, delay 3 s |
| 9 | 12 Wolf every 0.5 s; 4 Troll every 2 s |
| 10 | 8 Wolf every 0.5 s, delay 4 s; 12 Troll every 2 s |

Wave flow: the player presses Start Wave. The wave is active until every
enemy in it has spawned and none remain alive. Then the clear bonus is paid
and the next wave can be started. Start Wave is unavailable while a wave is
active. The next-wave preview lists each group's type and count.

Players can build, upgrade and sell at any time, including mid-wave.

## Simulation API shape

Plain TypeScript in `src/sim`, no Phaser, no DOM. One `GameState` object,
pure data. Functions take the state and return a new state or a result;
either mutation or immutability is fine as long as it is consistent and
tested. Required operations: create game, tick, start wave, build tower,
upgrade tower, sell tower, next-wave preview, and a headless runner that
plays a scripted set of actions for tests and balance work.
