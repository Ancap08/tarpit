# Decisions

Every design and process decision, newest at the bottom. Each entry says what
was decided, who decided, and why. "Default" means an agent picked it and Kyle
can change it; "Kyle" means Kyle decided.

## 2026-11-21

- **Platform: browser game on GitHub Pages.** Kyle. Playable from a link, no
  install, fits a portfolio.
- **Stack: TypeScript, Phaser 3, Vite, Vitest, Playwright, ESLint.** Kyle
  (from the brief). Phaser 3, not Phaser 4: Phaser 3 has far more examples and
  documentation for agents to work from; 4 is new. Revisit if 3 blocks us.
- **Game logic is plain TypeScript in `src/sim`, separate from Phaser
  rendering in `src/game`.** Kyle (from the brief). Lets waves, damage, gold
  and targeting be unit tested and simulated headlessly for balance. An ESLint
  rule forbids importing Phaser from `src/sim`.
- **Theme: fantasy with colonial-era weapon flavor.** Kyle. The game is for
  Kyle and his nieces and nephews. A security theme was considered and
  rejected for this project.
- **Name: Tarpit.** Default (Fable). Short, memorable, and names the slow
  tower. Kyle accepted "for now".
- **Towers: Musketeer (single target), Cannon (splash), Tar Pit (slow).
  Enemies: Goblin (normal), Wolf (fast), Troll (tanky).** Default (Fable).
  Plain names a kid can read on a label.
- **Speed toggle (1x/2x) and next-wave preview are in v1.** Kyle. Both are
  cheap and change how the game feels to play.
- **Art: simple shapes with labels in v1.** Default (Fable). Fewer moving
  parts for milestones 3 to 5, and deterministic screenshots. A Kenney CC0
  pack is a milestone 6 option.
- **Screenshot checks run on frozen frames only.** Default (Fable). Seeded
  random numbers, a fixed-step simulation, and a `?test=1` flag that pauses
  time. Baselines for title, map at wave 0, win and lose. Kyle approves every
  new baseline. Live animation would make pixel diffs flaky.
- **Process: a coordinator plans and never writes game code. Implementer
  agents write each change. A different model verifies it before Kyle
  reviews. Every PR body lists its evidence.** Kyle (from the brief).
- **Every repeated bug or agent slip becomes an automatic check** (lint rule
  or test), not more documentation. Kyle (from the brief).
- **Sell price: 70% of total spent on the tower.** Default (Fable). Standard
  tower defense feel; tune in milestone 6.
- **License: MIT.** Default (Fable). Portfolio code should be easy to reuse.
- **Package manager: npm with a committed lockfile.** Default (Fable). Already
  on the machine; nothing to install.
- **TypeScript pinned to 6.0.x.** Default (Opus implementer, accepted by
  Fable). TypeScript 7 is current, but typescript-eslint 8.73 supports only
  TypeScript below 6.1. Move to 7 once typescript-eslint supports it.
- **The `?test=1` hook arrives in milestone 3, not before.** Fable, on the
  verifier's finding. The implementer added an unused `testMode.ts`; it was
  removed. Code lands in the milestone that uses it.

## 2026-11-21, after milestone 0

- **During this build run, the coordinator merges each milestone PR once the
  `ci` check and the verifier pass. Kyle reviews screenshots and play feel at
  the milestone 5 checkpoint and can reopen anything.** Kyle ("you're good to
  continue on, continue building past step 5 or until you need me").
- **Implementers run on Claude Opus at medium effort; verifiers stay on a
  different model (Claude Sonnet).** Kyle chose Opus medium; the different
  model rule is from the brief.
- **No randomness in the v1 simulation.** Fable. The design needs none, and
  exact-value tests are stronger than seeded ones. CLAUDE.md corrected; it
  had said "seeded random numbers".
- **Tick order: move, exit and life loss, spawn, counters, wave-clear check.
  An enemy spawns at distance 0 on the first tick after Start Wave and does
  not move on its spawn tick. Spawn ticks are `round(seconds * 60)`.**
  Default (Opus implementer, accepted by Fable after Sonnet re-derived the
  numbers by hand). Written in the header of `src/sim/game.ts`.
- **The 25 gold wave-clear bonus is paid on wave 10 too.** Default. Harmless
  and simpler than a special case.
- **Game state is mutated in place; `tick` returns nothing.** Default (Opus).
  Fine for a small game; the renderer reads the one state object.
