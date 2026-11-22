import { expect, test, type Page } from '@playwright/test';
import { BOSS_NAME, ENEMY_NAMES } from '../src/game/names';
import { COLORS } from '../src/game/palette';
import { MAPS, positionAlongPath } from '../src/sim/map';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Verifier (milestone 23): renderer probes for Grumblefoot in test mode
// (?test=1, Canvas renderer, frozen animation). Reads private scene fields
// (enemySprites.views and layers, labels, bars, shotFx, hud): probes, not
// supported hooks, like new-enemies-verifier.spec.ts.
//
// From src/game/ui/bossBar.ts (BOSS_BAR) and draw/enemies.ts (BOSS_SHADOW);
// not imported here because those modules import Phaser or ?url PNGs.
const BAR = { x: 330, y: 24, width: 300, height: 14 };
const BOSS_SHADOW = { offsetY: 4, outer: { w: 72, h: 20, alpha: 0.15 }, inner: { w: 52, h: 14, alpha: 0.2 } };
const BOSS_SPAWN_TICK = 3900; // milestone 25c second pass (1560 before)

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

type Obj = { displayList: { type?: string } | null; depth: number; x: number; y: number; visible: boolean };
type View = { sprite: Obj & { texture: { key: string } }; flash: (Obj & { texture: { key: string }; frame: { name: string | number } }) | null };
type SceneProbe = {
  children: { list: unknown[] };
  enemySprites: { views: Map<number, View>; layer: unknown; bossLayer: unknown; airLayer: unknown };
  labels: { labels: Map<number, Obj>; layer: unknown };
  bars: Obj;
  shotFx: Obj;
  hud: { next: { text: string; style: { fontSize: string }; getWrappedText(): string[]; height: number } };
};

const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const near = (got: number[], want: number[], tol = 4) => got.every((c, i) => Math.abs(c - want[i]) <= tol);

// (a) Depth. Wave 10 with no towers at tick 4040 (1700 before milestone 25c's second pass): he is on the map with
// Trolls and Shieldbearers. His sprite's Layer sits after the walkers' Layer
// and before the shot effects, the hp bars, the labels' Layer and the air
// Layer, which in turn sits before the HUD objects.
test('(a) at tick 4040 of wave 10 his layer is above the walkers and below shots, hp bars, labels and the air layer', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.wave = 9; // test setup: the next Start Wave plays wave 10
    s.lives = 1000;
    t.startWave();
    t.step(4040);
    const scene = t.game.scene.getScene('game') as unknown as SceneProbe;
    const list = scene.children.list;
    const rank = (o: Obj) => (o.displayList && o.displayList.type === 'Layer' ? list.indexOf(o.displayList) : list.indexOf(o));
    const enemies = t.state().enemies;
    const ranks = enemies.map((e) => ({ type: e.type, rank: rank(scene.enemySprites.views.get(e.id)!.sprite) }));
    const bossView = scene.enemySprites.views.get(enemies.find((e) => e.type === 'boss')!.id)!;
    return {
      total: list.length,
      types: [...new Set(enemies.map((e) => e.type))].sort(),
      bossRanks: [...new Set(ranks.filter((x) => x.type === 'boss').map((x) => x.rank))],
      walkerRanks: [...new Set(ranks.filter((x) => x.type !== 'boss' && x.type !== 'harpy').map((x) => x.rank))],
      walkerLayer: list.indexOf(scene.enemySprites.layer),
      bossLayer: list.indexOf(scene.enemySprites.bossLayer),
      airLayer: list.indexOf(scene.enemySprites.airLayer),
      labelsLayer: list.indexOf(scene.labels.layer),
      bars: rank(scene.bars),
      shotFx: rank(scene.shotFx),
      flashInBossLayer: bossView.flash !== null && bossView.flash.displayList === bossView.sprite.displayList,
      flashVisible: bossView.flash?.visible ?? null,
    };
  });
  // Milestone 25c second pass: the Harpies are gone by 4040; Trolls and Shieldbearers remain.
  expect(r.types).toEqual(['boss', 'shieldbearer', 'troll']);
  expect(r.bossRanks).toEqual([r.bossLayer]);
  expect(r.walkerRanks).toEqual([r.walkerLayer]);
  expect(r.bossLayer).toBeGreaterThan(r.walkerLayer);
  expect(r.bossLayer).toBeLessThan(r.shotFx);
  expect(r.bossLayer).toBeLessThan(r.bars);
  expect(r.bossLayer).toBeLessThan(r.labelsLayer);
  expect(r.bossLayer).toBeLessThan(r.airLayer);
  expect(r.airLayer).toBeLessThan(r.total - 1);
  expect(r.flashInBossLayer).toBe(true);
  expect(r.flashVisible).toBe(false); // no hit on this tick (no towers)
});

