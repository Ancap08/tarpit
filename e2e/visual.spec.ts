import { expect, test, type Page } from '@playwright/test';
import { BOSS_NAME, PANEL_TEXT, bestScoreText } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TowerType } from '../src/sim/types';
import type { TitleUiState } from '../src/game/TitleScene';
import { MAPS, positionAlongPath } from '../src/sim/map';
import { SPECIAL_DEFS } from '../src/sim/specials';

// Milestone 25b frames (see the special tests below).
// Milestone 25c (second pass): recomputed headlessly on the longer waves.
const AIM_EXPECT = {
  wave: 4,
  aim: { x: 160, y: 191 },
  enemies: 9,
  inside: ['goblin 3', 'goblin 4', 'harpy 5', 'goblin 6', 'harpy 7', 'goblin 8'],
};
// Milestone 30: the zone frames on wave 7 at step 900, both aimed at (160,132) on the first climb.
const TAR_ZONE_EXPECT = {
  at: { x: 160, y: 132 },
  hits: 7,
  zones: ['tarBarrel 420'],
  slowed: 8,
  burning: 0,
  labels: ['7 hit'],
  rechargeTicks: 1140,
  hud: 'Wait 19s',
};
const FIRE_ZONE_EXPECT = {
  at: { x: 160, y: 132 },
  hits: 6,
  zones: ['fireArrows 420'],
  slowed: 0,
  burning: 6,
  labels: ['6 hit'],
  rechargeTicks: 1140,
  hud: 'Wait 19s',
};
// Milestone 30 (keg 30 damage, 90 px): the keg at (160,191) hits 7 and kills the 4 Goblins.
const FIRED_EXPECT = {
  aim: { x: 160, y: 191 },
  ok: true,
  hits: 7,
  kills: 4,
  before: 15,
  after: 11,
  hurt: ['goblin 5 11', 'troll 13 920', 'harpy 14 6', 'harpy 16 6'],
  charges: 0,
  labels: ['7 hit'],
};

// Screenshot checks on frozen frames (?test=1: no time passes unless the
// test steps it). Baselines are generated on CI; local runs ignore them
// (ignoreSnapshots in playwright.config.ts).

async function open(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  // Let the first frame paint (and web fonts settle) before capturing.
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => r(null)))));
}

/** Wait two animation frames so the canvas shows the latest redraw. */
const settle = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));

test('title', async ({ page }) => {
  await open(page);
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('title.png');
});

// Milestone 25: the title menu with Hard selected (Right once from Normal's
// default, by keyboard so no button shows a hover tint).
test('title with Hard selected', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ArrowRight');
  expect((await page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>())).difficulty).toBe('hard');
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('title-hard.png');
});

test('map at wave 0', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('map-wave0.png');
});

// 848 ticks into wave 1 the Cannon at cell (15,9) (legacy spot 6) fired 3
// ticks ago (its first shot, at tick 845), so its tracer and splash circle are mid-fade; five
// goblins are out and four are hurt. With these spots no single frame shows
// two shot types: the Musketeer at (7,5) fires every 60 ticks (392, 452,
// ...) with a 6-tick tracer, and the base Tar Pit first fires at tick 1404.
// Tick 855 was chosen by the coordinator over 395 (Musketeer tracer only)
// because the splash and hp bars cover more of the renderer; milestone 8
// moved spot 6 to the centre of cell (15,9), so the Cannon's first shot came
// 7 ticks earlier and the same frame is now tick 848 (headless run).
// Milestone 25c second pass: wave 1 Goblins have 19 hp (two Musketeer
// shots) and come every 1.2 s. A headless scan for a Cannon or Tar Pit
// effect 1 to 3 ticks old with at least 2 hurt Goblins found the Cannon's
// first shot at 1157; tick 1160 shows its splash 3 ticks into its fade, as
// the original frame did, with 10 Goblins out and 4 hurt.
// Milestone 28 follow-up: wave 1's Goblins come every 2.5 s and the
// Musketeer alone clears them, so the frame plays wave 2 (state.wave = 1,
// then Start Wave; the verifier's proposal). Tick 1904: 15 Goblins out, 10
// hurt, 2 tarred, the Cannon's splash 3 ticks into its fade, the Tar Pit's
// shot 2 ticks old, no shot on this tick (src/sim/midwave-frame.test.ts).
// Milestone 30 (Cannon range 105): tick 1880, the first again with the
// splash 3 ticks into its fade: 16 Goblins out, 10 hurt, 2 tarred.
const MID_WAVE_STEPS = 1880;

test('mid wave 2 with three towers', async ({ page }) => {
  await open(page);
  const counts = await page.evaluate(async (steps) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.state().gold = 1000; // test setup: afford all three towers
    t.state().wave = 1; // test setup: the next Start Wave plays wave 2
    t.buildAt(7, 5, 'musketeer'); // legacy spot 2
    t.buildAt(15, 9, 'cannon'); // legacy spot 6
    t.buildAt(18, 9, 'tarpit'); // legacy spot 7
    t.startWave();
    t.step(steps);
    const s = t.state();
    return {
      wave: s.wave,
      enemies: s.enemies.length,
      hurt: s.enemies.filter((e) => e.hp < 23).length,
      tarred: s.enemies.filter((e) => e.slowTicksLeft > 0).length,
      shotsThisTick: s.shots.length,
    };
  }, MID_WAVE_STEPS);
  expect(counts).toEqual({ wave: 2, enemies: 16, hurt: 10, tarred: 2, shotsThisTick: 0 });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('mid-wave.png');
});

