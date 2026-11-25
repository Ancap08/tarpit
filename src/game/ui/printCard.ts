import type Phaser from 'phaser';
import { resolveMap, type LevelDef } from '../../sim';
import { drawMapThumbnail } from '../draw/map';
import {
  CAMPAIGN_TEXT, LEVEL_NAMES, LEVEL_NEW, LEVEL_STORY, MAP_NAMES, TITLE_TEXT,
  cardFeatText, levelNumberText, levelTaxLines,
} from '../names';
import { FONT } from '../palette';
import { mapPlateUrl } from '../skin/loading';
import type { Rect } from '../input';
import { levelAct } from './campaignMap';
import type { Button, ButtonOptions } from './button';
import { PRINT, glyph, line, motionClock, rounded, sheet, textMetrics } from './newTheme';
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
  drawMapThumbnail(fallback, resolveMap(level.map), rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 4);
  const url = mapPlateUrl(level.map);
  const image = new Image();
  image.src = url;
  const key = `clean-card-map:${level.map}`;
  const plate = scene.add.image(rect.x + 4, rect.y + 4, '__DEFAULT').setOrigin(0).setVisible(false);
  void image.decode().then(() => {
    if (!plate.scene) return;
    if (!scene.textures.exists(key)) scene.textures.addImage(key, image);
    plate.setTexture(key).setDisplaySize(rect.width - 8, rect.height - 4).setVisible(true);
    fallback.setVisible(false);
  }, () => {}); // The ink thumbnail stays visible offline.
  plate.once('destroy', () => {
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
  const foot = portrait ? height - 102 : height - 72;
  const page = portrait ? { x: 11, y: 92, width: width - 22, height: foot - 102 }
    : { x: 104, y: 65, width: width - 208, height: foot - 75 };
  const left = page.x + (portrait ? 20 : 24);
  const measure = page.width - 2 * (left - page.x);
  const art = scene.add.graphics().setName('clean-printed-card');
  scene.cameras.main.setBackgroundColor(PRINT.ground);
  sheet(art, page);
  const layout: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Text | Phaser.GameObjects.Container | Phaser.GameObjects.Image)[] = [art];
  const buttons: Button[] = [];
  const make = (key: string, rect: Rect, text: string, click: () => void, options?: ButtonOptions) => {
    const button = action(`title:${key}`, rect, text, click, portrait ? 23 : 16, options);
    buttons.push(button);
    return button;
  };
  const buttonH = portrait ? 84 : 50;
  make('back', { x: page.x, y: portrait ? 3 : 6, width: portrait ? 128 : 112, height: buttonH }, CAMPAIGN_TEXT.back, back, { icon: 'back' });
  const act = levelAct(level.id) === 1 ? CAMPAIGN_TEXT.actOne : CAMPAIGN_TEXT.actTwo;
  const bodySize = portrait ? 23 : 17;
  const col = (text: string, size = bodySize, wrap = measure, color: string = PRINT.ink, style?: string) => {
    const label = printedText(scene, text, size, wrap, color, style);
    layout.push(label);
    return label;
  };
  const label = col(levelNumberText(level.id), portrait ? 22 : 16);
  label.setPosition(page.x + page.width - label.width / 2 - 4, portrait ? 31 : 24);
  const actLabel = col(act, portrait ? 22 : 16, measure, PRINT.muted);
  actLabel.setPosition(label.x - label.width / 2 - actLabel.width / 2 - 15, label.y);
  art.fillStyle(PRINT.green).fillCircle(label.x - label.width / 2 - 7, label.y + label.height / 2, 1.6);
  const sealY = page.y + (portrait ? 52 : 28);
  const radius = portrait ? 25 : 17;
  art.fillStyle(0xe1c2a6).fillCircle(cx, sealY, radius).fillStyle(0x953c34).fillCircle(cx, sealY, radius - 4);
  glyph(art, 'crown', cx, sealY, radius + 2, 0xfff9eb);

  const words = LEVEL_NAMES[level.id];
  const title = col(words.name, portrait ? 46 : 37, measure, PRINT.ink, 'bold');
  title.setPosition(cx, sealY + radius + (portrait ? 8 : 4));
  const notice = col(LEVEL_STORY[level.id].notice, portrait ? 25 : 20, measure, PRINT.red);
  notice.setPosition(cx, title.y + title.height + 5);
  const top = notice.y + notice.height + (portrait ? 24 : 12);
  const artW = portrait ? measure : Math.round(measure * .46);
  const artH = artW / 2;
  const ruleW = portrait ? measure : measure - artW - 22;
  const rulesX = portrait ? left : left + artW + 22;
  const artLabel = col(MAP_NAMES[level.map], bodySize, artW, PRINT.ink, 'bold');
  const note = col(words.twist, bodySize, artW, PRINT.muted);
  const gap = portrait ? 15 : 9;
  const entries = level.feat
    ? [
        { copy: CAMPAIGN_TEXT.inForce, icon: 'crown', color: PRINT.muted },
        ...levelTaxLines(level.taxes!).map(copy => ({ copy, icon: 'window', color: PRINT.ink } as const)),
        { copy: cardFeatText(level.feat), icon: 'sparkle', color: PRINT.ink },
        ...(level.featherBarrels ? [{ copy: CAMPAIGN_TEXT.townAnswer, icon: 'bolt', color: '#234b40' }] as const : []),
      ] as const
    : [{ copy: CAMPAIGN_TEXT.newThisLevel, icon: 'sparkle', color: PRINT.muted },
      { copy: LEVEL_NEW[level.id], icon: 'bolt', color: PRINT.ink }] as const;
  const rows = entries.map(entry => ({
    ...entry,
    label: col(entry.copy, bodySize, ruleW - (portrait ? 55 : 42), entry.color),
  }));
  const rulesH = rows.reduce((sum, { label }) => sum + label.height + gap, 0);
  const notesH = artH + artLabel.height + note.height + 12 + 2 * gap;
  const short = scene.scale.parentSize.height < 700;
  const crowded = top + rulesH + notesH > page.y + page.height - 10;
  const paged = scouting || portrait && (crowded || short && Object.keys(level.taxes ?? {}).length > 1);
  const notesFirst = !paged || scouting;
  notice.setVisible(!paged || !scouting);
  artLabel.setVisible(notesFirst);
  note.setVisible(notesFirst);

  if (notesFirst) {
    const picture = mapPrint(scene, level, { x: left, y: top, width: artW, height: artH }, artLabel);
    if (picture) layout.push(...picture.filter(object => object !== artLabel));
    note.setPosition(left + artW / 2, top + artH + artLabel.height + 12 + gap);
  }
  if (!(paged && scouting)) {
    let y = top + (portrait && notesFirst ? notesH : 0);
    for (const { label, icon } of rows) {
      line(art, rulesX, y, ruleW);
      label.setOrigin(0, 0).setAlign('left').setPosition(rulesX + (portrait ? 55 : 42), y + gap / 2);
      const iconX = rulesX + (portrait ? 23 : 17);
      const iconY = label.y + label.height / 2;
      art.fillStyle(icon === 'window' ? 0xf2e1d2 : 0xe1eadb).fillCircle(iconX, iconY, portrait ? 19 : 13);
      glyph(art, icon, iconX, iconY, portrait ? 28 : 20, icon === 'window' ? 0x953c34 : PRINT.green);
      y += label.height + gap;
    }
  } else for (const { label } of rows) label.setVisible(false);

  const best = col(CAMPAIGN_TEXT.bestStars, portrait ? 22 : 15);
  best.setOrigin(0, 0).setPosition(page.x + 4, foot + 4);
  const starSize = portrait ? 27 : 22;
  layout.push(drawStarRow(scene, best.x + starSize * 1.52, foot + best.height + 19, stars, starSize, '#a36a36', !!level.feat));
  const playWidth = portrait ? 205 : 192;
  const right = page.x + page.width;
  if (tips) make('tips', { x: right - playWidth - (portrait ? 104 : 114), y: foot, width: portrait ? 98 : 106, height: buttonH }, CAMPAIGN_TEXT.tips, tips);
  if (paged) {
    // The short page gives Map notes an entire target above the foot.
    make('cardPage', { x: page.x + (portrait ? 8 : 154), y: portrait ? foot - 94 : foot, width: 172, height: buttonH },
      scouting ? CAMPAIGN_TEXT.notice : CAMPAIGN_TEXT.mapNotes, turnPage, { icon: 'map' });
  }
  const playButton = make('play', { x: right - playWidth, y: foot, width: playWidth, height: buttonH }, TITLE_TEXT.play, play,
    { primary: true, icon: 'play' });

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
