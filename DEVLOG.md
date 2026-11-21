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
