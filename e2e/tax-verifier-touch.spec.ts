import { taxVerifierSuite } from './taxVerifier';
import { newInterfaceChecks } from './newInterface';

taxVerifierSuite(true);

newInterfaceChecks(() => {
  taxVerifierSuite(true);
});
