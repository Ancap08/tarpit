import Phaser from 'phaser';
import { allowedTowers, specialAllowed, WAVES, type GameState, type LevelDef, type TowerType } from '../../sim';
import { enemyArt, towerArt } from './frames';
import type { PaintedAssets, PaintedName } from './loading';
import { inkRentEnemy } from '../keep/stoneLight';
import layoutUrl from '../../../assets/art-painted/sharp/layout.json?url&no-inline';

const IMAGES = import.meta.glob<string>('../../../assets/art-painted/sharp/*.webp', {
  eager: true, import: 'default', query: '?url&no-inline',
});
const SCENERY = ['cave', 'cottage', 'town', 'sack', 'royal-hoist', 'tossed-hat', 'oak', 'spruce', 'birch', 'bush', 'berry-bush'] as const;
export const PAINTED_SHOTS = {
  musketeer: 'cannonball', cannon: 'cannonball', mortar: 'mortar-shell',
  tarpit: 'tar-glob', longbow: 'arrow', firepot: 'flame',
} as const;

interface Entry {
  atlas: string;
  moonAtlas?: string;
  density: number;
  frameSize: number[];
  anchor: number[];
  regions: number[][];
  bodyBounds?: number[][];
}
type Sheet = NonNullable<PaintedAssets['sheets'][PaintedName]>;
type Sheets = Partial<Record<PaintedName, Sheet>>;
type LoadImage = (url: string) => Promise<HTMLImageElement>;

export interface SharpArt {
  sheets: Sheets;
  icons: Sheets;
  onDemand?: (signal: AbortSignal) => Promise<void>;
}

function towerEntries(towers: readonly TowerType[], density: number, siege: boolean) {
  return new Map<PaintedName, string>(towers.flatMap(type => [
    [towerArt(type), `${towerArt(type)}-${density}x`],
    type === 'mortar' && siege ? ['notice', 'notice-keep'] : [PAINTED_SHOTS[type], `${PAINTED_SHOTS[type]}-${density}x`],
  ]));
}

function register(
  textures: Phaser.Textures.TextureManager, atlas: HTMLImageElement, entry: Entry, key: string, hit: boolean, rentOverdue: boolean,
): Sheet {
  // Shared scenery and icon packs become small logical textures. A piece
  // gets one tightly packed texture, including its source-atop hit flash.
  const left = Math.min(...entry.regions.map(r => r[0])) - 1;
  const top = Math.min(...entry.regions.map(r => r[1])) - 1;
  const width = Math.max(...entry.regions.map(r => r[0] + r[2])) - left + 1;
  const height = Math.max(...entry.regions.map(r => r[1] + r[3])) - top + 1;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = hit ? height * 2 : height;
  const ctx = canvas.getContext('2d');
  if (!ctx || left < 0 || top < 0 || left + width > atlas.naturalWidth || top + height > atlas.naturalHeight) {
    throw new Error(`Invalid sharp painted sheet: ${key}`);
  }
  if (entry.atlas === 'scenery' || entry.atlas === 'tower-icons') {
    // The enclosing rectangle may also contain another sheet's tiles.
    // Copy only our frames so relighting or linear filtering cannot see them.
    for (const [x, y, w, h] of entry.regions) ctx.drawImage(atlas, x, y, w, h, x - left, y - top, w, h);
  } else {
    ctx.drawImage(atlas, left, top, width, height, 0, 0, width, height);
  }
  if (hit) {
    if (rentOverdue) inkRentEnemy(ctx, entry.density);
    ctx.drawImage(canvas, 0, 0, width, height, 0, height, width, height);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(0, height, width, height);
  }
  const texture = textures.create(key, canvas);
  if (!texture) throw new Error(`Could not register ${key}`);
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  const frameSize = entry.frameSize as Sheet['frameSize'];
  for (const [i, [x, y, w, h, dx, dy]] of entry.regions.entries()) {
    texture.add(i, 0, x - left, y - top, w, h)!.setTrim(...frameSize, dx, dy, w, h);
    if (hit) texture.add(entry.regions.length + i, 0, x - left, y - top + height, w, h)!
      .setTrim(...frameSize, dx, dy, w, h);
  }
  return {
    key, density: entry.density, frameSize, anchor: entry.anchor as Sheet['anchor'],
    frames: entry.regions.length, bodyBounds: entry.bodyBounds as Sheet['bodyBounds'],
  };
}