// (b) Shadow. Wave 10 with no towers at tick 7261 (milestone 25c second
// pass; 4921 before): every other enemy has exited (the last Troll, spawned
// at 3780, needs 1584 / 35 s = 2716 ticks), and he is at distance 3360 x 25
// / 60 = 1400 exactly (spawned on tick 3900, he first moves on tick 3901, so
// 7261 - 3901 = 3360 moves). The path's
// cumulative corner distances are 160, 304, 564, 852, 1112, 1304, 1584, so
// 1400 is 96 px into the last run from (680,192): (776,192). His last opaque sprite row is 6 px below the path point
// (DEVLOG: feet at row 42 of 50, 2x, lift 30), so 9 px below the point is
// shadow only: inside both ellipses (centre y + 4, inner half height 7,
// outer 10) the path colour reads x 0.85 x 0.8; 12 px below the point
// (8 below the centre) the inner ellipse has ended and the outer still
// covers 36 x sqrt(1 - 0.64) = 21.6 px to either side: x 0.85 at dx 0 and
// -8; 60 px to either side is the trail as it was before he came (the strip is 40 px tall, y 172 to
// 212). A pixel profile of the rows under him (verifier notes) matched this.
test('(b) he has a two-ellipse ground shadow on the path under his feet', async ({ page }) => {
  await startGame(page);
  // Milestone 34: the trail has texture, so each probe's ground colour is read before he arrives (test mode: the map is still).
  const probe = (pos: { x: number; y: number }, dy: number) =>
    page.evaluate(
      async ({ pos, dy }) => {
        const t = window.__tarpit as TarpitTestApi;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const ctx = t.game.canvas.getContext('2d')!;
        const px = (dx: number, ddy: number) => [...ctx.getImageData(pos.x + dx, pos.y + ddy, 1, 1).data].slice(0, 3);
        return { centre: px(0, dy), outerOnly: px(0, dy + 3), outerOnly2: px(-8, dy + 3), left: px(-60, dy), right: px(60, dy), above: px(0, -60) };
      },
      { pos, dy },
    );
  const ground = await probe({ x: 776, y: 192 }, BOSS_SHADOW.offsetY + 5);
  const enemies = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.wave = 9; // test setup: the next Start Wave plays wave 10
    s.lives = 1000;
    t.startWave();
    t.step(7261);
    return t.state().enemies.map((e) => ({ id: e.id, type: e.type, distance: e.distance }));
  });
  expect(enemies.map((e) => e.type)).toEqual(['boss']);
  expect(enemies[0].distance).toBeCloseTo((3360 * 25) / 60, 6);
  const p = positionAlongPath(MAPS.meadow, enemies[0].distance);
  const pos = { x: Math.round(p.x), y: Math.round(p.y) };
  expect(pos).toEqual({ x: 776, y: 192 });
  const dy = BOSS_SHADOW.offsetY + 5; // 9 px below the path point: below his feet, inside the inner ellipse
  const r = await probe(pos, dy);
  const path = rgb(COLORS.path);
  expect(r.left).toEqual(ground.left);
  expect(r.right).toEqual(ground.right);
  expect(near(r.centre, ground.centre.map((c) => c * (1 - BOSS_SHADOW.outer.alpha) * (1 - BOSS_SHADOW.inner.alpha))), `centre ${r.centre}`).toBe(true);
  expect(near(r.outerOnly, ground.outerOnly.map((c) => c * (1 - BOSS_SHADOW.outer.alpha))), `outer ${r.outerOnly}`).toBe(true);
  expect(near(r.outerOnly2, ground.outerOnly2.map((c) => c * (1 - BOSS_SHADOW.outer.alpha))), `outer2 ${r.outerOnly2}`).toBe(true);
  expect(r.above).not.toEqual(path); // sanity: 60 px up is grass or sprite, not path
});

