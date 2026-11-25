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
// on y 422 (midway between the thumbnails and Play), [Play] y 446..488, prompt y 522.
//
// Portrait (milestone 32b; canvas 480 x 1194, centred on x 240): title y
// 200, subtitle y 270, "Difficulty" y 390, level buttons 144 x 70 (12 px
// apart) at y 410, "Map" y 530, map buttons 144 x 116 at y 550 (a 120 x 60
// thumbnail, 18 px name), the best line y 720, [Play] 260 x 80 at y 770,
// the prompt wrapped to two lines (330 px) round y 930. Every button is at least as
// large as the game's 70 px controls, and all text is 18 px or more. When
// the window changes shape, relayout() rebuilds the menu with its picks.
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
// Mute (milestone 33): a mute button in the top right corner
// (titleMuteRect), and M toggles the sound here as in the game.
//
// High-score line (milestone 26): "Best on Riverbend, Normal: 12 waves" for
// the selected map and level (highScore.ts, names.ts bestScoreText),
// redrawn when either selection changes; no line when that pair has no
// score.

import Phaser from 'phaser';
import { DEFAULT_DIFFICULTY, DEFAULT_MAP, DIFFICULTIES, LEVELS, MAP_IDS, MAPS, type Difficulty, type MapId, type LevelDef } from '../sim';
import { loadEnemySheets } from './anim/enemySprites';
import { drawMapThumbnail } from './draw/map';
import { loadKeepThumbnails } from './draw/keepThumbnail';
import { loadSiegeActors, loadSiegeEnding } from './draw/siegeActors';
import { sound } from './audio/engine';
import type { Rect } from './input';
import { highScores } from './highScore';
import { tipsFor, seenBroadsides, broadsideStore, type Broadside } from './seenTips';
import { campaignProgress } from './campaignProgress';
import { ACT_ONE_LAST_LEVEL, ACT_TWO_LAST_LEVEL, campaignLevels, campaignOpen, campaignStops, levelAct, openingAct, type CampaignAct, type CampaignStop } from './ui/campaignMap';
import { drawCampaignMap, drawLevelCard, drawLevelTips, drawStoryBroadside } from './ui/campaignScreens';
import { CAMPAIGN_TEXT, lockedLevelText, bestScoreText, DIFFICULTY_LABELS, MAP_NAMES, paintedLoadingText, STORY_TEXT, TITLE_TEXT } from './names';
import { COLORS, FONT, TEXT } from './palette';
import { currentLayout } from './layoutSwitch';
import { broadside, ink, ribbon, rule, town } from './ui/theme';
import { Button } from './ui/button';
import { menuKeys } from './ui/menuKeys';
import { PORTRAIT_TITLE, titleRects, type TitleGeometry } from './ui/geometry';
import { MuteButton } from './ui/muteButton';
import { LOOKS, LookStore, paintedDensity, type Look } from './skin/look';
import { loadPainted, releasePaintedTextures, type PaintedAssets } from './skin/loading';
import { duringKeepLoad } from './keep/status';
import { actThreeEnabled, keepSelection } from './keep/switch';
import { isTestMode } from './testMode';

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
/**
 * The high-score line's centre (milestone 26): y 422, midway between the
 * map row's bottom (398) and Play's top (446) (milestone 27 follow-up).
 */
export const BEST_LINE_Y = (MAP_ROW_Y + MAP_BUTTON_H + PLAY_BUTTON_Y) / 2;
export const BEST_LINE_SIZE = 18;

/**
 * Milestone 33: the title's mute button, 14 px in from the top right
 * corner: 42 x 42 in landscape (as the other menu buttons), 70 x 70 in
 * portrait (as the game's controls). The title text below it is centred
 * and ends well left of it.
 */
export function titleMuteRect(portrait: boolean, canvasWidth: number): Rect {
  const size = portrait ? 70 : MENU_BUTTON_H;
  return { x: canvasWidth - 14 - size, y: 14, width: size, height: size };
}