async function loadSheets(
  textures: Phaser.Textures.TextureManager, catalogue: Record<string, Entry>,
  entries: Map<PaintedName, string>, hit: ReadonlySet<PaintedName>,
  loadImage: LoadImage, signal: AbortSignal, registered: string[], mark: () => void, moonlit = false, rentOverdue = false,
): Promise<Sheets> {
  const result: Sheets = {};
  const byAtlas = new Map<string, [PaintedName, string][]>();
  for (const [name, id] of entries) {
    const entry = catalogue[id];
    const atlas = moonlit ? entry.moonAtlas ?? entry.atlas : entry.atlas;
    if (!byAtlas.has(atlas)) byAtlas.set(atlas, []);
    byAtlas.get(atlas)!.push([name, id]);
  }
  await Promise.all([...byAtlas].map(async ([atlas, group]) => {
    const image = await loadImage(IMAGES[`../../../assets/art-painted/sharp/${atlas}.webp`]);
    try {
      signal.throwIfAborted();
      for (const [name, id] of group) {
        const key = `painted:sharp:${id}`;
        result[name] = register(textures, image, catalogue[id], key, hit.has(name), rentOverdue);
        registered.push(key);
      }
      mark();
    } finally {
      image.removeAttribute('src');
    }
  }));
  return result;
}

async function loadCatalogue(signal: AbortSignal): Promise<Record<string, Entry>> {
  const response = await fetch(layoutUrl, { signal });
  if (!response.ok) throw new Error(`Sharp painted layout returned ${response.status}`);
  return response.json();
}

function iconEntries(towers: readonly TowerType[]): Map<PaintedName, string> {
  return new Map(towers.map(type => [towerArt(type), `${towerArt(type)}-icon`]));
}

export async function loadSharpIcons(textures: Phaser.Textures.TextureManager, loadImage: LoadImage,
  signal: AbortSignal, registered: string[]): Promise<Sheets> {
  const catalogue = await loadCatalogue(signal);
  return loadSheets(textures, catalogue, iconEntries(allowedTowers({ cheated: true })),
    new Set(), loadImage, signal, registered, () => {});
}

export async function loadSharpArt(
  textures: Phaser.Textures.TextureManager, level: LevelDef | undefined, keep: boolean, siege: boolean,
  fixed: Pick<GameState, 'fixedWaves' | 'fixedSpecialUnlocks'> | undefined,
  loadImage: LoadImage, signal: AbortSignal, registered: string[], onProgress: (fraction: number) => void,
  loadExtra: (url: string, signal: AbortSignal) => Promise<HTMLImageElement>,
): Promise<SharpArt> {
  const catalogue = await loadCatalogue(signal);
  const density = keep ? 3 : 2;
  const moonlit = keep && siege && level?.keepSky === 'night storm';
  const open = allowedTowers({ level, cheated: false });
  const all = allowedTowers({ cheated: true });
  const locked = all.filter(type => !open.includes(type));
  const entries = towerEntries(open, density, siege);
  const waves = level?.waves ?? fixed?.fixedWaves ?? WAVES;
  const enemies = new Set(waves.flatMap(wave => wave.groups.map(group => group.type)));
  if (enemies.has('grumblemaw')) enemies.add('wolf');
  const hits = new Set<PaintedName>();
  for (const type of enemies) {
    if (type === 'ram' && siege) {
      entries.set('ram', 'ram-keep');
    } else {
      const name = enemyArt(type);
      const enemyDensity = keep && type !== 'harpy' ? type === 'grumblemaw' ? 3.25 : 4 : density;
      entries.set(name, `${name}-${enemyDensity}x`);
      hits.add(name);
    }
  }
  if (enemies.has('harpy')) entries.set('harpy-shadow', 'harpy-shadow-2x');
  // A cheat can make Guards usable on the same tick. Have their sheet ready
  // even on a level that grants them only through the normal wave unlock.
  if (specialAllowed({ level, wave: waves.length, cheated: true, fixedSpecialUnlocks: fixed?.fixedSpecialUnlocks }, 'guards')) {
    entries.set('guard', keep ? 'guard-4x' : 'guard-2x');
  }
  if (!siege) for (const scenery of SCENERY) {
    if (!keep || ['town', 'sack', 'royal-hoist', 'tossed-hat'].includes(scenery)) entries.set(scenery, scenery);
  }
  const icons = iconEntries(keep ? all : locked);
  const total = new Set([...entries.values(), ...icons.values()].map(id => catalogue[id].atlas)).size;
  let complete = 0;
  const mark = () => onProgress(++complete / total);
  const [sheets, previews] = await Promise.all([
    loadSheets(textures, catalogue, entries, hits, loadImage, signal, registered, mark, moonlit, level?.id === 21),
    loadSheets(textures, catalogue, icons, new Set(), loadImage, signal, registered, mark),
  ]);
  return {
    sheets, icons: previews,
    onDemand: locked.length ? async signal => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const timeout = setTimeout(abort, 25_000);
      signal.addEventListener('abort', abort, { once: true });
      const request = controller.signal;
      const extra = towerEntries(locked, density, siege);
      for (const name of extra.keys()) if (sheets[name]) extra.delete(name);
      const added: string[] = [];
      try {
        const additional = await loadSheets(textures, catalogue, extra, new Set(), url => loadExtra(url, request), request, added, () => {}, moonlit);
        Object.assign(sheets, additional);
      } catch {
        controller.abort();
        for (const key of added) textures.remove(key);
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
      }
    } : undefined,
  };
}
