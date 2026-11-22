// Title menu (milestone 25): the title and subtitle, a "Difficulty" row of
// three buttons (Normal preselected, the pick highlighted like the build
// bar's active tower), a "Map" row of three thumbnail buttons (milestone 27,
// Meadow preselected, highlighted the same way), then [Play], which starts
// GameScene on the selected level and map. Clicking or tapping a level or a
// map only selects it; only Play starts. Keyboard: Left/Right move the level
// selection, Up/Down the map selection (Up to the left, Down to the right,
// stopping at the ends), Enter or Space presses Play.
//
// The selections live on the scene object, which Phaser keeps for the whole
// page session, so returning from an end screen's [Menu] shows the level and
// map played last. A page reload goes back to Normal and Meadow.
//
// Layout (canvas 960 x 580, everything centred on x 480): title y 110,
// subtitle y 172, "Difficulty" caption y 224, level buttons y 244..286,
// "Map" caption y 312, map thumbnails y 326..398 (132 px wide, 16 px apart,
// like the level buttons; each a 96 x 48 picture of the map drawn from its
// data with the name under it), the high-score line (milestone 26) centred
// on y 414, [Play] y 446..488, prompt y 522.
//
// Ready (milestone 26 follow-up): Phaser makes an interactive object
// hit-testable only at its scene's next update after setInteractive (the
// input plugin's pending-insertion list). On a first visit the title's
// create() runs when the enemy sheets finish loading, between frames, so for
// up to one frame the scene reports active while a click on Play hits
// nothing and is lost. Nothing is drawn yet in that window, so a player
// cannot aim at Play; only a test that clicks as soon as the scene is
// active can. `ready` turns true at the scene's first render, after that
// update; rects() lists the buttons only from then, and the hook
// titleReady() reports it, so specs wait for it before clicking.
//
// High-score line (milestone 26): "Best on Riverbend, Normal: 12 waves" for
// the selected map and level (highScore.ts, names.ts bestScoreText),
// redrawn when either selection changes; no line when that pair has no
// score.

import Phaser from 'phaser';
import { DEFAULT_DIFFICULTY, DEFAULT_MAP, DIFFICULTIES, MAP_IDS, MAPS, type Difficulty, type MapId } from '../sim';
import { loadEnemySheets } from './anim/enemySprites';
import { drawMapThumbnail } from './draw/map';
import type { Rect } from './input';
import { highScores } from './highScore';
import { bestScoreText, DIFFICULTY_LABELS, MAP_NAMES, TITLE_TEXT } from './names';
import { COLORS, FONT, TEXT } from './palette';
import { Button } from './ui/button';

/** Menu buttons: 42 px tall like every touch target (44.8 px on an iPad in landscape). */
export const MENU_BUTTON_H = 42;
export const LEVEL_BUTTON_W = 132;
const LEVEL_GAP = 16;
export const LEVEL_ROW_Y = 244;
export const PLAY_BUTTON_W = 200;
export const PLAY_BUTTON_Y = 446;
/** The map row (milestone 27): thumbnail buttons as wide and as far apart as the level buttons. */
export const MAP_ROW_Y = 326;
export const MAP_BUTTON_H = 72;
/** The map picture inside a thumbnail button: 960 x 480 scaled by 0.1, 3 px from the top. */
const THUMB_W = 96;
const THUMB_H = 48;
const THUMB_TOP = 3;
/** The map name's centre, from the button's top. */
const THUMB_NAME_Y = 60;
/** The high-score line's centre (milestone 26), below milestone 27's map row (y 326..398). */
export const BEST_LINE_Y = 414;
export const BEST_LINE_SIZE = 18;

/** What the test hook ui() reports while the title menu shows. */
export interface TitleUiState {
  scene: 'title';
  difficulty: Difficulty;
  /** The selected map (milestone 27). */
  map: MapId;
  /** The menu has been drawn once, so its buttons take clicks (milestone 26 follow-up). */
  ready: boolean;
  /** The high-score line (milestone 26) and its box in canvas px, or null when the map and level have no score. */
  bestLine: { text: string; rect: Rect } | null;
}

