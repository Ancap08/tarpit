import { pauseSuite } from './pause';
import { newInterfaceChecks } from './newInterface';

pauseSuite(false);
newInterfaceChecks(() => pauseSuite(false));
