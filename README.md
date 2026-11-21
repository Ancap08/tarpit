# Tarpit

A small browser tower defense game, built by AI agents under human direction.

Status: milestone 0 (scaffold) in progress. Play link arrives when milestone 0 merges.

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

## Project layout

```
index.html               page shell, title "Tarpit"
src/main.ts              boots Phaser, exposes the game as window.__tarpit
src/game/                rendering and input (Phaser scenes)
  TitleScene.ts          title screen
  testMode.ts            isTestMode(): true when the URL has ?test=1
src/sim/                 game logic, plain TypeScript, no Phaser or DOM
  index.ts, *.test.ts    simulation code and its unit tests
e2e/                     Playwright browser tests
.github/workflows/       ci.yml (checks) and deploy.yml (GitHub Pages)
docs/SCOPE.md            v1 scope and milestones
DECISIONS.md             design and process decisions
DEVLOG.md                how it was built, including what went wrong
```
