import { expect, test, type Page } from '@playwright/test';
import {
  allowedTowers, availableSpecials, BOON_OFFER_WAVES, buildableCells, cellFromKey, continueEndless,
  createGame, DIFFICULTIES, gameWaveDef, grantCheatGold, lastSpawnTick, lastWave,
  LEVELS, MAP_IDS, maxTowerLevel, positionAlongPath, removeDead, spawnTick, startWave,
  tick, TOWER_DEFS, TOWER_PATHS, type CreateGameOptions, type GameState, type TowerType, type UpgradePath,
} from '../src/sim';
import { KEEP_LEVELS } from '../src/sim/keepLevels';
import { createKeep } from '../src/sim/oldKeep';
import { ENDLESS_BASE_WAVES } from '../src/sim/waves';
import type { GameScene } from '../src/game/GameScene';
import type { Town } from '../src/game/decor/town';
import type { PaintedSkin } from '../src/game/skin/painted';
import { press } from './campaign';
import { waitForFirstScreen, waitForTitle } from './title';

const levels = [...LEVELS, ...KEEP_LEVELS];
const cases = [
  ...levels.map(level => ({ name: 'level ' + level.id, options: { level } })),
  ...MAP_IDS.flatMap(map => DIFFICULTIES.map(difficulty => ({ name: map + ' ' + difficulty, options: { map, difficulty } }))),
  { name: 'Showpiece', options: { map: 'meadow' }, showpiece: true },
  { name: 'Old Keep exhibition', options: {}, exhibition: true },
  { name: 'Owner campaign level 25', options: { level: KEEP_LEVELS.at(-1)! }, owner: true },
] satisfies { name: string; options: CreateGameOptions; exhibition?: boolean; showpiece?: boolean; owner?: boolean }[];

type Visit = (typeof cases)[number];

async function enter(page: Page, visit: Visit) {
  const { level, map, difficulty } = visit.options as CreateGameOptions;
  const owner = 'owner' in visit && visit.owner;
  await page.addInitScript(ids => {
    localStorage.setItem('tarpit.seenSiegeBroadsides', '["thirdAct"]');
    localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 2,
      stars: Object.fromEntries(ids.map(id => [id, 3])) }));
  }, owner ? [] : levels.slice(0, -1).map(level => level.id));
  const query = new URLSearchParams({
    test: '1', ui: 'new', look: 'showpiece' in visit ? 'showpiece' : 'painted',
    ...(owner ? { owner: '1' } : { act3: '1' }),
    ...('exhibition' in visit ? { keep: '1' } : {}),
  });
  await page.goto('/?' + query);
  if (level) {
    await waitForFirstScreen(page);
    if (owner) expect(await page.evaluate(() => window.__tarpit!.uiRects()['title:owner'])).toBeTruthy();
    await press(page, 'title:campaign');
    await page.waitForFunction(() => window.__tarpit?.titleReady() && window.__tarpit.screen?.() === 'levelMap');
    const stop = 'title:stop:' + level.id;
    if (!await page.evaluate(stop => !!window.__tarpit!.uiRects()[stop], stop)) {
      await press(page, 'title:act:' + (level.id <= 10 ? 1 : level.id <= 20 ? 2 : 3));
      await page.waitForFunction(stop => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()[stop], stop);
    }
    await press(page, stop);
    await page.waitForFunction(() => window.__tarpit?.titleReady() && window.__tarpit.screen?.() === 'levelCard');
  } else if (!('exhibition' in visit)) {
    await waitForTitle(page);
    await press(page, 'title:map:' + map);
    if (difficulty) await press(page, 'title:' + difficulty);
  }
  if (!('exhibition' in visit)) await press(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && !!window.__tarpit.uiRects().startWave);
}

