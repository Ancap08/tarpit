import type Phaser from 'phaser';
import { DIFFICULTIES, MAP_IDS, MAPS, type Difficulty, type LevelDef, type MapId } from '../../sim';
import { drawMapThumbnail } from '../draw/map';
import { drawSiegeCarriage } from '../draw/siegeActors';
import type { Rect } from '../input';
import {
  CAMPAIGN_TEXT, DIFFICULTY_LABELS, LEVEL_STORY, MAP_NAMES, OWNER_TEXT, STORY_TEXT, TITLE_TEXT, levelTips, tipsHeading,
} from '../names';
import type { Broadside } from '../seenTips';
import { LOOKS, type Look } from '../skin/look';
import type { Button, ButtonOptions } from './button';
import type { CampaignAct, CampaignStop } from './campaignMap';
import { ownerStories, type OwnerStory } from './campaignScreens';
import { layPaper } from './devicePixels';
import { MuteButton } from './muteButton';
import { PRINT, glyph, line, motionClock, rounded, sheet, type Icon } from './newTheme';
import { fitPaperText, paperLabelRoom, paperPadding } from './paperText';
import { printedText, type CardAction } from './printCard';
import { drawStarRow } from './starRow';

type Scene = Phaser.Scene;
type Graphics = Phaser.GameObjects.Graphics;
type Text = Phaser.GameObjects.Text;
const actNames = [CAMPAIGN_TEXT.actOne, CAMPAIGN_TEXT.actTwo, CAMPAIGN_TEXT.actThree] as const;

class PaperPage {
  readonly height: number;
  readonly cx: number;
  readonly x: number;
  readonly width: number;
  readonly pad: number;
  readonly gap: number;
  readonly tap: number;
  readonly size: number;
  readonly ink: Graphics;
  private readonly background: Graphics;

  constructor(readonly scene: Scene, readonly portrait: boolean, private readonly action: CardAction, desktopWidth: number) {
    this.height = scene.scale.height;
    this.cx = scene.scale.width / 2;
    this.width = portrait ? scene.scale.width - 46 : desktopWidth;
    this.x = this.cx - this.width / 2;
    this.pad = portrait ? 24 : 20;
    this.gap = portrait ? 12 : 8;
    this.tap = portrait ? 84 : 52;
    this.size = portrait ? 26 : 17;
    this.background = scene.add.graphics().setName('paper-page');
    this.ink = scene.add.graphics();
  }

  get inner() { return this.width - 2 * this.pad; }
  get left() { return this.x + this.pad; }
  get right() { return this.x + this.width - this.pad; }
  get navY() { return this.portrait ? 3 : 6; }

  label(text: string, size = this.size, width = this.inner, color: string = PRINT.ink, style?: string): Text {
    return printedText(this.scene, text, size, width, color, style);
  }

  place(label: Text, y: number, x = this.cx): number {
    label.setPosition(x, y);
    return y + label.height;
  }

  panel(y: number, height: number): void {
    sheet(this.background, { x: this.x, y, width: this.width, height });
  }

  back(click: () => void, text: string = CAMPAIGN_TEXT.back): Button {
    const width = text === CAMPAIGN_TEXT.back ? (this.portrait ? 111 : 112) : (this.portrait ? 240 : 168);
    return this.action('title:back', { x: this.x, y: this.navY, width, height: this.tap }, text, click,
      this.portrait ? 23 : 16, { bare: true, icon: 'back', paperGrow: 8 });
  }

  button(key: string, rect: Rect, text: string, click: () => void, options?: ButtonOptions, size = this.size): Button {
    const paperWrapWidth = rect.width - (options?.icon ? 58 : 20);
    return this.action(`title:${key}`, rect, text, click, size, { paperGrow: 2, paperWrapWidth, ...options });
  }

  row(index: number, count: number, y: number, height = this.tap, inset = this.pad, gap = this.gap): Rect {
    const width = (this.width - 2 * inset - (count - 1) * gap) / count;
    return { x: this.x + inset + index * (width + gap), y, width, height };
  }

