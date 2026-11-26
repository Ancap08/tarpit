import type Phaser from 'phaser';
import { resolveMap, type LevelDef } from '../../sim';
import { drawMapThumbnail } from '../draw/map';
import { drawKeepThumbnail } from '../draw/keepThumbnail';
import { drawSiegeCarriage } from '../draw/siegeActors';
import { CAMPAIGN_TEXT, cardFeatText, levelTaxLines, siegeRuleLines, LEVEL_NAMES, LEVEL_NEW, LEVEL_STORY, STORY_TEXT, OWNER_TEXT, levelTips, tipsHeading, MAP_NAMES, TITLE_TEXT, levelNumberText } from '../names';
import type { Broadside } from '../seenTips';
import { FONT, TEXT } from '../palette';
import type { Rect } from '../input';
import type { CampaignAct, CampaignStop } from './campaignMap';
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
  act: CampaignAct, secondActOpen: boolean, action: Action, select: (stop: CampaignStop) => void,
  switchAct: (act: CampaignAct) => void, back: () => void, thirdActOpen?: boolean,
): Phaser.GameObjects.Text {
  const width = scene.scale.width;
  const g = scene.add.graphics();
  boards(g, scene.scale.width, scene.scale.height);
  const field = portrait ? { x: 14, y: 35, width: 452, height: 984 } : { x: 34, y: 8, width: 892, height: 470 };
  drawPanel(g, field);
  label(scene, width / 2, portrait ? 90 : 49, CAMPAIGN_TEXT.levelMap, portrait ? 44 : 38, ink);
  label(scene, width / 2, portrait ? 152 : 101, [CAMPAIGN_TEXT.actOne, CAMPAIGN_TEXT.actTwo, CAMPAIGN_TEXT.actThree][act - 1], 24, ink);
  rule(g, width / 2, portrait ? 184 : 129, portrait ? 332 : 610);
  const landmarks = portrait
    ? [[80, 340], [270, 514], [101, 639], [372, 727], [207, 905]]
    : [[239, 144], [517, 270], [820, 264], [167, 389], [641, 393]];
  if (act === 3) {
    const [x, y] = portrait ? [240, 210] : [765, 58];
    // A gatehouse on the high end of the road, inked like the other sheets.
    g.fillStyle(0xc9a773).fillTriangle(x - 105, y + 67, x - 19, y + 16, x + 67, y + 60);
    g.fillTriangle(x - 38, y + 62, x + 32, y + 8, x + 105, y + 67);
    g.fillStyle(THEME.ink, 0.72).fillRect(x - 38, y + 13, 76, 27);
    for (const dx of [-34, 0, 34]) {
      g.fillRect(x + dx - 12, y, 24, 40);
      g.fillTriangle(x + dx - 14, y, x + dx, y - 16, x + dx + 14, y);
    }
    g.fillStyle(0xd5b277).fillCircle(x, y + 28, 9).fillRect(x - 9, y + 28, 18, 14);
    const crags = portrait ? [[111, 456], [341, 560], [103, 699], [302, 860]]
      : [[167, 420], [353, 376], [523, 338], [688, 270], [824, 237]];
    crags.forEach(([tx, ty]) => terrain(g, tx, ty, true));
  } else landmarks.forEach(([x, y], i) => terrain(g, x, y, i % 2 === 0));
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
      stop.open ? TEXT.victory : TEXT.buttonDisabled, stop.feat);
  }
  const y = portrait ? 1030 : 487;
  const height = portrait ? 82 : 55;
  const buttonWidth = portrait ? 196 : 200;
  const gap = portrait ? 16 : 24;
  if (thirdActOpen === undefined) {
    action('title:back', { x: width / 2 - gap / 2 - buttonWidth, y, width: buttonWidth, height }, CAMPAIGN_TEXT.back, back);
    const target = { x: width / 2 + gap / 2, y, width: buttonWidth, height };
    const other = action('title:act', target, act === 1 ? CAMPAIGN_TEXT.actTwo : CAMPAIGN_TEXT.actOne, () => switchAct(act === 1 ? 2 : 1), 24);
    if (!secondActOpen) {
      other.setLocked(true);
      lock(scene.add.graphics(), target.x + 20, y + height / 2, 16);
    }
  } else {
    const w = portrait ? 104 : 140;
    const gap = 8;
    const left = (width - 4 * w - 3 * gap) / 2;
    action('title:back', { x: left, y, width: w, height }, CAMPAIGN_TEXT.back, back, 23);
    ([1, 2, 3] as const).forEach(target => {
      const open = target === 1 || (target === 2 ? secondActOpen : thirdActOpen);
      const tab = action(`title:act:${target}`, { x: left + target * (w + gap), y, width: w, height },
        CAMPAIGN_TEXT.actTabs[target - 1], () => switchAct(target), 23);
      tab.setLocked(!open);
      tab.setPicked(target === act);
    });
  }
  const legend = act > 1 ? CAMPAIGN_TEXT.featStar : '';
  return label(scene, width / 2, portrait ? 973 : 446, lockedMessage ?? legend, 22, ink);
}

