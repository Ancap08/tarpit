import type Phaser from 'phaser';
import { MAPS, type LevelDef } from '../../sim';
import { drawMapThumbnail } from '../draw/map';
import { CAMPAIGN_TEXT, LEVEL_NAMES, LEVEL_NEW, MAP_NAMES, TITLE_TEXT, levelNumberText, starSlots } from '../names';
import { COLORS, FONT, TEXT } from '../palette';
import type { Rect } from '../input';
import type { CampaignStop } from './campaignMap';
import type { Button } from './button';

type Action = (key: string, rect: Rect, label: string, click: () => void, size?: number) => Button;

function label(scene: Phaser.Scene, x: number, y: number, value: string, size: number, color: string, wrap = 0) {
  return scene.add.text(x, y, value, {
    fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, align: 'center',
    wordWrap: wrap ? { width: wrap } : undefined,
  }).setOrigin(0.5);
}

function backButton(portrait: boolean, action: Action, back: () => void) {
  return action('title:back', portrait
    ? { x: 130, y: 1030, width: 220, height: 78 }
    : { x: 380, y: 487, width: 200, height: 55 }, CAMPAIGN_TEXT.back, back);
}

export function drawCampaignMap(
  scene: Phaser.Scene, portrait: boolean, stops: CampaignStop[], lockedMessage: string | null,
  action: Action, select: (stop: CampaignStop) => void, back: () => void,
): Phaser.GameObjects.Text {
  const width = scene.scale.width;
  label(scene, width / 2, portrait ? 103 : 52, CAMPAIGN_TEXT.levelMap, portrait ? 48 : 42, TEXT.title);
  const field = portrait ? { x: 23, y: 178, width: 434, height: 776 } : { x: 54, y: 111, width: 852, height: 304 };
  const g = scene.add.graphics();
  g.fillStyle(COLORS.grassDark);
  g.fillRoundedRect(field.x, field.y, field.width, field.height, 22);
  g.lineStyle(2, COLORS.buttonEdge, 0.8);
  g.strokeRoundedRect(field.x, field.y, field.width, field.height, 22);
  // A continuous ribbon with rounded joins follows the same centres as the hit targets.
  const points = stops.map(({ rect }) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }));
  for (const [thickness, color] of [[22, COLORS.pathEdge], [16, COLORS.pathLight]]) {
    g.lineStyle(thickness, color);
    g.strokePoints(points, false);
    g.fillStyle(color);
    for (const point of points) g.fillCircle(point.x, point.y, thickness / 2);
  }
  for (const stop of stops) {
    const { rect } = stop;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const button = action(`title:stop:${stop.id}`, rect, '', () => select(stop));
    button.setPicked(stop.next);
    label(scene, cx + (stop.open ? 0 : 10), cy - 12, String(stop.id), portrait ? 32 : 28,
      stop.open ? TEXT.button : TEXT.buttonDisabled);
    if (!stop.open) {
      const lock = scene.add.graphics();
      const lx = cx - (stop.id < 10 ? 14 : 21);
      lock.lineStyle(3, COLORS.buttonEdge);
      lock.beginPath().arc(lx, cy - 15, 5, Math.PI, 2 * Math.PI).strokePath();
      lock.fillStyle(COLORS.buttonEdge).fillRoundedRect(lx - 7, cy - 15, 14, 12, 2);
    }
    label(scene, cx, cy + 17, starSlots(stop.stars), portrait ? 25 : 23, stop.open ? TEXT.victory : TEXT.buttonDisabled);
  }
  backButton(portrait, action, back);
  return label(scene, width / 2, portrait ? 988 : 450, lockedMessage ?? '', portrait ? 22 : 20, TEXT.prompt);
}

export function drawLevelCard(
  scene: Phaser.Scene, portrait: boolean, level: LevelDef, stars: number,
  action: Action, play: () => void, back: () => void,
): Button {
  const cx = scene.scale.width / 2;
  const panel = portrait ? { x: 24, y: 132, width: 432, height: 866 } : { x: 145, y: 32, width: 670, height: 512 };
  const g = scene.add.graphics();
  g.fillStyle(COLORS.endPanel).fillRoundedRect(panel.x, panel.y, panel.width, panel.height, 18);
  g.lineStyle(2, COLORS.endPanelEdge).strokeRoundedRect(panel.x, panel.y, panel.width, panel.height, 18);
  const words = LEVEL_NAMES[level.id];
  const wrap = portrait ? 384 : 620;
  label(scene, cx, portrait ? 196 : 69, levelNumberText(level.id), 22, TEXT.prompt);
  label(scene, cx, portrait ? 281 : 114, words.name, portrait ? 36 : 38, TEXT.title, wrap);
  const mapWidth = portrait ? 222 : 160;
  const y = portrait ? 370 : 151;
  const x = cx - mapWidth / 2;
  drawMapThumbnail(g, MAPS[level.map], x, y, mapWidth, mapWidth / 2);
  g.lineStyle(1, COLORS.buttonEdge).strokeRect(x, y, mapWidth, mapWidth / 2);
  label(scene, cx, y + mapWidth / 2 + 17, MAP_NAMES[level.map], 18, TEXT.subtitle);
  label(scene, cx, portrait ? 582 : 288, words.twist, portrait ? 23 : 20, TEXT.title, wrap);
  label(scene, cx, portrait ? 687 : 349, CAMPAIGN_TEXT.newThisLevel, 18, TEXT.subtitle);
  label(scene, cx, portrait ? 738 : 380, LEVEL_NEW[level.id], portrait ? 23 : 20, TEXT.button, wrap);
  label(scene, cx, portrait ? 833 : 429, `${CAMPAIGN_TEXT.bestStars}  ${starSlots(stars)}`, 22, TEXT.prompt);
  const playButton = action('title:play', portrait ? { x: 106, y: 894, width: 268, height: 78 }
    : { x: 487, y: 466, width: 194, height: 54 }, TITLE_TEXT.play, play, 26);
  if (portrait) backButton(true, action, back);
  else action('title:back', { x: 279, y: 466, width: 194, height: 54 }, CAMPAIGN_TEXT.back, back);
  return playButton;
}
