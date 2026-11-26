import { taxVerifierSuite } from './taxVerifier';
import { newInterfacePhoneChecks } from './newInterface';

taxVerifierSuite(true);

newInterfacePhoneChecks(() => {
  taxVerifierSuite(true);
});