/** A royal proclamation and a town handbill, set in the same printer's furniture as the title. */
export function drawStoryBroadside(
  scene: Phaser.Scene, portrait: boolean, which: Broadside, action: Action, proceed: () => void,
  siegeScene = false, frozen = false,
): Button {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const g = scene.add.graphics();
  broadside(g, width, height);
  const notice = which !== 'ending' && which !== 'siegeEnding';
  const mastheadY = siegeScene ? (portrait ? 154 : 64) : (portrait ? 205 : 92);
  const heading = label(scene, cx, mastheadY, notice ? STORY_TEXT.openingTitle : STORY_TEXT.endingTitle,
    portrait ? 36 : 42, ink);
  rule(g, cx, mastheadY - heading.height / 2 - 12, portrait ? 324 : 560);
  rule(g, cx, mastheadY + heading.height / 2 + 12, portrait ? 324 : 560);
  const body = which === 'ending' ? STORY_TEXT.ending : which === 'siegeEnding' ? STORY_TEXT.siegeEnding
    : which === 'thirdAct' ? STORY_TEXT.thirdActNotice : which === 'secondAct' ? STORY_TEXT.secondActNotice : STORY_TEXT.openingNotice;
  const copy = label(scene, cx, portrait ? 464 : 221, body, portrait ? 30 : 28, ink, portrait ? 376 : siegeScene ? 780 : 736, false);
  if (siegeScene) copy.setY(mastheadY + heading.height / 2 + (portrait ? 54 : 28) + copy.height / 2);
  if (notice) {
    const replyText = which === 'thirdAct' ? STORY_TEXT.thirdActReply : which === 'secondAct' ? STORY_TEXT.secondActReply : STORY_TEXT.openingReply;
    const reply = label(scene, cx, portrait ? 701 : 336, replyText, portrait ? 23 : 24, TEXT.button, portrait ? 362 : 760);
    ribbon(g, cx, reply.y, reply.width + 28, reply.height + 10);
  }
  const continueY = siegeScene ? (portrait ? 1041 : 506) : (portrait ? 977 : 474);
  if (siegeScene) {
    const top = copy.getBounds().bottom + (portrait ? 36 : 12);
    const bottom = continueY - (portrait ? 42 : 11);
    const artWidth = portrait ? 430 : 810;
    const artHeight = Math.min(portrait ? 306 : 236, bottom - top);
    drawSiegeCarriage(scene, { x: cx - artWidth / 2, y: (top + bottom - artHeight) / 2, width: artWidth, height: artHeight },
      portrait, frozen);
  }
  else town(g, cx, portrait ? 893 : 431);
  const w = portrait ? 246 : 196;
  return action('title:continue', { x: cx - w / 2, y: continueY, width: w, height: portrait ? 82 : 58 },
    STORY_TEXT.continue, proceed, 26);
}

const ownerStories = ['opening', 'secondAct', 'thirdAct', 'firstClose', 'ending', 'secondClose', 'siegeEnding'] as const;
type OwnerStory = (typeof ownerStories)[number];

