import { upgradeChoiceChecks } from './upgradeChoice';
import { newInterfaceChecks } from './newInterface';

upgradeChoiceChecks(true);

newInterfaceChecks(() => {
  upgradeChoiceChecks(true);
});
