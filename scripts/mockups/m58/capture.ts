// Get untouched production screenshots and board coordinates for the two stills.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import keepSite from '../../../src/sim/keepSite.json' with { type: 'json' };

const scratch = process.argv[2];
assert.ok(scratch, 'Supply the M58 scratch directory.');
assert.equal(process.env.PW_PORT, '4576');
const port = 4576;
const server = await preview({ build: { outDir: join(scratch, 'build') }, logLevel: 'error',
  preview: { host: '127.0.0.1', port, strictPort: true } });
try {
  const browser = await chromium.launch();
  try {
    for (const [name, width, height] of [['phone', 390, 656], ['wide', 1280, 800]] as const) {
      const page = await browser.newPage({ viewport: { width, height },
        ...(name === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}) });
      try {
        await page.goto(`http://127.0.0.1:${port}/?test=1&ui=new&owner=1&keep=21`);
        await page.waitForFunction(() => !!window.__tarpit?.keep?.() && !!window.__tarpit.uiRects().gate);
        await page.evaluate(() => document.fonts.ready.then(() => true));
        for (const phase of ['setup', 'gate'] as const) {
          if (phase === 'gate') {
            await page.evaluate(() => {
              const game = window.__tarpit!;
              if (!game.startWave!().ok) throw Error('Wave 1 failed to start');
              game.step!(567);
              game.step!(567);
              game.step!(566);
            });
          }
          if (name === 'phone' || phase === 'gate') {
            await page.screenshot({ path: join(scratch, `today-${name}-${phase}.png`), scale: 'css' });
          }
          const data = await page.evaluate(source => {
            const api = window.__tarpit!;
            const { map, level, gate, towers, enemies, waveTick, phase } = api.state!();
            const project = ({ x, y }: { x: number; y: number }) => api.worldToPage(x, y);
            return {
              level: level?.id, waveTick, phase, towers: towers.length,
              gate: { ...project(gate!), hp: gate!.hp, distance: gate!.distance },
              sites: map.buildSites!.map(({ col, row }) => ({
                ...api.cellToPage!(col, row),
                high: map.highSites!.some(cell => cell.col === col && cell.row === row),
              })),
              road: map.path.map(project),
              westRoad: [...source.otherRoads[0].approach, map.path[source.otherRoads[0].joinIndex]].map(project),
              enemies: enemies.map(({ id, type, distance }) => {
                let remaining = distance;
                for (const [index, a] of map.path.slice(0, -1).entries()) {
                  const b = map.path[index + 1];
                  const length = Math.hypot(b.x - a.x, b.y - a.y);
                  if (remaining <= length && length) {
                    return { id, type, distance, ...project({
                      x: a.x + (b.x - a.x) * remaining / length,
                      y: a.y + (b.y - a.y) * remaining / length,
                    }) };
                  }
                  remaining -= length;
                }
                throw Error('Enemy falls outside the level 21 trail');
              }),
              blockade: project(source.otherRoads[0].approach[2]),
            };
          }, keepSite);
          assert.equal(data.level, 21);
          assert.equal(data.towers, 0);
          assert.equal(data.waveTick, phase === 'setup' ? 0 : 1700);
          if (phase === 'gate') {
            assert.equal(data.enemies.length, 32);
            assert.equal(data.enemies.filter(enemy => enemy.distance === data.gate.distance).length, 21);
          }
          await writeFile(join(scratch, `${name}-${phase}.json`), JSON.stringify(data, null, 2));
        }
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
} finally { await server.close(); }