function battleInputs(state: GameState) {
  const normalWaves = lastWave(state);
  const endless = !state.level && !state.fixedWaves;
  const enemies = new Map<GameState['enemies'][number]['type'], GameState['enemies'][number]>();
  const offers: NonNullable<GameState['pendingBoon']>[] = [];

  for (let wave = 1; wave <= normalWaves + (endless ? ENDLESS_BASE_WAVES.length : 0); wave++) {
    if (endless && wave === normalWaves + 1) {
      state.phase = 'won';
      expect(continueEndless(state).ok).toBe(true);
    }
    state.phase = 'setup';
    state.pendingBoon = null;
    expect(startWave(state).ok).toBe(true);
    const { groups } = gameWaveDef(state, wave);
    // Spawn one representative of each group through the actual tick code.
    // Lethal damage also crosses each pack-call threshold and drains its spawn queue.
    for (const [index, group] of groups.entries()) {
      state.waveTick = spawnTick(group, 0);
      state.spawnedPerGroup = groups.map((other, i) => i === index ? 0 : other.count);
      tick(state);
      for (const enemy of state.enemies) {
        enemies.set(enemy.type, { ...enemy });
        enemy.hp = 0;
      }
      removeDead(state, 'special');
      while (state.packs.length) {
        state.waveTick = Math.min(...state.packs.map(pack => pack.nextTick));
        tick(state);
        for (const enemy of state.enemies) enemies.set(enemy.type, { ...enemy });
        state.enemies = [];
      }
    }
    state.waveTick = lastSpawnTick(wave, state) + 1;
    state.spawnedPerGroup = groups.map(group => group.count);
    tick(state);
    if (state.pendingBoon) offers.push(state.pendingBoon);
  }
  expect(offers).toHaveLength(state.level?.rewardWaves.length ?? (endless ? BOON_OFFER_WAVES.length : 0));
  const kit = () => ({
    towers: allowedTowers(state).map(type => ({
      type, max: maxTowerLevel(state), paths: Object.keys(TOWER_PATHS[type]).filter(key => key !== 'cost') as UpgradePath[],
    })),
    specials: availableSpecials({ ...state, wave: normalWaves }).map(type => ({
      type,
      wave: Array.from({ length: normalWaves }, (_, i) => i + 1)
        .find(wave => availableSpecials({ ...state, wave }).includes(type))!,
    })),
  });
  const normal = kit();
  state.phase = 'setup';
  expect(grantCheatGold(state).ok).toBe(true);
  return {
    enemies: [...enemies.values()], offers, normal, cheated: kit(),
    cells: [...buildableCells(state.map).entries()].flatMap(([key, open]) => open ? [cellFromKey(key)] : []),
    target: positionAlongPath(state.map, 160),
    icons: Object.keys(TOWER_DEFS) as TowerType[],
  };
}

