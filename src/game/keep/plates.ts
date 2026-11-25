export const sharedPlates = ['sky', 'drift', 'mist', 'glow', 'plinth'] as const;
export const portraitPlates = ['portrait', 'far', 'crown', 'gate', 'lightning', 'wings'] as const;
export const widePlates = ['landscape', 'far-wide', 'crown-wide', 'gate-wide', 'lightning-wide', 'road-wide'] as const;

export type Plate = typeof sharedPlates[number] | typeof portraitPlates[number] | typeof widePlates[number];

export function keepPlateSet(portrait: boolean, pixelWidth: number) {
  // Compare the fitted physical width with the portrait exposure or wide
  // approach budget. On a 390 px phone the narrower road still oversamples
  // the logical frame, and the broad castle occupies the full viewport.
  const half = pixelWidth <= (portrait ? 1280 : 2048);
  const names = [...sharedPlates, ...(portrait ? portraitPlates : widePlates)];
  return { id: `${portrait ? 'portrait' : 'wide'}:${half ? 'half' : 'full'}`,
    files: names.map(name => ({ name, file: name + (half ? '-half' : '') + '.webp' })) };
}
