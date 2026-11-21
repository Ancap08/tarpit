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