  center(height: number, top = this.pad): number {
    return Math.max(top, (this.height - height) / 2);
  }

  ornament(y: number, icon: Icon): void {
    const size = this.portrait ? 22 : 15;
    const width = this.portrait ? 76 : 60;
    line(this.ink, this.cx - width - size, y, width);
    line(this.ink, this.cx + size, y, width);
    glyph(this.ink, icon, this.cx, y, size, 0x953c34);
  }

  arrive(): void {
    if (motionClock(this.scene)) layPaper(this.scene, this.portrait ? 12 : 7);
  }
}

/** Small ink blocks for the printed village, keep and map landmarks. */
function engraving(g: Graphics, x: number, y: number, scale: number, subject: 'town' | 'keep' | 'trees' | 'hills'): void {
  const p = (dx: number, dy: number) => ({ x: x + dx * scale, y: y + dy * scale });
  const stroke = (points: readonly (readonly [number, number])[], color = 0x60705c) => {
    g.lineStyle(1.35 * scale, color).strokePoints(points.map(([x, y]) => p(x, y)), false);
  };
  if (subject === 'trees') {
    for (const [dx, h] of [[-15, 18], [0, 26], [16, 14]]) {
      stroke([[dx, 2], [dx, -h], [dx - 8, -5], [dx + 8, -5], [dx, -h]]);
    }
    stroke([[-29, 5], [25, 5]], 0xb0a78a);
    return;
  }
  if (subject === 'hills') {
    stroke([[-47, 5], [-24, -19], [-5, -2], [18, -34], [46, 5]]);
    stroke([[-30, -12], [-22, -10], [-18, -14]]);
    stroke([[8, -20], [19, -17], [24, -24]]);
    stroke([[-41, 9], [40, 9]], 0xb0a78a);
    return;
  }
  const buildings = subject === 'keep' ? [[-31, 19, 40], [0, 26, 30], [31, 19, 44]]
    : [[-39, 23, 18], [-14, 24, 27], [13, 19, 38], [39, 25, 20]];
  for (const [dx, w, h] of buildings) {
    const left = dx - w / 2, right = dx + w / 2;
    const points: [number, number][] = [[left, 0], [left, -h]];
    if (subject === 'keep') points.push([left + w / 4, -h], [left + w / 4, -h + 5], [right - w / 4, -h + 5], [right - w / 4, -h], [right, -h]);
    else points.push([dx, -h - 12], [right, -h]);
    points.push([right, 0], [left, 0]);
    g.fillStyle(0xe3e6d3).fillPoints(points.map(([x, y]) => p(x, y)), true);
    stroke(points);
    stroke([[left + 3, -h + 3], [right - 3, -h + 3]]);
    stroke([[dx - 3, 0], [dx - 3, -9], [dx + 3, -9], [dx + 3, 0]]);
    if (h > 20) stroke([[dx - 2, -h + 9], [dx + 2, -h + 9]]);
  }
  stroke([[-63, 0], [63, 0]]);
  stroke([[-53, 5], [45, 5]], 0xb0a78a);
  stroke([[-35, 10], [37, 10]], 0xb0a78a);
}

