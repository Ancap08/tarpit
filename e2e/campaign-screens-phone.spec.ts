import { campaignActSuite } from './campaignActs';
import { newInterfaceChecks } from './newInterface';
import { campaignScreenSuite, campaignScreenshotSuite } from './campaignScreens';

campaignScreenSuite(true);
campaignScreenshotSuite(true);

campaignActSuite(true, true);

newInterfaceChecks(() => {
  campaignScreenSuite(true);
  campaignActSuite(true, true);
});
