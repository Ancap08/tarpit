import { campaignActSuite } from './campaignActs';
import { newInterfacePhoneChecks } from './newInterface';
import { campaignScreenSuite, campaignScreenshotSuite } from './campaignScreens';

campaignScreenSuite(true);
campaignScreenshotSuite(true);

campaignActSuite(true, true);

newInterfacePhoneChecks(height => {
  campaignScreenSuite(true);
  campaignActSuite(true, true, height);
});
