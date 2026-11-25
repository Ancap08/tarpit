import { campaignActSuite } from './campaignActs';
import { newInterfaceChecks } from './newInterface';
import { campaignScreenSuite } from './campaignScreens';

campaignScreenSuite(true);

campaignActSuite(true);

newInterfaceChecks(() => {
  campaignScreenSuite(true);
  campaignActSuite(true);
});
