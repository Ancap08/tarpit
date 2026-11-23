import regular from '../../assets/fonts/LibreCaslonText-Regular-latin.woff2?url';
import bold from '../../assets/fonts/LibreCaslonText-Bold-latin.woff2?url';

import { CASLON, HUD_CASLON } from './palette';

/** Publish both weights together, before Phaser measures its first label.
 * A slow request may finish later, but cannot change metrics mid-game. */
export async function loadFonts(): Promise<void> {
  let deadline: number | undefined;
  try {
    const faces = [
      ...facesForWeight('400', regular),
      ...facesForWeight('700', bold),
    ];
    const loaded = await Promise.race([
      Promise.all(faces.map((face) => face.load())),
      new Promise<undefined>((resolve) => { deadline = window.setTimeout(resolve, 2000); }),
    ]);
    if (loaded) for (const face of loaded) document.fonts.add(face);
  } catch {
    // The typewriter fallback is already part of both canvas font stacks.
  } finally {
    window.clearTimeout(deadline);
  }
}

function facesForWeight(weight: string, asset: string): FontFace[] {
  const url = `url("${asset}") format("woff2")`;
  return [
    new FontFace(CASLON, url, { weight }),
    // Caslon's proportional figures make running totals and timers move.
    // Let the fallback supply digits while retaining Caslon for their labels.
    new FontFace(HUD_CASLON, url, { weight, unicodeRange: 'U+0000-002F,U+003A-10FFFF' }),
  ];
}
