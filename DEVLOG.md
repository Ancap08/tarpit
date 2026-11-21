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

### Verifier notes

Verifier: Claude Sonnet. Checked on branch `m4-build-ui` against
`origin/main`.

- Clean run (`rm -rf dist && npm ci && lint && typecheck && test && build &&
  test:e2e`): exit 0; 99 unit tests, 19 e2e tests. `--repeat-each=3` over
  `build-ui.spec.ts` plus the verifier spec: 33 of 33 passed, no flakes.
- `git diff origin/main --stat -- src/sim` is empty. No `src/game` code
  writes gold, lives, hp, towers or phase; the scene calls only
  `buildTower`, `upgradeTower` and `sellTower`.
- Scope: nothing from milestone 5. Only the listed features are present
  (menu, panel, greying, hover range preview, spot hover, Escape, pointer
  cursor). One small addition inside the panel feature: selecting a tower also
  draws its range circle and a larger outline.
- New probes in `e2e/build-ui-verifier.spec.ts` (6, all pass): greyed Upgrade
  changes nothing even with 500 gold; Sell mid-wave removes the tower and the
  wave keeps ticking; selling then clicking the same spot opens the build
  menu; Start Wave works with a menu open and closes it; building with
  exactly the cost leaves gold 0; for all ten spots every menu and panel
  rectangle stays inside 0..960 and above y = 480.
- Correction: the implementer note says 9 tests in `input.test.ts`; there are
  10 (89 before plus 10 is the 99 total).
- The statement that the three existing baselines do not change cannot be
  checked locally (baselines are CI-only); CI must confirm it.
- Readability, from the two local frames: the menu at spot 2 sits over the
  path and covers part of it, so enemies passing there would be hidden while
  it is open. The white Cannon range preview is faint on the light path and
  grass. The greyed "Upgraded" text is dim grey on dark grey, legible but low
  contrast. Observations only; art is a milestone 6 matter.

## 2026-11-21: milestone 5, win, lose, restart

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) added the win and lose screens and Play again.
No changes in `src/sim`: the sim already computed 'won' and 'lost', and its
exported `soundBuild()` and `lazyBuild()` scripts were enough for the test
hook, so no new sim helper was needed.

- Modules: `ui/endScreen.ts` draws a translucent veil over the 960 x 480 map
  (the HUD stays visible with the final numbers) and a centred panel with
  the title, the lines and a Play again button. The words live in
  `ui/endText.ts` with 3 unit tests (102 unit tests total). New palette
  entries: `endVeil`, `endPanel`, `endPanelEdge`, and text colours
  `victory` (gold), `defeat` (muted red) and `endLine`.
- End detection: every `redraw()` checks the phase and shows the screen
  once. The game loop, `step()`, `runScript()` and every action redraw, so
  this covers both the frame loop and the test hooks. While it shows, popups
  are closed, map clicks and hover are ignored, Start Wave is greyed (as
  before) and the speed toggle is greyed too, so clicking it changes nothing.
- Restart: Play again calls `this.scene.restart()`. Phaser shuts the scene
  down, which destroys every game object and removes the scene's input and
  keyboard listeners, then runs `create()` again, which already made a fresh
  `createGame()` and reset speed to 1x. This is the smallest change and
  leaves no state to reset by hand. The e2e test checks it: after Play
  again the pointerdown, pointermove and Escape listener counts and the
  number of scene objects match a first game, and wave 1 replays to lives
  12 and gold 125. Phaser runs the restart on its next frame, so tests wait
  for the fresh state after the click.
- `runScript(name)` plays the script wave by wave through the scene's own
  `build`, `upgrade`, `sell`, `startWave` and `advance`, ticking one at a
  time until the wave ends, and throws if the sim refuses an action. The
  sound build ends exactly as headless: won, lives 20, gold 910.
- What went wrong: the first version made the veil interactive to swallow
  clicks. About one run in three, a click on Play again right after the
  screen appeared went to the veil instead. Phaser orders overlapping
  interactive objects by the camera's render list from the last frame;
  when the click came before any frame had drawn the end screen, neither
  object was in that list and the veil won the tie. Found with
  `--repeat-each=10`. The veil is now plain drawing, and the scene's own
  pointer guard ignores map clicks, so the button is the only interactive
  object there. 40 of 40 repeated runs then passed.
- Spec gaps resolved: the speed toggle is greyed on the end screens rather
  than left clickable. The HUD's "Next:" line still shows the next wave's
  contents on the lose screen (for example "Next: 8 Goblin, 5 Wolf"); it is
  accurate and left as is. On the win screen the last cannon splash stays
  drawn, faded, under the veil, because time is frozen in that frame.
- Tests: `e2e/end-screens.spec.ts` (4 tests): lose with no towers through
  real Start Wave clicks (wave 2, lives 0), a click on spot 2 under the veil
  opens nothing, Play again gives a fresh game (gold 100, lives 20, wave 0,
  tick 0, no towers, speed 1x) and wave 1 replays exactly; win with
  `runScript('soundBuild')` then Play again; `runScript('lazyBuild')` loses on
  wave 3; speed 2x before losing is 1x after Play again. `visual.spec.ts`
  adds `won.png` and `lost.png`; baselines come from the CI workflow. Local
  frames were checked by eye: text is readable and nothing overlaps.

### Verifier notes

Verifier: Claude Sonnet. Checked on branch `m5-win-lose` against
`origin/main`.

- Clean run (`rm -rf dist && npm ci && lint && typecheck && test && build &&
  test:e2e`): exit 0; 102 unit tests, 31 e2e tests (37 with the verifier
  spec). `end-screens.spec.ts --repeat-each=5`: 20 of 20; `--repeat-each=10`:
  40 of 40, so the implementer's claim holds. The verifier spec at
  `--repeat-each=5`: 30 of 30.
- `git diff origin/main --stat -- src/sim docs DECISIONS.md` is empty. No
  `src/game` code assigns gold, lives, hp, towers or phase; the scene calls
  only exported actions.
- Scope: win screen, lose screen, Play again, greyed speed toggle (disclosed
  by the implementer) and the `endScreen()` and `runScript()` test hooks.
  No score, title return or sound.
- Veil bug: the code matches the DEVLOG account. The veil is a plain
  rectangle (not interactive), and `onPointerDown`, `onPointerMove` and
  `openSpot` return early while an end screen shows.
- New probes in `e2e/end-screens-verifier.spec.ts` (6, all pass): (a) a third
  game after two lose and restart cycles plays wave 1 to lives 14, gold 85
  with a Musketeer built through the real menu; (b) no `playAgain` rect and
  no end screen after restart; (c) on the lose screen the Start Wave and
  speed clicks change nothing, and clicks on all spots outside the button
  open nothing, including spots 4, 5 and 7 that lie under the panel but
  outside the button; (d) win HUD text is "Gold 910", "Lives 20", "Wave
  10/10", "Next: none"; (e) Escape keeps the end screen; (f) a tower panel
  open when the game is lost is closed.
- Note from writing probe (c): spot 6 (500, 304) lies under the Play again
  button, so a click there is a click on Play again. Correct behaviour, but
  worth knowing when a test clicks spots on an end screen.
- Readability from the two local frames: all text is legible. The panel is
  nearly opaque, so it hides the path and spots 4 to 7 behind it. The lose
  screen's HUD still says "Next: 8 Goblin, 5 Wolf" (disclosed). On the win
  frame the faded cannon splash shows below the panel. Observations only.
- README file layout matches the files; the seven-frame count and the hook
  list match the code. Baselines for `won.png` and `lost.png` are CI-only and
  not checked locally.

## 2026-11-21: milestone 6a, balance pass

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) tuned the numbers so the game is a fair
challenge, without changing its shape: still 100 gold, 20 lives, 10 waves,
three towers, three enemies, one upgrade, 70% sell, the same path and tick
rules. Only numbers, wave lists and the position of spot 3 changed.

- Archetypes (`src/sim/headless.ts`), each a function returning a
  `WaveScript`, so `playScripted` and the e2e `runScript` hook replay them
  unchanged (no `src/game` code changed):
  - `noTowers()`: builds nothing. Target: lost by wave 3.
  - `lazyBuild()`: a kid's build. Before each wave it buys base Musketeers
    while it can afford them, on spots nearest the spawn first
    (`KID_SPOT_ORDER`: 0, 1, 3, 2, 4, 6, 5, 7, 9, 8). Never upgrades or
    sells. Target: lost on wave 6, 7 or 8.
  - `greedyMusket()`: the same, but it upgrades an unupgraded Musketeer
    before it buys another (buy, upgrade, buy, ...). Target: lost on wave 8
    to 10, or won with at most 5 lives.
  - `soundBuild()`: `SOUND_PLAN` taken in order, each action as soon as gold
    allows: Musketeers at 0 and 2, both upgraded; a Tar Pit at spot 4 where
    the top run turns into the long middle run, Cannons behind it at 5 and
    6; then more Musketeers, each upgraded. Target: won with 5 to 15 lives
    and under 150 gold after wave 9 (see the revision below; the first
    version of this target was under 150 gold at the end).
  - `soundBuildNoTar()`: `soundBuild()` with every Tar Pit build and every
    upgrade on a Tar Pit spot removed. Must do strictly worse.
  The rule-based archetypes decide by playing: before each wave they look at
  their gold and record what they buy. The sim is deterministic, so the
  recorded script replays to the same game.
- `npm run sim` prints all five per wave (wave, lives, gold, ticks) and a
  summary. `src/sim/balance.test.ts` (8 tests) asserts every target as a
  range, pins soundBuild exactly (141 gold after wave 9; 11 lives and 253
  gold at the end), checks soundBuildNoTar
  is strictly worse, and checks the archetype rules (kid order, lazy builds
  only base Musketeers, greedy alternates).

Results, before (old numbers, new archetypes) and after:

| Archetype | Target | Before | After |
|---|---|---|---|
| noTowers | lost by wave 3 | lost wave 2 | lost wave 2 |
| lazyBuild | lost on wave 6 to 8 | won, 18 lives, 1150 gold | lost wave 8 |
| greedyMusket | lost on wave 8 to 10, or won with 5 or fewer lives | won, 17 lives, 745 gold | won, 2 lives, 340 gold |
| soundBuild | won, 5 to 15 lives, under 150 gold after wave 9 | won, 20 lives, 910 gold (525 after wave 9) | won, 11 lives, 253 gold (141 after wave 9) |
| soundBuildNoTar | strictly worse than soundBuild | won, 20 lives, 1020 gold | lost wave 7 |

Every number changed, with the reason. "Reverting it" means putting back
that one number with every other final value in place (checked against the
final tables):

| Number | Before | After | Why |
|---|---|---|---|
| Spot 3 position | (240,304) | (240,240) | Was 102 px from the path, so a base Tar Pit there reached nothing. Now exactly 80 px from the first vertical segment, 64 px from spot 2. |
| Goblin bounty | 5 | 4 | Gold piled up: the old sound build ended with 910 unspent. Reverting it alone: lazyBuild survives to wave 9, soundBuild ends with 217 gold. |
| Wolf hp | 20 | 28 | An upgraded Musketeer (22) no longer one-shots a Wolf; a base Musketeer needs 3 shots, an upgraded one 2, so upgrades pay off. Reverting it: lazyBuild survives to wave 9, greedyMusket wins with 9 lives. |
| Wolf bounty | 6 | 5 | Less gold piling up. Reverting it: lazyBuild survives to wave 9, soundBuild ends with 195 gold. |
| Troll hp | 150 | 500 | Make the Troll actually tanky; Trolls are the late-wave threat. Reverting it: lazyBuild wins. |
| Troll bounty | 15 | 11 | A kill worth chasing. First tuned to 4 (see the revision below). |
| Musketeer upgrade cost | 40 | 35 | Make an upgrade better value than a new base Musketeer, so greedyMusket outlasts lazyBuild. The sound build upgrades its Musketeers too: reverting it leaves soundBuild 1 life. |
| Musketeer upgraded damage | 20 | 22 | Same reason; 2 shots kill a Goblin or a Wolf. Reverting it alone still meets every target, but soundBuild drops to 6 lives; kept for margin. |
| Cannon upgraded splash radius | 50 | 55 | Catches more of a slowed, bunched group. Reverting it alone still meets every target, but soundBuild drops to 6 lives; kept for margin. |
| Tar Pit range | 80 | 90 | 80 equalled the distance from nine spots to the path, so a base Tar Pit barely reached. 90 reaches from every spot. Reverting it: soundBuild wins with 2 lives. |
| Tar Pit fire rate | 1.0/s | 2.0/s | It slows only its target, so at 1/s it held about two enemies slowed. 2/s keeps a group slowed. Reverting it: soundBuild wins with 2 lives. |
| Tar Pit upgraded range | 95 | 105 | Keeps the upgrade a real range gain over the new base 90. Reverting it: soundBuild loses on wave 10. |
| Tar Pit upgraded fire rate | 1.0/s | 2.0/s | Same as base; an upgrade should not fire slower. Reverting it: soundBuild loses on wave 10. |
| Tar Pit upgraded slow | 55% | 60% | A stronger upgrade for the tower the sound build leans on. Reverting it: soundBuild wins with 3 lives. |
| Wave 3 wolves | 5 | 6 | Reverting it: lazyBuild survives to wave 9. |
| Wave 5 goblins | 10 every 0.8 s | 12 every 0.7 s | Mid-game pressure. Reverting it alone still meets every target, but soundBuild ends with 145 gold, 5 under the limit; kept for margin. |
| Wave 6 goblins | 15 every 0.6 s | 18 every 0.5 s | A dense swarm: splash and slow handle it, base Musketeers leak. Reverting it: lazyBuild survives to wave 9. |
| Wave 6 wolves | 8 every 0.6 s | 14 every 0.5 s | Same. Reverting it: lazyBuild survives to wave 9. |
| Wave 7 trolls | 4 | 7 | The wall a full board of base Musketeers cannot hold. Reverting it: lazyBuild survives to wave 9. |
| Wave 8 trolls | 3 | 4 | Reverting it: lazyBuild survives to wave 9. |
| Wave 9 trolls | 8 | 4 | Keeps the sound build under 150 gold when wave 10 starts, now that a Troll pays 11. Added in the revision. |
| Wave 10 | 30 Goblin every 0.4 s; 15 Wolf every 0.5 s, delay 5 s; 8 Troll every 2 s, delay 2 s | 8 Wolf every 0.5 s, delay 4 s; 12 Troll every 2 s | A Troll march finale. Fewer small enemies than before: under the first gold target the old wave 10 alone paid 385 gold. |

Unchanged: Goblin hp and speed, Wolf and Troll speed, every tower cost,
Musketeer base stats and upgraded range, Cannon base stats and upgraded
damage and range, Tar Pit damage, base slow and slow duration, upgrade costs
of Cannon and Tar Pit, waves 1, 2 and 4, the wave 9 wolves, the clear bonus
(25), all intervals and delays not listed above.

The "Reverting it" results above were measured before the revision, with
Troll bounty 4 and 8 Trolls in wave 9.

Revision (coordinator, same day): a 500 hp Troll that pays 4 gold would
feel wrong to a player. The gold target was there to keep the economy tight
while gold can still be spent, and gold earned in wave 10 never can be. So
the target became "under 150 gold after wave 9, when wave 10 is about to
start", with no limit on final gold, and the Troll bounty went up to a
rewarding whole number. At Troll bounty 10 to 15 with no other change, every
other target still held, but soundBuild had 172 to 237 gold after wave 9:
wave 9 alone paid 60 + 8 x bounty + 25. The cheapest fix was one wave
number: wave 9 Trolls 8 to 4. Bounty 11 with 4 Trolls gives 141 gold after
wave 9; bounty 12 would also need fewer wave 9 Wolves. Results moved:
greedyMusket now wins with 2 lives instead of losing on wave 9 (still in its
target), soundBuild wins with 11 lives and 253 gold, lazyBuild still loses
on wave 8 and soundBuildNoTar on wave 7.

Iterations: about 14 hand-tuned configurations, plus scripted grid sweeps
(about 1,100 configurations in all) with a scratch harness that patched the
stat tables in memory and scored each run against the targets, then a
one-at-a-time revert pass that put back every changed number whose original
value scored as well. That pass reverted the Cannon base buffs (range 100,
damage 30, splash 45), the Cannon upgraded buffs (range 110, damage 50), the
base Tar Pit slow (50%), the upgraded Tar Pit duration (3 s) and four wave
changes (more wolves in waves 4, 7 and 9, more goblins in wave 8): none of
them mattered once the rest was in place.

What went wrong:

- The first economy cut (bounties 3/3/10, clear bonus 15) made the game
  lost or nearly lost in waves 1 to 3 for every build, and trivial after
  that: every build lost lives early, then all ten spots filled and late
  gold piled up. Income was not the lever on its own; the late waves had to
  get harder too.
- The old sound build (two Musketeers, one Tar Pit at spot 6, two Cannons)
  ran out of plan after wave 8 and then banked gold, and did worse than
  greedyMusket. Cannons and Tar Pits only beat Musketeers once the Tar Pit
  sat ahead of the Cannons on the long middle run, so the plan became a
  list taken as gold allows rather than fixed per-wave purchases.
- "Under 150 gold at the end" cannot be met by spending alone: gold earned
  in wave 10 arrives after the last chance to spend it. The first fix was to
  make wave 10 pay little (Troll bounty 4, fewer small enemies). The
  revision replaced that target instead (see above).
- The results are sensitive to damage breakpoints. For example, in one
  trial base Musketeer damage 10 instead of 12 cost the sound build 4 lives
  in wave 2 and the game by wave 8, because an upgraded 18 plus a base 10
  no longer killed a 30 hp Goblin in two hits. Margins at the final values: lazyBuild loses on wave
  8, the edge of its range (it had 4 lives entering wave 8); greedyMusket
  sits at the edge too (won with 2 lives, limit 5); soundBuild sits
  mid-range.

Other notes:

- Spot 3's build menu now opens to its left (spot 4 blocks the right), over
  the start of the path, like the spot 2 menu noted at milestone 4. Spot 1's
  menu now opens to its right, because spot 3 no longer sits there.
- Tests updated to the new values with the same intent (113 unit tests,
  37 e2e). The floating point sell test now checks `sellRefund(90)` directly,
  because no tower totals 90 any more. The inclusive-range test uses a path
  distance that is exactly 90.000 px from spot 0 in floating point.
