import type Phaser from 'phaser';
import { resolveMap, type LevelDef } from '../../sim';
import { drawMapThumbnail } from '../draw/map';
import {
  CAMPAIGN_TEXT, LEVEL_NAMES, LEVEL_NEW, LEVEL_STORY, MAP_NAMES, TITLE_TEXT,
  levelFeatRow, levelNumberText, levelTaxRows,
} from '../names';
import { FONT } from '../palette';
import { scoutingMap } from '../skin/scoutingMap';
import type { Rect } from '../input';
import { levelAct } from './campaignMap';
import type { Button, ButtonOptions } from './button';
import { PRINT, glyph, line, motionClock, rounded, sheet, textMetrics, type Icon } from './newTheme';
import { drawStarRow } from './starRow';

export type CardAction = (key: string, rect: Rect, label: string, click: () => void, size?: number, options?: ButtonOptions) => Button;

export function printedText(scene: Phaser.Scene, text: string, size: number, width: number, color: string = PRINT.ink,
  fontStyle = 'normal') {
  return scene.add.text(0, 0, text, {
    fontFamily: FONT, fontSize: size, fontStyle, color, align: 'center',
    wordWrap: { width }, metrics: textMetrics(size),
  }).setOrigin(.5, 0);
}

function mapPrint(scene: Phaser.Scene, level: LevelDef, rect: Rect, caption: Phaser.GameObjects.Text) {
  if (level.map === 'keep') return;
  const frame = scene.add.graphics();
  rounded(frame, { ...rect, height: rect.height + caption.height + 12 }, PRINT.inset, PRINT.edge, 8);
  const fallback = scene.add.graphics();
  const map = resolveMap(level.map);
  drawMapThumbnail(fallback, map, rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 4);
  const controller = new AbortController();
  const key = `clean-card-map:${level.map}`;
  const plate = scene.add.image(rect.x + 4, rect.y + 4, '__DEFAULT').setOrigin(0).setVisible(false);
  void scoutingMap(map, level.map, controller.signal).then(canvas => {
    if (!plate.scene) return;
    scene.textures.addCanvas(key, canvas);
    plate.setTexture(key).setDisplaySize(rect.width - 8, rect.height - 4).setVisible(true);
    fallback.setVisible(false);
  }, () => {}); // The ink thumbnail stays visible offline.
  plate.once('destroy', () => {
    controller.abort();
    if (scene.textures.exists(key)) scene.textures.remove(key);
  });
  caption.setPosition(rect.x + rect.width / 2 + 8, rect.y + rect.height + 6).setDepth(1);
  glyph(frame, 'map', caption.x - caption.width / 2 - 15, caption.y + caption.height / 2, 15, PRINT.green);
  return [frame, fallback, plate, caption];
}

