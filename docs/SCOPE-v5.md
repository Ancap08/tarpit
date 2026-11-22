# Tarpit v5 scope: make it cooler

Status: direction approved by Kyle on 2026-11-22 (second play notes, see
DECISIONS.md). He asked for the four changes in milestone 30 and agreed
with the order of the rest; he lets the coordinator make detail calls and
will object if he dislikes one. Milestones 31 and later get their detail
written here before each is built.

v4 locked the gameplay. Kyle's verdict after playing every difficulty:
solid and on track, with one part that felt off, the special attacks. v5
fixes that first, then makes the game look, sound and feel better without
changing what the player decides.

## Milestone 30: play-note fixes

### Specials rework

Kyle: "essentially useless and hard to use. I wasn't able to understand
how to place the attack and didn't know if it landed."

- **Aim.** Press Special (or pick one from its popup): a banner over the
  map says what to do, and the circle follows the pointer. A mouse click
  fires. On touch, a tap fires at the tap; holding shows the circle under
  the finger (lifted, as for tower drags) and releasing fires. There is no
  second confirming tap. Special again, Escape, or releasing over the HUD
  cancels.
- **You can see it land.** Powder Keg: a blast, a short shake and a scorch
  mark that fades. Tar Barrel: a tar puddle that stays for as long as it
  works. Fire Arrows: a burning patch that stays for as long as it works. A
  small label at the spot says how many enemies it caught, or that it
  missed. The Special button shows the recharge and pulses when ready.
- **More power.** The charge is ready at each wave start and refills on a
  timer while the wave runs (starting number: 20 s), so a special is used
  several times a wave. The Tar Barrel and Fire Arrows leave a zone on the
  ground for a few seconds (starting number: 5 s) that slows or burns every
  enemy inside it, flyers included. Circles get bigger (starting numbers:
  keg 90, tar 100, fire 90). One shared charge, three specials unlocked on
  waves 1, 4 and 7 as today.
- **Balance.** Headless builds fire specials the way a person would (when
  ready, at the biggest cluster), not from a per-wave search. The
  milestone 28 targets hold on every map and level, and: the combo build
  with specials is at least 3 lives better than without on Normal;
  removing any one special makes the Meadow combo strictly worse; a build
  that never fires a special still wins Normal on every map.

### Cannon range

90 to 105 px at both levels ("a little farther", Kyle), re-pinned in the
same balance pass.

### Speed

Tap the speed button for 1x and 2x as today; hold it for 3x while held.
(Kyle floated a 1 to 2 slider; the coordinator recommended this instead.)

### Gold cheat

Tap the Gold number five times within two seconds: +500 gold. The run is
marked as cheated in the HUD and saves no best score. Kyle asked for the
cheat; the marker and the score rule are the coordinator's.

### Two cosmetic defects from the automated review

The last tracer or splash replays after the win tick; hit and kill effects
are dropped for an enemy spawned in the same frame.

## Later milestones (order agreed, detail to come)

| # | Milestone | Idea |
|---|---|---|
| 31 | Hit and death effects | Flashes, knocks, death puffs, floating gold, arcing shells, a boss entrance |
| 32 | Sound | Shots, hits, tar, fire, a wave horn, win and lose jingles, a mute button; CC0 or credited assets only |
| 33 | A living map | Moving water, chimney smoke, trees, varied grass: rich to look at, simple to build |
| 34 | Towers with personality | Aiming, recoil, upgrades that change the look |
| 35 | Tabletop-art spike | One tower, one enemy and one patch of map in the stop-motion tabletop style, rendered off the Mac, for Kyle to judge before any full art pass |
| 36 | Themed HUD | Replace the placeholder bar and panels |

The game's theme is still loose (Kyle); milestones 31 to 34 do not depend
on it.

## Roles

Coordinator plans and writes no game code. Implementers: Claude Opus at
medium effort, or a cheaper model for mechanical work. Verifiers: Claude
Sonnet, always a different model from the implementer. Kyle plays and
approves.

## Out of scope for milestone 30

New towers, enemies or maps; a second upgrade tier; sound and new art;
saving a game in progress; any change to waves, call early or endless.