function drawCarriagePrint(g: Graphics, x: number, y: number, scale: number): void {
  const p = (dx: number, dy: number) => ({ x: x + dx * scale, y: y + dy * scale });
  const ink = 0x60705c;
  const body = [[-31, -4], [-36, -16], [-30, -29], [-19, -35], [16, -35], [28, -26], [30, -12], [24, -4], [-31, -4]];
  const points = body.map(([dx, dy]) => p(dx, dy));
  g.fillStyle(0xe3e6d3).fillPoints(points, true);
  g.lineStyle(1.6 * scale, ink).strokePoints(points, false);
  g.strokeRect(p(-19, -28).x, p(0, -28).y, 15 * scale, 13 * scale);
  g.strokeRect(p(3, -28).x, p(0, -28).y, 13 * scale, 13 * scale);
  g.strokePoints([p(-41, -6), p(38, -6), p(46, -15)], false);
  for (const dx of [-20, 20]) {
    const wheel = p(dx, 0);
    g.fillStyle(PRINT.sheet).fillCircle(wheel.x, wheel.y, 10 * scale);
    g.lineStyle(1.4 * scale, ink).strokeCircle(wheel.x, wheel.y, 10 * scale);
    for (const angle of [0, Math.PI / 3, 2 * Math.PI / 3]) {
      const rx = Math.cos(angle) * 8 * scale, ry = Math.sin(angle) * 8 * scale;
      g.lineBetween(wheel.x - rx, wheel.y - ry, wheel.x + rx, wheel.y + ry);
    }
  }
  line(g, x - 106 * scale, y + 12 * scale, 212 * scale);
}

interface TitleActions {
  campaign(): void;
  freePlay(): void;
  owner?: () => void;
  back(): void;
  play(): void;
  difficulty(choice: Difficulty): void;
  map(choice: MapId): void;
  look(choice: Look): void;
}

