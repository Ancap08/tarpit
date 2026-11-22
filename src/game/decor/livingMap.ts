// Milestone 34 (a living map): the map's ground, what grows on it and the
// few things that move, in one object GameScene creates first, so all of it
// draws under the zones, the placement highlight, towers, enemies, shots,
// hp bars and the HUD.
//
// - The ground (grass texture, water, trail, cave, cottage: draw/map.ts) is
//   drawn once into one RenderTexture placed with the layout (in portrait
//   the cottage stays upright on its own small Graphics). The scene's
//   shutdown destroys it and its texture (a layout switch or Play again
//   restarts the scene).
// - Trees and bushes are Images (textures made once per game under fixed
//   keys) on their cells; a tower on a growth's cell hides it (with a small
//   puff in play), and all of them fade while a tower is being placed, so
//   the placement highlight reads over them.
// - Moving things (decor/motion.ts, counts in MOTION_COUNTS): river flow
//   lines and glints, chimney smoke, swaying tufts and tree tops, cloud
//   shadows, a bird, a butterfly and the cave's eyes. In test mode and
//   under prefers-reduced-motion they hold the fixed frame at t = 0
//   (STILL_T): no bird or butterfly, eyes open, clouds, smoke and water
//   where t = 0 puts them.

import type Phaser from 'phaser';
import type { GameState, MapDef, Point } from '../../sim';
import { drawMap, drawTuft } from '../draw/map';
import type { Layout } from '../layout';
import { COLORS } from '../palette';
import { birdAt, blinking, butterflyAt, CLOUD, cloudAt, flowLine, glint, MOTION_COUNTS, puffLook, smokePuff, STILL_T, sway } from './motion';
import { BUSH_R, decorFor, hiddenGrowth, TREE_R, type Decor, type Growth } from './recipe';

const TREE_KEYS = ['decor-tree-0', 'decor-tree-1', 'decor-tree-2'];
const BUSH_KEYS = ['decor-bush-0', 'decor-bush-1', 'decor-bush-2'];
const CLOUD_KEY = 'decor-cloud';
const PUFF_KEY = 'decor-puff';
/** Growth opacity while a tower is being placed (a pick or a drag). */
export const PLACING_ALPHA = 0.3;

/** Test hook (window.__tarpit.decor()). */
export interface DecorState {
  mapId: string;
  growth: { id: number; kind: Growth['kind']; col: number; row: number; x: number; y: number }[];
  hidden: number[];
  /** Growth images' opacity now (PLACING_ALPHA while placing). */
  growthAlpha: number;
  /** True when the moving things hold the fixed frame (test mode or reduced motion). */
  still: boolean;
  /** The clock the moving things were last drawn at (ms; STILL_T when still). */
  t: number;
  /** Where the moving things are: cloud centres (screen px), smoke alphas, the first flow line, bird and butterfly (or null), eyes open. */
  moving: { clouds: Point[]; smoke: number[]; flow: Point | null; bird: Point | null; butterfly: Point | null; eyesOpen: boolean; sway: number };
  /** Puffs showing now. */
  puffs: number;
}

interface GrowthView {
  g: Growth;
  top: Phaser.GameObjects.Image;
  home: Point;
}

/** A soft round shadow under a tree or bush (in its texture, so one image per growth). */
function softShadow(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  for (let i = 0; i < 3; i++) {
    g.fillStyle(COLORS.treeShadow, 0.09);
    g.fillCircle(x, y, r - i * 2.5);
  }
}

