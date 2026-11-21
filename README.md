# Tarpit

A small browser tower defense game, built by AI agents under human direction.

Status: milestone 3 (rendering). The map, enemies, towers, shots and HUD render, and a wave can be started and watched. Building towers from the UI arrives at milestone 4. Live at https://ancap08.github.io/tarpit/ once merged and deployed.

This repo is a portfolio piece. The point is the process: a human sets the
design and approves every pull request; a coordinator agent plans and never
writes code; implementer agents write each change; a different model verifies
it before review. See `DECISIONS.md` for every design call and why, and
`DEVLOG.md` for how it was built, including what went wrong.

## Run locally

Requires Node 22 and npm.

```sh
npm install                        # install dependencies
npx playwright install chromium    # one time, for e2e tests
npm run dev                        # dev server at http://localhost:5173
```

Checks (CI runs all five):

```sh
npm run lint        # ESLint, including the src/sim boundary rule
npm run typecheck   # tsc --noEmit over src/, e2e/ and config files
npm test            # Vitest unit tests
npm run build       # production build into dist/
npm run test:e2e    # Playwright against the built dist/ (run build first)
```

Headless balance report (lives, gold and ticks after each wave for the
scripted sound and lazy builds):

```sh
npm run sim
```

## Project layout

```
index.html               page shell, title "Tarpit"
src/main.ts              boots Phaser (canvas renderer), sets window.__tarpit
src/game/                rendering and input (Phaser), imports src/sim only
  TitleScene.ts          title screen; click, Space or Enter starts the game
  GameScene.ts           runs the sim at 60 ticks/s (1x or 2x) and redraws
  hud.ts                 gold, lives, wave, next-wave preview, buttons
  palette.ts             every colour and the font stack
  draw/map.ts            grass, path, spawn cave, exit cottage, build spots
  draw/enemies.ts        enemy circles, hp bars, tar rings
  draw/towers.ts         tower shapes, barrels, upgrade ring
  draw/shots.ts          fading tracers, cannon splash, tar splat
  testMode.ts            ?test=1: frozen time and window.__tarpit test hooks
  testGlobal.d.ts        type of window.__tarpit
src/sim/                 game logic, plain TypeScript, no Phaser or DOM
  index.ts               public barrel; src/game imports from here
  types.ts               GameState, Enemy, WaveDef and other data shapes
  map.ts                 path, build spots, pathLength, positionAlongPath
  enemies.ts             enemy stat table
  waves.ts               10-wave table and nextWavePreview
  towers.ts              tower stat tables (base and upgraded), sellRefund
  time.ts                TICKS_PER_SECOND and secondsToTicks
  combat.ts              tower fire: targeting, damage, splash, slow, kills
  actions.ts             buildTower, upgradeTower, sellTower
  game.ts                createGame, startWave, tick (60 ticks/s)
  headless.ts            scripted runner, playScripted, soundBuild, lazyBuild
  *.test.ts              unit tests next to each module
scripts/simulate.ts      npm run sim: per-wave headless report
e2e/                     Playwright browser tests (960x540 viewport)
  smoke.spec.ts          Phaser boots
  play-wave.spec.ts      plays wave 1 through the real buttons
  live.spec.ts           non-test mode: the real loop ticks, 2x runs faster
  visual.spec.ts         screenshot checks on frozen frames
  __screenshots__/       baselines, generated on CI only
.github/workflows/       ci.yml (checks), deploy.yml (GitHub Pages),
                         update-snapshots.yml (screenshot baselines)
docs/SCOPE.md            v1 scope and milestones
DECISIONS.md             design and process decisions
DEVLOG.md                how it was built, including what went wrong
```

## Test mode

Open the game with `?test=1` (for example
`http://localhost:4173/?test=1`) and time stops: nothing moves unless a test
calls `window.__tarpit.step(n)`. `window.__tarpit` then also has `state()`,
`startGame()`, `startWave()`, `build()`, `upgrade()`, `sell()`, `setSpeed()`,
`speed()`, `uiRects()` and `hudText()`; see `src/game/testGlobal.d.ts`.
Without `?test=1`, `window.__tarpit` holds only `game`.

## Screenshot baselines

`e2e/visual.spec.ts` compares three frozen frames (title, map at wave 0,
mid wave 1) with PNG baselines in `e2e/__screenshots__/`. Text renders
differently on macOS and Linux, so:

- Baselines are generated on CI (Linux) only. Local `npm run test:e2e` skips
  the pixel comparison (`ignoreSnapshots` when `CI` is unset); the visual
  tests still run their setup and pass.
- To create or refresh baselines, run the **Update screenshot baselines**
  workflow (Actions tab, or
  `gh workflow run update-snapshots.yml -f ref=<branch>`). It regenerates the
  PNGs on Linux and commits any changes back to that branch.
- On CI a missing baseline fails the check; it is never written silently.
  When a check fails, the `test-results` artifact holds the expected, actual
  and diff images.
- Kyle approves every new or changed baseline PNG in the pull request.
