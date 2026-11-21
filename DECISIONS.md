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
