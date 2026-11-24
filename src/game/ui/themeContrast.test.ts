import { expect, it } from 'vitest';
import { COLORS, TEXT } from '../palette';
import { ink, THEME } from './theme';

type Pair = [where: string, text: string, surface: number];

// WCAG relative luminance uses linear light, not the average of sRGB bytes.
function luminance(rgb: number): number {
  const channels = [16, 8, 0].map((shift) => {
    const value = ((rgb >> shift) & 255) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(text: string, surface: number): number {
  const foreground = luminance(Number.parseInt(text.slice(1), 16));
  const background = luminance(surface);
  return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
}

// Light type has its lowest contrast when the terrain behind a translucent
// dark backing is pure white. Composite that worst case before measuring.
function overWhite(rgb: number, opacity: number): number {
  return [16, 8, 0].reduce((result, shift) => {
    const channel = (rgb >> shift) & 255;
    return result + (Math.round(channel * opacity + 255 * (1 - opacity)) << shift);
  }, 0);
}

const [pillRed, pillGreen, pillBlue, pillAlpha] = TEXT.towerLabelBg.match(/[\d.]+/g)!.map(Number);
const pill = (pillRed << 16) + (pillGreen << 8) + pillBlue;
const toast = Number.parseInt(TEXT.fxStroke.slice(1), 16);

const pairs: Pair[] = [
  ['Broadside, map, card, tips, picker and tower-panel ink', ink, THEME.paper],
  ['Proclamation ribbon', TEXT.button, THEME.red],
  ['Defeat heading', TEXT.paperDefeat, THEME.paper],
  ['Stars on paper', TEXT.paperGold, THEME.paper],
  ['Button at rest', TEXT.button, COLORS.button],
  ['Button hovered', TEXT.button, COLORS.buttonHover],
  ['Button pressed', TEXT.button, COLORS.buttonPressed],
  ['Button picked', TEXT.button, COLORS.buttonPicked],
  ['Earned stars on milestone', TEXT.victory, COLORS.button],
  ['Earned stars on hovered milestone', TEXT.victory, COLORS.buttonHover],
  ['Earned stars on pressed milestone', TEXT.victory, COLORS.buttonPressed],
  ['Earned stars on selected milestone', TEXT.victory, COLORS.buttonPicked],
  ['HUD status', TEXT.hud, THEME.wood],
  ['HUD preview and level', TEXT.hudDim, THEME.wood],
  ['HUD cheat mark', TEXT.cheatMark, THEME.wood],
  ['HUD lives warning', TEXT.livesFlash, THEME.wood],
  ['HUD aim instructions', TEXT.aimBanner, THEME.wood],
  ['Special recharge', TEXT.buttonDisabled, COLORS.rechargeFill],
  ['Hint', TEXT.aimHint, THEME.wood],
  ['Wave heading', TEXT.waveBanner, THEME.blue],
  ['Wave caption', TEXT.waveBannerSub, THEME.blue],
  ['Boss caption', TEXT.waveBannerSub, THEME.red],
  ['Boss name', TEXT.bossName, THEME.red],
  ['Boss health on trough', TEXT.bossHp, COLORS.bossBarBg],
  ['Boss health on fill', TEXT.bossHp, COLORS.bossBarFill],
  ['Boss entrance heading', TEXT.bossBanner, THEME.red],
  ['Reward title over the brightest terrain', TEXT.hud, overWhite(COLORS.endVeil, 0.8)],
  ['Reward hovered', ink, COLORS.rewardHover],
  ['Reward pressed', ink, COLORS.rewardPressed],
  ['Reward hotkey', TEXT.hud, COLORS.hudBar],
  ['Special hit', TEXT.specialHit, toast],
  ['Special miss', TEXT.specialMiss, toast],
  ['Tower and barricade pill over the brightest terrain', TEXT.towerLabel, overWhite(pill, pillAlpha)],
  ['Floating gold on outline', TEXT.goldGain, toast],
];

for (const [where, text, surface] of pairs) {
  const ratio = contrast(text, surface);
  it(`${where} has 4.5:1 text contrast (${ratio.toFixed(2)}:1)`, () => {
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
}

it('keeps unavailable labels readable and at most half the contrast of a ready button', () => {
  const enabled = contrast(TEXT.button, COLORS.button);
  for (const surface of [COLORS.buttonDisabled, COLORS.rechargeFill]) {
    const disabled = contrast(TEXT.buttonDisabled, surface);
    expect(disabled).toBeGreaterThanOrEqual(3);
    expect(disabled).toBeLessThanOrEqual(enabled / 2);
  }
});
