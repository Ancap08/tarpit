import { taxHudSuite } from './taxHud';
import { newInterfaceChecks } from './newInterface';

taxHudSuite(true);

newInterfaceChecks(() => {
  taxHudSuite(true);
});
