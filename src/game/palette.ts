// Every colour the renderer uses, in one place. Numbers are 0xRRGGBB for
// Graphics; CSS strings are for Text objects.

export const FONT = '"Courier New", monospace';

export const COLORS = {
  // Map
  grass: 0x5f7f4a,
  path: 0xc2a476,
  pathEdge: 0x9c7f55,
  spotOutline: 0xe8efd8,
  spawn: 0x2b2420,
  spawnRim: 0x4a3e35,
  cottageWall: 0xe0cfa8,
  cottageRoof: 0x8a3b2a,
  cottageDoor: 0x5a3d28,

  // Enemies
  goblin: 0x3fa34d,
  goblinEdge: 0x245f2c,
  wolf: 0x9a9a9a,
  wolfEdge: 0x5c5c5c,
  troll: 0x7a5232,
  trollEdge: 0x4a311c,
  hpBack: 0x222222,
  hpFill: 0x5fd35f,
  tarRing: 0x0b0b0b,

  // Towers
  musketeer: 0x3a6fc4,
  musketeerEdge: 0x1f3f75,
  musketeerBarrel: 0x2a2a2a,
  cannon: 0x4a4d52,
  cannonEdge: 0x26282b,
  cannonBarrel: 0x1c1d1f,
  tarpit: 0x121212,
  tarpitHighlight: 0xd8d8d8,
  upgradeRing: 0xf2c94c,

  // Shots
  musketTracer: 0xfff2a8,
  cannonTracer: 0x2a2a2a,
  cannonSplash: 0xf28c28,
  tarSplat: 0x0b0b0b,

  // HUD
  hudBar: 0x1b1f24,
  hudLine: 0x3a414a,
  button: 0x6b4a2b,
  buttonHover: 0x86603a,
  buttonPressed: 0x4f361f,
  buttonDisabled: 0x3a3d42,
  buttonEdge: 0xd9b77e,
  buttonEdgeDisabled: 0x5a5e66,

  // Build UI: spot highlights, range circles, menu and panel backing
  spotHover: 0xffffff,
  spotActive: 0xfff2a8,
  range: 0xfff2a8,
  rangePreview: 0xffffff,
  menuBg: 0x1b1f24,
  menuEdge: 0xd9b77e,

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
  buttonDisabled: '#8a8f97',
  title: '#f2e6c9',
  subtitle: '#a89f8a',
  prompt: '#e8c37a',
  victory: '#f2c94c',
  defeat: '#d26a5c',
  endLine: '#f2e6c9',
} as const;
