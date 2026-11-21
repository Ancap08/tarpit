# Devlog

How the agents built Tarpit, including what went wrong. Newest at the bottom.

## 2026-11-21: defining the game

Kyle first tried to define the game with another assistant and went in
circles for several rounds; nothing past the purpose and a list of open
questions got settled. He brought the brief to Claude (Fable 5.1), which
challenged the defaults, proposed a one-page scope and eight milestones, and
asked three questions. Kyle answered in one message: fantasy theme (the other
assistant had assumed a security theme), keep the proposed names, include the
speed toggle and wave preview, folder `~/Projects/tarpit`.

Lesson: the brief's "stop and wait for approval" step worked. One round of
pointed questions beat several rounds of open-ended discussion.

## 2026-11-21: milestone 0, scaffold

Roles: Fable 5.1 coordinated and wrote the docs. An implementer agent wrote
the scaffold. A verifier agent on a different model checked it. Kyle approved
the PR.

(Implementer and verifier notes are appended below by the agents.)

### Implementer notes

The implementer (Claude Opus) set up Vite 8, TypeScript, Phaser 3.90,
ESLint 10 with typescript-eslint, Vitest 5 and Playwright 1.65, plus CI and
Pages workflows. One version conflict: the latest TypeScript is 7.0.2, but
typescript-eslint 8.73 (latest, and its canary) declares support for
TypeScript `>=4.8.4 <6.1.0`. I checked the peer range before installing and
pinned TypeScript to `~6.0.3`; ESLint 10 works with typescript-eslint 8.73.
I also added `@types/node` so `tsc` can typecheck the config files that read
`process.env`. The first `npm run test:e2e` failed because the cached
Chromium did not match Playwright 1.65; `npx playwright install chromium`
fixed it. The first build warned that the bundle is over 500 kB; that is
Phaser itself (about 1.2 MB minified), so I raised the warning limit to
1500 kB instead of splitting code in a scaffold. To prove the `src/sim`
boundary rule works, I temporarily added `import 'phaser'` and an import
from `../game/TitleScene` to `src/sim/index.ts`; `npm run lint` failed with
two `no-restricted-imports` errors, and passed again after I removed them.
I also confirmed that a build with `VITE_BASE=/tarpit/` emits asset paths
under `/tarpit/`. Not verified locally: the GitHub Actions workflows
themselves, which first run when the PR opens.

### Verifier notes

The verifier (Claude Sonnet) ran `rm -rf dist && npm ci && npm run lint &&
npm run typecheck && npm test && npm run build && npm run test:e2e` from a
clean state; every step passed (exit 0; 4 unit tests, 1 e2e test). Adding
`import 'phaser'` to `src/sim/index.ts` made `npm run lint` fail with a
`no-restricted-imports` error; I reverted it and the tree was clean. Both
workflows parse; job names are `ci`, `build` and `deploy`; triggers, Node 22,
permissions, the `github-pages` environment, `VITE_BASE=/tarpit/` and the
Playwright install with deps are as specified, and every action major version
exists (checkout v7, setup-node v7, upload-artifact v7, configure-pages v6,
upload-pages-artifact v5, deploy-pages v5). A `VITE_BASE=/tarpit/` build emits
`/tarpit/assets/...` and a default build emits `/assets/...`. The README
"Run locally" steps work in order (dev server serves the titled page). The
TypeScript pin matches observation: typescript-eslint 8.73.0 peers on
`typescript >=4.8.4 <6.1.0`, and 6.0.3 is installed. Findings, not fixed:
`src/game/testMode.ts` (`isTestMode`) is unused and untested in milestone 0
(the `?test=1` flag belongs to milestone 3 or later), and the workflows have
not run on GitHub yet. I made no code changes.

Coordinator notes (Fable 5.1): the verifier's one finding, the unused
`testMode.ts`, was my own instruction to the implementer, not the
implementer's idea. It came out before the PR. Repo settings (Pages source set
to GitHub Actions, `main` protected so changes need a PR with the `ci` check
passing) were done by the coordinator with `gh api`, not by the agents.

## 2026-11-21: milestone 1, core simulation

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) added `types.ts`, `map.ts`, `enemies.ts`,
`waves.ts`, `game.ts` and `headless.ts` under `src/sim`, with a test file
for each of map, waves, game and headless (28 tests). The placeholder
`clamp` and its test are gone; nothing used them. All five checks passed on
the first run, and the tests passed first time too, so there is no failure
story here. That is worth a second look from the verifier rather than
comfort: the expected values in the tests are hand-derived (path length
1584, spawn ticks, 2005 ticks to clear wave 1), so a shared wrong reading of
the spec would pass both code and tests.

Choices the spec left open, each the simplest reading:

- State is mutated in place; `tick` returns nothing and `startWave` returns
  a typed result (`not-in-setup` or `no-more-waves`).
- Order inside a tick: move, remove exits and lose lives, spawn, advance,
  check clear. The first enemy of a wave spawns on the first `tick()` after
  `startWave` (waveTick 0) and does not move on its spawn tick. If lives hit
  0, the phase becomes `lost` and the rest of that tick is skipped.
- Spawn tick for enemy `i` of a group is
  `Math.round((delay + i * interval) * 60)`. Every value in the wave table
  lands on a whole tick, so rounding only absorbs float error.