/** Make the decoration textures once per game (fixed keys, so a restart reuses them). */
function makeTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(CLOUD_KEY)) return;
  const g = scene.make.graphics({}, false);
  TREE_KEYS.forEach((key, v) => {
    const r = TREE_R[v];
    const s = Math.ceil(2 * r + 10);
    const c = s / 2 - 3;
    g.clear();
    softShadow(g, c + 3, c + 3, r + 2);
    // A lumpy canopy seen from above: a dark rim of lobes, a mid body, lighter tops up and to the left.
    const lobes = 6;
    g.fillStyle(COLORS.treeDark, 1);
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + v;
      g.fillCircle(c + Math.cos(a) * r * 0.45, c + Math.sin(a) * r * 0.45, r * 0.55);
    }
    g.fillStyle(COLORS.treeMid, 1);
    g.fillCircle(c - 1, c - 1, r * 0.72);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (1.0 + i * 0.35) + v * 0.3;
      g.fillCircle(c + Math.cos(a) * r * 0.42 - 0.5, c + Math.sin(a) * r * 0.42 - 0.5, r * 0.36);
    }
    g.fillStyle(COLORS.treeLight, 1);
    g.fillCircle(c - r * 0.3, c - r * 0.32, r * 0.28);
    g.fillCircle(c + r * 0.1, c - r * 0.45, r * 0.18);
    g.generateTexture(key, s, s);
  });
  BUSH_KEYS.forEach((key, v) => {
    const r = BUSH_R[v];
    const s = Math.ceil(2 * r + 10);
    const c = s / 2 - 2;
    g.clear();
    softShadow(g, c + 2, c + 2, r + 2);
    g.fillStyle(COLORS.bushDark, 1);
    g.fillCircle(c - r * 0.45, c + r * 0.15, r * 0.65);
    g.fillCircle(c + r * 0.45, c + r * 0.2, r * 0.6);
    g.fillCircle(c, c - r * 0.3, r * 0.65);
    g.fillStyle(COLORS.bushLight, 1);
    g.fillCircle(c - r * 0.2, c - r * 0.45, r * 0.32);
    g.fillCircle(c - r * 0.6, c, r * 0.22);
    if (v !== 1) {
      g.fillStyle(COLORS.berry, 1);
      g.fillCircle(c + r * 0.3, c + r * 0.1, 1);
      g.fillCircle(c - r * 0.1, c + r * 0.35, 1);
    }
    g.generateTexture(key, s, s);
  });
  // A cloud shadow: nested ellipses at a very low alpha, darkest in the middle (about 5% at most).
  g.clear();
  const rings = 9;
  for (let i = 0; i < rings; i++) {
    const k = 1 - i / rings;
    g.fillStyle(COLORS.cloudShadow, 0.006);
    g.fillEllipse(CLOUD.w / 2, CLOUD.h / 2, CLOUD.w * k, CLOUD.h * k);
  }
  g.generateTexture(CLOUD_KEY, CLOUD.w, CLOUD.h);
  g.clear();
  g.fillStyle(COLORS.chimneySmoke, 1);
  g.fillCircle(6, 6, 6);
  g.generateTexture(PUFF_KEY, 12, 12);
  g.destroy();
}

