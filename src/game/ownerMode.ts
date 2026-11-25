export const OWNER_MODE_KEY = 'tarpit.ownerMode';

function readOwnerMode(): boolean {
  if (typeof window === 'undefined') return false;
  const choice = new URLSearchParams(window.location.search).get('owner');
  try {
    if (choice === '1') window.localStorage.setItem(OWNER_MODE_KEY, '1');
    if (choice === '0') window.localStorage.removeItem(OWNER_MODE_KEY);
    return window.localStorage.getItem(OWNER_MODE_KEY) === '1';
  } catch {
    return choice === '1';
  }
}

export const ownerMode = readOwnerMode();
