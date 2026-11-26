import Phaser from 'phaser';
import { ENEMY_STATS, MAP_HEIGHT, MAP_WIDTH, type EnemyType, type LevelDef, type MapId } from '../../sim';
import { enemyArt } from './frames';
import { waitForWorkerControl } from '../../sw/register';
import type { PaintedDensity } from './look';

const FRAME_COUNTS = {
  cave: 4, cottage: 1, town: 14, sack: 1, 'royal-hoist': 4, 'tossed-hat': 4, oak: 4, spruce: 1, birch: 1, bush: 1, 'berry-bush': 1,
  musketeer: 16, cannon: 16, 'tar-pit': 16, longbow: 16, mortar: 16, 'fire-pot': 16,
  goblin: 16, wolf: 16, troll: 16, harpy: 16, shieldbearer: 16, grumblefoot: 16, grumblemaw: 16,
  guard: 32, 'harpy-shadow': 1, arrow: 1, cannonball: 1, 'tar-glob': 1, 'mortar-shell': 1, flame: 1,
} as const;

export type PaintedName = keyof typeof FRAME_COUNTS;

const enemySheets = new Set<PaintedName>((Object.keys(ENEMY_STATS) as EnemyType[]).map(enemyArt));
const SHEET_NAMES = Object.keys(FRAME_COUNTS) as PaintedName[];
const WORLD_SCENERY = new Set<PaintedName>([
  'cave', 'cottage', 'town', 'sack', 'royal-hoist', 'tossed-hat', 'oak', 'spruce', 'birch', 'bush', 'berry-bush',
]);
const ART = import.meta.glob<string>('../../../assets/art-painted/packed/*.{webp,json}', {
  eager: true,
  import: 'default',
  query: '?url&no-inline',
});

type Pair = [number, number];
type Bounds = [number, number, number, number];

export interface PaintedSheet {
  key: string;
  offset: Pair;
  frameSize: Pair;
  anchor: Pair;
  bodyBounds?: readonly Bounds[];
  columns: number;
  rows: number;
  frames: number;
}

export interface PaintedAssets {
  density: PaintedDensity;
  groundKey?: string;
  sheets: Readonly<Partial<Record<PaintedName, PaintedSheet>>>;
}

const loaded = new WeakMap<Phaser.Textures.TextureManager, Map<PaintedDensity, PaintedAssets['sheets']>>();
const LOAD_TIMEOUT_MS = 25_000;
const PROBE_TIMEOUT_MS = 2_000;

/** Switch between the full painted fields and the keep's battle pieces. */
export function releasePaintedTextures(textures: Phaser.Textures.TextureManager): void {
  loaded.delete(textures);
  for (const key of textures.getTextureKeys()) {
    if (key.startsWith('painted:') || key.startsWith('showpiece:pasture:')) textures.remove(key);
  }
}

function assetUrl(name: MapId | 'shared', density: PaintedDensity, extension: 'webp' | 'json'): string {
  return ART[`../../../assets/art-painted/packed/${name}-${density}x.${extension}`];
}

/** Read the 1× scouting art without registering the battle's sprite textures. */
export async function loadScoutingArt(map: MapId, signal: AbortSignal) {
  const names = ['cave', 'town', 'oak', 'spruce', 'birch', 'bush', 'berry-bush'] as const;
  const [ground, atlas, layout] = await Promise.all([
    getAsset(assetUrl(map, 1, 'webp'), signal).then(r => decodeImage(r, signal)),
    getAsset(assetUrl('shared', 1, 'webp'), signal).then(r => decodeImage(r, signal)),
    getAsset(assetUrl('shared', 1, 'json'), signal).then(r => r.json()),
  ]);
  const sheets = new Map<PaintedName, PaintedSheet>(names.map(name => [name, validateSheet(name, name, layout[name], atlas)]));
  return { ground, atlas, sheets };
}

