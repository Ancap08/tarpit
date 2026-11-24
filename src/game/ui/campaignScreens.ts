import type Phaser from 'phaser';
import { MAPS, type LevelDef } from '../../sim';
import { drawMapThumbnail } from '../draw/map';
import { CAMPAIGN_TEXT, LEVEL_NAMES, LEVEL_NEW, LEVEL_STORY, STORY_TEXT, levelTips, tipsHeading, MAP_NAMES, TITLE_TEXT, levelNumberText } from '../names';
import type { Broadside } from '../seenTips';
import { FONT, TEXT } from '../palette';
import type { Rect } from '../input';
import type { CampaignStop } from './campaignMap';
import { drawStarRow } from './starRow';
import { boards, broadside, ink, lock, panel as drawPanel, ribbon, rule, THEME, town } from './theme';
import type { Button } from './button';

type Action = (key: string, rect: Rect, label: string, click: () => void, size?: number) => Button;

function label(scene: Phaser.Scene, x: number, y: number, value: string, size: number, color: string, wrap = 0, bold = true) {
  return scene.add.text(x, y, value, {
    fontFamily: FONT, fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color, align: 'center',
    wordWrap: wrap ? { width: wrap } : undefined,
  }).setOrigin(0.5);
}

/** Small engraved stands and ridgelines, placed in the empty parts of the chart. */
function terrain(g: Phaser.GameObjects.Graphics, x: number, y: number, hills: boolean) {
  g.lineStyle(1.5, THEME.ink, 0.42);
  if (hills) {
    for (const [dx, dy, size] of [[-14, 2, 12], [0, -2, 17], [17, 3, 10]]) {
      g.beginPath().moveTo(x + dx - size, y + dy + 6).lineTo(x + dx, y + dy - size / 2)
        .lineTo(x + dx + size, y + dy + 6).strokePath();
      g.lineBetween(x + dx, y + dy - size / 2 + 3, x + dx + 2, y + dy + 2);
    }
  } else {
    for (const [dx, dy, h] of [[-10, 2, 14], [1, -2, 18], [12, 4, 13]]) {
      const tx = x + dx, ty = y + dy;
      g.lineBetween(tx, ty + 6, tx, ty - h / 2);
      for (const rise of [0, 5]) {
        g.beginPath().moveTo(tx - 5, ty + 2 - rise).lineTo(tx, ty - 4 - rise)
          .lineTo(tx + 5, ty + 2 - rise).strokePath();
      }
    }
  }
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
  const g = scene.add.graphics();
  boards(g, scene.scale.width, scene.scale.height);
  const field = portrait ? { x: 14, y: 35, width: 452, height: 984 } : { x: 34, y: 8, width: 892, height: 470 };
  drawPanel(g, field);
  label(scene, width / 2, portrait ? 103 : 52, CAMPAIGN_TEXT.levelMap, portrait ? 48 : 42, ink);
  rule(g, width / 2, portrait ? 162 : 96, portrait ? 332 : 610);
  const landmarks = portrait
    ? [[80, 340], [270, 514], [101, 639], [372, 727], [207, 905]]
    : [[239, 144], [517, 270], [820, 264], [167, 389], [641, 393]];
  landmarks.forEach(([x, y], i) => terrain(g, x, y, i % 2 === 0));
  // Two inked verges enclose a sandy road through the milestones.
  const points = stops.map(({ rect }) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }));
  for (const [thickness, color] of [[19, THEME.brass], [13, 0xd5b277]]) {
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
    button.setLocked(!stop.open);
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
    if (!stop.open) lock(scene.add.graphics(), cx - (stop.id < 10 ? 14 : 21), numberY, 14);
    drawStarRow(scene, cx, top + numberHeight + gap + starSize / 2, stop.stars, starSize,
      stop.open ? TEXT.victory : TEXT.buttonDisabled);
  }
  backButton(portrait, action, back);
  return label(scene, width / 2, portrait ? 988 : 450, lockedMessage ?? '', portrait ? 22 : 20, ink);
}

/** A royal proclamation and a town handbill, set in the same printer's furniture as the title. */
export function drawStoryBroadside(
  scene: Phaser.Scene, portrait: boolean, which: Broadside, action: Action, proceed: () => void,
): Button {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const g = scene.add.graphics();
  broadside(g, width, height);
  const opening = which === 'opening';
  const mastheadY = portrait ? 205 : 92;
  const heading = label(scene, cx, mastheadY, opening ? STORY_TEXT.openingTitle : STORY_TEXT.endingTitle,
    portrait ? 36 : 42, ink);
  rule(g, cx, mastheadY - heading.height / 2 - 12, portrait ? 324 : 560);
  rule(g, cx, mastheadY + heading.height / 2 + 12, portrait ? 324 : 560);
  label(scene, cx, portrait ? 464 : 221, opening ? STORY_TEXT.openingNotice : STORY_TEXT.ending,
    portrait ? 30 : 28, ink, portrait ? 376 : 736, false);
  if (opening) {
    const reply = label(scene, cx, portrait ? 701 : 336, STORY_TEXT.openingReply, portrait ? 23 : 24, TEXT.button);
    ribbon(g, cx, reply.y, reply.width + 28, reply.height + 10);
  }
  town(g, cx, portrait ? 893 : 431);
  const w = portrait ? 246 : 196;
  return action('title:continue', { x: cx - w / 2, y: portrait ? 977 : 474, width: w, height: portrait ? 78 : 58 },
    STORY_TEXT.continue, proceed, 26);
}