export function drawOwnerPage(scene: Phaser.Scene, portrait: boolean, levels: readonly LevelDef[], action: Action,
  story: (which: OwnerStory) => void, tips: (id: number) => void, reset: () => void, back: () => void): string[] {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const paper = scene.add.graphics();
  broadside(paper, width, height);
  label(scene, cx, portrait ? 58 : 45, OWNER_TEXT.title, portrait ? 36 : 34, ink);

  const keys: string[] = [];
  const button = (key: string, rect: Rect, text: string, click: () => void, size: number) => {
    keys.push(key);
    action(`title:${key}`, rect, text, click, size);
  };
  const grid = (index: number, columns: number, span: number, y: number, h: number, gap: number): Rect => {
    const w = (span - gap * (columns - 1)) / columns;
    return { x: cx - span / 2 + index % columns * (w + gap), y: y + Math.floor(index / columns) * (h + gap), width: w, height: h };
  };
  const row = (y: number, width: number, height: number): Rect => ({ x: cx - width / 2, y, width, height });
  ownerStories.forEach((which, index) => button(`owner:${which}`,
    grid(index, portrait ? 2 : 4, portrait ? 448 : 888, portrait ? 100 : 78, portrait ? 80 : 48, 8),
    OWNER_TEXT[which], () => story(which), 18));
  button('owner:reset', row(portrait ? 452 : 193, 432, portrait ? 80 : 46), OWNER_TEXT.reset, reset, portrait ? 17 : 18);
  const tipsY = portrait ? 563 : 263;
  label(scene, cx, tipsY, CAMPAIGN_TEXT.tips, 24, ink);
  levels.forEach(({ id }, index) => button(`owner:tips:${id}`,
    grid(index, 5, portrait ? 432 : 580, portrait ? 590 : 285, portrait ? 80 : 44, portrait ? 8 : 4),
    String(id), () => tips(id), portrait ? 24 : 20));
  button('back', row(portrait ? 1055 : 524, portrait ? 250 : 208, portrait ? 82 : 46), OWNER_TEXT.back, back, 21);
  return keys;
}

export function drawOwnerClose(scene: Phaser.Scene, portrait: boolean, level: number, action: Action, back: () => void): void {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const paper = scene.add.graphics();
  broadside(paper, width, height);
  const y = portrait ? 240 : 106;
  label(scene, cx, y, STORY_TEXT.endingTitle, portrait ? 36 : 42, ink);
  rule(paper, cx, y + 40, portrait ? 324 : 560);
  label(scene, cx, portrait ? 430 : 218, LEVEL_STORY[level].reply, portrait ? 30 : 28, ink, portrait ? 376 : 736);
  const close = level === 10 ? STORY_TEXT.firstActClose : STORY_TEXT.secondActClose;
  label(scene, cx, portrait ? 590 : 307, close, portrait ? 30 : 28, ink, portrait ? 376 : 736, false);
  town(paper, cx, portrait ? 893 : 431);
  backButton(portrait, action, back);
}

function drawBestStars(scene: Phaser.Scene, x: number, y: number, stars: number, labelSize: number, starSize: number, feat: boolean) {
  const caption = label(scene, x, y, CAMPAIGN_TEXT.bestStars, labelSize, ink);
  const row = drawStarRow(scene, x, y, stars, starSize, TEXT.paperGold, feat);
  const gap = 12;
  const rowWidth = row.getBounds().width + 2;
  caption.setX(x - (rowWidth + gap) / 2);
  row.setX(x + (caption.width + gap) / 2);
}

/** The notice and rules share a sheet. The scouting notes move to its reverse if
 * the measured copy and illustration need more room. Type stays the same size. */