// Every enemy type with their hp bars, for Wolf, Troll and (milestone 22)
// Shieldbearer and Harpy coverage. Wave 8 is the only wave with Goblins,
// Wolves and Trolls together (and has both new types), so the
// test jumps there (state.wave = 7, then Start Wave) with 1000 gold and a
// Musketeer at cell (7,5), Cannon at (10,5), Tar Pit at (18,9) and Musketeer
// at (23,8) (the former legacy spots 2, 4, 7 and 9). Tick 1350 was picked
// from a headless scan of every 30th tick (milestone 8; it was 1200 with the v1 spots): 10 Goblins,
// 3 Wolves and 7 Trolls are out (4 before milestone 12 made wave 8 heavier;
// rechecked in milestone 12), 3 Trolls are hurt (green bars), 7 Goblins
// are under 25% (red bars), 4 enemies carry the tar ring, and no two enemies
// are closer than 21 px, so each shape and bar reads on its own. At 1200 two
// enemies were 10 px apart; from 1230 to 1320 some overlap; later ticks lose
// the Wolves. Milestone 22 added a Shieldbearer group and a Harpy group to
// wave 8; the tick stays, the old counts are unchanged, and the frame now
// also has 3 Shieldbearers and 4 Harpies (rechecked headlessly). The closest
// pair is now 7 px apart; the Harpies fly 16 px above the path, over the
// walkers, so each sprite still reads.
// Milestone 25c (horde): wave 8 has 106 enemies, so with these four towers
// the map holds 60 or more and some sprites overlap at every tick. A
// headless scan of every 30th tick for all five types, at least 3 hurt
// Trolls and some tar rings picked tick 1560: 22 Goblins, 10 Wolves, 10
// Trolls (3 hurt), 6 Shieldbearers and 14 Harpies, 3 slowed, 15 enemies
// hurt in all. Second pass (longer, sparser waves): the same scan picked
// tick 1680: 11 Goblins, 7 Wolves, 5 Trolls (2 hurt), 4 Shieldbearers and
// 13 Harpies, 3 slowed, 40 on the map, closest pair 8.5 px apart.
// Milestone 30 (the special policy): at the same tick 9 Goblins, 8 Wolves,
// 5 Trolls (2 hurt), 4 Shieldbearers, 13 Harpies, 2 slowed.
const ENEMIES_STEPS = 1680;

test('wave 8 with all five enemy types', async ({ page }) => {
  await open(page);
  const counts = await page.evaluate(async (steps) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const s = t.state();
    s.gold = 1000; // test setup: afford four towers
    s.wave = 7; // test setup: the next Start Wave plays wave 8
    t.buildAt(7, 5, 'musketeer'); // legacy spot 2
    t.buildAt(10, 5, 'cannon'); // legacy spot 4
    t.buildAt(18, 9, 'tarpit'); // legacy spot 7
    t.buildAt(23, 8, 'musketeer'); // legacy spot 9
    t.startWave();
    t.step(steps);
    const e = t.state().enemies;
    const of = (type: string) => e.filter((x) => x.type === type);
    return {
      wave: t.state().wave,
      goblins: of('goblin').length,
      wolves: of('wolf').length,
      trolls: of('troll').length,
      hurtTrolls: of('troll').filter((x) => x.hp < 950).length, // Troll max hp is 950 (milestone 28)
      slowed: e.filter((x) => x.slowTicksLeft > 0).length,
      shieldbearers: of('shieldbearer').length,
      harpies: of('harpy').length,
    };
  }, ENEMIES_STEPS);
  expect(counts).toEqual({ wave: 8, goblins: 9, wolves: 8, trolls: 5, hurtTrolls: 2, slowed: 2, shieldbearers: 4, harpies: 13 });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('enemies.png');
});

/** Click the centre of a named rectangle from uiRects(). */
async function click(page: Page, name: string): Promise<void> {
  const r = await page.evaluate((n) => (window.__tarpit as TarpitTestApi).uiRects()[n], name);
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

const ui = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).ui());

// Placing a Cannon: cell (14,8), centre (464,272), is 44 px right of the long
// vertical run at x 420, so the green cell, the ghost and its 90 px range
// circle reaching over the path all show.
test('placing a Cannon: green cell, ghost and range', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await click(page, 'bar:cannon');
  await page.mouse.move(464, 272);
  expect(await ui(page)).toMatchObject({ pick: 'cannon', hoverCell: { col: 14, row: 8 }, panelOpen: false });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('placing.png');
});