export function drawPaperTitle(scene: Scene, portrait: boolean, first: boolean, action: CardAction, choose: TitleActions) {
  const p = new PaperPage(scene, portrait, action, first ? 712 : 736);
  const settingsY = p.navY;
  const optionW = portrait ? 124 : 101;
  const settingsGap = portrait ? 4 : 8;
  const navWidth = first ? choose.owner ? 121 : 0 : 111;
  const navRoom = navWidth ? navWidth + 8 : 0;
  const optionSlot = portrait ? Math.min(140, Math.floor((p.width - navRoom - p.tap - 3 * settingsGap) / 2)) : optionW;
  const room = Math.max(0, (optionSlot - optionW) / 2);
  const mute = new MuteButton(scene, { x: p.x + p.width - p.tap, y: settingsY, width: p.tap, height: p.tap });
  const lookX = p.x + p.width - p.tap - 2 * (optionSlot + settingsGap);
  const lookLabel = p.label(TITLE_TEXT.look, portrait ? p.inner < 500 ? 20 : 23 : 16, 76, PRINT.muted);
  const lookCaptionX = lookX - settingsGap - lookLabel.width / 2;
  if (portrait && lookCaptionX - lookLabel.width / 2 < p.x + navRoom + settingsGap) {
    p.place(lookLabel, settingsY + p.tap + settingsGap, lookX + optionSlot + settingsGap / 2);
  } else p.place(lookLabel, settingsY + (p.tap - lookLabel.height) / 2, lookCaptionX);
  const looks = new Map<Look, Button>();
  LOOKS.forEach((look, i) => looks.set(look, action(`title:look:${look}`, {
    x: lookX + i * (optionSlot + settingsGap) + room, y: settingsY, width: Math.min(optionW, optionSlot), height: p.tap,
  }, TITLE_TEXT[look], () => choose.look(look), portrait ? 22 : 16, { paperGrow: room })));

  const levels = new Map<Difficulty, Button>();
  const maps = new Map<MapId, Button>();
  const title = p.label(first ? TITLE_TEXT.title.toUpperCase() : TITLE_TEXT.title, portrait ? first ? 89 : 56 : first ? 80 : 42);
  title.setPadding(0, 0, 0, 6);
  const subtitle = p.label(first ? TITLE_TEXT.slogan : TITLE_TEXT.subtitle, portrait ? 29 : 19, p.inner, PRINT.red, 'italic');
  let best: Text | undefined;
  let play: Button | undefined;

  if (first) {
    if (choose.owner) {
      action('title:owner', { x: p.x, y: settingsY, width: portrait ? navWidth : 100, height: p.tap },
        OWNER_TEXT.mark, choose.owner, portrait ? 23 : 16, { bare: true, paperGrow: 8 });
    }
    const story = p.label(TITLE_TEXT.story, portrait ? 25 : 18, p.inner, PRINT.muted);
    const pictureH = portrait ? 196 : 120;
    const titleH = title.height + subtitle.height + story.height;
    const actionsH = portrait ? 2 * p.tap + p.gap : p.tap;
    const body = 2 * p.pad + titleH + pictureH + 7 * p.gap + actionsH;
    const start = p.center(body, p.tap + 3 * p.gap);
    p.panel(start, body);
    let y = start + p.pad;
    const sealSize = portrait ? 24 : 16;
    const sealY = y + sealSize;
    p.ink.fillStyle(0xe1c2a6).fillCircle(p.cx, sealY, sealSize)
      .fillStyle(0x953c34).fillCircle(p.cx, sealY, sealSize - 3);
    glyph(p.ink, 'crown', p.cx, sealY, sealSize + 2, PRINT.sheet);
    y = p.place(title, y + 2 * sealSize + p.gap);
    y = p.place(subtitle, y + p.gap / 2);
    y = p.place(story, y + p.gap);
    const baseline = y + pictureH - 3 * p.gap;
    const villageScale = portrait ? 2.26 : 1.38;
    engraving(p.ink, p.cx, baseline, villageScale, 'town');
    engraving(p.ink, p.cx - 69 * villageScale, baseline, .5 * villageScale, 'trees');
    engraving(p.ink, p.cx + 69 * villageScale, baseline, .5 * villageScale, 'hills');
    y += pictureH;
    line(p.ink, p.left, y, p.inner);
    y += p.gap;
    p.button('campaign', p.row(0, portrait ? 1 : 2, y), CAMPAIGN_TEXT.campaign, choose.campaign, { primary: true, icon: 'map' }, portrait ? 31 : 21);
    p.button('freePlay', p.row(portrait ? 0 : 1, portrait ? 1 : 2, portrait ? y + p.tap + p.gap : y),
      CAMPAIGN_TEXT.freePlay, choose.freePlay, { icon: 'play' }, portrait ? 31 : 21);
  } else {
    p.back(choose.back);
    const difficulty = p.label(TITLE_TEXT.difficulty, p.size, p.inner, PRINT.ink, 'bold');
    const mapCaption = p.label(TITLE_TEXT.map, p.size, p.inner, PRINT.ink, 'bold');
    const prompt = p.label(TITLE_TEXT.prompt, portrait ? 22 : 14, p.inner, PRINT.muted);
    best = p.label('', portrait ? 23 : 15, p.inner, PRINT.muted);
    const mapH = portrait ? 154 : 99;
    const mapNameSize = portrait ? p.inner < 500 ? 20 : 23 : 16;
    const start = portrait ? p.tap + 4 * p.gap : p.tap + 2 * p.gap;
    const headingBottom = p.place(subtitle, p.place(title, start + p.pad) + p.gap / 2);
    line(p.ink, p.left, headingBottom + p.gap, p.inner);
    let y = p.place(difficulty, headingBottom + 2 * p.gap) + p.gap;
    DIFFICULTIES.forEach((choice, i) => {
      levels.set(choice, p.button(choice, p.row(i, 3, y), DIFFICULTY_LABELS[choice], () => choose.difficulty(choice)));
    });
    y = p.place(mapCaption, y + p.tap + 2 * p.gap) + p.gap;
    MAP_IDS.forEach((choice, i) => {
      const rect = portrait ? p.row(i, 3, y, mapH, 6, 8) : p.row(i, 3, y, mapH);
      const map = p.button(`map:${choice}`, rect, MAP_NAMES[choice], () => choose.map(choice), {
        labelY: mapH - (portrait ? 28 : 20),
      }, mapNameSize);
      maps.set(choice, map);
      const art = scene.add.graphics();
      const maxWidth = rect.width - 2 * p.gap;
      const thumbW = Math.min(maxWidth, portrait ? 166 : 144);
      drawMapThumbnail(art, MAPS[choice], rect.x + (rect.width - thumbW) / 2, rect.y + p.gap, thumbW, thumbW / 2);
    });
    const scoreY = y + mapH + p.gap;
    best.setOrigin(.5).setPosition(p.cx, scoreY + (portrait ? 27 : 12));
    const playY = scoreY + (portrait ? 54 : 25) + p.gap;
    play = p.button('play', p.row(0, 1, playY), TITLE_TEXT.play, choose.play, { primary: true, icon: 'play' });
    const bottom = p.place(prompt, playY + p.tap + p.gap) + p.pad;
    p.panel(start, bottom - start);
  }
  p.arrive();
  return { levels, maps, looks, mute, best, play };
}