- e2e expectations changed: one Musketeer at spot 2 after wave 1 is lives 14,
  gold 83 (was 85); upgrade there leaves 48 and sell refunds 59 (was 45 and
  63); build plus upgrade from 100 leaves 15 (was 10); the sound build wins
  with 11 lives and 253 gold (was 20 and 910); the lazy build loses on wave
  8 (was 3); spot 3's menu opens to its left at y 240. Unchanged: no towers
  gives lives 12, gold 125 after wave 1 and loses on wave 2.
- Visual baselines change for the mid-wave, won and lost frames and for any
  frame that shows spot 3. No PNGs are committed; the coordinator
  regenerates them on CI.

### Verifier notes

Verifier: Claude Sonnet. Checked on branch `m6a-balance` against
`origin/main`.

- Clean run (`rm -rf dist && npm ci`, lint, typecheck, test, build, e2e,
  sim): all exit 0. 118 unit tests in 13 files (113 plus my 5), 37 e2e
  tests. Sim summary: noTowers lost wave 2; lazyBuild lost wave 8, 310 gold;
  greedyMusket won, 2 lives, 340 gold; soundBuild won, 11 lives, 253 gold
  (141 after wave 9); soundBuildNoTar lost wave 7.
- Every number in the DESIGN.md enemy, tower, upgrade, wave and spot tables
  matches `enemies.ts`, `towers.ts`, `waves.ts` and `map.ts`. The DEVLOG
  before/after table matches `git diff origin/main` for those files: no
  undocumented change and no documented change that did not happen.
- Forbidden knobs are unchanged. `src/game` changed only in two test files.
- Archetypes do what the DEVLOG says. `soundBuildNoTar()` is derived from
  `soundBuild()` by filtering out the Tar Pit spot's actions. Spot 3
  (240,240) is exactly 80.000 px from the nearest path segment (not on the
  40 px strip), 64 px from spots 2 and 3's nearest neighbour, so at least 50
  px from every spot. Spot 0 stays at 64 px, as DESIGN.md says.
- `src/sim/balance-verifier.test.ts` (5 probes, all pass): sound build is
  deterministic; Cannon-only build does worse than the sound build; Tar
  Pit-only build loses; one Troll passes one base Musketeer at spot 2 and
  exits (lives 19, no bounty); sound build loses lives in waves 7 and 8.
- Observation: `DECISIONS.md` has no milestone 6a entry; the decisions
  (number changes, gold target revision) live only in this section.

## 2026-11-21: milestone 6b, visual polish

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

Polish only: no change to `src/sim`, balance, HUD positions, the test API
or fonts. Every new colour is in `src/game/palette.ts`.

- Tower labels: "Musket", "Cannon", "Tar" in 12 px bold monospace, light
  text on a small dark pill, 22 px below the tower centre (clear of the
  19 px upgrade ring and the Tar Pit blobs). Upgraded towers read
  "Musket+" and so on. One Text object per spot (`draw/labels.ts`).
- Hp bars: 30 x 4 fill inside a 1 px dark border, green at 50% or more,
  orange below 50%, red below 25%. Still only when hurt. Drawn in a second
  pass after every body, so a following enemy never hides a bar.
- Tar: the Tar Pit body, its splats and the slowed-enemy ring are one dark
  brown (`0x2e2118`); the glossy highlight stays.
- Range circles: the selected tower's range and the hover preview both use
  a pale yellow (`0xfff2a8`) 2 px edge at 0.9 alpha over a 0.12 fill. The
  separate white preview colour is gone.
- Greyed buttons: label `#a8adb5` on `0x3a3d42` is 4.83:1 (was `#8a8f97`,
  3.35:1). Enabled labels are 9.98:1 on the same grey and 7.28:1 on the
  brown button, so greyed still reads as greyed.
- Menu and panel placement: among the sides that cover no build spot, the
  one with the least path under it wins (a 9 x 9 grid of sample points over
  the box, corners and centre included, against the 40 px path strip).
  Spot 3's menu and panel now open below it on grass (were left, over the
  first bend, and right); spot 7's panel opens above (was below, over the
  bottom run). Spot 2 is unchanged: right covers spot 4, left spot 0,
  below spot 3, so above is its only clear side and it still covers part of
  the top run (about 41% of the menu box).
- End screens: the panel is 0.85 alpha, so the map shows through faintly.
  On the lose screen the HUD "Next:" text is blank.
- Map: the cottage got a chimney (it already had a door); the cave mouth
  got a lighter inner arc.
- Visual tests: a new `enemies.png` frame plays wave 8 (the only wave with
  all three enemy types) to tick 1200 and asserts 8 Goblins, 5 Wolves,
  4 Trolls, 2 hurt Trolls and 2 slowed enemies. `mid-wave.png` stays as it
  was (it is the frame that shows a Cannon shot).

### What went wrong

- The brief expected spot 2's menu to move off the path. With the four
  sides the placement tries, spot 2 has one clear side and it is over the
  path, so the scoring cannot move it. Moving it would need new candidate
  positions (for example below and to the right, which still covers part of
  the middle run), which is a bigger change than this milestone asked for.
- The first enemies frames (tick 480 to 820, Tar Pit near the spawn)
  bunched 20 or more enemies around the cave, with bars on top of each
  other. A headless scan for ticks where no two enemies are closer than
  14 px found tick 1200 with a different build.
- A new baseline (`enemies.png`) means CI fails the visual job until the
  baseline workflow writes it, like every frame these changes touch.

### Verifier notes

Verifier: Claude Sonnet, on branch `m6b-polish`.

- Clean run (`rm -rf dist && npm ci`, lint, typecheck, test, build,
  test:e2e): all exit 0. 122 unit tests before my additions (123 after),
  38 e2e tests (39 after). `visual.spec.ts` and `build-ui.spec.ts` with
  `--repeat-each=3`: 39 passed. Local runs skip pixel comparisons
  (`ignoreSnapshots` off CI), so the new `enemies.png` baseline is not
  checked until the baseline workflow runs.
- Forbidden paths: no diff in `src/sim`, `docs/DESIGN.md`, `testMode.ts` or
  `testGlobal.d.ts`. The `hud.ts` diff is one line (blank Next on loss); no
  layout numbers changed. `live.spec.ts` passes with its hard-coded centres.
- Contrast recomputed: `#a8adb5` on `0x3a3d42` 4.83:1 (old `#8a8f97`
  3.35:1); `#fff4dc` on `0x3a3d42` 9.98:1, on `0x6b4a2b` 7.28:1. All match
  the claims; `palette.ts` values are the ones `button.ts` uses.
- Placement, recomputed with a 1 px sampling grid: spot 2 menu right covers
  spot 4, left spot 0, below spot 3; above covers no spot and 40.5% path
  (claim "about 41%": true). Panel above covers 58.6% path. The
  "cannot avoid the path" claim holds. The milestone 4 probe (f) (no menu
  or panel over the HUD or off canvas, every spot) passes.
- Enemies frame: added `src/sim/enemies-frame.test.ts`; the headless setup
  gives exactly `{wave 8, goblins 8, wolves 5, trolls 4, hurtTrolls 2,
  slowed 2}`, matching the browser test.
- Frames: readable. Findings, all minor and not fixed:
  1. Panels and menus can sit on labels. A panel that opens below its tower
     (spot 3) covers that tower's own label, because the panel starts 28 px
     below the centre and the label spans 22 to about 38 px. Menus at spot 1
     (opens right) and spot 7 (opens below) overlap the label of spot 3 and
     spot 6 respectively when those hold towers, by a few pixels.
  2. On the win screen, tower labels show faintly through the 0.85 panel
     (for example "Cannon" just under "Victory!").
  Added e2e test: the spot 7 panel (opens above) does not touch the spot 7
  label (label box computed from the known offset 22 and 12 px font).
- DEVLOG matches what I saw. README layout omitted `draw/labels.ts`; fixed
  in its own commit.

## 2026-11-21: milestone 7, ship, and retrospective

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) wrote the README, the demo media and this
section. No game code changed.

- `npm run demo` (`scripts/record-demo.ts`) builds `dist/`, serves it with
  `vite preview` and plays in real time, not test mode, with Playwright's
  `recordVideo`. Every click goes through the real menus; the rectangles
  come from the running scene's `uiRects()`, which is callable through
  `window.__tarpit.game` outside test mode too. ffmpeg makes a 640 px,
  12 fps, two-pass palette GIF (22 s, 2.5 MB, sped up about 2x) and the
  script saves a 960x540 still when the Cannon has just fired into a group.
- What went wrong: the brief asked for a Musketeer, a Tar Pit and a Cannon
  before wave 1. They cost 190 together and the game starts with 100 gold.
  The first two recordings (Cannon at spot 5, then Tar Pit at spot 4 after
  wave 1) could not afford the third tower after wave 2. A headless search
  over two-tower openings found one that can: Musketeer at spot 2, Cannon
  at spot 3 after wave 1, Tar Pit at spot 4 after wave 2. The real-time
  recording ended wave 2 with 12 lives and 68 gold, exactly what the
  headless sim predicted.
- The live site serves `/tarpit/assets/index-y29E9S48.js`, the same hash as
  a local build of this branch, and its title screen renders.

### Timeline

All in one session on 2026-11-21 (UTC):

- 06:11 first commit (scope, decisions, devlog, agent rules).
- 06:29 PR 1 merged (milestone 0). Then PR 2 at 06:40, PR 3 at 06:54,
  PR 4 (baseline workflow) at 07:07, PR 5 at 07:09, PR 6 at 07:20, PR 7
  at 07:32.
- 08:04 PR 8 merged (milestone 6a, balance); 08:15 PR 9 merged
  (milestone 6b, polish).

Kyle's involvement during the build was three messages: approving the plan,
merging PR 1 and saying continue, and saying continue through milestones 6
and 7.

### What went wrong

- Milestone 0: TypeScript 7 was current, but typescript-eslint supported
  only below 6.1, so TypeScript is pinned to 6.0.x.
- Milestone 0: the coordinator's brief asked for a `?test=1` hook three
  milestones early; the verifier flagged the unused `testMode.ts` and it was
  removed until milestone 3.
- Milestone 2: the implementer's notes said nine spots sit exactly 80 px
  from the path; the verifier measured spot 3 at 102 px and spot 0 at 64 px.
  That finding is why spot 3 moved in milestone 6a.
- Milestone 3: the brief's mid-wave frame (tick 400) fell between shots.
  The implementer used tick 395 (one Musketeer tracer); the coordinator
  chose 855 (Cannon tracer and splash). The DEVLOG still said 395 until the
  verifier corrected it.
- Milestone 3: a `workflow_dispatch` workflow must exist on the default
  branch before it can run, so the baseline workflow went in as its own PR
  (PR 4) ahead of milestone 3.
- Stale notes were corrected by verifiers more than once: the README status
  line (milestone 1), the spot distances (milestone 2), the 395 tick
  (milestone 3), the unit test count in `input.test.ts` (milestone 4: 10,
  not 9) and a missing file in the README layout (milestone 6b).
- Milestone 4: the first build menu always opened to the right, so spot 2's
  menu covered spot 4 and the next click hit the menu. Placement now checks
  every side and a unit test covers all ten spots.
- Milestone 5: an interactive end-screen veil raced the Play again button
  on the first frame and stole about one click in three; found with
  `--repeat-each=10`.
- Milestone 6a: the Troll bounty was first tuned down to 4 to meet a target
  ("under 150 gold at the end") that measured gold nobody can spend. The
  coordinator replaced the target and the bounty became 11.
- Milestone 6a: small visual changes fell under Playwright's pixel colour
  threshold, so the baseline workflow left stale PNGs in place. It gained an
  `all` input that rewrites every baseline.
- Milestone 7: the demo brief assumed 190 gold at the start (see above).

### What the process proved

- Every verifier found at least one inaccuracy or improvement, and several
  were in notes or tests the implementer's own checks had passed.
- No PR merged red: all nine merged PRs show the `ci` check as success, and
  branch protection on `main` requires it.
- Keeping the simulation in plain TypeScript made balance a numbers job:
  about 1,100 configurations were scored headlessly in milestone 6a, and the
  browser replays the same scripts to the same result (sound build: 11
  lives, 253 gold in both).
- Determinism held outside test mode too: the real-time demo recording
  ended wave 2 exactly where the headless run said it would.

### What I'd change next time

- Check briefs against the sim before sending them. Two briefs carried
  numbers that did not fit the game (the tick 400 frame, three towers on
  100 gold), and each cost a round trip.
- Land CI plumbing such as the baseline workflow in milestone 0, so later
  milestones do not need a side PR.
- Get the human playtest earlier. Milestone 6 lists Kyle's play notes as
  evidence, and they were still pending when milestone 7 started.

### Verifier notes

Verifier: Claude Sonnet, on branch `m7-ship`.

- Clean run (`rm -rf dist && npm ci && lint && typecheck && test && build &&
  test:e2e`): all exit 0. 123 unit tests in 16 files, 39 e2e tests in 8 files.
- README "By the numbers" recomputed from `origin/main` with `git` and `gh`:
  every figure matches (68 commits, 59 non-merge and 9 merges; trailers Opus
  29, Fable 5.1 13, Sonnet 12; 6 `github-actions` commits; 9 merged PRs, 8
  milestone PRs plus PR 4; 8 baselines; first commit 06:11 UTC to PR 9 merge
  08:15 UTC, 2 h 4 min). PR merge times in the timeline match `gh`.
- Links: relative files exist; the badge, workflow page and Pages URL return
  200; the badge URL names this repo. The live site serves
  `index-y29E9S48.js`, the same hash as a local build.
- Demo: GIF 640x360, 22.0 s, 2.5 MB; PNG 960x540. Frames show building through
  the menus, a Tar Pit placed in the last seconds, and waves 1 and 2 with the
  HUD. The frames at 10 s and 20 s fall between waves (wave 1 just cleared;
  wave 2 cleared with the Tar Pit menu about to open), not mid-wave; 3 s is
  mid-wave.
- `package.json` diff is only the `demo` script line; vitest excludes
  `scripts/**`.
- Findings, not fixed: (1) "Kyle merged PR 1 himself" and "the coordinator
  merged the rest" cannot be checked from GitHub, since every PR shows the
  same merger login. (2) "Kyle's involvement was three messages" and the
  workflow-dispatch (PR 4) and baseline `all` input bullets in "What went
  wrong" have no earlier DEVLOG or DECISIONS entry; the workflow history and
  PR list support the last two, nothing in the repo supports the first. (3)
  README says the verifier checked every PR; PR 4 has no verifier record in
  the DEVLOG.

## 2026-11-21: milestone 8, grid placement in the simulation

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) moved tower placement in `src/sim` from ten
fixed spots to grid cells, and kept the v1 build UI working on ten fixed
cells until milestone 9.

- `src/sim/grid.ts`: `GRID_COLS = 30`, `GRID_ROWS = 15`, `CELL = 32`,
  `cellCenter`, `cellKey` (row * 30 + col), `cellFromKey`, `isInsideGrid`,
  `distanceToPath` (moved out of `map.test.ts` and `input.ts`),
  `nearestPathPoint` (distance and along-path position of the nearest path
  point), `buildableCells(map)` (memoised per map) and `isBuildable(state,
  cell)`. 346 of the 450 cells are buildable on the v1 map.
- `Tower.cell` and `Shot.cell` replace `spotId`; towers stay sorted by
  cellKey, which is the firing order. `buildTower`, `upgradeTower` and
  `sellTower` take a cell. Refusals: `game-over`, `not-buildable`,
  `cell-occupied`, `not-enough-gold`, `no-tower`, `already-upgraded`.
  `MAP.buildSpots` is gone.
- Unit tests that used spots now use cells. Where the geometry mattered,
  the tests use cell (7,5), whose centre is exactly v1 spot 2, cell (2,5)
  (legacy spot 0, 64 px above the first segment) and cell (2,4), exactly
  125 px from the spawn, for the upgraded Musketeer range. New
  `grid.test.ts` checks the buildable rule at the path edge (32 px refused,
  48 px allowed, exactly 36 px allowed on a test map).
- Archetypes: `lazyBuild` and `greedyMusket` fill `KID_CELL_ORDER`;
  `soundBuild` uses the v1 plan on the legacy cells (it wins);
  `soundBuildNoTar` drops the Tar Pit cell's actions.
- Renderer: `src/game/legacySpots.ts` lists the ten cells. Spot circles,
  menus, panels, labels, aim and range circles use cell centres. Labels are
  now created per cell on first use (a scripted build can place towers on
  any cell). Test hooks `build`, `upgrade` and `sell` keep their spot-id
  signatures; `buildAt(col, row, type)` is new, with one e2e test.

Legacy spot cells: each v1 spot goes to the nearest buildable cell centre;
ties (spots 0, 1 and 5 sit on cell corners or edges) go to the cell whose
path distance is closest to the spot's own, then to the lower cellKey.
`legacySpots.test.ts` recomputes the list from that rule.

| Spot | v1 position | Cell (col,row) | Cell centre | Moved |
|---|---|---|---|---|
| 0 | (96,160) | (2,5) | (80,176) | 22.6 px |
| 1 | (96,320) | (2,9) | (80,304) | 22.6 px |
| 2 | (240,176) | (7,5) | (240,176) | 0 |
| 3 | (240,240) | (7,7) | (240,240) | 0 |
| 4 | (340,176) | (10,5) | (336,176) | 4 px |
| 5 | (500,160) | (15,4) | (496,144) | 16.5 px |
| 6 | (500,304) | (15,9) | (496,304) | 4 px |
| 7 | (600,304) | (18,9) | (592,304) | 8 px |
| 8 | (760,112) | (23,3) | (752,112) | 8 px |
| 9 | (760,272) | (23,8) | (752,272) | 8 px |

`npm run sim` after this milestone (v1 wave targets suspended until
milestone 12, DECISIONS.md "v2 approved"):

| Archetype | v1 result | Milestone 8 |
|---|---|---|
| noTowers | lost wave 2 | lost wave 2, 0 lives |
| lazyBuild | lost wave 8 | lost wave 3, 0 lives |
| greedyMusket | won, 2 lives, 340 gold | lost wave 3, 0 lives |
| soundBuild | won, 11 lives, 253 gold | won, 13 lives, 269 gold (157 after wave 9) |
| soundBuildNoTar | lost wave 7 | lost wave 7, 0 lives |

Pins that changed (old -> new), each recomputed with a headless run:

- Sound build end state (`visual.spec.ts`, `end-screens*.spec.ts`,
  `endText.test.ts`): 11 lives, 253 gold -> 13 lives, 269 gold.
