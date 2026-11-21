# Tarpit: v1 scope and milestones

Approved by Kyle on 2026-11-21. Changes go through `DECISIONS.md`.

## What v1 is

A browser tower defense game, playable from a link, small enough to finish
and solid enough to show. Fantasy setting with colonial-era weapon flavor
(muskets, cannon, tar). Built for Kyle and his nieces and nephews.

## In scope

- One map, one fixed enemy path, 8 to 10 set build spots.
- 10 waves. A "start wave" button. Gold and lives.
- A preview of what the next wave contains.
- A 1x / 2x game speed toggle.
- Three towers: Musketeer (single target), Cannon (splash), Tar Pit (slow).
- Three enemies: Goblin (normal), Wolf (fast), Troll (tanky).
- One upgrade level per tower. Sell a tower for 70% of what was spent on it.
- Win screen, lose screen, restart.
- Art: simple shapes with labels. A CC0 asset pack (Kenney) is a milestone 6
  option, decided then.

## Out of scope for v1

Multiple maps, saves, sound, menus beyond start and restart, mobile layout,
multiplayer, custom art.

## Milestones

One pull request each. Each PR body lists the evidence below and links to it.

| # | Milestone | Evidence that proves it | Done |
|---|---|---|---|
| 0 | Repo scaffold: Vite, TypeScript, Phaser, ESLint, Vitest, Playwright, CI, Pages deploy, docs | CI green on the PR; Pages link renders a titled canvas | PR 1, 2026-11-21 |
| 1 | Core simulation: path, fixed-step tick, enemy movement, wave spawning, life loss | Unit tests; headless 10-wave run with no towers loses | PR 2, 2026-11-21 |
| 2 | Combat and economy: 3 towers, targeting, splash, slow, gold, build, upgrade, sell | Unit tests; headless scripted build wins | PR 3, 2026-11-21 |
| 3 | Rendering: map, enemies, towers, projectiles, HUD, start-wave button, speed toggle, wave preview | Playwright plays wave 1; first screenshot baselines | PR 5, 2026-11-21 (PR 4, the baseline workflow, was split out ahead of it) |
| 4 | Build UI: click spot, pick tower, select tower, upgrade, sell, affordability | Playwright places a tower and clears a wave; screenshots Kyle approves | PR 6, 2026-11-21 |
| 5 | Win, lose, restart, full 10-wave content | Playwright forces win and lose via test hooks; screenshots | PR 7, 2026-11-21 |
| 6 | Balance pass and visual polish | Headless sim report (no towers loses early, lazy build loses around wave 7, sound build wins); Kyle's play notes | PRs 8 and 9, 2026-11-21 |
| 7 | Ship: DEVLOG complete, README with play link and GIF, Pages verified | Kyle finishes a game from the public link | this PR, 2026-11-21 |

Milestones 1 and 2 are plain TypeScript with no Phaser. That is what makes the
tests honest and the balance pass possible.
