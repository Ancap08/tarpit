import type Phaser from 'phaser';
import type { GameScene } from '../src/game/GameScene';

export function measureRentBattle({ wave, fallen, towers, stride = 1, animated = false }: {
  wave: number; fallen: boolean; towers: boolean; stride?: number; animated?: boolean;
}) {
  const api = window.__tarpit!;
  const scene = api.game.scene.getScene('game') as GameScene;
  const { state, boardLayout: layout } = scene;
  const gate = state.gate!;
  const sill = layout.toScreen(gate);
  state.wave = wave - 1;
  state.lives = 1000;
  if (fallen) {
    gate.hp = 0;
    gate.fallen = true;
  }
  if (towers) {
    state.gold = 1000;
    const sites = state.map.buildSites!;
    for (const [i, type] of [[3, 'longbow'], [8, 'musketeer'], [2, 'musketeer'],
      [9, 'cannon'], [5, 'longbow'], [7, 'longbow']] as const) {
      if (!scene.build(sites[i], type).ok) throw new Error('The six-tower fixture could not build');
    }
  }
  if (!api.startWave!().ok) throw new Error(`Wave ${wave} did not start`);

  type Image = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  type Shape = { points: number[]; ink: Set<number>; height: number; x: number; y: number; w: number; h: number };
  const pitch = 4096;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const cached = new Map<string, Shape>();
  function shape(image: Image, wood = false): Shape {
    const { frame, scaleX, scaleY, displayOriginX, displayOriginY } = image;
    const flip = 'flipX' in image && image.flipX;
    const key = [image.texture.key, frame.name, scaleX, scaleY, flip, wood].join('|');
    let pose = cached.get(key);
    if (!pose) {
      const w = canvas.width = Math.ceil(frame.cutWidth * scaleX);
      const h = canvas.height = Math.ceil(frame.cutHeight * scaleY);
      if (flip) ctx.setTransform(-1, 0, 0, 1, w, 0);
      ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, w, h);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const points: number[] = [];
      let top = h, bottom = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const [r, g, b, a] = rgba.subarray(i, i + 4);
        if (a < 128 || wood && (r < g * 1.12 || r < b * 1.32)) continue;
        points.push(y * pitch + x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      pose = { points, ink: new Set(points), height: bottom - top + 1, x: 0, y: 0, w, h };
      cached.set(key, pose);
    }
    const matrix = image.getWorldTransformMatrix();
    const localX = flip ? displayOriginX - frame.x - frame.cutWidth : frame.x - displayOriginX;
    return { ...pose, x: Math.round(matrix.tx + localX * scaleX), y: Math.round(matrix.ty + (frame.y - displayOriginY) * scaleY) };
  }
  function overlap(a: Shape, b: Shape): number {
    if (a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y) return 0;
    const [small, large] = a.points.length <= b.points.length ? [a, b] : [b, a];
    const delta = (small.y - large.y) * pitch + small.x - large.x;
    let hits = 0;
    for (const p of small.points) if (large.ink.has(p + delta)) hits++;
    return hits;
  }
  function covered(subject: Shape, others: Shape[]): number {
    const nearby = others.filter(b => subject.x + subject.w > b.x && b.x + b.w > subject.x
      && subject.y + subject.h > b.y && b.y + b.h > subject.y);
    let count = 0;
    for (const p of subject.points) if (nearby.some(b => b.ink.has(p + (subject.y - b.y) * pitch + subject.x - b.x))) count++;
    return count / subject.points.length;
  }
  const sprites = scene['enemySprites']['views'];
  const sign = scene['rentHeldBadge']!;
  const gateArt = scene['keep']!.outerGate!;
  const door = shape(gateArt, true);
  const gateShape = shape(gateArt);
  let doorCover = 0, gateCover = 0, gatePair = 0, roadPair = 0, towerCover = 0, sizeRatio = Infinity;
  let groundPair = 0, countMatches = true, sawArrivals = false, maxFeet = 0, gateTick = 0, roadTick = 0, towerTick = 0, worstScore = -1;
  let nearCount = 0, touchGate = 0;
  let roadTypes = '', gateTypes = '', countMismatch = '';
  for (let elapsed = stride; elapsed <= 4500 && state.phase === 'wave'; elapsed += stride) {
    if (!fallen) {
      gate.hp = gate.maxHp;
      // Keep the 60-second forced siege break out of this full-health fixture.
      for (const enemy of state.enemies) if (enemy.blockedTicks) enemy.blockedTicks = 0;
    }
    scene.advance(stride);
    const actors = state.enemies.flatMap(enemy => {
      const view = sprites.get(enemy.id)!;
      if (!view.sprite.visible) return [];
      const { sprite } = view;
      if (animated) {
        const frozen = Number(sprite.frame.name);
        const frame = frozen + Math.floor(enemy.distance / 6) % 4;
        if (sprite.texture.has(String(frame))) sprite.setFrame(frame);
      }
      return [{ enemy, view, mask: shape(sprite) }];
    });
    if (!fallen) {
      const candidates = state.enemies.filter(e => e.type !== 'harpy' && Math.abs(e.distance - gate.distance) <= 40);
      const held = candidates.filter(e => e.distance === gate.distance);
      if (held.length) {
        const near = actors.filter(a => Math.hypot(a.view.sprite.x - sill.x, a.view.sprite.y - sill.y) <= 110);
        const masks = near.map(a => a.mask);
        const cover = covered(door, masks);
        const whole = covered(gateShape, masks);
        gateCover = Math.max(gateCover, whole);
        doorCover = Math.max(doorCover, cover);
        const shown = sign['badge'].visible ? Number(sign['number'].text) : 0;
        if (countMatches && shown !== candidates.length) countMismatch = `${shown}/${candidates.length} @ ${elapsed}`;
        countMatches &&= shown === candidates.length;
        sawArrivals ||= candidates.length > held.length;
        for (const { enemy, view } of near) if (enemy.distance === gate.distance && !view.flying && view.trueFoot) {
          maxFeet = Math.max(maxFeet, Math.hypot(view.trueFoot.x - view.sprite.x, view.trueFoot.y - view.sprite.y));
        }
        let pair = 0;
        for (const [i, a] of near.entries()) for (const b of near.slice(i + 1)) {
          const ratio = overlap(a.mask, b.mask) / Math.min(a.mask.points.length, b.mask.points.length);
          pair = Math.max(pair, ratio);
          if (!a.view.flying && !b.view.flying) groundPair = Math.max(groundPair, ratio);
          if (ratio > gatePair) {
            gatePair = ratio;
            gateTypes = `${a.enemy.type}/${b.enemy.type} @ ${elapsed} (${Math.round(a.enemy.distance - gate.distance)},${Math.round(b.enemy.distance - gate.distance)})`;
          }
        }
        const score = cover + whole * .2 + pair * .4 + shown * .0001;
        if (score > worstScore) {
          worstScore = score;
          gateTick = elapsed;
          nearCount = near.length;
          touchGate = masks.filter(m => overlap(m, gateShape) > 0).length;
        }
      }
      continue;
    }
    // Harpies have a separate air layer and move in flights. Compare walkers
    // along the ground road, including unlike neighbours in wave 6.
    const walkers = actors.filter(a => a.enemy.type !== 'harpy');
    for (const [i, a] of walkers.entries()) for (const b of walkers.slice(i + 1)) {
      const pair = overlap(a.mask, b.mask) / Math.min(a.mask.points.length, b.mask.points.length);
      if (pair > roadPair) {
        roadPair = pair;
        roadTick = elapsed;
        roadTypes = `${a.enemy.type}/${b.enemy.type} (${Math.round(a.enemy.distance)},${Math.round(b.enemy.distance)})`;
      }
    }
    if (!towers || !actors.length) continue;
    for (const tower of scene['painted']!['towers'].values()) {
      const body = shape(tower);
      const local = walkers.filter(a => Math.hypot(a.view.sprite.x - tower.x, a.view.sprite.y - tower.y) < 90);
      const bigger = Math.max(1, ...local.map(a => a.mask.height));
      sizeRatio = Math.min(sizeRatio, body.height / bigger);
      const display: readonly object[] = scene.children.list;
      const front = actors.filter(a => a.view.sprite.displayList === tower.displayList
        ? a.view.sprite.depth >= tower.depth
        : display.indexOf(a.view.sprite.displayList) > display.indexOf(tower.displayList));
      const fraction = covered(body, front.map(a => a.mask));
      if (fraction > towerCover) {
        towerCover = fraction;
        towerTick = elapsed;
      }
    }
  }
  return { doorCover, gateCover, gatePair, roadPair, towerCover, sizeRatio, countMatches, sawArrivals,
    maxFeet, gateTick, roadTick, towerTick, nearCount, touchGate, roadTypes, gateTypes, countMismatch, groundPair };
}