- Lazy build e2e loss: wave 8 -> wave 3.
- Mid-wave frame (`visual.spec.ts`): tick 855 -> 848. Spot 6's Cannon
  moved 4 px, so its first shot came at tick 845 instead of 852; 848 keeps
  the frame's intent (that shot 3 ticks old, mid-fade). Counts unchanged:
  5 enemies, 4 hurt.
- Enemies frame (`visual.spec.ts`, `enemies-frame.test.ts`): tick 1200 ->
  1350; counts {8 Goblins, 5 Wolves, 4 Trolls, 2 hurt Trolls, 2 slowed} ->
  {10, 3, 4, 3, 4}.
- Unchanged because spot 2 is exactly its v1 position: one Musketeer at
  spot 2 in wave 1 still ends with 14 lives and 83 gold.
- `balance.test.ts` and `balance-verifier.test.ts`: the v1 target ranges
  and exact pins are deleted (cannon-only, tarpit-only and waves 7 and 8
  probes included); they now assert completion, determinism, noTowers lost
  by wave 3, soundBuild won, and soundBuildNoTar no better. The Troll
  probe (d) stays, on cell (7,5).
- Unit input geometry (`input.test.ts`): spot rects and menu positions
  moved with the spot centres (for example spot 5's menu (528,105) ->
  (524,89)); every menu kept the same side.
- Screenshot baselines will change; none are committed here.

Counts: 139 unit tests in 18 files (was 123 in 16), 40 e2e tests in 8 files
(was 39).

### What went wrong

- The brief's kid order, taken literally (along-path position of the
  nearest path point first, then distance to the path), fills whole map
  columns: every cell in column 0 has its nearest path point 16 px from the
  spawn, so the fifth Musketeer would go 128 px from the path, out of
  range. The implementer kept the brief's sort but limited it to the first
  ring of buildable cells beside the path (less than 36 + 32 = 68 px from
  the centreline, `KID_BAND`), which is what "hugging the path" describes.
  The coordinator should confirm or replace this.
- Even hugging the path, the kid order starts at the map edge, where half
  of each tower's range is off the map. Lazy and greedy now lose on wave 3
  (v1: wave 8, and a 2-life win). Not a target in this milestone; it is
  input for the milestone 12 balance pass.
- The mid-wave frame at tick 855 would have shown no Cannon effect at all:
  the shot moved to tick 845, and a Cannon effect lives 10 ticks. The count
  check (5 enemies, 4 hurt) still passed at 855, so only the shot timing
  revealed it.
- At tick 1200 the enemies frame's closest pair fell to 10 px, below the
  14 px the frame was picked for, so the tick moved to 1350 (closest pair
  21 px).

### Verifier notes

Verifier: Claude Sonnet. Independent of the implementer; clean run at
`43f2ef3` plus the new verifier tests.

- Clean run (`rm -rf dist && npm ci && lint && typecheck && test && build &&
  test:e2e && sim`): every step exits 0. Before the verifier tests: 139 unit
  tests in 18 files, 40 e2e tests. `npm run sim`: noTowers lost wave 2,
  lazyBuild lost wave 3, greedyMusket lost wave 3, soundBuild won on wave 10
  with 13 lives and 269 gold (157 after wave 9), soundBuildNoTar lost wave 7.
  All match the implementer notes.
- `scripts/record-demo.ts` typechecks (`scripts` is in tsconfig). It builds at
  spots 2, 3 and 4 through `spot:<id>` rects, which are cells (7,5), (7,7)
  and (10,5): real, buildable, and distinct. `npm run demo` was not run.
- `src/sim/grid-verifier.test.ts` recomputes the buildable mask with separate
  distance code: equal to `buildableCells(MAP)` for all 450 cells, 346
  buildable (the DEVLOG count is right). The 36 px edge is inclusive: a
  synthetic path 36 px from a cell centre is buildable, 35.9 is not. No real
  cell sits at exactly 36 px, so the edge is tested on synthetic maps. No
  buildable cell's 26 px body (corners and edge midpoints) comes within 20 px
  of the path. `buildTower` returns `not-buildable` for a path cell, cells
  outside the grid, and a non-integer or NaN cell, and `cell-occupied` for a
  second build on one cell. Towers fire in cellKey order: with the higher key
  built first, the lower-key tower kills the enemy and the other records no
  shot.
- `src/game/legacy-verifier.test.ts` recomputes the ten spot-to-cell mapping
  with its own distance code (1e-9 tolerance for ties): no mismatch with
  `LEGACY_SPOT_CELLS`.
- Lazy archetype: an independent recomputation of `KID_CELL_ORDER` (96 cells)
  matches. First six: (0,5), (0,9), (1,5), (1,9), (2,5), (2,9). `lazyBuild`
  buys only three Musketeers in the whole game, (0,5), (0,9) and (1,5), so
  its towers sit at x = 16 and 48, at the map's left edge. Column 0 loses
  about half its range circle off the map. Note for milestone 12, not a
  defect.
- Boundary: `src/sim` imports nothing from `src/game`, Phaser or the DOM. A
  temporary `import Phaser` in `src/sim` fails lint with the restricted
  import error (reverted). A first draft of one verifier test also imported
  `src/game` from `src/sim` and lint rejected it, so that test lives in
  `src/game`. The `src/game` diff adds no build-anywhere or bar UI;
  `uiRects()` still lists `spot:<id>`; `buildAt(col, row, type)` is in the
  test hook with one e2e test.
- Pins: `src/sim/midwave-frame.test.ts` is new. With the Musketeer at (7,5),
  Cannon at (15,9) and Tar Pit at (18,9), the Cannon's first shot is at tick
  845, and tick 848 has 5 enemies, 4 hurt. `enemies-frame.test.ts` already
  pins tick 1350 with {10 Goblins, 3 Wolves, 4 Trolls, 3 hurt, 4 slowed}
  and passes. I did not re-derive the old 855 and 1200 values.
- Docs: README layout lists files that exist. `docs/DESIGN.md` no longer
  lists spots and states the grid rule, 346 of 450, and firing order. The
  DEVLOG claims I checked are accurate.
- Not checked: screenshot baselines (none are committed in this branch, so
  the local e2e pass says nothing about pixels), and the 21 px closest-pair
  figure for tick 1350.


## 2026-11-21: milestone 9, placement UI

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) replaced the ten legacy spots and their popup
build menu with build-anywhere through a HUD build bar.

- Canvas 960 x 580 (`src/main.ts`, Playwright viewport, demo recorder). The
  map is unchanged at 960 x 480. The HUD is 100 px in two 50 px rows:
  - Row 1 (y 480..530, text centred at y 505): Gold at x 14, Lives at 126,
    Wave at 238, Next at 366; Start Wave x 726..864 and 1x/2x x 876..946,
    both y 487..523.
  - Row 2 (y 530..580): the build bar, three 150 x 36 buttons at y 537..573,
    x 14, 174 and 334 (10 px gaps; six fit in 960 px for milestone 11),
    16 px bold labels "Musketeer  50", "Cannon  80", "Tar Pit  60", cost
    right-aligned.
- `src/game/ui/buildBar.ts`: the bar. A button is greyed and ignores clicks
  when the gold is below its cost or the game is over; the greying follows
  the gold on every redraw. `Button.setPicked` (brighter fill, 3 px
  pale-yellow edge) marks the active pick.
- `GameScene`: one pick at a time; a second click on its button or Escape
  clears it, and it clears by itself when gold drops below its cost. With a
  pick, the hovered cell gets a 0.25-alpha fill and a 2 px outline, green if
  buildable and red if not; a buildable cell also shows the tower at 0.6
  alpha and its range circle. A red cell shows no ghost and no range.
  Clicking a buildable cell builds and keeps the pick; a path cell does
  nothing; a tower clears the pick and selects it. Without a pick, a tower
  click selects it (range circle, selection ring, Upgrade/Sell panel) and an
  empty-map click or Escape deselects. HUD clicks keep the pick and close the
  panel. The cursor is a pointer over towers and, with a pick, over
  buildable cells.
- `src/game/input.ts`: `cellAt`, `cellRect`, `classifyClick` (ui, tower,
  buildable, blocked, outside) and `placeBeside`, which no longer avoids
  other towers: right, left, below, above, least path cover wins, skipping a
  side the clamp pushed over the tower's own cell or label. A unit test
  checks every one of the 344 buildable cells: the panel stays in the map,
  off the HUD, and off its own tower and label.
- No grid lines and no spot circles. `legacySpots.ts`, its two tests and
  `ui/buildMenu.ts` are deleted.
- Draw order keeps the HUD over anything on the map: range circles and the
  ghost are drawn before the HUD, which covers the part of a range below
  y 480, and tower labels now live in a layer made at scene start, so a
  label created later no longer draws over the HUD, panel or end screen.
- Test API: `buildAt`, `upgradeAt`, `sellAt` by (col, row) replace the
  spot-id `build`, `upgrade`, `sell`. `ui()` is `{ pick, hoverCell,
  selectedCell, panelOpen }`. `uiRects()` lists `startWave`, `speed`,
  `bar:<type>`, the panel buttons and `playAgain`; it is also on
  `window.__tarpit` outside test mode (read-only), and `live.spec.ts` and the
  demo recorder use it instead of hard-coded positions.
- e2e: `build-ui.spec.ts` and the milestone 4 verifier spec are merged into
  one bar spec that keeps the verifier's probes (a) to (f). The other specs
  use `buildAt` on the former legacy cells (7,5), (15,9), (18,9), (10,5),
  (23,8); the mid-wave (848 ticks, 5 enemies, 4 hurt) and enemies (1350
  ticks) counts hold unchanged. Visual frames: `build-menu.png` is replaced
  by `placing.png` (Cannon picked, pointer on cell (14,8) beside the long
  vertical run) and `placing-invalid.png` (same pick on path cell (13,8)).
  Every baseline changes with the taller canvas; CI regenerates them.
- `npm run demo` runs the bar flow (pick, glide, click the cell) and
  produced a good GIF and still; the media is not committed (milestone 13).

- Landmarks (coordinator's decision, after the cottage finding below):
  `MapDef.landmarks` lists drawn features off the path; `MAP` has one, the
  exit cottage's box `COTTAGE` (x 908..944, y 131..168, chimney and roof
  included), and `draw/map.ts` draws the cottage from it. A cell whose 32 px
  square overlaps a landmark is not buildable. This removes (28,4) and
  (29,4): 344 of 450 cells are buildable (346 before). The pins in
  `grid.test.ts` and `grid-verifier.test.ts` move to 344. The implementer
  updated the verifier's own mask rule in `grid-verifier.test.ts` to match
  (its own overlap code, not grid.ts). `npm run sim` is unchanged: no
  archetype uses those two cells. The e2e edge check moved from (29,4) to
  (29,7) and asserts that a build at (29,4) is refused.

Counts: 145 unit tests in 19 files, 40 e2e tests in 7 files.

### What went wrong

- The first tower-selected frame had the panel below the Musketeer at
  (7,5) covering its own "Musket+" label: the v1 offset (28 px) was chosen
  when the spot rule usually pushed panels elsewhere. Panels above or below
  now sit 40 px from the centre, left or right 30 px, and a clamped side
  that lands on the tower or its label is skipped.
- Build-anywhere exposed two label problems milestone 8 created but no
  frame showed: a bottom-row tower's label ran into the HUD, and labels
  created after the HUD drew on top of it (and of the panel and the end
  veil). Bottom-row labels now go above the tower, edge labels shift inside
  the map, and labels live in their own layer.
- The brief asked that clicking (7,5) again with the pick active do
  "nothing (occupied)" and also that clicking a tower with a pick active
  select it. The test asserts both: no second build, and the tower is
  selected with the pick cleared.
- Cell (29,4) was buildable and overlapped the exit cottage drawing,
  because the milestone 8 rule only measures distance to the path. The
  coordinator's first fix, excluding cells within 40 px of the path's end
  waypoints, removed no cell at all (every buildable cell is over 50 px from
  both; (29,4) is 50.6 px from (960,192), and (28,4), also under the roof,
  is 67.9 px). The coordinator chose a landmark rule instead (below).

### Verifier notes (Claude Sonnet)

- Clean run on `m9-placement-ui` at 80a0d4e: `npm ci`, lint, typecheck, build
  exit 0; 145 unit tests in 19 files; 40 e2e tests passed before this spec was
  added; `--repeat-each=5` of `build-ui.spec.ts` and `live.spec.ts`: 60 of 60.
  `npm run sim` is unchanged from milestone 8 (noTowers wave 2, lazy wave 3,
  greedy wave 3, sound won with 13 lives and 269 gold, noTar lost on wave 7).
- `git diff origin/main -- src/sim` holds the `Rect` type, `COTTAGE`, the
  landmark overlap exclusion in `grid.ts`, and tests. Recomputed with separate
  code (own path copy, own overlap test): 346 cells by the path rule, 344 with
  the cottage; the two removed cells are exactly (28,4) and (29,4).
- `e2e/placement-verifier.spec.ts` (7 tests, 3 repeats passed): three
  placements with the pick kept, the fourth clears it at 0 gold and greys the
  button; a pick clears at 49 gold; Start Wave with a pick keeps the pick and a
  placement works mid-wave; Cannon pickable at 80 and not at 79; Escape clears
  panel and selection; a path cell with a pick builds nothing, and `hoverCell`
  is that cell; bottom-row hover leaves `uiRects()` unchanged, and the panel for
  a tower at (29,14) lies inside x 0..960, y 0..480. Towers are listed in
  row-major order, not click order (my first draft assumed click order).
- The implementer's frames in the scratchpad were taken at 04:21, before the
  landmark commit at 04:26: they show a Tar Pit on (29,4) over the cottage.
  That cell is now refused. A fresh frame of towers at (28,3) and (29,3) shows
  their labels ("Musket", "Tar") overlapping each other and the cottage roof
  and chimney. Adjacent towers always overlap labels (56 px labels on 32 px
  cells); this is cosmetic and was not fixed here.
- DEVLOG numbers checked: HUD button rectangles, 344, the 50.6 and 67.9 px
  figures, 145 unit tests, 40 e2e tests in 7 files, and the panel test that
  loops over every buildable cell (it does not assert the count 344 itself).

## 2026-11-21: milestone 10, new towers in the simulation

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) added the Longbow, Mortar and Fire Pot to
`src/sim` with the numbers from `docs/SCOPE-v2.md`, now tabled in
`docs/DESIGN.md`.

- `TowerType` gains `longbow`, `mortar`, `firepot`. `TowerLevelStats` gains
  `minRange`, `burnDps` and `burnDuration` (0 for the v1 towers). Cooldowns
  are round(60 / fireRate): Longbow 24, Mortar 180 (fire rate 1/3), Fire
  Pot 75.
- Mortar: `findTarget` skips enemies closer than `minRange` (70), so the
  target is the furthest-along enemy at a distance in [70, 220]. The splash
  (60, upgraded 70) hits every enemy near the target, including ones inside
  the minimum range.
- Fire Pot: 4 impact damage; if the target lives, `applyBurn` sets 5/s for
  180 ticks (upgraded 8/s for 240). Equal or stronger replaces, weaker is
  ignored. A new status step, `burnEnemies`, runs after exit removal and
  before combat: dps / 60 per tick, doubled while `slowTicksLeft > 0`, and
  burn deaths pay their bounty. Tick order is now move, exit, burn, combat,
  spawn, counters, clear check (header of `src/sim/game.ts`).
- `Enemy.burnDps` and `Enemy.burnTicksLeft` are optional (absent means 0)
  and every spawned enemy gets 0. Required fields would have broken the
  existing tests, which build enemy literals without them, and the brief
  said those tests stay unchanged.
- Enemies now die at hp <= 1e-9 (`KILL_EPSILON` in `combat.ts`), not
  hp <= 0. See "What went wrong".
- Renderer: Longbow, Mortar and Fire Pot draw as a plain grey circle and
  shoot a thin grey tracer, commented as milestone 11 placeholders; labels
  read "Longbow", "Mortar", "Fire". The build bar keeps the three v1 towers.
  A new e2e spec builds all three through the test hooks, plays 1200 ticks
  and asserts each fires, nothing throws, and the bar is unchanged.
- Headless: `longbowSpam` (base Longbows on the kid cell order, no
  upgrades), `comboBuild` and `comboBuildNoFire` join `ARCHETYPES`, so
  `npm run sim` prints them and `balance.test.ts` runs them twice for
  determinism.

The combo build's plan (`COMBO_PLAN`, each action bought as soon as gold
allows):

1. Before wave 1: Longbow (6,5) and Longbow (2,5), by the first corner.
2. Wave 2: Tar Pit (14,6). Wave 3: Fire Pot (14,8). The two sit right of
   the long downhill run (x = 420); their base ranges overlap on y 182..287
   of it, so tarred enemies burn at double rate.
3. Wave 5: Mortar (17,6) in the middle of the map, for the Trolls; upgrade
   the Tar Pit. Wave 6: upgrade the Fire Pot, Longbow (11,4).
4. Wave 7: upgrade the Mortar and both first Longbows. Wave 8: Mortar
   (17,9), upgraded. Wave 9: Longbow (19,7), upgrade (11,4) and (19,7).

It took two `npm run sim` runs. The first plan stopped after the Mortar and
lost on wave 10 with 740 gold unspent; adding upgrades, a second Mortar and
two more Longbows won with 20 lives. Over the game the Longbows fire 1199
shots, Tar Pit 207, Mortars 76 and the Fire Pot 66; enemies spend 3616
enemy-ticks burning while tarred.

`npm run sim` (no balance targets until milestone 12):

| Build | Result |
|---|---|
| noTowers | lost on wave 2, 0 lives, 125 gold |
| lazyBuild | lost on wave 3, 0 lives, 50 gold |
| greedyMusket | lost on wave 3, 0 lives, 61 gold |
| soundBuild | won, 13 lives, 269 gold |
| soundBuildNoTar | lost on wave 7, 0 lives, 136 gold |
| longbowSpam | won, 20 lives, 211 gold |
| comboBuild | won, 20 lives, 441 gold |
| comboBuildNoFire | won, 14 lives, 519 gold |

The v1 archetypes are unchanged from milestone 9.

Counts: 187 unit tests in 21 files, 48 e2e tests in 9 files.

### What went wrong

- The first Fire Pot kill test died one tick late. A goblin with 18 hp left
  after three impacts should die on the 216th burn tick (216 x 5/60 = 18),
  but 5/60 is not exact in floating point and the hp after 216 ticks was a
  tiny positive number, so the kill came on tick 217. Enemies now count as
  dead at hp <= 1e-9. Integer hp (every v1 rule) never falls in that gap,
  and every existing pin held.