// The same pick over path cell (13,8): a red cell and no ghost or range.
test('placing a Cannon over the path: red cell, no ghost', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await click(page, 'bar:cannon');
  await page.mouse.move(432, 272);
  expect(await ui(page)).toMatchObject({ pick: 'cannon', hoverCell: { col: 13, row: 8 }, panelOpen: false });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('placing-invalid.png');
});

// Milestone 24: the panel has a third button, "Target: First", so this
// baseline changed; the setup is the same. Milestone 25a: the tower was
// built and upgraded in setup, so it is unlocked (dashed outline) and the
// panel reads "Undo upgrade  +35" and "Remove  +85"; same setup again.
test('upgraded Musketeer selected with its panel and range', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await click(page, 'bar:musketeer');
  await page.mouse.click(240, 176); // cell (7,5)
  await page.keyboard.press('Escape');
  await page.mouse.click(240, 176);
  await click(page, 'panel:upgrade');
  // Park the pointer on empty grass so no hover tint shows.
  await page.mouse.move(900, 440);
  const s = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    return { ui: t.ui(), towers: t.state().towers, gold: t.state().gold };
  });
  expect(s.ui).toMatchObject({ pick: null, selectedCell: { col: 7, row: 5 }, panelOpen: true });
  expect(s.towers).toEqual([expect.objectContaining({ cell: { col: 7, row: 5 }, type: 'musketeer', upgraded: true })]);
  expect(s.gold).toBe(15);
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('tower-selected.png');
});

// Milestone 25a: the planning phase before wave 2. A Musketeer at (7,5)
// built before wave 1 is locked (no outline); a Cannon at (10,5) just placed
// in this setup is unlocked (pale dashed outline) and selected with a real
// click, so its panel reads "Remove  +80", the full refund. Wave 1 with one
// Musketeer ends with 115 gold (milestone 28: it kills all 20 Goblins), enough for the Cannon.
test('planning phase: a locked Musketeer and an unlocked Cannon selected', async ({ page }) => {
  await open(page);
  const s = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.buildAt(7, 5, 'musketeer');
    t.startWave();
    for (let i = 0; i < 100 && t.state().phase === 'wave'; i++) t.step(60);
    t.buildAt(10, 5, 'cannon');
    const st = t.state();
    return { phase: st.phase, wave: st.wave, gold: st.gold, towers: st.towers.map((x) => ({ type: x.type, locked: x.locked })) };
  });
  expect(s).toEqual({
    phase: 'setup',
    wave: 1,
    gold: 35,
    towers: [
      { type: 'musketeer', locked: true },
      { type: 'cannon', locked: false },
    ],
  });
  await page.mouse.click(10 * 32 + 16, 5 * 32 + 16); // select the Cannon
  await page.mouse.move(900, 440); // empty grass: no hover tint
  const u = await ui(page);
  expect(u).toMatchObject({ pick: null, selectedCell: { col: 10, row: 5 }, panelOpen: true, sellLabel: `${PANEL_TEXT.remove}  +80` });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('planning.png');
});

// The three v2 towers, all upgraded, with a Tar Pit: Longbow (6,5), Mortar
// (17,6), Fire Pot (14,8), Tar Pit (14,6), in wave 5 (state.wave = 4, then
// Start Wave). The Mortar is selected with a real click so its 220 range and
// dashed 70 minimum-range circles show. A headless scan of every tick found
// a Mortar effect on screen together with a slowed and burning enemy only at
// ticks 1572..1583, 1752..1763 and 1932..1943 (the Goblins die before
// reaching the Mortar's ring; only the two Trolls are left), and both
// Trolls slowed and burning only in the first two. Tick 1754: the Mortar
// fired at tick 1752 (splash 2 ticks into its 12-tick fade), both Trolls
// carry the tar and burn rings and are 11 px apart on the downhill run (at
// 1572 they overlap exactly), and Troll 3 is at 201 of 700 hp (milestone
// 12; it was at 1 of 500 hp before).
// Milestone 22: wave 5's three Harpies take the Longbow's shots, the Goblins
// live longer and the Mortar now fires at 1488, 1668, 1848 (none at 1752),
// so tick 1754 lost its splash. A new scan for the same picture (a Mortar
// effect on screen with both Trolls slowed and burning) found 1488..1499 and
// 1668..1673; at 1668 the Trolls overlap exactly. Tick 1490: the Mortar fired
// at 1488 (2 ticks into its fade, as before), both Trolls carry the tar and
// burn rings, 10 px apart (Troll 3 at 417 of 700 hp), and Harpy 16, hurt,
// flies near the cottage.
// Milestone 25c: the Mortar fires at 1386, 1566, 1746; a scan for a Mortar
// splash 2 ticks old with an enemy slowed and burning found 1568 (two
// Trolls and five Harpies, overlapping) and 1748: the two Trolls left, 10
// px apart, Troll 12 slowed and burning at 98 of 500 hp, Troll 5 at 61.
// Both slowed and burning together no longer happens with a splash on screen.
// Second pass: the Mortar fires at 1836, 2016, 2196; tick 2198 has its
// splash 2 ticks old, Troll 13 slowed and burning (375 of 900 hp), two more
// Trolls and 10 Goblins (3 hurt) behind, no Harpy. Milestone 28 (Goblin 23,
// Troll 950): the same tick and enemies, Troll 13 at 425 of 950 hp.
const MORTAR_FIRE_TICK = 2196;
const NEW_TOWERS_STEPS = 2198;