export class LivingMap {
  readonly decor: Decor;
  private readonly ground: Phaser.GameObjects.RenderTexture;
  private readonly water: Phaser.GameObjects.Graphics | null;
  /** Swaying tufts and the cave's eyes (world-space). */
  private readonly low: Phaser.GameObjects.Graphics;
  private readonly growth: GrowthView[] = [];
  private readonly smoke: Phaser.GameObjects.Image[] = [];
  private readonly clouds: Phaser.GameObjects.Image[] = [];
  /** Puffs, the butterfly and the bird (world-space). */
  private readonly air: Phaser.GameObjects.Graphics;
  private readonly motionQuery: MediaQueryList | null;
  private hidden = new Set<number>();
  private readonly puffs: ({ x: number; y: number; at: number } | null)[] = new Array(MOTION_COUNTS.puffs).fill(null);
  private alpha = 1;
  private drawnT = Number.NaN;
  private chimney: Point;
  private last: DecorState['moving'] = { clouds: [], smoke: [], flow: null, bird: null, butterfly: null, eyesOpen: true, sway: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapDef,
    private readonly layout: Layout,
    /** Test mode: everything holds the fixed frame and no puffs. */
    private readonly testMode: boolean,
  ) {
    this.decor = decorFor(map);
    makeTextures(scene);
    // The ground, baked once.
    const g = scene.make.graphics({}, false);
    const upright = layout.turned ? scene.make.graphics({}, false) : undefined;
    drawMap(g, map, layout, upright, this.decor);
    this.ground = layout.placeWorld(scene.add.renderTexture(0, 0, map.width, map.height).setOrigin(0, 0));
    this.ground.draw(g, 0, 0);
    g.destroy();
    if (upright) scene.add.existing(upright);
    this.water = (map.water ?? []).length > 0 ? layout.placeWorld(scene.add.graphics()) : null;
    this.low = layout.placeWorld(scene.add.graphics());
    for (const gr of this.decor.growth) {
      const home = layout.toScreen(gr);
      const tree = gr.kind === 'tree';
      // The texture's canopy centre is 3 px (bush 2 px) up and left of its middle: room for the shadow.
      const off = tree ? 3 : 2;
      const top = scene.add.image(home.x + off, home.y + off, (tree ? TREE_KEYS : BUSH_KEYS)[gr.variant]);
      this.growth.push({ g: gr, top, home: { x: home.x + off, y: home.y + off } });
    }
    // The chimney's top on the screen (draw/map.ts exitCottage, drawn upright in both layouts).
    const box = map.landmarks?.[0];
    const c = box ? layout.toScreen({ x: box.x + box.width / 2, y: box.y + box.height / 2 }) : { x: -100, y: -100 };
    this.chimney = { x: c.x + 7.5, y: c.y + (box?.height ?? 0) / 2 - 38 };
    for (let i = 0; i < (box ? MOTION_COUNTS.smokePuffs : 0); i++) this.smoke.push(scene.add.image(0, 0, PUFF_KEY));
    for (let i = 0; i < MOTION_COUNTS.clouds; i++) this.clouds.push(scene.add.image(0, 0, CLOUD_KEY).setRotation(layout.turned ? Math.PI / 2 : 0));
    this.air = layout.placeWorld(scene.add.graphics());
    this.motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  }

  /** True when the moving things hold the fixed frame. */
  get still(): boolean {
    return this.testMode || (this.motionQuery?.matches ?? false);
  }

  /** Bring the map up to date: hidden growth, the placing fade and (in play) the moving things. */
  update(state: GameState, placing: boolean): void {
    const now = this.scene.time.now;
    const hidden = new Set(hiddenGrowth(this.decor.growth, state.towers.map((t) => t.cell)));
    let changed = false;
    for (const id of hidden) {
      if (this.hidden.has(id)) continue;
      changed = true;
      if (!this.testMode) this.addPuff(this.decor.growth[id], now);
    }
    for (const id of this.hidden) if (!hidden.has(id)) changed = true;
    this.hidden = hidden;
    const alpha = placing ? PLACING_ALPHA : 1;
    if (alpha !== this.alpha) changed = true;
    this.alpha = alpha;

    const t = this.still ? STILL_T : now;
    if (!changed && t === this.drawnT && !this.puffs.some((p) => p !== null)) return;
    this.drawnT = t;
    this.draw(t, now);
  }

  private addPuff(g: Growth, now: number): void {
    const free = this.puffs.findIndex((p) => p === null);
    // Pool full: the oldest goes.
    let slot = free;
    if (slot < 0) {
      slot = 0;
      for (let i = 1; i < this.puffs.length; i++) if (this.puffs[i]!.at < this.puffs[slot]!.at) slot = i;
    }
    this.puffs[slot] = { x: g.x, y: g.y, at: now };
  }