interface ConnectionHints {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

function slowConnection(): boolean | undefined {
  const hints = (navigator as Navigator & { connection?: ConnectionHints }).connection;
  if (!hints) return undefined;
  if (hints.saveData || ['slow-2g', '2g', '3g'].includes(hints.effectiveType ?? '')) return true;
  if (hints.downlink !== undefined && hints.downlink > 0) return hints.downlink <= 2;
  return hints.effectiveType === '4g' ? false : undefined;
}

// A high-density phone may have warmed either set online. Reuse a complete
// cached set offline, even if its current connection hints have changed.
async function offlineDensity(map?: MapId): Promise<PaintedDensity> {
  const urls = [assetUrl('shared', 2, 'webp'), assetUrl('shared', 2, 'json')];
  if (map) urls.push(assetUrl(map, 2, 'webp'));
  const matches = await Promise.all(urls.map(url => caches.match(url, { ignoreVary: true })));
  return matches.every(Boolean) ? 2 : 1;
}

async function getAsset(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Painted asset returned ${response.status}`);
  return response;
}

async function decodeImage(response: Response, signal: AbortSignal): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(await response.blob());
  const image = new Image();
  const cancel = () => image.removeAttribute('src');
  try {
    signal.throwIfAborted();
    signal.addEventListener('abort', cancel, { once: true });
    image.src = url;
    await image.decode();
    return image;
  } finally {
    signal.removeEventListener('abort', cancel);
    URL.revokeObjectURL(url);
  }
}

function integers(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((n) => Number.isSafeInteger(n) && n >= 0);
}

function validateSheet(
  name: PaintedName, key: string, data: unknown, image: HTMLImageElement,
): PaintedSheet {
  if (!data || typeof data !== 'object') throw new Error(`Invalid painted sheet: ${name}`);
  const { frameSize, anchor, columns, frameOrder, bodyBounds, offset } = data as Record<string, unknown>;
  const frames = FRAME_COUNTS[name];
  if (!integers(offset, 2) || !integers(frameSize, 2) || !integers(anchor, 2) ||
    typeof columns !== 'number' || !Number.isSafeInteger(columns) || columns < 1 || columns > frames ||
    !Array.isArray(frameOrder) || frameOrder.length !== frames) {
    throw new Error(`Invalid painted sheet: ${name}`);
  }
  const [width, height] = frameSize;
  const [anchorX, anchorY] = anchor;
  const rows = Math.ceil(frames / columns);
  if (width < 1 || height < 1 || anchorX >= width || anchorY >= height ||
    offset[0] + width * columns > image.naturalWidth || offset[1] + height * rows > image.naturalHeight) {
    throw new Error(`Invalid painted sheet dimensions: ${name}`);
  }
  if ((frames === 16 || name === 'guard' || bodyBounds !== undefined) &&
    (!Array.isArray(bodyBounds) || bodyBounds.length !== frames ||
      bodyBounds.some((b) => !integers(b, 4) || b[0] >= b[2] || b[1] >= b[3] || b[2] > width || b[3] > height))) {
    throw new Error(`Invalid painted body bounds: ${name}`);
  }
  return {
    key,
    offset: [offset[0], offset[1]],
    frameSize: [width, height],
    anchor: [anchorX, anchorY],
    columns,
    rows,
    frames,
    bodyBounds: bodyBounds as Bounds[] | undefined,
  };
}

// Each logical sheet keeps its own Phaser texture and numeric frames. Splitting
// the decoded atlas once avoids uploading a full atlas per logical texture.
function registerSheets(textures: Phaser.Textures.TextureManager, atlas: HTMLImageElement, layout: unknown,
  density: PaintedDensity, registered: string[], names = SHEET_NAMES): PaintedAssets['sheets'] {
  if (!layout || typeof layout !== 'object') throw new Error('Invalid painted atlas layout');
  const sheets = names.map(name => validateSheet(name, `painted:${name}:${density}x`,
    (layout as Record<string, unknown>)[name], atlas));
  for (const [index, sheet] of sheets.entries()) {
    const [width, height] = sheet.frameSize;
    const canvas = document.createElement('canvas');
    canvas.width = width * sheet.columns;
    const sheetHeight = height * sheet.rows;
    const hasHitFrames = enemySheets.has(names[index]);
    canvas.height = hasHitFrames ? 2 * sheetHeight : sheetHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not unpack painted atlas');
    context.drawImage(atlas, ...sheet.offset, canvas.width, sheetHeight, 0, 0, canvas.width, sheetHeight);
    if (hasHitFrames) {
      // Bake a second set of poses locally for both renderers. Source-atop
      // preserves the exact alpha mask and 72% of the painted colour detail.
      context.drawImage(canvas, 0, 0, canvas.width, sheetHeight, 0, sheetHeight, canvas.width, sheetHeight);
      context.globalCompositeOperation = 'source-atop';
      context.fillStyle = 'rgba(255,255,255,0.28)';
      context.fillRect(0, sheetHeight, canvas.width, sheetHeight);
    }
    const texture = textures.create(sheet.key, canvas);
    if (!texture) throw new Error(`Could not register ${sheet.key}`);
    registered.push(sheet.key);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (let frame = 0; frame < sheet.frames; frame++) {
      const x = (frame % sheet.columns) * width;
      const y = Math.floor(frame / sheet.columns) * height;
      texture.add(frame, 0, x, y, width, height);
      if (hasHitFrames) texture.add(sheet.frames + frame, 0, x, y + sheetHeight, width, height);
    }
  }
  return Object.fromEntries(names.map((name, index) => [name, sheets[index]]));
}

export async function loadPainted(
  textures: Phaser.Textures.TextureManager, map: MapId, displayDensity: PaintedDensity,
  onProgress: (progress: number) => void, cancellation: AbortSignal,
  options?: { keep: true; siege?: LevelDef },
): Promise<PaintedAssets | undefined> {
  if (cancellation.aborted) return undefined;
  const siege = options?.siege;
  const existing = siege ? undefined : loaded.get(textures);
  function cached(density: PaintedDensity): PaintedAssets | undefined {
    const groundKey = `painted:${map}:${density}x`;
    const sheets = existing?.get(density);
    return sheets && textures.exists(groundKey) ? { density, groundKey, sheets } : undefined;
  }
  const warm = cached(displayDensity);
  if (warm) return warm;

  const controller = new AbortController();
  const signal = controller.signal;
  const cancel = () => controller.abort();
  cancellation.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, LOAD_TIMEOUT_MS);
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  const registered: string[] = [];
  try {
    if (!options?.keep) await Promise.race([waitForWorkerControl(), aborted]);
    signal.throwIfAborted();
    let density = displayDensity;
    let probe: Promise<HTMLImageElement> | undefined;
    const loadImage = (name: MapId | 'shared', scale: PaintedDensity) =>
      getAsset(assetUrl(name, scale, 'webp'), signal).then(r => decodeImage(r, signal));
    if (displayDensity === 2) {
      const slow = slowConnection();
      if (!navigator.onLine && typeof caches !== 'undefined') {
        density = await Promise.race([offlineDensity(siege ? undefined : map), aborted]);
      } else if (slow) {
        density = 1;
      } else if (slow === undefined && !existing?.has(2)) {
        probe = loadImage(siege ? 'shared' : map, 1);
        density = await Promise.race([aborted, probe.then(() => 2 as const),
          new Promise<1>(resolve => { probeTimer = setTimeout(() => resolve(1), PROBE_TIMEOUT_MS); })]);
        clearTimeout(probeTimer);
      }
    }
    const ready = cached(density);
    if (ready) return ready;
    const shared = existing?.get(density);
    const total = siege ? 2 : shared ? 1 : 3;
    let complete = 0;
    const mark = <T>(value: T): T => {
      if (!signal.aborted) onProgress(++complete / total);
      return value;
    };
    const [ground, atlas, layout] = await Promise.race([aborted, Promise.all([
      siege ? undefined : (density === 1 && probe ? probe : loadImage(map, density)).then(mark),
      shared ? undefined : (siege && density === 1 && probe ? probe : loadImage('shared', density)).then(mark),
      shared ? undefined : getAsset(assetUrl('shared', density, 'json'), signal).then(r => r.json()).then(mark),
    ])]);
    signal.throwIfAborted();
    if (siege) {
      const roster = new Set<PaintedName>(siege.waves.flatMap(wave => wave.groups.map(group => enemyArt(group.type))));
      if (siege.endingBoss === 'grumblemaw') roster.add('wolf');
      const pieces = SHEET_NAMES.filter(name => !WORLD_SCENERY.has(name) && (!enemySheets.has(name) || roster.has(name)));
      const sheets = registerSheets(textures, atlas!, layout, density, registered, pieces);
      atlas!.removeAttribute('src');
      return { density, sheets };
    }
    if (!ground || ground.naturalWidth !== MAP_WIDTH * density || ground.naturalHeight !== MAP_HEIGHT * density) {
      throw new Error(`Invalid painted ground dimensions: ${map}`);
    }
    const sheets = shared ?? registerSheets(textures, atlas!, layout, density, registered);
    const groundKey = `painted:${map}:${density}x`;
    const texture = textures.addImage(groundKey, ground);
    if (!texture) throw new Error(`Could not register ${groundKey}`);
    registered.push(groundKey);
    texture.add(0, 0, 0, 0, ground.naturalWidth, ground.naturalHeight);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const byDensity = existing ?? new Map();
    byDensity.set(density, sheets);
    loaded.set(textures, byDensity);
    return { density, groundKey, sheets };
  } catch {
    controller.abort();
    for (const key of registered) textures.remove(key);
    return undefined;
  } finally {
    clearTimeout(probeTimer);
    clearTimeout(timer);
    cancellation.removeEventListener('abort', cancel);
  }
}