function drawTaxCard(
  scene: Phaser.Scene, portrait: boolean, level: LevelDef, stars: number,
  action: Action, play: () => void, back: () => void, tips: (() => void) | undefined,
  scouting: boolean, turnPage: () => void,
): Button {
  const cx = scene.scale.width / 2;
  const sheet = portrait ? { x: 16, y: 44, width: 448, height: 1110 } : { x: 36, y: 12, width: 888, height: 550 };
  const g = scene.add.graphics();
  boards(g, scene.scale.width, scene.scale.height);
  drawPanel(g, sheet);
  const printWidth = sheet.width - (portrait ? 44 : 64);
  const bodySize = portrait ? 26 : 21;
  const words = LEVEL_NAMES[level.id];
  const number = label(scene, cx, portrait ? 91 : 44, levelNumberText(level.id), portrait ? 26 : 20, ink);
  const title = label(scene, cx, 0, words.name, portrait ? 38 : 34, ink, printWidth);
  title.setY(number.y + number.height / 2 + 3 + title.height / 2);
  const keyline = title.y + title.height / 2 + 9;
  rule(g, cx, keyline, portrait ? 302 : 466);
  const top = keyline + (portrait ? 18 : 10);
  const notice = label(scene, cx, 0, LEVEL_STORY[level.id].notice, portrait ? 27 : 23, '#843629', printWidth);
  notice.setY(top + notice.height / 2);
  const bodyTop = top + notice.height + (portrait ? 22 : 14);
  const rulesX = portrait ? cx : 319;
  const rulesWidth = portrait ? printWidth : 480;
  const heading = label(scene, rulesX, 0, CAMPAIGN_TEXT.inForce, bodySize, ink);
  const siege = level.map === 'keep';
  const siegeRules = siege ? siegeRuleLines(level) : [];
  const answer = level.windows?.length ? siegeRules.pop() : level.featherBarrels ? CAMPAIGN_TEXT.townAnswer : undefined;
  const ruleLines = siege ? [CAMPAIGN_TEXT.gateRule, ...siegeRules] : levelTaxLines(level.taxes!);
  const taxes = ruleLines.map(text => label(scene, rulesX, 0, text, bodySize, ink, rulesWidth, false));
  const feat = label(scene, rulesX, 0, cardFeatText(level.feat!), bodySize, '#254a57', rulesWidth);
  const rules = [heading, ...taxes];
  if (answer) rules.push(label(scene, rulesX, 0, answer, bodySize, '#254a57', rulesWidth));
  rules.push(feat);
  const noteX = portrait ? cx : 721;
  const noteWidth = portrait ? printWidth : 302;
  const mapWidth = portrait ? 160 : 178;
  const mapName = label(scene, noteX, 0, MAP_NAMES[level.map], bodySize, ink);
  const twist = label(scene, noteX, 0, words.twist, bodySize, ink, noteWidth, false);
  const noteHeight = mapWidth / 2 + 5 + mapName.height + 8 + twist.height;
  const gap = portrait ? 13 : 8;
  const rulesTextHeight = () => rules.reduce((sum, text) => sum + text.height, 0);
  const rulesHeight = rulesTextHeight() + gap * (rules.length - 1);
  const footY = portrait ? 1052 : 476;
  const bestY = portrait ? 996 : 443;
  const bottom = bestY - (portrait ? 34 : 25);
  const contentHeight = portrait ? rulesHeight + 22 + noteHeight : Math.max(rulesHeight, noteHeight);
  const paged = bodyTop + contentHeight > bottom;
  const notesOnly = paged && scouting;
  // On a paged phone card the stars and turn-over control share a footer,
  // leaving the full sheet height for the notice even with tall fallback text.
  const turnWidth = 174;
  const turnX = sheet.x + sheet.width - 8 - turnWidth;
  const printBottom = portrait && paged ? bestY - 48 : bottom;
  // On the paged sheet the whole measure is available for either column.
  if (paged) {
    for (const text of rules) text.setX(cx).setWordWrapWidth(printWidth);
    mapName.setX(cx);
    twist.setX(cx).setWordWrapWidth(printWidth);
  }
  if (notesOnly) {
    notice.destroy();
    rules.forEach(text => text.destroy());
  } else {
    // After wrapping across the full sheet, fit the gaps between the notice and the footer.
    const textHeight = rulesTextHeight();
    const rowGap = paged ? Math.max(0, Math.min(gap, (printBottom - bodyTop - textHeight) / (rules.length - 1))) : gap;
    const blockHeight = paged ? textHeight + rowGap * (rules.length - 1) : contentHeight;
    let y = bodyTop + Math.max(0, (printBottom - bodyTop - blockHeight) / 2);
    if (portrait && !paged) y = bodyTop;
    for (const text of rules) {
      text.setY(y + text.height / 2);
      y += text.height + rowGap;
    }
  }
  if (!paged || notesOnly) {
    const x = paged ? cx : noteX;
    const notesTop = notesOnly ? top : portrait ? bodyTop + rulesHeight + 22 : bodyTop;
    let y = notesTop + (printBottom - notesTop - (mapWidth / 2 + 13 + mapName.height + twist.height)) / 2;
    if (siege) drawKeepThumbnail(scene, level, x, y, mapWidth);
    else drawMapThumbnail(g, resolveMap(level.map), x - mapWidth / 2, y, mapWidth, mapWidth / 2);
    g.lineStyle(1, THEME.ink).strokeRect(x - mapWidth / 2, y, mapWidth, mapWidth / 2);
    y += mapWidth / 2 + 5;
    mapName.setY(y + mapName.height / 2);
    twist.setY(y + mapName.height + 8 + twist.height / 2);
  } else {
    mapName.destroy();
    twist.destroy();
  }
  const starsX = portrait && paged ? (sheet.x + turnX) / 2 : cx;
  drawBestStars(scene, starsX, bestY, stars, bodySize, portrait ? 26 : 22, !!level.feat);

  const buttons: { key: string; text: string; click: () => void }[] = [
    { key: 'back', text: CAMPAIGN_TEXT.back, click: back },
    ...(tips ? [{ key: 'tips', text: CAMPAIGN_TEXT.tips, click: tips }] : []),
    { key: 'play', text: TITLE_TEXT.play, click: play },
  ];
  if (paged) {
    const pageText = scouting ? CAMPAIGN_TEXT.notice : CAMPAIGN_TEXT.mapNotes;
    if (portrait) action('title:cardPage', { x: turnX, y: bestY - 40, width: turnWidth, height: 80 }, pageText, turnPage, bodySize);
    else buttons.unshift({ key: 'cardPage', text: pageText, click: turnPage });
  }
  const buttonWidth = portrait ? 122 : 162;
  const buttonGap = portrait ? 11 : 14;
  const left = cx - (buttons.length * (buttonWidth + buttonGap) - buttonGap) / 2;
  const controls = buttons.map((button, i) => action(`title:${button.key}`, {
    x: left + i * (buttonWidth + buttonGap), y: footY, width: buttonWidth, height: portrait ? 80 : 58,
  }, button.text, button.click, bodySize));
  return controls[controls.length - 1];
}