test('new towers upgraded, Mortar selected, splash and burning tarred Trolls', async ({ page }) => {
  await open(page);
  const counts = await page.evaluate(
    async ({ fire, steps }) => {
      const t = window.__tarpit as TarpitTestApi;
      await t.startGame();
      const s = t.state();
      s.gold = 5000; // test setup: afford four towers and their upgrades
      s.wave = 4; // test setup: the next Start Wave plays wave 5
      const cells = [
        [6, 5, 'longbow'],
        [17, 6, 'mortar'],
        [14, 8, 'firepot'],
        [14, 6, 'tarpit'],
      ] as const;
      for (const [col, row, type] of cells) {
        t.buildAt(col, row, type);
        t.upgradeAt(col, row);
      }
      t.startWave();
      t.step(fire);
      const mortarShots = t.state().shots.filter((x) => x.tower === 'mortar').length;
      t.step(steps - fire);
      const e = t.state().enemies;
      return {
        wave: t.state().wave,
        upgraded: t.state().towers.filter((x) => x.upgraded).length,
        mortarShots,
        enemies: e.length,
        slowedAndBurning: e.filter((x) => x.slowTicksLeft > 0 && (x.burnTicksLeft ?? 0) > 0).length,
        harpies: e.filter((x) => x.type === 'harpy').length,
      };
    },
    { fire: MORTAR_FIRE_TICK, steps: NEW_TOWERS_STEPS },
  );
  expect(counts).toEqual({ wave: 5, upgraded: 4, mortarShots: 1, enemies: 13, slowedAndBurning: 1, harpies: 0 });
  await page.mouse.click(17 * 32 + 16, 6 * 32 + 16); // select the Mortar
  await page.mouse.move(900, 440); // empty grass: no hover tint
  expect(await ui(page)).toMatchObject({ pick: null, selectedCell: { col: 17, row: 6 }, panelOpen: true });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('new-towers.png');
});

// Milestone 22: Harpies over the path in wave 4 (state.wave = 3, then Start
// Wave) with a Cannon at (7,4) and a Musketeer at (2,3). Picked by a
// headless scan of every Musketeer cell against the 8 Cannon cells that
// cover at least 200 px of the first 700 px of path, for a tick where the
// Musketeer's tracer on a Harpy (1 to 3 ticks old) and the Cannon's splash
// (1 to 4 ticks old) are both on screen, a Harpy is inside the Cannon's
// range, and no two drawn sprites (Harpies 16 px up) are closer than 18 px.
// The first scan, with the Cannon at (7,7) as in new-enemies.spec.ts,
// only matched at ticks where a Harpy hid the Cannon's target. Tick 471: the
// Musketeer shot Harpy 10 at tick 468 (tracer 3 ticks into its 6); the
// Cannon shot Wolf 9 at tick 469 (splash 2 ticks into its 10), and Harpy 7,
// 19 px from Wolf 9 inside the splash, keeps its 28 hp. Harpies 7 and 10
// are inside the Cannon's 90 px range. 4 Harpies and 7 Wolves are out.
// Milestone 25c: wave 4 sends its 10 Harpies first and the Wolves from 3 s.
// The same scan (the 8 Cannon cells against every Musketeer cell covering
// 150 px of the first 700, plus a Harpy within 40 px of the Cannon's shot)
// kept the Cannon at (7,4) and moved the Musketeer to (6,1). Tick 291: the
// Cannon shot Wolf 4 at 289 (splash 2 ticks into its fade) with a Harpy
// inside the splash untouched; the Musketeer shot Harpy 1 at 290 (12 of 22
// hp, tracer 1 tick old); Harpies 1, 2 and 3 are inside the Cannon's range;
// 6 Harpies and 3 Wolves are out, no two sprites closer than 20 px.
// Second pass (wave 4 is 10 Harpies, then Goblins): the same scan found the
// Cannon at (2,5) and the Musketeer at (3,5). Tick 199: the Musketeer shot
// Harpy 1 at 197 (24 of 36 hp, tracer 2 ticks old); the Cannon killed
// Goblin 3 at 198 with Harpy 2 inside the splash, untouched and inside the
// Cannon's range. Only the two Harpies are on the map.
// Milestone 30 (Cannon range 105): the Cannon fires earlier, at 182 and
// 302; step 304 shows its splash on Goblin 4 2 ticks old with Harpy 2
// whole inside it, and Harpy 1 at 12 of 36 from the Musketeer's shots at
// 197 and 257.
const HARPIES_STEPS = 304;

