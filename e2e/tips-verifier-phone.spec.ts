import { tipsVerifierSuite } from './tipsVerifier';
import { newInterfacePhoneChecks } from './newInterface';

tipsVerifierSuite(true);

newInterfacePhoneChecks(() => {
  tipsVerifierSuite(true);
});
