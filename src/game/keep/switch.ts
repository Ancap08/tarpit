import { KEEP_LEVELS } from '../../sim/keepLevels';

/** The original exhibition is still used by the Keep art and rule checks. */
export function keepSelection(search: string) {
  const id = new URLSearchParams(search).get('keep');
  const level = KEEP_LEVELS.find(level => String(level.id) === id);
  return id === '1' || level ? { level } : undefined;
}

/** Campaign access is independent of the direct links used to test the keep. */
export function actThreeEnabled(search: string, owner: boolean): boolean {
  return owner || new URLSearchParams(search).get('act3') === '1';
}
