import Phaser from 'phaser';
import { waitForWorkerControl } from '../../sw/register';
import type { PaintedDensity } from './look';

const FRAME_COUNTS = {
  meadow: 1, cave: 4, cottage: 1, oak: 4, spruce: 1, birch: 1, bush: 1, 'berry-bush': 1,
  musketeer: 16, cannon: 16, 'tar-pit': 16, longbow: 16, mortar: 16, 'fire-pot': 16,
  goblin: 16, wolf: 16, troll: 16, harpy: 16, shieldbearer: 16, grumblefoot: 16, grumblemaw: 16,
  'harpy-shadow': 1, arrow: 1, cannonball: 1, 'tar-glob': 1, 'mortar-shell': 1, flame: 1,
} as const;

export type PaintedName = keyof typeof FRAME_COUNTS;

const SHEET_NAMES = Object.keys(FRAME_COUNTS) as PaintedName[];
const ART = import.meta.glob<string>('../../../assets/art-painted/*.{png,json}', {
  eager: true,
  import: 'default',
  query: '?url&no-inline',
});

type Pair = [number, number];
type Bounds = [number, number, number, number];

export interface PaintedSheet {
  key: string;
  frameSize: Pair;
  anchor: Pair;
  bodyBounds?: readonly Bounds[];
  columns: number;
  rows: number;
  frames: number;
}

export interface PaintedAssets {
  density: PaintedDensity;
  sheets: Readonly<Record<PaintedName, PaintedSheet>>;
}

const loaded = new WeakMap<Phaser.Textures.TextureManager, Map<PaintedDensity, PaintedAssets>>();
const LOAD_TIMEOUT_MS = 12_000;

async function getAsset(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Painted asset returned ${response.status}`);
  return response;
}

async function decodeImage(response: Response): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
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
  const { frameSize, anchor, columns, frameOrder, bodyBounds } = data as Record<string, unknown>;
  const frames = FRAME_COUNTS[name];
  if (!integers(frameSize, 2) || !integers(anchor, 2) ||
    typeof columns !== 'number' || !Number.isSafeInteger(columns) || columns < 1 || columns > frames ||
    !Array.isArray(frameOrder) || frameOrder.length !== frames) {
    throw new Error(`Invalid painted sheet: ${name}`);
  }
  const [width, height] = frameSize;
  const [anchorX, anchorY] = anchor;
  const rows = Math.ceil(frames / columns);
  if (width < 1 || height < 1 || anchorX >= width || anchorY >= height ||
    image.naturalWidth !== width * columns || image.naturalHeight !== height * rows) {
    throw new Error(`Invalid painted sheet dimensions: ${name}`);
  }
  if ((frames === 16 || bodyBounds !== undefined) &&
    (!Array.isArray(bodyBounds) || bodyBounds.length !== frames ||
      bodyBounds.some((b) => !integers(b, 4) || b[0] >= b[2] || b[1] >= b[3] || b[2] > width || b[3] > height))) {
    throw new Error(`Invalid painted body bounds: ${name}`);
  }
  return {
    key,
    frameSize: [width, height],
    anchor: [anchorX, anchorY],
    columns,
    rows,
    frames,
    bodyBounds: bodyBounds as Bounds[] | undefined,
  };
}

// Decode and validate every pair before registering textures. A failed pair
// falls back as a whole and a later play can retry without partial textures.
export async function loadPainted(
  textures: Phaser.Textures.TextureManager, density: PaintedDensity, onProgress: (progress: number) => void,
): Promise<PaintedAssets | undefined> {
  const existing = loaded.get(textures);
  const cached = existing?.get(density);
  if (cached) return cached;

  // An uncontrolled fetch during first install would miss the offline cache.
  if (!(await waitForWorkerControl(LOAD_TIMEOUT_MS))) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  const registered: string[] = [];
  let complete = 0;
  const markComplete = <T>(value: T): T => {
    if (!controller.signal.aborted) onProgress(++complete / (2 * SHEET_NAMES.length));
    return value;
  };
  try {
    const pairs = await Promise.all(SHEET_NAMES.map(async (name) => {
      const path = `../../../assets/art-painted/${name}-${density}x`;
      const [image, metadata] = await Promise.all([
        getAsset(ART[`${path}.png`], controller.signal).then(decodeImage).then(markComplete),
        getAsset(ART[`${path}.json`], controller.signal).then((r) => r.json()).then(markComplete),
      ]);
      const sheet = validateSheet(name, `painted:${name}:${density}x`, metadata, image);
      return { name, sheet, image };
    }));
    for (const { sheet, image } of pairs) {
      const texture = textures.addImage(sheet.key, image);
      if (!texture) throw new Error(`Could not register ${sheet.key}`);
      registered.push(sheet.key);
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      const [width, height] = sheet.frameSize;
      for (let frame = 0; frame < sheet.frames; frame++) {
        texture.add(frame, 0, (frame % sheet.columns) * width, Math.floor(frame / sheet.columns) * height, width, height);
      }
    }
    const sheets = Object.fromEntries(pairs.map(({ name, sheet }) => [name, sheet])) as Record<PaintedName, PaintedSheet>;
    const result = { density, sheets };
    const byDensity = existing ?? new Map();
    byDensity.set(density, result);
    loaded.set(textures, byDensity);
    return result;
  } catch {
    controller.abort();
    for (const key of registered) textures.remove(key);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
