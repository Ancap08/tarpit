// Every colour the renderer uses, in one place. Numbers are 0xRRGGBB for
// Graphics; CSS strings are for Text objects.

export const FONT = '"Courier New", monospace';

export const COLORS = {
  // Map
  grass: 0x5f7f4a,
  path: 0xc2a476,
  pathEdge: 0x9c7f55,
  spawn: 0x2b2420,
  spawnRim: 0x4a3e35,
  cottageWall: 0xe0cfa8,
  cottageRoof: 0x8a3b2a,
  cottageDoor: 0x5a3d28,
  cottageChimney: 0x6e4a3a,
  caveInner: 0x6a5a4c,
  // Water (milestone 27, Riverbend's river): flat blue and a darker bank
  // edge (milestone 34: the pale ripple strokes became moving flow lines).
  water: 0x4f8fc0,
  waterBank: 0x2e5f8a,
  // Milestone 34 (a living map): ground texture, kept close to the grass and
  // trail colours so nothing that matters loses contrast; trees and bushes a
  // darker, bluer green than the Longbow; the moving things.
  grassLight: 0x698a51,
  grassDark: 0x5a7a45,
  tuftDark: 0x4f6e3d,
  tuftLight: 0x759558,
  flowerCream: 0xe4dcbc,
  flowerYellow: 0xdcbf52,
  flowerLilac: 0xb49cc8,
  flowerCentre: 0xf0d870,
  flowerCentreDark: 0xa8823a,
  stone: 0x8e8c80,
  stoneShade: 0x66655c,
  pathSoft: 0x4f6a3c,
  pathLight: 0xcbb084,
  pathDark: 0xb6996b,
  pathRut: 0xa88c62,
  pebbleDark: 0x8f7d62,
  pebbleLight: 0xdccca8,
  bankSoft: 0x4c6a3e,
  treeShadow: 0x000000,
  treeDark: 0x2f5233,
  treeMid: 0x3b623b,
  treeLight: 0x55804b,
  saplingLight: 0x67904f,
  coniferDark: 0x2b4f3c,
  coniferLight: 0x3c6a4c,
  trunk: 0x5a4030,
  bushDark: 0x34573a,
  bushLight: 0x47704a,
  berry: 0xc9b98a,
  cloudShadow: 0x0a140a,
  chimneySmoke: 0xd8d4cc,
  waterFlow: 0xc4e0f2,
  glint: 0xffffff,
  caveEyes: 0xe8cf6a,
  bird: 0x23272b,
  butterfly: 0xf2e6a0,

  // Enemies
  goblin: 0x3fa34d,
  goblinEdge: 0x245f2c,
  wolf: 0x9a9a9a,
  wolfEdge: 0x5c5c5c,
  troll: 0x7a5232,
  trollEdge: 0x4a311c,
  // Harpy ground shadow (drawn at low alpha) and the Shieldbearer's shield mark.
  shadow: 0x000000,
  shieldMark: 0xa7adb4,
  shieldMarkEdge: 0x3a3e44,
  // Hp bar: dark border, then green above 50%, orange above 25%, red below.
  hpBorder: 0x15171a,
  hpFill: 0x5fd35f,
  hpMid: 0xf29a2e,
  hpLow: 0xe0473a,
  // Tar: the Tar Pit body, its splats and the slowed-enemy ring are one substance.
  tarRing: 0x2e2118,
  // Burn: an orange ring outside the tar ring when both apply.
  burnRing: 0xff7a1a,

  // Towers
  musketeer: 0x3a6fc4,
  musketeerEdge: 0x1f3f75,
  musketeerBarrel: 0x2a2a2a,
  cannon: 0x4a4d52,
  cannonEdge: 0x26282b,
  cannonBarrel: 0x1c1d1f,
  tarpit: 0x2e2118,
  tarpitHighlight: 0xd8d0c4,
  upgradeRing: 0xf2c94c,
  towerPathEdge: 0x252331,
  towerPathA: 0xf2c94c,
  towerPathB: 0x76e6e8,
  longbow: 0x4f9a3c,
  longbowEdge: 0x2b5a20,
  longbowBow: 0xc08a48,
  longbowString: 0xe8e0c8,
  mortar: 0x8a8d92,
  mortarEdge: 0x45484d,
  mortarMouth: 0x18191b,
  firepot: 0xd9482b,
  firepotEdge: 0x7a2214,
  firepotFlame: 0xffd23a,

  // Shots
  musketTracer: 0xfff2a8,
  cannonTracer: 0x2a2a2a,
  cannonSplash: 0xf28c28,
  tarSplat: 0x2e2118,
  arrowTracer: 0xf4ecd0,
  mortarFlash: 0x202124,
  // Darker than the Cannon's splash orange.
  mortarSplash: 0xc0581c,
  fireFlash: 0xff8c1a,
  fireBurst: 0xff7a1a,
  fireBurstCore: 0xffd23a,
  // Milestone 31 (effects): projectiles, muzzle flash, smoke, shadows, the
  // exit glow, the boss darkening and burst, and the sparkle of an upgrade.
  musketBall: 0x2a2a2a,
  muzzleFlash: 0xfff2a8,
  smoke: 0xd8d4cc,
  arrowShaft: 0xc08a48,
  arrowHead: 0xe8e0c8,
  cannonBall: 0x1c1d1f,
  mortarShell: 0x26282b,
  shellShadow: 0x000000,
  exitGlow: 0xe0473a,
  darken: 0x05060a,
  bossBurst: 0xffd23a,
  bossBurstRing: 0xff7a1a,
  sparkle: 0xfff2a8,
  // A dark edge under splash and boss rings, so they read on the trail and on grass.
  fxDark: 0x14161a,

  // HUD
  hudBar: 0x1b1f24,
  hudLine: 0x3a414a,
  button: 0x6b4a2b,
  buttonHover: 0x86603a,
  buttonPressed: 0x4f361f,
  buttonDisabled: 0x3a3d42,
  buttonEdge: 0xd9b77e,
  buttonEdgeDisabled: 0x5a5e66,
  // The build bar's active pick: brighter fill, pale-yellow edge.
  buttonPicked: 0xa0743f,
  buttonEdgePicked: 0xfff2a8,

  // Build UI: placement cell highlight, selection ring, range circles, panel backing
  cellOk: 0x5fd35f,
  cellBad: 0xe0473a,
  paintedCellEdge: 0x10130f,
  paintedCellLight: 0xfff6db,
  paintedCellBlocked: 0xff9a7d,
  selectRing: 0xfff2a8,
  // Range circles (selected tower and hover preview): pale yellow, reads on grass and path.
  range: 0xfff2a8,
  // The Mortar's dashed minimum-range circle: muted red, distinct from the range edge.
  minRange: 0xc4605a,
  // Planning phase (milestone 25a): the dashed outline round an unlocked tower's cell.
  unlockedOutline: 0xfff8d8,
  // Drag (milestone 25a): the thin line from a finger to the lifted ghost.
  dragLine: 0xfff8d8,
  // Special attacks (milestone 25b): aim circle and effect colour per special,
  // and the HUD button's charge pip (lit, or an empty grey ring).
  specialKeg: 0xe0502a,
  specialTar: 0x3b2a1c,
  specialFire: 0xf2a62a,
  specialPip: 0xfff2a8,
  specialPipEmpty: 0x6a6e76,
  // Milestone 30: the Special button's recharge fill, the aim banner's
  // backing, the keg's scorch mark, and the zones (tar puddle, fire patch).
  rechargeFill: 0x7a5a1c,
  aimBanner: 0x14161a,
  aimCrossDark: 0x14161a,
  scorch: 0x1e1a16,
  tarPuddle: 0x2a1d13,
  tarPuddleEdge: 0x5a4330,
  // Milestone 30 follow-up: the puddle's wet sheen, so its edge reads on grass and trail.
  tarSheen: 0xe6d3ae,
  firePatch: 0xd0471c,
  fireFlame: 0xffb43a,
  menuBg: 0x1b1f24,
  menuEdge: 0xd9b77e,

  // Boss bar (milestone 23): dark trough, red fill, 1 px cream border, dark name pill.
  bossBarBg: 0x15171a,
  bossBarFill: 0xd0392e,
  bossBarEdge: 0xf2e6c9,
  bossNamePill: 0x14161a,

  // End screens: dark veil over the map, centred panel
  endVeil: 0x0b0d10,
  endPanel: 0x1b1f24,
  endPanelEdge: 0xd9b77e,

  // Title
  titleBg: '#111418',
} as const;

