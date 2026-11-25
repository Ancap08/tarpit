import { tipsVerifierSuite } from './tipsVerifier';
import { newInterfaceChecks } from './newInterface';

tipsVerifierSuite(true);

newInterfaceChecks(() => {
  tipsVerifierSuite(true);
});