export function drawPaperMap(
  scene: Scene, portrait: boolean, stops: CampaignStop[], lockedMessage: string | null,
  act: CampaignAct, secondActOpen: boolean, action: CardAction, select: (stop: CampaignStop) => void,
  switchAct: (act: CampaignAct) => void, back: () => void, thirdActOpen?: boolean,
): Text {
  const p = new PaperPage(scene, portrait, action, 872);
  p.back(back);
  const top = p.tap + 2 * p.gap;
  const heading = p.label(CAMPAIGN_TEXT.levelMap, portrait ? 54 : 38);
  const actName = p.label(actNames[act - 1], portrait ? 26 : 17, p.inner, PRINT.red, 'italic');
  const headerEnd = p.place(actName, p.place(heading, top + p.pad) + p.gap / 2);
  line(p.ink, p.left, headerEnd + p.gap, p.inner);
  const trailTop = headerEnd + (portrait ? 95 : 64);
  const trailBottom = portrait ? 948 : 411;
  const tileW = portrait ? 120 : 105;
  const tileH = portrait ? 104 : 70;
  const split = portrait ? .275 : .41;
  const columns = portrait ? 2 : 5;
  const steps = act === 3 ? (
    portrait ? [[-.54, 1], [.56, .77], [-.37, .51], [.57, .27], [0, .02]]
      : [[-1, .98], [-.52, .78], [0, .48], [.52, .18], [1, 0]]
  ) : stops.map((_, i) => {
    const row = Math.floor(i / columns);
    const n = i % columns;
    const col = row % 2 ? columns - 1 - n : n;
    return [(2 * col / (columns - 1) - 1) * (row % 2 ? .86 : 1), portrait ? row / 4 : row * .87 + n % 2 * .12];
  });
  if (act === 3) {
    engraving(p.ink, portrait ? p.cx - p.inner * .30 : p.cx + 140, trailTop - 8, portrait ? 1.38 : .9, 'keep');
    if (portrait) {
      engraving(p.ink, p.cx - p.inner * .27, trailTop + (trailBottom - trailTop) * .25, 1.1, 'hills');
      engraving(p.ink, p.cx + p.inner * .28, trailTop + (trailBottom - trailTop) * .59, 1.2, 'hills');
    }
  } else if (portrait) {
    engraving(p.ink, p.cx, trailTop + 72, 1.02, act === 1 ? 'trees' : 'hills');
    engraving(p.ink, p.cx, trailBottom - 80, .78, act === 1 ? 'hills' : 'trees');
  } else {
    engraving(p.ink, p.cx + 86, (trailTop + trailBottom) / 2, .9, 'hills');
    engraving(p.ink, p.cx - 232, (trailTop + trailBottom) / 2 + 11, .85, 'trees');
  }
  const points = steps.map(([dx, dy]) => ({ x: p.cx + dx * p.inner * split, y: trailTop + dy * (trailBottom - trailTop) }));
  // Curve between milestones. The pale shoulder separates the road from its ink edge.
  const road = points.flatMap((from, i) => {
    const to = points[i + 1];
    if (!to) return [from];
    const dx = to.x - from.x, dy = to.y - from.y;
    return Array.from({ length: 9 }, (_, j) => {
      const t = j / 9;
      const bend = Math.sin(t * Math.PI) * (i % 2 ? -1 : 1) * (portrait ? 18 : 12);
      const length = Math.hypot(dx, dy);
      return { x: from.x + dx * t - bend * dy / length, y: from.y + dy * t + bend * dx / length };
    });
  });
  for (const [weight, color] of [[13, 0xb9a487], [9, 0xe2d3b4]]) p.ink.lineStyle(weight, color).strokePoints(road, false);
  stops.forEach((stop, i) => {
    const { x, y } = points[i];
    stop.rect = { x: x - tileW / 2, y: y - tileH / 2, width: tileW, height: tileH };
    const button = p.button(`stop:${stop.id}`, stop.rect, '', () => select(stop), { primary: stop.next });
    button.setLocked(!stop.open);
    button.setPicked(stop.next);
    const number = p.label(String(stop.id), portrait ? 33 : 24, tileW,
      stop.next ? '#fff9eb' : stop.open ? PRINT.ink : PRINT.muted, 'bold');
    fitPaperText([number], portrait ? 33 : 24, () => {
      p.place(number, Math.max(y - (portrait ? 39 : 24), stop.rect.y + paperPadding(scene).y), x + (stop.open ? 0 : 10));
      const room = paperLabelRoom(number, stop.rect);
      return room.x >= 0 && room.y >= -1e-7;
    });
    if (!stop.open) glyph(scene.add.graphics(), 'lock', x - (stop.id < 10 ? 16 : 24), number.y + number.height / 2, portrait ? 20 : 16, 0x64705d);
    drawStarRow(scene, x, y + (portrait ? 22 : 18), stop.stars, portrait ? 22 : 16,
      stop.next ? '#ede2be' : stop.open ? '#a36a36' : '#81765e', stop.feat);
  });
  const statusY = trailBottom + tileH / 2 + p.gap;
  const status = p.label(lockedMessage ?? (act > 1 ? CAMPAIGN_TEXT.featStar : ''), portrait ? 22 : 14, p.inner, PRINT.muted);
  p.place(status, statusY);
  const tabY = statusY + (portrait ? 42 : 24);
  if (thirdActOpen === undefined) {
    const other = act === 1 ? 2 : 1;
    const tab = p.button('act', p.row(0, 1, tabY), actNames[other - 1], () => switchAct(other),
      { icon: act === 1 && !secondActOpen ? 'lock' : 'arrow' });
    tab.setLocked(act === 1 && !secondActOpen);
  } else {
    ([1, 2, 3] as const).forEach(target => {
      const open = target === 1 || (target === 2 ? secondActOpen : thirdActOpen);
      const tab = p.button(`act:${target}`, p.row(target - 1, 3, tabY), CAMPAIGN_TEXT.actTabs[target - 1],
        () => switchAct(target), { primary: target === act, icon: open ? undefined : 'lock' }, portrait ? 23 : 17);
      tab.setLocked(!open);
      tab.setPicked(target === act);
    });
  }
  p.panel(top, tabY + p.tap + p.pad - top);
  p.arrive();
  return status;
}