- The first placeholder e2e put the Fire Pot behind an upgraded Longbow,
  which killed every Goblin before the Fire Pot could fire. The Fire Pot
  moved to the spawn.
- Not wrong, but for milestone 12: base Longbows are very strong.
  `longbowSpam` wins with all 20 lives, against a v2 target of losing on
  wave 7 to 9, and the combo build wins with 20 lives and 441 gold against
  a target of 5 to 15 lives.

### Verifier notes

The verifier (Claude Sonnet) re-checked milestone 10 from a clean tree
(`rm -rf dist && npm ci`, then lint, typecheck, unit, build, e2e and
`npm run sim`, all exit 0: 187 unit tests in 21 files before the verifier
file, 48 e2e tests).

- Every number for the three new towers (cost, range, minimum range,
  damage, splash, fire rate, cooldown ticks 24, 180 and 75, burn 5/s for 180
  ticks and 8/s for 240, upgrade costs, upgraded values, sell refunds 49,
  133 and 84) matches `docs/SCOPE-v2.md`, `docs/DESIGN.md` and `towers.ts`.
  The v1 towers' values are identical to `origin/main` (compared field by
  field with a scratch test). The diff of `towers.ts` is not additions only:
  the v1 entries were rewritten to spread a `PLAIN` defaults object, with the
  same values.
- No existing test file changed; only two new test files were added. The v1
  archetypes are identical to milestone 9 in `npm run sim`.
- `KILL_EPSILON` argument: without burn, every hp is an integer (enemy hp
  30, 28, 500; every damage figure is an integer) and doubles hold
  integers exactly. An integer is either <= 0 or >= 1, so `hp <= 1e-9` and
  `hp <= 0` give the same answer for all of them. Only a burn creates a
  fractional hp, and there the epsilon is the intended change.
- `src/sim/newTowers-verifier.test.ts` adds independent probes through the
  public `tick()`: Mortar at exactly 70 and 69 px; splash on enemies inside
  the minimum range; a lone Fire Pot kills a 30 hp Goblin on tick 217 (216
  after the first hit) and 133 under permanent tar (132 after); burn
  replacement both ways; an impact kill sets no burn and pays once; a burn
  death in the status step pays once and no tower shoots it. The hand
  arithmetic is in the file's comments. The brief's "30 px from the tower"
  cannot occur on the path (buildable cells are at least 36 px from it), so
  the splash probe uses enemies 48 to 68 px away.
- The DEVLOG's combo build shot counts (Longbow 1199, Tar Pit 207, Mortar
  76, Fire Pot 66) and 3616 tarred burning enemy-ticks reproduce. The DEVLOG
  has the three new builds as a one-line table, not per-wave tables; the
  lines match `npm run sim`.
- Caveats for milestone 12: `comboBuildNoFire` replays the combo script
  minus Fire Pot actions, so the gold it does not spend stays unspent (519
  at the end); it is a fair "without the Fire Pot" comparison but not a
  re-planned build. `DECISIONS.md` has no milestone 10 section yet (the
  epsilon, the optional burn fields and the placeholder visuals are only in
  this log).

## 2026-11-21: milestone 11, new towers in the UI

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) put the Longbow, Mortar and Fire Pot on the
build bar with their own shapes, shots and labels. No simulation change.

- Build bar: six buttons in row 2, Musketeer 50, Cannon 80, Tar Pit 60,
  Longbow 40, Mortar 110, Fire Pot 70. Each is 148 x 36 at y 537..573,
  8 px apart from x 16: x 16, 172, 328, 484, 640, 796, ending at 944
  (6 * 148 + 5 * 8 = 928, 16 px margin each side). The label font stays
  16 px bold; the widest pair, "Musketeer" and "50", uses about 106 of the
  128 px inside the 10 px padding. `uiRects()` gains `bar:longbow`,
  `bar:mortar` and `bar:firepot`.
- Shapes (colours in `palette.ts`): Longbow a 10 x 26 green post with a
  3 px wood-coloured bow arc (radius 12, 100 degrees) and a pale string on
  the side facing its last target. Mortar a 26 x 14 grey tube with round
  ends and a dark mouth; it turns to point at its last target, as the
  Musketeer and Cannon barrels do, so the mouth is the end facing the
  target. Fire Pot an orange-red r = 13 circle with a yellow triangle flame
  whose tip rises 3 px above the rim. Upgraded: the same r = 19 gold ring.
  Labels "Longbow", "Mortar", "Fire", with "+" when upgraded. Ghosts are
  the same shapes at 0.6 alpha.
- The Mortar's ghost and its selected range show the 220 px range circle
  and a dashed muted-red 70 px minimum-range circle (24 dashes).
- Shots: Longbow a 1.5 px pale tracer for 4 ticks. Mortar a 6 px dark
  flash 14 px out of the tube mouth plus a splash circle at the target
  (the splash radius, 60 or 70 px, so larger than the Cannon's 40 or 55,
  in a darker orange), 12 ticks. Fire Pot a 2.5 px orange line to the
  target and an orange burst with a yellow core, 8 ticks.
- Burning enemy: an orange ring at body radius + 3 while
  `burnTicksLeft > 0`. Tarred and burning: the tar ring at + 3 and the
  orange ring outside it at + 6 (`statusRings` in `draw/enemies.ts`,
  unit-tested).
- Label crowding, replacing the overlap accepted in milestone 9
  (`layoutLabels` in `draw/labels.ts`): a tower gets a 10 px label instead
  of 12 px when another tower is horizontally adjacent (same row, columns
  1 apart) or their 12 px label boxes meet. Then, in cell-key order, a
  label whose box meets an already shown label is hidden; a hidden label
  hides nothing. So three towers in a row show the outer two labels, and a
  2x2 block shows the left-hand label of each row. Boxes are estimated
  from Courier New's 0.6 em advance (6 px per character at 10 px), so the
  rule is the same in Vitest and the browser. Unit tests: three adjacent
  cells in a row, a 2x2 block, a vertical pair (keeps 12 px) and towers two
  columns apart (keep 12 px).
- Playwright: `e2e/new-towers.spec.ts` replaces the placeholder spec. It
  checks the six-button geometry; picks, places, upgrades and sells each
  new tower through real clicks (gold pins: Longbow 40 + 30, refund 49;
  Mortar 110 + 80, refund 133; Fire Pot 70 + 50, refund 84); Mortar is not
  pickable at 109 gold and is at 110; and a Tar Pit (14,6) with a Fire Pot
  (14,8) leaves Goblin 0 slowed and burning first at wave 1 tick 687
  (slow 92, burn 180 ticks left), found by a capped step loop.
- `visual.spec.ts` adds `new-towers.png`: Longbow (6,5), Mortar (17,6),
  Fire Pot (14,8), Tar Pit (14,6), all upgraded, wave 5, Mortar selected.
  Tick 1754: the Mortar fired at tick 1752, and both Trolls are tarred and
  burning, 11 px apart. A headless scan of every tick found a Mortar
  effect together with a tarred, burning enemy only at ticks 1572..1583
  (the two Trolls exactly on top of each other) and 1752..1763; the
  Goblins die before they reach the Mortar's ring. Every baseline changes
  because the bar is in every frame; the coordinator regenerates them on
  CI.

Counts: 201 unit tests in 22 files, 54 e2e tests in 9 files.

### What went wrong

- The first Longbow bow was dark brown at 2.5 px; on the green grass it
  nearly vanished in the 2x crop. It is now a lighter wood colour at 3 px.
- The new-towers frame is thinner than hoped: with the specified cells the
  only ticks that show a Mortar effect and a burning tarred enemy are late
  in wave 5 with just the two Trolls left, and they overlap. The selected
  Mortar's panel (placed by the milestone 9 rule, which only keeps clear
  of its own tower's label) also covers part of the Fire Pot's "Fire+"
  label in that frame.
- The first commit of this milestone swept in the staged deletion of the
  placeholder spec; the three local commits were redone with explicit
  paths before anything was pushed.

### Verifier notes

The verifier (Claude Sonnet) checked milestone 11 on branch
`m11-new-towers-ui`. Verdict: pass.

- Clean run (`rm -rf dist && npm ci`, lint, typecheck, test, build,
  test:e2e): exit 0, 201 unit tests in 22 files, 54 e2e tests. With the
  verifier's additions: 202 unit tests and 61 e2e tests. `--repeat-each=5`
  over both new-towers specs: 65 of 65 passed.
- `git diff origin/main --stat -- src/sim` is empty. `docs/DESIGN.md`
  changes by one sentence (3 lines: the Longbow, Mortar and Fire Pot "join
  the build bar in milestone 11" now says they joined). No numbers changed.
  `npm run sim` output is identical to origin/main.
- Bar geometry confirmed from code and from `uiRects()`: x 16, 172, 328,
  484, 640, 796; 148 x 36; 8 px gaps; right edge 944; no overlap between
  buttons, nor with Start Wave or the speed button.
- Probes in `e2e/new-towers-verifier.spec.ts` (real clicks): one of each
  of the six towers placed through the bar leaves 590 gold; Mortar pick
  and hover report `pick` and `hoverCell` (the dashed circle is pixels
  only and is not asserted); Fire Pot is not pickable at 69, pickable at
  70; an upgraded Longbow sells for 49; at tick 686 no enemy is both
  slowed and burning and at 687 Goblin 0 is. Three adjacent Musketeers
  give labels 10 px, shown, hidden, shown, read from the scene's private
  label map (the test API has no label hook).
- Vertical stack (rows 4, 5, 6 in one column): not "horizontal
  neighbours" and the boxes are 32 px apart, so all three keep 12 px and
  all stay visible. A label starts 22 px below its tower's centre, so it
  covers the top of the tower below. Deterministic and now tested.
- Frames: bar labels and costs are legible at 1x; the Longbow (green
  post), Mortar (grey tube) and Fire Pot (orange circle) are distinct from
  each other and from Cannon. In the new-towers frame the Mortar's panel
  covers part of the "Fire+" label, as the implementer said. In a
  Musketeer, Musketeer, Musketeer, Longbow row the Longbow's label is
  hidden by the rule (the higher cell key), which leaves a tower unlabelled.
- Not checked: pixel baselines. `new-towers.png` is not in the repo; CI
  generates baselines, and local runs skip pixel comparison.

## 2026-11-21: milestone 12, balance pass v2

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) retuned the numbers so the v2 targets in
`docs/SCOPE-v2.md` hold with six towers on the grid. Only numbers, the kid
placement rule in `src/sim/headless.ts` and the combo plan changed. Start
gold, lives, waves, tower and enemy count, upgrades, sell, path, grid, tick
rate, targeting, tick order and burn rules are unchanged. The only game
code change is `comboBuild` added to the e2e `runScript` names
(`src/game/testMode.ts`, and its type in `src/game/testGlobal.d.ts`).

**Placement rule for the kid archetypes (replaces the milestone 8 kid
band).** Lazy, greedy and longbowSpam take cells from `TRAIL_CELL_ORDER`:
walk the path from the spawn in steps of 96 px (`TRAIL_STEP`), starting at
path distance 96. At each step point take the nearest buildable cell whose
centre is within 72 px (`TRAIL_REACH`) of the point and not yet in the
list (ties go to the lower cell key); skip the point if there is none. The
path is 1584 px, so there are 16 step points and every one finds a cell:
(2,5) (6,6) (3,3) (7,1) (10,1) (14,3) (14,6) (14,9) (13,13) (16,10)
(19,10) (22,10) (22,7) (22,4) (25,4) (28,7). Only the first cell has its
centre left of x 96, so the left-edge problem is gone.
`balance.test.ts` pins the first six cells and the rule;
`grid-verifier.test.ts` recomputes the whole list with its own path walk.
Side effect: a kid build holds at most 16 towers, so late gold piles up
unspent (longbowSpam has 322 gold when it loses).

Targets and results:

| # | Archetype | Target | Before (milestone 11) | Before (new placement, old numbers) | After |
|---|---|---|---|---|---|
| 1 | noTowers | lost by wave 3 | lost wave 2 | lost wave 2 | lost wave 2 |
| 2 | lazyBuild | lost on wave 6 to 8 | lost wave 3 | lost wave 9 | lost wave 7 |
| 3 | longbowSpam | lost on wave 7 to 9 | won, 20 lives, 211 gold | won, 20 lives, 691 gold | lost wave 9 |
| 4 | comboBuild | won, 5 to 15 lives, under 150 gold after wave 9 | won, 20 lives, 441 gold (244 after wave 9) | won, 20 lives, 441 gold (244 after wave 9) | won, 11 lives, 177 gold (136 after wave 9) |
| 5 | comboBuildNoFire | strictly worse than combo | won, 14 lives | won, 14 lives | won, 2 lives |
| - | greedyMusket | none | lost wave 3 | won, 1 life | lost wave 7 |
| - | soundBuild (v1 towers) | none | won, 13 lives, 269 gold | won, 13 lives, 269 gold | lost wave 9 |
| - | soundBuildNoTar | none | lost wave 7 | lost wave 7 | lost wave 7 |

All five targets are met. The "Before (milestone 11)" combo column is the
old plan on the old numbers; "After" is the new plan on the new numbers.

Every number changed, with the reason. "Reverting it" puts back that one
number with every other final value in place:

| Number | Before | After | Why |
|---|---|---|---|
| Longbow base damage | 6 | 4 | 15 dps for 40 gold with a 150 px range outclassed every other tower; 16 base Longbows held all ten waves without losing a life. At 4 the base Longbow is cheap chip damage and its upgrade (9) is the big step. Reverting it: longbowSpam wins with 6 lives. |
| Troll hp | 500 | 700 | Trolls are what leak through a wall of base towers, and each leak costs a life whatever the hp; splash, burn and upgrades handle them better than more base towers. Reverting it: longbowSpam wins with 4 lives. |
| Troll bounty | 11 | 8 | Wave 9 alone paid 12 x 5 + 6 x 11 + 25 = 151 gold, so the combo could not be under 150 after wave 9 whatever it spent. At 8 wave 9 pays 133. Reverting it: combo has 190 gold after wave 9. |
| Wave 7 Trolls | 7 | 10 | The first Troll wall a kid's board cannot hold. Reverting it: longbowSpam survives to wave 10. |
| Wave 8 Trolls | 4 | 8 | Keeps the pressure on after wave 7. Reverting it: longbowSpam survives to wave 10 and combo has 180 gold after wave 9. |
| Wave 9 Trolls | 4 | 6 | Finishes longbowSpam on wave 9. Reverting it: longbowSpam survives to wave 10. |

Unchanged: every tower cost, range, minimum range, fire rate, splash, slow,
burn, upgrade cost and upgraded value; every other base stat; Goblin and
Wolf stats; Troll speed; waves 1 to 6 and 10; the Wolf and Goblin groups
of waves 7 to 9; all intervals and delays; the 25 gold clear bonus.

Per wave, lives / gold after each wave (`npm run sim`):

| Wave | noTowers | lazyBuild | greedyMusket | soundBuild | soundBuildNoTar | longbowSpam | comboBuild | comboBuildNoFire |
|---|---|---|---|---|---|---|---|---|
| 1 | 12 / 125 | 19 / 53 | 17 / 60 | 20 / 57 | 20 / 57 | 20 / 77 | 20 / 77 | 20 / 77 |
| 2 | lost, 0 / 125 | 19 / 76 | 17 / 83 | 20 / 95 | 20 / 95 | 20 / 110 | 20 / 90 | 20 / 90 |
| 3 | | 16 / 98 | 14 / 120 | 20 / 87 | 17 / 133 | 20 / 117 | 20 / 107 | 16 / 159 |
| 4 | | 16 / 123 | 14 / 110 | 20 / 82 | 16 / 123 | 20 / 112 | 19 / 177 | 11 / 209 |
| 5 | | 14 / 96 | 12 / 98 | 18 / 105 | 14 / 196 | 18 / 105 | 18 / 98 | 10 / 130 |
| 6 | | 9 / 188 | 7 / 158 | 18 / 212 | 6 / 265 | 18 / 192 | 18 / 175 | 10 / 257 |
| 7 | | lost, 0 / 96 | lost, 0 / 81 | 9 / 105 | lost, 0 / 125 | 10 / 123 | 13 / 150 | 5 / 232 |
| 8 | | | | 1 / 175 | | 3 / 246 | 11 / 203 | 2 / 277 |
| 9 | | | | lost, 0 / 81 | | lost, 0 / 322 | 11 / 136 | 2 / 210 |
| 10 | | | | | | | won, 11 / 177 | won, 2 / 321 |