// (c) Hit flash, (d) the HUD label before and after, (e) the bar fill. The
// combo build through wave 9, then wave 10: the label is null until his
// spawn tick, then "Grumblefoot 4000 / 4000" with a full 300 px red fill.
// Stepping one tick at a time, the first hit on him shows the flash sprite
// (texture boss-hit, frame 0) over him and animState flags hit; a later
// tick with no hit hides it. At tick 3562 (the boss.png frame) the red run
// along the bar's middle row is round(300 x hp / 4000) px wide. After his
// death the label is null again. Milestone 25c: the boss.png frame is tick
// 3230 (hp 2487.0000000000828, so 187 px); in the second pass 5664 (hp
// 2428.0x, 182 px) with the first hit by the Longbow at (9,4) at step
// 5085. Before that, the first hit on him was the
// Tar Pit at (11,4) at step 2629 (with a Longbow on the same tick; the Tar
// Pit fires first in cell order).
test('(c)(d)(e) flash on a hit tick, label null before spawn and after death, fill proportional', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate((spawnTick) => {
    const t = window.__tarpit as TarpitTestApi;
    const phase = t.runScript('comboBuild', 10);
    const bossBefore = t.hudText().boss;
    t.startWave();
    t.step(spawnTick);
    const bossAtSpawnMinus1 = t.hudText().boss;
    t.step(1);
    const id = t.state().enemies.find((e) => e.type === 'boss')!.id;
    const scene = t.game.scene.getScene('game') as unknown as SceneProbe;
    const view = scene.enemySprites.views.get(id)!;
    const labelAtSpawn = t.hudText().boss;
    let firstHit: { tick: number; tower: string; flash: boolean; texture: string; frame: string | number; flagHit: boolean; dx: number; dy: number } | null = null;
    let afterHit: { tick: number; flash: boolean; flagHit: boolean } | null = null;
    let ticks = spawnTick + 1;
    while (ticks < 5721 && (firstHit === null || afterHit === null)) {
      t.step(1);
      ticks += 1;
      const hit = t.events().find((e) => e.kind === 'hit' && e.enemyId === id);
      const a = t.animState(id)!;
      if (hit && hit.kind === 'hit' && firstHit === null) {
        firstHit = {
          tick: ticks,
          tower: hit.tower,
          flash: view.flash!.visible,
          texture: view.flash!.texture.key,
          frame: view.flash!.frame.name,
          flagHit: a.flags.hit,
          dx: view.flash!.x - view.sprite.x,
          dy: view.flash!.y - view.sprite.y,
        };
      } else if (!hit && firstHit !== null && afterHit === null) {
        afterHit = { tick: ticks, flash: view.flash!.visible, flagHit: a.flags.hit };
      }
    }
    return { phase, bossBefore, bossAtSpawnMinus1, labelAtSpawn, id, firstHit, afterHit, ticks };
  }, BOSS_SPAWN_TICK);
  expect(r.phase).toBe('setup');
  expect(r.bossBefore).toBeNull();
  expect(r.bossAtSpawnMinus1).toBeNull();
  expect(r.labelAtSpawn).toBe(`${BOSS_NAME} 4000 / 4000`);
  expect(r.firstHit).toMatchObject({ tower: 'longbow', flash: true, texture: 'boss-hit', frame: 0, flagHit: true, dx: 0, dy: 0 });
  expect(r.firstHit!.tick).toBeGreaterThan(BOSS_SPAWN_TICK + 1000);
  expect(r.afterHit).toMatchObject({ tick: r.firstHit!.tick + 1, flash: false, flagHit: false });

  // Fill width at the spawn tick's full bar is read from a fresh game below;
  // here, read it at tick 5721 (milestone 28; 5664 before, the old boss.png
  // frame): hp 2212.x -> 166 px, the hp text clear of the fill. Milestone 30: hp 2177.x -> 163 px.
  const fill = await page.evaluate(
    async ({ bar, red, bg, id, now }) => {
      const t = window.__tarpit as TarpitTestApi;
      t.step(5721 - now);
      const boss = t.state().enemies.find((e) => e.id === id)!;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const ctx = t.game.canvas.getContext('2d')!;
      const row = ctx.getImageData(bar.x, bar.y + Math.floor(bar.height / 2), bar.width, 1).data;
      const isColour = (i: number, c: number[]) => Math.abs(row[i * 4] - c[0]) <= 4 && Math.abs(row[i * 4 + 1] - c[1]) <= 4 && Math.abs(row[i * 4 + 2] - c[2]) <= 4;
      let redRun = 0;
      while (redRun < bar.width && isColour(redRun, red)) redRun += 1;
      let bgAfter = 0;
      for (let i = redRun; i < bar.width && isColour(i, bg); i++) bgAfter += 1;
      return { hp: boss.hp, label: t.hudText().boss, redRun, bgAfter, waveTick: t.state().waveTick };
    },
    { bar: BAR, red: rgb(COLORS.bossBarFill), bg: rgb(COLORS.bossBarBg), id: r.id, now: r.ticks },
  );
  expect(fill.waveTick).toBe(5721);
  expect(fill.label).toBe(`${BOSS_NAME} 2178 / 4000`);
  const want = Math.round((BAR.width * fill.hp) / 4000);
  expect(want).toBe(163);
  expect(Math.abs(fill.redRun - want), `red run ${fill.redRun}, want ${want}`).toBeLessThanOrEqual(2);
  // The trough continues past the fill until the right-aligned hp text (37 px at the milestone 25c frame; was over 40 at 178 px).
  expect(fill.bgAfter).toBeGreaterThan(20);

  const end = await page.evaluate((id) => {
    const t = window.__tarpit as TarpitTestApi;
    let down = false;
    for (let i = 0; i < 60_000 && !down; i++) {
      t.step(1);
      down = t.events().some((e) => e.kind === 'bossDown');
    }
    return { down, boss: t.hudText().boss, phase: t.state().phase, sprite: t.animState(id) };
  }, r.id);
  expect(end).toMatchObject({ down: true, boss: null, phase: 'won', sprite: null });
});

