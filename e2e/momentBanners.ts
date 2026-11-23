import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import {
  BARRICADE_UNLOCKED, BARRICADE_UNLOCK_HINT, BOSS_BANNER_SUB, BOSS_NAME, GRUMBLEMAW_NAME,
  GRUMBLEMAW_SUB, GUARDS_UNLOCKED, GUARDS_UNLOCK_HINT, PACK_CALL_TEXT, bonusGoldText, waveClearBanner,
} from '../src/game/names';
import { ENDLESS_WAVE_CAP, lastSpawnTick } from '../src/sim';
import { openCampaign } from './campaign';
import { useTallFontMetrics } from './campaignFont';

async function startAt(page: Page, wave: number, advance = 0) {
  const started = await page.evaluate(({ wave, advance }) => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    scene.state.phase = 'setup';
    scene.state.wave = wave - 1;
    scene.state.lives = 60; // survive the fast-forward to the entrance with an undefended trail
    scene.state.enemies = [];
    const result = scene.startWave();
    scene.advance(advance);
    return result;
  }, { wave, advance });
  expect(started).toMatchObject({ ok: true });
}

async function checkBanner(page: Page, title: string, caption?: string, capture?: string) {
  // The health bar duplicates the boss name. Read the fully opaque labels in
  // the map's banner area, while the live scene is showing the matching event.
  const visible = await page.waitForFunction(({ title, caption, freeze }) => {
    const t = window.__tarpit!;
    if (t.fx()?.banner !== title) return;
    const scene = t.game.scene.getScene('game');
    const labels = scene.children.list.filter((child): child is Phaser.GameObjects.Text =>
      child.type === 'Text' && (child as Phaser.GameObjects.Text).visible &&
      (child as Phaser.GameObjects.Text).alpha === 1 && (child as Phaser.GameObjects.Text).y > 100);
    const lines = (caption ? [title, caption] : [title]).map(text => labels.find(label => label.text === text));
    if (lines.some(line => !line)) return;
    if (freeze) scene.scene.pause();
    return lines.map(line => {
      const { left, right, top, bottom } = line!.getBounds();
      return { left, right, top, bottom };
    });
  }, { title, caption, freeze: !!capture });
  const lines = (await visible.jsonValue())!;
  const width = await page.evaluate(() => window.__tarpit!.game.scale.width);
  for (const line of lines) {
    // Leave room for the plaque's 24 px padding on either end.
    expect(line.left, title).toBeGreaterThanOrEqual(24);
    expect(line.right, title).toBeLessThanOrEqual(width - 24);
  }
  if (caption) expect(lines[1].top, title).toBeGreaterThan(lines[0].bottom);
  if (capture) {
    await page.screenshot({ path: capture, quality: 88, scale: 'css' });
    await page.evaluate(() => window.__tarpit!.game.scene.resume('game'));
  }
}

export function momentBannerSuite(touch: boolean) {
  for (const fallback of [false, true]) {
    for (const tall of [false, true]) {
      test(`active boss and wave banners fit in ${fallback ? 'fallback' : 'Caslon'} with ${tall ? 'tall' : 'normal'} metrics`, async ({ page }, info) => {
        if (tall) await useTallFontMetrics(page, fallback);
        else if (fallback) await page.route('**/*.woff2', route => route.abort());
        await openCampaign(page, touch, true);
        expect(await page.evaluate(() => [...document.fonts].some(face => face.status === 'loaded'))).toBe(!fallback);
        await startAt(page, 3);
        await checkBanner(page, BARRICADE_UNLOCKED, BARRICADE_UNLOCK_HINT);
        await startAt(page, 6);
        await checkBanner(page, GUARDS_UNLOCKED, GUARDS_UNLOCK_HINT);
        await startAt(page, 10, lastSpawnTick(10) + 1);
        const capture = process.env.M44C_REVIEW_DIR && info.project.name === 'phone' && !tall && !fallback
          ? `${process.env.M44C_REVIEW_DIR}/phone-boss-banner.jpg` : undefined;
        await checkBanner(page, BOSS_NAME, BOSS_BANNER_SUB, capture);
        await startAt(page, 20, lastSpawnTick(20) + 1);
        await checkBanner(page, GRUMBLEMAW_NAME, GRUMBLEMAW_SUB);
        await page.evaluate(() => {
          const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
          const boss = scene.state.enemies.find(enemy => enemy.type === 'grumblemaw')!;
          boss.distance = 0;
          boss.hp = Math.ceil(boss.hp * 2 / 3) + 1;
          const cave = scene.state.map.path[0];
          scene.useSpecialAt('keg', cave.x, cave.y);
          scene.advance(1);
        });
        await checkBanner(page, PACK_CALL_TEXT);
        await page.evaluate(() => { (window.__tarpit!.game.scene.getScene('game') as GameScene).state.endless = true; });
        await startAt(page, ENDLESS_WAVE_CAP);
        await page.evaluate(() => {
          const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
          scene.state.spawnedPerGroup.fill(9999);
          scene.state.enemies = [];
          scene.state.packs = [];
          scene.advance(1);
        });
        await checkBanner(page, waveClearBanner(ENDLESS_WAVE_CAP), bonusGoldText(25));
      });
    }
  }
}
