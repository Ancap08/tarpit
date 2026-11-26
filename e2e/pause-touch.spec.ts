import { pauseSuite } from './pause';
import { newInterfaceChecks } from './newInterface';

pauseSuite(true);
newInterfaceChecks(() => pauseSuite(true));