export function drawLevelCard(
  scene: Phaser.Scene, portrait: boolean, level: LevelDef, stars: number,
  action: Action, play: () => void, back: () => void, tips: (() => void) | undefined, scouting: boolean, turnPage: () => void,
): Button {
  if (level.feat) return drawTaxCard(scene, portrait, level, stars, action, play, back, tips, scouting, turnPage);
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
  drawMapThumbnail(g, resolveMap(level.map), mapX - mapWidth / 2, mapTop, mapWidth, mapWidth / 2);
  g.lineStyle(1, THEME.ink).strokeRect(mapX - mapWidth / 2, mapTop, mapWidth, mapWidth / 2);
  mapName.setY(mapTop + mapWidth / 2 + 4 + mapName.height / 2);
  twist.setY(textTop + twist.height / 2);
  heading.setY(textTop + twist.height + gap + heading.height / 2);
  equipment.setY(heading.y + heading.height / 2 + 5 + equipment.height / 2);
  drawBestStars(scene, cx, starsY, stars, 22, 20, !!level.feat);
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
  action: Action, accept: () => void, back?: () => void, previousPlay?: Pick<Rect, 'y' | 'height'>,
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
  const rect = { x: back ? cx + 8 : cx - width / 2, y: portrait ? 804 : 402, width, height: portrait ? 82 : 58 };
  if (portrait && back && previousPlay && rect.y < previousPlay.y + previousPlay.height && previousPlay.y < rect.y + rect.height) {
    rect.y = previousPlay.y - rect.height - 12;
  }
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