/** Data GameScene is started with. */
export interface GameStartData {
  difficulty: Difficulty;
  /** The map (milestone 27); Meadow when left out. */
  map?: MapId;
}

export class TitleScene extends Phaser.Scene {
  /** The selected level; kept across visits to the menu for the page session. */
  private selected: Difficulty = DEFAULT_DIFFICULTY;
  private levelButtons = new Map<Difficulty, Button>();
  /** The selected map (milestone 27); kept like the level. */
  private selectedMap: MapId = DEFAULT_MAP;
  private mapButtons = new Map<MapId, Button>();
  private playButton: Button | null = null;
  private bestLine: Phaser.GameObjects.Text | null = null;
  private starting = false;
  /** True from the first render after create(); see "Ready" above. */
  private ready = false;

  constructor() {
    super('title');
  }

  /** Enemy sprite sheets load once at boot, so GameScene (and its restarts) start with them. */
  preload(): void {
    loadEnemySheets(this);
  }

  create(): void {
    const { width } = this.scale;
    const cx = width / 2;
    this.cameras.main.setBackgroundColor(COLORS.titleBg);
    this.starting = false;
    this.ready = false;
    this.events.once(Phaser.Scenes.Events.RENDER, () => {
      this.ready = true;
    });

    this.add
      .text(cx, 110, TITLE_TEXT.title, { fontFamily: FONT, fontSize: '72px', fontStyle: 'bold', color: TEXT.title })
      .setOrigin(0.5);
    this.add.text(cx, 172, TITLE_TEXT.subtitle, { fontFamily: FONT, fontSize: '24px', color: TEXT.subtitle }).setOrigin(0.5);

    this.add
      .text(cx, LEVEL_ROW_Y - 20, TITLE_TEXT.difficulty, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: TEXT.subtitle })
      .setOrigin(0.5);
    const rowWidth = DIFFICULTIES.length * LEVEL_BUTTON_W + (DIFFICULTIES.length - 1) * LEVEL_GAP;
    this.levelButtons = new Map();
    DIFFICULTIES.forEach((level, i) => {
      const rect = { x: cx - rowWidth / 2 + i * (LEVEL_BUTTON_W + LEVEL_GAP), y: LEVEL_ROW_Y, width: LEVEL_BUTTON_W, height: MENU_BUTTON_H };
      this.levelButtons.set(level, new Button(this, rect, DIFFICULTY_LABELS[level], () => this.select(level)));
    });

