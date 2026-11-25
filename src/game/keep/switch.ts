import { KEEP_LEVELS } from '../../sim/keepLevels';

/** The original exhibition is still used by the Keep art and rule checks. */
export function keepSelection(search: string) {
  const id = new URLSearchParams(search).get('keep');
  const level = KEEP_LEVELS.find(level => String(level.id) === id);
  return id === '1' || level ? { level } : undefined;
}
