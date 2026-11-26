import { verifierChecks } from './upgradeChoiceVerifier';
import { newInterfaceChecks } from './newInterface';

verifierChecks(false);

newInterfaceChecks(() => {
  verifierChecks(false);
});
