import { upgradeChoiceChecks } from './upgradeChoice';
import { newInterfaceChecks } from './newInterface';

upgradeChoiceChecks(false);

newInterfaceChecks(() => {
  upgradeChoiceChecks(false);
});