export function drawPrintedCard(
  scene: Phaser.Scene, portrait: boolean, level: LevelDef, stars: number, action: CardAction,
  play: () => void, back: () => void, tips: (() => void) | undefined, scouting: boolean, turnPage: () => void,
): Button {
  const { width, height } = scene.scale;
  const cx = width / 2;
  const maxFoot = portrait ? height - 102 : height - 72;
  const page = portrait ? { x: 23, y: 92, width: width - 46, height: maxFoot - 102 }
    : { x: 104, y: 65, width: width - 208, height: maxFoot - 75 };
  const left = page.x + (portrait ? 20 : 24);
  const measure = page.width - 2 * (left - page.x);
  const paper = scene.add.graphics().setName('clean-printed-card');
  const art = scene.add.graphics();
  scene.cameras.main.setBackgroundColor(PRINT.ground);
  const layout: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Text | Phaser.GameObjects.Container | Phaser.GameObjects.Image)[] = [paper, art];
  const buttons: Button[] = [];
  const make = (key: string, rect: Rect, text: string, click: () => void, options?: ButtonOptions) => {
    const button = action(`title:${key}`, rect, text, click, portrait ? 23 : 16, options);
    buttons.push(button);
    return button;
  };
  const buttonH = portrait ? 84 : 50;
  make('back', { x: page.x, y: portrait ? 3 : 6, width: portrait ? 128 : 112, height: buttonH }, CAMPAIGN_TEXT.back, back, { icon: 'back', bare: true });
  const act = levelAct(level.id) === 1 ? CAMPAIGN_TEXT.actOne : CAMPAIGN_TEXT.actTwo;
  const bodySize = portrait ? 23 : 17;
  const col = (text: string, size = bodySize, wrap = measure, color: string = PRINT.ink, style?: string) => {
    const label = printedText(scene, text, size, wrap, color, style);
    layout.push(label);
    return label;
  };
  const label = col(levelNumberText(level.id), portrait ? 22 : 16);
  label.setPosition(page.x + page.width - label.width / 2 - 4, portrait ? 34 : 24);
  const actLabel = col(act, portrait ? 22 : 16, measure, PRINT.muted);
  actLabel.setPosition(label.x - label.width / 2 - actLabel.width / 2 - 15, label.y);
  const navInk = scene.add.graphics();
  layout.push(navInk);
  navInk.fillStyle(PRINT.green).fillCircle(label.x - label.width / 2 - 7, label.y + label.height / 2, 1.6);
  const sealY = page.y + (portrait ? 48 : 28);
  const radius = portrait ? 24 : 17;
  art.fillStyle(0xe1c2a6).fillCircle(cx, sealY, radius).fillStyle(0x953c34).fillCircle(cx, sealY, radius - 4);
  glyph(art, 'crown', cx, sealY, radius + 2, 0xfff9eb);

  const words = LEVEL_NAMES[level.id];
  const title = col(words.name, portrait ? 56 : 37, measure, PRINT.ink);
  title.setPosition(cx, sealY + radius + (portrait ? 8 : 4));
  const notice = col(LEVEL_STORY[level.id].notice, portrait ? 25 : 20, measure, PRINT.red, 'italic');
  notice.setPosition(cx, title.y + title.height + 5);
  const top = notice.y + notice.height + (portrait ? 24 : 12);
  const artW = portrait ? measure : Math.round(measure * .46);
  const artH = artW / 2;
  const ruleW = portrait ? measure : measure - artW - 22;
  const rulesX = portrait ? left : left + artW + 22;
  const artLabel = col(MAP_NAMES[level.map], bodySize, artW, PRINT.ink, 'bold');
  const note = col(words.twist, bodySize, artW, PRINT.muted);
  const gap = portrait ? 17 : 9;
  const inset = portrait ? 61 : 44;
  const tileSize = portrait ? 43 : 31;
  const rules: { title: string; description: string; icon: Icon; feat?: boolean }[] = level.feat
    ? [
      ...levelTaxRows(level.taxes ?? {}).map(({ kind, title, description }) => ({
        title, description, icon: kind === 'windowTax' ? 'window' as const : 'crown' as const,
      })),
      { ...levelFeatRow(level.feat), icon: 'sparkle', feat: true },
    ] : [{ title: CAMPAIGN_TEXT.newThisLevel, description: LEVEL_NEW[level.id], icon: 'sparkle' }];
  const rows = rules.map(rule => {
    const heading = col(rule.title, portrait ? 28 : 20, ruleW - inset, PRINT.ink, 'bold').setOrigin(0, 0).setAlign('left');
    const detail = col(rule.description, bodySize, ruleW - inset, PRINT.muted).setOrigin(0, 0).setAlign('left');
    const tag = rule.feat ? col(CAMPAIGN_TEXT.thirdStar, portrait ? 22 : 13, ruleW - inset, PRINT.muted).setOrigin(0, .5) : undefined;
    const tagHeight = tag && heading.width + tag.width + 22 > ruleW - inset ? tag.height + 6 : 0;
    const height = Math.max(tileSize, heading.height + tagHeight + detail.height + 2) + 2 * gap;
    return { ...rule, heading, detail, tag, tagHeight, height };
  });
  const answer = level.featherBarrels ? col(CAMPAIGN_TEXT.townAnswer, bodySize, ruleW - 46, '#234b40') : undefined;
  const rulesH = rows.reduce((sum, row) => sum + row.height, 0) + (answer ? gap + answer.height : 0);
  const notesH = artH + artLabel.height + note.height + 12 + 2 * gap;
  const short = scene.scale.parentSize.height < 700;
  const crowded = top + rulesH + notesH > page.y + page.height - 10;
  const paged = scouting || portrait && (crowded || short && Object.keys(level.taxes ?? {}).length > 1);
  const notesFirst = !paged || scouting;
  const contentTop = paged && scouting ? title.y + title.height + gap : top;
  const contentH = (notesFirst ? notesH : 0) + (paged && scouting ? 0 : rulesH);
  if (portrait) {
    const maxBottom = maxFoot - (paged ? buttonH + 22 : 12);
    page.height = Math.min(maxBottom, contentTop + contentH + gap) - page.y;
  }
  sheet(paper, page);
  const pageBottom = page.y + page.height;
  const turnY = pageBottom + 12;
  const foot = portrait ? (paged ? turnY + buttonH + 10 : pageBottom + 12) : maxFoot;
  notice.setVisible(!paged || !scouting);
  artLabel.setVisible(notesFirst);
  note.setVisible(notesFirst);

  if (notesFirst) {
    const picture = mapPrint(scene, level, { x: left, y: contentTop, width: artW, height: artH }, artLabel);
    if (picture) layout.push(...picture.filter(object => object !== artLabel));
    note.setPosition(left + artW / 2, contentTop + artH + artLabel.height + 12 + gap);
  }
  if (!(paged && scouting)) {
    let y = top + (portrait && notesFirst ? notesH : 0);
    for (const row of rows) {
      const { heading, detail, icon, tag, tagHeight, height } = row;
      line(art, rulesX, y, ruleW);
      heading.setPosition(rulesX + inset, y + gap);
      detail.setPosition(heading.x, heading.y + heading.height + 2 + tagHeight);
      const tile = { x: rulesX + 2, y: y + gap + 2, width: tileSize, height: tileSize };
      const warm = icon === 'window' || icon === 'crown';
      const tileColor = warm ? 0xf2e1d2 : 0xe1eadb;
      rounded(art, tile, tileColor, tileColor, portrait ? 11 : 8);
      glyph(art, icon, tile.x + tileSize / 2, tile.y + tileSize / 2, tileSize * .68, warm ? 0x953c34 : PRINT.green);
      if (tag) {
        const tagX = tagHeight ? heading.x + 5 : heading.x + heading.width + 13;
        const tagY = tagHeight ? heading.y + heading.height + tag.height / 2 + 2 : heading.y + heading.height / 2;
        tag.setPosition(tagX, tagY);
        rounded(art, { x: tagX - 5, y: tagY - tag.height / 2, width: tag.width + 10, height: tag.height },
          0xf0ecdb, 0xd4d9c3, 6);
      }
      y += height;
    }
    if (answer) {
      line(art, rulesX, y, ruleW);
      answer.setPosition(rulesX + ruleW / 2 + 9, y + gap);
      glyph(art, 'bolt', answer.x - answer.width / 2 - 13, answer.y + answer.height / 2, portrait ? 21 : 16, PRINT.green);
    }
  } else {
    for (const { heading, detail, tag } of rows) {
      heading.setVisible(false);
      detail.setVisible(false);
      tag?.setVisible(false);
    }
    answer?.setVisible(false);
  }

  const best = col(CAMPAIGN_TEXT.bestStars, portrait ? 22 : 15);
  best.setOrigin(0, 0).setPosition(page.x + 4, foot + (buttonH - best.height - 32) / 2);
  const starSize = portrait ? 27 : 22;
  layout.push(drawStarRow(scene, best.x + starSize * 1.52, best.y + best.height + 17, stars, starSize, '#a36a36', !!level.feat));
  const playWidth = portrait ? 205 : 192;
  const right = page.x + page.width;
  if (tips) make('tips', { x: right - playWidth - (portrait ? 104 : 114), y: foot, width: portrait ? 98 : 106, height: buttonH }, CAMPAIGN_TEXT.tips, tips);
  if (paged) {
    // The short page gives Map notes an entire target above the foot.
    make('cardPage', { x: page.x + (portrait ? 8 : 154), y: portrait ? turnY : foot, width: 172, height: buttonH },
      scouting ? CAMPAIGN_TEXT.notice : CAMPAIGN_TEXT.mapNotes, turnPage, { icon: 'map' });
  }
  const playButton = make('play', { x: right - playWidth, y: foot, width: playWidth, height: buttonH }, TITLE_TEXT.play, play,
    { primary: true, icon: 'play' });

  if (portrait) {
    const offset = Math.max(0, Math.min(54, (height - foot - buttonH - 18) / 3));
    paper.setY(offset);
    for (const object of layout.slice(layout.indexOf(title))) object.setY(object.y + offset);
    // The header separator belongs to the navigation, so draw it independently of the sheet.
    art.setY(offset);
    for (const button of buttons.slice(1)) button.moveTo(button.rect.x, button.rect.y + offset);
  }
  if (motionClock(scene)) {
    const origins = layout.map(object => object.y);
    const apply = (offset: number) => {
      layout.forEach((object, i) => object.setY(origins[i] + offset));
      buttons.forEach(button => button.setVisualOffset(offset));
    };
    apply(17);
    scene.tweens.addCounter({ from: 17, to: 0, duration: 240, ease: 'Cubic.Out', onUpdate: tween => apply(tween.getValue() ?? 0) });
  }
  return playButton;
}
