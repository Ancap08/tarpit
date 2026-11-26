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

## 2026-11-23, milestone 37 (a second upgrade with a choice) and Kyle's notes

- **Kyle finished 20 waves on Normal: "a little too easy", and the
  rewards made it more fun.** He asked how to improve the look of the
  pieces and towers, and raised bigger ideas: a castle wall with hp as a
  last defence (archers, grunts, trebuchets), longer maps, hundreds of
  levels with varying challenges, a wall special that holds enemies, and a
  short burst of troops. Kyle.
- **Order agreed with Kyle:** the second upgrade (this milestone); then a
  Barricade special as the first use of one new rule (something on the
  trail with hp that enemies stop at and hit), then troops on the same
  rule; then levels as data with a campaign; then the castle as a level
  type. Longer trails on the same map size are cheap; physically bigger
  maps need a scrolling camera and wait. Fable (order), Kyle (agreed).
- **A second upgrade with a choice of two paths per tower,** twelve rows
  of numbers, one price per tower, a mark on the tower, two buttons in the
  panel with a plain line each. Kyle (approved the idea), Fable (the
  twelve ideas), Codex (numbers and build), Sonnet (verified).
- **It took four Codex passes, and the coordinator's targets were the
  problem twice.** Pass 1 met every target while the two paths played the
  same on Normal and act 2 cost nothing (the targets allowed witnesses
  from Hard and builds that stopped spending). Pass 2 made act 2 hard with
  a cliff (hp x1.13 a wave; 8 lives lost on wave 18 alone) that broke
  endless and 15 other targets, which Codex pinned as accepted misses;
  rejected. Pass 3 replaced the cliff with a slope and reported, without
  pinning, that three targets could not all hold. Pass 4 restated those
  three. Sonnet (findings each time), Fable (targets), Codex.
- **Rules added:** reference builds reinvest their gold by one stated
  rule; from wave 11 enemy hp grows by a per-difficulty share of base hp
  each wave (Easy 0%, Normal 28%, Hard 21.3%); endless continues from wave
  20. Slope and smoothness are now tested: act 2 losses on several waves,
  none over 4 lives, and a 5% hp nudge moves the result by at most 4.
  Fable (targets), Codex.
- **Normal now:** the reinvesting reference build ends with 14, 11 and 14
  lives (it was 19 on every map), losing them across waves 15 to 19.
- **Targets relaxed by the coordinator after three passes** (Fable):
  "no single special may hurt" is information only; "each path wins by 2
  lives somewhere" became "no path is useless or always worse"; the widest
  allowed gap between a tower's paths is 9 lives.
- **Known weaknesses, accepted for now and written into DESIGN.md:** the
  Tar Barrel's charge is usually better spent on the keg or Fire Arrows
  (skipping it gives 17, 12, 20 lives against 14, 11, 14); the Tar Pit's
  path B never beats path A; Cannon, Longbow and Fire Pot paths often tie.
- **The finale was reshaped to meet the targets and needs Kyle's eye:**
  Grumblemaw now walks at 14 px a second (38 before) with a 75 bounty (300
  before), and wave 20 has far fewer escorts. He is on the map about two
  minutes with act 2's hp growth on top. Whether that is an epic slow
  fight or a slog is a play note. Sonnet (finding), Fable (held for play).
- **Art, in parallel (Kyle approved Blender and free packs):** a Blender
  spike showed the tabletop look is achievable by script; Kyle chose the
  painted miniature look; two CC0 packs from kenney.nl were downloaded to
  a scratch folder as style references only (the first is modern
  military, the second medieval and close to the theme). The painted
  Meadow is wired in behind a Look switch on a separate branch (milestone
  38). Kyle (choices), Fable, Codex.

## 2026-11-23, milestone 39 (the Barricade and the blocking rule)

- **One new rule: a blocker on the trail with hp that walking enemies
  stop at and hit.** Each enemy type has an attack (Goblin 6 a second,
  Wolf 8, Shieldbearer 12, Troll 45, Grumblefoot 300, Grumblemaw 400);
  flyers pass over; stopped enemies can still be shot. Kyle's wall
  special, troop burst and castle wall all need it; it is built once, in
  its smallest form. Kyle (ideas), Fable (rule), Codex (build), Sonnet
  (checked to the tick by hand).
- **The Barricade:** a fourth special on the shared charge, unlocked at
  wave 3, 324 hp, snapped onto the trail from up to 40 px, not within
  64 px of the cave or exit, one at a time, no damage. Bosses break it in
  about a second. Fable (design), Codex (numbers).
- **The reference builds do not use it,** so the balance matrix is
  byte-identical. A separate build that does gains 2 to 6 lives on Normal
  at its fixed points. Fable.
- **The strength check became a sweep after the verifier broke the first
  one.** "At most 6 lives better" held at the three points Codex chose and
  failed at others (7 lives on Meadow Hard; a Hard loss turned into a win
  on Switchback). The check now re-places a wall at every point on a 48 px
  grid; hp dropped from 400 to 324 until it held (largest gain 4). Sonnet
  (finding), Fable (restated), Codex.
- **Known:** a player who also spends spare charges on attacks while the
  wall stands can still gain 7 lives on Meadow Hard and win Switchback
  Hard; re-placing walls can hold the last small enemy for as long as the
  player likes (the wave just does not end; nothing is gained). Accepted
  (Fable); play notes decide.
- **A held crowd is drawn as a tight pile at the wall with a count beside
  the wall's hp bar.** The first version stacked fifteen enemies on one
  spot with no count. The coordinator then asked for a fan-out, and Codex
  drew ranks up to 310 px back; the automated PR review pointed out that
  every held enemy is really at the wall, so a Powder Keg aimed at the
  visible rear ranks would hit nothing. Now no held enemy is drawn more
  than 36 px from where it is, and a test ties that limit to the smallest
  blast radius. Fable (the bad ask), Codex review (finding), Codex (fix).
- **For later:** troops need a contact list so a blocker can hit back; a
  castle wall at the exit needs the exit check moved, because a walker at
  the exit counts as out before it can be held. Sonnet (read the code).

## 2026-11-23, milestone 38 (the painted look, behind a switch)

- **Kyle chose the painted-miniature look** from a Blender spike that
  showed clay and painted versions of one Meadow corner beside the current
  game, and said to wire improvements in as we go. Kyle.
- **All of the art is made by script in Blender** (`scripts/art/`), with
  nothing downloaded: the Meadow ground, six towers in 16 bearings, seven
  enemies with four-direction walk cycles, scenery, projectiles and bar
  icons. It rebuilds in about 100 seconds. Fable (approach), Codex (art
  and pipeline), Sonnet (rebuilt it: 104 of 108 files byte-identical).
- **A Look choice on the title, Classic by default, remembered.** Painted
  applies to Meadow; the other maps stay Classic until their art exists.
  Painted files load only when chosen. Classic is pixel-identical to
  before, and the simulation is identical in both looks. Fable (scope),
  Codex, Sonnet (checked).
- **The ground is drawn straight down to match the grid; pieces are drawn
  from a tilted camera and stand on their cells,** nearer ones in front.
  Hit areas, ranges and placement are unchanged. Fable.
- **Sent back three times on what the coordinator saw in frames:** pieces
  half the size they needed to be and melting into the ground (Codex had
  called the phone frame playable; it was not); Harpies too big, Classic
  icons on the build bar, gliding and corner snapping; a green Troll
  beside green Goblins. Fable (judged from frames), Codex.
- **Tower name labels are not drawn in Painted;** the gold ring and the
  path marks carry upgrades. Fable.
- **Slow connections:** the first version missed its 12 s limit on mobile
  data and fell back to Classic every time. Now the smaller files load
  first on a slow connection, with one 25 s limit and progress shown (10
  to 14 s to the first painted frame on Slow 4G and Fast 3G); a banner
  says so if it falls back. Sonnet and Codex (measured), Fable (ask).
- **The asset check now requires the named generator script to exist.**
  Sonnet (finding), Codex.
