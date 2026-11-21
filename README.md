# Tarpit

A small browser tower defense game, built by AI agents under human direction.

Status: milestone 2 (combat and economy). Title screen is live at https://ancap08.github.io/tarpit/; the game itself arrives at milestone 3.

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
src/main.ts              boots Phaser, exposes the game as window.__tarpit
src/game/                rendering and input (Phaser scenes)
  TitleScene.ts          title screen
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
e2e/                     Playwright browser tests
.github/workflows/       ci.yml (checks) and deploy.yml (GitHub Pages)
docs/SCOPE.md            v1 scope and milestones
DECISIONS.md             design and process decisions
DEVLOG.md                how it was built, including what went wrong
```