const notices = {
  opening: [STORY_TEXT.openingNotice, STORY_TEXT.openingReply],
  secondAct: [STORY_TEXT.secondActNotice, STORY_TEXT.secondActReply],
  thirdAct: [STORY_TEXT.thirdActNotice, STORY_TEXT.thirdActReply],
} as const;

export function drawPaperStory(scene: Scene, portrait: boolean, which: Broadside, action: CardAction, proceed: () => void, frozen: boolean): Button {
  if (which === 'ending' || which === 'siegeEnding') {
    return drawPaperLetter(scene, portrait, action, STORY_TEXT.endingTitle,
      [which === 'ending' ? STORY_TEXT.ending : STORY_TEXT.siegeEnding], proceed, which, frozen);
  }
  return drawPaperLetter(scene, portrait, action, STORY_TEXT.openingTitle, notices[which], proceed);
}

export function drawPaperClose(scene: Scene, portrait: boolean, level: number, action: CardAction, back: () => void): void {
  drawPaperLetter(scene, portrait, action, STORY_TEXT.endingTitle,
    [LEVEL_STORY[level].reply, level === 10 ? STORY_TEXT.firstActClose : STORY_TEXT.secondActClose], undefined, undefined, true, back);
}

function drawPaperLetter(
  scene: Scene, portrait: boolean, action: CardAction, title: string, copy: readonly string[],
  proceed?: () => void, ending?: 'ending' | 'siegeEnding', frozen = false, back?: () => void,
): Button {
  const p = new PaperPage(scene, portrait, action, 730);
  const backButton = back && p.back(back);
  const heading = p.label(title, portrait ? 56 : 41);
  const body = p.label(copy[0], portrait ? 32 : 23, p.inner - 2 * p.gap).setLineSpacing(portrait ? 5 : 4);
  const reply = copy[1] ? p.label(copy[1], portrait ? 28 : 19, p.inner - 4 * p.gap, PRINT.red, 'italic')
    .setLineSpacing(portrait ? 5 : 4) : undefined;
  const artW = Math.min(p.inner - 6, portrait ? 545 : 530);
  const artH = ending === 'siegeEnding' ? artW * (portrait ? .71 : .24)
    : ending ? (portrait ? 172 : 113) : portrait ? 116 : 66;
  const replyH = reply ? reply.height + 4 * p.gap : 0;
  const height = 2 * p.pad + heading.height + body.height + replyH + artH + (proceed ? p.tap : 0) + 10 * p.gap;
  const top = p.center(height, back ? p.tap + 2 * p.gap : p.pad);
  p.panel(top, height);
  p.ornament(top + p.pad + p.gap, ending || back ? 'sparkle' : 'crown');
  const headingEnd = p.place(heading, top + p.pad + 3 * p.gap);
  line(p.ink, p.left, headingEnd + p.gap, p.inner);
  let y = p.place(body, headingEnd + 3 * p.gap) + p.gap;
  if (reply) {
    const rect = { x: p.left, y, width: p.inner, height: reply.height + 3 * p.gap };
    rounded(p.ink, rect, PRINT.inset, PRINT.edge, portrait ? 14 : 10);
    p.place(reply, y + 1.5 * p.gap);
    y += replyH;
  }
  if (ending === 'siegeEnding') {
    const rect = { x: p.cx - artW / 2, y, width: artW, height: artH };
    rounded(p.ink, { x: rect.x - 3, y: y - 3, width: artW + 6, height: artH + 6 }, PRINT.inset, PRINT.edge, 7);
    drawSiegeCarriage(scene, rect, portrait, frozen, true);
  } else if (ending) {
    const centerY = y + artH * .55;
    const scale = portrait ? 1.72 : 1.12;
    engraving(p.ink, p.cx - 66 * scale, centerY + 7 * scale, .54 * scale, 'trees');
    engraving(p.ink, p.cx + 65 * scale, centerY + 7 * scale, .55 * scale, 'hills');
    drawCarriagePrint(p.ink, p.cx, centerY, scale);
  } else {
    engraving(p.ink, p.cx, y + artH - p.gap, portrait ? 1.5 : .88, 'town');
  }
  const button = proceed ? p.button('continue', p.row(0, 1, top + height - p.pad - p.tap), STORY_TEXT.continue,
    proceed, { primary: true, icon: 'arrow' }) : backButton!;
  p.arrive();
  return button;
}

