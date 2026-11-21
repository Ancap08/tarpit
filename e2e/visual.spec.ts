import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

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
const MID_WAVE_STEPS = 848;

test('mid wave 1 with three towers', async ({ page }) => {
  await open(page);
  const counts = await page.evaluate(async (steps) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.state().gold = 1000; // test setup: afford all three towers
    t.buildAt(7, 5, 'musketeer'); // legacy spot 2
    t.buildAt(15, 9, 'cannon'); // legacy spot 6
    t.buildAt(18, 9, 'tarpit'); // legacy spot 7
    t.startWave();
    t.step(steps);
    const s = t.state();
    return { enemies: s.enemies.length, hurt: s.enemies.filter((e) => e.hp < 30).length };
  }, MID_WAVE_STEPS);
  expect(counts).toEqual({ enemies: 5, hurt: 4 });
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
const ENEMIES_STEPS = 1350;

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
      hurtTrolls: of('troll').filter((x) => x.hp < 700).length, // Troll max hp is 700
      slowed: e.filter((x) => x.slowTicksLeft > 0).length,
      shieldbearers: of('shieldbearer').length,
      harpies: of('harpy').length,
    };
  }, ENEMIES_STEPS);
  expect(counts).toEqual({ wave: 8, goblins: 10, wolves: 3, trolls: 7, hurtTrolls: 3, slowed: 4, shieldbearers: 3, harpies: 4 });
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
const MORTAR_FIRE_TICK = 1488;
const NEW_TOWERS_STEPS = 1490;

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
  expect(counts).toEqual({ wave: 5, upgraded: 4, mortarShots: 1, enemies: 3, slowedAndBurning: 2, harpies: 1 });
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
const HARPIES_STEPS = 471;

test('wave 4 Harpies: a Cannon splash ignores one, a Musketeer shoots one', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async (steps) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const s = t.state();
    s.gold = 1000; // test setup: afford both towers
    s.wave = 3; // test setup: the next Start Wave plays wave 4
    t.buildAt(7, 4, 'cannon');
    t.buildAt(2, 3, 'musketeer');
    t.startWave();
    const typeOf = new Map<number, string>();
    const shots: string[] = [];
    for (let i = 1; i <= steps; i++) {
      t.step(1);
      for (const e of t.events()) if (e.kind === 'spawn') typeOf.set(e.enemyId, e.enemyType);
      for (const x of t.state().shots) if (i >= 468) shots.push(`${i} ${x.tower} ${typeOf.get(x.targetId)} ${x.targetId}`);
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
    shots: ['468 musketeer harpy 10', '469 cannon wolf 9'],
    harpies: [
      { id: 4, hp: 40 },
      { id: 7, hp: 28 },
      { id: 10, hp: 28 },
      { id: 13, hp: 40 },
    ],
    wolves: 7,
    textures: ['harpy', 'harpy', 'harpy', 'harpy'],
  });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('harpies.png');
});

// End screens: the HUD under the veil shows the final numbers.
test('win screen after the combo build', async ({ page }) => {
  await open(page);
  const end = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const phase = t.runScript('comboBuild');
    return { phase, screen: t.endScreen(), lives: t.state().lives, gold: t.state().gold };
  });
  expect(end).toEqual({ phase: 'won', screen: 'won', lives: 12, gold: 347 }); // milestone 22 waves
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('won.png');
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
  expect(end).toEqual({ screen: 'lost', wave: 2, lives: 0 });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('lost.png');
});
