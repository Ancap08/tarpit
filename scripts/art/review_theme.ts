// PW_PORT=4373 node --experimental-strip-types scripts/art/review_theme.ts [output directory]
// Run against a production preview. The frozen game draws a staged wave through its normal renderer.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { waitForTitle } from '../../e2e/title.ts';
import type { GameScene } from '../../src/game/GameScene';
import type { TarpitTestApi } from '../../src/game/testGlobal';

const output = process.argv[2] ?? 'docs/art/theme';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const layout of ['landscape', 'phone'] as const) {
    const phone = layout === 'phone';
    const page = await browser.newPage({
      viewport: phone ? { width: 390, height: 844 } : { width: 960, height: 580 },
      deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone,
    });
    for (const map of ['meadow', 'switchback', 'riverbend'] as const) {
      await page.goto(`http://localhost:${process.env.PW_PORT}/?test=1&look=painted`);
      await waitForTitle(page);
      await page.evaluate(async map => {
        const a = window.__tarpit as TarpitTestApi;
        await a.startGame('normal', map);
        a.runScript('comboBuild', 7);
        const state = (a.game.scene.getScene('game') as GameScene).state;
        const path = state.map.path;
        const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
        const total = lengths.reduce((sum, length) => sum + length, 0);
        function at(fraction: number) {
          let distance = fraction * total;
          for (const [i, length] of lengths.entries()) {
            if (distance <= length) {
              const t = distance / length;
              return { x: path[i].x + (path[i+1].x-path[i].x)*t, y: path[i].y + (path[i+1].y-path[i].y)*t };
            }
            distance -= length;
          }
          return path.at(-1)!;
        }
        const squad = at(.55);
        for (const tower of [...state.towers]) {
          const x = tower.cell.col * 32 + 16, y = tower.cell.row * 32 + 16;
          if (Math.hypot(x - squad.x, y - squad.y) < 100) a.sellAt(tower.cell.col, tower.cell.row);
        }
        a.startWave();
        a.step(120);
        state.spawnedPerGroup.fill(9999);
        // Space the cast along the road with two congested encounters at the blockers.
        const cast = [
          ['goblin', .08], ['wolf', .13], ['shieldbearer', .19], ['harpy', .24],
          ['troll', .30], ['boss', .41], ['wolf', .47], ['shieldbearer', .51],
          ['goblin', .60], ['harpy', .64], ['grumblemaw', .74],
          ['goblin', .82], ['troll', .83], ['shieldbearer', .85], ['wolf', .86],
        ] as const;
        state.enemies = cast.map(([type, fraction], i) => ({
          id: state.nextEnemyId++, type, hp: i === 1 ? 650 : 950, maxHp: 950,
          distance: fraction * total, slow: 0, slowTicksLeft: 0,
        }));
        for (const [special, fraction] of [['guards', .55], ['barricade', .86]] as const) {
          state.specialCharges = 1;
          state.specialRechargeTicks = 0;
          const point = at(fraction);
          const result = a.useSpecialAt(special, point.x, point.y);
          if (!result.ok) throw Error(`${map} ${special}: ${result.reason}`);
          a.step(1);
        }
        // The Barricade stops ground walkers only once they cross it.
        const barrier = state.blockers.find(b => b.kind === 'barricade')!;
        for (const enemy of state.enemies.slice(-4)) enemy.distance = barrier.distance - .1;
        Object.assign(state.enemies.at(-2)!, { specialSlow: .4, specialSlowTicksLeft: 120 });
        Object.assign(state.enemies.at(-1)!, { burnDps: 4, burnTicksLeft: 120 });
        a.step(15);
        const snapshot = a.painted();
        const held = state.enemies.filter(e => e.type !== 'harpy' && e.distance === barrier.distance);
        if (held.length !== 4) throw Error(`Expected four held walkers on ${map}`);
        if (!snapshot.active || state.map.id !== map || new Set(state.enemies.map(e => e.type)).size !== 7
            || a.ui().special.guards.length !== 4) throw Error(`Incomplete review scene: ${map}`);
      }, map);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>(ready => requestAnimationFrame(() => requestAnimationFrame(() => ready())));
      });
      await page.screenshot({ path: `${output}/${map}-${layout}.jpg`, quality: 89, scale: 'css' });
      if (map === 'meadow' && !phone) {
        for (const boss of ['boss', 'grumblemaw'] as const) {
          const rect = await page.evaluate(type => {
            const a = window.__tarpit as TarpitTestApi;
            const key = type === 'boss' ? 'grumblefoot' : 'grumblemaw';
            const sprite = a.painted().sprites.find(s => s.visible && s.key.includes(':' + key + ':'))!;
            return a.canvasToPage(sprite.x, sprite.y);
          }, boss);
          const width = 320, height = 210;
          const x = Math.max(0, Math.min(960 - width, Math.round(rect.x - width/2)));
          const y = Math.max(0, Math.min(580 - height, Math.round(rect.y - height * .65)));
          await page.screenshot({ path: `${output}/${boss === 'boss' ? 'assessor' : 'king'}.jpg`,
            clip: { x, y, width, height }, quality: 93, scale: 'css' });
        }
      }
      assert.equal(await page.evaluate(() => window.__tarpit!.scene!()), 'game');
    }
    await page.close();
  }
} finally { await browser.close(); }
