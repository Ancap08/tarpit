import { test, type Page } from '@playwright/test';

export function newInterfaceChecks(register: () => void): void {
  test.describe('new interface', () => {
    test.beforeEach(async ({ page }) => {
      // Existing helpers keep their look, test clock and campaign parameters.
      await page.addInitScript(() => {
        const url = new URL(location.href);
        if (url.protocol === 'http:' && !url.searchParams.has('ui')) {
          url.searchParams.set('ui', 'new');
          history.replaceState(null, '', url);
        }
      });
    });
    register();
  });
}

export function hasNewInterface(page: Page): boolean {
  return new URL(page.url()).searchParams.get('ui') === 'new';
}

export const NEW_PHONE_HEIGHTS = [656, 664, 844] as const;
export const NEW_PHONE_VIEWPORTS = NEW_PHONE_HEIGHTS.map(height => ({ width: 390, height }));

export function newInterfacePhoneChecks(register: (height: number) => void): void {
  newInterfaceChecks(() => {
    for (const viewport of NEW_PHONE_VIEWPORTS) {
      test.describe(`390×${viewport.height}`, () => {
        test.use({ viewport });
        register(viewport.height);
      });
    }
  });
}