export function drawPaperTips(
  scene: Scene, portrait: boolean, level: LevelDef, touch: boolean, action: CardAction, accept: () => void,
  back?: () => void, previousPlay?: Pick<Rect, 'y' | 'height'>,
): Button {
  const p = new PaperPage(scene, portrait, action, 740);
  if (back) p.back(back);
  const heading = p.label(tipsHeading(level.id), portrait ? 51 : 37);
  const inset = portrait ? 52 : 42;
  const lines = levelTips(level.id, touch).map(text => p.label(text, portrait ? 27 : 21, p.inner - inset)
    .setOrigin(0, 0).setAlign('left').setLineSpacing(portrait ? 4 : 3));
  const headerH = heading.height + 5 * p.gap;
  const rowsH = lines.reduce((sum, label) => sum + label.height + 2 * p.gap, 0);
  const height = 2 * p.pad + headerH + rowsH + p.tap + p.gap;
  let top = p.center(height, back ? p.tap + 2 * p.gap : p.pad);
  const buttonOffset = height - p.pad - p.tap;
  if (previousPlay && top + buttonOffset < previousPlay.y + previousPlay.height && previousPlay.y < top + height - p.pad) {
    top = previousPlay.y - p.tap - buttonOffset - p.gap;
    // A low card can leave room below its Play target instead.
    if (top < p.tap + 2 * p.gap) top = previousPlay.y + previousPlay.height - buttonOffset + p.gap;
  }
  p.panel(top, height);
  p.ornament(top + p.pad + p.gap, 'sparkle');
  p.place(heading, top + p.pad + 3 * p.gap);
  let y = top + p.pad + headerH;
  for (const label of lines) {
    line(p.ink, p.left, y, p.inner);
    p.place(label, y + p.gap, p.left + inset);
    glyph(p.ink, 'sparkle', p.left + inset / 2, y + p.gap + (portrait ? 16 : 12), portrait ? 19 : 15, PRINT.green);
    y += label.height + 2 * p.gap;
  }
  const button = p.button('gotIt', p.row(0, 1, top + buttonOffset), CAMPAIGN_TEXT.gotIt, accept, { primary: true, icon: 'arrow' });
  p.arrive();
  return button;
}