test('wave 4 Harpies: a Cannon splash ignores one, a Musketeer shoots one', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async (steps) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const s = t.state();
    s.gold = 1000; // test setup: afford both towers
    s.wave = 3; // test setup: the next Start Wave plays wave 4
    t.buildAt(2, 5, 'cannon');
    t.buildAt(3, 5, 'musketeer');
    t.startWave();
    const typeOf = new Map<number, string>();
    const shots: string[] = [];
    for (let i = 1; i <= steps; i++) {
      t.step(1);
      for (const e of t.events()) if (e.kind === 'spawn') typeOf.set(e.enemyId, e.enemyType);
      for (const x of t.state().shots) if (i >= 196) shots.push(`${i} ${x.tower} ${typeOf.get(x.targetId)} ${x.targetId}`);
    }
    const e = t.state().enemies;
    const harpies = e.filter((x) => x.type === 'harpy');
    return {
      wave: t.state().wave,
      shots,
      harpies: harpies.map((x) => ({ id: x.id, hp: x.hp })),
      wolves: e.filter((x) => x.type === 'wolf').length,
      textures: harpies.map((x) => t.animState(x.id)?.texture),
    };
  }, HARPIES_STEPS);
  expect(r).toEqual({
    wave: 4,
    shots: ['197 musketeer harpy 1', '257 musketeer harpy 1', '302 cannon goblin 4'],
    harpies: [
      { id: 1, hp: 12 },
      { id: 2, hp: 36 },
      { id: 5, hp: 36 },
    ],
    wolves: 0,
    textures: ['harpy', 'harpy', 'harpy'],
  });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('harpies.png');
});

// Milestone 23: Grumblefoot in wave 10 with the combo build (runScript up
// to wave 10, then Start Wave). A headless scan of every wave 10 tick for
// the boss burning, his bar between 30% and 90%, and a Mortar splash on him
// 1 to 4 ticks old found pairs of Mortar volleys every 180 ticks from step
// 3021 on; he is alone on the map by then (the rest of the wave is dead).
// Step 3562: he is on the downhill run at (420,241), tarred and burning,
// 2374 of 4000 hp on the bar, a Mortar splash on him 2 ticks into its
// fade (fired on step 3560) and no shot hit him on this tick, so his walk frame shows,
// not the hit flash.
// Milestone 25c: runScript now fires the combo's cluster specials in waves
// 1 to 9 (wave 10 is stepped by hand, so his wave has none). The same scan
// found Mortar hits on him from step 2838; step 3230: alone on the downhill
// run at (420,152), tarred and burning, 2488 of 4000 hp, Mortar splash
// fired on step 3228, no hit on this step. Second pass (he comes at 65 s):
// step 5664, alone on the downhill run at (420,196), tarred and burning,
// 2429 of 4000 hp, Mortar splash fired on step 5662, no hit on this step.
// Milestone 28 (the stored special list in waves 1 to 9): the first wave 10
// step that meets the same rules, 5361: alone near the top of the downhill
// run at (420,111), tarred and burning, 3339 of 4000 hp, Mortar splash fired
// on step 5359, no hit on this step (src/sim/boss-frame.test.ts pins it).
// Milestone 30 (the special policy): the same step still meets the rules,
// at (420,108) with 3331 hp.
const BOSS_STEPS = 5361;

test('wave 10: Grumblefoot with his bar, burning and tarred under a Mortar splash', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async (steps) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.runScript('comboBuild', 10);
    t.startWave();
    t.step(steps - 2);
    const mortarHitOnBoss = t.events().filter((e) => e.kind === 'hit' && e.tower === 'mortar').length;
    t.step(2);
    const e = t.state().enemies;
    const boss = e.find((x) => x.type === 'boss');
    return {
      wave: t.state().wave,
      enemies: e.length,
      burning: (boss?.burnTicksLeft ?? 0) > 0,
      slowed: (boss?.slowTicksLeft ?? 0) > 0,
      hitNow: t.events().some((x) => x.kind === 'hit' && x.enemyId === boss?.id),
      mortarHitOnBoss,
      bar: t.hudText().boss,
      texture: boss ? t.animState(boss.id)?.texture : null,
    };
  }, BOSS_STEPS);
  expect(r).toEqual({
    wave: 10,
    enemies: 1,
    burning: true,
    slowed: true,
    hitNow: false,
    mortarHitOnBoss: 1,
    bar: `${BOSS_NAME} 3331 / 4000`,
    texture: 'boss',
  });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('boss.png');
});

// Milestone 25b: aiming a Tar Barrel. Wave 4 (state.wave = 3, then Start
// Wave) with the mid-wave frame's towers: Musketeer (7,5), Cannon (15,9),
// Tar Pit (18,9). At step 420 a cluster of Wolves and Harpies is on the top
// run (path distances 262 to 406); the pointer sits on Harpy 7 at
// (197,96) and the 90 px circle covers 2 Harpies and 3 Wolves. The Special
// button opened its popup and Tar Barrel was picked, so the popup is closed
// and the button shows picked.
// Milestone 25c: same step, rescanned (every 30th step, the enemy whose
// position covers the most enemies within 90 px): the pointer sits on Wolf
// 11 at (160,162) on the first climb and the circle covers 4 Harpies and 5
// Wolves of the 14 out. Second pass: step 450, the pointer on Goblin 4 at
// (160,191); the circle covers 4 Goblins and 2 Harpies of the 9 out.
// Milestone 30: the 100 px Tar Barrel circle covers the same six.
const AIM_STEPS = 450;
const AIM_TARGET_ID = 4;

