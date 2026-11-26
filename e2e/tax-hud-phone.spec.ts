import { shortPhoneTaxHudSuite, taxHudSuite } from './taxHud';
import { newInterfaceChecks } from './newInterface';

taxHudSuite(true);
shortPhoneTaxHudSuite();

newInterfaceChecks(() => {
  taxHudSuite(true);
  shortPhoneTaxHudSuite();
});