export function measureGateSockets() {
  const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
  const gate = scene['keep']!.outerGate!;
  const frame = gate.frame;
  const matrix = gate.getWorldTransformMatrix();
  const canvas = document.createElement('canvas');
  canvas.width = frame.cutWidth;
  canvas.height = frame.cutHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
    0, 0, frame.cutWidth, frame.cutHeight);
  const pixel = (col: number, row: number, dx: number, dy: number) => {
    const p = scene.boardLayout.cellCenter({ col, row });
    return ctx.getImageData(Math.round(p.x - matrix.tx + gate.displayOriginX + dx),
      Math.round(p.y - matrix.ty + gate.displayOriginY + dy), 1, 1).data;
  };
  const masonry = ([r, g, b, a]: Uint8ClampedArray) => a >= 225 && r < g * 1.12 && Math.abs(r - b) <= 36;
  let groundIntrusion = 0, highAbove = 0, highSupport = 0;
  for (let x = -16; x <= 16; x += 2) {
    for (let y = -10; y <= 10; y += 2) {
      if ((x / 16) ** 2 + (y / 11) ** 2 <= 1 && masonry(pixel(22, 10, x, y))) groundIntrusion++;
    }
    for (let y = -25; y <= -12; y += 2) if (pixel(22, 7, x, y)[3] >= 225) highAbove++;
    for (let y = 9; y <= 19; y += 2) if (masonry(pixel(22, 7, x, y))) highSupport++;
  }
  return { groundIntrusion, highAbove, highSupport };
}