/** What the test hook ui() reports while the title menu shows. */
const LANDSCAPE_TITLE: TitleGeometry = {
  titleY: 110,
  subtitleY: 172,
  levelCaptionY: LEVEL_ROW_Y - 20,
  levelY: LEVEL_ROW_Y,
  levelW: LEVEL_BUTTON_W,
  levelH: MENU_BUTTON_H,
  gap: LEVEL_GAP,
  mapCaptionY: MAP_ROW_Y - 19,
  mapY: MAP_ROW_Y,
  mapH: MAP_BUTTON_H,
  thumbW: THUMB_W,
  thumbH: THUMB_H,
  thumbTop: THUMB_TOP,
  thumbNameY: THUMB_NAME_Y,
  mapNameSize: '15px',
  levelFont: '18px',
  bestY: BEST_LINE_Y,
  playW: PLAY_BUTTON_W,
  playH: MENU_BUTTON_H,
  playY: PLAY_BUTTON_Y,
  playFont: '22px',
  promptY: 522,
  promptWrap: 0,
};

export type TitleScreen = 'first' | 'freePlay' | 'levelMap' | 'levelCard' | 'levelTips' | Broadside;
interface TitleVisit { screen?: TitleScreen; levelId?: number; replayLevel?: boolean; act?: CampaignAct; focusId?: number }

export interface TitleUiState {
  screen: TitleScreen;
  stops: CampaignStop[];
  lockedMessage: string | null;
  levelId: number | null;
  scene: 'title';
  difficulty: Difficulty;
  /** The selected map (milestone 27). */
  map: MapId;
  look: Look;
  /** Progress from 0 to 1 while fetching painted art. */
  loading: number | null;
  /** The menu has been drawn once, so its buttons take clicks (milestone 26 follow-up). */
  ready: boolean;
  /** The high-score line (milestone 26) and its box in canvas px, or null when the map and level have no score. */
  bestLine: { text: string; rect: Rect } | null;
}

/** Data GameScene is started with. */
export interface GameStartData {
  campaignKeep?: boolean;
  level?: LevelDef;
  difficulty: Difficulty;
  /** The map (milestone 27); Meadow when left out. */
  map?: MapId;
  painted?: PaintedAssets;
  paintedFallback?: boolean;
  keep?: typeof import('./keep/oldKeep');
  keepAssets?: import('./keep/oldKeep').KeepAssets;
  showpiece?: typeof import('./showpiece/showpiece').Showpiece;
}

export class TitleScene extends Phaser.Scene {
  private page: TitleScreen = 'first';
  private card?: LevelDef;
  private replayTips = false;
  private replayLevel = false;
  private touchTips = false;
  private tipsAcceptAt = 0;
  tipsEnabled = true;
  private act: CampaignAct = 1;
  private focusId?: number;
  private scouting = false;
  private mapStops: CampaignStop[] = [];
  private lockedMessage: string | null = null;
  private lockLabel?: Phaser.GameObjects.Text;
  private campaignButtons = new Map<string, Button>();
  /** The selected level; kept across visits to the menu for the page session. */
  private selected: Difficulty = DEFAULT_DIFFICULTY;
  private levelButtons = new Map<Difficulty, Button>();
  /** The selected map (milestone 27); kept like the level. */
  private selectedMap: MapId = DEFAULT_MAP;
  private mapButtons = new Map<MapId, Button>();
  private readonly lookStore = new LookStore(() => window.localStorage, window.location.search);
  private lookButtons = new Map<Look, Button>();
  private prompt: Phaser.GameObjects.Text | null = null;
  private progress: number | null = null;
  private paintedLoad?: AbortController;
  private playButton: Button | null = null;
  /** Milestone 33: the mute button in the top right corner. */
  private muteButton: MuteButton | null = null;
  private bestLine: Phaser.GameObjects.Text | null = null;
  private starting = false;
  private readonly actThree = actThreeEnabled(window.location.search);
  private enterKeep = keepSelection(window.location.search);
  /** True from the first render after create(); see "Ready" above. */
  private ready = false;

  constructor() {
    super('title');
  }

  /** Enemy sprite sheets load once at boot, so GameScene (and its restarts) start with them. */
  preload(): void {
    loadEnemySheets(this);
    if (this.actThree) {
      const level = this.enterKeep?.level ?? this.card;
      loadSiegeActors(this, this.page === 'siegeEnding' || !!(level?.windows?.length || level?.wallSiteTax));
      if (this.page === 'levelCard' && this.card?.map === 'keep') loadKeepThumbnails(this);
      if (this.page === 'siegeEnding' && currentLayout().turned) loadSiegeEnding(this);
    }
  }

