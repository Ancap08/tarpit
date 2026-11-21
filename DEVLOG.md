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

### Verifier notes

The verifier (Claude Sonnet) ran `rm -rf dist && npm ci && npm run lint &&
npm run typecheck && npm test && npm run build && npm run test:e2e &&
npm run sim` from a clean state: every step passed (73 unit tests in 7
files before my additions, 1 e2e test). The sim tables match the
implementer's numbers: `soundBuild` wins on wave 10 with 20 lives and 910
gold; `lazyBuild` loses on wave 3.

I checked tower stats, upgrades, targeting (furthest along path, lower id on
ties, inclusive range), cannon splash, slow rules, the integer sell refund,
bounty on kill, refusal in won/lost and `round(60 / fireRate)` cooldowns line
by line against `docs/DESIGN.md`; all match. I added 11 test cases in
`src/sim/verifier2.test.ts` (84 total); all pass, no code defect found, no
code changed. `package.json` gains only the `sim` script (no dependency).
`src/sim` has no phaser, window or document references.

Hand check of spot 2 (240,176) with a base Musketeer (range 110): the
perpendicular distance to the y=96 segment is 80, so it covers
2 x sqrt(110^2 - 80^2) = 2 x sqrt(5700) = 150.99 px of that segment. The
tower also reaches the x=160 climb and a little of the y=240 run, so the
whole covered stretch is 299.95 px (path distance 150.5 to 459.5). A goblin
at 1 px/tick is shot at path distances 151, 211 and 271 (every 60 ticks) and
dies on the third 12-damage hit, so one Musketeer at spot 2 kills a lone
goblin. A test asserts this. With only that tower, wave 1 gives 2 kills and 6
leaks (14 lives, 85 gold): goblins arrive 60 ticks apart and each needs 3
shots, so one tower kills about one goblin in three.

Finding, not fixed: the implementer note "every build spot except 0 sits
exactly 80 px from the path" is wrong for spot 3 (240,304), which is 102.45
px from its nearest segment (the y=240 run), and spot 0 is 64 px, not 80. The
other eight spots (1, 2, 4 to 9) are exactly 80. So a base Tar Pit (range 80)
cannot reach the path from spot 3 at all, and from the other eight it touches
only a single point of a straight segment. The upgraded Tar Pit (95) fixes
both. This matters for milestone 6 tuning. Also noted: `lazyBuild` loses on
wave 3 against a target of about wave 7.

## 2026-11-21: milestone 3, rendering

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) added the first visual milestone: a
`GameScene` that renders the simulation, a HUD, a `?test=1` test mode, wave 1
Playwright tests, screenshot checks and a CI workflow that makes baselines.

- Small sim change: `state.shots` lists the shots fired in the most recent
  tick (`tick` clears it, `combat` appends). The renderer needs it because
  hits are instant. Won and lost ticks still change nothing, so the existing
  "a finished game is frozen" tests pass unchanged. Five new unit tests in
  `src/sim/shots.test.ts` (89 total).
- Renderer is `Phaser.CANVAS`, not `AUTO`, so headless screenshots do not
  depend on WebGL. One Graphics object is cleared and redrawn each frame for
  towers, enemies and shots; the map is drawn once. Shot effects live in the
  renderer and count down in simulation ticks, so test-mode frames are
  deterministic and 2x fades twice as fast.
- The path is drawn as one rectangle per segment plus a disc at each corner.
  Phaser's canvas Graphics has no line-join setting, and the path is
  axis-aligned, so this gives round joins with no extra code.
- The Playwright viewport is 960x540, so the Scale.FIT canvas sits at (0,0)
  at scale 1 and `uiRects()` coordinates are page coordinates.
- Spec gaps resolved: the smoke test read `window.__tarpit.scene`, which
  assumed `__tarpit` was the Phaser game; it now reads
  `window.__tarpit.game.scene`. The test API also has `startWave()`, so the
  visual test can start a wave without a mouse hover tint in the frame (the
  play-wave tests still click the real button). The mid-wave visual test sets
  `state().gold = 1000` because Musketeer, Cannon and Tar Pit cost 190
  together and the game starts with 100.
- Playwright's default writes a missing baseline and fails; with CI retries
  the retry would then pass against the image it just wrote. On CI,
  `updateSnapshots` is now `'none'`, so a missing baseline fails the check.
  Checked locally with `CI=1`: missing baseline fails; generated baselines
  compared equal over three repeats. Those local PNGs were deleted, not
  committed.
- What went wrong: the brief's mid-wave frame at 400 ticks shows no shot. The
  Musketeer at spot 2 fires every 60 ticks (392, 452, ...) and a tracer lasts
  6 ticks, so 400 is between shots. With spots 2, 6 and 7, no tick has two
  shot types visible at once: the Cannon at spot 6 first fires at tick 852 and
  the base Tar Pit at spot 7 at tick 1453 (its range, 80, only touches the
  path there; see the milestone 2 notes). The implementer first used tick 395
  (Musketeer tracer only, no splash, tar splat or tar ring). The coordinator
  chose tick 855 instead: Cannon tracer and splash, five goblins out, four
  with hp bars. The baseline frame uses 855.
- A first look at the local screenshots showed the Musketeer barrel hidden
  under the square and the tracer. The barrel is now longer and thicker, and
  tracers start at the muzzle.

