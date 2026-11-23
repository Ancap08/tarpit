import type Phaser from 'phaser';
import { MAPS, type LevelDef } from '../../sim';
import { drawMapThumbnail } from '../draw/map';
import { CAMPAIGN_TEXT, LEVEL_NAMES, LEVEL_NEW, levelTips, tipsHeading, MAP_NAMES, TITLE_TEXT, levelNumberText } from '../names';
import { COLORS, FONT, TEXT } from '../palette';
import type { Rect } from '../input';
import type { CampaignStop } from './campaignMap';
import { drawStarRow } from './starRow';
import { makeLock } from './lock';
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
    const fontSize = portrait ? 32 : 28;
    const numberHeight = fontSize + 4;
    const starSize = portrait ? 22 : 20;
    const gap = 6;
    const top = cy - (numberHeight + gap + starSize) / 2;
    const numberY = top + numberHeight / 2;
    scene.add.text(cx + (stop.open ? 0 : 10), numberY, String(stop.id), {
      fontFamily: FONT, fontSize, fontStyle: 'bold', color: stop.open ? TEXT.button : TEXT.buttonDisabled,
      fixedHeight: numberHeight, metrics: { ascent: fontSize, descent: 4, fontSize: numberHeight },
    }).setOrigin(0.5);
    if (!stop.open) makeLock(scene).setPosition(cx - (stop.id < 10 ? 14 : 21), numberY - 3);
    drawStarRow(scene, cx, top + numberHeight + gap + starSize / 2, stop.stars, starSize,
      stop.open ? TEXT.victory : TEXT.buttonDisabled);
  }
  backButton(portrait, action, back);
  return label(scene, width / 2, portrait ? 988 : 450, lockedMessage ?? '', portrait ? 22 : 20, TEXT.prompt);
}

export function drawLevelCard(
  scene: Phaser.Scene, portrait: boolean, level: LevelDef, stars: number,
  action: Action, play: () => void, back: () => void, tips?: () => void,
): Button {
  const cx = scene.scale.width / 2;
  const panel = portrait ? { x: 24, y: 132, width: 432, height: 866 } : { x: 145, y: 32, width: 670, height: 512 };
  const g = scene.add.graphics();
  g.fillStyle(COLORS.endPanel).fillRoundedRect(panel.x, panel.y, panel.width, panel.height, 18);
  g.lineStyle(2, COLORS.endPanelEdge).strokeRoundedRect(panel.x, panel.y, panel.width, panel.height, 18);
  const words = LEVEL_NAMES[level.id];
  const wrap = portrait ? 384 : 620;
  // Centre the two labels in separate rows above the thumbnail.
  const numberTop = portrait ? 176 : 40;
  const numberHeight = 38;
  const nameTop = numberTop + numberHeight + (portrait ? 37 : 5);
  const nameHeight = portrait ? 60 : 64;
  label(scene, cx, numberTop + numberHeight / 2, levelNumberText(level.id), 22, TEXT.prompt);
  label(scene, cx, nameTop + nameHeight / 2, words.name, portrait ? 36 : 38, TEXT.title, wrap);
  const mapWidth = portrait ? 222 : 160;
  const y = portrait ? 370 : 151;
  const x = cx - mapWidth / 2;
  drawMapThumbnail(g, MAPS[level.map], x, y, mapWidth, mapWidth / 2);
  g.lineStyle(1, COLORS.buttonEdge).strokeRect(x, y, mapWidth, mapWidth / 2);
  label(scene, cx, y + mapWidth / 2 + 17, MAP_NAMES[level.map], 18, TEXT.subtitle);
  label(scene, cx, portrait ? 582 : 288, words.twist, portrait ? 23 : 20, TEXT.title, wrap);
  const headingTop = portrait ? 666 : 328;
  const headingHeight = 30;
  const contentTop = headingTop + headingHeight + 6;
  // Reserve two wrapped lines on the phone and one on the wider card.
  const contentHeight = portrait ? 76 : 34;
  label(scene, cx, headingTop + headingHeight / 2, CAMPAIGN_TEXT.newThisLevel, 18, TEXT.subtitle);
  label(scene, cx, contentTop + contentHeight / 2, LEVEL_NEW[level.id], portrait ? 23 : 20, TEXT.button, wrap);
  const starsY = portrait ? 833 : 429;
  const caption = label(scene, cx, starsY, CAMPAIGN_TEXT.bestStars, 22, TEXT.prompt);
  const row = drawStarRow(scene, cx, starsY, stars, 20, TEXT.prompt);
  const rowWidth = row.getBounds().width + 2;
  const gap = 12;
  caption.setX(cx - (rowWidth + gap) / 2);
  row.setX(cx + (caption.width + gap) / 2);
  const yButton = portrait ? 894 : 466;
  const height = portrait ? 78 : 54;
  if (tips) {
    action('title:tips', { x: portrait ? 58 : 382, y: yButton, width: portrait ? 142 : 150, height },
      CAMPAIGN_TEXT.tips, tips);
  }
  const playRect = portrait ? { x: tips ? 215 : 106, width: tips ? 207 : 268 }
    : { x: tips ? 545 : 487, width: tips ? 180 : 194 };
  const playButton = action('title:play', { ...playRect, y: yButton, height }, TITLE_TEXT.play, play, 26);
  if (portrait) backButton(true, action, back);
  else action('title:back', { x: tips ? 235 : 279, y: yButton, width: tips ? 134 : 194, height }, CAMPAIGN_TEXT.back, back);
  return playButton;
}

export function drawLevelTips(
  scene: Phaser.Scene, portrait: boolean, level: LevelDef, touch: boolean,
  action: Action, accept: () => void, back?: () => void,
): Button {
  const cx = scene.scale.width / 2;
  const panel = portrait ? { x: 18, y: 148, width: 444, height: 852 } : { x: 72, y: 42, width: 816, height: 486 };
  const g = scene.add.graphics();
  g.fillStyle(COLORS.endPanel).fillRoundedRect(panel.x, panel.y, panel.width, panel.height, 18);
  g.lineStyle(2, COLORS.endPanelEdge).strokeRoundedRect(panel.x, panel.y, panel.width, panel.height, 18);
  const heading = label(scene, cx, panel.y + (portrait ? 83 : 60), tipsHeading(level.id), portrait ? 40 : 36, TEXT.title);
  const lines = levelTips(level.id, touch).map(line => label(scene, cx, 0, line, portrait ? 28 : 26, TEXT.button, panel.width - 52));
  const width = portrait ? 180 : 200;
  const rect = { x: back ? cx + 8 : cx - width / 2, y: portrait ? 804 : 402, width, height: portrait ? 78 : 58 };
  if (back) action('title:back', { ...rect, x: cx - width - 8 }, CAMPAIGN_TEXT.back, back);
  const top = heading.y + heading.height / 2;
  const gap = (rect.y - top - lines.reduce((height, line) => height + line.height, 0)) / (lines.length + 1);
  let y = top;
  for (const line of lines) {
    y += gap;
    line.setY(y + line.height / 2);
    y += line.height;
  }
  return action('title:gotIt', rect, CAMPAIGN_TEXT.gotIt, accept, 26);
}