  private draw(t: number, now: number): void {
    const layout = this.layout;
    const map = this.map;
    // Sway: a screen-x offset, as a world vector for the world-space tufts.
    const unit = layout.offset({ x: 0, y: 0 }, 1, 0);
    for (const v of this.growth) {
      const show = !this.hidden.has(v.g.id);
      const dx = v.g.kind === 'tree' ? sway(t, v.g.phase) : 0;
      v.top.setVisible(show).setAlpha(this.alpha).setPosition(v.home.x + dx, v.home.y);
    }

    const w = this.water;
    let flow: Point | null = null;
    if (w) {
      w.clear();
      for (const box of map.water ?? []) {
        w.lineStyle(1.5, COLORS.waterFlow, 1);
        for (let i = 0; i < MOTION_COUNTS.flowLines; i++) {
          const f = flowLine(box, i, t);
          if (i === 0) flow = { x: f.x, y: f.y };
          if (f.alpha <= 0) continue;
          w.lineStyle(1.5, COLORS.waterFlow, f.alpha);
          w.lineBetween(f.x, f.y, f.x, f.y + f.len);
        }
        for (let i = 0; i < MOTION_COUNTS.glints; i++) {
          const gl = glint(map, box, i, t);
          if (!gl) continue;
          w.fillStyle(COLORS.glint, gl.alpha);
          w.fillCircle(gl.x, gl.y, 1.6);
        }
      }
    }

    const low = this.low;
    low.clear();
    for (const tf of this.decor.swayTufts) {
      const s = sway(t, tf.phase);
      drawTuft(low, tf.x, tf.y, tf.angles, tf.len, tf.tone, unit.x * s, unit.y * s);
    }
    // The cave's eyes: two small pale dots side by side on the screen, in the cave mouth.
    const cave = map.path[0];
    const eye = { x: cave.x + 10, y: cave.y };
    const eyesOpen = !blinking(t);
    if (eyesOpen) {
      const e = layout.ellipse(2.8, 2);
      low.fillStyle(COLORS.caveEyes, 0.85);
      for (const side of [-3.2, 3.2]) {
        const p = layout.offset(eye, side, 0);
        low.fillEllipse(p.x, p.y, e.w, e.h);
      }
    }

    const smoke: number[] = [];
    this.smoke.forEach((img, i) => {
      const p = smokePuff(i, t);
      smoke.push(p.alpha);
      img.setPosition(this.chimney.x + p.dx, this.chimney.y + p.dy).setScale(p.scale).setAlpha(p.alpha);
    });
    const clouds: Point[] = [];
    this.clouds.forEach((img, i) => {
      const s = layout.toScreen(cloudAt(map, i, t));
      clouds.push(s);
      img.setPosition(s.x, s.y);
    });

    const air = this.air;
    air.clear();
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (!p) continue;
      const look = puffLook(now - p.at);
      if (!look) {
        this.puffs[i] = null;
        continue;
      }
      air.fillStyle(COLORS.chimneySmoke, look.alpha);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        air.fillCircle(p.x + Math.cos(a) * look.r, p.y + Math.sin(a) * look.r, 3);
      }
    }
    const fly = butterflyAt(map, this.decor.flowerBeds, t);
    if (fly) {
      const wing = layout.ellipse(2.4 * (0.3 + fly.flap), 3);
      air.fillStyle(COLORS.butterfly, 0.9 * fly.alpha);
      for (const side of [-1.6, 1.6]) {
        const p = layout.offset(fly, side, 0);
        air.fillEllipse(p.x, p.y, wing.w, wing.h);
      }
    }
    const bird = birdAt(map, t);
    if (bird) {
      // A small "v" on the screen, its wings flapping.
      const tip = 2.5 * bird.flap;
      const l = layout.offset(bird, -4, -tip);
      const r = layout.offset(bird, 4, -tip);
      air.lineStyle(1.5, COLORS.bird, 0.75);
      air.lineBetween(l.x, l.y, bird.x, bird.y);
      air.lineBetween(bird.x, bird.y, r.x, r.y);
    }
    this.last = {
      clouds,
      smoke,
      flow,
      bird: bird ? { x: bird.x, y: bird.y } : null,
      butterfly: fly ? { x: fly.x, y: fly.y } : null,
      eyesOpen,
      sway: this.decor.growth.length > 0 ? sway(t, this.decor.growth[0].phase) : 0,
    };
  }

  /** Test hook (window.__tarpit.decor()). */
  snapshot(): DecorState {
    return {
      mapId: this.decor.mapId,
      growth: this.decor.growth.map((g) => ({ id: g.id, kind: g.kind, col: g.cell.col, row: g.cell.row, x: g.x, y: g.y })),
      hidden: [...this.hidden].sort((a, b) => a - b),
      growthAlpha: this.alpha,
      still: this.still,
      t: this.drawnT,
      moving: this.last,
      puffs: this.puffs.filter((p) => p !== null).length,
    };
  }
}