**Combo plan** (`COMBO_PLAN`, re-planned on the final numbers, each action
bought as soon as gold allows; all 19 are bought by wave 10): Longbows at
(9,5) and (9,4) inside the first U, where a 150 px range reaches the climb,
the top run and the downhill run; a Tar Pit (14,10) and a Fire Pot (14,9)
inside the bottom-left corner of the second U, both reaching the end of the
downhill run and the start of the bottom run; a Mortar (17,6) in the middle
of the second U; upgrades to the Tar Pit, Fire Pot, Mortar and both
Longbows; a second Mortar (9,7) in the first U; Longbows (17,9) and (17,10)
at the bottom of the second U, upgraded; then a second Tar Pit and Fire Pot
pair at (11,4) and (10,4) on the top run and the Tar Pit upgrade. Cells
were picked from a scan of path coverage per cell (path length within each
tower's range). Purchases per wave: 2, 1, 1, 0, 2, 2, 3, 2, 4, 2.
`comboBuildNoFire` drops both Fire Pots and their upgrades.

Margins: lazyBuild loses mid-range (wave 7); longbowSpam at the edge of
its range (wave 9, with 3 lives entering it); combo mid-range at 11 lives, 14 gold under the wave 9 limit; noFire 9
lives worse.

Method and iterations: a scratch harness (outside the repo) patched the
stat tables in memory and replayed every archetype. About 15 hand-picked
configurations first (Longbow cost and damage, bounty cuts, Troll hp, wave
7 to 9 Troll counts, denser Goblin and Wolf swarms), then scripted sweeps
of about 550 configurations in all: Longbow cost, range and damage alone
(36), Troll hp, Longbow numbers and wave 7 to 9 Troll counts (about 280), Troll hp, bounty and wave
counts around the chosen point with a fixed combo plan (216), then the
revert pass above. No change was reverted: each of the six alone breaks a
target.

Tests: `balance.test.ts` pins the five targets as ranges, pins combo
exactly (11 lives, 177 gold, 136 gold after wave 9), checks noFire is
strictly worse, determinism of every archetype, the trail rule and its
first six cells, and that lazy and greedy follow it. Other pins that moved,
each recomputed headlessly:

- Longbow unit test: 4 damage kills a static Goblin on the 8th hit at step
  168 (was 6 damage, 5th hit, step 96).
- `enemies-frame.test.ts` and the e2e `enemies.png` frame, tick 1350 of
  wave 8: 7 Trolls (was 4); 10 Goblins, 3 Wolves, 3 hurt Trolls and 4
  slowed are unchanged, as are 7 red-bar Goblins and the 21 px minimum gap.
  The e2e hurt-Troll filter now compares with 700.
- `new-towers.png` frame: tick 1754 and its counts are unchanged (2
  enemies, both slowed and burning, Mortar fired at 1752); Troll 3 is at
  201 of 700 hp instead of 1 of 500, and the scan now also finds a third
  window at 1932..1943 with one enemy slowed and burning. Comment updated.
- soundBuild no longer wins, so the win tests use comboBuild: e2e win
  screen, end-screens win and verifier HUD text, `endText.test.ts` and the
  headless "a scripted build wins" test: 11 lives, 177 gold (was 13 and
  269).
- e2e lazy build: loses on wave 7 (was 3).
- `balance-verifier.test.ts` probe (d) uses the Troll's hp from
  `ENEMY_STATS` instead of a literal 500.
- Unchanged: wave 1 pins (lives 14, gold 83 for one Musketeer at (7,5);
  no towers 12 / 125), mid-wave tick 848, the new-towers e2e tick 687.
  Test arenas in `combat.test.ts` and `newTowers*.test.ts` still build
  500 hp Trolls by hand; their mechanics do not depend on the Troll's max
  hp, so they were left as they are.

Visual baselines that will change on CI: `enemies.png` (more Trolls),
`new-towers.png` (Troll hp bars), `won.png` (combo build board and
numbers). No PNGs committed.

What went wrong:

- The new placement alone made lazy too strong (wave 9) and did nothing to
  Longbow spam, which already won with 20 lives.
- Raising the Longbow's cost (50, 60) or cutting its range (120, 135) on
  the old waves either left Longbow spam winning or, combined with damage
  3 or 4, made it lose on wave 3 to 6 because the early waves broke first.
  Damage 4 at the old cost and range, with heavier Troll waves, was the
  combination that kept the early game and broke the late one.
- Denser Goblin and Wolf swarms in waves 8 and 9 did nothing: 16 Longbows
  with 150 px of range shred them, and the extra bounty only made every
  build richer. Lives are lost by leaks, and Trolls are what leak, so the
  late waves got more Trolls instead.
- Wave 9's income alone was over the 150 gold target with Troll bounty 11,
  so the bounty had to drop; a 700 hp Troll now pays 8 (it paid 11 at 500
  hp).
- soundBuild (v1 towers only) now loses on wave 9. It has no v2 target,
  but it means a player who ignores the new towers will lose; Kyle's play
  notes decide whether that is right.

### Verifier notes

The verifier (Claude Sonnet) checked milestone 12 on branch `m12-balance-v2`
against origin/main (8ee0cc5).

- Clean run (`rm -rf dist && npm ci`, lint, typecheck, test, build, e2e,
  sim): exit 0; 22 test files and 205 tests passed before the verifier's
  additions, 61 e2e passed. With the verifier's two new files: 24 files, 211
  tests.
- Spec: every number in the DESIGN.md enemy, tower, upgrade, sell-refund and
  wave tables matches `enemies.ts`, `towers.ts` and `waves.ts`. The diff of
  those three files holds exactly the six documented changes and nothing
  else. `game.ts`, `combat.ts`, `grid.ts`, `map.ts` and `actions.ts` are
  untouched.
- Targets (from `npm run sim`): noTowers lost wave 2; lazyBuild lost wave 7;
  longbowSpam lost wave 9; comboBuild won, 11 lives, 177 gold, 136 after
  wave 9; comboBuildNoFire won with 2 lives. All five met.
- Revert matrix (one number put back in a scratch copy, run through the
  sim). Every row breaks a target and matches the implementer's table:

  | Revert | Breaks | Result |
  |---|---|---|
  | Longbow damage 6 | longbowSpam | won, 6 lives |
  | Troll hp 500 | longbowSpam, combo | spam won, 4 lives; combo 17 lives and 184 gold after wave 9 (over 150) |
  | Troll bounty 11 | combo gold | 190 gold after wave 9 |
  | Wave 7 Trolls 7 | longbowSpam | lost on wave 10, not 7 to 9 |
  | Wave 8 Trolls 4 | longbowSpam, combo gold | lost on wave 10; combo 180 after wave 9 |
  | Wave 9 Trolls 4 | longbowSpam | lost on wave 10 |

  The wave 7 to 9 rows say "survives to wave 10" in the implementer's table:
  it survives to wave 10 and loses there, which is still outside 7 to 9.
- Placement: `trail-verifier.test.ts` recomputes `TRAIL_CELL_ORDER` with its
  own path walk and buildable rule. Equal to the sim's list; 16 step points,
  16 cells; first six (2,5) (6,6) (3,3) (7,1) (10,1) (14,3); no cell in
  column 0 or 1.
- Combo geometry: the Tar Pit (14,10) and Fire Pot (14,9) both reach path
  distance 725.5 to 956 px (base Tar Pit range 90), or 708.75 to 956 with the
  upgraded Tar Pit: the end of the downhill run (564 to 852) and the first
  104 px of the bottom run (852 to 1112).
- Pins: `enemies-frame.test.ts` asserts 7 Trolls at tick 1350. The 1754 frame
  is pinned only in Playwright; `frame-verifier.test.ts` checks it from the
  sim (2 Trolls, both slowed and burning, one at 201 hp).
- Gaps: DECISIONS.md has no milestone 12 section, and its milestone 8 entry
  about the kid band is now superseded without a note. SCOPE-v2's new-tower
  table still says Longbow damage 6; it is labelled "default starting
  numbers; the balance pass retunes", so it is stale by design.

## 2026-11-21: milestone 13, ship v2, and retrospective

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) recorded the v2 demo, updated the README,
closed the milestone table in `docs/SCOPE-v2.md` and wrote this section. No
game code changed.

- `npm run demo` now plays v2 in real time, not test mode, through the real
  bar and cells: Longbows on (9,5) and (9,4) (the pick stays active for the
  second, then clears itself at 20 gold), Start Wave, 2x, wave 1; a Tar Pit
  on (14,10); wave 2; a Fire Pot on (14,9); wave 3; then wave 4 until 110
  gold and a Mortar on (17,6), whose ghost rests 1.2 s with its range and
  dashed minimum-range circle. These are the combo build's first five
  purchases. The GIF is 640 x 387, 12 fps, 25.0 s (52 s of play sped up
  2.08x), 2.6 MB. The still (960 x 580) is the first wave 3 frame where an
  enemy is tarred and burning and the Fire Pot has just fired at it.
- What went wrong: the brief asked for a Tar Pit and a Fire Pot between
  waves 1 and 2. Together they cost 130 and wave 1 leaves 77 gold, and the
  Mortar (110) is not affordable before wave 4 (107 gold after wave 3). A
  headless run of the plan predicted 77, 90 and 107 gold after waves 1 to
  3 and the first tarred, burning enemy at tick 3164; the real-time
  recording logged the same 77, 90 and 107. So the Tar Pit goes in after
  wave 1, the Fire Pot after wave 2, and the Mortar mid-wave 4.
- Frames checked with a contact sheet: the six-button bar, the Longbow
  ghost with its range on a green cell, the second Longbow placed with the
  pick kept, the Fire Pot's shot on an enemy with the tar ring and the
  orange ring, the Mortar ghost with both circles, and the built Mortar.
- README numbers were recomputed at PR 16's merge commit (957739c) with
  `git` and `gh`. Unit and browser test counts come from this branch,
  whose code is identical to that commit.
- The live site serves `assets/index-CCpIOwxF.js`, the same hash as a
  local build of this branch (Pages deployed from the PR 16 merge).

### Timeline

All in the same session as v1, on 2026-11-21 (UTC):

- 08:30 PR 10 merged (milestone 7): v1 shipped.
- 08:52 PR 11 merged: the v2 scope, approved by Kyle.
- PR 12 (milestone 8) at 09:11, PR 13 (milestone 9) at 09:32, PR 14
  (milestone 10) at 09:46, PR 15 (milestone 11) at 09:57, PR 16
  (milestone 12) at 10:16.

Kyle's involvement in v2, from the coordinator's record: play notes on v1
asking for build-anywhere and more weapons, and one approval of the v2
scope with all defaults. Nothing else. His play notes for milestone 12 and
the milestone 13 evidence (finishing a game with the new towers from the
public link) are still open.

### What went wrong in v2

- Milestone 8: the kid archetypes' "band" started at the map edge, where
  half of each tower's range is off the map, so lazy and greedy lost on
  wave 3. Milestone 12 replaced it with the trail rule. DEVLOG milestone 8
  (What went wrong, verifier notes); DECISIONS milestones 8 and 12.
- Milestone 9: cell (29,4) was buildable under the exit cottage, because
  the buildable rule only measured distance to the path. DEVLOG milestone
  9; DECISIONS milestone 9 (landmark rule).
- Milestone 9: the first fix, a 40 px radius around the path's end
  waypoints, removed no cell at all ((29,4) is 50.6 px away). DEVLOG and
  DECISIONS milestone 9.
- Milestone 9: a tower panel covered its own tower's label, a bottom-row
  label ran into the HUD, and labels drew over the HUD, panel and end
  veil. DEVLOG milestone 9; DECISIONS milestone 9.
- Milestone 10: before the balance pass, Longbow spam won with all 20
  lives (target: lose on wave 7 to 9) and the combo won with 20 lives and
  441 gold. DEVLOG milestone 10; DECISIONS milestone 10.
- Milestone 10: 216 burn ticks of 5/60 left a tiny positive hp, so a kill
  came a tick late; enemies now die at hp <= 1e-9. DEVLOG milestone 10
  (What went wrong, verifier argument); DECISIONS milestone 10.
- Milestone 11: the first commit swept in a staged deletion of the
  placeholder spec; the three local commits were redone with explicit
  paths before anything was pushed. DEVLOG milestone 11.
- Milestone 12: `docs/SCOPE-v2.md` still showed the starting tower numbers
  (Longbow damage 6) after the balance pass. DEVLOG milestone 12 verifier
  notes; DECISIONS milestone 12. This PR adds a note under the table.
- Milestone 12: `docs/DESIGN.md` was still titled "(v1)" while holding v2
  numbers. Fixed by the coordinator in commit 719585d; recorded only in
  that commit message.
- Milestone 13: the demo brief's purchase order did not fit the gold (see
  the implementer notes), the same kind of miss as v1's milestone 7 brief.

### What the process proved in v2

- Balance changes were proven necessary, not just sufficient: each of the
  six milestone 12 number changes was reverted alone and broke a target,
  first by the implementer and then again by the verifier in a scratch
  copy, with matching results (DEVLOG milestone 12).
- Verifiers recomputed rules with their own code instead of reading the
  implementer's: the 344-cell buildable mask, the trail cell order
  (`trail-verifier.test.ts`, its own path walk) and the combo geometry.
- Every v2 verifier added tests: `grid-verifier.test.ts` (8),
  `placement-verifier.spec.ts` (9), `newTowers-verifier.test.ts` (10),
  `new-towers-verifier.spec.ts` (11), `trail-verifier.test.ts` and
  `frame-verifier.test.ts` (12).
- CI was green on every v2 PR: PRs 11 to 16 all show the `ci` check as
  success.
- The sim-first split held: the new towers went into `src/sim` with unit
  tests a milestone before the UI, the balance pass changed six numbers and
  one placement rule with no game code, and the real-time demo ended each
  wave on exactly the gold the headless run predicted.

### What I'd change next time

- The trail rule caps a kid archetype at 16 towers, so late gold piles up
  unspent (Longbow spam has 322 gold when it loses). The archetypes model a
  player who stops building, which flatters the balance targets.
- Screenshot baselines need a CI round trip: every UI change waited for
  the baseline workflow and a bot commit (10 so far), and local runs skip
  the pixel check, so nobody sees a pixel diff before CI.
- The label crowding rule trades one problem for others: a tower next to a
  clash can lose its label, a label covers the top of the tower below, and
  a panel may cover a neighbour's label. A label rule that sees the whole
  board, or no labels on adjacent cells, is worth a look with the art pack.
- Check briefs against the sim before sending them, as v1's retrospective
  already said: the 40 px cottage radius and this milestone's demo order
  each cost a round trip.

### Verifier notes

Verifier: Claude Sonnet. Facts check of the README, `docs/SCOPE-v2.md`, this
section and the demo media on branch `m13-ship-v2`. No game code changed and
no fixes were needed.

- Clean run (`rm -rf dist && npm ci && npm run lint && npm run typecheck &&
  npm test && npm run build && npm run test:e2e`): exit 0. Vitest 211 tests
  in 24 files, Playwright 61 passed in 10 spec files.
- README "By the numbers", recomputed at 957739c (PR 16 merge, equal to
  `origin/main`): 118 commits, 16 merges, 102 non-merge; trailers Opus 54,
  Fable 5.1 21, Sonnet 18; 10 `github-actions` commits; 10 baseline files in
  `e2e/__screenshots__/visual.spec.ts`; 16 merged PRs (14 milestone PRs plus
  PRs 4 and 11); PR 10 merged 08:30:25Z, PR 16 merged 10:16:30Z; first commit
  06:11:42Z (01:11:42-05:00). All match.
- Links: every relative link and every repo-map path exists; the Pages URL,
  the CI workflow URL and the badge return 200. The live site serves
  `assets/index-CCpIOwxF.js`, the same hash as the local build.
- SCOPE-v2 Done column: PRs 12 to 16 for milestones 8 to 12, all dated
  2026-11-21, match `gh pr list`. Timeline merge times for PRs 10 to 16
  match `gh`. PRs 11 to 16 all show the `ci` check as SUCCESS.
- "What went wrong in v2" bullets all trace: milestone 8 band (DEVLOG
  1012 to 1016, DECISIONS 224 and 303); (29,4) cottage cell and the 50.6 px
  radius miss (DEVLOG 1144 to 1178, DECISIONS 244); label and panel clashes
  (DEVLOG 1165 to 1167); Longbow spam and combo wins (DEVLOG 1277 to 1298,
  DECISIONS 269 to 270); 1e-9 kill epsilon (DEVLOG 1238, 1288 to 1291,
  DECISIONS 262); staged deletion (DEVLOG 1420 to 1421); SCOPE-v2 numbers
  (DEVLOG 1664, DECISIONS 310); the DESIGN.md "(v1)" title is only in commit
  719585d, as the bullet says. The 322 gold figure is at DEVLOG 1489.
- Wording, not wrong: "Every v2 verifier added tests ... (8), (9), (10),
  (11)" uses milestone numbers in brackets, which can read as test counts.
- Demo: `tarpit.gif` 2,712,518 bytes (2.6 MB), 640 x 387, 12 fps, 25.0 s;
  `tarpit.png` 960 x 580. Frames at 2, 8, 14 and 22 s show the six-button bar,
  a Longbow placement ghost, waves 1 to 4 running, the Tar Pit, Fire Pot and
  a tarred-and-burning enemy. The Mortar ghost with its solid range circle
  and dashed minimum-range circle appears at about 23 s (after the 22 s
  frame). `package.json` and the lockfile are unchanged against
  `origin/main`, so no new dependency.
- README prose: "How to play" matches the UI (six-button bar, click a green
  cell, button again or Escape clears the pick, Mortar minimum 70 px, burn
  doubled on a tarred enemy). "How it was built" and "Status" match
  DECISIONS and DEVLOG. The "Kyle merged PR 1 himself" claim rests on the
  coordinator's record (DECISIONS 190), not on GitHub, which shows one merger
  login for all PRs. No hype words found.

## 2026-11-21: milestone 14, tablet and touch

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) made the game fit any screen and play by
touch. No change in `src/sim`; no gameplay change.

- Fit: Phaser `Scale.FIT` with `CENTER_BOTH` on the 960 x 580 canvas, in a
  `#game` parent that fills the viewport (`index.html`: html and body 100%,
  no margin, no scroll, background `#111418` as the title; viewport meta
  `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no,
  viewport-fit=cover`; `touch-action: none` on the canvas). At 1024 x 768
  the canvas is 1024 x 619 at scale 1.067 with 74 px bars above and below.
  `uiRects()` stays in canvas space; `window.__tarpit.canvasToPage(x, y)`
  maps a canvas point to the page through the scale manager's bounds and
  display scale, in test and non-test mode.
- HUD numbers (canvas px): every HUD, bar, panel and Play again button is
  42 px tall (44.8 px on an iPad in landscape). HUD still y 480..580. Row 1
  buttons y 484..526 (Start Wave x 726, 138 wide; speed x 876, 70 wide),
  stats centred on y 505. Bar buttons y 533..575, 148 wide, 8 apart from
  x 16. Gaps: 4 px under the HUD's top edge, 7 px between rows, 5 px at the
  bottom. Labels unchanged (bar 16 px).
- Tower panel: Upgrade and Sell 156 x 42 stacked, plus a 42 x 42 close
  button ("×") to their right at the top; the panel is 214 x 100 (was
  168 x 76). Escape still closes it. `uiRects()` lists `panel:close`.
- Touch rules: a pointerdown with `pointer.wasTouch` is a tap; mouse input
  (a click or a move) switches back. With a pick, the first tap on a
  buildable cell arms it (`ui().hoverCell` and `ui().armedCell` are that
  cell; ghost and range show), a second tap on it builds, the pick stays and
  the arm clears; a tap on another buildable cell moves the ghost; a tap on
  a blocked cell shows the red cell and arms nothing. Changing or clearing
  the pick disarms. Taps on towers, on empty map without a pick (closes the
  panel) and on the HUD act as clicks. Touch moves are ignored (no hover).
  `ui()` also reports `isTouch`.
- Portrait: a DOM card (`#rotate-card` in `index.html`, CSS phone and
  arrow, "Turn your device sideways") shows while the window is taller than
  wide, on load, resize and orientation change (`src/game/portrait.ts`).
  GameScene runs no ticks while it shows and drops the time it would have
  accumulated. `portraitCardVisible()` is on `window.__tarpit`.
