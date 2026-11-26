import regular from '../../assets/fonts/LibreCaslonText-Regular-latin.woff2?url';
import bold from '../../assets/fonts/LibreCaslonText-Bold-latin.woff2?url';
import inter from '../../assets/fonts/Inter-Latin-Variable.woff2?url';

import { waitForWorkerControl } from '../sw/register';
import { CASLON, HUD_CASLON, INTER } from './palette';
import { useInterFont } from './ui/newTheme';

let firstInterRequest: Promise<FontFace> | undefined;

/** Publish both weights together, before Phaser measures its first label.
 * A slow request may finish later, but cannot change metrics mid-game. */
export async function loadFonts(withInter: boolean): Promise<void> {
  await Promise.all([
    publishFaces(() => [...facesForWeight('400', regular), ...facesForWeight('700', bold)].map(face => face.load())),
    withInter ? loadInter() : undefined,
  ]);
}

async function loadInter(): Promise<void> {
  const loaded = await publishFaces(() => {
    const request = new FontFace(INTER, `url("${inter}") format("woff2")`, { weight: '100 900' }).load();
    if (!navigator.serviceWorker?.controller) firstInterRequest = request;
    return [request];
  });
  if (loaded) useInterFont();
}

/** The first visit's font request can precede worker control, as with Painted art.
 * After the worker claims the page, prime the on-demand route from the HTTP cache. */
export async function cacheInter(): Promise<void> {
  if (!firstInterRequest) return;
  try {
    await firstInterRequest;
    await waitForWorkerControl();
    if (navigator.serviceWorker?.controller) await fetch(inter, { cache: 'force-cache' });
  } catch {
    // Offline storage and a failed font request never stop play.
  }
}

async function publishFaces(load: () => Promise<FontFace>[]): Promise<boolean> {
  let deadline: number | undefined;
  try {
    const loaded = await Promise.race([
      Promise.all(load()),
      new Promise<undefined>((resolve) => { deadline = window.setTimeout(resolve, 1000); }),
    ]);
    if (loaded) for (const face of loaded) document.fonts.add(face);
    return !!loaded;
  } catch {
    return false;
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