    // The map row (milestone 27): a caption, then a thumbnail button per map.
    this.add
      .text(cx, MAP_ROW_Y - 14, TITLE_TEXT.map, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: TEXT.subtitle })
      .setOrigin(0.5);
    const mapRowWidth = MAP_IDS.length * LEVEL_BUTTON_W + (MAP_IDS.length - 1) * LEVEL_GAP;
    this.mapButtons = new Map();
    MAP_IDS.forEach((map, i) => {
      const rect = { x: cx - mapRowWidth / 2 + i * (LEVEL_BUTTON_W + LEVEL_GAP), y: MAP_ROW_Y, width: LEVEL_BUTTON_W, height: MAP_BUTTON_H };
      this.mapButtons.set(map, new Button(this, rect, '', () => this.selectMap(map)));
      // Drawn after the button, so over its box; neither the picture nor the name takes input.
      const g = this.add.graphics();
      drawMapThumbnail(g, MAPS[map], rect.x + (rect.width - THUMB_W) / 2, rect.y + THUMB_TOP, THUMB_W, THUMB_H);
      g.lineStyle(1, COLORS.buttonEdge, 0.6);
      g.strokeRect(rect.x + (rect.width - THUMB_W) / 2, rect.y + THUMB_TOP, THUMB_W, THUMB_H);
      this.add
        .text(rect.x + rect.width / 2, rect.y + THUMB_NAME_Y, MAP_NAMES[map], { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: TEXT.button })
        .setOrigin(0.5);
    });

    this.bestLine = this.add
      .text(cx, BEST_LINE_Y, '', { fontFamily: FONT, fontSize: `${BEST_LINE_SIZE}px`, fontStyle: 'bold', color: TEXT.subtitle })
      .setOrigin(0.5);

    this.playButton = new Button(
      this,
      { x: cx - PLAY_BUTTON_W / 2, y: PLAY_BUTTON_Y, width: PLAY_BUTTON_W, height: MENU_BUTTON_H },
      TITLE_TEXT.play,
      () => this.play(),
      { fontSize: '22px' },
    );

    this.add
      .text(cx, 522, TITLE_TEXT.prompt, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: TEXT.prompt })
      .setOrigin(0.5);

    this.selectMap(this.selectedMap);
    this.select(this.selected);
    // Phaser re-runs its whole key queue on every DOM key event and clears it
    // only once per frame, so two presses inside one frame (a fast typist, or
    // Playwright) re-emit the first keydown. Handle each DOM event once.
    const seen = new WeakSet<KeyboardEvent>();
    const once = (f: () => void) => (e: KeyboardEvent) => {
      if (seen.has(e)) return;
      seen.add(e);
      f();
    };
    const kb = this.input.keyboard;
    kb?.on('keydown-LEFT', once(() => this.move(-1)));
    kb?.on('keydown-RIGHT', once(() => this.move(1)));
    kb?.on('keydown-UP', once(() => this.moveMap(-1)));
    kb?.on('keydown-DOWN', once(() => this.moveMap(1)));
    kb?.on('keydown-ENTER', once(() => this.play()));
    kb?.on('keydown-SPACE', once(() => this.play()));
  }

  /** Select a level (highlighting its button); does not start the game. */
  select(level: Difficulty): void {
    this.selected = level;
    for (const [l, b] of this.levelButtons) b.setPicked(l === level);
    this.showBest();
  }

  /** Select a map (milestone 27; highlighting its thumbnail); does not start the game. */
  selectMap(map: MapId): void {
    this.selectedMap = map;
    for (const [m, b] of this.mapButtons) b.setPicked(m === map);
    this.showBest();
  }

  /** The high-score line for the selected map and level, or no line when they have no score. */
  private showBest(): void {
    const best = highScores.best(this.selected, this.selectedMap);
    this.bestLine?.setText(best === undefined ? '' : bestScoreText(this.selectedMap, this.selected, best));
  }

  /** Move the map selection one map left (-1) or right (+1), stopping at the ends. */
  private moveMap(delta: number): void {
    const i = MAP_IDS.indexOf(this.selectedMap) + delta;
    if (i >= 0 && i < MAP_IDS.length) this.selectMap(MAP_IDS[i]);
  }

  /** Move the selection one level left (-1) or right (+1), stopping at the ends. */
  private move(delta: number): void {
    const i = DIFFICULTIES.indexOf(this.selected) + delta;
    if (i >= 0 && i < DIFFICULTIES.length) this.select(DIFFICULTIES[i]);
  }

  /** Start GameScene on `level` and `map` (the selected ones when left out). Ignored once starting. */
  play(level: Difficulty = this.selected, map: MapId = this.selectedMap): void {
    if (this.starting) return;
    this.starting = true;
    this.selectMap(map);
    this.select(level);
    const data: GameStartData = { difficulty: level, map };
    this.scene.start('game', data);
  }

  uiState(): TitleUiState {
    const line = this.bestLine;
    const bestLine =
      line === null || line.text === ''
        ? null
        : { text: line.text, rect: { x: line.x - line.width / 2, y: line.y - line.height / 2, width: line.width, height: line.height } };
    return { scene: 'title', difficulty: this.selected, map: this.selectedMap, ready: this.ready, bestLine };
  }

  /** Whether the menu has been drawn and its buttons take clicks. */
  get isReady(): boolean {
    return this.ready;
  }

  /**
   * `title:easy`, `title:normal`, `title:hard`, `title:play` and (milestone
   * 27) `title:map:meadow`, `title:map:switchback`, `title:map:riverbend`,
   * once the menu is ready (none before).
   */
  rects(): Record<string, Rect> {
    const out: Record<string, Rect> = {};
    if (!this.ready) return out;
    for (const [l, b] of this.levelButtons) out[`title:${l}`] = b.rect;
    for (const [m, b] of this.mapButtons) out[`title:map:${m}`] = b.rect;
    if (this.playButton) out['title:play'] = this.playButton.rect;
    return out;
  }
}
