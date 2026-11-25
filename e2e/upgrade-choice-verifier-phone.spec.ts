import { verifierChecks } from './upgradeChoiceVerifier';
import { newInterfaceChecks } from './newInterface';

verifierChecks(true);

newInterfaceChecks(() => {
  verifierChecks(true);
});