test('special aim: Tar Barrel circle over a cluster on wave 4', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(
    async ({ steps, id }) => {
      const t = window.__tarpit as TarpitTestApi;
      await t.startGame();
      const s = t.state();
      s.gold = 1000; // test setup: afford all three towers
      s.wave = 3; // test setup: the next Start Wave plays wave 4
      t.buildAt(7, 5, 'musketeer');
      t.buildAt(15, 9, 'cannon');
      t.buildAt(18, 9, 'tarpit');
      t.startWave();
      t.step(steps);
      return { wave: t.state().wave, enemies: t.state().enemies, target: t.state().enemies.find((e) => e.id === id)?.distance };
    },
    { steps: AIM_STEPS, id: AIM_TARGET_ID },
  );
  const at = positionAlongPath(MAPS.meadow, r.target!);
  const aim = { x: Math.round(at.x), y: Math.round(at.y) };
  const inside = r.enemies.filter((e) => {
    const p = positionAlongPath(MAPS.meadow, e.distance);
    return Math.hypot(p.x - aim.x, p.y - aim.y) <= 100; // milestone 30: the Tar Barrel's radius (90 before)
  });
  expect({ wave: r.wave, aim, enemies: r.enemies.length, inside: inside.map((e) => `${e.type} ${e.id}`) }).toEqual(AIM_EXPECT);
  await click(page, 'special');
  await click(page, 'special:tarBarrel');
  await page.mouse.move(aim.x, aim.y);
  const u = await ui(page);
  expect(u.special).toMatchObject({ charges: 1, aiming: 'tarBarrel', unlocked: ['keg', 'tarBarrel'], menuOpen: false, aimPoint: aim, ready: true });
  // Milestone 30: the banner says what to do.
  expect(u.special.banner).toEqual({ main: 'Click the trail to drop the Tar Barrel', hint: 'Esc or Special again cancels.' });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('special-aim.png');
});

// Milestone 25b: the tick after a Powder Keg in test mode, where effects are
// instant (no flash): wave 5 (state.wave = 4) with the same three towers, at
// step 600 the keg is fired at enemy 13's position (rounded), (160,221) on
// the first climb: it hits 5, kills 4 and leaves Troll 9 at 620 of 700;
// then one tick runs. Goblins 2 and 4 carry earlier tower damage.
// Milestone 25c: same step, rescanned the same way: the keg at enemy 14's
// position, (160,161) on the first climb, hits 11 (2 Trolls, 6 Goblins, 3
// Harpies), kills the 9 that are not Trolls and leaves both Trolls at 420
// of 500. Second pass: step 810, the keg at enemy 12's position (160,191)
// hits 6 (3 Goblins, 2 Harpies, Troll 13), kills the 5 that are not the
// Troll and leaves it at 820 of 900; Goblin 5 carries earlier damage.
// Milestone 28 (Goblin 23, Troll 950): the same step, hits and kills; the
// Troll is left at 870 of 950 and Goblin 5 at 11.
const FIRED_STEPS = 810;
const FIRED_TARGET_ID = 12;

// Milestone 30: the keg's landing is drawn in test mode too (the ring, the
// scorch mark and the "N hit" label, without fading); the frame is the tick
// after it, so the ring is mid-way out.
test('special fired: the tick after a Powder Keg', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(
    async ({ steps, id }) => {
      const t = window.__tarpit as TarpitTestApi;
      await t.startGame();
      const s = t.state();
      s.gold = 1000;
      s.wave = 4; // test setup: the next Start Wave plays wave 5
      t.buildAt(7, 5, 'musketeer');
      t.buildAt(15, 9, 'cannon');
      t.buildAt(18, 9, 'tarpit');
      t.startWave();
      t.step(steps);
      return t.state().enemies.find((e) => e.id === id)?.distance;
    },
    { steps: FIRED_STEPS, id: FIRED_TARGET_ID },
  );
  const at = positionAlongPath(MAPS.meadow, r!);
  const aim = { x: Math.round(at.x), y: Math.round(at.y) };
  const counts = await page.evaluate(({ x, y }) => {
    const t = window.__tarpit as TarpitTestApi;
    const before = t.state().enemies.length;
    const res = t.useSpecialAt('keg', x, y);
    const kills = t.events().filter((e) => e.kind === 'kill' && e.cause === 'special').length;
    t.step(1);
    const e = t.state().enemies;
    return {
      ok: res.ok,
      hits: res.ok ? res.hits : -1,
      kills,
      before,
      after: e.length,
      // Full hp since milestone 28: Troll 950, Harpy 36, Wolf 20, Goblin 23.
      hurt: e.filter((x) => x.hp < ({ troll: 950, harpy: 36, wolf: 20, goblin: 23 } as Record<string, number>)[x.type]).map((x) => `${x.type} ${x.id} ${x.hp}`),
      charges: t.state().specialCharges,
      labels: t.ui().special.labels.map((l) => l.text),
    };
  }, aim);
  expect({ aim, ...counts }).toEqual(FIRED_EXPECT);
  await page.mouse.move(900, 440); // empty grass: no hover tint
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('special-fired.png');
});

