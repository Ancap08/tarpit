import { taxVerifierSuite } from './taxVerifier';
import { newInterfaceChecks } from './newInterface';

taxVerifierSuite(false);

newInterfaceChecks(() => {
  taxVerifierSuite(false);
});
