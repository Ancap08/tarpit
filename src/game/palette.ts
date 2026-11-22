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
} as const;
