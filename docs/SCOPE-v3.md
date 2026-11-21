# Tarpit: v3 scope and milestones

Draft for Kyle's approval, 2026-11-21. "Default" marks the coordinator's
pick; Kyle can change any of it. v1 and v2 are shipped (`SCOPE.md`,
`SCOPE-v2.md`). v3 is presentation: it changes how the game looks, sounds
and feels, and where it can be played. It changes no gameplay numbers.

## What v3 adds

1. **Tablet play.** Touch placement, a layout that fits an iPad, no
   hover-only cues.
2. **An animation engine** driven by simulation events, with real sprites.
3. **Art, sound and the overkill list**: animated enemies and towers,
   projectiles with shadows and craters, a day that turns to dusk across the
   waves, weather, birds, a village that reacts, coins that fly, a scroll
   that unrolls, screen shake, slow motion on the last kill, fireworks.

## Hard rules for v3

- **No gameplay change.** The only simulation change is a per-tick event
  list (`state.events`: spawn, hit, kill, exit, burn tick, slow applied,
  build, upgrade, sell, wave start, wave clear, win, lose) for the renderer
  to animate from. Every balance pin from milestone 12 must hold unchanged.
- **Licensing.** Only CC0 assets (or CC-BY with credit) are committed to
  this public repo. `assets/MANIFEST.md` lists every file's source and
  license, and a CI check fails if a file under `assets/` is missing from
  it. Tiny Swords is excluded: its free pack forbids redistribution and its
  goblins are in a paid pack.
- **Size budget.** CI fails if the built site exceeds 20 MB (default).
  Atlases are WebP or compressed PNG; later maps load lazily.
- **Determinism.** Play uses the WebGL renderer. Test mode uses Canvas with
  animations frozen on frame 0 and particles off, so screenshot baselines
  stay exact. Animations and particles live in `src/game` only.
- **Performance.** 60 frames per second on an iPad with 60 enemies and 20
  towers on screen. A frame-time counter is available with `?fps=1`.
  Measured by Kyle on his device at milestone 21; agents measure in headless
  Chromium as a floor.

## Art direction (default, for Kyle to confirm at milestone 15)

Pixel art, 16 px base scaled 3x, from the **Ninja Adventure** pack by
pixel-boy (CC0; 30+ animated monsters, 9 bosses, four-direction walk
cycles, tilesets, 100+ sound effects, 37 music tracks). Backup for
specific enemies: **0x72 DungeonTileset II** (CC0, goblins and orcs, no
death animation). Fallback if neither maps well: keep our own shapes and
animate them in code. Milestone 15 downloads the packs, inventories what
maps to Goblin, Wolf, Troll and the six towers, and shows Kyle three mockup
frames in each candidate style before anything is wired in.

## Touch design (default)

- Canvas stays 960 x 580 and scales to fit the screen with letterboxing.
  Target: iPad landscape. Phones in landscape are best effort; portrait
  shows a "turn your device" card.
- Bar buttons and panel buttons are at least 44 px tall on screen at iPad
  scale. The tower panel gets a close button.
- Placement on touch: tap a cell to show the ghost and range there, tap the
  same cell again to build, tap elsewhere to move the ghost. Mouse keeps
  the hover ghost and single click. The bar button toggles the pick on both.
- No pinch zoom, no drag placement, no gestures beyond tap.

## Milestones

One PR each, same roles: coordinator plans and writes no code, Opus
implements at medium effort, Sonnet verifies, Kyle reviews frames and plays
on the iPad.

| # | Milestone | Evidence that proves it |
|---|---|---|
| 14 | Tablet and touch: fit-to-screen, touch placement, 44 px targets, panel close, rotate card | Playwright with touch emulation at iPad size places towers by two-tap and clears a wave; a tablet-size baseline; Kyle plays a wave on the iPad |
| 15 | Art source spike: download candidate CC0 packs, inventory sprites and animations against the roster, license manifest and CI check, three mockup frames per candidate | Inventory table in the PR; manifest check green; Kyle picks the style |
| 16 | Simulation events and the animation engine: `state.events`, atlas loader, WebGL in play and frozen Canvas in test, sprite animation states for enemies (walk by facing, hit, die, burning, tarred), asset budget check | Event tests in the sim with balance pins unchanged; Playwright asserts animation states from a `?test=1` hook; baselines regenerated |
| 17 | Art pass: towers (idle, fire with recoil and smoke, upgrade trim), projectiles (cannonball with shadow, mortar shell and crater decal, arrows that stick, tumbling fire pot), map tileset, cave and cottage, HUD skin, title scene with parallax | Baselines for every frame; Kyle's frame review |
| 18 | Sound: shots, hits, deaths, coins, build, upgrade, sell, wave horn, win, lose; one music loop; mute button; audio unlock on first tap (iOS); silent in test mode | Playwright asserts the audio graph exists and mute works; Kyle hears it on the iPad |
| 19 | Juice: coin floaters to the counter, wave scroll banner with the wave name, mortar screen shake, hit flashes, death pops, half-second slow motion on a wave's last kill, scaffolding on build, flourish on upgrade, fireworks on win, smoke on loss | Each effect has a frozen-frame baseline or a state assertion; Kyle's play notes |
| 20 | World: day to dusk over ten waves with torches from wave 8, one rain wave with lightning, birds between waves, village windows and cheering on a clear, cottage decorations as waves are cleared, footprints and dust on the path | Baselines at wave 0, 5 and 9; a time-of-day unit test |
| 21 | Ship v3: iPad performance check, README, GIF, `CREDITS.md`, retrospective | Kyle finishes a game on the iPad at 60 fps |

## Out of scope for v3 (candidates for v4)

Boss, flying and shielded enemies, targeting modes, difficulty levels,
endless mode, high scores, more maps, draw-your-own-trail, saves.

## Open questions for Kyle (before milestone 14)

1. Art: pixel art from a CC0 pack (default), or keep our own shapes and
   animate them in code? Milestone 15's mockups let you decide with frames
   in front of you; say now if one is already out.
2. Music: yes with a mute button (default), or sound effects only?
3. Tablet target: iPad landscape with phones best effort (default), or
   phones as a first-class target (bigger UI changes)?
4. Size budget 20 MB (default)?
