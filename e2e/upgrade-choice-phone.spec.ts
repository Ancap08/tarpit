import { test } from '@playwright/test';
import { newInterfaceChecks } from './newInterface';
import { pathCardSpacingChecks, upgradeChoiceChecks } from './upgradeChoice';

upgradeChoiceChecks(true);

test.describe('short phone', () => {
  test.use({ viewport: { width: 390, height: 664 } });
  pathCardSpacingChecks(true);
});

newInterfaceChecks(() => {
  upgradeChoiceChecks(true);
});

newInterfaceChecks(() => {
  test.describe('short phone', () => {
    test.use({ viewport: { width: 390, height: 664 } });
    pathCardSpacingChecks(true);
  });
});
