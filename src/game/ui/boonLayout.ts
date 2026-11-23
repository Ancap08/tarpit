import type { Rect } from '../../sim';
import type { Layout } from '../layout';

const COUNT = 3;

export function rewardLayout(layout: Layout) {
  const portrait = layout.kind === 'portrait';
  const width = portrait ? 448 : 296;
  const height = portrait ? 112 : 168;
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
    icon: portrait ? { x: 43, y: 56, scale: 1.5 } : { x: width / 2, y: 48, scale: 1.75 },
    name: portrait ? { x: 80, y: 39, font: 24 } : { x: width / 2, y: 99, font: 23 },
    description: portrait ? { x: 80, y: 74, font: 17 } : { x: width / 2, y: 133, font: 13 },
    textWidth: portrait ? width - 90 : width - 16,
  };
}

/** Space reserved in the HUD's build row (landscape) or preview row (portrait). */
export function heldBoonLayout(layout: Layout) {
  const portrait = layout.kind === 'portrait';
  const width = portrait ? 36 : 40;
  const height = 42;
  const left = portrait ? layout.width - 120 : 772;
  const top = portrait ? 30 : 533;
  const gap = 3;
  return {
    slots: Array.from({ length: COUNT }, (_, i): Rect => ({ x: left + i * (width + gap), y: top, width, height })),
    tooltip: portrait
      ? { x: 58, y: layout.map.y + 62, width: 416, height: 84 }
      : { x: 534, y: layout.map.height - 68, width: 362, height: 68 },
    descriptionFont: portrait ? 18 : 14,
  };
}
