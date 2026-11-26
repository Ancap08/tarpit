import { taxHudSuite } from './taxHud';
import { newInterfaceChecks } from './newInterface';

taxHudSuite(false);

newInterfaceChecks(() => {
  taxHudSuite(false);
});
