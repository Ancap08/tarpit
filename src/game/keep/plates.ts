import type { KeepSky } from '../../sim/levelTypes';

export const sharedPlates = ['sky', 'drift', 'mist', 'glow', 'plinth'] as const;
export const portraitPlates = ['portrait', 'far', 'crown', 'gate', 'lightning', 'wings'] as const;
export const widePlates = ['landscape', 'far-wide', 'crown-wide', 'gate-wide', 'lightning-wide', 'road-wide'] as const;

const siegeSkies = { dusk: 'sky', 'night storm': 'sky-night', dawn: 'sky-dawn' } as const;
const siegePortrait = ['siege-portrait', 'far', 'crown', 'gate', 'strike'] as const;
const siegeWide = ['siege-wide', 'siege-east-deck', 'far-wide', 'crown-wide', 'gate-wide', 'strike-wide'] as const;

export type Plate = typeof sharedPlates[number] | typeof portraitPlates[number] | typeof widePlates[number]
  | typeof siegeSkies[KeepSky] | typeof siegePortrait[number] | typeof siegeWide[number]
  | 'siege-gates' | 'siege-blockade' | 'siege-barbican' | 'siege-machines';

export function keepPlateSet(portrait: boolean, pixelWidth: number, weather?: KeepSky, closedRoad = false,
  siegeArt = false, phone = false, rentOverdue = false) {
  // Compare the fitted physical width with the portrait exposure or wide
  // approach budget. On a 390 px phone the narrower road still oversamples
  // the logical frame, and the broad castle occupies the full viewport.
  const half = siegeArt && phone || pixelWidth <= (portrait ? 1280 : 2048);
  const gates = siegeArt ? ['siege-barbican', 'siege-machines'] as const : ['siege-gates'] as const;
  const names: Plate[] = rentOverdue && weather
    ? [siegeSkies[weather], 'siege-machines', 'siege-blockade', ...(portrait ? siegePortrait : siegeWide)
      .filter(plate => !plate.startsWith('siege-') && (weather === 'night storm' || !plate.startsWith('strike')))]
    : weather
    ? [siegeSkies[weather], 'mist', 'glow', 'plinth', ...gates, ...(closedRoad ? ['siege-blockade'] as const : []),
      ...(weather === 'dawn' ? [] : ['drift'] as const), ...(portrait ? siegePortrait : siegeWide)
        .filter(plate => weather === 'night storm' || !plate.startsWith('strike'))]
    : [...sharedPlates, ...(portrait ? portraitPlates : widePlates)];
  return { id: `${portrait ? 'portrait' : 'wide'}:${half ? 'half' : 'full'}${weather ? ':' + weather : ''}${closedRoad ? ':blocked' : ''}${weather && siegeArt ? ':siege' : ''}${rentOverdue ? ':rent' : ''}`,
    files: names.map(name => ({ name, file: name + (half ? '-half' : '') + '.webp' })) };
}