  /** Milestone 32b: rebuild the menu for the window's new layout, keeping the picks (layoutSwitch.ts). */
  relayout(): void {
    const focusId = this.mapStops.find(stop => this.campaignButtons.get(`title:stop:${stop.id}`)?.isPicked)?.id;
    this.restartVisit({ screen: this.page, levelId: this.card?.id, replayLevel: this.replayLevel, act: this.act, focusId });
  }

  refreshProgress(): void {
    if (this.page === 'levelMap') this.visit('levelMap', undefined, this.act);
    if (this.page === 'levelCard') this.relayout();
  }

  private restartPending = false;

  init(visit?: TitleVisit): void {
    if (!this.restartPending) this.lockedMessage = null;
    this.page = visit?.screen ?? 'first';
    this.replayLevel = (this.page === 'ending' || this.page === 'siegeEnding') && !!visit?.replayLevel;
    this.focusId = visit?.focusId;
    if (this.card?.id !== visit?.levelId) this.scouting = false;
    this.card = campaignLevels(this.actThree).find(level => level.id === visit?.levelId);
    if ((this.page === 'levelCard' || this.page === 'levelTips') && !this.card) this.page = 'levelMap';
    if (this.page === 'levelMap' || this.page === 'levelCard') {
      const progress = campaignProgress.table();
      this.act = this.card ? levelAct(this.card.id) : visit?.act ?? openingAct(progress, this.actThree);
      if (this.act > 1) {
        const first = this.act === 2 ? ACT_ONE_LAST_LEVEL + 1 : ACT_TWO_LAST_LEVEL + 1;
        const broadside = this.act === 2 ? 'secondAct' : 'thirdAct';
        if (!campaignOpen(progress, first, this.actThree)) {
          this.act = this.act === 2 ? 1 : openingAct(progress, this.actThree);
          this.page = 'levelMap';
          this.card = undefined;
        } else if (!broadsideStore(broadside).has(broadside)) this.page = broadside;
      }
    }
  }

  private restartVisit(visit: TitleVisit): void {
    // One queued restart serves a burst of requests; create() reads the newest layout.
    if ((this.starting && this.progress === null) || this.restartPending) return;
    this.restartPending = true;
    this.ready = false;
    this.scene.restart(visit);
  }

  private visit(screen: TitleScreen, levelId?: number, act?: CampaignAct, focusId?: number): void {
    if (this.starting || this.restartPending) return;
    this.lockedMessage = null;
    this.restartVisit({ screen, levelId, act, focusId });
  }

  private action = (key: string, rect: Rect, text: string, click: () => void, size = 22): Button => {
    const button = new Button(this, rect, text, click, { fontSize: `${size}px` });
    this.campaignButtons.set(key, button);
    return button;
  };

  private bindMenuKeys(keys: string[], first = 0, atEdge?: (direction: -1 | 1) => void): void {
    const buttons = keys.map(key => this.campaignButtons.get(`title:${key}`)!);
    this.input.keyboard?.on('keydown', menuKeys(buttons, first, this.campaignButtons.get('title:back'), atEdge));
  }