// Milestone 30: the three new special frames. Wave 7 (state.wave = 6, then
// Start Wave) with the mid-wave frame's towers; at step ZONE_STEPS the
// special is fired at the policy's best point for it (the point catching
// the most enemies, computed here as the tests do: every enemy position,
// rounded), then 60 ticks run so the zone has worked for a second.
const ZONE_STEPS = 900;

/** Wave 7 with the three towers at ZONE_STEPS; fire `type` at the enemy position whose circle holds the most, then step `after`. */
async function fireOnWave7(page: Page, type: 'keg' | 'tarBarrel' | 'fireArrows', after: number) {
  await open(page);
  const enemies = await page.evaluate(async (steps) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const s = t.state();
    s.gold = 1000;
    s.wave = 6; // test setup: the next Start Wave plays wave 7
    t.buildAt(7, 5, 'musketeer');
    t.buildAt(15, 9, 'cannon');
    t.buildAt(18, 9, 'tarpit');
    t.startWave();
    t.step(steps);
    return t.state().enemies;
  }, ZONE_STEPS);
  const radius = SPECIAL_DEFS[type].radius;
  let best = { at: { x: 0, y: 0 }, n: -1 };
  for (const e of enemies) {
    const p = positionAlongPath(MAPS.meadow, e.distance);
    const at = { x: Math.round(p.x), y: Math.round(p.y) };
    const n = enemies.filter((o) => {
      const q = positionAlongPath(MAPS.meadow, o.distance);
      return Math.hypot(q.x - at.x, q.y - at.y) <= radius;
    }).length;
    if (n > best.n) best = { at, n };
  }
  return page.evaluate(
    ({ type, at, after }) => {
      const t = window.__tarpit as TarpitTestApi;
      const res = t.useSpecialAt(type, at.x, at.y);
      t.step(after);
      const u = t.ui().special;
      const e = t.state().enemies;
      return {
        at,
        hits: res.ok ? res.hits : -1,
        zones: u.zones.map((z) => `${z.type} ${z.ticksLeft}`),
        slowed: e.filter((x) => (x.specialSlowTicksLeft ?? 0) > 0).length,
        burning: e.filter((x) => (x.burnTicksLeft ?? 0) > 0).length,
        labels: u.labels.map((l) => l.text),
        rechargeTicks: u.rechargeTicks,
        hud: t.hudText().special,
      };
    },
    { type, at: best.at, after },
  );
}

test('special tar zone: a Tar Barrel puddle one second after it lands, slowing the enemies inside', async ({ page }) => {
  const r = await fireOnWave7(page, 'tarBarrel', 60);
  expect(r).toEqual(TAR_ZONE_EXPECT);
  await page.mouse.move(900, 440);
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('special-tar-zone.png');
});

test('special fire zone: a Fire Arrows patch one second after it lands, burning the enemies inside', async ({ page }) => {
  const r = await fireOnWave7(page, 'fireArrows', 60);
  expect(r).toEqual(FIRE_ZONE_EXPECT);
  await page.mouse.move(900, 440);
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('special-fire-zone.png');
});

test('special recharging: the Special button 5 s after a keg, filled a quarter, reading "Wait 15s"', async ({ page }) => {
  const r = await fireOnWave7(page, 'keg', 300);
  expect([r.rechargeTicks, r.hud, r.zones, r.labels]).toEqual([900, 'Wait 15s', [], []]);
  await page.mouse.move(900, 440);
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('special-recharging.png');
});

// End screens: the HUD under the veil shows the final numbers. Milestone
// 26: the win screen has three buttons ([Keep going] first), so won.png
// changes.
test('win screen after the combo build', async ({ page }) => {
  await open(page);
  const end = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const phase = t.runScript('comboBuild');
    return { phase, screen: t.endScreen(), lives: t.state().lives, gold: t.state().gold };
  });
  expect(end).toEqual({ phase: 'won', screen: 'won', lives: 16, gold: 420 }); // milestone 30: the special policy
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('won.png');
});

// Milestone 26: the title with a stored best for Normal (the selected
// level), "Best on Meadow, Normal: 12 waves" centred on y 422 (milestone 27 follow-up).
test('title with a best score', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tarpit.best', '{"v":1,"best":{"meadow":{"normal":12}}}'));
  await open(page);
  expect((await page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>())).bestLine?.text).toBe(bestScoreText('meadow', 'normal', 12));
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('title-best.png');
});