// (f) The wave 10 preview. In setup before wave 10 the HUD's preview text
// object holds the one-line string (hudText().next) at 13 px (11 px since
// milestone 25c: the horde's longer preview needs three lines at 13) and wraps it
// to exactly two lines through Phaser's word wrap (getWrappedText), the
// second ending with the boss name; before wave 1 the preview is one 16 px
// line. The pill and the bar sit inside the map (y 4 to 39).
test('(f) the wave 10 preview ends with the boss name and wraps to two 13 px lines; the wave 1 preview is one 16 px line', async ({ page }) => {
  await startGame(page);
  const r = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const scene = t.game.scene.getScene('game') as unknown as SceneProbe;
    const read = () => ({ text: scene.hud.next.text, size: scene.hud.next.style.fontSize, lines: scene.hud.next.getWrappedText(), height: scene.hud.next.height });
    const wave1 = read();
    t.runScript('comboBuild', 10);
    const wave10 = read();
    return { wave1, wave10, hud: t.hudText().next };
  });
  expect(r.wave1.size).toBe('16px');
  expect(r.wave1.lines).toEqual([`Next: 20 ${ENEMY_NAMES.goblin}`]);
  expect(r.hud).toBe(`Next: 20 ${ENEMY_NAMES.wolf}, 15 ${ENEMY_NAMES.troll}, 12 ${ENEMY_NAMES.harpy}, 8 ${ENEMY_NAMES.shieldbearer} + ${BOSS_NAME}`);
  expect(r.wave10.text).toBe(r.hud);
  expect(r.wave10.size).toBe('11px');
  expect(r.wave10.lines).toHaveLength(2);
  expect(r.wave10.lines[1].trimEnd().endsWith(BOSS_NAME)).toBe(true);
  expect(r.wave10.lines.join(' ').replace(/\s+/g, ' ').trim()).toBe(r.hud);
  expect(r.wave10.height).toBeGreaterThan(r.wave1.height);
});
