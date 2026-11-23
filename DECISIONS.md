# Decisions

Every design and process decision, newest at the bottom. Each entry says what
was decided, who decided, and why. "Default" means an agent picked it and Kyle
can change it; "Kyle" means Kyle decided.

## 2026-11-21

- **Platform: browser game on GitHub Pages.** Kyle. Playable from a link, no
  install, fits a portfolio.
- **Stack: TypeScript, Phaser 3, Vite, Vitest, Playwright, ESLint.** Kyle
  (from the brief). Phaser 3, not Phaser 4: Phaser 3 has far more examples and
  documentation for agents to work from; 4 is new. Revisit if 3 blocks us.
- **Game logic is plain TypeScript in `src/sim`, separate from Phaser
  rendering in `src/game`.** Kyle (from the brief). Lets waves, damage, gold
  and targeting be unit tested and simulated headlessly for balance. An ESLint
  rule forbids importing Phaser from `src/sim`.
- **Theme: fantasy with colonial-era weapon flavor.** Kyle. The game is for
  Kyle and his nieces and nephews. A security theme was considered and
  rejected for this project.
- **Name: Tarpit.** Default (Fable). Short, memorable, and names the slow
  tower. Kyle accepted "for now".
- **Towers: Musketeer (single target), Cannon (splash), Tar Pit (slow).
  Enemies: Goblin (normal), Wolf (fast), Troll (tanky).** Default (Fable).
  Plain names a kid can read on a label.
- **Speed toggle (1x/2x) and next-wave preview are in v1.** Kyle. Both are
  cheap and change how the game feels to play.
- **Art: simple shapes with labels in v1.** Default (Fable). Fewer moving
  parts for milestones 3 to 5, and deterministic screenshots. A Kenney CC0
  pack is a milestone 6 option.
- **Screenshot checks run on frozen frames only.** Default (Fable). Seeded
  random numbers, a fixed-step simulation, and a `?test=1` flag that pauses
  time. Baselines for title, map at wave 0, win and lose. Kyle approves every
  new baseline. Live animation would make pixel diffs flaky.
- **Process: a coordinator plans and never writes game code. Implementer
  agents write each change. A different model verifies it before Kyle
  reviews. Every PR body lists its evidence.** Kyle (from the brief).
- **Every repeated bug or agent slip becomes an automatic check** (lint rule
  or test), not more documentation. Kyle (from the brief).
- **Sell price: 70% of total spent on the tower.** Default (Fable). Standard
  tower defense feel; tune in milestone 6.
- **License: MIT.** Default (Fable). Portfolio code should be easy to reuse.
- **Package manager: npm with a committed lockfile.** Default (Fable). Already
  on the machine; nothing to install.
- **TypeScript pinned to 6.0.x.** Default (Opus implementer, accepted by
  Fable). TypeScript 7 is current, but typescript-eslint 8.73 supports only
  TypeScript below 6.1. Move to 7 once typescript-eslint supports it.
- **The `?test=1` hook arrives in milestone 3, not before.** Fable, on the
  verifier's finding. The implementer added an unused `testMode.ts`; it was
  removed. Code lands in the milestone that uses it.

## 2026-11-21, after milestone 0

