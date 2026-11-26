import type { MapDef, MapId } from '../../sim';
import { decorFor } from '../decor/recipe';
import { townBounds } from '../decor/town';
import { LANDSCAPE } from '../layout';
import { loadScoutingArt, type PaintedName } from './loading';
import { growthArt } from './painted';

/** Compose the real terrain and scenery in the landscape scouting view. */
export async function scoutingMap(map: MapDef, id: MapId, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const { ground, atlas, sheets } = await loadScoutingArt(id, signal);
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(ground, 0, 0);
  const draw = (name: PaintedName, frame: number, x: number, y: number) => {
    const { offset, frameSize: [w, h], columns, anchor } = sheets.get(name)!;
    ctx.drawImage(atlas, offset[0] + (frame % columns) * w, offset[1] + Math.floor(frame / columns) * h,
      w, h, x - anchor[0], y - anchor[1], w, h);
  };
  const spawn = map.path[0];
  draw('cave', 0, spawn.x + 22, spawn.y);
  const town = townBounds(map, LANDSCAPE);
  draw('town', 0, town.x + town.width / 2, town.y + town.height / 2);
  for (const growth of decorFor(map).growth.slice().sort((a, b) => a.y - b.y)) {
    const name = growthArt(growth);
    draw(name, name === 'oak' ? growth.id % 4 : 0, growth.x, growth.y);
  }
  return canvas;
}
