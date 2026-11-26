import { CELL, type Rect } from '../../sim';
import type { Layout } from '../layout';

const COUNT = 3;

export function rewardLayout(layout: Layout, clean = false) {
  const portrait = layout.kind === 'portrait';
  const width = portrait ? 448 : 296;
  const height = portrait ? clean ? 126 : 112 : 168;
  const gap = portrait ? 12 : 14;
  const rowWidth = portrait ? width : COUNT * width + (COUNT - 1) * gap;
  const rowHeight = portrait ? COUNT * height + (COUNT - 1) * gap : height;
  const centerX = layout.map.x + layout.map.width / 2;
  const top = layout.map.y + (layout.map.height - rowHeight) / 2 + 18;
  const left = centerX - rowWidth / 2;
  return {
    title: { x: centerX, y: top - 42 },
    cards: Array.from({ length: COUNT }, (_, i): Rect => ({
      x: left + (portrait ? 0 : i * (width + gap)),
      y: top + (portrait ? i * (height + gap) : 0),
      width,
      height,
    })),
    icon: portrait ? { x: 43, y: height / 2, scale: 1.5 } : { x: width / 2, y: 48, scale: 1.75 },
    name: portrait ? { x: 80, y: 30, font: 24 } : { x: width / 2, y: 99, font: 23 },
    description: portrait ? { x: 80, y: clean ? 84 : 76, font: clean ? 24 : 22 } : { x: width / 2, y: 138, font: 18 },
    textWidth: portrait ? width - 90 : width - 16,
  };
}

type Size = { width: number; height: number };

/** Use the landscape build row when it fits, otherwise a rail beside the game. */
export function heldBoonLayout(layout: Layout, parent: Size, clean = false) {
  const portrait = layout.kind === 'portrait';
  const inRow = !portrait && (clean || parent.width >= layout.width && parent.height >= layout.height);
  const gap = 3;
  // FIT can be limited by height or by width. In the latter case the rail
  // itself widens the canvas: size * parent.width / (layout.width + 2*gap + size) >= 45.
  // One spare CSS pixel accommodates rounding in the browser's canvas bounds.
  const target = 45;
  const fittedTarget = Math.ceil(target * Math.max(layout.height / parent.height, layout.width / parent.width));
  const mapRight = layout.map.x + layout.map.width;
  const margin = layout.width - mapRight;
  // A narrow Clean gutter can borrow the outer edge of the first cell.
  // The reward target stays clear of the cell centre and the road, and the
  // board and HUD keep their scale when the player earns the reward.
  const inMargin = clean && portrait && margin + CELL / 2 - 4 >= fittedTarget + gap;
  const size = inRow ? clean ? fittedTarget : 46 : inMargin ? fittedTarget : Math.ceil(Math.max(
    target * layout.height / Math.max(1, parent.height),
    target * (layout.width + 2 * gap) / Math.max(1, parent.width - target),
  ));
  const left = inRow ? (clean ? 637 : 678) : inMargin ? Math.min(mapRight + (margin - size) / 2, layout.width - size - gap) : layout.width + gap;
  const top = inRow ? (clean ? 16 : 531) : inMargin ? layout.map.y + gap : portrait ? gap : layout.height - COUNT * (size + gap);
  return {
    canvasWidth: inRow || inMargin ? layout.width : layout.width + size + 2 * gap,
    slots: Array.from({ length: COUNT }, (_, i): Rect => ({
      x: left + (inRow ? i * (size + gap) : 0),
      y: top + (inRow ? 0 : i * (size + gap)),
      width: size,
      height: size,
    })),
    tooltip: portrait
      ? { x: 58, y: layout.map.y + 62, width: 416, height: 84 }
      : { x: 534, y: layout.map.y + layout.map.height - 68, width: 362, height: 68 },
    descriptionFont: portrait ? 20 : 14,
  };
}