- **Accepted for now:** with the Canvas fallback under heavy CPU
  throttling Painted is slower than Classic on desktop (182 frames against
  295 in 5 s at 6 times); a big enemy can hide a small one's body in a
  crowd; some foot slide; 54 separate files make the first load slower
  than it need be (a packed atlas would fix it). Sonnet (findings), Fable.
- **Two CC0 packs from kenney.nl** (Tower Defense top-down, Medieval RTS)
  were downloaded to a scratch folder with Kyle's approval, as style
  references only. Nothing from them is in the repo. Kyle (approved),
  Fable.

## 2026-11-23, milestone 40 (Guards, a short burst of troops)

- **Guards: a fifth special on the shared charge, unlocked at wave 6.**
  Four guards on the trail, each a blocker that hits back: 72 hp, 10
  damage a second to one enemy in contact, gone after 12 seconds. A
  Barricade and a squad can stand together. Kyle ("weak-ish inf troops
  that do a little damage, take a little damage and then die off"), Fable
  (rule), Codex (build and numbers), Sonnet (30 hand-computed cases).
- **The blocking rule grew by exactly what this needed:** a list of
  blockers, a blocker that damages one enemy in contact, a blocker with a
  lifetime. One special per tick now applies to every special. Fable.
- **Reference builds do not use Guards;** the balance report is
  byte-identical. Strength is checked by a sweep over trail points.
- **Known, from the verifier's own sweep with sensible timing:** worth 3
  to 6 lives on Normal when cast as a crowd arrives (weak if fired the
  moment the charge is ready), and with the Barricade a skilled player can
  win Hard on Switchback with the Normal plan. Accepted (Fable): aiming
  specials well should be rewarded; play notes decide.
- **Guards are drawn at Goblin size, staggered across the trail,** within
  6 px along and 10 px across of where they really stand, with a test
  tying that to the smallest blast radius. The first version drew them at
  half a Goblin's height in one clump. Fable (saw it), Codex.
- **A real bug fixed on the way:** after a turn from portrait to
  landscape a quick tap could miss, because the canvas was fitted to the
  old size. Codex (found and fixed), Sonnet (confirmed: 6 of 12 failures
  without it, none with it).
- **The disk filled during this milestone** and cut Codex's run off before
  its report; the work was complete and committed. The space was Codex's
  own history folder (24 GB across all of Kyle's projects), not this
  project's temp files. With Kyle's approval the coordinator deleted this
  project's 73 Codex session logs (262 MB) and the art worktree's
  installed dependencies. Briefs now tell agents to keep scratch output
  small, delete it, and leave no wait loops running. Fable.

## 2026-11-23, milestone 41 (a campaign of levels)

- **A level is a small record, and the game can start from one.** Ten
  short levels across the three maps, each bringing in one new thing.
  Today's game is unchanged and is called Free play. Kyle ("100's of
  levels with varying challenges along the way"; campaign first, in the
  agreed order), Fable (the shape), Codex (build), Sonnet (verified).
- **Every level starts with 20 lives and uses one star rule:** a win is
  one star, 12 lives left is two, 18 is three. Codex's first build tuned
  each level with its own lives and thresholds, then with enemy hp scaled
  from 0.55 to 4.10. Both rejected (Fable): a level may change its waves,
  its starting gold and an hp scale between 0.85 and 1.35, nothing else.
  The same lesson as milestones 36 and 37: name the levers that are off
  limits before the tuning starts.
- **Three bots judge a level,** using only what a player can see: a
  capable one, a person-like one (looks at most every 3 seconds, aims at
  the middle of a 48 px cell, picks among its top three cells, fires a
  special up to 1.5 seconds late) and a beginner (cheapest tower, first
  cells, no specials). The levels are tuned to the person-like bot.
  Fable (rule), Codex (bots).
- **The gate judges any level, not the ten we wrote.** `checkLevel` takes
  a level and a context (what it introduces, how hard it is meant to be);
  `checkCampaign` takes any ordered list. The first gate was keyed to
  level ids 1 to 10 and could not have judged an 11th (Sonnet found it).
  This is what lets levels be generated later. A twelve-level test
  campaign passes; scratch levels that should fail do fail.
- **Margins, not knife edges.** A level's new thing must matter with hp
  2% up or down and gold 10 up or down; the stars a level must give must
  hold under the same nudges; wave 1 is never the hardest and has at most
  60 enemies; a last wave has 20 enemies or a boss. Each of these came
  from a Sonnet finding: four levels passed "the new thing matters" by a
  hair, Stand Fast sat exactly on the two-star line, several levels opened
  on a horde of 85 to 165, and the gate accepted a last wave of one
  Goblin and a finale without Grumblemaw.
- **Stand Fast (level 8) is still thin, accepted (Fable):** after the
  retune the capable bot holds two stars at hp 2% up or down and gold 10
  up or down, and loses one at 4% or 20 gold (Sonnet). The margin rule
  moved the edge outward; it did not make the level roomy. Play notes
  decide whether it needs more gold.
- **Known and accepted (Fable):** the person-like bot builds with the
  capable bot's own chooser, so it is a good builder with slow hands, not
  a novice. It beats the hand-written reference build by up to 9 lives in
  Free play and beats the capable bot on level 4. The stars are therefore
  tuned for a capable player. Only play by Kyle and the children can say
  whether that is right; the levers to move are per-level gold and hp
  scale.
- **The screens:** a first screen with Campaign and Free play, a level
  map with ten stops, stars and locks on one screen without scrolling, a
  card before each level, a result screen with stars, the next star's
  target and Next level. Built by a second Codex in its own worktree
  while the first reworked the gate; they met in one merge with one
  conflict, in a document. Fable (brief, merge), Codex (build).
- **A win with the gold cheat saves no stars and opens nothing,** as a
  cheated Free play run saves no best score, and the result screen says
  so. The first build said nothing, which read as a bug (Sonnet). Fable;
  whether the cheat should open levels is Kyle's to decide.
- **Keyboard:** arrows, Enter or Space, and Escape work on every campaign
  screen. The first build lost Enter and Space on the first screen
  (Sonnet found it against main).
- **Stars are drawn shapes, not text characters.** CI on Linux failed
  five browser cases that passed on the Mac for Codex and for Sonnet: the
  star characters are taller in other systems' fonts and ran into the stop
  numbers. Players on Android and Windows would have seen it. The overlap
  cases now run a second time with font metrics 20% taller, so the next
  one fails on any machine. Fable (cause, rule), Codex (fix).
- **A check must give the same answer on every machine.** The first
  tall-font guard multiplied each machine's own font heights, so it passed
  on the Mac and failed on CI three times running, each time on a new
  1 to 4 px overlap (the HUD's level label, the level card, the result
  title). The coordinator had asked for a multiplier. The guard now uses
  fixed heights (1.20 em above the line, 0.45 em below), and on the Mac it
  reports the same overlaps CI did. Fable (mistake and rule), Codex (fix).
- **The controls offer only what the level allows.** The first build let
  a player pick a tower the level forbids and then refused to place it,
  and showed second-upgrade buttons that could not work. Found by the
  automated Codex review on the pull request; missed by the coordinator,
  who had a capture showing all six towers lit on level 4, and by Sonnet.
  Locked towers now sit dimmed with a lock; a tower at the level's limit
  reads "Max for this level". The baseline workflow also skipped the new
  campaign screenshots until it was told about them. Fable.
- **Not fixed, older than this milestone:** on a phone held sideways
  (844x390) buttons are 35 to 37 px tall, under the 44 px the portrait
  layout keeps.
- **No unlock-all cheat** (Fable): not asked for.

## 2026-11-23, milestone 42 (first-visit tips, and a cheat that opens things)

- **Tips before a level, the first time.** Up to three short lines per
  level on how to use what is new, shown when Play is first pressed, with
  Got it and Back; afterwards the card has a Tips control. Kyle ("How can
  we add instructions before each round starts for the first time the user
  is seeing that level?"), Fable (shape), Codex (build and wording),
  Sonnet (checked every line against the rules).
- **Tips say "click" or "tap" to match the input in use.** The first
  wording was wrong for both: a mouse builds on one click, touch needs two
  taps. Sonnet found it by trying both.
- **A cheated campaign win opens the next level and saves no stars,** and
  the cheat makes that run's locked towers, upgrades and specials usable.
  Kyle ("Yes we can add that to cheat, can the cheat also unlock the
  locked weapons? If that's complicated then we skip it"). It was a small
  rules change (about 14 lines), so it went in. Bots and the gate cannot
  reach it; the balance report is byte-identical.
- **Found by Sonnet and fixed:** a quick second press on Play landed on
  Got it and skipped the tips unread (the panel now ignores presses for
  400 ms and the button moved); level 5's tip spoke of walls it does not
  have; and, older than this milestone, level 1 announced "Barricade
  unlocked" at wave 3 with no Barricade to use.
- **Difficulty left alone.** Kyle after levels 1 to 5: "a little easy but
  not enough to change right now."

## 2026-11-23, milestone 43 (the painted look on every map)

- **Painted now covers Switchback and Riverbend,** in Free play and the
  campaign, from the same Blender scripts as Meadow. Before this a campaign
  played in Painted fell back to Classic on seven of ten levels. Kyle ("I
  need to make a more definitive theme and improve the images and
  graphics", to show others the next evening), Fable (do the part that does
  not depend on the theme first), Codex (art and code), Sonnet (verified).
- **The art is packed:** 3 requests for a painted game in place of 56, and
  ground loaded only for the map being played. On a throttled phone link
  (1.6 Mbit/s, 150 ms) the painted art loads in about 2.4 s at 1x and 5.4 s
  at 2x, down from 11.5 s and 17 s (Codex measured, Sonnet reproduced on its
  own throttle). The page and script add about 2.8 s that those figures
  leave out.
- **The picture matches the rules.** Sonnet sampled all 450 cells on each
  map in both layouts: nothing buildable is painted as water or trail.
  A few blocked cells beside the trail look like grass (the clearance
  rule); accepted, as on Meadow, since the placement highlight says so.
- **In Painted, what the player must read was made to stand out** after
  Sonnet's readability pass: placement cells have an ivory frame (valid) or
  a coral frame with an X (blocked), Switchback's trail got a clear edge,
  and a hit brightens the sprite where it used to cover it with a white
  shape. Classic is unchanged.
- **Classic stays the default look** until Kyle says otherwise.
- **Not done (Fable):** Riverbend's timber deck stands 64 px short of the
  river head, because the grass between is buildable and cannot be painted
  as water.

## 2026-11-24, milestone 44 (a theme: the King's collectors)

- **The theme is a fantasy 1776: the King's collectors march on a
  frontier town, and the player keeps the town's gold.** Kyle ("a cross
  between medieval and colonial/1776 ... adding in a 'taxation is theft'
  vibe"; "Yes, go" to the coordinator's table). Kyle had also floated
  borrowing an existing franchise as a stand-in; the coordinator declined
  (Fable): it will not build with another work's characters, names or art,
  and a public repository would invite a takedown. Original designs from
  common archetypes only.
- **Names (44a):** Goblin Collector, Revenue Hound, Redcoat Shieldbearer,
  Royal Harpy, Toll Troll, Assessor Grumblefoot, King Grumblemaw, with
  short forms in the wave preview. Towers and specials keep their names;
  the four Guards are an Axeman, a Swordsman, an Archer and a Captain.
  Ids, rules and numbers are unchanged; the balance report is
  byte-identical. Level 9 became "The King's Assessor". Codex (build),
  Sonnet (every string and tip checked; verdict merge).
- **Painted is the default look for new players** (Fable; Kyle was asked
  twice and answered only the theme, and the look is what he is showing).
  Classic is one tap away and a stored choice is kept. Tests keep Classic
  as their default. Known cost (Sonnet): on a connection that hangs, a new
  player's first Play waits the full 25 s before falling back to Classic.
- **A theme swap is cheap in names and dear in art** (Fable, answering
  Kyle): every string is in one file, under an hour; a full set of
  character and map art is about a day of agent time. So one theme is
  chosen and kept, not swapped in for a few days.
- **One font file family is shipped: Libre Caslon Text,** Regular and
  Bold, Latin subset, 34 KB, SIL Open Font License, from Google Fonts.
  Kyle ("Yes, add a font"). The project's first third-party asset that is
  not CC0. Chosen over IM Fell English (Fable): Caslon is the typeface of
  the period's printing and stays readable small. It goes in with the
  themed screens (44c).
- **The characters re-dressed (44b), Painted only.** Tricorn and satchel
  on the Collector, the King's red on the Redcoat, a writ for the Harpy, a
  toll-gate bar for the Troll, a wig and ledger for the Assessor, a crown
  and cape for the King; four distinct Guards in the town's blue; a coin
  pennon by the cottage. Classic keeps its drawings. Codex (art), Sonnet
  (verdict merge, two fixes asked for by Fable first).
- **Team colours: enemies carry red and gold, the town carries blue.**
  The Hound was blue and ran into blue Guards; it is now charcoal with a
  red collar (Sonnet found it).
- **The Assessor was redrawn to look like nobody else's character.**
  Sonnet noticed his front view (red dome, moustache, round nose) came
  close to a famous game character. He has his own maroon and orange,
  horns and tusks again. The rule for all art: original designs, no
  resemblance to any particular existing character.
- **Themed screens and HUD (44c):** one kit for every screen: parchment
  panels with dark ink, a dark wood HUD with brass edges, the King's red
  and gold, the town's blue for the player's own choices. A re-dress, not
  a re-layout: Sonnet compared 360 control areas with the plain version
  and none moved or shrank. Codex (build), Sonnet (verdict "fix first"
  for one broken test and five small things; all fixed by Codex).
- **The font is loaded from the game's own files, never from Google at
  run time,** with a 1 s limit and the old font as fallback; changing HUD
  numbers stay in equal-width digits so they do not jitter. The manifest
  check now accepts a third-party file only with its licence beside it
  and a matching hash.
- **Disabled must look disabled.** The first themed buttons kept so much
  contrast when disabled (6.4:1) that they looked usable; the plain grey
  version had been clearer (Sonnet). Disabled plaques are flat grey with
  dim text again (3.5:1), on purpose below the reading threshold.
- **A defect was shipped knowingly for about two hours (Fable):** the
  names build went live with "Assessor Grumblefoot" clipped in its
  entrance banner on a phone in portrait, found by the automated review
  after CI passed. Merging it unblocked the art and screens branches; the
  fix and the missing banner test came with the screens.
- **Not re-verified by a second model (Fable, for time):** the fix passes
  on 44b and 44c after Sonnet's verdicts. Each fix has its own guard and
  the full suite ran in CI before each merge.

## 2026-11-24, direction after the theme, and milestone 46 (the town and its story)

- **Direction (Kyle, after playing the themed build on his phone: "it all
  works the way we wanted it to ... a good base"):** the town and story
  first; then level variety and skill-based stars together; then talk
  through a hero the player controls and the castle wall. Also: one level
  pushed as far as the graphics will go, to see the limit (milestone 47).
  The coordinator proposed the order; Kyle agreed it.
- **The town shows the stakes, tied to the stars:** untouched at 18 or
  more lives, scuffed at 12 to 17, battered below, taken at zero; a sack
  of coin leaves with each collector that gets through; a cheer on a win,
  the King's banner on a loss. Fable (shape), Codex (art and code), Sonnet
  (verdict merge, no defects).
- **The town on the map is small on purpose.** Only four cells at each
  exit are outside the buildable grid, and a bigger town would change the
  rules and the balance. The detail went into the picture of the town on
  the result screen. Fable.
- **The story adds no screens to the normal flow:** the King's notice sits
  on each level card, the town's reply on the win screen, one line on a
  loss, and one broadside each at the start and the end of the campaign.
  The copy is the coordinator's draft, used word for word; Kyle may change
  any line.
- **Kept as built (Fable):** a Free play loss also shows the King's line
  ("The Crown thanks you for your contribution"); the theme is the game's,
  not only the campaign's. The level 6 notice says "one Troll per
  traveller" where the enemy is the Toll Troll; the short form is the
  joke.

## 2026-11-24, milestone 45 (a pause button)

- **A Pause control and the P key.** Kyle, after playing on his phone ("I
  saw that there is no pause button though"). Pause stops everything,
  including sound, recharge and effects; a panel offers Resume, Restart
  (with a confirm) and Level map or Menu; the game pauses itself when the
  page is hidden. Codex (build), Sonnet (verdict merge, no defects).
- **Nothing can be built while paused** (Fable): building is already
  untimed between waves, and Kyle finds the game a little easy.
- **Pause changes nothing:** live games with a boss, Guards, a Barricade
  and Fire Arrows, paused up to eight times, ended identical to unpaused
  ones at 1x, 2x and 3x (Sonnet).
- **Room was made for it:** on the phone Pause is an icon-only square
  beside mute, Start Wave went from 120 to 96 px wide with its label on
  two lines, and Special from 92 to 76; in landscape the tower plaques
  went from 140 to 132 px. Pause sits 3 px from mute on the phone;
  accepted, a stray tap only pauses or mutes.
- **Three tries at the phone row, and three new checks.** The first
  build narrowed Start Wave until its longest label fell under the
  minimum text size on Linux (CI caught it). The fix made the row 31 px
  wider than the HUD, hanging out of the frame, with every test green
  (Fable caught it in the capture). The next fix renamed Special to
  "Cast" to save width, while every tip says "Tap Special" (Fable, same
  way). Now checked: every HUD control sits inside the HUD and lines up
  with the row above; labels keep a margin over the minimum size; any
  control a tip names is shown under that name. Lesson: look at the
  capture before sending anything to CI, every time.
- **Switching windows on a computer does not pause;** hiding the page or
  locking the phone does. As built; accepted (Fable).
- **A gap caught at the merge:** pause was built before the town existed,
  so the town's smoke, flag and departing sacks would have kept moving
  while paused. The conflict in the game scene showed it; Codex put the
  town on the pausable clock and added the test. Rule for parallel
  branches: when one adds a clock or a global stop, the later merge
  checks every animated thing the other added.

## 2026-11-24, milestone 47 (a showpiece level, a spike)

- **One level pushed as far as it will go, behind a hidden switch.** Kyle
  ("I'd like to see what the limits are on graphics ... how comically
  in-depth we could be with this, like maybe just a level").
  `?look=showpiece` on Meadow: a working mill and farm, animals,
  farmhands who run indoors, a day that passes into dusk, crews at their
  guns, hats and coin left on the field, a camera that reacts, fireworks.
  Fable (frame and limits), Codex (everything in it), Sonnet (verdict:
  safe to merge behind the switch).
- **It cannot affect the normal game:** without the switch no showpiece
  file is requested and 72 fixed screens in Classic and Painted are
  pixel-identical to before; games in the showpiece end in the same state
  as in Painted at every detail tier (Sonnet). That is why a spike is on
  main: so Kyle can open it on his own phone.
- **What it costs is half the result.** On an emulated, slowed phone,
  high detail ran at 26 to 44 frames a second across two sets of
  measurements where Painted holds 60; low detail holds 55 to 60. It adds
  42 KB and about half a second to the first load. No real phone has been
  measured yet.
- **What travels to the whole game, by cost (Codex's table, in DEVLOG):**
  animals and farmhands are nearly free; crews, field marks and the
  victory scene are cheap; the full day-to-dusk lighting is dear; the
  moving camera nearly doubles draw time and stays showpiece only. Kyle
  decides what to roll out after seeing it on his phone.
- **Fixed after verification:** the quality governor changed tier 31
  times in two minutes on a boundary trace and now changes once; scenery
  on buildable cells fades to a ghost while a tower is held.
- **Combined with the town and pause before merging:** all showpiece
  motion runs on the pausable clock; the duplicate victory pole and hats
  were removed in favour of the town's own cheer. Not re-verified by a
  second model after that merge; the isolation and same-state cases were
  re-run against the new base.

## 2026-11-24, milestone 48 (the King's new taxes: variety and skill stars)

- **Each new tax is a rule of the level,** and the King's notice on the
  card is how the player learns it. Six taxes: Window Tax, Frozen Purse,
  Forced March, Curfew, No Loitering, Rationing. Ten more levels (11 to
  20) in a second act; 11 to 16 bring in one tax each, 17 to 20 carry two.
  Kyle agreed the direction ("make levels different, not just harder";
  "fix 'a little easy' with skill"); Fable (the taxes, feats and gate
  rules), Codex (rules, levels, screens), Sonnet (three verifications).
- **The third star on the new levels is a feat:** Not a penny (no
  collector gets through), Bare hands (no specials), Few hands (at most so
  many towers built). Levels 1 to 10 keep their star rule, so no saved
  star changed.
- **The first build passed every target and still missed the point**
  (Sonnet): the feats cost nothing (specials were worth one life; tower
  limits never bound), Musketeers alone won 8 of 10 new levels, and the
  second act was easier than level 10. The coordinator's targets had
  allowed it. New gate rules, each with a scratch level that fails it: a
  feat must not be earned by the person-like bot (F2); specials must be
  worth 3 lives where the feat forbids them and a tower limit must bind
  (F3); no single tower type may earn two stars on a late level (V1); the
  second act must average 1.5 lives harder than levels 8 to 10 with no
  cliff (S1); feats and stars must hold under small nudges (F1, L1m).
  The retune passed all of them with no exception.
- **Known, and probably wrong in one way (Fable):** rule F2 says the
  person-like bot must not earn a feat. That bot builds exactly as the
  capable one does and differs only in slower, rougher hands, so the rule
  ended up asking for better hands, not better decisions. The capable
  bot's feat runs need up to 22 casts aimed to the tick, and three sit on
  exactly 12 lives. Shipped as it is because two stars are tuned for a
  person and third stars are optional. Kyle's play decides; if the third
  stars are out of reach, F2 becomes "the person-like bot earns it when it
  plays for it" and the levels are retuned.
- **Levers were named before tuning this time,** and held on both passes:
  20 lives, the star lines, every tower, enemy and special number, and
  levels 1 to 10 byte for byte.
- **Every number a player reads about a tax comes from the level record,**
  after Sonnet found all of them typed in. A retune now changes the
  notice with it.
- **Screens:** the level map has two acts of ten stops; the card lists
  the taxes in force and the feat; the ending moved to level 20 and level
  10 closes the first act. A feat level's third star is four-pointed.
- **Left for 48d:** Tar Barrel and the Tar Pit's second path. Left alone:
  the first act fails the new variety rule (one tower type wins 8 of its
  10 levels); its levels are frozen and it is where players learn.
- **The wave button's boss warning reads "Boss next"** (was "Boss wave
  next"), in every layout. Decided by the coordinator after the first CI run
  on the milestone 48 pull request. On a taxed level at 390x664 the old label
  measured 11.32 CSS px on the Mac and 11.02 on Linux, under the 11.1 line,
  because Linux draws the bundled font about 2.6% wider and the label shrinks
  to fit its plaque. A first fix that raised the type to 23 px fell to 10.1 px
  with text 3% wider, so it was not sent to CI. A nine-letter line does not fit
  that plaque at 11 px with slack; a shorter label does. Kyle can ask for the
  old wording back.
- **A label's size must not depend on how wide a machine draws text.** The
  taxed phone HUD spec has a "wide text" mode: every measured width times
  1.06, and every label must keep its normal size within 0.01 CSS px. It fails
  on the commit that failed CI. The coordinator's brief for the first fix
  quoted the wrong Mac measurement (11.12 for 11.318), which hid the real gap;
  measurements in a brief are now copied from the failing log and the local
  run, not from memory.
- **Known, not fixed:** in the untaxed phone HUD with text 6% wider, the wave
  counter overlaps the cheat mark on a cheated win, and "Special" and "Last
  wave" shrink but stay above 11 px. Linux CI passes these today.

## 2026-11-24, milestone 49 (tar and feathers)

- **The tar fix becomes "tar and feathers", not a numbers-only change.**
  Decided by Kyle ("Yes, tar and feathers") from a list of ideas the
  coordinator put to him. It replaces part 48d.
- **Shape of the rule** (coordinator, under Kyle's "I trust you" for detail
  calls): the Tar Pit's second path becomes Feathers and the Tar Barrel tars
  and feathers what it lands on; a feathered enemy runs back once in its
  life; bosses never run; enemies it passes flinch once. Words are in
  `docs/SCOPE-v5.md`.
- **Level data and Free play target windows are off limits for this
  milestone.** If the gate cannot pass by tuning tar and feather numbers,
  the implementer stops and reports. Reason: milestone 48's first build met
  weak targets by moving the wrong levers.
- **A feather-leaning bot is added to the gate (R6)** because the existing
  bots rarely pick path B or the barrel, so the gate could pass while a
  person who uses feathers walks through the levels.
- **Target R2 was wrong and is replaced by R2a, R2b and R2c** (coordinator).
  Codex measured first and stopped: R2 needed 17 and 20 lives on Meadow and
  Riverbend where the Free play window allows 15. The new targets ask that
  the barrel is worth casting, that the standard run is no worse, and that
  the barrel is the best zone special on at least one map. The window stays.
- **Known and left:** Fire Arrows on every turn beats the Free play window on
  Meadow and Riverbend (17 and 20 lives). It was hidden because the standard
  policy alternates the two zone specials. A Fire Arrows change is a
  balance decision for Kyle, outside this milestone.
- **Feathers come from the Tar Pit's second path only; the Tar Barrel is
  left exactly as it is** (coordinator, after the first build). The barrel
  version failed 12 of 20 levels at the campaign gate with level data
  unchanged, and the numbers that came closest cut the run to 10 px. Leaving
  the barrel alone keeps every existing bot run byte for byte, so the levels
  Kyle has played do not move. This is less than what the coordinator
  described to Kyle ("the Tar Barrel now tars and feathers what it lands
  on"); he is told, and asked whether he wants the crowd version with a
  level retune.
- **Correction to what Kyle was told about the barrel:** it is not useless.
  Casting it is worth 4, 3 and 4 lives over leaving its turn unused. It
  loses only to Fire Arrows used every turn.
- **A floor on the effect (R8)** so tuning cannot shrink it out of sight
  again: at least one second of running at the enemy's own pace.
- **Verifier (Sonnet): merge.** Runs without a Feathers pit are byte for
  byte unchanged (280 runs rebuilt independently); every target's test was
  made to fail by a wrong change. Findings and what was done:
  - **The fairness guard (R6) was weaker than it read.** The gate's feather
    bot loses outright on five levels. Measured honestly, the person-like
    bot with its Tar Pits on Feathers ends 4 lives above the good bot on
    level 16 (18 against 14) and gains 2 to 4 lives on levels 11 and 12; it
    wins no extra star, and the good bot gains nothing. Accepted by the
    coordinator: the upgrade helps an ordinary player a little and hands out
    no star. The verifier's test pins the 4-life figure so it cannot grow
    unseen. Kyle's play decides whether act two is now too easy.
  - **Feathers is the weaker path in 5 of 6 Free play comparisons** and
    wins one by 2 lives. R1 passes, thinly. Left as is.
  - **Feather marks are small on a phone** and the level 9 tip was cryptic.
    Both sent back to Codex: larger marks and a longer puff, and a tip that
    says what feathers do.
- **The Feathers card line is "Tarred enemies run back."** (coordinator,
  after the first CI run on the milestone 49 pull request). The longer line
  wrapped to three rows on the phone card on Linux with text 6% wider and
  ran into the title. The new line is the same length as Deep Tar's, which
  fits. The wide-text check for this card now uses a larger factor on the
  Mac, so the local run sees what Linux sees.
- **Correction to the entry above:** the Linux failure was not a third row.
  Codex showed the description sat 0.23 CSS px under the card title on the
  Mac, and Linux's taller text bounds closed the gap. With fixed tall
  metrics every tower's path cards overlapped by 4.8 to 6.1 px on all three
  layouts, and had since before this milestone. The description is now
  placed from the measured bottom of the title with at least 2 CSS px clear,
  and a check covers six towers, both paths, four sizes and four font modes
  (192 cases; all 16 size-and-mode groups fail on the earlier commit). The
  shorter line stays because it fits on one row. The coordinator diagnosed
  from the test's name instead of its failing line; the brief for a CI fix
  now quotes the failing assertion and its values.

## 2026-11-24, milestone 50 (the barrel feathers a crowd; became the town's answer, Act Two only)

- **The Tar Barrel feathers whole crowds and the levels are retuned to fit.**
  Decided by Kyle ("Yes, retune levels"), after being told the crowd version
  failed 12 of 20 levels at the gate with level data fixed.
- **What may move and how far** is the coordinator's: per-level gold and
  health within 15%, wave contents on levels 11 to 20 only, Free play health
  scales; never the target windows or star lines. Reason: Kyle has played
  the first act and called it good, so its waves and maps stay and its
  numbers move as little as the gate allows.
- **The barrel keeps its slow, radius and tar time.** Milestone 49's trial
  traded slow for feathers and level 10 fell from 16 lives to 5, because
  bosses do not run.
- **The fairness check uses the ordinary bots with feathers forced (C6),**
  not the feather bot alone, after the milestone 49 verifier showed that
  bot was too weak to guard anything.
- **The crowd barrel pays with a longer wait, before any level moves**
  (coordinator, after the first build). At today's refill the barrel was
  cast 20 to 23 times a game and lifted Free play by up to 8 lives; no
  bounded retune passed (17 of 20 levels at best, level 8 impossible, 15 of
  91 Free play targets missed). A slower refill after a barrel and, if
  needed, a shorter barrel run (never under the one-second floor) cut its
  power at the source and move fewer of the levels Kyle has played. Codex
  proposed opening level 8's waves instead; not taken yet, because the
  first act's waves are the last thing to move.
- **Feather barrels are an Act Two rule only.** Decided by Kyle: "We'll keep
  it act two for now, if we decide that it should be done later then we can
  group it in with other items at that time if it makes sense to." Levels 1
  to 10 and Free play stay exactly as they are; a Free play rebalance for
  feather barrels everywhere is deferred, not planned.
- **It is level data, shown on the card as the town's answer** (coordinator).
  Players already learn a level's rules from its card in Act Two, so a
  barrel that does more there is stated the same way the taxes are.
- **The coordinator's two openings Codex proposed (level 10's Troll
  interval, a Free play group's timing) are not taken.** With the rule
  confined to Act Two neither is needed.
- **Which Codex model does what** (Kyle, 2026-11-24): bigger builds run on
  `gpt-6.2-astra` at medium reasoning effort; fixes and other small items
  run on `gpt-6.2-sol` at high; if Sol cannot do a small item, Astra at low
  ("light"). Reason, in Kyle's words: Astra "is a waste at higher levels"
  and was "running through a week of usage for a basic game". Until now
  every run was Astra at high (the effort came from the Codex config
  default, which the coordinator never set or checked). Commit trailers
  name the model that wrote the change.
- **C2 asks for 1 life, not 2** (coordinator, after the Act Two build).
  Levels 15, 16 and 18 gained exactly 1 life from the barrel and all three
  give their third star for using no specials. The 2 was a guess. Level 20
  gains nothing from the barrel and still fails, and the gate's own rule S1
  (Act Two must cost the person-like bot at least 1.5 lives more than Act
  One; now 1.33) is not waived.
- **First run under the model rule:** the Act Two build on Astra at medium
  used 191,132 tokens, against 337,209 and 493,233 for the two passes at
  high. The remaining tuning goes to Sol at high as a small item.
- **Verifier (Sonnet): merge.** It rebuilt 116 runs on levels 1 to 10 and in
  Free play against main: all identical. Nine wrong changes each turned a
  test red. Findings and what was done:
  - **The feather barrel punishes a player who casts it at every chance.**
    The specials share one charge and a feather barrel holds it for 51
    seconds. Casting it whenever a special is ready, the person-like bot
    loses levels 12 and 19 and drops a star on 13, 17 and 18; the good bot
    loses 19. Swapping only the zone specials' turns for it loses no level.
    The cost was invisible before the cast. Decided by the coordinator: say
    it where the player chooses, with the number built from the data, in
    the barrel's line and in a second tip. The rule itself stays; a big
    move that has to be spent with care is the intended shape.
  - **The Act Two difficulty step (S1) passes by one life** (1.53 against
    1.5) and fails under a 2% health nudge on one level. Accepted as it
    stands; any later change to levels 11 to 20 must re-check it first.
  - **A feather barrel reaches Royal Harpies**, which no Tar Pit can. It
    already tarred them before this milestone. Left as is.
  - Stale records (README's "every special refills in 20 s", DEVLOG's
    retune table) sent back with the wording change.

## 2026-11-24, Act Three and milestone 51 (the Old Keep, a look spike)

- **A third act of new levels: the Siege.** Decided by Kyle ("Yes, let's
  start with act 3. The Hero looks right and the wall as you proposed it is
  fine for now."). New power goes into new levels, after feather barrels
  failed 12 of 20 tuned levels until they were confined.
- **The castle's look is to be grand, not modest,** even if it is out of
  place beside the rest (Kyle). His two reference images are mood only; the
  castle is our own design.
- **A full "defend from behind the wall" mode is the candidate for version
  2** (Kyle raised it and asked whether to save it; coordinator's advice,
  which he accepted by choosing the order: build the castle and as much of
  that feel as today's rules allow in Act Three, and let it show whether
  version 2 should be the wall game).
- **Castle first** (Kyle: "Yes, castle first"): a look spike before any
  rule depends on the art.
- **Coordinator told Kyle what the pipeline can and cannot do:** dense
  detail and motion from Blender scripts, not the fidelity of concept art.
  If it falls short, a painted or generated backdrop would change the rule
  on where art may come from, and that is Kyle's decision then.
- **Coordinator's assumptions, stated to Kyle:** the fortress is the
  town's refuge; the tone stays right for children.
- **First pass of the Old Keep judged by the coordinator: a good model, not
  yet grand.** It is a detailed, well-lit castle (spires, rose window,
  clock, buttresses, portcullis) and every limit held (0.89 MB of art
  against 8 MB; 16.7 ms frames at every tier). Against Kyle's words it
  falls short in five ways: it is small on the phone and reads as a toy on
  a lawn; a Toll Troll is nearly as tall as the gate; it sits on flat
  ground with no crag, ravine or wall running off the screen; the sky is
  calm; and the enemies and towers are lit for daylight in a dusk scene. A
  second pass is ordered on those points before Kyle is asked for a
  verdict. Kyle was sent the first-pass stills and recording as they are.
- **No Astra until Kyle's usage resets, about three days from 2026-11-24**
  (Kyle: "Astra is now being billed at higher rate so we can use them when
  the usage resets"). Agreed for that time, on the coordinator's proposal:
  builds go to `gpt-6.2-sol` at high, in smaller briefs than Astra took
  (rule, then levels and tuning, then screens and art, each checked before
  the next); fixes and small items stay on Sol at high; if Sol stops twice
  on the same piece or misses the same target twice, that piece goes to
  Claude Opus at medium; Claude Sonnet at medium verifies everything; the
  coordinator (Fable) plans and reviews and writes no game code. When Opus
  builds, the automated Codex review on the pull request is the cross-check
  from the other provider. Sol has not done Blender art on this project:
  it gets one small art item first, and larger castle changes wait or go to
  Opus if the quality drops. The earlier rule (Astra at medium for bigger
  builds, Astra at low as the fallback) returns when Kyle says so.
- **Verifier (Sonnet) on the Old Keep: fix first.** Safe behind its switch
  (174 bot runs and the sim output identical to main; no keep request with
  the switch off; saved data untouched; both art scripts reproduce every
  plate byte for byte). Three things before Kyle opens it on a phone:
  - **Memory.** All 17 plates for both orientations are decoded at once,
    248.6 MB at 4 bytes a pixel, of which a portrait phone needs 143.9 MB.
    On an iPhone with 2 to 3 GB that risks the browser being killed.
  - **Loading.** About 4.5 MB on a first visit, 21 seconds on a slow
    connection with a blank dark canvas, and a silent drop to the title if
    a plate fails.
  - **The 16.7 ms frame time is a cap, not headroom.** The main thread is
    70 to 80% busy at native speed and 93 to 98% at a quarter speed, about
    twice an ordinary painted map, and the quality tiers barely change it.
    The implementer's numbers were right and the conclusion drawn from
    them (by the coordinator too) was not.
  Sent to Sol at high as the first job under the no-Astra rule; it includes
  a half-size set of plates from the art scripts, which is also Sol's first
  art item on this project.
- **The Old Keep has two quality tiers, high and low** (Sol's choice of the
  smaller fix, accepted by the coordinator). CI showed the medium tier
  costing more than high on Linux, twice. Low is 22 to 31% cheaper than
  high on both machines, and the test now asks for at least 10% in the
  same run.

## 2026-11-25, milestone 52 (the wall)

- **The wall milestone's scope is approved as drafted.** Kyle: "Approve,
  start". He was told four choices in it were the coordinator's and could
  be overruled: flyers ignore the gate, a fallen gate cannot be rebuilt in
  that level, the third star in Act Three is "Unbroken", and five levels to
  start. He overruled none.
- **Built in three parts by Sol at high, each verified by Sonnet** before
  the next starts, under the no-Astra rule.
- **Kyle had not yet reported on the Old Keep on his phone when this
  started.** Part a is rules only and does not depend on the castle's look;
  the art part (52c) waits for his verdict.
- **Verifier (Sonnet) on part a: merge.** 261 runs and the sim output
  identical to main; eight wrong changes each turned a test red; no exploit
  or dead end found. What it found, and what the coordinator decided:
  - **The break was a cliff.** With the gate at the very end of the road,
    a crowd held at it leaked on the tick after it fell (30 goblins end the
    level in two ticks) and the last stand could save none of them. Decided:
    the gate stands a set distance before the end, with a yard behind it
    that the held enemies must cross under the last stand's fire. This
    refines what Kyle approved ("a gate at the town end") without changing
    its intent; he is told.
  - **Gate health was the wrong size.** Three Trolls strip 240, 480 or 960
    health alike in about four seconds; about 5,200 holds them. Health and
    the repair step are sized against crowd damage per second in part b.
  - **Repair charged a full step for one point of health.** Decided: the
    last step costs in proportion.
  - **The castle's tier-cost test fails 2 times in 10 under parallel load**
    and passes 10 in 10 alone. It is to run on its own, after the rest.
  Sent to Sol at high as one fix pass before part a goes to CI.
- **An outside creative review (Claude Opus), asked for by Kyle** ("another
  angle ... normal advice and off the wall suggestions"), returned eight
  pieces of advice, twelve wild ideas, a pitch for version 2 and one change
  to the plan. Its sharpest observation: on a phone the keep takes the top
  45% of the screen and does nothing, while the fight is small in the
  bottom half.
- **Kyle took the coordinator's recommended set** ("Yes get started on
  those you recommended"): the gate's health shown on the gate; the view
  settling lower in a wave; which road each group takes; enemies larger at
  the gate; siege sound; two siege taxes (Quartering, Royal Survey; not
  Requisition, which is harsh for children); pillow windows; the ram in its
  small form; mortar shells drawn as notices; the feathered-carriage
  ending; and a second feat, Not a nail. He is rereading the rest.
- **Not decided:** whether to build the sortie (opening the gate to send
  Guards out) before the Captain, as the review argued. Kyle approved the
  Captain earlier; the question was put to him and is open.
- **Part b is split in two and part c in two** (coordinator), because the
  set roughly doubles the rules and the art, and Sol works best on smaller
  briefs. Sonnet verifies b1 with b2 and c1 with c2, two passes, not four.
- **One new thing a level** (coordinator): the gate, then windows, then two
  roads with the Survey, then Quartering, then the ram and the King. The
  level names, notices and replies are the coordinator's and are in the
  scope.
- **Kyle agreed the list and the order** ("I agree with your list and your
  order. The saying's are all fine for now.") and invited a sharper voice:
  "more angry at the government, think Boston tea party stuff ... lean into
  taxation is theft too, like a libertarian, Agorist/Anarcho-capitalist
  vibe". The Act Three notices and replies were rewritten in that voice by
  the coordinator, kept comic and clean for children, with no real people,
  parties or flags. The Act Three broadside and tips (parts b2 and c1) take
  the same voice. Earlier acts' words are not changed unless Kyle asks.
- **The coordinator broke the scope file and Sol caught it.** The commit
  that sharpened the Act Three words (`ddedf7c`) replaced text from the
  first table headed "The King's notice / The town's reply", which is
  milestone 46's, not milestone 52's, and so deleted everything between
  them (milestones 46 to 52). Sol noticed, kept its Act One wording check
  working from `DESIGN.md`, and reported it. Restored from the commit
  before, with only the intended table changed, and checked by diff. Edits
  to the scope by script now anchor inside the milestone's own section and
  the diff is read before the commit.
- **Levels 21 to 25 exist and eight of fourteen targets pass; six do not,
  and Sol stopped as told.** Open: W1 on level 22, W6 (leaving a road
  undefended rarely loses the gate), W7 (the person-like bot averages 18
  lives in Act Three against 13.8 in Act Two; the target is 12.3 or
  fewer), W9 (a Longbow alone earns two stars on every level), W10 (the
  windows do not change level 22's score) and W12 (the Royal Survey costs
  nothing). The coordinator's reading: a standing gate holds every ground
  enemy, so lives are lost only to flyers or after a breach, and the star
  lines stop measuring anything; repair is also far too cheap (8,300
  health for 49 gold). A second level-table pass is ordered with the
  thresholds held: lives must be at risk from the air while the gate
  stands, a breach must be a real risk for an ordinary player, and repair
  must cost about what it saves.
- **Tips for levels 21 to 25:** Sol's drafts accepted with two changed by
  the coordinator (the last-stand tip and the second Quartering tip).
- **Second Act Three pass: 10 of 14 targets, thresholds held.** The
  person-like bot now averages 11.2 lives (Act Two 13.8). Still open: the
  windows change no score on level 22 (W10), the Royal Survey costs
  nothing (W12), one undefended-road case on level 24 (W6), and in W9 a
  single tower type clears level 21 with three stars and the finale ends
  on 20 lives against a ceiling of 16.
- **Two rules change, by the coordinator, because level numbers could not
  fix them:** a pillow window tars and feathers everything on its stretch,
  as a feather barrel does (seven tarred enemies across two windows was
  never going to matter); and the Royal Survey may close more than one
  wall spot. Both keep the idea Kyle chose.
- **Fallback, decided in advance:** if every other target closes and the
  only miss left is a single tower type clearing level 21, that level is
  exempt from the one-tower rule as the act's teaching level, as levels 1
  to 10 are. Not to be used for any other level.
- **Part b has used about 980,000 Sol tokens over three runs** (403,056,
  260,628 and 316,666) before this one.
- **Verifier (Sonnet) on part b: fix first.** Proved: 300 run hashes and
  the sim output identical to main; levels 21 to 25 cannot be reached or
  saved without a switch; twelve wrong changes turned tests red, three of
  them only after the verifier added tests. Its findings and the
  coordinator's decisions:
  - **`npm test` did not run the Act Three targets at all**, passes or
    misses; only a separate command did, which CI never calls. A green run
    said nothing about the levels. Now a target in its own right (W17).
  - **W6 reworded** to "loses the gate, or costs a star or 6 lives". The
    verifier judged the intent met and the wording wrong; with the
    person-like bot every one-road case loses the level.
  - **W12 stays as written.** The verifier called counting the gate's low
    point "moving the goalposts" and showed the Survey as chosen helps the
    person-like bot. The Survey's two sites are to be chosen by sweeping
    every pair, not the measure changed.
  - **W9 restated for gate levels in three places**, on the verifier's
    reasoning that a player feels the gate bar, not the lives: the finale
    band is on the gate's low point; the gap rule becomes "the ordinary
    player wins with at least 8 lives"; level 21 is exempt from the
    one-tower rule. These replace measures written for levels without a
    gate. They are changes to thresholds, made openly and for a stated
    reason, and Kyle is told.
  - **Level 21 was a cliff, not a lesson:** 32 flyers in wave 2 cost the
    ordinary player nine lives. New target W15.
  - **Two traps:** a window spent on an already-feathered crowd, and a
    repair that silently forfeits Not a nail. New target W16.
  - **The gate's health no longer fits its label at five digits.** Shown
    as a percentage until part c1 draws a bar.
- **Part b goes to CI with three targets listed as misses, not hidden.**
  After the fix pass 14 of 17 pass. Fixing the Survey, level 21 and the
  two traps moved three others: W2 (repair now changes the good bot's
  score on one level of five, not three), W3 (the good bot loses the gate
  on level 23 under the Survey that now bites) and W9 (margins under small
  nudges on levels 22, 24 and 25; a Tar Pits-only trial on level 24 that
  does not finish wave 2 inside the trial's time limit). `npm test` names
  exactly these three and fails if the list is wrong in either direction.
  The coordinator's reasons for stopping here: part b has used about 1.6
  million Sol tokens over six runs; each pass now trades one target for
  another; the levels are still behind a switch; and Kyle's own play of
  them is better evidence than a seventh bot pass. The open targets are
  revisited after he has played, before Act Three goes on the level map.
- **To check before Act Three is shown to players:** whether a build of
  only Tar Pits on level 24 can leave a wave running for many minutes.
- **Part b is merged and deployed, hidden** (pull request 61, CI green on
  the full suite, no review findings). Levels 21 to 25 play at `?keep=21`
  to `?keep=25`.
- **Part c1 starts without waiting for Kyle's play** (coordinator): the
  screens do not depend on the tuning. Act Three's screens are built
  behind a switch, `?act3=1`, and are not opened to players until Kyle has
  played the levels and the three open targets are settled.
- **Story lines for Act Three** written by the coordinator in the voice
  Kyle asked for; with Act Three open, the campaign's ending moves from
  level 20 to level 25.
- **Verifier (Sonnet) on part c: merge behind the switch.** Proved: 96 bot
  runs, the sim output and 18 browser sessions identical to main with the
  switch off; a save written with Act Three on loads safely with it off,
  keeps its stars and shows the old two-act game; every tap target sits
  where it is drawn through the view move; sound obeys mute, pause, test
  mode and the switch and leaks no audio nodes over ten minutes; all new
  art reproduces from its scripts byte for byte. Fourteen wrong changes:
  eleven caught by the implementer's tests, one by a test the verifier
  added, two harmless.
- **Before Act Three is opened to players** (the verifier's list, accepted):
  a switch-off browser comparison must run in CI (today it lives in a
  script CI does not call); the fanned-out crowd is drawn up to 97 px from
  its true place, more than a Powder Keg's 90 px reach, so a keg aimed at
  the edge of the drawn crowd misses the stack; decoded images on a phone
  are about 70 MB with the ordinary painted atlases counted (the 60 MB cap
  counted the keep's plates only), to be checked on a real phone; the
  level cards' map thumbnail is a placeholder; and nobody has heard the
  sound. Kyle's play of the levels comes first.
- **Part c is merged and deployed behind `?act3=1`** (pull request 62, CI
  green, no review findings).
- **Pre-opening fixes that did not need Kyle (Sol):** a switch-off browser
  check that CI runs; the gate crowd's fan-out capped at 40 px so a keg
  aimed at the drawn crowd hits it (the crowd is tighter and reads less as
  separate enemies: the price of an honest aim); painted map thumbnails
  on the Act Three cards; a larger ending picture; and decoded images on a
  phone down from about 70 MB to at most 55 MB on an Act Three level by
  freeing art those levels never draw.
- **A real rule fault was found and fixed on levels 21 to 25:** a player
  could keep a lone enemy blocked for ever by replacing a Barricade, and a
  Mortar-only build left a wave running for 21 minutes. A walker now
  overruns the blocker it is fighting after 60 seconds of contact in all.
  The coordinator had the wrong build in mind (Tar Pits only); Sol found
  the right one. **The same stall exists on levels 1 to 20 and in Free
  play, where it is left alone** because those must stay byte for byte;
  it is a candidate for the Free play rebalance if that ever happens.
- This fix pass was not verified by a second model. CI runs the level
  targets and the full browser suite.
- **The automated review on pull request 63 caught a real bug after CI was
  green,** and the coordinator's chain stopped before merging because of
  it. The memory change freed painted art on leaving an Act Three level; a
  restart (Play again after a win or a loss, or from the pause menu) then
  drew with freed art, and the Musketeer's build icon came up as a missing
  texture. Sol reproduced it on the pushed commit, in all three looks, and
  fixed it: the art is kept through a restart in place and freed on return
  to the title. Thirty restart cases now run in the browser suite. The
  memory saving is unchanged. No test restarted a siege level before this.

## 2026-11-25, the owner's link and a fresher look

- **An owner's link** (Kyle: "so I can test out whatever I want when I
  want"). He had not got past level 16 and so had seen none of Act Three's
  screens. Coordinator's choices: it sticks on the device until turned
  off, shows a mark so it is not mistaken for a normal game, never writes
  an unlock, and has a page to see story screens again.
- **Kyle finds the levels "clunky and old" and wants them "smoother and
  like new age-ish".** He asked what the coordinator thinks and whether to
  wait until he has played. Coordinator's advice: do not restyle the game
  on a description; show three directions as pictures on a real level
  first (cheap, no game code), let him pick by eye, then spike the chosen
  one on a single level behind a switch, as the castle was done. The
  owner's link goes first so he can see everything.
- **What the coordinator thinks dates the look** (opinion, to be tested
  against the mock-ups): heavy wood and parchment frames and boxy buttons;
  small text labels where an icon would do; sprites drawn at a low
  resolution for a modern phone and in two clashing styles (bright cartoon
  troops against the gothic keep); stiff motion with no easing or impact;
  grey oval tower spots and thin health bars.
- **Kyle chose the look: A and B together, menus and buttons first, then
  characters and towers** ("Yes, let's do the A and B you mentioned, start
  with the buttons and menus and then move into the characters and
  towers"). He chose before the pictures reached him; they were sent as he
  replied, and he was asked to say if they change his mind.
- **The mix** (coordinator; the mock-ups' author recommended the same
  without being told): A's clean dark panels while playing, B's paper and
  ink for cards, results and the other reading screens.
- **Built behind `?ui=new`** and made the default only when Kyle has tried
  it on his phone; the old interface is kept until then.
- **No font or icon set is downloaded.** The in-level type is the
  device's own sans; icons are drawn by the project's code.
- **First build of the new interface (55a) judged by the coordinator: the
  right language, short of the mock-ups.** Beside its mock-up the real
  status block has no hierarchy (gold, lives and wave run together in one
  small line where the mock-up gives each a large number); the build bar
  swapped the towers' own art and names for flat line icons, which is
  harder to read, not easier; text drawn on the canvas is soft where the
  mock-ups are crisp; the card's rule rows are cramped; and the frame cost
  was measured while two other jobs ran on the machine and may be worse
  than today's. A second pass is ordered on those points. Kyle was sent
  the side-by-sides and recordings as they are. Sol's run used 548,523
  tokens, the largest so far.
- **Wide-text tests for any new screen use the larger factor on the Mac**
  (1.09 against 1.06 elsewhere), from the first brief, after the same
  Linux-only label failure hit the Feathers card, the taxed HUD and the
  owner's page in turn.
- **Second pass of the new interface accepted for a trial behind the
  switch.** Text is drawn at the phone's real pixel density; the status
  block has the mock-up's three large numbers; the build bar shows each
  tower's own art and name; the level card has proper rule rows; tower
  spots are light outlines. Measured on a quiet machine, three runs each,
  it is no slower than today's interface (Classic 7.78 to 6.55 ms a frame,
  Painted 8.06 to 7.78). Still different from the mock-ups: the board
  keeps side margins on a phone, and the tower drawer can cover a stretch
  of road while it is open. Two Sol runs, about 1.12 million tokens.
- **The owner's link and the new interface were built side by side and
  conflicted on the title screen.** The coordinator's merge chain stopped
  before pushing. The two document conflicts were the coordinator's to
  resolve (main's side held nothing this branch lacked); the code conflict
  went to Sol, who also tested the two switches together for the first
  time: the title, the owner's page, all 25 stops, a new-style card and
  result, and entry to level 21, on three screen sizes, no errors.
- **CI failed the new interface on one label, and the cause was the
  typeface.** "Musketeer" in the build bar ran 1.6 px outside its plaque
  on Linux. Play used the device's own sans, which the coordinator chose
  to avoid a download, so every in-level label depended on a font the
  game does not pick. Sol made every label group fit by construction
  (measure, shrink together, never under the minimum, a defined fallback)
  and added a stress test with the font 15% wider and 10% narrower. That
  test showed the tower names disappear at 390x844 with a font 15% wider.
- **Inter is bundled for the new in-level interface.** Decided by Kyle
  ("Yes, bundle one", then "Yes, download" after being shown the files,
  source and sizes). One Latin-subset variable file, 48,432 bytes, from
  `fonts.gstatic.com/s/inter/v20/`, SHA-256
  `c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4`, and
  its licence text (SIL Open Font License 1.1, The Inter Project Authors),
  4,380 bytes, from the Inter project's repository, SHA-256
  `262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a`.
  Downloaded by the coordinator into its own folder and checked; nothing
  was run from it. The earlier line "No font or icon set is downloaded" is
  superseded for this one font. Icons are still drawn in code.
- **The font stress test repeated an old mistake, and the coordinator
  asked for it.** It blocked Inter and widened each machine's own sans by
  15%, so it hid different labels on the Mac and on Linux. Split in two:
  with Inter blocked, only what must hold for any font (containment,
  overlaps, minimum size, a usable control); with Inter loaded and its
  measured widths scaled, which labels show. Sol reproduced the Linux
  failure locally by mapping the fallback to a monospace face at 1.3
  times.
- **The fallback hid something the player needs.** With a very wide font
  the sell control lost its word and its refund and showed a blank
  button. It now keeps the refund with a trash icon; Pause keeps its
  two-bar icon.

## 2026-11-26, the new interface after Kyle's first look

- **Kyle likes the direction and wants each part improved,** mostly
  spacing, and "the pieces" (towers and enemies) given "a slight upgrade
  now" without getting bogged down. He said to continue restyling the
  remaining pages and to bring him decisions as pictures of the options.
- **The coordinator turned his three Safari screenshots into a list,**
  since he said he could not name what was off: the page in Safari is
  about 390 by 656, shorter than anything the mock-ups were drawn for;
  the board is 227 px wide with dark bands beside it; the status block's
  spacing is uneven; the dock's tower pictures are tiny and clipped; tower
  spots are too faint; the level card is narrow and half empty. The list
  is in the scope.
- **Safari renders Inter's weights correctly** (the numerals are visibly
  bolder than the labels in his screenshots). That was the one thing
  unverified at merge.
- **The first part cost about 2.4 million Sol tokens against an estimate
  of 300,000 to 400,000.** Kyle was told before more was spent. Order
  from here: the polish list, the remaining pages, and the sharper pieces
  in a second folder at the same time.
- **The pieces' finish is C, Lifted.** Decided by Kyle ("C Lifted") from
  three pictures on the same fight. A soft dark rim and a clearer ground
  shadow with a little more contrast; no hard outline. The coordinator and
  Sol had both preferred B (Inked) for telling pieces apart in a crowd;
  Kyle's eye decides. The crowd at the gate is the place to watch.
