# Tarpit: rules for agents working in this repo

Read `docs/SCOPE.md` and `DECISIONS.md` before changing anything.

- Game logic lives in `src/sim` and imports nothing from Phaser or the DOM.
  Rendering and input live in `src/game`. ESLint enforces the boundary.
- The simulation is deterministic: fixed-step ticks and no randomness in v1.
  Tests assert exact values.
- Never add a feature that is not in `docs/SCOPE.md`. If something seems
  missing, say so in the PR and stop.
- Every PR body lists the evidence that proves the milestone is done, as
  written in the milestone table.
- Record design or process decisions in `DECISIONS.md` with who decided and
  why. Record what went wrong in `DEVLOG.md`. Prefer a lint rule or test over
  a new paragraph of rules.
- Checks that must pass: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build`, `npm run test:e2e`.
- Commits end with a `Co-Authored-By` line naming the agent model that wrote
  the change.