for (const visit of cases) {
  test('Lifted roster covers ' + visit.name, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'warning' && msg.text().startsWith('Painted sheet is missing')) errors.push(msg.text()); });
    await enter(page, visit);
    const source = 'exhibition' in visit ? createKeep() : createGame(visit.options);
    const input = battleInputs(source);
    const missing = await page.evaluate(async ({ input, expected }) => {
      const api = window.__tarpit!;
      const scene = api.game.scene.getScene('game') as GameScene;
      const { painted, town } = scene as unknown as { painted: PaintedSkin; town: Town };
      const state = scene.state;
      if (!painted?.assets.sharp || state.map.id !== expected.map || state.level?.id !== expected.level ||
        state.difficulty !== expected.difficulty || !!scene.showpieceState() !== expected.showpiece) throw new Error('Wrong roster visit');

      const missing = new Set<string>();
      const registered = (sheet: ReturnType<PaintedSkin['sheet']> | undefined) =>
        sheet && scene.textures.exists(sheet.key);
      const sheet = painted.sheet.bind(painted);
      let icon = false;
      // Observe the actual drawing calls. Give older builds a harmless pose
      // after recording a miss so one gap cannot hide the rest of the roster.
      painted.sheet = name => {
        const supplied = painted.assets.sheets[name] ?? (icon ? painted.assets.sharp?.icons[name] : undefined);
        if (registered(supplied)) return sheet(name);
        missing.add((icon ? 'icon ' : '') + name);
        const standIn = Object.values(painted.assets.sheets).find(entry => entry?.bodyBounds);
        if (!standIn) throw new Error('No registered piece to continue the roster audit');
        return { ...standIn, frames: 1 };
      };
      const shot = painted.projectile.bind(painted);
      painted.projectile = (...args) => {
        const drew = shot(...args);
        if (!drew) missing.add('projectile ' + args[0]);
        return drew;
      };
      icon = true;
      for (const type of input.icons) {
        const image = painted.towerIcon(type, 40, 34);
        if (!scene.textures.exists(image.texture.key)) missing.add('unregistered icon ' + type);
        image.destroy();
      }
      icon = false;

      // Real event/draw paths for enemies and their shadows, special effects,
      // placement and tower poses. The renderer supplies the logical sheet names.
      state.enemies = input.enemies.map((enemy, i) => ({ ...enemy, id: i, distance: 120, hp: enemy.hp / 2 }));
      state.nextEnemyId = input.enemies.length;
      scene.advance(0);
      state.enemies = [];
      scene.advance(0);

      const requireOk = (result: { ok: boolean }, action: string) => {
        if (!result.ok) throw new Error(action + ': ' + JSON.stringify(result));
      };
      function testKit(kit: typeof input.normal) {
        state.phase = 'setup';
        state.gold = 1e6;
        for (const { type, max, paths } of kit.towers) {
          for (const path of max === 3 ? paths : [undefined]) {
            const cell = input.cells.find(({ col, row }) => scene.build({ col, row }, type).ok);
            if (!cell) throw new Error('No buildable cell for ' + type);
            painted.drawGhost(type, input.target, 1);
            painted.clearGhost();
            for (let level = 1; level <= max; level++) {
              if (level > 1) requireOk(scene.upgrade(cell, level === 3 ? path : undefined), 'upgrade ' + type);
              painted.beginEffects();
              painted.frozenShot(type, input.target, { x: input.target.x + 40, y: input.target.y }, .5);
              painted.endEffects();
            }
            requireOk(scene.sell(cell), 'sell ' + type);
          }
        }
        for (const { type, wave } of kit.specials) {
          state.phase = 'setup';
          state.wave = wave - 1;
          state.specialRechargeTicks = 0;
          requireOk(scene.startWave(), 'start for ' + type);
          requireOk(scene.useSpecialAt(type, input.target.x, input.target.y), 'cast ' + type);
          scene.advance(1);
        }
      }

      // The HUD calls towerIcon during redraws too. These calls are allowed
      // to use the preloaded previews while battlefield calls must use poses.
      const towerIcon = painted.towerIcon.bind(painted);
      painted.towerIcon = (...args) => {
        icon = true;
        try { return towerIcon(...args); } finally { icon = false; }
      };
      testKit(input.normal);
      state.phase = 'setup';
      requireOk(scene.cheatGold(), 'unlock kit');
      await (painted as unknown as { unlock?: Promise<void> }).unlock;
      testKit(input.cheated);

      for (const offer of input.offers) {
        for (const id of offer.options) {
          state.boons = [];
          state.pendingBoon = offer;
          scene.advance(0);
          requireOk(scene.pickBoon(id), 'pick ' + id);
        }
      }
      if (state.map.id !== 'keep') {
        town.sacks.release(1, 0);
        // Visit both the still-frame ending and the animated banner branch.
        Object.defineProperty(town, 'test', { value: false });
        state.phase = 'won';
        town.update(state, 0);
        state.phase = 'lost';
        state.lives = 0;
        town.update(state, 0);
      }
      return [...missing].sort();
    }, { input, expected: { map: source.map.id, level: source.level?.id, difficulty: source.difficulty, showpiece: 'showpiece' in visit } });
    expect({ missing, errors }).toEqual({ missing: [], errors: [] });
  });
}