export function drawPaperOwner(
  scene: Scene, portrait: boolean, levels: readonly LevelDef[], action: CardAction,
  story: (which: OwnerStory) => void, tips: (id: number) => void, reset: () => void, back: () => void,
): string[] {
  const p = new PaperPage(scene, portrait, action, 862);
  p.back(back, OWNER_TEXT.back);
  const title = p.label(OWNER_TEXT.title, portrait ? 48 : 35);
  const heading = p.label(CAMPAIGN_TEXT.tips, portrait ? 28 : 20, p.inner, PRINT.ink, 'bold');
  const top = p.tap + (portrait ? p.gap / 2 : 0);
  const y = p.place(title, top + (portrait ? p.pad : p.gap)) + p.gap;
  line(p.ink, p.left, y, p.inner);
  const keys: string[] = [];
  const button = (key: string, rect: Rect, title: string, click: () => void) => {
    keys.push(key);
    return p.button(key, rect, title, click, undefined, portrait ? 23 : 16);
  };
  const columns = portrait ? 2 : 4;
  const step = p.tap + p.gap;
  const storyY = y + p.gap;
  ownerStories.forEach((which, i) => button(`owner:${which}`,
    p.row(i % columns, columns, storyY + Math.floor(i / columns) * step), OWNER_TEXT[which], () => story(which)));
  const storyBottom = storyY + Math.ceil(ownerStories.length / columns) * step;
  const tipsY = p.place(heading, storyBottom) + p.gap;
  // Landscape uses nine columns so the story previews and numbered tips fit on one sheet.
  const tipColumns = portrait ? 5 : 9;
  const tipH = portrait ? p.tap : 45;
  const tipStep = tipH + 8;
  levels.forEach(({ id }, i) => button(`owner:tips:${id}`,
    p.row(i % tipColumns, tipColumns, tipsY + Math.floor(i / tipColumns) * tipStep, tipH), String(id), () => tips(id)));
  const tipsBottom = tipsY + Math.ceil(levels.length / tipColumns) * tipStep;
  button('owner:reset', p.row(0, 1, tipsBottom), OWNER_TEXT.reset, reset);
  p.panel(top, tipsBottom + p.tap + p.gap - top);
  p.arrive();
  return [...keys, 'back'];
}
