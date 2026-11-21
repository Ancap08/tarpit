/** True when the page was loaded with `?test=1` (used by e2e test hooks). */
export function isTestMode(search: string = globalThis.location?.search ?? ''): boolean {
  return new URLSearchParams(search).get('test') === '1';
}
