import { campaignActSuite } from './campaignActs';
import { newInterfaceChecks } from './newInterface';
import { campaignScreenSuite, campaignScreenshotSuite } from './campaignScreens';

campaignScreenSuite(false);
campaignScreenshotSuite(false);

campaignActSuite(false);

newInterfaceChecks(() => {
  campaignScreenSuite(false);
  campaignActSuite(false);
});