- Title: "Tap or click to start".
- Playwright: a `tablet` project (1024 x 768, `hasTouch`, `isMobile`,
  scale factor 1) runs only `e2e/touch.spec.ts` and
  `e2e/visual-tablet.spec.ts`; the desktop project ignores them. The
  snapshot settings are top level, so they apply to both. The baseline
  workflow now updates both visual specs.
- What went wrong: three desktop specs pinned the old geometry (bar
  buttons 36 tall at y 537, and the exact non-test `window.__tarpit` key
  list) and were updated. In the first touch spec run the centring check
  failed by 0.67 px because Phaser rounds the letterbox margin to whole
  pixels (74, not 74.67), and the Play again check called `runScript` on a
  game that had already spent gold; both were test mistakes, fixed.
  The first rotate icon drew the phone already on its side, which read as
  "done" rather than "turn me"; it is now upright with an arrow.
- Not verified: real iOS Safari. Chromium touch emulation does not model
  Safari's toolbars (100% height), iOS ignoring `user-scalable=no` for
  pinch, or double-tap zoom outside the canvas. Kyle's iPad play covers it.
  Every existing desktop screenshot baseline changes (HUD heights, title
  text) and the tablet baseline is new: both need the CI baseline workflow.

### Verifier notes

The verifier (Claude Sonnet) checked milestone 14 on branch `m14-touch`.

- Clean run: `rm -rf dist && npm ci`, lint, typecheck, `npm test` (24 files,
  211 tests), build and `npm run test:e2e` all exit 0. e2e: 70 passed
  (chromium 62, tablet 8). `--project=tablet --repeat-each=5` passed 40 of
  40, no flakes. With the verifier specs added: 78 passed (chromium 63,
  tablet 15).
- No diff in `src/sim` or `docs/DESIGN.md`, no `*.test.ts` changed, and
  `npm run sim` prints the same summary as milestone 12 (comboBuild won with
  11 lives and 177 gold).
- Observed numbers match this section: Start Wave 726,484 138x42, speed
  876,484 70x42, bar buttons y 533 and 42 tall, panel 214x100 with a 42x42
  close, HUD text "Gold 100 / Lives 20 / Wave 0/10 / Next: 8 Goblin". Every
  rect in `uiRects()` is at least 44.8 px tall on the 1024x768 page.
- Probes in `e2e/touch-verifier.spec.ts` (tablet project, real
  `page.touchscreen.tap`) and `e2e/mouse-verifier.spec.ts` (desktop): path
  tap arms nothing; clearing the pick by the bar button disarms; a tap on a
  second cell moves the arm; the second tap on it builds there only; two-tap
  works mid-wave; 1366x1024 works; portrait at 768x1024 in non-test mode shows
  the card and ticks stop for 600 ms, landscape resumes ticking; one mouse
  click still builds.
- Config change: `playwright.config.ts` `TABLET_SPECS` now also matches
  `touch-verifier.spec.ts`; otherwise that file would have run in the desktop
  project too.
- Brief correction: at 1366x1024 the scale is limited by width (1.423), so
  the bars are above and below, not at the sides, and the canvas x offset is
  0. The probe asserts both offsets with the formula.
- Limits, not defects: portrait is detected as window height over width, so a
  narrow desktop window shows the card; phones in landscape fit at about
  0.67 scale, which makes buttons about 28 px (best effort in the scope); the
  tablet baseline PNG does not exist yet (CI workflow makes it); real iPad
  and Safari are untested, as the implementer notes say.

## 2026-11-21: milestone 15, art source spike

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) inventoried the two CC0 packs the
coordinator downloaded, rendered the style mockups and added the licensing
and size tooling. No change under `src/`; no game code change.

- Findings, in full in `docs/art/INVENTORY.md`: Ninja Adventure covers
  almost every row (enemies, tiles, cave, cottage, HUD skin, effects,
  sound) but has no cannon, mortar or wolf proper, and its monsters have
  walk cycles only. 0x72 has a good goblin and ogre and nothing else we
  need (no wolf, towers, outdoor tiles or sound). Neither pack has enemy
  death animations, so "die" will be a code effect whatever Kyle picks.
- Scale: 16 px art at 3x is 48 px, bigger than our 32 px cells and 40 px
  path, and the cottage becomes 192 x 144. An extra mockup at 2x
  (`docs/art/mockups/A-ninja-adventure-2x.png`) shows the grid-aligned
  option. B is rendered at 2x for the same reason (the 32 x 36 ogre would
  be 96 x 108 at 3x).
- Mockups: one production-build screenshot at wave 5 with six towers,
  stepped 1000 ticks, then composited with Pillow (nearest-neighbour). The
  render script and the raw screenshots stay in the session scratchpad;
  they read the untrusted pack folders, so they were not committed.
- Tooling: `npm run check:assets` (`scripts/check-asset-manifest.ts`,
  pure `checkManifest` and `parseManifest` unit-tested in
  `scripts/check-asset-manifest.test.ts`, 12 tests) and
  `npm run check:size` (`scripts/check-size-budget.ts`,
  `SIZE_BUDGET_BYTES` = 20 MB). CI runs check:assets after lint and
  check:size after build. dist/ is 1.18 MB today (1,233,127 bytes, two
  files). Both checks were seen failing on purpose: a stray
  `docs/art/stray.png`, an MIT row, and a 21 MB file in dist/.

### What went wrong

- The 0x72 zip has no license file at all. The CC0 grant is only on the
  itch.io page ("Asset license: Creative Commons Zero v1.0 Universal"),
  checked on 2026-11-21; the manifest rows for 0x72 sprites must cite that
  page.
- Wave 5 has no Wolves (2 Trolls and Goblins only), so the brief's "real
  enemy positions" frame cannot show a Wolf stand-in. A and B got a small
  roster panel; the close-up sheet shows all three.
- The first tower layout (around the top of the path) killed the Goblins
  near the cave, so every enemy sat in one clump; the towers were moved
  down the path and the tick picked from a scan.
- `python3 -I` (required for code that reads the downloaded packs) also
  hides the user site-packages where Pillow lives; the scripts append that
  path explicitly instead of dropping `-I`.
- The first Vitest exclude (`scripts/**/!(check-asset-manifest.test.ts)`)
  still excluded the new test: the run reported the old 24 files and no
  error. Fixed by dropping `scripts/**` from exclude, since `include`
  already names only that one script test; a throwaway failing
  `scripts/zz-probe.test.ts` confirmed other script tests stay out.
- The first CC0 pattern (`/^CC0\b/`) accepted "CC0-ish"; the unit test
  caught it.
- Mockup fixes after looking at each render: 3x flowers were huge (now
  grass tufts only), the Tar Pit crop included part of the rock above it,
  the explosion covered the Tar Pit, C's insets covered the Tar label
  (moved to the top-right grass), and a close-up strip ran into the next
  column.

### Verifier notes

The verifier (Claude Sonnet) checked milestone 15 on branch `m15-art-spike`.

- Clean run (`rm -rf dist && npm ci` then lint, typecheck, test, build,
  check:assets, check:size, test:e2e): all exit 0; 25 test files and 223
  tests passed, 78 Playwright tests passed; dist/ 1.18 MB in 2 files.
  `git diff origin/main --stat -- src` is empty.
- Checkers, each seen failing and then reverted: a stray `docs/art/zz.png`
  (named in the message, exit 1); an MIT row (exit 1); a CC-BY row fails
  without a `Credit:` note and passes with one; a 21 MB file in dist/
  (exit 1). CI order is lint, check:assets, typecheck, test, build,
  check:size. A throwaway failing `scripts/zz.test.ts` was not picked up;
  `vitest list` shows only `scripts/check-asset-manifest.test.ts`.
- Inventory spot-checks against the pack files matched: GreenPig 64x112,
  Hyena 28x13, Cyclope 64x64, Field 80x240, TilesetTowers 384x96,
  DemonCyclop Walk 300x50, Explosion 360x40, 0x72 goblin 16x16 and ogre
  32x36, 370 frames, and the Explosion, Launch, Hit, Coin and Alert sound
  files exist. Minor: `Hit & Impact` has Hit1 to Hit9 minus Hit4. Ninja
  Adventure `LICENSE.txt` starts "CC0 1.0 Universal"; the 0x72 zip has no
  license file and the row cites the itch.io page.
- Mockups: in the 2x mockup the Goblin outline is 32 px tall and in the 3x
  mockup 48 px; pixel runs are multiples of the scale (nearest-neighbour).
  Labels match the content. The Cyclope "Troll" is 16 px art, so it is the
  same size as the Goblin at 2x, as the recommendation says.
- Not covered by the implementer's risk list: cannon and mortar read as
  people (a knight and a bomb ninja) rather than weapons, which matters for
  gameplay readability more than for looks; Retina blur if the canvas is not
  kept pixel-perfect (needs `pixelArt`/nearest filtering and integer
  scale); the Hyena slides when walking up or down.

## 2026-11-21: milestone 16, animation engine

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

The implementer (Claude Opus) built the engine only, as the reorder after
milestone 15 set: simulation events, enemy sprites driven by them, WebGL in
play and frozen Canvas in test mode. Towers, map, HUD and title keep their
shapes. No gameplay number changed; every balance pin passes unchanged.

- **Events.** `src/sim/events.ts` defines `GameEvent` (spawn, hit, burn,
  slowed, kill with cause shot or burn, exit, build, upgrade, sell,
  waveStart, waveClear, won, lost). `tick` starts each tick with a fresh
  `state.events` array; startWave, build, upgrade and sell append their
  event between ticks, and it stays until the next tick. `hit` is one per
  enemy a shot damages (splash included), `slowed` only when the slow
  applies (`applySlow` now returns whether it did), `burn` carries the
  damage after the tar doubling. `state.shots` stays; tower barrels and
  tracers still read it. 16 tests in `src/sim/events.test.ts`.
- **Reading events once.** `EventCursor` (`src/game/anim/effects.ts`)
  hands each event to the renderer once: a new array means a new tick, and
  entries appended by actions are taken after each action. GameScene calls
  it after every tick in `advance` and after every action.
- **Sheet layouts** (Pillow plus an 8x zoom, recorded in
  `src/game/anim/sheets.ts`):
  - GreenPig (Goblin): 64 x 112, 16 x 16 cells, 4 columns x 7 rows.
    Columns are facings: down, up, left, right. Rows 0 to 3 are the walk
    cycle, row 4 attack, row 5 jump, row 6 dead (column 0, pixel-identical
    to `SeparateAnim/Dead.png`), item, two specials. Walk for column c is
    frames c, c + 4, c + 8, c + 12; dead is frame 24, shown while the
    death tween runs.
  - Cyclope (Troll): 64 x 64, same 4 facing columns x 4 walk rows, no dead
    frame.
  - Hyena (Wolf): 28 x 13, two 14 x 13 side frames facing left. Mirrored
    for right, and up and down use the right-facing mirror: the path never
    runs left, so a wolf going up or down always came from a rightward run.
- **Scale and look.** Goblin and Wolf at 2x, Troll at 3x (Fable's decision
  at the reorder). Facing comes from the last tick's movement along the
  path (`anim/facing.ts`, dominant axis). Walk at 10 fps in play, scaled by
  the 1x/2x speed; frame 0 of the cycle in test mode. Sprites sit in one
  Layer above the path, towers and status rings and below shot effects, hp
  bars, labels and HUD, sorted by y.
- **Effects.** Hit: an 80 ms white tint fill. Kill: the sprite stops,
  shrinks to 0 and fades over 250 ms, with a 6-particle dust burst. Burn:
  an orange tint pulse and a small flame particle every 6 redraws. Slowed:
  a dark tar tint. Exit: removed at once. In test mode there are no tweens
  or particles: a killed sprite goes at once, tints are fixed, and the hit
  flag lasts until the next tick.
- **Rings kept.** Phaser tints are WebGL-only (`Tint` is `@webglOnly`), so
  in test mode (Canvas) they change nothing on screen. The tar and burn
  rings stay, as a halo under the sprite (radius 14, 12 and 21 px plus the
  old offsets), so baselines still show status; in play both show. Hp bars
  keep their 30 x 4 size and colours and now sit above the sprite's top
  (half the scaled frame height).
- **Asset serving.** `src/game/anim/sheets.ts` imports each PNG from
  `assets/sprites/` with Vite's `?url`. Only imported files reach `dist/`,
  so `assets/MANIFEST.md` never ships, and `check:assets` keeps covering
  the files because they stay under `assets/`. `publicDir: 'assets'` would
  ship the manifest; a `public/` symlink is one more thing to explain on
  Windows checkouts. Vite inlines files under its 4 kB limit as data URIs:
  `troll.png` (3.8 kB) and `wolf.png` (0.4 kB) are inside the JS bundle,
  `goblin.png` (5.9 kB) is a hashed file. dist/ is 1.19 MB.
- **Renderer.** `type: isTestMode() ? Phaser.CANVAS : Phaser.AUTO`,
  `pixelArt: true`, `roundPixels: true`. pixelArt turns antialias off:
  textures use NEAREST in WebGL, and Phaser's Canvas renderer draws with
  `imageSmoothingEnabled = false` for NEAREST textures (checked in
  `CanvasRenderer.batchSprite`). Headless Chromium on this Mac gave WebGL
  (renderer type 2) in play.
- **Test hooks.** `animState(enemyId)` (also outside test mode, read-only)
  returns texture, anim key, walk-cycle frame, facing, flipX, scale and the
  hit, burning, slowed and dying flags, or null when the enemy has no
  sprite. `events()` returns `state.events` (test mode only).
  `e2e/anim.spec.ts` has 6 tests; `e2e/live.spec.ts` gains a WebGL and
  walk-cycle test.

What went wrong:

- The scene's `events()` test method clashed with Phaser's `Scene.events`
  emitter (typecheck caught it); the scene method is `simEvents()` and the
  hook keeps the name `events()`.
- I took the Musketeer's first wave 1 shot to be tick 392 from a comment
  in `e2e/visual.spec.ts`; it is tick 152 (392 is its fifth). The anim spec
  now pins 152, found by stepping.
- The brief placed the tar-and-burn check at cells (14,10) and (14,9);
  milestone 11 verified tick 687 with a Tar Pit at (14,6) and a Fire Pot
  at (14,8), so the spec uses those cells.
- The brief said "flip horizontally for left" for the Wolf; the Hyena
  frames face left, so the mirror is for right.
- Side effect to know about: `pixelArt` also sets `image-rendering:
  pixelated` on the canvas, so when Scale.FIT stretches it (the iPad at
  1024 wide) the whole canvas, text included, scales nearest-neighbour.
  The tablet baseline is expected to change for that reason (not verified
  locally: pixel comparisons run on CI only), not because of sprites.
  Kyle should look at text on the iPad.
- Screenshot baselines that show enemies (mid-wave, enemies, new-towers,
  won, lost) and the tablet frame need regenerating on CI; the frame ticks
  and count assertions are unchanged.

### Verifier notes

Independent check, with a different model from the implementer.

- **Clean run** (`rm -rf dist && npm ci && lint && typecheck && test && build
  && check:assets && check:size && test:e2e`): exit 0. 244 unit tests (223
  existing, unmodified, plus 21 new), 85 e2e. `check:size` 1251326 bytes in 3
  files, matching the implementer. After the verifier added 6 sim probes, 3
  e2e probes and the Wolf fix: 250 unit tests, 88 e2e, all pass.
  `anim.spec`, `live.spec` and the new probes ran with `--repeat-each=5`: no
  flake.
- **No gameplay change.** `git diff 7d5cdde -- src/sim` (excluding tests) is
  event emission only, the events module and `applySlow` returning a boolean.
  `npm run sim` summary is identical to the merge base (combo won, 11 lives,
  177 gold). Existing `*.test.ts` files are untouched (additions only).
  `tick` clears `events` at its start; build, upgrade, sell and `waveStart`
  events survive until the next tick. Note: the list also persists through
  setup after a wave's last tick, so a reader that logs `state.events` after
  every action without a cursor double-counts. `EventCursor` handles this;
  the verifier's own first harness hit exactly this.
- **Event probes** (`src/sim/events-verifier.test.ts`, 6 tests): Cannon splash
  on 3 enemies gives 3 hits with one cell and damage; burn kill has cause
  burn; over a full 10-wave game kills == spawns - exits with each id once;
  `waveClear` carries 25 and `won` appears once, right after wave 10's clear;
  a weaker slow on a stronger one emits nothing; wave 3 spawns 8 Goblin and 6
  Wolf; setup ticks are empty.
- **Assets.** The three PNGs are byte-identical to the pack files. Manifest
  rows cite the pack URL, authors and CC0; removing the wolf row made
  `check:assets` fail (reverted). Sheet layouts for GreenPig (4 x 7, facing
  columns down, up, left, right, dead frame at row 6 col 0) and Cyclope (4 x
  4) match Pillow and the eye.
- **Defect found and fixed: the Wolf walked backwards.** The Hyena frames face
  RIGHT (snout, eye and tail read pixel by pixel; the shipped m16 frames show
  a wolf on the last leg with its snout pointing left while moving right).
  The implementer's correction of the brief ("frames face left, so mirror
  for right") was wrong; the brief was right. `sheets.ts` now mirrors for
  left only, up and down are unmirrored, unit and e2e tests pin it, and
  INVENTORY.md is corrected. Wolf screenshot baselines on CI must be
  regenerated anyway.
- **Renderer.** `src/main.ts` uses Canvas in test mode and AUTO otherwise,
  with `pixelArt` and `roundPixels`; tweens and particles are off when
  frozen (`enemySprites.ts`, `Particles` only created when not frozen);
  frame is 0 in test mode. The jagged-text risk of `pixelArt` is stated in
  the DEVLOG.
- **Probes** (`e2e/anim-verifier.spec.ts`): goblin frame 0 and facing match
  movement across the first corner; Wolf `flipX` false while moving right;
  depth rises with screen y (read through `game.scene.getScene('game')`).
- **Not verified:** pixel baselines (CI only), real iPad text rendering with
  `pixelArt`, WebGL frames beyond the implementer's screenshots.

## 2026-11-21: milestone 22, Harpy and Shieldbearer

Roles: implementer Claude Opus, verifier Claude Sonnet, coordinator Claude
Fable 5.1.

### Implementer notes