export function drawLevelCard(
  scene: Phaser.Scene, portrait: boolean, level: LevelDef, stars: number,
  action: Action, play: () => void, back: () => void, tips?: () => void,
): Button {
  const cx = scene.scale.width / 2;
  const panel = portrait ? { x: 24, y: 94, width: 432, height: 904 } : { x: 100, y: 18, width: 760, height: 526 };
  const g = scene.add.graphics();
  boards(g, scene.scale.width, scene.scale.height);
  drawPanel(g, panel);
  const words = LEVEL_NAMES[level.id];
  const wrap = panel.width - (portrait ? 42 : 58);
  const number = label(scene, cx, portrait ? 145 : 46, levelNumberText(level.id), 20, ink);
  const title = label(scene, cx, 0, words.name, portrait ? 33 : 36, ink, wrap);
  title.setY(number.y + number.height / 2 + title.height / 2 + 4);
  const lineY = title.y + title.height / 2 + 9;
  rule(g, cx, lineY, portrait ? 260 : 365);
  const notice = label(scene, cx, 0, LEVEL_STORY[level.id].notice, portrait ? 25 : 24, '#843629', wrap);
  notice.setY(lineY + (portrait ? 18 : 8) + notice.height / 2);
  const mapWidth = portrait ? 176 : 216;
  const mapX = portrait ? cx : panel.x + 155;
  const dataX = portrait ? cx : panel.x + 506;
  const dataWidth = portrait ? wrap : 444;
  const starsY = portrait ? 833 : 429;
  const top = notice.y + notice.height / 2 + 12;
  const bottom = starsY - 28;
  const twist = label(scene, dataX, 0, words.twist, portrait ? 22 : 20, ink, dataWidth, false);
  const heading = label(scene, dataX, 0, CAMPAIGN_TEXT.newThisLevel, 18, ink);
  const equipment = label(scene, dataX, 0, LEVEL_NEW[level.id], portrait ? 21 : 20, ink, dataWidth, false);
  const mapName = label(scene, mapX, 0, MAP_NAMES[level.map], 18, ink);
  const mapHeight = mapWidth / 2 + 4 + mapName.height;
  const textHeight = twist.height + heading.height + equipment.height + 5;
  // Use the measured Caslon or fallback lines. Portrait reads down the page;
  // landscape sets the thumbnail beside the tactical note and equipment.
  const gap = portrait ? (bottom - top - textHeight - mapHeight) / 4 : 10;
  const mapTop = portrait ? top + gap : (top + bottom - mapHeight) / 2;
  const textTop = portrait ? mapTop + mapHeight + gap : (top + bottom - textHeight - gap) / 2;
  drawMapThumbnail(g, MAPS[level.map], mapX - mapWidth / 2, mapTop, mapWidth, mapWidth / 2);
  g.lineStyle(1, THEME.ink).strokeRect(mapX - mapWidth / 2, mapTop, mapWidth, mapWidth / 2);
  mapName.setY(mapTop + mapWidth / 2 + 4 + mapName.height / 2);
  twist.setY(textTop + twist.height / 2);
  heading.setY(textTop + twist.height + gap + heading.height / 2);
  equipment.setY(heading.y + heading.height / 2 + 5 + equipment.height / 2);
  const caption = label(scene, cx, starsY, CAMPAIGN_TEXT.bestStars, 22, ink);
  const row = drawStarRow(scene, cx, starsY, stars, 20, TEXT.paperGold);
  const rowWidth = row.getBounds().width + 2;
  const starGap = 12;
  caption.setX(cx - (rowWidth + starGap) / 2);
  row.setX(cx + (caption.width + starGap) / 2);
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
  boards(g, scene.scale.width, scene.scale.height);
  drawPanel(g, panel);
  const heading = label(scene, cx, panel.y + (portrait ? 83 : 60), tipsHeading(level.id), portrait ? 40 : 36, ink);
  rule(g, cx, heading.y + heading.height / 2 + 9, portrait ? 204 : 312);
  const lines = levelTips(level.id, touch).map(line => label(scene, cx, 0, line, portrait ? 28 : 26, ink, panel.width - 52, false));
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