### Verifier notes

Verifier: Claude Sonnet. Checked on branch `m3-rendering` against
`origin/main`.

- Clean run (`rm -rf dist && npm ci`, lint, typecheck, test, build,
  test:e2e): all green. 89 unit tests (84 existing plus 5 in
  `shots.test.ts`); 9 e2e tests as delivered.
- Sim diff: adds `Shot`, `state.shots`, the recording in `combat.ts` and the
  per-tick clear in `game.ts`. No existing `*.test.ts` changed; only
  `shots.test.ts` is new. `src/sim` imports nothing from Phaser, `src/game`
  or the DOM. The one behaviour-adjacent point: `tick` clears `shots` on
  setup ticks too, which is intended and tested.
- Boundary: `src/game` reads the sim and changes it only through `tick`,
  `startWave`, `buildTower`, `upgradeTower`, `sellTower`. The only direct
  write anywhere is `state().gold = 1000` in `e2e/visual.spec.ts` (accepted
  test setup). No milestone 4 or 5 work found: no click-to-build, no tower
  selection, no win or lose screens.
- Added tests: test mode runs no ticks (500 ms wait, tick 0, setup, wave 0);
  Start Wave is clickable again after `step(2005)` and starts wave 2; and
  `e2e/live.spec.ts`, which loads `/` without `?test=1`, clicks through the
  title and Start Wave, and checks the real loop (tick > 60 after 1.5 s, an
  enemy spawned, 2x gains at least 1.5x the 1x tick rate). `uiRects()` is
  not exposed outside test mode, so the live test uses hard-coded button
  centres taken from `hud.ts` (a layout change in `hud.ts` must update
  them). Ran the new tests five times in parallel with no failures.
- Workflow and config: `update-snapshots.yml` and `playwright.config.ts`
  match the checklist. Note that on CI a missing baseline fails (by design),
  and `retries: 1` only repeats that failure. The PR's `ci` check will be red
  on the three visual tests until the workflow has produced baselines.
- Screenshots (title, map at wave 0, mid wave): HUD shows gold, lives, wave
  and next-wave preview; shapes are distinct. Weak points, not changed: hp
  bars are about 20 x 3 px and hard to read; towers carry no text labels
  although DECISIONS says "shapes with labels"; the Tar Pit is a near-black
  blob.
- Correction by the verifier: the implementer note about the mid-wave tick
  said 395; the coordinator chose 855 (four hp bars, Cannon splash). I
  rewrote that line.

## 2026-11-21: milestone 4, build UI

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) added the build UI: click an empty spot to get
a build menu, click a tower to get an upgrade and sell panel. No sim changes;
the scene calls `buildTower`, `upgradeTower` and `sellTower` only.

- Modules: `src/game/input.ts` holds the pure geometry (spot hit radius 18,
  what a click means, where a popup goes) with 9 unit tests in
  `input.test.ts` (99 unit tests total). `ui/button.ts` is the HUD's old
  `Button` class moved out, plus an optional right-aligned cost label, a
  hover callback and show/hide, and a `ButtonStack` popup used by
  `ui/buildMenu.ts` and `ui/towerPanel.ts`. The HUD refactor was a move, not
  a rewrite; its buttons look and behave as before (the three existing
  baselines should not change).
- Click handling is geometric: a scene-level pointerdown asks
  `classifyClick` whether the point is inside the open popup (its buttons
  handle it, and a greyed button swallows it), on a spot (open the menu or
  select the tower), or elsewhere (close). HUD clicks count as elsewhere, so
  they close the popup and the HUD button still acts.
- What went wrong: the first version always put the popup to the right of
  the spot. Spot 2's panel then covered spot 4, so the brief's affordability
  test (click spot 4 right after upgrading at spot 2) hit the panel instead.
  Placement now tries right, left, below, above and takes the first side that
  covers no build spot; a unit test checks that no menu or panel for any of
  the ten spots covers a spot or leaves the map area. Spot 2's menu therefore
  opens above it and its panel below it.
- Spec gaps resolved: clicking the spot whose menu is already open keeps it
  open. The range preview shows on hover even for a greyed button, so a
  player can see what they are saving for. A tower being selected draws a
  larger outline (radius 22) outside the gold upgrade ring. The cursor turns
  into a pointer over spots. If the state changes under the UI (a test hook
  builds on the active spot, or the selected tower is gone), the popup
  closes on the next redraw.
- Tests: `e2e/build-ui.spec.ts` (5 tests) builds a Musketeer at spot 2
  through the menu and clears wave 1 (lives 14, gold 85, as with the API
  build), upgrades (gold 45) and sells (gold 108) through the panel, checks
  that a greyed Cannon does nothing, that Escape and clicks elsewhere close
  the popup, that clicking spot 3 moves the menu, that a HUD click closes it
  and still toggles speed, and that building works mid-wave. The
  affordability test sets `state().gold = 45` after building and upgrading
  (gold 10 at that point), as the brief allowed.
- Visual frames: `build-menu.png` (spot 2 menu open, pointer on Cannon, its
  90 px range preview) and `tower-selected.png` (upgraded Musketeer at spot
  2, 125 px range, panel with greyed "Upgraded" and "Sell +63"). Local
  screenshots were checked by eye; baselines come from the CI workflow.