- **Simulation.** `EnemyType` gains `harpy` (40 hp, 90 px/s, 7 gold) and
  `shieldbearer` (120 hp, 45 px/s, 9 gold). `EnemyStats` gains `flying`
  and `shield` (false for the other three); the rules read them from
  `ENEMY_STATS` by type, so `Enemy` is unchanged. `combat.ts`: Tar Pit,
  Cannon and Mortar skip flyers in `findTarget` (`canTarget`); splash skips
  flyers; a Fire Pot impact on a flyer applies no burn. `enemies.ts`
  `shotDamage` halves a shot of base damage `SHIELD_THRESHOLD` (10) or less
  on a shielded enemy, so base Longbow 4 -> 2, upgraded 9 -> 4.5, Fire Pot
  impact 4 -> 2, Tar Pit 3 -> 1.5; burn is never halved. `hit` events carry
  the halved damage. 23 tests in `src/sim/flyingShield.test.ts`, one or
  more per rule.
- **Wave table, before (milestone 12) and after.** New groups are each
  wave's last groups; older groups are unchanged.

  | Wave | Before | Added in milestone 22 |
  |---|---|---|
  | 1 to 3 | unchanged | none |
  | 4 | 10 Wolf / 0.6 s | 4 Harpy / 1.2 s, delay 2 s |
  | 5 | 12 Goblin / 0.7 s; 2 Troll / 3 s, delay 2 s | 3 Harpy / 1.0 s, delay 6 s |
  | 6 | 18 Goblin / 0.5 s; 14 Wolf / 0.5 s, delay 5 s | 3 Shieldbearer / 2.0 s, delay 3 s |
  | 7 | 10 Wolf / 0.5 s; 10 Troll / 2.5 s, delay 1 s | 4 Harpy / 1.0 s, delay 8 s |
  | 8 | 20 Goblin / 0.5 s; 10 Wolf / 0.6 s, delay 6 s; 8 Troll / 3 s, delay 3 s | 3 Shieldbearer / 2.5 s, delay 4 s; 4 Harpy / 1.0 s, delay 10 s |
  | 9 | 12 Wolf / 0.5 s; 6 Troll / 2 s | none |
  | 10 | 8 Wolf / 0.5 s, delay 4 s; 12 Troll / 2 s | 5 Harpy / 0.8 s, delay 6 s; 4 Shieldbearer / 2.0 s, delay 2 s |

- **Combo plan re-planned for anti-air:** a third Longbow (17,8) after the
  first Fire Pot (bought before wave 4) and its upgrade as the last
  action. With the old plan the combo build leaked all 4 wave 4 Harpies
  and ended with 232 gold after wave 9.
- **Archetypes, before -> after** (`npm run sim`):

  | Archetype | Milestone 12 | Milestone 22 | Target |
  |---|---|---|---|
  | noTowers | lost wave 2 | lost wave 2 | lost by 3 |
  | lazyBuild | lost wave 7 | lost wave 7 | lost on 6 to 8 |
  | greedyMusket | lost wave 7 | lost wave 7 | none |
  | soundBuild | lost wave 9 | lost wave 7 | none |
  | soundBuildNoTar | lost wave 7 | lost wave 6 | none |
  | longbowSpam | lost wave 9 | lost wave 9 | lost on 7 to 9 |
  | comboBuild | won, 11 lives, 177 gold, 136 after wave 9 | won, 12 lives, 347 gold, 145 after wave 9 | won, 5 to 15 lives, under 150 after wave 9 |
  | comboBuildNoFire | won, 2 lives | won, 2 lives | strictly worse than combo |
  | noAntiAir | (new) | lost wave 7; all 4 wave 4 Harpies exit | every wave 4 Harpy exits; lost by wave 8 |

  Found with a scratch harness that rewrites the wave table and the combo
  plan in memory: 8 rounds, 34 runs (19 named configurations plus a sweep
  of one action over 15 plan positions).
- **noAntiAir sells instead of dropping (deviation from the brief).** The
  brief defined it as the combo plan with every Musketeer and Longbow
  action removed. The combo plan opens with two Longbows and has no ground
  tower affordable for wave 1 that holds Goblins alone, so that build
  loses on wave 2, before any Harpy (pinned as `comboBuildNoBows`, lost on
  wave 2 with 65 gold). No combo opener tried (a Cannon, Tar Pit or Fire
  Pot at the best corner cells) kept a no-bow build alive to wave 4. So
  `noAntiAir` plays the combo script unchanged through wave 3, sells its
  two Longbows in setup before wave 4, and drops every later action on
  Musketeer and Longbow cells; refunds and freed gold are spent on nothing.
  Coordinator to confirm.