  create(): void {
    const { width } = this.scale;
    const cx = width / 2;
    const geo = currentLayout().kind === 'portrait' ? PORTRAIT_TITLE : LANDSCAPE_TITLE;
    this.cameras.main.setBackgroundColor(COLORS.titleBg);
    this.restartPending = false;
    this.starting = this.progress !== null;
    if (this.enterKeep) {
      const { level } = this.enterKeep;
      this.enterKeep = undefined;
      this.starting = true;
      void this.startKeep(level);
      return;
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.restartPending) return;
      this.paintedLoad?.abort();
      this.paintedLoad = undefined;
      this.progress = null;
    });
    this.ready = false;
    this.events.once(Phaser.Scenes.Events.RENDER, () => {
      this.ready = true;
    });

    this.campaignButtons.clear();
    this.levelButtons.clear();
    this.mapButtons.clear();
    this.lookButtons.clear();
    this.playButton = null;
    this.prompt = null;
    this.bestLine = null;
    this.muteButton = null;
    this.lockLabel = undefined;
    this.mapStops = [];
    const portrait = currentLayout().kind === 'portrait';

    if (this.page === 'opening' || this.page === 'secondAct' || this.page === 'thirdAct' || this.page === 'ending' || this.page === 'siegeEnding') {
      const which = this.page;
      this.events.once(Phaser.Scenes.Events.RENDER, () => {
        const store = broadsideStore(which);
        if (which === 'siegeEnding' && !store.has(which)) sound.playSiege('siege.ending', this.actThree);
        store.mark(which);
      });
      const proceed = () => {
        if (which === 'siegeEnding') sound.endSessionMute();
        if (which === 'ending' && this.replayLevel) {
          const level = LEVELS[LEVELS.length - 1];
          this.startGame({ difficulty: DEFAULT_DIFFICULTY, map: level.map, level });
        } else if (which === 'siegeEnding' && this.replayLevel) {
          this.playKeep(campaignLevels(true).at(-1)!);
        } else if ((which === 'secondAct' || which === 'thirdAct') && this.card) {
          this.visit('levelCard', this.card.id);
        } else this.visit('levelMap', undefined, which === 'secondAct' ? 2 : which === 'thirdAct' ? 3 : undefined, this.focusId);
      };
      this.playButton = drawStoryBroadside(this, portrait, which, this.action, proceed, this.actThree && which === 'siegeEnding', isTestMode());
      this.bindMenuKeys(['continue']);
      this.input.keyboard?.on('keydown-ESC', proceed);
      if (this.progress !== null) this.refreshLoading();
      return;
    }
    if (this.page === 'levelMap') {
      const progress = campaignProgress.table();
      this.mapStops = campaignStops(portrait, progress, this.act, this.actThree);
      const secondActOpen = campaignOpen(progress, ACT_ONE_LAST_LEVEL + 1, this.actThree);
      const showLock = (id: number) => {
        this.lockedMessage = lockedLevelText(id);
        this.lockLabel?.setText(this.lockedMessage);
      };
      const thirdActOpen = this.actThree && campaignOpen(progress, ACT_TWO_LAST_LEVEL + 1, true);
      const switchAct = (act: CampaignAct) => {
        if (act === 2 && !secondActOpen) showLock(ACT_ONE_LAST_LEVEL);
        else if (act === 3 && !thirdActOpen) showLock(ACT_TWO_LAST_LEVEL);
        else if (act !== this.act) this.visit('levelMap', undefined, act);
      };
      this.lockLabel = drawCampaignMap(this, portrait, this.mapStops, this.lockedMessage, this.act, secondActOpen, this.action, stop => {
        if (stop.open) this.visit('levelCard', stop.id);
        else {
          const next = this.mapStops.find(candidate => candidate.next);
          if (next) showLock(next.id);
        }
      }, switchAct, () => this.visit('first'), this.actThree ? thirdActOpen : undefined);
      const open = this.mapStops.filter(stop => stop.open);
      const focus = open.find(stop => stop.id === this.focusId) ?? open.find(stop => stop.next) ?? open[open.length - 1];
      this.bindMenuKeys(open.map(stop => `stop:${stop.id}`), open.indexOf(focus), direction => {
        if (this.act === 3 && direction < 0) this.visit('levelMap', undefined, 2, ACT_TWO_LAST_LEVEL);
        if (this.act === 2 && direction < 0) this.visit('levelMap', undefined, 1, ACT_ONE_LAST_LEVEL);
        if (this.act === 2 && this.actThree && direction > 0 && open.at(-1)?.id === ACT_TWO_LAST_LEVEL) {
          if (thirdActOpen) this.visit('levelMap', undefined, 3, ACT_TWO_LAST_LEVEL + 1);
          else showLock(ACT_TWO_LAST_LEVEL);
        }
        if (this.act === 1 && direction > 0 && open.at(-1)?.id === ACT_ONE_LAST_LEVEL) {
          if (secondActOpen) this.visit('levelMap', undefined, 2, ACT_ONE_LAST_LEVEL + 1);
          else showLock(ACT_ONE_LAST_LEVEL);
        }
      });
      return;
    }
    if ((this.page === 'levelCard' || this.page === 'levelTips') && this.card) {
      const level = this.card;
      const start = () => level.map === 'keep' ? this.playKeep(level)
        : this.startGame({ difficulty: DEFAULT_DIFFICULTY, map: level.map, level });
      const seenTips = tipsFor(level.id);
      const toCard = () => this.visit('levelCard', level.id);
      if (this.page === 'levelTips') {
        // Play activates on pointerup, so the opening press has already ended.
        // A press that begins during the guard must stay ignored on release.
        const delay = this.tipsAcceptAt - performance.now();
        if (delay > 0) {
          this.input.enabled = false;
          this.time.delayedCall(delay, () => { this.input.enabled = true; });
        }
        this.playButton = drawLevelTips(this, portrait, level, this.touchTips, this.action, () => {
          if (!this.input.enabled) return;
          if (this.replayTips) return toCard();
          seenTips.mark(level.id);
          start();
        }, this.replayTips ? undefined : toCard);
        this.bindMenuKeys(this.replayTips ? ['gotIt'] : ['back', 'gotIt'], this.replayTips ? 0 : 1);
        if (this.replayTips) this.input.keyboard?.on('keydown-ESC', toCard);
      } else {
        const seen = seenTips.has(level.id);
        const showTips = (replay: boolean) => {
          this.replayTips = replay;
          this.touchTips = this.input.activePointer.wasTouch;
          this.tipsAcceptAt = performance.now() + 400;
          this.visit('levelTips', level.id);
        };
        const review = seen ? () => showTips(true) : undefined;
        this.playButton = drawLevelCard(this, portrait, level, campaignProgress.table()[level.id] ?? 0, this.action,
          () => this.tipsEnabled && !seen ? showTips(false) : start(), () => this.visit('levelMap', undefined, this.act), review,
          this.scouting, () => {
            this.scouting = !this.scouting;
            this.relayout();
          });
        const actions = portrait ? ['play', 'back'] : ['back', 'play'];
        if (review) actions.splice(portrait ? 0 : 1, 0, 'tips');
        if (this.campaignButtons.has('title:cardPage')) actions.unshift('cardPage');
        this.bindMenuKeys(actions, actions.indexOf('play'));
      }
      this.refreshLoading();
      return;
    }
    const first = this.page === 'first';
    const titleY = first && !portrait ? 124 : geo.titleY;
    const paper = this.add.graphics();
    broadside(paper, width, this.scale.height);
    if (first) {
      rule(paper, cx, titleY - 49, portrait ? 354 : 480);
      rule(paper, cx, titleY + 48, portrait ? 354 : 480);
      ribbon(paper, cx, portrait ? 300 : 210, 308, 44);
      town(paper, cx, portrait ? 938 : 493);
    }
    this.add
      .text(cx, titleY, first ? TITLE_TEXT.title.toUpperCase() : TITLE_TEXT.title, { fontFamily: FONT, fontSize: '72px', fontStyle: 'bold', color: ink,
        metrics: { ascent: 59, descent: 16, fontSize: 75 } })
      .setOrigin(0.5);
    const subtitleStyle = { fontFamily: FONT, fontSize: '24px', color: ink };
    if (first) {
      this.add.text(cx, portrait ? 300 : 210, TITLE_TEXT.slogan, { ...subtitleStyle, fontSize: '28px', fontStyle: 'bold', color: TEXT.button }).setOrigin(0.5);
      this.add.text(cx, portrait ? 352 : 254, TITLE_TEXT.story, { ...subtitleStyle, fontSize: '20px' }).setOrigin(0.5);
    } else {
      this.add.text(cx, geo.subtitleY, TITLE_TEXT.subtitle, subtitleStyle).setOrigin(0.5);
    }

    // Milestone 33: the mute button, in the top right corner (TITLE_MUTE).
    this.muteButton = new MuteButton(this, titleMuteRect(portrait, width));
    const lookWidth = portrait ? 116 : LEVEL_BUTTON_W;
    const captionWidth = 54;
    const lookHeight = portrait ? geo.levelH : MENU_BUTTON_H;
    const lookX = cx - (captionWidth + lookWidth * 2 + geo.gap) / 2;
    this.add
      .text(lookX, 14 + lookHeight / 2, TITLE_TEXT.look, { fontFamily: FONT, fontSize: portrait ? '20px' : '18px', fontStyle: 'bold', color: ink })
      .setOrigin(0, 0.5);
    LOOKS.forEach((look, index) => {
      const rect = { x: lookX + captionWidth + index * (lookWidth + geo.gap), y: 14, width: lookWidth, height: lookHeight };
      const button = new Button(this, rect, TITLE_TEXT[look], () => this.selectLook(look), { fontSize: portrait ? '20px' : '18px' });
      this.lookButtons.set(look, button);
    });

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
    kb?.on('keydown-L', once(() => this.selectLook(this.lookStore.get() === 'classic' ? 'painted' : 'classic')));
    if (this.page === 'first') {
      const w = portrait ? 330 : 264;
      const h = portrait ? 106 : 84;
      this.action('title:campaign', { x: portrait ? cx - w / 2 : cx - w - 12, y: portrait ? 452 : 286,
        width: w, height: h }, CAMPAIGN_TEXT.campaign, () => this.visit(seenBroadsides.has('opening') ? 'levelMap' : 'opening'), 32);
      this.action('title:freePlay', { x: portrait ? cx - w / 2 : cx + 12, y: portrait ? 584 : 286,
        width: w, height: h }, CAMPAIGN_TEXT.freePlay, () => this.visit('freePlay'), 32);
      this.bindMenuKeys(['campaign', 'freePlay']);
      this.refreshLook();
      return;
    }

    this.action('title:back', portrait ? { x: 130, y: 1020, width: 220, height: 74 }
      : { x: 28, y: 496, width: 120, height: MENU_BUTTON_H }, CAMPAIGN_TEXT.back, () => this.visit('first'));
    this.add
      .text(cx, geo.levelCaptionY, TITLE_TEXT.difficulty, { fontFamily: FONT, fontSize: portrait ? '20px' : '18px', fontStyle: 'bold', color: ink })
      .setOrigin(0.5);
    const rects = titleRects(geo, cx);
    DIFFICULTIES.forEach((level, i) => {
      const rect = rects.levels[i];
      this.levelButtons.set(level, new Button(this, rect, DIFFICULTY_LABELS[level], () => this.select(level), { fontSize: geo.levelFont }));
    });

    // The map row (milestone 27): a caption, then a thumbnail button per map.
    this.add
      .text(cx, geo.mapCaptionY, TITLE_TEXT.map, { fontFamily: FONT, fontSize: portrait ? '20px' : '18px', fontStyle: 'bold', color: ink })
      .setOrigin(0.5);
    MAP_IDS.forEach((map, i) => {
      const rect = rects.maps[i];
      this.mapButtons.set(map, new Button(this, rect, '', () => this.selectMap(map)));
      // Drawn after the button, so over its box; neither the picture nor the name takes input.
      const g = this.add.graphics();
      drawMapThumbnail(g, MAPS[map], rect.x + (rect.width - geo.thumbW) / 2, rect.y + geo.thumbTop, geo.thumbW, geo.thumbH);
      g.lineStyle(1, COLORS.buttonEdge, 0.6);
      g.strokeRect(rect.x + (rect.width - geo.thumbW) / 2, rect.y + geo.thumbTop, geo.thumbW, geo.thumbH);
      this.add
        .text(rect.x + rect.width / 2, rect.y + geo.thumbNameY, MAP_NAMES[map], { fontFamily: FONT, fontSize: geo.mapNameSize, fontStyle: 'bold', color: TEXT.button })
        .setOrigin(0.5);
    });

    this.bestLine = this.add
      .text(cx, geo.bestY, '', { fontFamily: FONT, fontSize: portrait ? '20px' : `${BEST_LINE_SIZE}px`, fontStyle: 'bold', color: ink })
      .setOrigin(0.5);

    this.playButton = new Button(
      this,
      rects.play,
      TITLE_TEXT.play,
      () => this.play(),
      { fontSize: geo.playFont },
    );

    this.prompt = this.add
      .text(cx, geo.promptY, TITLE_TEXT.prompt, { fontFamily: FONT, fontSize: portrait ? '20px' : '18px', fontStyle: 'bold', color: ink })
      .setOrigin(0.5);
    if (geo.promptWrap > 0) this.prompt.setAlign('center').setWordWrapWidth(geo.promptWrap, true);

    this.refreshPicks();
    this.refreshLook();
    this.refreshLoading();
    kb?.on('keydown-ESC', once(() => this.visit('first')));
    kb?.on('keydown-LEFT', once(() => this.move(-1)));
    kb?.on('keydown-RIGHT', once(() => this.move(1)));
    kb?.on('keydown-UP', once(() => this.moveMap(-1)));
    kb?.on('keydown-DOWN', once(() => this.moveMap(1)));
    kb?.on('keydown-ENTER', once(() => this.play()));
    kb?.on('keydown-SPACE', once(() => this.play()));
  }

  /** Select a level (highlighting its button); does not start the game. */
  select(level: Difficulty): void {
    if (this.starting) return;
    this.selected = level;
    this.refreshPicks();
  }

  /** Select a map (milestone 27; highlighting its thumbnail); does not start the game. */
  selectMap(map: MapId): void {
    if (this.starting) return;
    this.selectedMap = map;
    this.refreshPicks();
    this.refreshLook();
  }

  private refreshPicks(): void {
    for (const [l, b] of this.levelButtons) b.setPicked(l === this.selected);
    for (const [m, b] of this.mapButtons) b.setPicked(m === this.selectedMap);
    this.showBest();
  }

  private selectLook(look: Look): void {
    if (this.starting) return;
    this.lookStore.set(look);
    this.refreshLook();
  }

  private refreshLook(): void {
    const look = this.lookStore.get();
    for (const [option, button] of this.lookButtons) button.setPicked(option === look);
  }

  private refreshLoading(): void {
    const progress = this.progress;
    const portrait = currentLayout().kind === 'portrait';
    const playFont = portrait ? PORTRAIT_TITLE.playFont : LANDSCAPE_TITLE.playFont;
    if (this.playButton) {
      this.playButton.labelObjects[0].setWordWrapWidth(progress === null ? 0 : this.playButton.rect.width - 12);
    }
    const compact = this.page === 'levelCard' && !!this.card?.feat;
    const loadingFont = portrait ? (compact ? '22px' : '20px') : '16px';
    this.playButton?.setFontSize(progress === null ? playFont : loadingFont);
    const idleText = this.page === 'ending' ? STORY_TEXT.continue : this.page === 'levelTips' ? CAMPAIGN_TEXT.gotIt : TITLE_TEXT.play;
    this.playButton?.set(progress === null ? idleText : paintedLoadingText(progress, compact), progress === null);
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
    this.selectedMap = map;
    this.selected = level;
    this.refreshPicks();
    this.refreshLook();
    this.startGame({ difficulty: level, map });
  }

  private playKeep(level: LevelDef): void {
    if (this.starting || this.restartPending) return;
    this.starting = true;
    void this.startKeep(level, true);
  }

  private async startKeep(level?: LevelDef, campaignKeep = false): Promise<void> {
    const density = paintedDensity(this.game.canvas.getBoundingClientRect().width / this.scale.gameSize.width, window.devicePixelRatio);
    const siege = this.actThree && level ? level : undefined;
    if (siege) releasePaintedTextures(this.textures);
    const data = await duringKeepLoad(async (signal, update) => {
      let plates = 0, sprites = 0, script = 0;
      const progress = () => update((script + plates * 11 + sprites * 3) / 15);
      const [loaded, painted] = await Promise.all([
        import('./keep/oldKeep').then(async keep => {
          signal.throwIfAborted();
          script = 1;
          progress();
          const keepAssets = await keep.loadKeep(this.game, currentLayout().turned, signal, fraction => {
            plates = fraction;
            progress();
          }, level, this.actThree);
          if (signal.aborted) {
            keepAssets.release();
            signal.throwIfAborted();
          }
          signal.addEventListener('abort', keepAssets.release, { once: true });
          return { keep, keepAssets };
        }),
        loadPainted(this.textures, DEFAULT_MAP, density, fraction => {
          sprites = fraction;
          progress();
        }, signal, { keep: true, siege }).then(painted => {
          if (!painted) throw new Error('Keep pieces unavailable');
          if (siege) signal.addEventListener('abort', () => releasePaintedTextures(this.textures), { once: true });
          sprites = 1;
          progress();
          return painted;
        }),
      ]);
      return { ...loaded, painted, difficulty: DEFAULT_DIFFICULTY, level, campaignKeep } satisfies GameStartData;
    }, () => this.scene.restart({ screen: 'first' }));
    if (data) this.scene.start('game', data);
  }

  private startGame(data: GameStartData): void {
    if (this.starting || this.restartPending) return;
    this.starting = true;
    if (this.lookStore.get() !== 'painted') {
      this.scene.start('game', data);
      return;
    }
    const request = new AbortController();
    this.paintedLoad = request;
    this.progress = 0;
    this.refreshLoading();
    const canvasScale = this.game.canvas.getBoundingClientRect().width / this.scale.gameSize.width;
    const density = paintedDensity(canvasScale, window.devicePixelRatio);
    void loadPainted(this.textures, data.map ?? DEFAULT_MAP, density, (progress) => {
      this.progress = progress;
      this.refreshLoading();
    }, request.signal).then(async (painted) => {
      let showpiece: GameStartData['showpiece'];
      if (painted && this.lookStore.showpieceRequested && (data.map ?? DEFAULT_MAP) === 'meadow' && (!data.level || data.level.id === 1)) {
        // Bound both the optional code fetch and art decode. A broken
        // experiment must still let the player into their Painted game.
        const timer = setTimeout(() => request.abort(), 8000);
        try {
          const signal = request.signal;
          showpiece = await Promise.race([
            import('./showpiece/showpiece').then(async module =>
              await module.loadPasture(this.textures, painted.density, signal) ? module.Showpiece : undefined),
            new Promise<undefined>(resolve => {
              if (signal.aborted) resolve(undefined);
              else signal.addEventListener('abort', () => resolve(undefined), { once: true });
            }),
          ]);
        } catch { /* The complete Painted scene is already ready. */ }
        finally { clearTimeout(timer); }
      }
      if (this.paintedLoad !== request) return;
      this.paintedLoad = undefined;
      this.progress = null;
      this.scene.start('game', { ...data, painted, showpiece, paintedFallback: !painted });
    });
  }

  uiState(): TitleUiState {
    const line = this.bestLine;
    const bestLine =
      line === null || line.text === ''
        ? null
        : { text: line.text, rect: { x: line.x - line.width / 2, y: line.y - line.height / 2, width: line.width, height: line.height } };
    return {
      screen: this.page, stops: this.mapStops, lockedMessage: this.lockedMessage, levelId: this.card?.id ?? null,
      scene: 'title', difficulty: this.selected, map: this.selectedMap, ready: this.isReady,
      look: this.lookStore.get(), loading: this.progress, bestLine,
    };
  }

  /** Whether the menu has been drawn and its buttons take clicks. */
  get isReady(): boolean {
    return this.ready && this.input.enabled;
  }

  /**
   * `title:easy`, `title:normal`, `title:hard`, `title:play` and (milestone
   * 27) `title:map:meadow`, `title:map:switchback`, `title:map:riverbend`,
   * once the menu is ready (none before).
   */
  rects(): Record<string, Rect> {
    const out: Record<string, Rect> = {};
    if (!this.isReady) return out;
    for (const [key, button] of this.campaignButtons) out[key] = button.rect;
    for (const [l, b] of this.levelButtons) out[`title:${l}`] = b.rect;
    for (const [m, b] of this.mapButtons) out[`title:map:${m}`] = b.rect;
    for (const [look, button] of this.lookButtons) out[`title:look:${look}`] = button.rect;
    if (this.playButton && (this.page === 'freePlay' || this.page === 'levelCard')) out['title:play'] = this.playButton.rect;
    if (this.muteButton) out['title:mute'] = this.muteButton.bounds;
    return out;
  }
}
