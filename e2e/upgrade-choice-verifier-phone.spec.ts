import { verifierChecks } from './upgradeChoiceVerifier';
import { newInterfacePhoneChecks } from './newInterface';

verifierChecks(true);

newInterfacePhoneChecks(() => {
  verifierChecks(true);
});
