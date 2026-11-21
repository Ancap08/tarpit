# Tarpit

[![CI](https://github.com/Ancap08/tarpit/actions/workflows/ci.yml/badge.svg)](https://github.com/Ancap08/tarpit/actions/workflows/ci.yml)

**Play it: https://ancap08.github.io/tarpit/**

A small browser tower defense game, built by AI agents under human direction.

![Tarpit: placing two Longbows, a Tar Pit, a Fire Pot and a Mortar through the build bar and playing waves 1 to 4 at 2x (GIF sped up about 2x)](docs/media/tarpit.gif)

## What this is

A portfolio project. The point is how a human steered AI agents to build a
real game from an empty folder; the playable game is the proof. It was made
for Kyle and his nieces and nephews: one map, ten waves, six towers you can
build anywhere off the path, three enemies, simple shapes with labels.

## How to play

1. Pick a tower on the build bar under the map: Musketeer (single target), Cannon (splash), Tar Pit (slow), Longbow (cheap, long range), Mortar (long-range splash) or Fire Pot (burns). Move over the map: a green cell with a ghost and its range shows where the tower can go; red means it cannot. Click any green cell to build, and keep clicking to place more; click the button again or press Escape to stop. Click a tower to upgrade or sell it.
2. The Mortar cannot hit enemies inside its dashed inner circle (70 px), so put it back from the path it guards.
3. Tar + fire: a Fire Pot's burn does double damage to an enemy slowed by a Tar Pit, so build the two side by side.
4. Press Start Wave. Enemies walk from the cave to the cottage; each one that gets through costs a life. Kills and cleared waves pay gold. Survive all 10 waves to win. The 1x/2x button sets the speed.
5. Runs on an iPad (landscape; portrait shows a "turn your device" card). On touch, tap a cell once to aim (ghost and range), tap it again to build; tap the × to close a tower's panel.

## How it was built

- **Kyle** set the design, approved the plan and scope, and merged PR 1 himself. He then had the coordinator merge each PR once checks and the verifier passed, with screenshots and play feel left to his review.
- **Coordinator: Claude Fable 5.1.** Wrote the scope, design spec and briefs, ran the repo settings, and never wrote game code.
- **Implementers: Claude Opus at medium effort.** Wrote each milestone's code, tests and notes.
- **Verifier: Claude Sonnet**, a different model, checked every milestone PR before merge from a clean install (of the two non-milestone PRs, the baseline workflow was reviewed as part of milestone 3 and the v2 scope draft was approved by Kyle), re-derived numbers by hand and added its own tests.
- **One PR per milestone.** Every PR runs lint, typecheck, Vitest, build, and Playwright smoke and play-through tests. Screenshot baselines are generated on CI (Linux) and committed to the PR for Kyle's review.

v2 (build anywhere and three new towers) followed the same process in milestones 8 to 13.

Every design call and who made it is in [DECISIONS.md](DECISIONS.md). What
happened, including what went wrong, is in [DEVLOG.md](DEVLOG.md).

## By the numbers

Counts at the merge of milestone 12 (PR 16), from `git` and `gh`:

| | |
|---|---|
| Pull requests merged | 16: 14 milestone PRs, the CI baseline workflow (PR 4) and the v2 scope (PR 11) |
| Commits on `main` | 118: 102 changes and 16 merges |
| Commit co-author trailers | Claude Opus 54, Claude Fable 5.1 21, Claude Sonnet 18 |
| Screenshot baseline commits | 10 by `github-actions[bot]` |
| Unit tests (Vitest) | 211 in 24 files |
| Browser tests (Playwright) | 61 in 10 files |
| Screenshot baselines | 10 |
| Models involved | 3 (Fable 5.1, Opus, Sonnet) |
| v1 shipped (PR 10 merged) | 2026-11-21 08:30 UTC |
| v2 complete (PR 16 merged) | 2026-11-21 10:16 UTC |
| Time from first commit (06:11 UTC) to PR 16 merged | about 4 hours, 2026-11-21 |

## Repo map

```
README.md         this file
LICENSE           MIT
CLAUDE.md         rules for agents working in this repo
DECISIONS.md      every design and process decision, who made it and why
DEVLOG.md         how it was built, milestone by milestone, including what went wrong
docs/SCOPE.md     v1 scope and the milestone table
docs/SCOPE-v2.md  v2 scope and milestones 8 to 13
docs/DESIGN.md    the game spec: map, economy, enemies, towers, waves
docs/media/       README GIF and still
docs/art/         art source spike (milestone 15): INVENTORY.md (packs, roster mapping, recommendation)
docs/art/mockups/ style mockups A (Ninja Adventure, 3x and 2x), B (0x72), C (shapes animated), closeups
assets/           game art and sound; MANIFEST.md lists every file's source and license
assets/sprites/   enemy sprite sheets (placeholders from Ninja Adventure until v5: goblin, wolf, troll, harpy, shieldbearer, boss and boss-hit), imported by src/game/anim/sheets.ts
src/sim/          game logic in plain TypeScript, no Phaser or DOM (lint-enforced)
src/sim/grid.ts   the build grid: cells, cell centres, the buildable rule
src/game/         Phaser rendering, input, HUD, tower panel and the ?test=1 test hooks
src/game/names.ts every display name (enemies, towers, tower labels, boss, end screens), keyed by internal id
src/game/ui/buildBar.ts  the HUD build bar: pick a tower, then click a cell
src/game/ui/bossBar.ts   the HUD boss bar (name, hp) shown while Grumblefoot lives
src/game/portrait.ts     the "turn your device" card (markup in index.html), pauses ticking
src/game/draw/labels.ts  tower labels and the crowding rule (smaller, then hidden)
src/game/anim/    animation engine: sheet layouts, one sprite per enemy, reactions to simulation events (state.events)
src/sim/events.ts the simulation's event list for the renderer: spawn, hit, burn, slowed, kill, exit, build, ...
scripts/          npm run sim (balance report) and npm run demo (GIF recorder)
scripts/check-asset-manifest.ts  npm run check:assets: every file in assets/ and docs/art/ is in assets/MANIFEST.md as CC0 or credited CC-BY
scripts/check-size-budget.ts     npm run check:size (after build): dist/ stays under 20 MB, prints the 10 largest files
e2e/              Playwright tests and CI screenshot baselines
e2e/new-towers.spec.ts  Longbow, Mortar and Fire Pot built through the bar
e2e/boss.spec.ts        Grumblefoot in wave 10: boss bar, kill and win, exit and loss
e2e/anim.spec.ts        enemy sprite states (texture, facing, hit, kill, burning and tarred) through animState()
e2e/touch.spec.ts       iPad-size touch tests (two-tap placement, 44 px targets, portrait card)
e2e/visual-tablet.spec.ts  the 1024 x 768 letterboxed baseline (tablet project)
.github/workflows CI checks, Pages deploy, screenshot baseline update
```

## Run locally

Requires Node 22 and npm.

```sh
npm install                        # install dependencies
npx playwright install chromium    # one time, for e2e tests and the demo
npm run dev                        # dev server at http://localhost:5173
```

Checks (CI runs all five):

```sh
npm run lint        # ESLint, including the src/sim boundary rule
npm run typecheck   # tsc --noEmit over src/, e2e/, scripts/ and config files
npm test            # Vitest unit tests
npm run build       # production build into dist/
npm run test:e2e    # Playwright against the built dist/ (run build first)
```

Other tools:

```sh
npm run sim         # headless balance report: each archetype build, wave by wave
npm run demo        # rebuild, play in real time, write docs/media/tarpit.gif and .png (needs ffmpeg)
```

Open the game with `?test=1` to freeze time and expose test hooks on
`window.__tarpit` (see `src/game/testGlobal.d.ts`). Screenshot baselines are
generated only on CI: run the **Update screenshot baselines** workflow
(`gh workflow run update-snapshots.yml -f ref=<branch>`); local runs skip the
pixel comparison because macOS renders text differently.

Open the game with `?renderer=canvas` to play on the Canvas renderer instead
of WebGL; time and animations stay live. `e2e/live.spec.ts` uses it so its
tick-rate checks do not depend on the machine's GPU (headless Chromium
without one renders WebGL in software at a few frames a second).
`e2e/renderer.spec.ts` loads the game without the flag and checks WebGL.

The e2e tests serve the build on port 4173 and never reuse a running server;
run a second checkout with `PW_PORT=4174 npm run test:e2e`.

## Status and what is out of scope

v4 (gameplay lock, [docs/SCOPE-v4.md](docs/SCOPE-v4.md)) is in progress:
milestone 22 added two enemies, the flying Harpy (Tar Pit, Cannon and
Mortar cannot touch it) and the shielded Shieldbearer (small shots do half
damage), to the waves from wave 4 and wave 6, and one table of display
names (`src/game/names.ts`). Milestone 23 added the boss, Grumblefoot the
Troll King (4000 hp, 5 lives if he exits, slows capped at 30%), at the end
of wave 10, with a HUD boss bar while he lives. Before that, v3's tablet play (milestone 14),
art spike (15) and animation engine (16) were built. The simulation emits events (`state.events`) and the
renderer animates enemies as pixel sprites from them, in WebGL in play and
frozen in Canvas under `?test=1`. The sprites are placeholders; towers,
map and HUD keep their shapes until the v5 art pass, after v4 (gameplay).

v2 is done ([docs/SCOPE-v2.md](docs/SCOPE-v2.md)): towers go on any free
cell of a 30 x 15 grid off the path, through a build bar; the Longbow,
Mortar and Fire Pot joined the v1 three; and the balance pass retuned the
numbers so Longbow spam loses and a Tar Pit and Fire Pot build wins with
lives to spare. Milestone 13's evidence is Kyle finishing a game with the
new towers from the public link.

Out of scope for v2: new maps, new enemies, a second upgrade tier, hotkeys,
art packs, sound, saves, mobile layout.

Next candidates: the Kenney CC0 art pack, a second map, and a second
upgrade tier.

## Credits

Placeholder enemy sprites: [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack)
by Pixel-boy and AAA, CC0 (attribution appreciated, not required). Every
asset file and its license is listed in [assets/MANIFEST.md](assets/MANIFEST.md).

Further reading: [docs/SCOPE.md](docs/SCOPE.md),
[docs/DESIGN.md](docs/DESIGN.md), [DECISIONS.md](DECISIONS.md),
[DEVLOG.md](DEVLOG.md).