- Movement uses `speed * (1 - slow) / 60` rather than `speed * (1/60)`, so a
  Goblin moves exactly 1.0 px and a Wolf 2.0 px per tick with no float drift.
  Slow duration is stored in ticks (`slowTicksLeft`).
- In `setup` a tick only advances the tick counter; in `won` or `lost` a
  tick does nothing.
- `playAllWavesNoTowers(maxTicksPerWave)` caps each wave, not the whole
  run, because the script step is per wave.

Result: the no-tower run loses on wave 2. Wave 1 leaks all 8 goblins (20 to
12 lives); the 12th goblin of wave 2 takes lives to 0.

### Verifier notes

The verifier (Claude Sonnet) ran `rm -rf dist && npm ci && npm run lint &&
npm run typecheck && npm test && npm run build && npm run test:e2e` from a
clean state: exit 0, 28 unit tests in 4 files, 1 e2e test. I re-derived the
numbers from `docs/DESIGN.md` without using the code:

- Path length: 160 + 144 + 260 + 288 + 260 + 192 + 280 = 1584 px.
- Full-path ticks: Goblin 60 px/s is 1 px/tick, so 1584 ticks. Wolf 120 px/s
  is 2 px/tick, so 792. Troll 35 px/s is 35/60 px/tick, so
  1584 x 60 / 35 = 2715.4, which rounds up to 2716 ticks.
- Wave 1: the last (8th) goblin spawns on wave tick 7 x 60 = 420, does not
  move that tick, and reaches 1584 px on wave tick 420 + 1584 = 2004. That
  is the 2005th tick, so the wave clears after 2005 ticks. This matches the
  test (2005; the headless test splits it as 100 + 1905).
- No-tower run: wave 1 leaks 8 goblins, 20 to 12 lives. Wave 2's 12th goblin
  spawns on wave tick 11 x 48 = 528 and exits on 528 + 1584 = 2112, taking
  lives 12 - 12 = 0, so the phase is `lost` on wave 2 exactly then.

I added 7 tests in `src/sim/verifier.test.ts` (same-tick group id order on
wave 9, exact-distance and overshoot exit removal, `startWave` in `lost`,
slow 0.5 giving 0.5 px/tick and a stale slow being ignored, win on clearing
wave 10 and not on wave 9, and a wave-10 last-enemy exit at 1 life being a
loss with no bonus). All pass; no code defects found, no code changed. The
boundary rule fires: `import 'phaser'` in `src/sim/map.ts` failed lint with
`no-restricted-imports`; reverted, tree clean. `src/sim` has no imports from
phaser or `src/game`. Implementer notes match what I saw. Findings, not
fixed: the README status line still says milestone 0 is in progress; and the
spec does not say whether the wave-clear bonus is paid on the winning wave
(the code pays it, and I assert that).

## 2026-11-21: milestone 2, combat and economy

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) added towers, targeting, splash, slow, gold,
build, upgrade and sell in `src/sim`, per `docs/DESIGN.md`, without changing
the milestone 1 shape (mutating state, typed results).

- New files: `towers.ts` (stat tables), `combat.ts` (tower fire),
  `actions.ts` (build, upgrade, sell), `time.ts` (`TICKS_PER_SECOND` and
  `secondsToTicks` moved out of `game.ts` so `combat.ts` can use them
  without a circular import; `game.ts` re-exports both).
- Tick order is now: move, exit and life loss, towers fire, spawn, counters,
  wave-clear check. Written in the `game.ts` header.
- `state.towers` is an array kept sorted by spotId, which is the firing
  order.
- `npm run sim` needs no new dependency: Node 22 strips the types of
  `scripts/simulate.ts`, and the script loads `src/sim` through Vite's
  `runnerImport`, because Node alone cannot resolve the extensionless
  imports inside `src/sim`.

What went wrong:

- Floating point in the sell refund. `Math.floor(90 * 0.7)` is 62, because
  `90 * 0.7` is `62.99999999999999`. The spec example (sell a 50 + 40
  Musketeer for 63) caught it before any test ran; the refund now uses
  `Math.floor(spent * 7 / 10)`, and a test pins 63.
- Two of my own combat tests failed on first run because I placed enemies
  by mental arithmetic and got the geometry wrong (distance 150 is still on
  the first segment, not the second). Fixed by choosing points with exact
  integer positions and asserting those positions in a test.
- A scratch `vitest --root /` call scanned the whole disk and had to be
  stopped. No repo impact.

The winning script took 2 iterations. Iteration 1 (two Musketeers only)
lost on wave 5. Iteration 2, the first full hand-written build, won with all
20 lives. A throwaway random search over build orders (not committed) also
found 20-life wins within minutes, so the current numbers are easy for a
sensible build.

Balance observations for milestone 6 (numbers unchanged, as instructed):

- `soundBuild` wins with 20 of 20 lives and 910 gold unspent.
- `lazyBuild` (one Musketeer) loses on wave 3; the milestone 6 target says
  "around wave 7".
- Six base Musketeers (0, 2, 4, 6, 7, 9) lose on wave 10.
- Every build spot except 0 sits exactly 80 px from the path, which equals
  the base Tar Pit range. A base Tar Pit there touches the path at only one
  or two points, so it is nearly useless until upgraded (range 95).