- **During this build run, the coordinator merges each milestone PR once the
  `ci` check and the verifier pass. Kyle reviews screenshots and play feel at
  the milestone 5 checkpoint and can reopen anything.** Kyle ("you're good to
  continue on, continue building past step 5 or until you need me").
- **Implementers run on Claude Opus at medium effort; verifiers stay on a
  different model (Claude Sonnet).** Kyle chose Opus medium; the different
  model rule is from the brief.
- **No randomness in the v1 simulation.** Fable. The design needs none, and
  exact-value tests are stronger than seeded ones. CLAUDE.md corrected; it
  had said "seeded random numbers".
- **Tick order: move, exit and life loss, spawn, counters, wave-clear check.
  An enemy spawns at distance 0 on the first tick after Start Wave and does
  not move on its spawn tick. Spawn ticks are `round(seconds * 60)`.**
  Default (Opus implementer, accepted by Fable after Sonnet re-derived the
  numbers by hand). Written in the header of `src/sim/game.ts`.
- **The 25 gold wave-clear bonus is paid on wave 10 too.** Default. Harmless
  and simpler than a special case.
- **Game state is mutated in place; `tick` returns nothing.** Default (Opus).
  Fine for a small game; the renderer reads the one state object.

## 2026-11-21, milestone 2

- **Sell refund uses integer math: `floor(spent * 7 / 10)`.** Default (Opus).
  `90 * 0.7` in floating point is 62.999..., which would refund 62; the spec
  example says 63.
- **Combat step runs after movement and exit removal, before spawning.**
  Default (Opus). A newly spawned enemy at distance 0 is not shot on its
  spawn tick. Dead enemies are removed between towers, so one tower's kill is
  not another's target in the same tick.
- **Tower cooldowns freeze between waves and carry over.** Default (Opus).
  Simplest reading; cosmetic in practice.
- **Cannon splash can hit enemies outside the cannon's own range if they are
  within the splash radius of the target.** Default (Opus). Matches the spec
  text literally.
- **A Tar Pit shot that kills applies no slow.** Default (Opus).
- **Balance observations for milestone 6, not acted on yet** (Fable, from the
  implementer's and verifier's reports): the sound build wins with 20 of 20
  lives and 910 gold unspent; the lazy build loses on wave 3 against a target
  of about wave 7; base Tar Pit range (80) equals the distance from eight of
  the ten spots to the path, so it barely reaches, and spot 3 is 102 px from
  the path so a base Tar Pit there reaches nothing. Numbers stay as specified
  until the milestone 6 balance pass.

## 2026-11-21, milestone 3

- **Phaser uses the Canvas renderer, not WebGL.** Default (Opus, accepted by
  Fable). Shapes-only art does not need WebGL, and Canvas renders the same in
  headless Chromium, which keeps screenshot baselines stable.
- **Screenshot baselines are generated on CI's Linux runner by a manual
  workflow (`update-snapshots.yml`), committed to the PR branch by the
  Actions bot, and reviewed as PNGs in the PR.** Fable. Local macOS rendering
  differs from CI, and the Playwright Docker image was not an option on this
  machine (daemon off, 14 GB free). Local runs skip pixel comparison; CI
  enforces it and fails on a missing baseline rather than silently creating
  one.
- **Playwright viewport is exactly 960 x 540 so canvas and page coordinates
  match.** Default (Opus). Lets tests click the real buttons.
- **Milestone 6 polish candidates, from the verifier's look at the frames:
  tower labels, larger hp bars, a less black Tar Pit, and baseline coverage
  of Wolf and Troll.** Observations only; Kyle decides at the checkpoint.

## 2026-11-21, milestone 4

- **Build menus and tower panels open on the first side of the spot (right,
  left, below, above) that covers no other build spot, and never over the
  HUD.** Default (Opus, accepted by Fable). A unit test checks all ten spots.
  Found because a menu placed to the right of spot 2 covered spot 4.
- **Selecting a tower shows its range circle; hovering a build option shows a
  range preview.** Default (Opus). Part of the tower panel and build menu, not
  new features.
- **Milestone 6 polish candidates from the verifier: the spot 2 menu covers
  the path while open; the white range preview is faint; the greyed
  "Upgraded" label is low contrast.** Observations only.

## 2026-11-21, milestone 5

- **Play again restarts the Phaser scene (`scene.restart()`), which rebuilds
  everything from a fresh `createGame()`.** Default (Opus, accepted by Fable).
  Phaser's shutdown removes listeners and objects, so nothing needs manual
  reset; tests prove a third game behaves like the first.
- **The end-screen veil is plain drawing, not an interactive object; the
  scene ignores map clicks while an end screen shows.** Default (Opus). An
  interactive veil raced the Play again button on the first frame and failed
  a third of runs.
- **Speed toggle greys out on end screens.** Default (Opus). Its label would
  otherwise still flip between 1x and 2x.
- **Milestone 6 polish candidates from the verifier: a more transparent end
  panel, and hiding the "Next:" line on the lose screen.** Observations only.

## 2026-11-21, milestone 6a (balance)

- **Balance targets, proven by headless archetype runs and pinned by tests.**
  Fable. No towers loses by wave 3; a kid's lazy build (base Musketeers only)
  loses on wave 6 to 8; a greedy Musketeer-and-upgrade build loses on wave 8
  to 10 or wins with at most 5 lives; a thoughtful mixed build wins with 5 to
  15 lives and has under 150 gold when wave 10 starts; the same build with
  its Tar Pits removed does strictly worse. Results: wave 2, wave 8, won with
  2 lives, won with 11 lives (141 gold after wave 9), lost on wave 7.
- **The numbers that changed** are tabled in `docs/DESIGN.md` (now the spec)
  and, with one line of reasoning each, in the DEVLOG. Headlines: Tar Pit
  range 80 to 90 and fire rate 1 to 2 per second so it reaches from every
  spot and matters; Troll hp 150 to 500 so it is actually tanky; Wolf hp 20
  to 28; later waves heavier; wave 10 is Wolves and Trolls only. Default
  (Opus, accepted by Fable).
- **Troll bounty is 11, not 4.** Fable. The first pass set it to 4 to hit a
  "gold unspent at the end" target, but gold earned in wave 10 can never be
  spent, so that target measured nothing. Replaced by "gold entering wave
  10", which let the Troll pay like a big enemy should. Wave 9 dropped from
  8 Trolls to 4 to keep that target.
- **Build spot 3 moved from (240,304) to (240,240)** so it is 80 px from the
  path like the others. Default (Opus).
- **Known thin margins:** lazy at the edge of its range, greedy at 2 lives
  against a limit of 5. Kyle's play notes decide whether that is right.

## 2026-11-21, milestone 6b (visual polish)

- **Polish list executed:** tower labels ("Musket", "Cannon", "Tar", plus
  "+" when upgraded), 30 x 4 hp bars that go orange under 50% and red under
  25%, dark-brown tar everywhere, pale-yellow range circles, greyed button
  text at 4.8:1 contrast, end panel at 0.85 alpha, no "Next:" text on the
  lose screen, chimney on the cottage and an inner arc on the cave, and an
  `enemies.png` baseline showing all three enemy types in wave 8. Fable
  (list), Opus (execution), Sonnet (contrast and geometry rechecked).
- **Menus and panels open on the clear side that covers the least path.**
  Default (Opus). Spot 2's menu still sits over the path: above is its only
  side that covers no build spot. Accepted.
- **Two transient label overlaps accepted:** a panel opening below a tower
  covers that tower's label (spot 3), and a menu at spot 1 or 7 can clip a
  neighbour's label by a few pixels. Fable. Panels draw on top and close on
  the next click; fixing it would change placement the tests pin.
- **Art stays shapes for v1. A Kenney CC0 pack remains a post-v1 option.**
  Fable, pending Kyle's play notes.

## 2026-11-21, milestone 7 (ship) and close of v1

- **Facts from the coordinator's session record, not visible in the repo:**
  Kyle merged PR 1 himself; after that he told the coordinator to continue
  and merge on green ("you're good to continue on"), then to keep going
  through milestones 6 and 7. His input across the build was three messages
  after the plan approval. GitHub shows `Ancap08` as the merger on every PR
  because the coordinator used Kyle's `gh` login. Fable.
- **PR 4 (the baseline workflow) had no separate verifier pass; the
  milestone 3 verifier reviewed that workflow line by line before it was
  split out.** Fable.
- **v1 is complete at milestone 7. Kyle's play notes and his finishing a
  game from the public link are the remaining evidence, and his to give.**
  Fable.
- **Demo order:** the README GIF builds Musketeer, Cannon, then Tar Pit
  across waves 1 and 2 because 100 starting gold cannot buy all three before
  wave 1. Default (Opus).

## 2026-11-21, v2 approved

- **v2 scope approved with all defaults** (`docs/SCOPE-v2.md`): 32 px grid
  placement anywhere off the path, a HUD build bar with the pick staying
  active, canvas 960 x 580, towers named Longbow, Mortar and Fire Pot. Kyle.
- **Milestone 8 keeps the game playable:** the simulation moves to cells, and
  the renderer keeps the ten v1 spots as a temporary list of cells until
  milestone 9 replaces the UI. Fable. One PR per milestone, CI green on each.
- **v1 balance pins are suspended, not deleted, during milestones 8 to 11:**
  archetypes keep running and stay deterministic, but the wave targets return
  in milestone 12 once placement and towers are final. Fable.

## 2026-11-21, milestone 8 (grid in the simulation)

- **Buildable cell: centre at least 36 px from the path centreline, inside
  the 30 x 15 grid, unoccupied. 346 of 450 cells qualify.** From
  `docs/SCOPE-v2.md`; verified cell by cell with independent code.
- **Towers fire in cell-key order (row-major).** Default (Opus). Replaces
  spot-id order; deterministic and tested.
- **The lazy and greedy archetypes buy from a "kid band" of buildable cells
  within 68 px of the path, ordered from the spawn along the path.** Default
  (Opus, accepted by Fable). The literal sort filled whole map columns.
  Their first towers sit at the map's left edge with half their range off
  the map, which is why both now die on wave 3; that is a milestone 12 input.
- **Legacy spots map to their nearest buildable cell** (table in the
  DEVLOG), so the v1 UI, pins and demo keep working until milestone 9.
  Default (Opus); verified.

## 2026-11-21, milestone 9 (placement UI)

- **HUD is two 50 px rows: status and wave controls above, the build bar
  below. Canvas 960 x 580.** From `docs/SCOPE-v2.md`; row numbers in the
  DEVLOG.
- **A red (unbuildable) cell shows no ghost and no range circle.** Default
  (Opus). Less noise than a red ghost.
- **Clicking a tower while a pick is active selects the tower and clears the
  pick. HUD clicks (Start Wave, speed) keep the pick.** Default (Opus,
  accepted by Fable); clearing on HUD clicks would break re-clicking the bar.
- **Cells under the exit cottage are unbuildable.** Fable. The cottage box
  is map data in `src/sim` (`landmarks`); 344 of 450 cells are buildable. A
  radius rule around the end waypoints was tried first and removed either no
  cells or the lazy archetype's first cell.
- **Panels keep clear of their own tower's label; labels draw on their own
  layer and stay inside the map.** Opus, found from its own frames.
- **Accepted for now: labels of towers on adjacent cells overlap.** Fable.
  Labels are about 56 px wide on 32 px cells. Milestone 11 (new tower
  visuals) decides between smaller labels, hiding labels when crowded, or
  leaving it.

## 2026-11-21, milestone 10 (new towers in the simulation)

- **Longbow, Mortar and Fire Pot exist in the simulation with the SCOPE-v2
  numbers; the build bar still shows only the v1 three until milestone 11.**
  Fable. Placeholder grey shapes keep the renderer type-complete.
- **Tick order gains a burn step: move, exit, burn, combat, spawn, counters,
  clear check.** Default (Opus). Burn deaths pay bounty and are removed
  before towers pick targets.
- **An enemy dies at hp <= 1e-9, not hp <= 0.** Default (Opus, accepted by
  Fable after the verifier's argument). Burn makes hp fractional and 216
  ticks of 5/60 left a positive dust; integer-hp outcomes cannot change.
- **Burn fields on Enemy are optional with 0 meaning none; burns do not
  stack, an equal-or-stronger burn replaces, weaker is ignored; a killing
  impact applies no burn; tar doubles the burn only while the slow is still
  active after that tick's movement.** Default (Opus). All pinned by tests.
- **Balance inputs for milestone 12:** Longbow spam wins with 20 lives;
  the combo build wins with 20 lives and 441 gold. Both far outside the
  v2 targets. Numbers untouched until milestone 12.

## 2026-11-21, milestone 11 (new towers in the UI)

- **Build bar: six 148 x 36 buttons, 8 px gaps, from x 16 to 944; label
  font stays 16 px.** Default (Opus). Numbers checked by the verifier from
  code and from the live game.
- **Mortar's ghost and selection show both circles: range and a dashed red
  minimum range. Its tube rotates toward the last target like the other
  barrels.** Default (Opus, accepted by Fable).
- **Crowded labels: a label that touches another's, or has a horizontal
  neighbour, drops to 10 px; if it still touches an already-shown label, the
  higher cell key hides.** Default (Opus). Closes the milestone 9 overlap
  item. Side effect, accepted: a tower next to a clash can end up with no
  label; a label still covers the top of the tower directly below it.
- **A tower panel avoids only its own tower's label; it may cover a
  neighbour's.** Accepted (Fable). Panels are transient.
- **A one-sentence tense fix in docs/DESIGN.md ("joined the bar") is kept.**
  Fable.

## 2026-11-21, milestone 12 (balance pass v2)

- **v2 balance targets met with six number changes, each proven necessary
  by a one-at-a-time revert matrix (implementer, repeated by the verifier):**
  Longbow damage 6 to 4; Troll hp 500 to 700 and bounty 11 to 8; Trolls in
  waves 7, 8, 9 from 7, 4, 4 to 10, 8, 6. Nothing else moved. Results: no
  towers wave 2; lazy wave 7; Longbow spam wave 9; combo won with 11 lives
  and 136 gold entering wave 10; combo without Fire Pots won with 2 lives.
  Default (Opus, accepted by Fable).
- **Kid archetypes now "spread along the trail": walk the path in 96 px
  steps from distance 96 and take the nearest unused buildable cell within
  72 px.** Fable (rule), Opus (implementation), verified with an independent
  walk. Supersedes the milestone 8 "kid band", whose first towers sat at the
  map edge. Side effect: a kid build caps at 16 towers.
- **A v1-towers-only build (`soundBuild`) now loses on wave 9.** Accepted
  (Fable): ignoring three of six towers should cost the game. Kyle's play
  notes decide.
- **The browser win tests replay `comboBuild`, so `runScript` accepts it.**
  Default (Opus). Only game-code change in this milestone.
- **`docs/SCOPE-v2.md`'s tower table keeps its starting numbers; `docs/DESIGN.md`
  is the spec.** Fable. SCOPE-v2 says the balance pass retunes them.

## 2026-11-21, milestone 13 (ship v2) and close of v2

- **v2 is complete at milestone 13.** Fable. Remaining evidence, Kyle's to
  give: finishing a game with the new towers from the public link, and play
  notes on the milestone 12 balance (including that a v1-towers-only build
  now loses on wave 9).
- **Demo order:** two Longbows before wave 1, Tar Pit before wave 2, Fire
  Pot before wave 3, Mortar mid-wave 4, because that is what 100 starting
  gold plus bounties affords. Default (Opus), planned headlessly first.
- **Next candidates, none started:** Kenney CC0 art, a second map, a second
  upgrade tier. Kyle decides.

## 2026-11-21, v3 approved

- **v3 scope approved with all defaults** (`docs/SCOPE-v3.md`): tablet
  play, an event-driven animation engine, CC0 pixel art chosen from mockups
  at milestone 15 (Ninja Adventure the default candidate), music with a
  mute button, iPad landscape first, a 20 MB size budget. Kyle.
- **Tiny Swords excluded.** Fable, from the license page: the free pack
  forbids redistribution and its monsters are a paid add-on, so it cannot be
  committed to a public repo.
- **Only CC0 or credited CC-BY assets are committed; a manifest check
  enforces it from milestone 15.** Fable.

## 2026-11-21, milestone 14 (tablet and touch)

- **Canvas stays 960 x 580 and scales to fit with letterboxing; every
  button is 42 canvas px tall (44.8 px on an iPad at 1024 wide); the HUD
  stays 100 px by trimming paddings.** From `docs/SCOPE-v3.md`; numbers in
  the DEVLOG.
- **Touch: first tap arms a cell (ghost and range), second tap on the same
  cell builds, tapping elsewhere moves the arm; changing or clearing the
  pick disarms; after a touch build the pick stays and the arm clears; any
  mouse input switches back to mouse mode; touch moves are ignored.**
  Default (Opus, accepted by Fable).
- **Portrait shows a DOM "turn your device" card and pauses ticking; any
  window taller than wide counts.** Default (Opus); narrow desktop windows
  get the card too, accepted.
- **Phones in landscape run at about 0.67 scale (28 px buttons): best
  effort, as scoped.** Fable.
- **Not verified on a real iPad or Safari;** Chromium touch emulation only.
  Kyle's wave on the iPad is the remaining evidence.

## 2026-11-21, milestone 15 (art source spike)

- **Two CC0 packs inventoried: Ninja Adventure (license file CC0 1.0) and
  0x72 DungeonTileset II (CC0 on its itch.io page; no license file in the
  zip, so manifest rows cite the page).** Fable and Opus.
- **Licensing and size checks are in CI:** `check:assets` fails on any
  file under `assets/` or `docs/art/` that is missing from the manifest or
  not CC0 / credited CC-BY; `check:size` fails when `dist/` exceeds 20 MB.
  Both proven to fail on purpose by implementer and verifier. Fable.
- **Mockups A (Ninja Adventure at 3x and 2x), B (0x72 enemies over our
  shapes) and C (our shapes, animated in code) are committed under
  docs/art/mockups for Kyle's choice.** Implementer's recommendation: A at
  2x with renamed enemies. Risks logged: Troll no bigger than Goblin at 2x,
  cannon and mortar as people, hit and death animations in code, Retina
  blur unless nearest-neighbour filtering, Hyena has side frames only.
- **Open: Kyle's choice of style.** Nothing from the packs is copied into
  the repo until it is made.

## 2026-11-21, reorder after the art spike

- **Art choice: pixel placeholders now, "stop-motion tabletop" quality
  later.** Kyle. Milestone 16 builds the animation engine with Ninja
  Adventure sprites as stand-ins (names stay Goblin, Wolf, Troll). The
  eventual art is pre-rendered from 3D clay-style models (Blender, scripted
  by agents, rendered on Kyle's VPS), which needs the roster frozen first.
- **Order from here:** milestone 16 (engine only), then v4 (gameplay lock:
  new enemies, boss, targeting modes, difficulty, endless, maps), then v5
  (the tabletop art pipeline plus the art, sound, juice and world passes
  moved from v3 milestones 17 to 20). Kyle.
- **Troll placeholder may render at 3x so it reads bigger than the Goblin;
  everything else at 2x with nearest-neighbour filtering.** Fable.

## 2026-11-21, milestone 16 (animation engine)

- **The simulation emits `state.events` each tick (spawn, hit, burn,
  slowed, kill with cause, exit, build, upgrade, sell, waveStart, waveClear,
  won, lost); the renderer animates from them.** From `docs/SCOPE-v3.md`.
  Action events survive until the next tick; readers use a cursor.
- **Play renders with WebGL, test mode with Canvas; `pixelArt` and
  `roundPixels` on; tweens and particles off in test mode and killed
  sprites removed at once, so screenshots stay exact.** Default (Opus).
- **Placeholder sprites: GreenPig as Goblin at 2x, Hyena as Wolf at 2x,
  Cyclope as Troll at 3x, imported with Vite `?url` so only used files
  ship.** Default (Opus). Tar and burn show as rings in both renderers and
  additionally as tints in WebGL (Canvas cannot tint).
- **Verifier finding, fixed: the Hyena frames face right, so the Wolf is
  mirrored for left only.** The implementer had it backwards and its devlog
  note said the opposite; the verifier's probe caught it. Sonnet.
- **Display names live in one table (`src/game/names.ts`) from milestone
  22 on; internal ids never change, and no test pins a display string
  except through that table.** Kyle wants to be able to rename everything
  later; this makes a rename a one-file edit plus a baseline regeneration.
- **Known: `pixelArt` scales the whole canvas with nearest-neighbour, so
  HUD text may look jagged on the iPad.** Kyle checks; if it bothers him,
  the fix is to render text at the device scale or revert to smooth
  scaling for the canvas and keep nearest for sprites.

## 2026-11-21, milestone 22 (Harpy and Shieldbearer)

- **Delegation defaults from here: implementers on Claude Opus at medium
  effort; verifiers on Claude Fable at medium effort (a different model
  from the implementer, as the brief requires).** Kyle (Opus medium for
  delegation); Fable (verifier model switch from Sonnet).
- **Harpy and Shieldbearer rules as in SCOPE-v4; wave groups added to
  waves 4 to 8 and 10 only; all milestone 12 targets hold.** Default
  (Opus, verified line by line).
- **`noAntiAir()` plays the combo build through wave 3, then sells its
  Longbows before wave 4.** Default (Opus, accepted by Fable). A build with
  no bows at all dies on wave 2, before any Harpy, so that version proves
  nothing; it is kept as `comboBuildNoBows` and pinned. The sell version
  leaks all four wave 4 Harpies and loses on wave 7.
- **The `new-towers.png` frame moved from tick 1754 to 1490** because the
  wave 5 Harpies shifted the Mortar's shots. Accepted.
- **Fragile: the combo build has 145 gold after wave 9 against the 150
  limit.** Milestone 28 widens the margin.
- **Display-strings rule covers names and end-screen words; HUD prefixes
  ("Gold", "Lives", "Wave", "Next") stay literal.** Fable.

## 2026-11-21, milestone 23 (Grumblefoot)

- **Boss as in SCOPE-v4: hp 4000, speed 25, bounty 150, 5 lives on exit,
  slows capped at 30%; spawns 26 s into wave 10, 4 s after the last Troll.
  The combo build kills him with its existing plan (shot at wave tick
  4639), so his hp was not lowered.** Default (Opus, verified with exact
  arithmetic).
- **Every enemy has a `livesCost` (1, boss 5); `bossSpawn` and `bossDown`
  events exist for the renderer.** Default (Opus).
- **Boss bar at y 24 with the name pill above it (y 4 to 22), not y 12:
  the pill does not fit above y 12.** Opus, accepted by Fable.
- **Long wave previews wrap to two 13 px lines so they never run under the
  Start Wave button.** Opus, found while adding "+ Grumblefoot".
- **Rename rule caveat: Playwright serves the built `dist/`, so a rename in
  `names.ts` needs `npm run build` before `test:e2e`.** Fable.

## 2026-11-21, CI failure on the boss PR and what it changed

- **The live-loop browser test no longer depends on a GPU or on frame
  rate.** It loads `/?renderer=canvas`, needs only 20 ticks in 1.5 s at 1x
  and a 2x rate at least 1.5 times the 1x rate. The WebGL check moved to its
  own test with no timing. Fable (design), Opus (implementation).
- **The coordinator's first diagnosis was wrong.** Fable blamed the 8 tick
  per frame catch-up cap; the implementer read Phaser's frame-timing code and
  showed that for its first 120 frames Phaser clamps every frame to 16.67
  ms, so a slow runner simply runs slow regardless of our cap. The cap was
  raised to 20 anyway and the accumulator became a tested pure function
  (`src/game/loop.ts`), which also fixed a 14-instead-of-15 rounding bug.
- **Playwright's port comes from `PW_PORT` (default 4173) and never reuses
  an existing server.** Fable. Two worktrees ran browser tests on the same
  port at once and could have tested each other's builds; one agent killed
  the other's preview server. A busy port now fails loudly. Parallel
  checkouts set their own port.
- **Process rule: when two agents work in parallel worktrees, each gets its
  own `PW_PORT` in its brief.** Fable.

## 2026-11-21, milestone 24 (targeting modes)

- **Modes: first (default), last, strongest. Ties: first and last go to
  the lower id; strongest goes to the enemy further along, then the lower
  id. Eligibility (range, Mortar minimum range, flying) applies before the
  mode. Changing the mode is free and allowed mid-wave; sell and rebuild
  resets it; an upgrade keeps it.** From SCOPE-v4, tie details by Opus,
  verified with independent geometry.
- **"Strongest" is a situational tool, not a blanket setting.** Fable, on
  the verifier's diagnosis: with every tower on strongest the combo build
  loses on wave 5, because a hit enemy stops being the strongest and each
  tower moves to a fresh one, so wounded enemies walk out (18 exits in
  waves 1 to 4 against 3). Not a bug. The default stays first. Whether the
  panel should hint at this is a v5 polish question.
- **Panel is 214 x 146 with a third 13 px "Target: ..." button; labels
  come from the names table.** Opus. The verifier's rename proof caught one
  spec that hard-coded the labels; fixed.

## 2026-11-21, Kyle's iPad play notes

- **"We got the idea correct"; now make it fun.** Kyle, after playing on
  the iPad. Three additions approved for v4, built before endless, maps and
  the balance lock, as milestones 25a to 25c (`docs/SCOPE-v4.md`):
  drag-to-place with a planning phase (free moves and full refunds until
  Start Wave, 70% after), special attacks (one charge per wave: Powder Keg,
  then Tar Barrel, then Fire Arrows), and a horde retune (more, weaker
  enemies, more gold, same overall challenge) with a call-early bonus and
  tower kill counts.
- **Milestones are numbered 25a, 25b, 25c** so earlier references to
  milestones 26 to 29 stay true. Fable.
- **HUD and bars are plain on purpose until v5.** Kyle is "not in love"
  with how the bar looks and expects it to improve as the theme comes in;
  the HUD skin is part of the v5 art pass. Recorded so v5 treats it as a
  requirement, not polish.
- **Not reported as problems on the iPad:** two-tap placement worked but
  felt clumsy (hence 25a); text sharpness and Safari's toolbar were not
  raised.

## 2026-11-21, milestone 25 (difficulty levels)

- **Easy / Normal / Hard: enemy hp x0.75 / 1 / 1.3 (rounded half up),
  start gold 150 / 100 / 80, lives 25 / 20 / 15. Nothing else scales.
  Normal is byte-identical to before.** From SCOPE-v4; verified against
  every spawn of all ten waves on each level.
- **Title is a menu: three difficulty buttons, Play; Left and Right stop at
  the ends; the choice is remembered for the session, not across reloads;
  end screens gain a Menu button.** Default (Opus).
- **The difficulty tag sits under the wave counter and only when not
  Normal.** Default (Opus), so Normal screenshots do not change.
- **The simulation may take lives below 0 (the boss costs 5); the HUD shows
  0.** Fable verifier found "Lives -1" on screen and fixed the display.
- **Both SCOPE difficulty targets miss with the starting numbers and are
  pinned as they are until milestone 25c retunes them:** the lazy build on
  Easy dies to the boss on wave 10; on Hard the best plan dies on wave 3.

## 2026-11-21, milestone 25a (drag placement and the planning phase)

- **Planning phase: anything built or upgraded in setup is refundable in
  full and movable for free until Start Wave; then everything locks and
  sell is 70%. Towers built mid-wave lock at once.** Kyle (play notes);
  rules by Fable, built by Opus.
- **Selling a locked tower with a fresh setup upgrade pays that upgrade in
  full plus 70% of the rest.** Fable, after the verifier showed the first
  version cost an inattentive player 11 gold versus pressing Undo first.
  Proven not exploitable: seeded 200-action walks conserve gold exactly.
- **Drag from the bar to place; drag an unlocked tower to move it. On touch
  the ghost aims 48 px above the finger with a line to it; the drag is
  valid whenever the aim point is on the map, even with the finger over
  the HUD, so the bottom row is reachable. Releasing over a HUD button
  never presses it.** Fable, after the verifier found the first rule left
  the bottom row unreachable by drag.
- **A faint red ghost shows over blocked cells during drags; a mouse drag
  cancels if a move arrives with no button down.** Fable and Opus.
- **Unlocked towers have a dashed outline (3.9:1 against grass).** Opus.

## 2026-11-21, milestone 25b (special attacks)

- **One charge per wave, granted at Start Wave, gone at wave clear, never
  more than one. Powder Keg from wave 1, Tar Barrel from wave 4, Fire
  Arrows from wave 7, with the SCOPE starting numbers.** Kyle (idea),
  Fable (rules), Opus (build).
- **Specials hit flyers (Harpies can be tarred and burned by specials, not
  by towers) and ignore shields; the boss slow cap applies.** Fable.
- **A special fired at empty ground still spends the charge.** Accepted
  (Fable): one charge per wave means aim matters.
- **Locked specials are not listed in the popup; with one unlocked the HUD
  button selects it directly. The mouse fires on press; touch fires on a
  second tap within 24 px or on drag release, with the 48 px lift.**
  Default (Opus).
- **For 25c:** the Tar Barrel does nothing to an enemy already under a
  stronger tower slow, and a later tower slow can cut its 4 s short; decide
  whether special slows get their own channel. The informational
  `comboWithKegs` policy hits once in ten waves, so 25c needs a
  cluster-seeking policy before it balances around specials. The keg flash
  is brief; v5 effects pass.

## 2026-11-21, milestone 25c (horde retune, call early, kill counts)

- **Two passes. The first made the waves denser, not longer, and went
  back.** The first brief set no target for wave length or crowding
  (coordinator's slip, Fable). The result met every balance target but ran
  381 s of wave time against 405 s before, with up to 47 enemies alive and
  one unreadable band of sprites on wave 8. The verifier measured it; Kyle
  had asked for longer waves. The second pass added the rules below.
- **Wave rules.** In any 3 s of a wave at most 6 walkers and 4 flyers
  spawn (window `[t, t + 3 s)`); every wave clears at least 15% later
  than before 25c for the combo build on Normal; the ten waves take 540 to
  800 s; at most 35 enemies alive at once without early calls; 2.0 to 3.0
  times the old enemy count; spawn window at most 90 s. Result: 524
  enemies (217 before), 614 s, peak 22. Fable (rules), Opus (numbers).
- **Enemy numbers.** Goblin hp 30 to 19, Wolf 28 to 20, Troll 700 to 900,
  Harpy 40 to 36, Shieldbearer 120 to 70; bounties Goblin 4 to 2, Wolf 5
  to 2, Harpy 7 to 3, Shieldbearer 9 to 5; Fire Arrows burn 10 to 30 per
  second; boss at 65 s. No tower number changed. Opus, checked by Fable's
  revert matrix.
- **Easy 30 lives (was 25). Hard hp multiplier 1.2 (was 1.3).** Opus.
- **Hard hp rule: no Hard hp sits 1 or 2 above a multiple of a tower's
  damage (12, 4, 25, 45).** The first pass gave the Hard Goblin 13 hp
  against the Musketeer's 12, so every Musketeer opening lost Hard on wave
  1. Fable (rule), Opus (numbers). Easy is outside the rule.
- **Hard is a different plan, not the same plan with less room.** The
  combo build loses Hard on wave 8; the bow-heavy `hardBuild` wins with 9
  lives. Accepted for now (Fable); Kyle's play notes decide in milestone
  28.
- **Skipping anti-air survives the lesson wave.** It leaks all ten of
  wave 4's Harpies, keeps 2 lives, and loses on wave 5. The first pass
  lost the whole game on wave 4, which is too harsh for a child. Fable.
- **Gold entering wave 10: under 200 for the combo build (was under 150
  since milestone 12).** Raised by the coordinator in the 25c brief
  because hordes pay more per wave; it was not recorded until the
  verifier pointed it out. Result 175. Fable.
- **Call early.** Allowed once every enemy of the running wave has
  spawned; pays the 25 clear bonus plus `min(20, ceil(20 - seconds since
  the last spawn))`; old-wave survivors stay and the next clear check
  waits for them; the special charge resets to 1; wave 9 cannot call the
  boss wave. Fable (rules), Opus (build).
- **Calling early is always better for a build that is ahead, and that is
  accepted for now.** Combo on Normal goes from 13 to 18 lives, 160 bonus
  gold, 464 s instead of 614. It rewards a strong defence and shortens the
  game; whether it should carry risk is a play note for Kyle. Fable.
- **Kill counts.** Each tower counts its kills; a burn kill counts for
  the tower on the owner cell, and for nobody if that tower was sold.
  Fable (rule), Opus (build).
- **The Tar Barrel has its own slow channel**, so a stronger tower slow no
  longer wastes it. Fable.
- **`spawnHorde` works only with `?test=1` or `?perf=1`.** Verifier's
  finding; `?perf=1` only adds enemies. Opus.
- **For milestone 28 (balance lock):**
  - Three waves pass 100 s at 1x without calls (7, 8 on Hard, 10).
  - The Tar Barrel changes nothing measurable on Normal, and the keg does
    more than the barrel on Hard; Fire Arrows alone make specials matter.
    `comboNoSpecials` is one life behind the combo.
  - Tar Pits help (soundBuild lasts 534 ticks longer with them; on Easy
    tar wins and no-tar loses) but only a verifier probe pins it.
  - One Musketeer leaks 12 of wave 1's 20 Goblins on Normal; two leak
    none. A first-time player may lose lives on wave 1.
  - Thin edges: lazyBuild on wave 8, Hard combo on wave 8, Hard lazyBuild
    on wave 5. `bossRush` is now the same game as the combo.
  - The A1 spawn limit sits exactly at 6 on waves 6 and 8.
- **For the next implementer brief:** the perf spec's "100 alive" check
  samples right after the top-up and cannot fail; `?perf=1` is documented
  only in a code comment; stale comments in `src/sim/difficulty.ts:24`
  and `src/sim/enemies.ts:5`.

## 2026-11-21, milestone 26 (endless mode and high score)

- **Endless hp grows 1.6 times every three waves, not the scope's 1.15.**
  At 1.15 the combo build with no new purchases lived to wave 25 and a
  build that kept spending played 78 more minutes. At 1.6 the idle build
  loses on wave 15 and a spender gets about 12 endless waves in 18
  minutes on Normal. Opus proposed it against the coordinator's targets
  (idle loses on 11 to 16); Fable accepted it after the verifier's scan of
  1.15, 1.3, 1.45 and 1.6. The verifier calls 1.6 a little steep, with a
  cliff at the end (lives 12, 4, 0 over three waves); 1.45 gives 16 waves
  in 23 minutes. Kyle's play notes decide in milestone 28.
- **Generated waves.** Waves 8, 9 and 10 repeat without the boss, plus
  `min(16, 8 + 2 * cycle)` Harpies after the base wave's last spawn. The
  90 s spawn-window limit does not apply; the spawn-rate rule does. Fable.
- **Keep going is offered only on the win screen.** The game then ends
  only by losing. Call early and specials work as before. Fable.
- **Score is waves cleared, derived from the state, not stored in it.**
  Saved at every wave clear, per map and difficulty, under `tarpit.best`;
  a normal win scores 10 and a loss on wave 7 scores 6. A save rewrites
  the stored value, dropping anything it did not understand. Storage
  failures fall back to memory for the session. Fable (rules), Opus
  (build).
- **The lose screen says "Reached wave 15" and the title then says "14
  waves".** Both are true (reached against cleared). Accepted (Fable);
  the v5 HUD pass can reword.
- **The next-wave preview merges repeated types** ("24 Harpy"). Default
  (Opus).
- **A flaky Play click became a check.** On a first visit the title scene
  is active one frame before Phaser makes its buttons clickable, so a test
  clicking in that frame lost the click (4 of 8 full runs for the
  verifier; also on main). Players are not affected: the frame is not
  drawn yet. Now the title reports ready at its first rendered frame,
  every spec waits through one shared `waitForTitle`, and
  `e2e/title-ready.spec.ts` pins the cause. Fable (verifier) found it,
  Opus fixed it, Fable re-ran 8 of 8 clean.
- **For milestone 28:** the growth number; endless hp ignores the Hard hp
  rule; `endlessGreedy` stops buying after wave 14, so it is not a
  ceiling for a good player.

## 2026-11-21, milestone 27 (maps and the map picker)

- **Waypoints.** Switchback `(0,96) (560,96) (560,192) (320,192)
  (320,288) (560,288) (560,384) (960,384)`, 1728 px. Riverbend `(0,384)
  (300,384) (300,96) (660,96) (660,384) (960,384)`, 1536 px, with an
  unbuildable river x 416..544, y 160..480 (40 cells). Meadow unchanged,
  1584 px. Buildable cells 344, 334, 312. Fable chose them; Opus built.
- **The brief described the shapes wrongly, three times** (coordinator's
  slips, Fable). It called Switchback "three U-turns" and said three rows
  sit between two lanes: it has two U-turns and a step, and rows 4 and 7
  sit between lanes. It called Riverbend "a wide S": it is an arch. The
  implementer tested what is true and reported the difference; the paths
  stay as built and the docs say what they are.
- **The map travels with the game.** `createGame({ map })`; no global map.
  Meadow's sim output and game frames are identical to before. Fable
  (rule), Opus (build), checked by Fable's independent mask.
- **Water blocks only building** (refusal reason `water`); shots, ranges,
  specials and flyers ignore it. The river is drawn filling its cells so
  every refused cell looks like water. Fable.
- **Title: a Map row of three thumbnails; Up and Down change the map and
  stop at the ends; the best line names map and difficulty.** Default
  (Opus). Scores are kept per map.
- **Archetype scripts without a plan for a map throw** instead of playing
  Meadow's cells there. Verifier's finding (Fable), fixed by Opus.
- **Left as is:** a tower in Riverbend's bottom-left cells opens its panel
  over the spawn lane; no nearby position avoids the lane. For the v5 HUD
  pass. Tower labels hide stacked towers on Riverbend's banks, as on
  Meadow. Wolves and the boss have no up or down frames.
- **For milestone 28 (verifier's gap list):** Switchback is too easy
  (lazyBuild loses on wave 9, combo wins with 18 lives and 215 gold after
  wave 9, and the Normal plan beats Hard); on Riverbend specials hurt (8
  lives with them, 14 without), so its special ticks or plan need a second
  pass first; noAntiAir on Riverbend has 1 life after wave 4; Hard
  lazyBuild loses on wave 2 on both new maps; no per-map `hardBuild`
  exists. Several whole-game unit tests take 4 to 9 s.
- **One 30 s unit test limit in `vitest.config.ts`; no per-test limits.**
  A whole-game test timed out at the 5 s default on CI (about 1.7 times
  slower than the Mac), the third such timeout in three milestones.
  `npm run test:slow` lists tests over 3 s so the bigger limit does not
  hide them. Fable (rule), Opus (build).

## 2026-11-22, milestone 28 (balance lock)

- **Maps may differ in difficulty.** Switchback is the gentlest and
  Riverbend the hardest, inside shared target bands, with no per-map
  enemy, tower, gold or lives numbers. Fable.
- **Targets (every map).** Normal: noTowers loses by wave 3; lazyBuild
  loses on 6 to 9; longbowSpam loses on 7 to 9; comboBuild wins with 5 to
  18 lives; no Fire Pot and no specials are each strictly worse;
  noAntiAir leaks 75% of wave 4's Harpies, survives it, loses on 5 to 8;
  one Musketeer leaks at most 6 on wave 1. Easy: lazyBuild wins with at
  least 8 lives; noTowers loses; one Musketeer leaks at most 3 on wave 1.
  Hard: the map's `hardBuild` wins; lazyBuild survives wave 1 and loses by
  wave 5; the Normal combo plan has 5 fewer lives or loses on wave 8 or
  later; the Hard hp rule. Meadow only: under 200 gold entering wave 10,
  and tar has to matter (Tar Pits and the Tar Barrel each change the
  result). All met, pinned as a 108-cell matrix. Fable (targets), Opus
  (numbers), Fable's independent replay matched every cell.
- **Numbers changed:** wave 1 Goblin interval 1.2 s to 2.5 s; Goblin hp
  19 to 23; Troll hp 900 to 950; Tar Barrel slow 240 to 210 ticks; Easy
  lives 30 to 35. Each one alone breaks a target if reverted (verifier's
  matrix), except Easy lives, which is a margin choice: the simple build
  won Easy with 4 and 5 lives on two maps, and Easy is for young
  children. Opus (first four), Fable (Easy lives, on the verifier's scan).
- **Wave 1 is deliberately gentle, and open.** One Musketeer now stops all
  of wave 1 on Easy and Normal (it leaked 12 of 20). The cost: one Goblin
  on screen at a time for 48 s. 2.0 s spacing also leaks nothing, but then
  the cheapest Hard opening dies on wave 1 again. Kept at 2.5 s (Fable);
  Kyle decides after playing.
- **Scripted specials come from a stored per-wave search**
  (`npm run sim:specials`), so a scripted special never does worse than
  firing nothing. The old cluster policy made Riverbend's combo worse (8
  lives against 14 without). Fable (rule), Opus (build).
- **Hard depends on well-aimed specials.** `hardBuild` with no specials
  wins Meadow with 2 lives and loses Riverbend on wave 8. Accepted
  (Fable): Hard is meant to be hard. A play note for Kyle.
- **`docs/DESIGN.md` is the frozen spec.** One document in the present
  tense, guarded by `designSpec.test.ts` (tables parsed from the markdown
  and compared with the code). A change to a number or rule needs an entry
  here and the pins updated. It is frozen before Kyle's play notes exist,
  which the scope listed as evidence; his notes can reopen it. Fable.
- **Open for Kyle's play notes:** wave 1 spacing; calling early is always
  better; endless growth 1.6 (1.45 is gentler); three waves pass 100 s;
  Hard needs a different plan and good special aim.
- **Removed:** `bossRush` and `comboWithKegs` (duplicates of other
  archetypes). Opus.

## 2026-11-22, milestone 29 (ship v4) and Kyle's second play notes

- **Kyle played the live build on all three difficulty levels** (not
  every map) and said the gameplay is solid and on track. He did not
  report an endless run, so that part of milestone 29's evidence is not
  claimed. Kyle.
- **Wave 1's pace is accepted** (he speeds it up when it feels slow).
  Calling early and the endless growth drew no complaint; they stay as
  built. Kyle (notes), Fable (reading).
- **Specials felt useless and hard to use**: he could not tell how to
  place one or whether it landed. The one part of v4 that felt off. Kyle.
- **Approved for the next milestone (30):** rework specials (clear aim
  flow, lasting visible effects, more power: a charge that refills on a
  timer, tar and fire that stay on the ground, bigger circles); Cannon
  range 90 to 105; hold the speed button for 3x (Kyle floated a 1 to 2
  slider; Fable recommended tap for 1x and 2x plus hold for 3x); a gold
  cheat (tap the Gold number five times for +500; a cheated run saves no
  best score). Kyle asked for all four; Fable chose the details, and Kyle
  said to make such calls and he will object if he dislikes one.
- **Then v5, "cooler", in this order:** hit and death effects, sound, a
  living map, towers with personality, a tabletop-art spike, a themed
  HUD. Kyle agreed with the list; the theme stays loose for now.
- **Subagents default to Opus at medium effort or cheaper; verifiers move
  from Fable to Sonnet** (still a different model from the implementer).
  Kyle, to tighten usage. Docs-only work gets a lighter check.
- **Two records that were missing.** The coordinator's commit trailers
  changed from Fable 5.1 to Fable 5.2 at `0f6a69d` (PR 24) when Kyle
  noticed the session had been on 5.1; no entry was made then. And twice
  the coordinator started a merge before CI had finished (PR 18, refused
  by branch protection; PR 24, where a background wait printed MERGED
  while CI had failed and nothing had merged). Since then the wait, the
  merge and a state check run together and the state is confirmed after.
  Fable.
- **The automated Codex review on every PR was never read** until the
  milestone 29 verifier found it. Two cosmetic findings are still open and
  go into milestone 30. The coordinator now reads it on every PR. Fable.
- **README corrected by the coordinator** after the Sonnet fact-check
  (wording only; every number had matched). Fable.

## 2026-11-22, milestone 30 (specials rework, Cannon, 3x, gold cheat)

- **Specials: a shared charge that is ready at each wave start and
  refills 20 s of wave time after use; Tar Barrel and Fire Arrows leave a
  ground zone for 8 s (60 ticks of linger) that affects everything inside,
  flyers included; radii 90, 100, 90.** Kyle (complaint), Fable (design in
  SCOPE-v5), Opus (build and numbers). Zone time is 8 s, not the scope's
  5 s starting number: at 5 s specials did not matter enough.
- **Powder Keg damage 80 to 30; Fire Arrows burn 30 to 20 per second.**
  At 80 the keg killed Harpies and broke the anti-air lesson; at 30 it
  still kills every Goblin and Wolf in a bigger circle but barely marks a
  Troll. Opus, confirmed by Sonnet's revert runs. A play note for Kyle;
  the alternative is a stronger keg that does not hit flyers.
- **Aim: banner, circle on the pointer, one tap or release fires; the
  lifted circle decides where it lands.** The scope's first draft said a
  release over the HUD cancels; that made the bottom rows unreachable by
  hold, so Fable changed it during the build and the scope now says so.
- **Seeing it land:** blast, shake and scorch mark; a tar puddle and a
  burning patch drawn for the zone's life; an "N hit" or "Missed" label;
  the button reads "Wait 15s" while it refills. Fable (asks), Opus.
- **Headless builds fire specials by one person-like rule** (when ready,
  at a crowd of 3 or more; tar and fire take turns on crowds with a Troll
  or the boss, otherwise the keg). The stored per-wave search from
  milestone 28 is deleted. Fable. Measured on Meadow, Normal: 28 specials
  in ten waves, 19% of all kills.
- **Targets changed:** T6 is now "at least 3 lives better with specials,
  and a build with none still wins Normal on every map"; S2 (removing any
  one special makes the Meadow combo strictly worse); S3 (at least 15
  specials a game, most catching 3 or more). T4's band is 5 to 19: on
  Switchback the combo wins with 19, T4 and T6 could not both hold at 18,
  and T6 is the owner's requirement. Fable.
- **Cannon range 90 to 105 at both levels.** Kyle. No target depends on
  it.
- **Speed: tap for 1x and 2x, hold 300 ms for 3x while held.** Kyle
  (idea), Fable (form).
- **Gold cheat: five taps on Gold within 2 s give 500; the run is marked
  and saves no best score.** Kyle (cheat), Fable (marker and score rule).
  Ten quick taps give 1000.
- **Known and accepted:** the Tar Barrel is the least felt special (it
  only slows); the policy stops using the keg from wave 7; an early call
  refills the charge at once; inside a fire patch the patch's burn
  replaces a Fire Pot's, so those kills count for the special; thin
  margins (hardBuild wins Hard on Riverbend with 2 lives; 199 gold against
  a 200 limit on Meadow); some prose numbers in DESIGN.md are not guarded
  by the spec test. Sonnet (findings), Fable (accepted).
- **Kyle's third play notes:** the right type of game, expand it; no new
  map types for now; a story mode later; the coming upgrades will show
  whether the direction needs to change. He asked how to make it easier
  to play on a phone held upright and easier to get to. Fable proposed a
  portrait layout and home-screen install; not yet chosen. Kyle.
- **A stuck 3x speed, caught by the automated PR review, fixed before
  merge.** A speed hold released outside the window never ended. The
  implementer and the verifier had both missed it; milestone 25a had fixed
  the same hole for tower drags. Now the hold ends on a lost release, a
  cancelled touch, or the window losing focus. First PR on which the
  coordinator read that review before merging. Codex (finding), Opus
  (fix), Sonnet (recheck).

## 2026-11-22, milestone 31 (effects)

- **Order: effects first, then the phone layout.** Kyle ("the animation
  should help too").
- **Effects are drawing only.** Shots stay instant in the rules; a drawn
  projectile takes 110 to 320 ms and its impact is drawn on arrival. The
  balance report and every screenshot baseline are unchanged; test mode
  draws no effects. Fable (rule), Opus (build), Sonnet (checked).
- **Sent back once for size.** The first pass met the scope but its shots
  could hardly be seen and the boss death was one small ring. Projectiles
  were doubled, given trails and brighter impacts, and the boss death made
  the biggest effect in the game. Fable (judged from frames).
- **An enemy killed by a shot still in flight keeps walking until it
  lands** (drawing only; it costs no life). It replaced a freeze of up to
  0.4 s on mortar kills. Fable (ask), Opus.
- **Shakes move only the map, inside the canvas, and the HUD stays
  still;** all shakes, the darkening and full-screen flashes are off under
  reduced motion, including the Powder Keg's. Fable (ask), Opus.
- **Known and accepted:** under 20 times CPU throttling effects cost 17 to
  20% of frames, nothing at 6 times, and the performance floor still
  holds; the iPad is the real check, and it is Kyle's. A click in the very
  frame a shake starts is dropped (pinned as a `test.fixme`). In a packed
  horde splash rings and gold labels overlap. Musket balls are the hardest
  shot to see. Sonnet (findings), Fable (accepted).

## 2026-11-22, milestone 32a (install and offline)

- **The phone work is two milestones: install first, then the portrait
  layout.** Fable; Kyle asked for an easy way to get to the game and for
  vertical play.
- **Installable:** a manifest with relative start address and scope (the
  same file is right under `/` and `/tarpit/`), iOS tags, and an icon (a
  stone tower beside a tar pool) drawn by `scripts/make-icons.ts`. The
  asset check accepts MIT only for files made by a repo script. Opus.
- **Offline by a hand-written service worker, no dependency.** Each build
  has its own cache, filled whole at install; the page is network-first
  and built files are cache-first; a new worker takes over at once and
  deletes old caches. Never registered in the dev server, under `?test=1`
  or `?perf=1`. Fable (rules), Opus (build).
- **Three gaps found by the verifier and fixed before merge:** a hanging
  network left a blank page (now a 3 s limit, then the cached game); a
  404 or 5xx for the page replaced the cached game (now it falls back);
  there was no way to retire a bad worker (now `TARPIT_SW=off` builds a
  worker that deletes its caches and removes itself, and DESIGN.md states
  the recovery path). Sonnet (findings), Opus (fixes).
- **Accepted:** the kill switch reloads open pages once, which loses a
  game in progress (an emergency tool); a slow network can delay a new
  deploy by one open; one unexplained failure of the two-tab update test
  in a full local run, not reproduced in sixteen reruns, to watch on CI.
  Sonnet (findings), Fable.
- **Not testable here:** Add to Home Screen itself, a real notch, iOS
  storage rules. Kyle's devices.
- **The kill switch and cache cleanup touch only this copy of the game.**
  The automated PR review found the kill switch would unregister every
  service worker on the origin (GitHub Pages project sites share one);
  the implementer's wider check found cache cleanup had the same reach in
  three places. Cache names now carry the scope path and registrations are
  matched by exact scope. Codex (finding), Opus (fix and wider check),
  Sonnet (rechecked by reverting each part).

## 2026-11-22, milestone 32b (portrait layout)

- **A window taller than wide gets a portrait layout; the "turn your
  device" card is gone.** The canvas is 480 by 1194: a status strip, the
  map turned a quarter turn clockwise so the trail runs down the screen,
  a row of six tower buttons and a row with Special, Start Wave and speed.
  One layout object owns every world-to-screen conversion; landscape is
  the identity and is byte-identical to before, as is the simulation.
  Kyle (ask), Fable (design), Opus (build), Sonnet (all 450 cell mappings
  checked).
- **Sizes on a 390 px phone opened from the home screen:** buttons about
  45 px, map cells about 20 px, the game 307 px wide with side bars. In
  Safari with its bars buttons are about 39 px; the home-screen icon is
  the intended way to play on a phone. Accepted (Fable). Whether placing
  on 20 px cells needs a magnifier is Kyle's phone test.
- **Portrait tower buttons show the tower's shape and cost, no name; map
  labels are dropped in portrait.** Names do not fit. Opus proposed,
  Fable accepted.
- **Turning the device mid-game keeps the game** (it may clear a
  selection, a drag, a panel, aiming, and returns to 1x). Fable.
- **Found by the verifier and fixed before merge:** two layout switches in
  one frame lost the game (restart requests now merge and use the latest
  window shape); a shake pulled the status strip into the map (portrait
  shakes sideways only); Menu plus a switch in the same frame left two
  scenes running (a leaving scene ignores switches). Sonnet (findings),
  Opus (fixes).
- **The lift is 48 px on screen in portrait** (it was 48 canvas px, about
  27 px on a phone, under the thumb). Landscape keeps 48 canvas px so the
  tablet layout does not move. Fable (ask), Opus.
- **While aiming in portrait the instruction replaces the next-wave line
  in the status strip;** on touch it drops "Special again cancels" for
  space. Fable (ask), Opus.
- **Known:** Wolves and the boss have only side-view frames, so they walk
  down the screen sideways (placeholder art). The tower panel hides part
  of the trail. An upright iPad uses about half its width. Sonnet.

## 2026-11-22, milestone 33 (sound)

- **Sounds are made in code, with no audio files.** Kyle chose this over
  a downloaded pack. 35 short synthesized sounds on the Web Audio API,
  following the same events as the effects; an impact sounds when its
  projectile lands. No music. Kyle (choice), Fable (scope), Opus (build).
- **Kyle listened to the rendered file and accepted the sounds for now;**
  they can be changed later. He will mostly play muted and asked that
  muting be easy. Kyle.
- **Mute is one tap and remembered:** a speaker button on the title and
  in the game in both layouts, the `M` key, stored under `tarpit.muted`.
  The default stays on, so children hear the game without finding a
  setting. Fable.
- **Tuned once before Kyle heard it,** from the implementer's own list of
  weak spots: low sounds given a mid layer so they carry on a phone
  speaker (they keep at least half their level with everything under
  200 Hz removed); the smallest sounds share a budget of 20 starts a
  second so a horde does not rattle (21 a second at 1x and 24 at 3x, from
  33 and 90). Fable (asks), Opus, Sonnet (re-measured with its own
  filter).
- **Sound starts on the first tap and never before; test mode is silent;
  a missing or failing audio engine means a silent game.** Phaser's own
  sound manager is off. Opus, checked by Sonnet.
- **To make room for the mute button** the landscape build buttons went
  from 148 to 140 px wide and the portrait Start Wave from 214 to 170.
  Opus.
- **Open, for a real phone:** an iPhone on silent silences the game (the
  normal behaviour for web audio); a sound on the very first tap may be
  dropped while audio starts. Accepted (Fable).

## 2026-11-23, milestone 34 (a living map) and Kyle's phone notes

- **The map is drawn with texture, growth and motion; drawing only.** A
  fixed seeded recipe per map: grass patches, tufts, flowers, stones, a
  worn trail; trees and bushes on buildable cells at least 2 cells from
  the trail, hidden when a tower is built on their cell and restored when
  it leaves; water crests, chimney smoke, sway, two cloud shadows, a bird,
  a butterfly and cave eyes. Still in test mode and under reduced motion.
  Kyle (idea), Fable (scope and rules), Opus (build), Sonnet (checked with
  its own geometry and contrast measure).
- **Rulings during the build (Fable, from frames):** growth may sit under
  the transient wave banners (the first rule left the middle of every map
  bare); the river's straight flow lines read as rain and became wave
  crests; ruts made fainter; one repeated tree disc read as polka dots and
  became four shapes in three sizes.
- **Readability margin accepted:** enemies against the ground within 2% of
  before on average and within 10% at the 10th percentile (measured 0.6%
  and 9.6%). Fable.
- **Cost accepted:** none with WebGL. With the Canvas fallback under 20
  times CPU throttling, 17 to 19% fewer frames in landscape and about 46%
  on the phone layout. Players get WebGL. Sonnet (measured), Fable.
- **Kyle played on his phone (2026-11-22).** Placing is easier than on the
  iPad the day before but still not easy, and the page zooms out and is
  hard to centre again. The upright map is fine if it does not hurt play
  (it changes no rule). Specials need a little more damage and to last a
  little longer. Endless should be a little harder. He plans many more
  levels and maps. Kyle.
- **Approved by Kyle:** go from 10 to 20 waves with a reward pick every 5
  waves ("getting something while you complete more levels"). Fable
  proposed the shape (two acts, a second and bigger boss, a pick of one of
  three boons after waves 5, 10 and 15, endless after wave 20) and to do
  it in one balance pass with stronger specials and a harder endless.
- **Next, in order:** phone fixes (no page zoom or scroll, snap to the
  nearest valid cell, a magnifier while dragging), then the 20-wave game.
  Fable.

## 2026-11-23, milestone 35 (phone fixes)

- **The whole page ignores zoom and scroll gestures, not only the
  canvas.** Kyle reported the screen zooming out and being hard to centre
  again. Likely cause: in portrait the game is letterboxed, and a pinch or
  double tap that starts on the page's side bars was a page gesture. It
  cannot be reproduced in emulation. Kyle (report), Fable (diagnosis in
  the brief), Opus (also found the layout was being chosen from a zoomed
  size), Sonnet (checked).
- **Recovery does not depend on Safari resetting the zoom.** If the page
  is zoomed or shifted anyway, the game fits itself to the visible part of
  the page and centres there; rewriting the viewport tag is only a first
  try. Added after the verifier put the odds of the first version at
  about 65 to 70% (about 80% after). Sonnet (finding), Fable (ask), Opus.
- **Snap to the nearest valid cell, touch only:** among the eight
  neighbours of the cell under the lifted ghost, the nearest free
  buildable one; never across the trail, water or the cottage; a cell on
  the finger's side loses to one up to 25% farther. Mouse placement stays
  exact. Fable (rule), Opus, Sonnet (17,640 samples, no crossings).
- **A magnifier while dragging on small screens** (cells under 28 px on
  screen): a 2x view of the target in a top corner away from the finger.
  **A tap near a tower selects it** (within three quarters of a cell).
  Fable (scope), Opus.
- **Accepted:** the magnifier can cover a stretch of trail while a drag
  lasts; a snap can still land near the thumb when the only free cell is
  on that side; while a zoom persists the lift and the magnifier threshold
  are off by the zoom factor. Sonnet (findings), Fable.
- **Only Kyle's iPhone can confirm the zoom fix;** a six-step check is in
  the DEVLOG verifier notes. Fable.
- **From here until Kyle's Claude usage resets (Tuesday), Codex is the
  implementer** for heavy work, run by the coordinator from this session;
  Claude Sonnet still verifies and Fable still coordinates. Kyle, to save
  Claude usage. An `AGENTS.md` carrying the repo's rules is added for it.

## 2026-11-23, milestone 36 (the longer game) and Codex as implementer

- **Codex (gpt-6.2-astra, with gpt-6.2-sol subagents) implemented this
  milestone; Claude Sonnet verified it; Fable coordinated.** Kyle, to
  spend Codex usage instead of Claude usage until his Claude usage
  resets, then back to all Claude. The coordinator runs Codex from this
  session with a written brief; `AGENTS.md` carries the repo's rules for
  it. The rules half ran sandboxed to the project folder (it could not
  commit, so the coordinator committed its work under its name); the
  screen half ran with full access, approved by Kyle, so it could commit
  and run the browser tests. It pushed nothing and changed nothing
  outside the repository (checked by the verifier).
- **Twenty waves in two acts.** Beating wave 10 no longer wins;
  Grumblefoot is the mid-boss; waves 11 to 20 are new; a second boss,
  Grumblemaw, ends wave 20; endless starts at wave 21. Kyle (ask), Fable
  (shape), Codex (tables and numbers).
- **A reward after waves 5, 10 and 15: one of three, the same every game.**
  Kyle ("getting something while you complete more levels"), Fable (the
  nine rewards and what each does), Codex (numbers). Final numbers: Long
  Barrels range +30%, Keen Arrows damage +25%, War Chest 100 gold; Sticky
  Tar slows twice as long, Hot Coals burn +80%, Quick Hands recharge x0.62;
  Stone Walls 3 lives, Veteran Crews fire rate +10%, Bigger Blasts radius
  +40%. Waves 5, 10 and 15 cannot be called over.
- **The first version of the rules went back.** It met every target, but
  the verifier found the final boss was never killed on Normal or Hard (he
  walked out, cost 6 lives, and the game was "won"), four rewards changed
  almost nothing while two were close to mandatory, and a game took 25 and
  a half minutes. The coordinator's targets had allowed all three. New
  targets: a good build kills him; each reward is the best pick for some
  build and no offer has a runaway winner; a game is at most 22 minutes at
  1x. Sonnet (findings), Fable (targets), Codex (fix).
- **Grumblemaw:** 5,600 hp on Normal, 35 px a second, 10 lives if he
  exits, a pack of 8 Wolves at two thirds and one third hp; a killing blow
  calls no pack. Codex, within Fable's targets.
- **Stronger specials** (Kyle: "a little more" damage, "last a little
  longer"): Powder Keg 30 to 60, zones 8 s to 11 s, Fire Arrows burn 20 to
  26. The anti-air lesson target was relaxed to "leaks at least half of
  wave 4's Harpies" because the stronger keg kills Harpies. Fable.
- **Harder endless** (Kyle): hp grows 1.8 times a cycle, was 1.6; the
  reference build with no new purchases loses within 5 endless waves.
- **On screen:** the pick is three cards (click, tap or keys 1 to 3); the
  player sees the word "reward", never "boon" (the game is for children;
  Fable); each card says what it does in a plain sentence built from the
  real numbers; rewards held show as icons. Codex.
- **Known, for Kyle's play notes:** the reference build wins Normal with
  19 of 20 lives on every map, so Normal may be easy for a strong player;
  the wave 10 offer changes little for a bow and mortar build; Longbows
  and Mortars do most of the damage in act 2 in that build; waves 7 and 10
  still pass 100 s. Sonnet (findings), Fable (held for play notes).