export const TEXT = {
  hud: '#f2e6c9',
  hudDim: '#a89f8a',
  button: '#fff4dc',
  // 4.83:1 against COLORS.buttonDisabled (0x3a3d42); enabled text is 9.98:1.
  buttonDisabled: '#a8adb5',
  title: '#f2e6c9',
  subtitle: '#a89f8a',
  prompt: '#e8c37a',
  victory: '#f2c94c',
  defeat: '#d26a5c',
  endLine: '#f2e6c9',
  // Boss bar: name and hp text.
  bossName: '#f2e6c9',
  bossHp: '#fff4dc',
  // Tower labels: light text on a small dark pill.
  towerLabel: '#f2e6c9',
  towerLabelBg: 'rgba(20, 22, 26, 0.78)',
  // Milestone 30: the aim banner, the "3 hit" or "Missed" label, the cheat mark.
  aimBanner: '#fff4dc',
  aimHint: '#e8c37a',
  specialHit: '#fff2a8',
  specialMiss: '#e0b0a8',
  cheatMark: '#e8a07a',
  // Milestone 31: floating gold, the wave and boss banners, the Lives flash.
  goldGain: '#f2c94c',
  waveBanner: '#f2e6c9',
  waveBannerSub: '#f2c94c',
  bossBanner: '#e0473a',
  livesFlash: '#e0473a',
  fxStroke: '#14161a',
} as const;
