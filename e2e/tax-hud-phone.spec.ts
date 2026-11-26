import { shortPhoneTaxHudSuite, taxHudSuite } from './taxHud';
import { newInterfacePhoneChecks } from './newInterface';

taxHudSuite(true);
shortPhoneTaxHudSuite();

newInterfacePhoneChecks(height => {
  taxHudSuite(true);
  shortPhoneTaxHudSuite(height);
});