- **Display names.** `src/game/names.ts`: `ENEMY_NAMES`, `TOWER_NAMES`,
  `TOWER_SHORT_LABELS`, `BOSS_NAME` ("Grumblefoot", unused until milestone
  23) and `END_TEXT` (the end screens' words). The HUD preview, the build
  bar, the tower labels and the end screens read them. `endText.test.ts`,
  `labels.test.ts`, `play-wave.spec.ts`, `new-towers-verifier.spec.ts` and
  `new-enemies.spec.ts` build their expected strings from the tables. The
  label crowding tests still depend on the current label lengths (a longer
  label crowds differently, which is behaviour, not a display string).
- **Sheet layouts** (Pillow plus 8x and 16x zooms):
  - BlueBat (Harpy): 64 x 64, 4 columns x 4 rows of 16 x 16, the
    four-way layout. Column 0 shows the eyes (down), column 1 none (up);
    the side views have the eye left of centre in column 2 (left) and
    right of centre in column 3 (right). Rows 0 and 3 wings up, rows 1 and
    2 wings folded, so the walk cycle is a flap. No dead frame.
  - Knight (Shieldbearer): 64 x 112, the GreenPig layout. Visor notch left
    in column 2 and right in column 3; row 6 column 0 is pixel-identical to
    `SeparateAnim/Dead.png` (dead frame 24).
- **Renderer.** Both at 2x. Harpies go in an air layer GameScene adds right
  after the tower labels, so they draw above every walker and label and
  below the HUD; drawn 16 px above the path position, with a gentle bob in
  play (2 px, 900 ms, desynced by id; none in test mode) and a two-ellipse
  ground shadow (24 x 9 at 15% under 16 x 6 at 20%, 3 px below the path
  point) drawn with the status rings. No tar or burn tint or ring on a
  flyer; the hit flash stays. Hp bars of flyers sit above the lifted
  sprite. Shieldbearers carry a 6 x 6 grey rounded rect with a 1 px dark
  edge, 11 px left of and 3 px below the sprite centre, just in front of
  their own sprite.
- **Frames.** New `harpies.png` (wave 4, Cannon (7,4), Musketeer (2,3),
  tick 471). `enemies.png` keeps tick 1350; wave 8 now also has 3
  Shieldbearers and 4 Harpies there. `new-towers.png` moved from tick 1754
  to 1490 (see below). `won.png` now shows 12 lives and 347 gold.

### What went wrong

- The brief's `noAntiAir` (bows removed from wave 1) cannot reach wave 4;
  see the deviation above.
- The first Harpy frame (Cannon at (7,7), as in `new-enemies.spec.ts`)
  only matched at ticks where a Harpy, lifted 16 px on the vertical run,
  sat exactly over the Wolf the Cannon was shooting, so the tracer looked
  like it hit the Harpy. A wider scan with a minimum sprite distance of
  18 px found Cannon (7,4) and Musketeer (2,3).
- `new-towers.png` lost its Mortar splash: wave 5's Harpies take the
  Longbow's shots, the Goblins live longer and the Mortar's cycle moved
  (1488, 1668, 1848; none at 1752). The brief said to keep frame ticks; the
  tick moved anyway, to 1490 (2 ticks after a Mortar shot, as before, both
  Trolls slowed and burning, 10 px apart), because at 1754 the frame no
  longer shows what its comment promises. The verifier test
  `frame-verifier.test.ts` moved with it.
- Two verifier tests needed changes because the waves changed: the
  events verifier's fixed defence lost on wave 7 to the Harpies, so it
  gained two upgraded Longbows; the frame verifier above.
- The combo build's gold after wave 9 (under 150) left almost no room for
  new bounties in wave 9, so wave 9 has no new groups. 145 gold leaves a
  5 gold margin.

### Verifier notes

Verifier: Claude Fable 5.1 (independent of the implementer). Everything
below was observed on branch `m22-harpy-shieldbearer` at commit 001d592.

- **Clean run** (`rm -rf dist && npm ci && lint && typecheck && test &&
  build && check:assets && check:size && test:e2e && sim`): exit 0; 29
  test files, 295 unit tests; 93 Playwright tests; `dist/` 1.20 MB in 4
  files; 10 manifest rows. `e2e/new-enemies.spec.ts --repeat-each=5`: 20
  of 20. The sim summary matches the implementer's table line for line
  (noTowers 2, lazyBuild 7, greedyMusket 7, soundBuild 7, soundBuildNoTar
  6, longbowSpam 9, comboBuild won 12 lives 347 gold, comboBuildNoFire won
  2 lives, noAntiAir lost wave 7 with 226 gold).
- **Spec truth.** Every SCOPE-v4 rule maps to a line: Tar/Cannon/Mortar
  cannot target a flyer (`combat.ts` `GROUND_ONLY` and `canTarget`, used in
  `findTarget`); splash skips flyers (`!isFlying(enemy)` in the splash
  loop); no burn on a flyer (`!isFlying(target)` before `applyBurn`);
  halving in `enemies.ts` `shotDamage` with `SHIELD_THRESHOLD = 10`, called
  only from the shot `hit`, never from `burnEnemies`. Fire Pot has no
  splash, so a flyer is a valid Fire Pot target and its impact lands.
  `src/sim/towers.ts` has no diff against origin/main; `enemies.ts` only
  adds the two flags (false on the old rows) and the two new rows; the wave
  table diff adds groups at the end of waves 4, 5, 6, 7, 8 and 10 only,
  pinned by a verifier test against the milestone 12 table.
- **Rule probes** (`src/sim/flyingShield-verifier.test.ts`, 16 tests, own
  geometry: cell (7,7) is exactly 100 px from path distance 220 and 150 px
  from 90; cell (2,5) is 80 px from 128). Upgraded Mortar: Harpy at 100 px
  ahead of a Goblin at 150 px, shot goes to the Goblin (30 - 70, dead, +4
  gold), Harpy 40; lone Harpy, 600 ticks, 0 shots. Cannon at a 100 hp
  Goblin with a Harpy 20 px away inside the 40 px splash: Goblin 75, Harpy
  40, one hit event. Fire Pot on a Harpy: 40 -> 36, burn 0/0, 200 burn
  steps emit nothing. Tar Pit: lone Harpy 300 ticks, 0 shots, slow 0; a
  Goblin 20 px from a Harpy is slowed 0.4 for 120 ticks, the Harpy not.
  Shieldbearer: Longbow 4 -> 2 (118), upgraded 9 -> 4.5 (115.5), Fire Pot
  4 -> 2 (118), Musketeer 12 -> 12 (108), Cannon 25 -> 25 (95); 60 burn
  steps at 5/60 take 5.000 (118 -> 113), burnTicksLeft 180 -> 120. A
  Shieldbearer at 2 hp killed by a halved Longbow shot pays 9 once. Wave 4
  spawns {wolf 10, harpy 4}; wave 6 spawns {goblin 18, wolf 14,
  shieldbearer 3}.
- **Archetypes.** `noAntiAir()` is `comboBuild()` transformed in code: the
  bow cells are collected from the whole script, waves 1 to 3 are returned
  unchanged, wave 4 gets a `sell` per bow built so far in front, and every
  later action on a bow cell is filtered out. `comboBuildNoBows()` is
  `withoutTowerType` over `musketeer` then `longbow`, pinned at lost on
  wave 2 with 65 gold. `balance.test.ts` pins 4 of 4 wave 4 Harpies
  exiting under noAntiAir and the loss on wave 7 (target: by 8). Milestone
  12 targets from the sim output: noTowers 2 (by 3), lazy 7 (6 to 8), spam
  9 (7 to 9), combo won with 12 lives (5 to 15) and 145 gold after wave 9
  (under 150: 5 gold of margin, so any added bounty before wave 9 ends
  breaks the pin), noFire 2 lives (worse). The "8 rounds, 34 runs" search
  claim cannot be checked from the repo.
- **Names table.** Grep of `src/game` for the thirteen display literals
  outside `names.ts` hits only four comments (`input.ts`, `hud.ts`,
  `buildBar.ts`, `labels.ts`). In `e2e` and the unit tests every hit is a
  test title, never an assertion; the HUD and end-screen assertions build
  their strings from `ENEMY_NAMES`, `TOWER_SHORT_LABELS` and `END_TEXT`.
  Proof: with `goblin: 'Grub'` in `names.ts`, `npm test` passed 311 of 311
  and `npx playwright test --grep-invert visual` passed 84 of 84 (the one
  failure in that run was the verifier's own shadow probe, fixed below);
  reverted. Observation, not a defect: the HUD prefixes ("Gold", "Lives",
  "Wave", "Next: none") are pinned literally in `play-wave.spec.ts` and
  `end-screens-verifier.spec.ts`; they are not names and the DECISIONS
  rule names only the names table.
- **Renderer** (`e2e/new-enemies-verifier.spec.ts`, 4 probes, 20 of 20
  with `--repeat-each=5`). At tick 1350 of wave 8 (27 enemies) the four
  Harpy sprites share one display-list entry that is after the walkers'
  layer, the labels' layer, the hp bars and the shot effects, and before
  the last entries (HUD); the air layer is a different object from the
  walkers' layer. Shadow: read from the Canvas renderer's pixels under a
  Harpy on the top run at tick 600 of wave 4; centre (x, y + 3) reads
  (132,111,80) = path (194,164,118) x 0.85 x 0.8, 10 px aside reads x 0.85,
  28 px either side plain path. A first version of the probe read the
  canvas in the same task as `step()` and failed 1 in 5: Phaser paints on
  the next animation frame, so the probe now waits one. Over 900 ticks of
  wave 4 with a Tar Pit (14,6) and a Fire Pot (14,8), over more than 500 Harpy
  tick samples, the Fire Pot hit Harpies and Wolves were slowed, but no
  Harpy was ever slowed, burning, flagged, or tinted outside a hit flash.
  The first Shieldbearer of wave 6 (id 7) faces right on frame 3 for every
  tick before path distance 160 and up on frame 1 from 160 to 304, flipX
  false; its shield mark is a visible Graphics at (-11, +3) from the
  sprite, depth + 0.5, in the walkers' layer; no Harpy has one. Frames:
  `harpies.png` shows the shadows under all four Harpies and the Musketeer
  tracer on one; in `enemies.png` the Harpies overlap walkers and draw on
  top; in the 2x crops the shadow and the shield mark both read. Nothing
  off.
- **Frame pins.** `frame-verifier.test.ts` pins tick 1490 (last Mortar
  shot 1488, Trolls slowed and burning, 417 hp, a Harpy) and
  `visual.spec.ts` asserts the same at 1490 with `MORTAR_FIRE_TICK` 1488.
  `enemies-frame.test.ts` pinned only the three old types at 1350 while
  the e2e asserts 3 Shieldbearers and 4 Harpies: fixed in its own commit.
- **Sheets, checked against the pack files with Pillow.** `harpy.png` and
  `shieldbearer.png` are byte-identical to BlueBat and Knight
  `SpriteSheet.png`. BlueBat: column 3 is the exact mirror of column 2 in
  all four rows; columns 0 and 1 differ only in a 10-pixel face region
  (eyes in column 0, none in column 1); the side view's eye slash is left
  of centre in column 2. Knight: the visor notch is left in column 2 and
  right in column 3; frame (col 0, row 6) is the only frame equal to
  `SeparateAnim/Dead.png`. The `fourWay()` mapping is right for both.
- **Docs.** `docs/DESIGN.md` has the enemy rows and the "Flying and
  shields" paragraph, including the 1e-9 death threshold for fractional
  hp; README lists `names.ts` and the two sprites and its status paragraph
  names v4. The DEVLOG table and numbers match what was observed.
- **Verdict: PASS.** Verifier commits: the frame-pin fix, the probes, and
  these notes.

## 2026-11-21: milestone 23, Grumblefoot

Roles: implementer Claude Opus, verifier Claude Fable 5.1, coordinator
Claude Fable 5.1.

### Implementer notes

- **Simulation.** `EnemyType` gains `boss`: 4000 hp, 25 px/s, 150 gold,
  walking, no shield. `EnemyStats` gains `livesCost` (1 for the other five,
  5 for him; the exit step subtracts it) and an optional `slowCap` (0.3 on
  him only). `combat.ts` `applySlow` caps the strength first and returns
  the strength applied (or null), so the Tar Pit's 40% and 60% both land
  as 30% for the full 2 s and the `slowed` event carries 0.3. Burn is
  unchanged (doubled under tar as usual). New events: `bossSpawn` after
  his `spawn`, `bossDown` (cause `shot`, `burn` or `exit`) after his `kill`
  or `exit`. Wave clear and win rules are untouched.
- **Spawn timing.** Wave 10's other groups end with the 12th Troll at
  11 x 2 = 22 s (Wolves 7.5 s, Harpies 9.2 s, Shieldbearers 8 s), so the
  boss group is `g('boss', 1, 0, 26)`: waveTick 1560, the last spawn of the
  wave.
- **Boss hp: 4000, as in SCOPE-v4.** No lowering was needed: the combo
  build kills him with its existing plan and no re-plan.
- **Archetypes** (`npm run sim`), milestone 22 -> 23:

  | Archetype | Milestone 22 | Milestone 23 | Target |
  |---|---|---|---|
  | noTowers | lost wave 2 | lost wave 2 | lost by 3 |
  | lazyBuild | lost wave 7 | lost wave 7 (never meets him) | lost on 6 to 8 |
  | greedyMusket | lost wave 7 | lost wave 7 | none |
  | soundBuild | lost wave 7 | lost wave 7 | none |
  | soundBuildNoTar | lost wave 6 | lost wave 6 | none |
  | longbowSpam | lost wave 9 | lost wave 9 (never meets him) | lost on 7 to 9 |
  | comboBuild | won, 12 lives, 347 gold | won, 12 lives, 497 gold, 145 after wave 9; kills him (shot) at waveTick 4639 | won, 5 to 15 lives, under 150 after wave 9 |
  | comboBuildNoFire | won, 2 lives, 475 gold | won, 2 lives, 625 gold; kills him at waveTick 5150 | strictly worse than combo |
  | noAntiAir | lost wave 7 | lost wave 7 | lost by 8 |
  | bossRush | (new) | won, 12 lives, 427 gold; kills him (burn) at waveTick 4562 | informational |

  `bossRush()` plays the combo build and, before wave 10, spends what is
  left on Longbow upgrades. The combo build has upgraded all five of its
  Longbows by then, so it builds a Longbow and upgrades it while 70 gold
  allows: one pair at (2,5), the first trail cell (115 gold after the
  combo's wave 10 upgrade, 45 left over). He dies 77 ticks sooner.
- **Sheet layouts** (Pillow bounding boxes plus a 4x zoom read by eye).
  DemonCyclop `Walk.png`, 300 x 50: one row of six 50 x 50 frames, every
  one a front view facing the viewer (no side or back views; frames 4 and
  5 lean a little). So all four facings use frames 0 to 5, mirrored for
  left only (the path never runs left, so the mirror never shows). Feet at
  rows 42 to 43 of 50. `Hit.png`, 150 x 50: three 50 x 50 frames, 0 a
  bright orange flash, 1 and 2 a hurt pose (mouth open). Frame 0 is the
  hit flash, drawn as a second sprite over him while the flash lasts
  (instead of the white tint fill, which Canvas cannot draw), so test mode
  shows it too. Both PNGs are unchanged copies (`assets/sprites/boss.png`,
  `boss-hit.png`); both are under Vite's 4 kB inline limit, so `dist/`
  stays at 4 files.
- **Renderer.** 2x, in a layer between the walkers and the shot effects:
  above every walker, below shots, hp bars, labels and Harpies. Drawn 30
  px above his path position so his feet stand 6 px below the path point;
  ground shadow 72 x 20 at 15% over 52 x 14 at 20%, 4 px below the point;
  tar and burn rings (radius 41 and 44) centred on his body. Walk at 8 fps
  in play (checked: the frame index advanced 1 per about 130 ms), frozen
  on frame 0 in test mode. No small hp bar.
- **HUD boss bar** (`src/game/ui/bossBar.ts`): 300 x 14 centred, dark
  trough, red fill, 1 px cream border, "2374 / 4000" in 11 px right-aligned
  inside (hp rounded up so a live boss never reads 0), name from
  `BOSS_NAME` in 14 px on a dark rounded pill above the left end.
  `hudText().boss` is "Grumblefoot 4000 / 4000" while shown, else null.
- **Wave 10 preview**: "Next: 8 Wolf, 12 Troll, 5 Harpy, 4 Shieldbearer +
  Grumblefoot" (`ENEMY_NAMES` for the groups, `BOSS_NAME` for him).
- **Test hooks.** `runScript(name, untilWave?)` stops in setup before
  `untilWave` with that wave's actions applied; `animState` reports
  texture 'boss'.
- **Frames.** New `boss.png`: combo build, wave 10, step 3562; he is
  alone, tarred and burning at (420,241) on the downhill run, bar at 2374
  of 4000, a Mortar splash on him 2 ticks into its fade, and no hit on
  that tick (walk frame, not the flash). `won.png` now shows 497 gold.
  `new-towers.png` changes in the HUD only (its wave 6 preview now wraps;
  see below). Other ticks unchanged.

### What went wrong

- **The bar could not sit at y 12 with the name above it.** The brief put
  the bar at y 12 and the 14 px name above-left of it; an 18 px pill does
  not fit in 12 px. The bar is at y 24 and the pill at y 4 to 22.
  Coordinator to confirm.
- **The wave preview ran under the Start Wave button.** The HUD gives the
  preview 350 px (x 366 to 716). At 16 px Courier New (9.6 px a
  character) the milestone 22 previews for waves 6, 8 and 10 were already
  wider (wave 10: 451 px), and "+ Grumblefoot" made wave 10's 586 px, so
  the boss name was hidden under the button. A preview longer than one
  line now drops to 13 px and wraps to two lines (`previewSize` in
  `hud.ts`). This changes the HUD text in `new-towers.png` (wave 6
  preview) on the next CI baseline run.
- **"Step 300 more, the bar shows lower hp" did not hold.** Every tower
  aims at the enemy furthest along the path, and he is the slowest enemy
  of the wave, so nothing shoots him until the Fire Pot at (10,4) hits
  him about 977 ticks after his spawn. `e2e/boss.spec.ts` steps in chunks
  of 300 until the hp drops and pins the count (4 chunks).
- **The lose path as briefed (lives 5, then wave 10 with no towers) loses
  to the wave's other 29 enemies first.** The spec sets 34 lives, so 5 are
  left when he is alone, and asserts that before he exits.
- **"All remaining gold on Longbow upgrades" had no Longbow left to
  upgrade** in the combo build; `bossRush` builds and upgrades pairs.
- **Tests outside this milestone that changed:** the milestone 22
  verifier's wave-table test now ignores the boss group; the
  `ENEMY_STATS` pins gained `livesCost: 1`; five test hp tables gained the
  boss; the combo build's final gold moved from 347 to 497 in
  `balance.test.ts`, `endText.test.ts`, `end-screens.spec.ts`,
  `end-screens-verifier.spec.ts` and `visual.spec.ts`.
- My first `boss.png` assertion counted the Mortar hit one tick late (the
  splash on screen at step 3562 is from step 3560, not 3561).

### Verifier notes

- **Clean run, exit 0.** `npm ci`, lint, typecheck, 32 test files / 339
  tests, build (49 modules, 4 files in `dist/`), `check:assets` (12 rows),
  `check:size` 1269753 bytes, 100 Playwright tests, and `npm run sim` with
  the summary line for line as in the table above. `boss.spec.ts` and
  `end-screens.spec.ts` with `--repeat-each=5`: 30 of 30.
- **Spec and scope hold.** `git diff origin/main -- src/sim/towers.ts
  src/sim/enemies.ts src/sim/waves.ts`: towers.ts untouched; enemies.ts
  adds the boss row, `livesCost: 1` on the other five, `isBoss` and
  `cappedSlow`; waves.ts adds only `g('boss', 1, 0, 26)`. No other number
  changed. Wave 10 from the table: Wolves 4 + 7 x 0.5 = 7.5 s, Trolls
  0 + 11 x 2 = 22 s, Harpies 6 + 4 x 0.8 = 9.2 s, Shieldbearers
  2 + 3 x 2 = 8 s, so the last other spawn is the 12th Troll at 22 s
  (tick 1320) and he comes at 26 s (tick 1560), the last spawn.
- **Independent probes** (`src/sim/boss-verifier.test.ts`, 15 tests, cell
  B = (2,5) at 64 px from path distance 80): under an upgraded Tar Pit he
  moves 120 x 25 x 0.7 / 60 = 35 px in the 120 ticks after the first shot
  (50 unslowed; a Troll in the same spot 28 px at the full 60%) and every
  `slowed` event on him carries 0.3; an exit with 20 lives leaves 15, with
  5 leaves 0 and `lost`, one `exit` and one `bossDown {cause: 'exit'}`; a
  burn kill pays 150 once with `kill` and `bossDown {cause: 'burn'}`; a
  fully spawned wave 10 with him alone stays in phase `wave` for 60 ticks
  and wins on the next tick without him; a Cannon targets him past a Harpy
  and does the full 25, a Longbow does 4 (2 on a Shieldbearer); the combo
  build's `bossDown` is `shot` at waveTick 4639 with 12 lives and 497
  gold, `comboBuildNoFire` at 5150 (511 ticks later) with 2 lives.
- **Renderer probes** (`e2e/boss-verifier.spec.ts`, 4 tests, 12 of 12 over
  three repeats): his Layer sits after the walkers' Layer and before the
  shot effects, hp bars, labels' Layer and air Layer; at tick 4921 of a
  towerless wave 10 he is alone at distance 3360 x 25 / 60 = 1400, i.e.
  (776,192), and the canvas under his feet reads path x 0.85 x 0.8 at 9 px
  below the point and path x 0.85 at 12 px (inner ellipse ended, outer
  still 21.6 px wide), plain path 60 px to either side; the first hit on
  him (Fire Pot) shows the `boss-hit` frame 0 sprite over him at (0,0)
  offset in his Layer and `animState().flags.hit`, hidden again on the next
  tick without a hit; `hudText().boss` is null on tick 1560, the label at
  1561, null again after `bossDown`; at tick 3562 the red run along the
  bar's middle row is within 2 px of round(300 x hp / 4000) = 178; the
  wave 10 preview object is at 13 px and `getWrappedText()` gives two
  lines, the second ending with `BOSS_NAME`; the wave 1 preview is one
  16 px line.
- **Frame pin added:** `src/sim/boss-frame.test.ts` pins tick 3562 of the
  `boss.png` setup in the simulation (alone at (420,241), tarred at 0.3,
  burning, bar 2374, Mortar hit on him on tick 3560, no hit on 3562, 12
  lives). The 497 gold and 12 lives agree across `balance.test.ts`,
  `endText.test.ts`, `end-screens.spec.ts`, `end-screens-verifier.spec.ts`
  and `visual.spec.ts`.
- **Names rule:** "Grumblefoot" outside `names.ts` in `src/game` appears
  only in comments (hud.ts, testGlobal.d.ts, enemySprites.ts, sheets.ts),
  never in a string. Rename proof: `BOSS_NAME = 'Bogwart'`, `npm test` 34
  files / 354 tests green, `boss.spec.ts` and `boss-verifier.spec.ts` 6 of
  6 green, reverted. Note for the next renamer: Playwright serves the built
  `dist/` (`vite preview`), so a rename needs `npm run build` before
  `test:e2e`, or the browser still shows the old name.
- **Sheets:** `assets/sprites/boss.png` and `boss-hit.png` are byte-identical
  to the pack's `Actor/Boss/DemonCyclop/Walk.png` and `Hit.png` (sha256
  match). Pillow: Walk 300 x 50, six 50 x 50 frames, frame bounding boxes
  all front views (frames 4 and 5 shifted right, the lean); Hit 150 x 50,
  three frames. Lowest opaque row in every walk frame is 42 (row 43 is
  transparent), so "feet at rows 42 to 43" is one row generous; lift 30
  still puts the last opaque row 6 px below the path point as described.
- **Frames looked at** (m23-boss, bar crop, sprite 2x, hud preview,
  play-webgl, sheet zoom): bar legible, name pill whole, he draws over the
  path with the rings on his body and the shadow at his feet, the preview
  wraps clear of Start Wave, nothing under the HUD. Nothing off.
- **Open for the coordinator:** the bar at y 24 with the pill at y 4 to 22
  (the brief said y 12) is as DESIGN now describes; accept or move.

### CI failure after the fact

- **What failed.** On GitHub's Ubuntu runner (run 44956904244),
  `e2e/live.spec.ts` "live loop ticks, spawns enemies, and 2x runs faster"
  failed on both attempts: 48, then 60 ticks after 1500 ms at 1x, against
  `toBeGreaterThan(60)`. It passes locally. It had passed on the previous
  two PRs by timing luck.
- **Cause.** Since milestone 16, play uses WebGL. Headless Chromium on CI
  has no GPU and renders WebGL in software (SwiftShader), so the frame rate
  falls and the real-time loop falls behind 60 ticks/s. The brief's model
  was about 4 fps at 8 ticks a frame (`MAX_TICKS_PER_FRAME`), 48 ticks.
  Reading Phaser's `TimeStep.smoothDelta` while fixing this found a second
  limit that fits the numbers at least as well: for the first 120 frames
  after the loop starts (`panicMax`), Phaser cuts every delta to 16.67 ms,
  so 1x runs one tick per frame, and the test's 1x window falls inside
  those frames. Then 48 and 60 ticks mean about 32 and 40 fps (60 is not a
  multiple of 8). Phaser also replaces any delta over 200 ms (`minFps` 5)
  with an earlier one. The CI log does not show the frame rate, so which
  limit applied is not proven.
- **Fix 1, the cap.** `MAX_TICKS_PER_FRAME` goes from 8 to 20 (a third of
  a second of catch-up), so a device at 4 to 5 fps keeps real time at 1x
  once Phaser's warm-up is over.
- **Fix 2, the test.** `?renderer=canvas` (`src/main.ts`, README) forces
  the Canvas renderer in play with live time and animation.
  `live.spec.ts` loads it and checks rates, not counts: at least 45 ticks
  in the 1.5 s 1x window (30 ticks/s), a 2x rate at least 1.5 times the 1x
  rate (each over the measured elapsed time), and at least one enemy. It
  records the counts as a test annotation and in the console. The WebGL
  and walk-cycle test moved to `e2e/renderer.spec.ts`, which loads `/`
  without the flag and also checks that the tick advances, with no rate.
- **Fix 3, the automatic check.** The accumulator moved out of
  `GameScene.update()` into a pure `ticksDue(accMs, speed, cap)` in
  `src/game/loop.ts`, with `loop.test.ts`: 250 ms frames give 15 ticks at
  1x and 20 (capped from 30) at 2x, a 60 fps frame gives 1, two 25 ms
  frames give 1 then 2, and 40 slow frames sum to 600 ticks. Writing the
  test found a floating-point slip: `250 / (1000 / 60)` is
  14.999999999999998, so the old `Math.floor` gave 14 ticks for a 250 ms
  frame and carried a whole step over. `ticksDue` adds a 1e-9 tolerance.
- **Open.** Phaser's warm-up and 200 ms clamps (above) still slow a slow
  device at the start and below 5 fps. Changing the game config
  (`fps.panicMax`, `fps.minFps`) would be a further loop change, not made
  here.
- **Port collision.** While this was fixed, two worktrees ran e2e at the
  same time on port 4173, and with `reuseExistingServer` on locally one
  run could test the other checkout's build. `playwright.config.ts` now
  reads the port from `PW_PORT` (default 4173) for the server and
  `baseURL`, and never reuses a server, so a busy port fails loudly;
  `npm run demo` honours `PW_PORT` too (default 4179).

## 2026-11-21: milestone 24, targeting modes

Roles: implementer Claude Opus, verifier Claude Fable 5.1, coordinator
Claude Fable 5.1.

### Implementer notes

- **Simulation.** `TargetingMode = 'first' | 'last' | 'strongest'` and
  `TARGETING_MODES` (the cycle order) in `types.ts`; `Tower.targeting` is
  `'first'` at build, so a sell and rebuild resets it. `setTargeting(state,
  cell, mode)` in `actions.ts` returns `{ok:true}` or `{ok:false, reason:
  'no-tower' | 'game-over'}`, works in setup and wave, and emits
  `targeting {cell, mode}`. `findTarget` keeps every eligibility rule
  (range, the Mortar's minimum range, flying) and then compares with
  `preferred(mode, a, b)`: first by higher path distance, last by lower,
  strongest by higher hp then higher path distance; the lower id breaks
  any remaining tie in every mode. Splash, slow and burn follow the chosen
  target unchanged.
- **Headless.** `BuildAction` gains `{type:'target', cell, mode}` (no gold
  cost), so a `WaveScript` can carry it and `runScript` in test mode plays
  it through the scene. Every archetype pin passed unmodified (the default
  is first).
- **`comboStrongest()` (informational): lost on wave 5, 0 lives, 105
  gold** (comboBuild: won, 12 lives, 497 gold). Lives after waves 1 to 5:
  18, 14, 5, 2, 0 (comboBuild: 20, 20, 20, 17, 16). It follows COMBO_PLAN
  like comboBuild with a `target strongest` after each build. Not verified
  why it is so much worse; the likely reason is that every tower spreads
  its shots over fresh full-hp enemies instead of finishing the wounded
  front ones, so the wounded ones walk out. It lives in a new
  `INFORMATIONAL` table that `npm run sim` prints after `ARCHETYPES`, so
  the "every archetype is pinned" test stays as it was; its result is
  pinned in `targeting.test.ts` so a change shows.
- **Panel geometry.** Three stacked 156 x 42 buttons (Upgrade, Sell,
  Target) with 4 px gaps, 6 px padding and the 42 x 42 close button in a
  column to the right: the panel is 214 x 146 (was 214 x 100). The
  targeting label is `Target: <name>` from `TARGETING_LABELS` in
  `names.ts`, centred at 13 px: "Target: Strongest" is 17 Courier
  characters (about 133 px), so 16 px (163 px) would overflow the 156 px
  button and 14 px left about 6 px a side, which looked cramped in the
  frame. The placement candidate offsets did not change: the all-cells
  test in `input.test.ts` now also runs with the real 214 x 146 size
  (before, it used an old 168 x 76 box only) and passes for every
  buildable cell. For (7,5) the panel is at (133,216), below the tower;
  for (14,14) on the bottom row it is at (220,330), left and up; for (29,14) its
  buttons are inside the map and end above y 480 (Playwright).
- **Test API.** `setTargetingAt(col,row,mode)`; `uiRects()` gains
  `panel:target`; `ui()` gains `selectedTargeting` (null with no tower
  selected) and `targetLabel` (the button text, null while closed).
- **Playwright (`e2e/targeting.spec.ts`).** Musketeer at (7,5), wave 1,
  ticks found headlessly: tick 212 is the first with two goblins in range
  (ids 0 and 1 at path distance 211 and 151); first hits id 0 at tick 272;
  after one click (Last) the shot at tick 332 hits id 3 (the furthest,
  which first would take, is id 1); after a second click (Strongest) with
  every hp set to 30 the shot at tick 392 hits id 1, as first would; with
  id 1 set to 10 hp the shot at tick 452 hits id 2. A third click wraps to
  First; sell and rebuild shows `selectedTargeting: 'first'`.
- **Baseline.** `tower-selected.png` changes (third button); the setup is
  the same. Not committed: CI regenerates it.

### What went wrong

- **comboStrongest first replayed the recorded comboBuild script** with a
  target action inserted after each build. Strongest changes which enemies
  die and so the gold, and the replay refused a build it could no longer
  afford (`refused: target at (14,9), no-tower`). It is now recorded by
  playing COMBO_PLAN, like comboBuild.
- **Two exact tower-shape tests** (`actions.test.ts`, `verifier2.test.ts`)
  compare a whole `Tower` object; they gained `targeting: 'first'`.
- **A second checkout (`tarpit-m23fix`) ran Playwright at the same time**
  on the same port 4173. With `reuseExistingServer` locally, one checkout's
  tests can run against the other's build. My frame script first hit their
  server (`setTargetingAt is not a function`), and a `pkill -f "vite
  preview"` I ran to clean up may have stopped their server mid-run. Frames
  moved to port 4183 and the e2e runs waited for 4173 to be free.
