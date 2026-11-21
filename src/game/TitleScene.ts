// Title menu (milestone 25): the title and subtitle, a "Difficulty" row of
// three buttons (Normal preselected, the pick highlighted like the build
// bar's active tower), then [Play], which starts GameScene on the selected
// level. Clicking or tapping a level only selects it; only Play starts.
// Keyboard: Left/Right move the selection, Enter or Space presses Play.
//
// The selection lives on the scene object, which Phaser keeps for the whole
// page session, so returning from an end screen's [Menu] shows the level
// played last. A page reload goes back to Normal.
//
// Layout (canvas 960 x 580, everything centred on x 480): title y 110,
// subtitle y 172, "Difficulty" caption y 224, level buttons y 244..286,
// then y 302..430 left empty for later milestones (a "Map" row with
// thumbnails, milestone 27, and a high-score line, milestone 26), [Play]
// y 446..488, prompt y 522.

import Phaser from 'phaser';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty } from '../sim';
import { loadEnemySheets } from './anim/enemySprites';
import type { Rect } from './input';
import { DIFFICULTY_LABELS, TITLE_TEXT } from './names';
import { COLORS, FONT, TEXT } from './palette';
import { Button } from './ui/button';

/** Menu buttons: 42 px tall like every touch target (44.8 px on an iPad in landscape). */
export const MENU_BUTTON_H = 42;
export const LEVEL_BUTTON_W = 132;
const LEVEL_GAP = 16;
export const LEVEL_ROW_Y = 244;
export const PLAY_BUTTON_W = 200;
export const PLAY_BUTTON_Y = 446;

/** What the test hook ui() reports while the title menu shows. */
export interface TitleUiState {
  scene: 'title';
  difficulty: Difficulty;
}

/** Data GameScene is started with. */
export interface GameStartData {
  difficulty: Difficulty;
}

export class TitleScene extends Phaser.Scene {
  /** The selected level; kept across visits to the menu for the page session. */
  private selected: Difficulty = DEFAULT_DIFFICULTY;
  private levelButtons = new Map<Difficulty, Button>();
  private playButton: Button | null = null;
  private starting = false;

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

    // Reserved (y 302..430): a "Map" row (milestone 27) and a high-score
    // line (milestone 26) go here. Nothing is drawn yet.

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
    kb?.on('keydown-ENTER', once(() => this.play()));
    kb?.on('keydown-SPACE', once(() => this.play()));
  }

  /** Select a level (highlighting its button); does not start the game. */
  select(level: Difficulty): void {
    this.selected = level;
    for (const [l, b] of this.levelButtons) b.setPicked(l === level);
  }

  /** Move the selection one level left (-1) or right (+1), stopping at the ends. */
  private move(delta: number): void {
    const i = DIFFICULTIES.indexOf(this.selected) + delta;
    if (i >= 0 && i < DIFFICULTIES.length) this.select(DIFFICULTIES[i]);
  }

  /** Start GameScene on `level` (the selected level when left out). Ignored once starting. */
  play(level: Difficulty = this.selected): void {
    if (this.starting) return;
    this.starting = true;
    this.select(level);
    const data: GameStartData = { difficulty: level };
    this.scene.start('game', data);
  }

  uiState(): TitleUiState {
    return { scene: 'title', difficulty: this.selected };
  }

  /** `title:easy`, `title:normal`, `title:hard` and `title:play`. */
  rects(): Record<string, Rect> {
    const out: Record<string, Rect> = {};
    for (const [l, b] of this.levelButtons) out[`title:${l}`] = b.rect;
    if (this.playButton) out['title:play'] = this.playButton.rect;
    return out;
  }
}