// Milestone 26: endless wave 11 running. The endless idle script wins with
// the combo build and presses Keep going (untilWave 11 stops in setup), then
// Start Wave and 900 ticks: the HUD reads "Wave 11" and previews wave 12.
test('endless wave 11 HUD', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  const r = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const phase = t.runScript('endlessIdle', 11);
    t.startWave();
    t.step(900);
    return { phase, wave: t.state().wave, endless: t.state().endless, hud: t.hudText(), screen: t.endScreen() };
  });
  expect(r).toMatchObject({ phase: 'setup', wave: 11, endless: true, screen: null });
  expect(r.hud.wave).toBe('Wave 11');
  expect(r.hud.boss).toBeNull();
  expect(r.hud.next).toBe('Next: 30 Wolf, 10 Troll, 10 Harpy');
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('endless-hud.png');
});

test('lose screen with no towers', async ({ page }) => {
  await open(page);
  const end = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    for (let i = 0; i < 120 && t.state().phase !== 'lost'; i++) {
      if (t.state().phase === 'setup') t.startWave();
      t.step(500);
    }
    return { screen: t.endScreen(), wave: t.state().wave, lives: t.state().lives };
  });
  expect(end).toEqual({ screen: 'lost', wave: 1, lives: 0 }); // milestone 25c: wave 1's 20 Goblins take all 20 lives
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('lost.png');
});

// Milestone 27: the two new maps at wave 0, started on Normal through the
// test hook (the title's map row is covered by the title frames).
for (const map of ['switchback', 'riverbend'] as const) {
  test(`map ${map} at wave 0`, async ({ page }) => {
    await open(page);
    await page.evaluate((m) => (window.__tarpit as TarpitTestApi).startGame('normal', m), map);
    expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).state().map.id)).toBe(map);
    await settle(page);
    await expect(page.locator('canvas')).toHaveScreenshot(`map-${map}-wave0.png`);
  });
}

// Milestone 27: one mid-wave frame per new map with enemies on at least
// three path segments. Wave 2 (32 Goblins, 0.9 s apart) with a Musketeer
// and a Cannon, picked by a headless scan of every 30th tick for the most
// segments with some hurt Goblins and no two closer than 38 px. Switchback,
// Musketeer (13,7) between two lanes and Cannon (21,10) on the last lane,
// tick 1230: 20 Goblins on segments 0 to 4, the leftward y 192 lane (2)
// included, 4 hurt. Riverbend, Musketeer (17,6) on the right bank and
// Cannon (22,10), tick 1440: 23 Goblins on segments 0 to 3 (the first run,
// the climb, the top run over the river, the descent), 3 hurt.
const MID_WAVE_MAPS = {
  switchback: { towers: [['musketeer', 13, 7], ['cannon', 21, 10]], steps: 1230, expect: { enemies: 20, hurt: 4, segments: [0, 1, 2, 3, 4] } },
  riverbend: { towers: [['musketeer', 17, 6], ['cannon', 22, 10]], steps: 1440, expect: { enemies: 23, hurt: 3, segments: [0, 1, 2, 3] } },
} as const;

for (const map of ['switchback', 'riverbend'] as const) {
  test(`map ${map} mid wave 2`, async ({ page }) => {
    await open(page);
    const setup = MID_WAVE_MAPS[map];
    const r = await page.evaluate(
      async ({ m, towers, steps }) => {
        const t = window.__tarpit as TarpitTestApi;
        await t.startGame('normal', m);
        t.state().gold = 1000; // test setup: afford both towers
        for (const [type, col, row] of towers) t.buildAt(col, row, type);
        t.state().wave = 1; // test setup: the next Start Wave plays wave 2
        t.startWave();
        t.step(steps);
        const s = t.state();
        return { distances: s.enemies.map((e) => e.distance), hurt: s.enemies.filter((e) => e.hp < 19).length, path: s.map.path };
      },
      { m: map, towers: setup.towers as unknown as [TowerType, number, number][], steps: setup.steps },
    );
    // Segment index of each enemy, from the path's own lengths.
    const ends: number[] = [];
    let total = 0;
    for (let i = 1; i < r.path.length; i++) ends.push((total += Math.hypot(r.path[i].x - r.path[i - 1].x, r.path[i].y - r.path[i - 1].y)));
    const segments = [...new Set(r.distances.map((d) => ends.findIndex((e) => d <= e)))].sort((a, b) => a - b);
    expect({ enemies: r.distances.length, hurt: r.hurt, segments }).toEqual(setup.expect);
    if (map === 'switchback') expect(MAPS.switchback.path[3].x).toBeLessThan(MAPS.switchback.path[2].x); // segment 2 runs leftward
    await settle(page);
    await expect(page.locator('canvas')).toHaveScreenshot(`map-${map}-midwave.png`);
  });
}

// Milestone 27: a Longbow dragged from the bar and held over the river
// (cell (13,8)): the red cell and the faint red-tinted ghost, nothing built.
test('riverbend placing invalid: a drag held over the river', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame('normal', 'riverbend'));
  const bar = await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects()['bar:longbow']);
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(13 * 32 + 16, 8 * 32 + 16, { steps: 10 });
  expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'longbow', cell: { col: 13, row: 8 } });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('riverbend-placing-invalid.png');
  await page.mouse.up();
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).state().towers)).toEqual([]);
});
