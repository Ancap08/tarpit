import { expect, type Page } from '@playwright/test';
import { api } from './phone';
import { painted, settle } from './painted';
import { waitForTitle } from './title';

// E: hit areas. The painted tower is drawn taller than its cell; a tap must act exactly as in Classic.
export async function hitAreaCase(page: Page, look: 'classic' | 'painted', tap: (x: number, y: number) => Promise<void>) {
  await page.goto(`/?test=1&look=${look}`);
  await waitForTitle(page);
  await api(page, (a) => a.startGame());
  expect((await painted(page)).active).toBe(look === 'painted');
  await api(page, (a) => { a.state().gold = 1000; a.buildAt(14, 7, 'musketeer'); a.step(0); });
  await settle(page);
  const out: Record<string, unknown> = {};
  const centre = await page.evaluate(() => window.__tarpit!.cellToPage(14, 7));
  const above = await page.evaluate(() => window.__tarpit!.cellToPage(14, 6));
  const below = await page.evaluate(() => window.__tarpit!.cellToPage(14, 8));
  const panel = () => api(page, (a) => { const u = a.ui(); return { open: u.panelOpen, cell: (u as { selectedCell?: unknown }).selectedCell ?? null }; });
  // 1: tap on the painted body: above the cell centre but inside the cell above (about 20 px up in game px).
  await tap(above.x, above.y + (centre.y - above.y) * 0.1); // 90 % up from the lower cell's centre: inside the cell above
  out.bodyAbove = await panel();
  await tap(centre.x, centre.y);
  out.cell = await panel();
  await tap(below.x, below.y);
  out.cellBelow = await panel();
  await tap(centre.x, centre.y);
  await tap(above.x, above.y);
  out.cellAboveAfterOpen = await panel();
  return out;
}
