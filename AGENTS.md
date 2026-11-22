# Tarpit: rules for Codex agents

You are an implementer on this repo. A coordinator (Claude) writes the
brief and merges; a different model verifies your work afterwards. Kyle
owns the project. `CLAUDE.md` holds the same rules for Claude agents; read
it too.

## Before you change anything

Read `CLAUDE.md`, the scope section named in your brief (`docs/SCOPE-v5.md`),
`docs/DESIGN.md` (the frozen spec of every number and rule) and the last two
sections of `DECISIONS.md`. Then read only the code your brief points at.

## Hard rules

- Build only what the brief and its scope section list. If something seems
  missing, say so in your report and stop short of inventing it.
- Game logic lives in `src/sim`: deterministic, fixed 60 Hz ticks, no
  randomness, no Phaser or DOM imports (ESLint enforces it). Rendering,
  input and sound live in `src/game`. Every display string comes from
  `src/game/names.ts`.
- Do not edit `DECISIONS.md`, `docs/SCOPE*.md`, `CLAUDE.md` or this file.
- Do not push, open a pull request, comment on GitHub, change repository
  settings, add a dependency, or commit screenshot baseline PNGs
  (`e2e/__screenshots__`; CI generates them).
- Stay inside this repository. Scratch output goes in a temporary folder
  outside it, never committed.
- A changed number or rule must be changed in `docs/DESIGN.md` too;
  `src/sim/designSpec.test.ts` compares its tables with the code.

## Checks (all must pass at your last commit)

    npm run lint
    npm run check:assets
    npm run typecheck
    npm test
    npm run build
    npm run check:size
    npm run sim
    PW_PORT=4173 npm run test:e2e

Use `PW_PORT=4173` for every Playwright run and kill nothing on other
ports. Browser specs that click a title button use `waitForTitle`
(`e2e/title.ts`) and the `cellToPage` hook; phone specs end
`-phone.spec.ts`, tablet specs `-touch.spec.ts`. If your sandbox cannot run
a check (for example the browser tests), say exactly which and why; never
report a check you did not run as passing.

## Commits

Commit in coherent steps on the branch you were given. End every commit
message with a trailer naming the model that wrote the change, for example:

    Co-Authored-By: Codex gpt-6.2-astra <noreply@openai.com>

Leave the working tree clean. If you cannot commit, leave the changes in
the tree and say so.

## Delegating

You may split work across subagents. The lead agent plans, integrates and
checks; subagents do bounded pieces. One writer per set of files at a time.
Treat a subagent's output as a claim: run the tests yourself before you
build on it. Subagents follow every rule here.

## Your final report

Lead with whether every target in the brief is met, and list any miss. Then:
commits; which checks you ran and their counts; every number you changed,
before and after, with the reason; anything not done; anything in the code
or records that contradicts the brief; decisions the coordinator or Kyle
should make. Plain sentences, no praise, no padding. Label anything you did
not verify.
